// Region runner (PW07): the always-on worker that keeps a persistent region's
// simulation alive without any browser connected.
//
// Journal-first ordering (COMRADE 18 §2.2): every simulation-affecting input reaches
// the sim through the region journal. This runner is the only consumer that applies
// 'command' and 'scheduled' events, in event_seq order, at the tick boundary recorded
// on each event. Scheduled jobs become 'scheduled' journal events in the same
// transaction as their PostgreSQL effects, so a crash can never apply an effect
// without its journal record or vice versa.
//
// Lifecycle: recovering (lease + snapshot restore + journal replay) → active
// (real-time stepping) → checkpointing (snapshot write) → active/quiescent. A stale
// worker fails the fence check and the region is marked 'failed' for the next owner.
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import {
  Game, PACKS, SUPPLY_UPKEEP_TICKS, captureGame, restoreGame, isMcvUnit, nearestCell, passable, regionSitePlan, starterPicks, structureRoles, toCell,
  type Command, type Entity, type GameSetup, type RulePack,
} from '@comrade/fusion';
import {
  computePowerScore, mmoEntityId, mmoSimEntityId, newProtection, PERSISTENT_RULES_V1,
  MMO_LADDER_DEFAULT, MMO_SITES_DEFAULT,
  parseProtectionRecord, protectionTransition,
  type MmoAction, type MmoRulesProfile, type MmoSimAction, type MmoWorldAction,
  type ProtectionEvent, type ProtectionRecord,
} from '@comrade/contracts';
import { mmoOne, mmoTransaction } from './db.js';
import {
  acquireRegionLease, appendRegionEvent, applyShieldTransition, assertRegionFence,
  claimDueJobs, finishJobTx, getRegion, latestSnapshot, listUnappliedRegionEvents,
  markRegionEventApplied, presenceIsOnline, reclaimExpiredJobs, recordSnapshot,
  releaseJobClaim, releaseRegionLease, saveProtectionRecord, scheduleJob, setRegionLifecycle, setRegionSimStart,
  syncCompounds, updateMemberPowerScores, updateSettlementProtection,
  openRecoveryEpisode, closeRecoveryEpisode, awardLadderPoints,
  MmoStoreError, type ProtectionRow, type RegionRow,
} from './store.js';
import { journalTail } from './commands.js';
import { mmoQuery } from './db.js';
import { raiseNotification } from './notify.js';
import { persistentPackRunnable } from './packs.js';

const TICK_MS = 1000 / 15;
const PACK_LIST = Object.values(PACKS) as RulePack[];

export interface SimPlayerSpec {
  playerId: string; name: string; faction: string;
  /** PW09: alliance key and caretaker flag at region birth (pre-existing state). */
  ally?: number; autoRepair?: boolean;
  /** PW11: journaled spawn cell, starter grant and protection flag for newcomers. */
  cell?: number; starter?: { credits: number; units: string[] }; newcomerProtected?: boolean;
}
export interface RegionSimSpec {
  packId: string; mapId: string; seed: number;
  players: SimPlayerSpec[];
  credits?: 'low' | 'standard' | 'high'; techLevel?: number; worms?: number;
  renewal?: number; superCharge?: number; crates?: number; doctrine?: 'irregular' | 'regular';
}

export interface ClaimedJob {
  job_id: string; kind: string; generation: string; payload: unknown;
  due_at_ms: string; attempts: number;
}
export type ScheduledJobHandler = (
  tx: PoolClient, job: ClaimedJob, meta?: { eventSeq: string },
) => Promise<unknown>;
export interface WorldHandlerResult {
  result: unknown;
  /** Extra engine commands this world action implies (e.g. PW09 alliance sync).
   *  They apply at the same tick boundary and fan out on mmo.sim like sim intents. */
  sim?: { slot: number; command: Command }[];
}
export type WorldActionHandler = (
  tx: PoolClient, action: MmoWorldAction,
  ctx: {
    regionId: string; playerId: string; slot: number | undefined;
    /** Resolve another region member's sim slot, if present. */
    slotOf: (playerId: string) => number | undefined;
    /** Live sim access (read-only) for spawn placement and roster checks. */
    game?: () => Game | undefined;
    /** Resolve a durable entity id to a live sim id (bound assets, then the bridge). */
    simIdFor?: (durableId: string) => number | null;
    /** Fence epoch and sim tick for durable operation audit rows. */
    epoch?: string; tick?: number;
  },
) => Promise<WorldHandlerResult>;

export interface RegionRunnerOptions {
  regionId: string; workerId: string;
  /** Lease duration; renewed at ~40% of this while running. Default 30 s. */
  leaseMs?: number;
  /** Wall ms per sim tick. Default 1000/15 (15 Hz). */
  tickMs?: number;
  /** Journal/job poll cadence. Default 250 ms. */
  pollMs?: number;
  /** Snapshot every N ticks (0 = only on stop). Default 0. */
  checkpointEveryTicks?: number;
  /** Claims beyond this many attempts are cancelled, not retried forever. Default 8. */
  maxJobAttempts?: number;
  /** Wall clock in epoch ms; injectable for deterministic tests. */
  now?: () => number;
  /** Durable compound roster resync cadence. Default 10 s. */
  compoundSyncMs?: number;
  /** Fresh-region sim setup, used when region.seed carries no `sim` block. */
  sim?: RegionSimSpec;
  worldHandler?: WorldActionHandler;
  jobHandlers?: Record<string, ScheduledJobHandler>;
  log?: (event: string, data?: Record<string, unknown>) => void;
  /** Persistent rules profile; hibernation tunables come from here (PW22). */
  rules?: MmoRulesProfile;
  /** Quiescence watchdog. Enabled by default for persistent regions. */
  quiescence?: {
    enabled?: boolean;
    /** How often the quiescence predicate is evaluated. Default 10 s. */
    checkMs?: number;
    /** Minimum awake time before hibernation is allowed (anti-thrash). */
    minAwakeMs?: number;
    /** Wake scheduled work due within this window. Default rules lookahead. */
    lookaheadMs?: number;
  };
}

interface SnapshotPayload {
  v: 1; seed: number; snapshot: string; bindings: [string, number][];
  /** Present only on checkpoints taken at hibernation: the quiescent interval the
   *  wake path must account for arithmetically (PW22). */
  hib?: { sinceMs: number; rates: number[]; sampleTick: number };
}

const SIM_ACTIONS = new Set([
  'move', 'attackMove', 'attack', 'fireAt', 'guard', 'scatter', 'stop', 'deploy',
  'harvest', 'enter', 'build', 'cancel', 'place', 'repair', 'rally', 'super',
]);

export class RegionRunner {
  private game?: Game;
  private epoch?: string;
  private region?: RegionRow;
  private simSeed = 0;
  private startedAtMs = 0;
  private bindings = new Map<string, number>();
  private slotByPlayer = new Map<string, number>();
  /** Strike objects already reported by notifyEval; rebuilt each pass so resolved
   *  strikes drop out and fresh launches diff cleanly. */
  private notifyStrikesSeen = new Set<object>();
  private running = false;
  private busy = false;
  private failed = false;
  private stepTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private lastPoll = 0;
  private lastRenew = 0;
  private lastCheckpointTick = 0;
  private lastAppliedSeq = 0n;
  private wokeAtMs = 0;
  private hibMeta?: { sinceMs: number; rates: number[]; sampleTick: number };
  private lastHarvestSample?: { tick: number; harvested: number[] };
  private lastCompoundSync = 0;
  private quiescenceTimer?: ReturnType<typeof setInterval>;
  /** Wake latency of this runner instance when it resumed from hibernation (ms). */
  wakeLatencyMs?: number;
  /** True once this runner hibernated itself (vs failed or externally stopped). */
  didHibernate = false;
  readonly stats = {
    ticksStepped: 0, simMs: 0, scheduleMs: 0, eventsApplied: 0, jobsApplied: 0,
    jobErrors: 0, checkpoints: 0, catchUpTicks: 0,
  };
  private readonly opts: Required<Omit<RegionRunnerOptions, 'now' | 'sim' | 'worldHandler' | 'jobHandlers' | 'log' | 'rules' | 'quiescence' | 'compoundSyncMs'>> & {
    now: () => number; sim?: RegionSimSpec; worldHandler?: WorldActionHandler;
    jobHandlers: Record<string, ScheduledJobHandler>; log: (e: string, d?: Record<string, unknown>) => void;
    rules: MmoRulesProfile; compoundSyncMs: number;
    quiescence: { enabled: boolean; checkMs: number; minAwakeMs: number; lookaheadMs: number };
  };

  constructor(options: RegionRunnerOptions) {
    const rules = options.rules ?? PERSISTENT_RULES_V1;
    const q = options.quiescence ?? {};
    this.opts = {
      leaseMs: 30_000, tickMs: TICK_MS, pollMs: 250, checkpointEveryTicks: 0,
      maxJobAttempts: 8, compoundSyncMs: 10_000, now: () => Date.now(), ...options,
      jobHandlers: options.jobHandlers ?? {}, log: options.log ?? (() => undefined),
      rules,
      quiescence: {
        enabled: q.enabled ?? true, checkMs: q.checkMs ?? 10_000,
        minAwakeMs: q.minAwakeMs ?? rules.hibernateMinAwakeMs,
        lookaheadMs: q.lookaheadMs ?? rules.hibernateInboundLookaheadMs,
      },
    };
  }

  get isRunning() { return this.running; }
  get isFailed() { return this.failed; }
  get currentGame() { return this.game; }
  get authorityEpoch() { return this.epoch; }
  /** Journal position the live sim state represents (for snapshot headers). */
  get appliedSeq(): string { return this.lastAppliedSeq.toString(); }

  /** Live sim state in the same envelope a checkpoint persists (PW08 subscriptions). */
  captureState(): { v: 1; seed: number; snapshot: string; bindings: [string, number][]; tick: number } | null {
    if (!this.game) return null;
    return {
      v: 1, seed: this.simSeed,
      snapshot: captureGame(this.game, { seed: this.simSeed }),
      bindings: this.durableBindings(), tick: this.game.tick,
    };
  }

  /** Cheap authoritative observation for subscriber checksum verification. */
  observation(): { tick: number; checksum: number } | null {
    return this.game ? { tick: this.game.tick, checksum: this.game.checksum() } : null;
  }

  /** Map a durable entity id to its live sim entity id (persistent asset identity). */
  bindEntity(durableId: string, simId: number) { this.bindings.set(durableId, simId); }
  durableBindings(): [string, number][] { return [...this.bindings.entries()]; }
  /** The sim slot a durable player occupies, for subscription welcomes.
   *  Falls back to scanning live players by durable pid — covers players who
   *  joined via the journaled `join` command after the spec roster was fixed. */
  slotForPlayer(playerId: string): number | undefined {
    const known = this.slotByPlayer.get(playerId);
    if (known !== undefined) return known;
    const g = this.game;
    if (!g) return undefined;
    const p = g.players.find(pl => pl.pid === playerId);
    if (p) { this.slotByPlayer.set(playerId, p.slot); return p.slot; }
    return undefined;
  }

  private tickFor(wallMs: number): number {
    return Math.max(0, Math.floor((wallMs - this.startedAtMs) / this.opts.tickMs));
  }

  private simSpecFromRegion(): RegionSimSpec | undefined {
    const seed = this.region?.seed as { sim?: RegionSimSpec } | undefined;
    return seed?.sim ?? this.opts.sim;
  }

  /**
   * Acquire the region fence, restore snapshot+journal, fast-forward to wall time and
   * start the real-time loop. Throws LEASE_HELD if another worker owns the region.
   */
  async start(): Promise<void> {
    const lease = await acquireRegionLease({
      regionId: this.opts.regionId, workerId: this.opts.workerId, leaseMs: this.opts.leaseMs,
    });
    this.epoch = lease.epoch;
    this.region = await getRegion(this.opts.regionId);
    if (!this.region) throw new MmoStoreError('NO_REGION', 'region vanished after lease');

    const spec = this.simSpecFromRegion();
    if (!spec) throw new MmoStoreError('NO_SIM_SPEC', 'region has no sim spec and none was provided');
    for (const [i, p] of spec.players.entries()) this.slotByPlayer.set(p.playerId, i);

    const snap = await latestSnapshot(this.opts.regionId);
    let hib: SnapshotPayload['hib'];
    if (snap) {
      const payload = JSON.parse(snap.payload.toString('utf8')) as SnapshotPayload;
      hib = payload.hib;
      this.simSeed = payload.seed;
      this.game = restoreGame(payload.snapshot, PACK_LIST);
      // PW24: snapshots written before salvage shipped lack mmo.salvage; the
      // profile is pinned per world, so backfill it deterministically here.
      if (this.game.mmo && !this.game.mmo.salvage) {
        this.game.mmo.salvage = {
          percentOfCost: this.opts.rules.salvage.percentOfCost,
          decaySeconds: this.opts.rules.salvage.decaySeconds,
          mismatchFloorRatio: this.opts.rules.powerScoreSalvageFloorRatio,
          scoreWeights: this.opts.rules.powerScoreWeights,
        };
      }
      // PW24: same backfill for site tuning on pre-PW24 snapshots.
      if (this.game.mmo && !this.game.mmo.sites) {
        this.game.mmo.sites = this.opts.rules.sites ?? MMO_SITES_DEFAULT;
      }
      this.bindings = new Map(payload.bindings);
      this.lastAppliedSeq = BigInt(snap.last_applied_seq);
      this.opts.log('region-restored', { regionId: this.opts.regionId, tick: this.game.tick, epoch: this.epoch });
    } else {
      this.simSeed = spec.seed;
      const pack = PACK_LIST.find(p => p.id === spec.packId);
      // PW17: only manifest-approved packs may run a persistent region.
      if (!pack || !persistentPackRunnable(spec.packId)) {
        throw new MmoStoreError('NO_PACK', `rule pack ${spec.packId} is not approved for the persistent profile`);
      }
      const setup: GameSetup = {
        pack,
        mapId: spec.mapId, seed: spec.seed, persistent: true,
        credits: spec.credits, techLevel: spec.techLevel, worms: spec.worms,
        renewal: spec.renewal, superCharge: spec.superCharge, crates: spec.crates,
        doctrine: spec.doctrine,
        // PW23 pacing: every tunable comes from the pinned rules profile.
        mmo: {
          structureHpMultiplier: this.opts.rules.structureHpMultiplier,
          supplyCap: this.opts.rules.armySupply.cap,
          upkeepPerPointPerMinute: this.opts.rules.armySupply.upkeepPerPointPerMinute,
          maxCompounds: this.opts.rules.maxCompounds,
          shieldRadiusCells: this.opts.rules.shieldRadiusCells,
          recoveryCreditCap: this.opts.rules.recoveryCreditCap,
          recoveryBuildRoles: this.opts.rules.recoveryBuildRoles,
          // PW24: salvage share/decay from the pinned profile plus the
          // anti-snowball floor and the same weights persistPowerScores uses.
          salvage: {
            percentOfCost: this.opts.rules.salvage.percentOfCost,
            decaySeconds: this.opts.rules.salvage.decaySeconds,
            mismatchFloorRatio: this.opts.rules.powerScoreSalvageFloorRatio,
            scoreWeights: this.opts.rules.powerScoreWeights,
          },
          // PW24: site capture/hold tuning from the pinned profile.
          sites: this.opts.rules.sites ?? MMO_SITES_DEFAULT,
        },
        players: spec.players.map(p => ({
          name: p.name, faction: p.faction, ai: false,
          ally: p.ally, autoRepair: p.autoRepair,
          playerId: p.playerId, cell: p.cell, starter: p.starter,
          newcomerProtected: p.newcomerProtected,
        })),
      };
      this.game = new Game(setup);
      // PW09: seed durable alliance/caretaker state for a fresh region. This is
      // pre-tick initialization (the journal starts empty), not a mutation.
      await this.syncPersistentPlayerFlags(spec);
      this.opts.log('region-created', { regionId: this.opts.regionId, tick: 0, epoch: this.epoch });
    }

    // PW24: capturable sites are placed deterministically from (pack, map, seed)
    // — identical on every runner, before any tick or accrual runs.
    this.ensureRegionSites();

    // PW22 wake: a hibernated region accounts for its quiescent interval as one
    // journaled 'accrual' event, then re-anchors wall-clock so real-time resumes —
    // the slept ticks are never re-simulated.
    if (hib) {
      const t0 = performance.now();
      await this.applyWakeAccrual(hib);
      this.wakeLatencyMs = performance.now() - t0;
      this.region = await getRegion(this.opts.regionId);
      this.opts.log('region-wake', {
        regionId: this.opts.regionId, sinceMs: hib.sinceMs,
        wakeMs: this.wakeLatencyMs,
      });
    }

    // Wall-clock ↔ sim-tick anchor. A region that was down fast-forwards through the
    // elapsed ticks on recovery — the sim is the only authority, so there is no
    // shortcut; quiescent accrual is PW22's concern, not this runner's.
    const now = this.opts.now();
    const startedAt = this.region?.started_at_ms;
    this.startedAtMs = startedAt != null
      ? Number(startedAt)
      : now - this.game.tick * this.opts.tickMs;
    if (startedAt == null) await setRegionSimStart(this.opts.regionId, this.startedAtMs);

    await this.catchUpTo(this.tickFor(now));
    await this.applyUnappliedEvents();
    // PW10: the durable compound roster and any open shield selections must be
    // current before the first live tick — a restored snapshot may predate them.
    await this.syncCompoundsNow();
    await this.ensureProtectionEval();
    await this.ensureRecoveryEval();
    await this.ensureNotifyEval();
    await setRegionLifecycle(this.opts.regionId, 'active');

    this.running = true;
    this.lastPoll = now; this.lastRenew = now;
    this.wokeAtMs = now;
    this.lastHarvestSample = {
      tick: this.game.tick, harvested: this.game.players.map(p => p.stats.harvested),
    };
    this.armTimers();
  }

  private armTimers(): void {
    this.stepTimer = setInterval(() => void this.onTick(), this.opts.tickMs);
    this.stepTimer.unref?.();
    this.pollTimer = setInterval(() => void this.onPoll(), this.opts.pollMs);
    this.pollTimer.unref?.();
    if (this.opts.quiescence.enabled) {
      this.quiescenceTimer = setInterval(() => void this.onQuiescenceCheck(), this.opts.quiescence.checkMs);
      this.quiescenceTimer.unref?.();
    }
  }

  /** Step the sim forward to `tick`, bounded per call so the event loop stays live. */
  private advanceTo(tick: number): void {
    const game = this.game!;
    let guard = 0;
    while (game.tick < tick && guard++ < 4_000_000) {
      const t0 = performance.now();
      game.step();
      this.stats.simMs += performance.now() - t0;
      this.stats.ticksStepped++;
    }
    if (game.tick < tick) this.opts.log('advance-capped', { tick, reached: game.tick });
  }

  /** Fast-forward missed wall time once at startup (bounded; logged if capped). */
  private async catchUpTo(tick: number): Promise<void> {
    const before = this.game!.tick;
    this.advanceTo(tick);
    await this.drainSalvageEvents();
    this.stats.catchUpTicks += this.game!.tick - before;
    if (this.game!.tick !== before) this.opts.log('region-catchup', { from: before, to: this.game!.tick });
  }

  private async onTick(): Promise<void> {
    if (this.busy || this.failed || !this.running || !this.game) return;
    this.busy = true;
    try {
      const expected = this.tickFor(this.opts.now());
      if (this.game.tick < expected) this.advanceTo(Math.min(expected, this.game.tick + 600));
      await this.drainSalvageEvents();
      if (this.opts.checkpointEveryTicks > 0
        && this.game.tick - this.lastCheckpointTick >= this.opts.checkpointEveryTicks) {
        await this.checkpoint('interval');
      }
    } catch (error) {
      await this.fail(String(error));
    } finally {
      this.busy = false;
    }
  }

  private async onPoll(): Promise<void> {
    if (this.busy || this.failed || !this.running) return;
    this.busy = true;
    try {
      const now = this.opts.now();
      if (now - this.lastRenew > this.opts.leaseMs * 0.4) {
        await acquireRegionLease({ regionId: this.opts.regionId, workerId: this.opts.workerId, leaseMs: this.opts.leaseMs });
        this.lastRenew = now;
      }
      await this.applyUnappliedEvents();
      await this.processDueJobs(now);
      if (now - this.lastCompoundSync >= this.opts.compoundSyncMs) {
        this.lastCompoundSync = now;
        await this.syncCompoundsNow();
      }
      this.lastPoll = now;
    } catch (error) {
      if (error instanceof MmoStoreError && (error.code === 'FENCE_LOST' || error.code === 'LEASE_HELD')) {
        await this.fail(error.code === 'FENCE_LOST' ? 'fence lost' : 'lease lost');
      } else {
        this.opts.log('poll-error', { error: String(error) });
      }
    } finally {
      this.busy = false;
    }
  }

  private async fail(reason: string): Promise<void> {
    this.failed = true; this.running = false;
    this.opts.log('region-failed', { regionId: this.opts.regionId, reason });
    // Only mark failed while we still own the region — a stale worker must not
    // clobber the lifecycle of the worker that took the lease over.
    try {
      await mmoQuery(
        `update region set lifecycle = 'failed'
          where region_id = $1 and owner_worker_id = $2 and lifecycle <> 'failed'`,
        [this.opts.regionId, this.opts.workerId]);
    } catch { /* best effort */ }
    this.stopTimers();
  }

  private stopTimers(): void {
    if (this.stepTimer) clearInterval(this.stepTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.quiescenceTimer) clearInterval(this.quiescenceTimer);
    this.stepTimer = this.pollTimer = this.quiescenceTimer = undefined;
  }

  // ------------------------------------------------------------------
  // PW22: quiescence detection, hibernation and wake accrual
  // ------------------------------------------------------------------

  /**
   * Journal the quiescent interval exactly once, apply its arithmetic advance to the
   * restored game, then re-anchor wall-clock so real-time stepping resumes from the
   * hibernated tick.
   *
   * Exactly-once across crash: snapshots are only rewritten at checkpoints, so a
   * crash between the wake transaction and the next checkpoint restores the
   * pre-accrual snapshot with `hib` still attached. The accrual event may already be
   * marked applied in that case, so the fast-forward is applied to the restored game
   * unconditionally — restoreGame is deterministic, making the advance replay-safe.
   * The journal record itself is deduplicated on `sinceMs`.
   */
  private async applyWakeAccrual(hib: { sinceMs: number; rates: number[]; sampleTick: number }): Promise<void> {
    const now = this.opts.now();
    const ticks = Math.floor(Math.max(0, now - hib.sinceMs) / this.opts.tickMs);
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      const existing = await tx.query<{ event_seq: string }>(
        `select event_seq from region_event
          where region_id = $1 and event_kind = 'accrual' and payload->>'sinceMs' = $2
          order by event_seq desc limit 1`,
        [this.opts.regionId, String(hib.sinceMs)]);
      if (existing.rows.length) return; // interval already on the journal
      const { eventSeq } = await appendRegionEvent(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
        tick: this.game!.tick, kind: 'accrual',
        payload: { sinceMs: hib.sinceMs, rates: hib.rates, ticks, sampleTick: hib.sampleTick },
        outboxTopic: 'mmo.accrual',
        outboxPayload: { sinceMs: hib.sinceMs, ticks, regionId: this.opts.regionId },
      });
      await markRegionEventApplied(tx, {
        regionId: this.opts.regionId, eventSeq,
        result: { advancedTicks: ticks, dedupe: 'hib-' + hib.sinceMs },
      });
      this.lastAppliedSeq = BigInt(eventSeq);
    });
    // Apply to the restored (pre-interval) game. Deterministic, so re-running it on a
    // fresh restore produces identical state.
    this.game!.fastForwardQuiescent(ticks, hib.rates);
    // Re-anchor: slept wall-time was consumed arithmetically, so the next tick is
    // the hibernated tick stepping in real time again.
    const anchor = now - this.game!.tick * this.opts.tickMs;
    await setRegionSimStart(this.opts.regionId, anchor);
    this.region = await getRegion(this.opts.regionId);
    if (this.region) this.startedAtMs = Number(this.region.started_at_ms);
  }

  /** Refresh the harvest-rate sample once it spans a meaningful window. */
  private sampleHarvest(): void {
    const g = this.game;
    const s = this.lastHarvestSample;
    if (!g || !s) return;
    if (g.tick - s.tick >= 150) {
      this.lastHarvestSample = { tick: g.tick, harvested: g.players.map(p => p.stats.harvested) };
    }
  }

  /** Measured harvest income per slot, credits per sim tick, over the last window. */
  private harvestRates(): number[] {
    const g = this.game!;
    const s = this.lastHarvestSample;
    const dt = s ? g.tick - s.tick : 0;
    return g.players.map((p, i) => {
      if (!s || dt <= 0) return 0;
      return Math.max(0, (p.stats.harvested - (s.harvested[i] ?? 0)) / dt);
    });
  }

  /**
   * Quiescent (COMRADE 18 §2.3): no unit under a deliberate order (harvest loops
   * and idle/guard posts are routine and their income is captured by the accrual
   * rate), no armed entity with an enemy inside weapon range, no pending journal
   * input, and no scheduled work due inside the look-ahead window.
   */
  private async isQuiescent(now: number): Promise<boolean> {
    const g = this.game;
    if (!g || g.over) return false;
    for (const e of g.entities.values()) {
      if (e.hp <= 0 || e.carriedBy || e.kind !== 'unit') continue;
      switch (e.order) {
        // Timed actions (deploy, rearm, boarding, ferry) would freeze mid-progress
        // if the tick loop stopped, so they block quiescence like movement orders.
        case 'move': case 'attackMove': case 'attack': case 'attackGround':
        case 'enter': case 'rearm': case 'ferry': case 'deploy':
          return false;
        default: break; // idle, harvest: quiescent-compatible
      }
    }
    // Hostile engagement: any armed entity with an enemy inside weapon range.
    // Alt weapons (Force etc.) count too — a unit that could switch and fire is
    // not quiescent.
    const reachOf = (e: Entity): number => {
      const ids = e.kind === 'unit'
        ? [g.unitDef(e).weapon, g.unitDef(e).altWeapon]
        : [g.structDef(e).weapon];
      let best = 0;
      for (const id of ids) {
        const w = id ? g.pack.weapons[id] : undefined;
        if (w) best = Math.max(best, w.range);
      }
      return best;
    };
    const armed: { e: Entity; reach: number }[] = [];
    for (const e of g.entities.values()) {
      if (e.hp <= 0 || e.carriedBy) continue;
      const reach = reachOf(e);
      if (reach > 0) armed.push({ e, reach });
    }
    if (armed.length) {
      const all = [...g.entities.values()].filter(e => e.hp > 0 && !e.carriedBy);
      for (const { e: a, reach } of armed) {
        for (const b of all) {
          if (b.id === a.id || !g.isEnemy(a.owner, b.owner)) continue;
          if (g.distTo(a.x, a.y, b) <= reach) return false;
        }
      }
    }
    const pending = await listUnappliedRegionEvents(this.opts.regionId, ['command', 'scheduled', 'accrual'], 1);
    if (pending.length) return false;
    const due = await mmoOne<{ n: string }>(
      `select count(*)::text as n from scheduled_job
        where region_id = $1 and state = 'pending' and due_at_ms <= $2`,
      [this.opts.regionId, now + this.opts.quiescence.lookaheadMs]);
    if (Number(due?.n ?? 0) !== 0) return false;
    // Connected players keep the region awake: hibernating under live sockets
    // strands them on a dead runner (commands fail REGION_UNAVAILABLE and no
    // observations arrive to trigger resync). Only a truly unattended region
    // may sleep — that is what the quiescent accrual is for.
    const present = await mmoOne<{ n: string }>(
      `select count(*)::text as n from player p
         join settlement s on s.player_id = p.player_id
        where s.region_id = $1 and p.online_count > 0`,
      [this.opts.regionId]);
    return Number(present?.n ?? 0) === 0;
  }

  private async onQuiescenceCheck(): Promise<void> {
    if (this.busy || this.failed || !this.running || !this.game) return;
    this.busy = true;
    try {
      const now = this.opts.now();
      this.sampleHarvest();
      if (now - this.wokeAtMs < this.opts.quiescence.minAwakeMs) return;
      if (!(await this.isQuiescent(now))) return;
      await this.hibernate(now);
    } catch (error) {
      this.opts.log('quiescence-error', { error: String(error) });
    } finally {
      this.busy = false;
    }
  }

  /** Checkpoint with hibernate metadata, go quiescent and release the worker. */
  private async hibernate(now: number): Promise<void> {
    const g = this.game!;
    this.hibMeta = {
      sinceMs: now, rates: this.harvestRates(), sampleTick: this.lastHarvestSample?.tick ?? g.tick,
    };
    this.opts.log('region-quiescing', { regionId: this.opts.regionId, tick: g.tick });
    // Stop first so the checkpoint leaves lifecycle at 'checkpointing'; the lease
    // release below is what lands the region on 'quiescent' for the next owner.
    this.running = false;
    this.stopTimers();
    try {
      await this.checkpoint('hibernate');
    } catch (error) {
      // A failed hibernate checkpoint must not leak `hib` into a later live
      // checkpoint — that would skip real-time catch-up on the next restore.
      this.hibMeta = undefined;
      this.running = true;
      this.wokeAtMs = this.opts.now();
      this.armTimers();
      throw error;
    }
    try { await releaseRegionLease(this.opts.regionId, this.opts.workerId); } catch { /* lease may already be gone */ }
    this.didHibernate = true;
    this.opts.log('region-hibernated', {
      regionId: this.opts.regionId, tick: g.tick, rates: this.hibMeta.rates,
    });
  }

  /**
   * PW09 fresh-start initialization: copy durable alliance keys and the caretaker
   * flag onto the newborn players. Snapshot restores carry these fields already;
   * this only runs when no snapshot exists, before the first tick.
   */
  private async syncPersistentPlayerFlags(spec: RegionSimSpec): Promise<void> {
    const g = this.game;
    if (!g?.persistent) return;
    const ids = spec.players.map(p => p.playerId);
    if (!ids.length) return;
    const rows = await mmoQuery<{ player_id: string; ally_key: string | null; auto_repair: boolean }>(
      `select p.player_id, a.ally_key::text as ally_key, p.auto_repair
         from player p
         left join alliance_member m on m.player_id = p.player_id and m.left_at is null
         left join alliance a on a.alliance_id = m.alliance_id and a.disbanded_at is null
        where p.player_id = any($1)`, [ids]);
    const byId = new Map(rows.map(r => [r.player_id, r]));
    for (const [i, p] of spec.players.entries()) {
      const player = g.players[i];
      if (!player) continue;
      const row = byId.get(p.playerId);
      player.ally = row?.ally_key != null ? Number(row.ally_key) : -1;
      player.autoRepair = row?.auto_repair === true;
    }
  }

  /** Apply every unapplied command/scheduled journal event in seq order. */
  private async applyUnappliedEvents(): Promise<void> {
    for (;;) {
      const events = await listUnappliedRegionEvents(this.opts.regionId, ['command', 'scheduled', 'accrual'], 64);
      if (!events.length) { await this.drainSalvageEvents(); return; }
      for (const event of events) await this.applyEvent(event);
    }
  }

  /**
   * PW24: persist salvage crate spawns as audited operations. The sim stays
   * authoritative for the crate itself (snapshot + journal replay reproduce it
   * exactly); these rows are the durable audit trail — one SALVAGE_SPAWN
   * operation per drop plus DESTROY/SALVAGE asset-ledger entries for the killed
   * asset. Collect events are sim-side credit grants already covered by the
   * snapshot; the ladder stage reads them for points.
   *
   * Crash note: a crash between the sim step and this drain can lose the audit
   * row while the crate survives in the next snapshot — audit is best-effort at
   * tick cadence, never state-corrupting. Deterministic operation ids are not
   * required because the drain empties the queue exactly once per process.
   */
  private async drainSalvageEvents(): Promise<void> {
    const g = this.game;
    if (!g || this.epoch === undefined) {
      if (g) { g.salvageEvents.length = 0; g.siteEvents.length = 0; }
      return;
    }
    // Spawns become SALVAGE_SPAWN ops; collect events stay queued for
    // drainGameEvents, which turns them into ladder awards.
    const pending = g.salvageEvents.splice(0);
    const spawns = pending.filter(e => e.kind === 'spawn');
    const collects = pending.filter(e => e.kind === 'collect');
    if (collects.length) g.salvageEvents.push(...collects);
    if (spawns.length) {
    const playerIdBySlot = new Map<number, string>();
    for (const [playerId, slot] of this.slotByPlayer) playerIdBySlot.set(slot, playerId);
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      for (const ev of spawns) {
        const opId = randomUUID();
        const x = ev.cell % g.map.w, y = Math.floor(ev.cell / g.map.w);
        const victimId = playerIdBySlot.get(ev.victimOwner) ?? null;
        const killerId = playerIdBySlot.get(ev.killerOwner) ?? null;
        await tx.query(
          `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
           values ($1,$2,$3,$4,'SALVAGE_SPAWN',$5,$6)`,
          [opId, this.opts.regionId, this.epoch, String(ev.tick),
           JSON.stringify({ kind: 'SALVAGE_SPAWN', regionId: this.opts.regionId, x, y, credits: String(ev.credits) }),
           JSON.stringify({ simId: ev.simId, victimOwner: ev.victimOwner, killerOwner: ev.killerOwner, victimType: ev.victimType, victimKind: ev.victimKind })]);
        const entityId = mmoEntityId(this.opts.regionId, ev.simId);
        const detail = JSON.stringify({ killerPlayerId: killerId, type: ev.victimType, simKind: ev.victimKind, cell: ev.cell });
        await tx.query(
          `insert into asset_ledger (operation_id, entity_id, region_id, kind, from_owner, to_owner, physical_state, engine_entity_key, detail)
           values ($1,$2,$3,'DESTROY',$4,null,'destroyed',$5,$6)`,
          [opId, entityId, this.opts.regionId, victimId, String(ev.simId), detail]);
        await tx.query(
          `insert into asset_ledger (operation_id, entity_id, region_id, kind, from_owner, to_owner, physical_state, engine_entity_key, detail)
           values ($1,$2,$3,'SALVAGE',$4,null,'salvaged',$5,$6)`,
          [opId, entityId, this.opts.regionId, victimId, String(ev.simId),
           JSON.stringify({ credits: ev.credits, cell: ev.cell, killerPlayerId: killerId })]);
      }
    });
    }
    await this.drainGameEvents();
  }

  /**
   * PW24: spawn the region's capturable sites. The plan is a pure function of
   * (pack, map, seed, profile count) so every runner derives the same sites;
   * only missing ones spawn, making this safe on fresh games and restores.
   * Sites are neutral (owner -1), indestructible and unshielded.
   */
  private ensureRegionSites(): void {
    const g = this.game;
    if (!g || !g.persistent || !g.mmo?.sites) return;
    const sp = this.opts.rules.sitesPerRegion;
    const plan = regionSitePlan(g.pack, g.map, this.simSeed ?? 0, sp.min, sp.max);
    for (const s of plan) {
      const exists = [...g.entities.values()].some(e =>
        e.kind === 'structure' && e.hp > 0 && g.structDef(e).site
        && Math.abs(e.cx - s.cx) <= 1 && Math.abs(e.cy - s.cy) <= 1);
      if (!exists) g.spawnStructure(s.type, -1, s.cx, s.cy);
    }
  }

  /**
   * PW24: drain the sim's site and salvage-collect feeds into durable audit —
   * SITE_CAPTURE operations for ownership flips, LADDER_AWARD operations for
   * salvage collected, site-hold time paid out on transfer, and repelled
   * defences. Same best-effort crash semantics as drainSalvageEvents.
   */
  private async drainGameEvents(): Promise<void> {
    const g = this.game;
    if (!g || this.epoch === undefined || !this.region?.world_id) {
      if (g) { g.siteEvents.length = 0; g.salvageEvents.length = 0; }
      return;
    }
    const siteEvents = g.siteEvents.splice(0);
    const collects = g.salvageEvents.splice(0).filter(e => e.kind === 'collect');
    if (!siteEvents.length && !collects.length) return;
    const worldId = this.region.world_id;
    const ladder = this.opts.rules.ladder ?? MMO_LADDER_DEFAULT;
    const playerIdBySlot = new Map<number, string>();
    for (const [playerId, slot] of this.slotByPlayer) playerIdBySlot.set(slot, playerId);
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      for (const ev of collects) {
        const collectorId = playerIdBySlot.get(ev.collectorOwner);
        if (!collectorId) continue;
        const points = Math.floor(ev.credits / 100) * ladder.salvagePointsPer100Credits;
        await awardLadderPoints(tx, {
          worldId, playerId: collectorId, points,
          reason: `salvage:${ev.tick}:${ev.cell}`,
          regionId: this.opts.regionId, tick: ev.tick, epoch: this.epoch!,
          refKey: `salvage-collect:${this.opts.regionId}:${ev.tick}:${ev.cell}:${ev.collectorOwner}`,
        });
      }
      for (const ev of siteEvents) {
        const siteId = mmoEntityId(this.opts.regionId, ev.simId);
        if (ev.kind === 'capture') {
          const toId = playerIdBySlot.get(ev.toOwner);
          await tx.query(
            `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
             values ($1,$2,$3,$4,'SITE_CAPTURE',$5,$6)`,
            [randomUUID(), this.opts.regionId, this.epoch, String(ev.tick),
             JSON.stringify({ kind: 'SITE_CAPTURE', siteId, regionId: this.opts.regionId, ownerId: toId ?? null }),
             JSON.stringify({ siteType: ev.siteType, siteKind: ev.siteKind, fromOwner: ev.fromOwner, toOwner: ev.toOwner, heldTicks: ev.heldTicks })]);
          // Objective points for taking the site (neutral first capture counts).
          if (toId && ladder.capturePoints > 0) {
            await awardLadderPoints(tx, {
              worldId, playerId: toId, points: ladder.capturePoints,
              reason: `site_capture:${ev.simId}`,
              regionId: this.opts.regionId, tick: ev.tick, epoch: this.epoch!,
              refKey: `site-capture:${this.opts.regionId}:${ev.simId}:${ev.tick}`,
            });
          }
          // Site-hold time pays out on transfer: the outgoing holder banks
          // their accumulated hold minutes exactly once, journaled here.
          const fromId = ev.fromOwner >= 0 ? playerIdBySlot.get(ev.fromOwner) : undefined;
          if (fromId && ev.heldTicks > 0) {
            const points = Math.floor(ev.heldTicks / SUPPLY_UPKEEP_TICKS) * ladder.siteHoldPointsPerMinute;
            await awardLadderPoints(tx, {
              worldId, playerId: fromId, points,
              reason: `site_hold:${ev.simId}`,
              regionId: this.opts.regionId, tick: ev.tick, epoch: this.epoch!,
              refKey: `site-hold:${this.opts.regionId}:${ev.simId}:${ev.tick}`,
            });
          }
        } else {
          // 'repelled': the defender kept the site — defence points, once per
          // repelled contest (the engine emits exactly one event per reset).
          const defId = ev.fromOwner >= 0 ? playerIdBySlot.get(ev.fromOwner) : undefined;
          if (defId) {
            await awardLadderPoints(tx, {
              worldId, playerId: defId, points: ladder.defencePoints,
              reason: `site_defence:${ev.simId}`,
              regionId: this.opts.regionId, tick: ev.tick, epoch: this.epoch!,
              refKey: `site-repel:${this.opts.regionId}:${ev.simId}:${ev.tick}`,
            });
          }
        }
      }
    });
  }

  private async applyEvent(event: {
    event_seq: string; event_kind: string; payload: unknown; simulation_tick: string;
  }): Promise<void> {
    const t0 = performance.now();
    // The event's recorded boundary is authoritative: the sim must reach it before
    // the input applies, exactly as it would have in real time.
    this.advanceTo(Number(event.simulation_tick));
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      const applied = await this.applyPayload(tx, event);
      await markRegionEventApplied(tx, {
        regionId: this.opts.regionId, eventSeq: event.event_seq, result: applied.result,
      });
      if (applied.intent) {
        await tx.query(
          `update command_intent set status = 'applied',
             result = coalesce(result, '{}'::jsonb) || $3::jsonb, updated_at = clock_timestamp()
            where player_id = $1 and command_id = $2`,
          [applied.intent.playerId, applied.intent.commandId, JSON.stringify({ appliedResult: applied.result })]);
        // Command result fan-out (PW08): subscribers see the authoritative outcome on
        // the same journal position as the sim stream.
        const payload = event.payload as { commandId?: string; playerId?: string };
        await tx.query(
          `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.result',$4)`,
          [randomUUID(), this.opts.regionId, event.event_seq, JSON.stringify({
            commandId: payload.commandId, playerId: payload.playerId, epoch: this.epoch,
            status: 'applied', result: applied.result, eventSeq: event.event_seq,
            tick: event.simulation_tick,
          })]);
        // Resolved sim command fan-out: subscribers run the same engine, so they need
        // the exact Fusion command (sim ids, apply tick) not the durable-id intent.
        // World actions may imply several (PW09 alliance/caretaker sync).
        for (const sc of applied.simCommands ?? []) {
          await tx.query(
            `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
            [randomUUID(), this.opts.regionId, event.event_seq, JSON.stringify({
              eventSeq: event.event_seq, atTick: sc.atTick,
              slot: sc.slot, command: sc.command,
              epoch: this.epoch,
            })]);
        }
      }
    });
    this.stats.scheduleMs += performance.now() - t0;
    this.stats.eventsApplied++;
    this.lastAppliedSeq = BigInt(event.event_seq);
  }

  private async applyPayload(tx: PoolClient, event: {
    event_seq?: string; event_kind: string; payload: unknown;
  }): Promise<{
    result: unknown; intent?: { playerId: string; commandId: string };
    simCommands?: { slot: number; atTick: number; command: Command }[];
  }> {
    const payload = event.payload as Record<string, unknown>;
    if (event.event_kind === 'accrual') {
      const p = payload as { rates?: number[]; ticks?: number };
      const ticks = Number(p.ticks ?? 0);
      this.game!.fastForwardQuiescent(ticks, p.rates ?? []);
      return { result: { advancedTicks: ticks } };
    }
    if (event.event_kind === 'command') {
      const playerId = String(payload.playerId ?? '');
      const commandId = String(payload.commandId ?? '');
      const action = payload.action as MmoAction;
      const slot = this.slotForPlayer(playerId);
      const intent = { playerId, commandId };
      // 'settle' is the world-entry intent (PW11): the player may not occupy a
      // sim slot yet — the handler decides join vs already-settled itself.
      if (slot === undefined && action.t !== 'settle') {
        return { result: { accepted: false, reason: 'UNKNOWN_PLAYER' }, intent };
      }
      if (SIM_ACTIONS.has(action.t)) {
        if (slot === undefined) return { result: { accepted: false, reason: 'UNKNOWN_PLAYER' }, intent };
        const cmd = this.toFusionCommand(action as MmoSimAction);
        if (!cmd) return { result: { accepted: false, reason: 'UNKNOWN_ENTITY' }, intent };
        const atTick = this.game!.tick + 1;
        this.game!.enqueue(slot, cmd, atTick);
        return {
          result: { accepted: true, via: 'sim', action: action.t }, intent,
          simCommands: [{ slot, atTick, command: cmd }],
        };
      }
      if (this.opts.worldHandler) {
        const handled = await this.opts.worldHandler(tx, action as MmoWorldAction, {
          regionId: this.opts.regionId, playerId, slot,
          slotOf: pid => this.slotForPlayer(pid),
          game: () => this.game, simIdFor: id => this.simIdFor(id),
          epoch: this.epoch, tick: this.game?.tick ?? 0,
        });
        const atTick = this.game!.tick + 1;
        const simCommands = (handled.sim ?? []).map(s => {
          this.game!.enqueue(s.slot, s.command, atTick);
          return { slot: s.slot, atTick, command: s.command };
        });
        return { result: handled.result ?? { accepted: true }, intent, simCommands };
      }
      return { result: { accepted: false, reason: 'UNSUPPORTED_ACTION', action: action.t }, intent };
    }
    if (event.event_kind === 'scheduled') {
      // Scheduled events are journaled and applied atomically by processDueJobs; an
      // unapplied one here is a replay leftover — resolve it through the same handler.
      const jobId = String(payload.jobId ?? '');
      const kind = String(payload.kind ?? '');
      const handler = this.opts.jobHandlers[kind] ?? this.defaultJobHandler.bind(this);
      const job: ClaimedJob = {
        job_id: jobId, kind, generation: '0', payload: payload.jobPayload ?? payload.payload ?? {},
        due_at_ms: String(payload.dueAtMs ?? 0), attempts: 1,
      };
      const result = await handler(tx, job, { eventSeq: event.event_seq ?? '0' });
      if (jobId) await finishJobTx(tx, jobId, 'done');
      return { result };
    }
    return { result: { note: 'non-sim event kind' } };
  }

  /**
   * Resolve a durable entity id to a live sim id: explicit bound-asset bindings first
   * (PW26), then the deterministic region/sim-id bridge (PW08).
   */
  private simIdFor(durableId: string): number | null {
    const bound = this.bindings.get(durableId);
    if (bound !== undefined) return bound;
    return mmoSimEntityId(this.opts.regionId, durableId);
  }

  /** Resolve durable entity ids to live sim ids and build the Fusion command. */
  private toFusionCommand(action: MmoSimAction): Command | null {
    const ids = (list: string[]): number[] | null => {
      const out: number[] = [];
      for (const id of list) {
        const sim = this.simIdFor(id);
        if (sim === null) return null;
        out.push(sim);
      }
      return out;
    };
    const one = (id: string): number | null => this.simIdFor(id);
    const a = action as Record<string, unknown>;
    switch (action.t) {
      case 'move': case 'attackMove':
      case 'fireAt': {
        const e = ids(a.entityIds as string[]); if (!e) return null;
        return { t: action.t, ids: e, x: a.x as number, y: a.y as number };
      }
      case 'attack': {
        const e = ids(a.entityIds as string[]); const target = one(a.targetId as string);
        if (!e || target === null) return null;
        return { t: 'attack', ids: e, target, force: a.force === true };
      }
      case 'guard': case 'scatter': case 'stop': case 'deploy': {
        const e = ids(a.entityIds as string[]); if (!e) return null;
        return { t: action.t, ids: e };
      }
      case 'harvest': {
        const e = ids(a.entityIds as string[]); if (!e) return null;
        return { t: 'harvest', ids: e, x: a.x as number, y: a.y as number, lock: a.lock === true };
      }
      case 'enter': {
        const e = ids(a.entityIds as string[]); const target = one(a.targetId as string);
        if (!e || target === null) return null;
        return { t: 'enter', ids: e, target };
      }
      case 'build': case 'cancel':
        return { t: action.t, item: a.item as string };
      case 'place':
        return { t: 'place', item: a.item as string, x: a.x as number, y: a.y as number };
      case 'repair': {
        const id = one(a.entityId as string); if (id === null) return null;
        return { t: 'repair', id };
      }
      case 'rally':
        return { t: 'rally', x: a.x as number, y: a.y as number };
      case 'super': {
        const id = one(a.entityId as string); if (id === null) return null;
        const cmd: Command = { t: 'super', id, x: a.x as number, y: a.y as number };
        if (a.x2 !== undefined && a.y2 !== undefined) Object.assign(cmd, { x2: a.x2, y2: a.y2 });
        return cmd;
      }
      default:
        return null;
    }
  }

  /** Requeue expired claims, claim due jobs and apply each under the fence. */
  private async processDueJobs(now: number): Promise<void> {
    await reclaimExpiredJobs({ nowMs: now });
    const jobs = await claimDueJobs({
      regionId: this.opts.regionId, workerId: this.opts.workerId,
      nowMs: now, leaseMs: this.opts.leaseMs, limit: 16, authorityEpoch: this.epoch!,
    });
    for (const job of jobs) {
      const dueTick = this.tickFor(Number(job.due_at_ms));
      // A job due at a tick the sim has not reached yet goes back to pending; the
      // wall-clock due time is never extended, only the claim is released.
      if (!this.game || this.game.tick < dueTick) { await releaseJobClaim(job.job_id); continue; }
      if (job.attempts > this.opts.maxJobAttempts) {
        await mmoTransaction(async tx => {
          await tx.query('update scheduled_job set last_error = $2 where job_id = $1',
            [job.job_id, `exceeded ${this.opts.maxJobAttempts} attempts`]);
          await finishJobTx(tx, job.job_id, 'cancelled');
        });
        this.opts.log('job-cancelled', { jobId: job.job_id, kind: job.kind, attempts: job.attempts });
        continue;
      }
      try {
        await this.runJob(job);
        this.stats.jobsApplied++;
      } catch (error) {
        // The transaction rolled back: no journal event, no effect, no completion.
        // The claim lease expires and reclaimExpiredJobs retries with attempts+1.
        this.stats.jobErrors++;
        this.opts.log('job-error', { jobId: job.job_id, kind: job.kind, error: String(error) });
      }
    }
  }

  /** Journal + effect + applied receipt + job completion in one transaction. */
  private async runJob(job: ClaimedJob): Promise<void> {
    const t0 = performance.now();
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      const { eventSeq } = await appendRegionEvent(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
        tick: this.game!.tick, kind: 'scheduled',
        payload: { jobId: job.job_id, kind: job.kind, jobPayload: job.payload, dueAtMs: job.due_at_ms },
        outboxTopic: 'mmo.scheduled',
        outboxPayload: { jobId: job.job_id, kind: job.kind, regionId: this.opts.regionId },
      });
      const handler = this.opts.jobHandlers[job.kind] ?? this.defaultJobHandler.bind(this);
      const result = await handler(tx, job, { eventSeq: String(eventSeq) });
      await markRegionEventApplied(tx, { regionId: this.opts.regionId, eventSeq, result });
      await finishJobTx(tx, job.job_id, 'done');
      this.lastAppliedSeq = BigInt(eventSeq);
    });
    this.stats.scheduleMs += performance.now() - t0;
    this.stats.eventsApplied++;
  }

  /** Built-in scheduled kinds; region-specific kinds register via jobHandlers. */
  private async defaultJobHandler(tx: PoolClient, job: ClaimedJob, meta?: { eventSeq: string }): Promise<unknown> {
    if (job.kind === 'shield_expire') {
      const compoundId = (job.payload as { compoundId?: string }).compoundId;
      if (!compoundId) return { ignored: 'missing compoundId' };
      const { rowCount } = await tx.query(
        `update protection_record set status = 'ended', ends_at_ms = coalesce(ends_at_ms, $2), updated_at = clock_timestamp()
          where compound_id = $1 and status = 'active'`,
        [compoundId, this.opts.now()]);
      return { expired: rowCount === 1, compoundId };
    }
    if (job.kind === 'protection_eval') return this.protectionEval(tx, meta?.eventSeq ?? '0');
    if (job.kind === 'recovery_eval') return this.recoveryEval(tx, meta?.eventSeq ?? '0');
    if (job.kind === 'notify_eval') return this.notifyEval(tx);
    return { ignored: `unknown job kind ${job.kind}` };
  }

  // ------------------------------------------------------------------
  // PW10: offline-earned shields and the allied protection boundary
  // ------------------------------------------------------------------

  /**
   * Reconcile every open OFFLINE_EARNED record in this region against durable
   * presence, apply the contract state machine, consume elapsed shield seconds
   * nightly-first, and mirror the resulting active set into the sim as journaled
   * `setShield` fan-out. Runs inside the fenced scheduled-job transaction, so a
   * crash rolls back record, consumption and outbox together.
   *
   * All timing is wall-clock authoritative: an offline transition backdates
   * startedAtMs to the end of the offline grace period, expiry ends at endsAtMs
   * even when the eval itself runs late, and a login pauses with unused time
   * preserved. The eval reschedules itself only for real deadlines (shield
   * expiry, battle-clear recheck); presence changes arrive as poke jobs.
   */
  private async protectionEval(tx: PoolClient, eventSeq: string): Promise<unknown> {
    const now = this.opts.now();
    const rules = this.opts.rules;
    const g = this.game;
    const { rows } = await tx.query<{
      compound_id: string; player_id: string; kind: 'OFFLINE_EARNED';
      status: 'armed' | 'active' | 'ended'; generation: string;
      armed_seconds: string; online_ms: string; online_since_ms: string | null;
      lapse_at_ms: string | null; started_at_ms: string | null; ends_at_ms: string | null;
      milestone_power: string; milestone_barracks: string; armed_at_ms: string | null;
      online_count: number; p_online_since: string | null;
      offline_since_ms: string | null; last_seen_ms: string | null;
    }>(
      `select pr.compound_id, pr.player_id, pr.kind, pr.status, pr.generation::text,
              pr.armed_seconds::text, pr.online_ms::text, pr.online_since_ms::text,
              pr.lapse_at_ms::text, pr.started_at_ms::text, pr.ends_at_ms::text,
              pr.milestone_power::text, pr.milestone_barracks::text, pr.armed_at_ms::text,
              p.online_count, p.online_since_ms as p_online_since,
              p.offline_since_ms, p.last_seen_ms
         from protection_record pr
         join compound c on c.compound_id = pr.compound_id
         join player p on p.player_id = pr.player_id
        where c.region_id = $1 and pr.kind = 'OFFLINE_EARNED' and pr.status in ('armed','active')`,
      [this.opts.regionId]);

    const battleTicks = Math.max(1, Math.ceil(rules.battleWindowMs / this.opts.tickMs));
    const activeNow = new Set<string>();
    let nextDue: number | null = null;
    let changed = 0;
    let consumedNightly = 0n, consumedEarned = 0n, consumedShortfall = 0n;

    for (const row of rows) {
      const rec: ProtectionRecord = {
        kind: 'OFFLINE_EARNED', status: row.status, compoundId: row.compound_id,
        ownerId: row.player_id, generation: row.generation,
        onlineMs: Number(row.online_ms),
        onlineSinceMs: row.online_since_ms !== null ? Number(row.online_since_ms) : null,
        lapseAtMs: row.lapse_at_ms !== null ? Number(row.lapse_at_ms) : null,
        armedSeconds: Number(row.armed_seconds),
        startedAtMs: row.started_at_ms !== null ? Number(row.started_at_ms) : null,
        endsAtMs: row.ends_at_ms !== null ? Number(row.ends_at_ms) : null,
        milestonePower: Number(row.milestone_power), milestoneBarracks: Number(row.milestone_barracks),
      };
      const online = presenceIsOnline({
        online_count: row.online_count, online_since_ms: row.p_online_since,
        offline_since_ms: row.offline_since_ms, last_seen_ms: row.last_seen_ms,
        auto_repair: false,
      }, now, rules.offlineAfterMs);
      // The shield begins when offline grace ends, not when this eval happens to
      // run — backdating keeps late evals (hibernation, job backlog) honest. But
      // it can never begin before the selection was armed: a player offline for
      // hours who arms a short shield now must get the full duration, not an
      // instantly-expired one. armed_at_ms is null only for pre-PW10 rows.
      const offlineBegan = row.offline_since_ms !== null
        ? Number(row.offline_since_ms) + rules.offlineAfterMs : now;
      const armedAt = row.armed_at_ms !== null ? Number(row.armed_at_ms) : offlineBegan;
      const shieldBegan = Math.min(Math.max(offlineBegan, armedAt), now);

      const simId = this.simIdFor(row.compound_id);
      const cy = simId !== null ? g?.entities.get(simId) : undefined;
      // battleAt starts at -1 ("never fought"): without the >= 0 guard every
      // compound would look in-battle for the whole battleWindowMs after tick 0.
      const inBattle = !!g && !!cy && cy.hp > 0 && cy.battleAt >= 0 && g.tick - cy.battleAt <= battleTicks;

      let cur = rec;
      let consumed = 0n;
      for (let i = 0; i < 4; i++) {
        let ev: ProtectionEvent | null = null;
        if (cur.status === 'active') {
          if (cur.endsAtMs !== null && now >= cur.endsAtMs) ev = { t: 'tick', atMs: now };
          else if (online) ev = { t: 'owner_online', atMs: now };
        } else if (cur.status === 'armed' && !online) {
          ev = { t: 'owner_offline', atMs: shieldBegan, inBattle };
        }
        if (!ev) break;
        const before = cur;
        const nxt = protectionTransition(cur, ev, rules);
        if (nxt === cur) break;
        if (before.status === 'active' && nxt.status !== 'active' && before.startedAtMs !== null) {
          const endAt = Math.min(now, before.endsAtMs ?? now);
          const elapsedMs = Math.max(0, endAt - before.startedAtMs);
          consumed = BigInt(Math.min(Number(before.armedSeconds), Math.ceil(elapsedMs / 1000)));
        }
        cur = nxt;
      }

      const dirty = cur.status !== rec.status || cur.generation !== rec.generation
        || cur.armedSeconds !== rec.armedSeconds || cur.startedAtMs !== rec.startedAtMs
        || cur.endsAtMs !== rec.endsAtMs;
      if (dirty || consumed > 0n) {
        const applied = await applyShieldTransition(tx, {
          record: { ...row, region_id: this.opts.regionId }, next: cur,
          consumedSeconds: consumed, nowMs: now,
          nightlyGrantSeconds: rules.nightlyShieldSeconds,
        });
        consumedNightly += applied.consumed.nightly;
        consumedEarned += applied.consumed.earned;
        consumedShortfall += applied.consumed.shortfall;
        changed++;
      }
      if (cur.status === 'active') activeNow.add(row.compound_id);
      if (cur.status === 'active' && cur.endsAtMs !== null) {
        nextDue = Math.min(nextDue ?? Infinity, cur.endsAtMs);
      } else if (cur.status === 'armed' && !online && inBattle) {
        // Battle may clear at any tick; re-check promptly rather than waiting
        // for the next presence poke.
        nextDue = Math.min(nextDue ?? Infinity, now + 30_000);
      }
    }

    // --------------------------------------------------------------
    // PW11: newcomer setup protection — player-scoped, so it lives on the
    // settlement row (it must cover the starter force before any construction
    // yard exists). Evaluated for every rostered player whose protection has
    // not ended, in this region or any other region of the same world.
    // --------------------------------------------------------------
    const newcomerProtectedSlots = new Map<number, boolean>();
    {
      const rosterIds = [...this.slotByPlayer.keys()];
      for (const pl of g?.players ?? []) {
        if (pl.pid && !rosterIds.includes(pl.pid)) rosterIds.push(pl.pid);
      }
      if (rosterIds.length) {
        const { rows: newcomers } = await tx.query<{
          settlement_id: string; player_id: string; protection: unknown;
          online_count: number; p_online_since: string | null;
          offline_since_ms: string | null; last_seen_ms: string | null;
        }>(
          `select s.settlement_id, s.player_id, s.protection,
                  p.online_count, p.online_since_ms as p_online_since,
                  p.offline_since_ms, p.last_seen_ms
             from settlement s
             join player p on p.player_id = s.player_id
             join region r on r.region_id = s.region_id
            where r.world_id = (select world_id from region where region_id = $1)
              and s.player_id = any($2::uuid[])
              and coalesce(s.protection->>'status', 'ended') <> 'ended'`,
          [this.opts.regionId, rosterIds]);
        for (const row of newcomers) {
          let rec: ProtectionRecord;
          try { rec = parseProtectionRecord(row.protection); } catch { continue; }
          if (rec.kind !== 'NEWCOMER' || rec.status === 'ended') continue;
          const online = presenceIsOnline({
            online_count: row.online_count, online_since_ms: row.p_online_since,
            offline_since_ms: row.offline_since_ms, last_seen_ms: row.last_seen_ms,
            auto_repair: false,
          }, now, rules.offlineAfterMs);
          // One event per eval: owner_online accumulates the live stretch
          // without settling it (inter-eval online time is never lost); only
          // owner_offline commits onlineMs. 'tick' is never emitted while
          // online — it would clear the stretch and lose the interval.
          const ev: ProtectionEvent = online
            ? { t: 'owner_online', atMs: now }
            : { t: 'owner_offline', atMs: now, inBattle: false };
          const nxt = protectionTransition(rec, ev, rules);
          const dirty = nxt.status !== rec.status || nxt.generation !== rec.generation
            || nxt.onlineMs !== rec.onlineMs || nxt.onlineSinceMs !== rec.onlineSinceMs;
          if (dirty) {
            await updateSettlementProtection(tx, row.settlement_id, nxt);
            changed++;
          }
          const cur = nxt;
          const slot = this.slotForPlayer(row.player_id);
          if (slot !== undefined) newcomerProtectedSlots.set(slot, cur.status === 'active');
          if (cur.status === 'active') {
            // The protection ends at the earlier of the online-time threshold
            // (only reachable while online) and the absolute lapse instant.
            const candidates: number[] = [];
            if (online && cur.onlineSinceMs !== null) {
              const onlineAt = cur.onlineMs + Math.max(0, now - cur.onlineSinceMs);
              const remain = rules.setupProtectionOnlineMs - onlineAt;
              if (remain > 0) candidates.push(now + remain);
            }
            if (cur.lapseAtMs !== null) candidates.push(cur.lapseAtMs);
            if (candidates.length) {
              nextDue = Math.min(nextDue ?? Infinity, Math.min(...candidates));
            }
          }
        }
      }
    }

    // Mirror newcomer protection flags into the sim at the next tick boundary —
    // journaled like every other world→sim sync so replicas stay identical.
    if (g && newcomerProtectedSlots.size) {
      const atTick = g.tick + 1;
      for (const [slot, want] of newcomerProtectedSlots) {
        const p = g.players[slot];
        if (!p || p.newcomerProtected === want) continue;
        g.enqueue(-1, { t: 'setNewcomerProtection', slot, on: want }, atTick);
        await tx.query(
          `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
          [randomUUID(), this.opts.regionId, eventSeq, JSON.stringify({
            eventSeq, atTick, slot: -1,
            command: { t: 'setNewcomerProtection', slot, on: want },
            epoch: this.epoch,
          })]);
        changed++;
      }
    }

    // Mirror the authoritative active set into the sim at the next tick boundary —
    // the same journaled setShield command subscribers apply, so runner and client
    // sims stay bit-identical. The durable record (not the flag) is the truth the
    // next eval reconciles against, so a rolled-back job self-heals on retry.
    if (g) {
      const atTick = g.tick + 1;
      for (const e of g.entities.values()) {
        if (e.kind !== 'structure' || e.hp <= 0 || !g.structDef(e).constructionYard) continue;
        const durable = mmoEntityId(this.opts.regionId, e.id);
        const want = activeNow.has(durable);
        if (e.shielded === want) continue;
        g.enqueue(-1, { t: 'setShield', compound: e.id, on: want }, atTick);
        await tx.query(
          `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
          [randomUUID(), this.opts.regionId, eventSeq, JSON.stringify({
            eventSeq, atTick, slot: -1,
            command: { t: 'setShield', compound: e.id, on: want },
            epoch: this.epoch,
          })]);
        changed++;
      }
    }

    // Chain only to real deadlines — presence pokes and selectShield/clearShield
    // schedule their own evals, so an idle region never accrues busy-work jobs.
    // The insert stays inside the job transaction: dedupe_key is unique, and
    // finishJobTx frees it, so a live job with this deadline suppresses a dup.
    if (nextDue !== null) {
      await tx.query(
        `insert into scheduled_job (job_id, region_id, kind, due_at_ms, generation, payload, dedupe_key)
         values ($1,$2,'protection_eval',$3,0,$4,$5)
         on conflict (region_id, dedupe_key) where dedupe_key is not null do nothing`,
        [randomUUID(), this.opts.regionId, nextDue.toString(),
         JSON.stringify({ reason: 'chain' }), `prot_eval:${this.opts.regionId}:chain:${nextDue}`]);
    }
    return {
      evaluated: rows.length, changed, nextDue,
      consumedSeconds: { nightly: consumedNightly.toString(), earned: consumedEarned.toString(), shortfall: consumedShortfall.toString() },
    };
  }

  /**
   * On (re)start, make sure open shield selections get evaluated promptly —
   * presence may have changed while no runner owned the region.
   */
  private async ensureProtectionEval(): Promise<void> {
    const row = await mmoOne<{ n: string }>(
      `select count(*)::text as n from (
         select 1 from protection_record pr
           join compound c on c.compound_id = pr.compound_id
          where c.region_id = $1 and pr.kind = 'OFFLINE_EARNED' and pr.status in ('armed','active')
         union all
         select 1 from settlement s
           join region r on r.region_id = s.region_id
          where r.world_id = (select world_id from region where region_id = $1)
            and coalesce(s.protection->>'status', 'ended') <> 'ended'
            and s.player_id = any($2::uuid[])) t`,
      [this.opts.regionId, [...this.slotByPlayer.keys()]]);
    if (Number(row?.n ?? 0) === 0) return;
    const now = this.opts.now();
    await scheduleJob({
      regionId: this.opts.regionId, kind: 'protection_eval', dueAtMs: now,
      dedupeKey: `prot_eval:${this.opts.regionId}:poke:${Math.floor(now / 5000)}`,
      payload: { reason: 'boot' },
    }).catch(() => undefined);
  }

  // ------------------------------------------------------------------
  // PW12: sell-for-credit evacuation defeat and protected MCV recovery
  // ------------------------------------------------------------------

  /**
   * Recovery evaluation (COMRADE 18 §3.5). Runs as a journaled scheduled job so
   * every durable transition — episode open/close, protection record, grant and
   * end operations — commits atomically with the sim mirrors it fans out.
   *
   * Two directions per pass:
   *  - ACTIVE episodes: count the milestone (power + barracks structures),
   *    honour the engine's recoveryAttacked flag, persist transitions, mirror
   *    setRecovery, and close the episode exactly once.
   *  - DETECTION: a rostered player with no live compound anywhere in the
   *    world and no deployed building, packed carrier or MCV in this region's
   *    sim qualifies for the bound recovery MCV. openRecoveryEpisode's partial
   *    unique index makes concurrent grants impossible.
   *
   * The eval reschedules itself every 15 s while the region has players;
   * quiescent regions hold the chain as a pending job until wake.
   */
  private async recoveryEval(tx: PoolClient, eventSeq: string): Promise<unknown> {
    const now = this.opts.now();
    const rules = this.opts.rules;
    const g = this.game;
    const stats = { active: 0, granted: 0, ended: 0, mirrored: 0 };

    const { rows: worldRows } = await tx.query<{ world_id: string }>(
      'select world_id from region where region_id = $1', [this.opts.regionId]);
    const worldId = worldRows[0]?.world_id;
    if (!worldId) return { error: 'NO_WORLD' };

    interface ActiveRow {
      episode_id: string; compound_id: string; player_id: string;
      status: 'active'; generation: string; armed_seconds: string;
      online_ms: string; online_since_ms: string | null; lapse_at_ms: string | null;
      started_at_ms: string | null; ends_at_ms: string | null;
      milestone_power: string; milestone_barracks: string;
    }
    const { rows: active } = await tx.query<ActiveRow>(
      `select re.episode_id, pr.compound_id, pr.player_id, pr.status, pr.generation::text,
              pr.armed_seconds::text, pr.online_ms::text, pr.online_since_ms::text,
              pr.lapse_at_ms::text, pr.started_at_ms::text, pr.ends_at_ms::text,
              pr.milestone_power::text, pr.milestone_barracks::text
         from recovery_episode re
         join protection_record pr on pr.compound_id = re.episode_id and pr.kind = 'RECOVERY'
        where re.region_id = $1 and re.status = 'active' and pr.status = 'active'`,
      [this.opts.regionId]);
    stats.active = active.length;
    const activePlayerIds = new Set(active.map(r => r.player_id));

    const toRow = (rec: ProtectionRecord, playerId: string): ProtectionRow => ({
      compound_id: rec.compoundId, player_id: playerId, kind: 'RECOVERY',
      status: rec.status, generation: String(rec.generation), armed_seconds: String(rec.armedSeconds),
      online_ms: String(rec.onlineMs),
      online_since_ms: rec.onlineSinceMs !== null ? String(rec.onlineSinceMs) : null,
      lapse_at_ms: rec.lapseAtMs !== null ? String(rec.lapseAtMs) : null,
      started_at_ms: rec.startedAtMs !== null ? String(rec.startedAtMs) : null,
      ends_at_ms: rec.endsAtMs !== null ? String(rec.endsAtMs) : null,
      milestone_power: String(rec.milestonePower), milestone_barracks: String(rec.milestoneBarracks),
    });
    const fromRow = (row: ActiveRow): ProtectionRecord => ({
      kind: 'RECOVERY', status: 'active', compoundId: row.compound_id, ownerId: row.player_id,
      generation: row.generation, onlineMs: Number(row.online_ms),
      onlineSinceMs: row.online_since_ms !== null ? Number(row.online_since_ms) : null,
      lapseAtMs: row.lapse_at_ms !== null ? Number(row.lapse_at_ms) : null,
      armedSeconds: Number(row.armed_seconds),
      startedAtMs: row.started_at_ms !== null ? Number(row.started_at_ms) : null,
      endsAtMs: row.ends_at_ms !== null ? Number(row.ends_at_ms) : null,
      milestonePower: Number(row.milestone_power), milestoneBarracks: Number(row.milestone_barracks),
    });
    /** Journaled sim mirror for a recovery flag flip (same pattern as setShield). */
    const mirrorRecovery = async (slot: number, on: boolean) => {
      if (!g) return;
      const atTick = g.tick + 1;
      g.enqueue(-1, { t: 'setRecovery', slot, on }, atTick);
      await tx.query(
        `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
        [randomUUID(), this.opts.regionId, eventSeq, JSON.stringify({
          eventSeq, atTick, slot: -1,
          command: { t: 'setRecovery', slot, on },
          epoch: this.epoch,
        })]);
      stats.mirrored++;
    };

    for (const row of active) {
      const slot = this.slotForPlayer(row.player_id);
      const p = slot !== undefined ? g?.players[slot] : undefined;
      let rec = fromRow(row);
      let dirty = false;
      let endStatus: 'completed' | 'abandoned' | null = null;

      if (p?.recoveryAttacked) {
        // Attacking another player ends recovery at once (COMRADE 18 §2.6).
        rec = protectionTransition(rec, { t: 'player_attack', atMs: now }, rules);
        endStatus = 'abandoned';
        dirty = true;
      } else if (g && slot !== undefined) {
        // Milestone: one power structure + one barracks-equivalent standing.
        let power = 0, barracks = 0;
        for (const e of g.entities.values()) {
          if (e.owner !== slot || e.hp <= 0 || e.kind !== 'structure') continue;
          const roles = structureRoles(g.structDef(e));
          if (roles.includes('power')) power++;
          if (roles.includes('barracks')) barracks++;
        }
        if (power !== rec.milestonePower || barracks !== rec.milestoneBarracks) {
          rec = protectionTransition(rec, { t: 'milestone', power, barracks, atMs: now }, rules);
          dirty = true;
          if (rec.status === 'ended') endStatus = 'completed';
        }
      }

      if (rec.status === 'ended') {
        await saveProtectionRecord(tx, toRow(rec, row.player_id));
        await closeRecoveryEpisode(row.episode_id, endStatus ?? 'completed', tx);
        if (slot !== undefined && p && p.recovering) await mirrorRecovery(slot, false);
        if (this.epoch !== undefined) {
          await tx.query(
            `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
             values ($1,$2,$3,$4,'RECOVERY_TRANSITION',$5,$6)`,
            [randomUUID(), this.opts.regionId, this.epoch, String(g?.tick ?? 0),
             JSON.stringify({ kind: 'RECOVERY_TRANSITION', compoundId: row.compound_id, enter: false }),
             JSON.stringify({ episodeId: row.episode_id, reason: endStatus ?? 'milestone' })]);
        }
        stats.ended++;
      } else {
        if (dirty) { await saveProtectionRecord(tx, toRow(rec, row.player_id)); stats.mirrored++; }
        // Self-heal the sim mirror: a restored snapshot or missed fan-out must
        // not leave the flag off while the durable record says active.
        if (g && p && slot !== undefined && !p.recovering) await mirrorRecovery(slot, true);
        // Crash safety: the recovery MCV is recoveryProtected and cannot be
        // destroyed or sold, so under an active episode a missing MCV AND a
        // missing deployed structure means the grant command was lost between
        // commit and apply. Re-issue it — grantRecovery is idempotent in the
        // engine, so a duplicate is harmless.
        if (g && slot !== undefined) {
          let hasMcv = false, hasStruct = false;
          for (const e of g.entities.values()) {
            if (e.owner !== slot || e.hp <= 0) continue;
            // PW14: a packed carrier is still a building asset — it blocks a
            // duplicate recovery grant exactly like a deployed structure.
            if (e.kind === 'structure' || e.packedType) hasStruct = true;
            else if (e.kind === 'unit' && isMcvUnit(g.unitDef(e))) hasMcv = true;
          }
          if (!hasMcv && !hasStruct) {
            const cell = await this.recoverySpawnCell(g, slot, row.player_id, tx);
            const atTick = g.tick + 1;
            g.enqueue(-1, { t: 'grantRecovery', slot, cell }, atTick);
            await tx.query(
              `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
              [randomUUID(), this.opts.regionId, eventSeq, JSON.stringify({
                eventSeq, atTick, slot: -1,
                command: { t: 'grantRecovery', slot, cell },
                epoch: this.epoch,
              })]);
            stats.granted++;
          }
        }
      }
    }

    // --------------------------------------------------------------
    // Detection: qualifying players with no active episode get the grant.
    // --------------------------------------------------------------
    if (g && this.slotByPlayer.size) {
      for (const [playerId, slot] of this.slotByPlayer) {
        if (activePlayerIds.has(playerId)) continue;
        const p = g.players[slot];
        if (!p) continue;
        // No deployed building anywhere in the world: the durable compound
        // roster covers every region (active, packed or in-transit yards).
        const { rows: comp } = await tx.query<{ n: string }>(
          `select count(*)::text as n from compound c
             join region r on r.region_id = c.region_id
            where r.world_id = $1 and c.player_id = $2 and c.state <> 'destroyed'`,
          [worldId, playerId]);
        if (Number(comp[0]?.n ?? 0) > 0) continue;
        // No deployed building, packed building carrier or MCV in this sim.
        // Surviving units do not block recovery — they are kept, unprotected.
        let hasAnchor = false;
        for (const e of g.entities.values()) {
          if (e.owner !== slot || e.hp <= 0) continue;
          if (e.kind === 'structure' || e.packedType || (e.kind === 'unit' && isMcvUnit(g.unitDef(e)))) {
            hasAnchor = true; break;
          }
        }
        if (hasAnchor) continue;
        // Recovery replaces defeat — a rostered player who never settled (no
        // starter grant, no assets ever) is not defeated and gets nothing.
        const { rows: settled } = await tx.query<{ n: string }>(
          'select count(*)::text as n from settlement where player_id = $1', [playerId]);
        if (Number(settled[0]?.n ?? 0) === 0) continue;

        const episode = await openRecoveryEpisode({ playerId, worldId, regionId: this.opts.regionId }, tx);
        if (!episode.created) continue; // A concurrent eval won; it owns the grant.
        const episodeId = episode.episodeId;
        const rec = newProtection('RECOVERY', episodeId, playerId, now, rules);
        await saveProtectionRecord(tx, toRow(rec, playerId));
        const cell = await this.recoverySpawnCell(g, slot, playerId, tx);
        if (this.epoch !== undefined) {
          await tx.query(
            `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
             values ($1,$2,$3,$4,'RECOVERY_GRANT',$5,$6)`,
            [randomUUID(), this.opts.regionId, this.epoch, String(g.tick),
             JSON.stringify({ kind: 'RECOVERY_GRANT', playerId, regionId: this.opts.regionId, x: cell % g.map.w, y: Math.floor(cell / g.map.w) }),
             JSON.stringify({ episodeId, cell })]);
        }
        // Journaled sim mirrors: the bound MCV spawns and the player enters
        // recovery at the same tick boundary on every replica.
        const atTick = g.tick + 1;
        g.enqueue(-1, { t: 'grantRecovery', slot, cell }, atTick);
        g.enqueue(-1, { t: 'setRecovery', slot, on: true }, atTick);
        for (const command of [
          { t: 'grantRecovery', slot, cell },
          { t: 'setRecovery', slot, on: true },
        ] as Command[]) {
          await tx.query(
            `insert into outbox (event_id, region_id, event_seq, topic, payload) values ($1,$2,$3,'mmo.sim',$4)`,
            [randomUUID(), this.opts.regionId, eventSeq, JSON.stringify({
              eventSeq, atTick, slot: -1, command, epoch: this.epoch,
            })]);
        }
        stats.granted++;
      }
    }

    // Chain the eval only while someone is actually playing: an all-offline
    // region must be free to hibernate (PW21/PW22), and offline evacuees are
    // covered by the connect poke, the sell poke and the boot ensure. Active
    // episodes with everyone offline need no prompt pass — milestones require
    // building and attacks require a live aggressor, both of which mean someone
    // is online somewhere in the roster.
    let anyOnline = false;
    if (this.slotByPlayer.size) {
      const ids = [...this.slotByPlayer.keys()];
      const { rows: on } = await tx.query<{ n: string }>(
        `select count(*)::text as n from player
          where player_id = any($1::uuid[])
            and (online_count > 0
                 or (offline_since_ms is not null
                     and $2::bigint - offline_since_ms < $3::bigint))`,
        [ids, now, rules.offlineAfterMs]);
      anyOnline = Number(on[0]?.n ?? 0) > 0;
    }
    if (anyOnline) {
      const nextDue = now + 15_000;
      await tx.query(
        `insert into scheduled_job (job_id, region_id, kind, due_at_ms, generation, payload, dedupe_key)
         values ($1,$2,'recovery_eval',$3,0,$4,$5)
         on conflict (region_id, dedupe_key) where dedupe_key is not null do nothing`,
        [randomUUID(), this.opts.regionId, nextDue.toString(),
         JSON.stringify({ reason: 'chain' }), `rec_eval:${this.opts.regionId}:chain:${nextDue}`]);
    }
    return stats;
  }

  /**
   * Spawn cell for the recovery MCV: beside the player's surviving units when
   * any remain, else their settlement site, else a scan from the map centre —
   * the same fallback order a fresh settlement would use.
   */
  private async recoverySpawnCell(g: Game, slot: number, playerId: string, tx: PoolClient): Promise<number> {
    const { w, h } = g.map;
    let sx = 0, sy = 0, n = 0;
    for (const e of g.entities.values()) {
      if (e.owner !== slot || e.hp <= 0 || e.kind !== 'unit' || e.carriedBy) continue;
      sx += e.x; sy += e.y; n++;
    }
    let origin: number | null = null;
    if (n > 0) origin = g.cellIndex(toCell(sx / n), toCell(sy / n));
    if (origin === null) {
      const { rows } = await tx.query<{ cell_x: number; cell_y: number }>(
        'select cell_x, cell_y from settlement where player_id = $1', [playerId]);
      if (rows[0]) origin = rows[0].cell_y * w + rows[0].cell_x;
    }
    if (origin === null) origin = (h >> 1) * w + (w >> 1);
    const mcvType = this.packMcvType(g, slot);
    const cls = mcvType ? g.moveClass(g.pack.units[mcvType]) : 'vehicle';
    const spot = nearestCell(g.map, origin, 16,
      i => passable(g.pack, g.map, i, cls) && !g.unitInCell(i));
    return spot >= 0 ? spot : origin;
  }

  private packMcvType(g: Game, slot: number): string | undefined {
    const p = g.players[slot];
    if (!p) return undefined;
    const faction = g.pack.factions.find(f => f.id === p.faction);
    if (!faction) return undefined;
    try { return starterPicks(g.pack, faction).mcv; } catch { return undefined; }
  }

  /** Boot-time poke: rostered players may need recovery evaluation after a restart. */
  private async ensureRecoveryEval(): Promise<void> {
    if (!this.slotByPlayer.size) return;
    const now = this.opts.now();
    await scheduleJob({
      regionId: this.opts.regionId, kind: 'recovery_eval', dueAtMs: now,
      dedupeKey: `rec_eval:${this.opts.regionId}:poke:${Math.floor(now / 5000)}`,
      payload: { reason: 'boot' },
    }).catch(() => undefined);
  }

  /** Boot-time poke for the notification producers (PW25). */
  private async ensureNotifyEval(): Promise<void> {
    if (!this.slotByPlayer.size) return;
    const now = this.opts.now();
    await scheduleJob({
      regionId: this.opts.regionId, kind: 'notify_eval', dueAtMs: now,
      dedupeKey: `notify_eval:${this.opts.regionId}:poke:${Math.floor(now / 5000)}`,
      payload: { reason: 'boot' },
    }).catch(() => undefined);
  }

  /**
   * PW25 notification producers (COMRADE 18 §3.10). Runs inside the fenced job
   * transaction so a raised notification commits atomically with the eval;
   * dedupe_key buckets by the profile's rate-limit window so repeated causes
   * collapse to one row. Delivery itself is the gateway dispatcher's job —
   * rows sit with deliver_after = now + notifications.delayMs until then.
   *
   * Producers: compound under attack (sim battleAt within battleWindowMs),
   * shield ending inside the warning window, storage at cap, and superweapon
   * strikes that appeared since the last pass. Trade-offer and ally-call kinds
   * exist in the contract; their producers land with PW13/alliance chat.
   */
  private async notifyEval(tx: PoolClient): Promise<unknown> {
    const now = this.opts.now();
    const rules = this.opts.rules;
    const g = this.game;
    const stats = { raised: 0 };
    const deliverAfter = new Date(now + rules.notifications.delayMs);
    const bucket = Math.floor(now / Math.max(1, rules.notifications.windowMs));
    const raise = async (
      playerId: string, kind: Parameters<typeof raiseNotification>[1]['kind'],
      dedupeKey: string, payload: Record<string, unknown> = {},
    ) => {
      const ok = await raiseNotification(tx, {
        playerId, kind, dedupeKey, payload,
        regionId: this.opts.regionId, deliverAfter,
      });
      if (ok) stats.raised++;
    };
    const battleTicks = Math.max(1, Math.ceil(rules.battleWindowMs / this.opts.tickMs));

    if (g) {
      // Compound under attack: durable compound roster joined to the sim's
      // battle timestamp. Survives shieldless compounds — battle is engine state.
      const { rows: comps } = await tx.query<{ compound_id: string; player_id: string }>(
        `select compound_id, player_id from compound
          where region_id = $1 and state = 'active'`, [this.opts.regionId]);
      for (const c of comps) {
        const simId = this.simIdFor(c.compound_id);
        const e = simId !== null ? g.entities.get(simId) : undefined;
        if (!e || e.hp <= 0 || e.battleAt < 0 || g.tick - e.battleAt > battleTicks) continue;
        await raise(c.player_id, 'compound_under_attack',
          `attack:${c.compound_id}:${bucket}`, { compoundId: c.compound_id });
      }

      // Storage full: credits pinned at the silo cap.
      for (const [playerId, slot] of this.slotByPlayer) {
        const p = g.players[slot];
        if (p && p.storage > 0 && p.credits >= p.storage) {
          await raise(playerId, 'storage_full', `storage:${playerId}:${bucket}`);
        }
      }

      // Superweapon nearby: strikes scheduled since the last pass, grouped per
      // launcher+weapon so a storm's bolt fan-out raises one notification.
      const seen = this.notifyStrikesSeen;
      const fresh = g.strikes.filter(s => !seen.has(s));
      this.notifyStrikesSeen = new Set(g.strikes);
      if (fresh.length) {
        const groups = new Map<string, { owner: number; name: string; pts: [number, number][] }>();
        for (const s of fresh) {
          const key = `${s.owner}:${s.name}`;
          const grp = groups.get(key) ?? { owner: s.owner, name: s.name, pts: [] };
          grp.pts.push([s.x, s.y]);
          groups.set(key, grp);
        }
        const near = rules.notifications.superweaponNearbyCells;
        for (const grp of groups.values()) {
          for (const [slot, playerId] of [...this.slotByPlayer.entries()].map(([pid, s]) => [s, pid] as const)) {
            if (!g.isEnemy(grp.owner, slot)) continue;
            let close = false;
            for (const e of g.entities.values()) {
              if (e.owner !== slot || e.hp <= 0 || e.kind !== 'structure') continue;
              for (const [sx, sy] of grp.pts) {
                if (Math.max(Math.abs(toCell(e.x) - toCell(sx)), Math.abs(toCell(e.y) - toCell(sy))) <= near) {
                  close = true; break;
                }
              }
              if (close) break;
            }
            if (close) {
              await raise(playerId, 'superweapon_nearby',
                `super:${playerId}:${bucket}`, { name: grp.name });
            }
          }
        }
      }
    }

    // Shield ending: any active protection record whose ends_at falls inside
    // the warning window. Dedupe keys on the record's end instant so each
    // shield warns exactly once.
    const warnMs = rules.rewards.notificationShieldWarningMinutes * 60_000;
    const { rows: shields } = await tx.query<{
      compound_id: string; player_id: string; ends_at_ms: string | null;
    }>(
      `select pr.compound_id, pr.player_id, pr.ends_at_ms::text
         from protection_record pr
         join compound c on c.compound_id = pr.compound_id
        where c.region_id = $1 and pr.kind = 'OFFLINE_EARNED'
          and pr.status = 'active' and pr.ends_at_ms is not null
          and pr.ends_at_ms > $2 and pr.ends_at_ms <= $3`,
      [this.opts.regionId, now, now + warnMs]);
    for (const s of shields) {
      if (s.ends_at_ms === null) continue;
      await raise(s.player_id, 'shield_ending',
        `shieldend:${s.compound_id}:${s.ends_at_ms}`, { compoundId: s.compound_id });
    }

    // Chain only while someone is rostered-and-online, same rule as
    // recovery_eval: an idle region must stay free to hibernate (PW22).
    let anyOnline = false;
    if (this.slotByPlayer.size) {
      const ids = [...this.slotByPlayer.keys()];
      const { rows: on } = await tx.query<{ n: string }>(
        `select count(*)::text as n from player
          where player_id = any($1::uuid[])
            and (online_count > 0
                 or (offline_since_ms is not null
                     and $2::bigint - offline_since_ms < $3::bigint))`,
        [ids, now, rules.offlineAfterMs]);
      anyOnline = Number(on[0]?.n ?? 0) > 0;
    }
    if (anyOnline) {
      const nextDue = now + 15_000;
      await tx.query(
        `insert into scheduled_job (job_id, region_id, kind, due_at_ms, generation, payload, dedupe_key)
         values ($1,$2,'notify_eval',$3,0,$4,$5)
         on conflict (region_id, dedupe_key) where dedupe_key is not null do nothing`,
        [randomUUID(), this.opts.regionId, nextDue.toString(),
         JSON.stringify({ reason: 'chain' }), `notify_eval:${this.opts.regionId}:chain:${nextDue}`]);
    }
    return stats;
  }

  /**
   * Reconcile the durable compound table with the live construction yards. The
   * sim is authoritative for which compounds exist; the table is what protection
   * records, shield selections and future trade/site logic join against.
   */
  private async syncCompoundsNow(): Promise<void> {
    const g = this.game;
    if (!g?.persistent) return;
    const slotToPlayer = new Map<number, string>();
    for (const [pid, slot] of this.slotByPlayer) slotToPlayer.set(slot, pid);
    const live: { compoundId: string; playerId: string; state: 'active' | 'packed' }[] = [];
    for (const e of g.entities.values()) {
      if (e.hp <= 0) continue;
      // PW14: a packed yard keeps its compound identity in 'packed' state — the
      // entity id (and durable compound id) is unchanged across the morph.
      const structType = e.packedType || (e.kind === 'structure' ? e.type : '');
      if (!structType) continue;
      const sdef = g.pack.structures[structType];
      if (!sdef?.constructionYard) continue;
      const playerId = slotToPlayer.get(e.owner);
      if (!playerId) continue;
      live.push({ compoundId: mmoEntityId(this.opts.regionId, e.id), playerId, state: e.packedType ? 'packed' : 'active' });
    }
    await mmoTransaction(async tx => {
      await assertRegionFence(tx, {
        regionId: this.opts.regionId, workerId: this.opts.workerId, epoch: this.epoch!,
      });
      await syncCompounds(tx, { regionId: this.opts.regionId, live });
    });
  }

  /** Snapshot the sim and record it against the applied journal position. */
  async checkpoint(reason: string): Promise<void> {
    if (!this.game || !this.epoch) return;
    await setRegionLifecycle(this.opts.regionId, 'checkpointing');
    try {
      const payload: SnapshotPayload = {
        v: 1, seed: this.simSeed,
        snapshot: captureGame(this.game, { seed: this.simSeed }),
        bindings: this.durableBindings(),
        ...(this.hibMeta ? { hib: this.hibMeta } : {}),
      };
      const tail = await journalTail(this.opts.regionId);
      const region = await mmoOne<{ engine_artifact_sha256: string; ruleset_version: string }>(
        'select engine_artifact_sha256, ruleset_version from region where region_id = $1', [this.opts.regionId]);
      await recordSnapshot({
        regionId: this.opts.regionId, epoch: this.epoch,
        lastAppliedSeq: this.lastAppliedSeq, lastCommittedSeq: BigInt(tail?.seq ?? '0'),
        tick: this.game.tick,
        engineArtifactSha256: region?.engine_artifact_sha256 ?? 'unknown',
        rulesetVersion: region?.ruleset_version ?? 'persistent_world',
        format: 'fusion-persistent-v1',
        payload: Buffer.from(JSON.stringify(payload), 'utf8'),
      });
      this.lastCheckpointTick = this.game.tick;
      this.stats.checkpoints++;
      this.opts.log('region-checkpoint', { regionId: this.opts.regionId, tick: this.game.tick, reason });
      await this.persistPowerScores();
    } finally {
      if (this.running) await setRegionLifecycle(this.opts.regionId, 'active');
    }
  }

  /**
   * Recompute and persist every member's power score from live asset totals
   * (PW23). Runs at each checkpoint — asset changes are journaled, so checkpoint
   * cadence bounds staleness without per-tick writes.
   */
  private async persistPowerScores(): Promise<void> {
    if (!this.game || !this.region?.world_id) return;
    const playerIdBySlot = new Map<number, string>();
    for (const [playerId, slot] of this.slotByPlayer) playerIdBySlot.set(slot, playerId);
    const w = this.opts.rules.powerScoreWeights;
    const scores = this.game.players.flatMap((p, slot) => {
      const playerId = playerIdBySlot.get(slot);
      if (!playerId) return [];
      return [{ playerId, score: computePowerScore(this.game!.assetTotals(p), w) }];
    });
    if (scores.length) await updateMemberPowerScores(this.region.world_id, scores);
  }

  /** Checkpoint, release the lease and stop. Safe to call twice. */
  async stop(): Promise<void> {
    this.running = false;
    this.stopTimers();
    try { await this.checkpoint('stop'); } catch (error) {
      this.opts.log('checkpoint-error', { error: String(error) });
    }
    try { await releaseRegionLease(this.opts.regionId, this.opts.workerId); } catch { /* lease may already be gone */ }
  }
}
