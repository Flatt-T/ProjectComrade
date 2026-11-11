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
import {
  Game, PACKS, captureGame, restoreGame,
  type Command, type GameSetup, type RulePack,
} from '@comrade/fusion';
import type { MmoAction, MmoSimAction, MmoWorldAction } from '@comrade/contracts';
import { mmoOne, mmoTransaction } from './db.js';
import {
  acquireRegionLease, appendRegionEvent, assertRegionFence, claimDueJobs, finishJobTx,
  getRegion, latestSnapshot, listUnappliedRegionEvents, markRegionEventApplied,
  reclaimExpiredJobs, recordSnapshot, releaseJobClaim, releaseRegionLease, setRegionLifecycle,
  setRegionSimStart, MmoStoreError, type RegionRow,
} from './store.js';
import { journalTail } from './commands.js';
import { mmoQuery } from './db.js';

const TICK_MS = 1000 / 15;
const PACK_LIST = Object.values(PACKS) as RulePack[];

export interface SimPlayerSpec { playerId: string; name: string; faction: string }
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
export type ScheduledJobHandler = (tx: PoolClient, job: ClaimedJob) => Promise<unknown>;
export type WorldActionHandler = (
  tx: PoolClient, action: MmoWorldAction,
  ctx: { regionId: string; playerId: string; slot: number },
) => Promise<unknown>;

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
  /** Fresh-region sim setup, used when region.seed carries no `sim` block. */
  sim?: RegionSimSpec;
  worldHandler?: WorldActionHandler;
  jobHandlers?: Record<string, ScheduledJobHandler>;
  log?: (event: string, data?: Record<string, unknown>) => void;
}

interface SnapshotPayload {
  v: 1; seed: number; snapshot: string; bindings: [string, number][];
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
  private running = false;
  private busy = false;
  private failed = false;
  private stepTimer?: ReturnType<typeof setInterval>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private lastPoll = 0;
  private lastRenew = 0;
  private lastCheckpointTick = 0;
  private lastAppliedSeq = 0n;
  readonly stats = {
    ticksStepped: 0, simMs: 0, scheduleMs: 0, eventsApplied: 0, jobsApplied: 0,
    jobErrors: 0, checkpoints: 0, catchUpTicks: 0,
  };
  private readonly opts: Required<Omit<RegionRunnerOptions, 'now' | 'sim' | 'worldHandler' | 'jobHandlers' | 'log'>> & {
    now: () => number; sim?: RegionSimSpec; worldHandler?: WorldActionHandler;
    jobHandlers: Record<string, ScheduledJobHandler>; log: (e: string, d?: Record<string, unknown>) => void;
  };

  constructor(options: RegionRunnerOptions) {
    this.opts = {
      leaseMs: 30_000, tickMs: TICK_MS, pollMs: 250, checkpointEveryTicks: 0,
      maxJobAttempts: 8, now: () => Date.now(), ...options,
      jobHandlers: options.jobHandlers ?? {}, log: options.log ?? (() => undefined),
    };
  }

  get isRunning() { return this.running; }
  get isFailed() { return this.failed; }
  get currentGame() { return this.game; }
  get authorityEpoch() { return this.epoch; }

  /** Map a durable entity id to its live sim entity id (persistent asset identity). */
  bindEntity(durableId: string, simId: number) { this.bindings.set(durableId, simId); }
  durableBindings(): [string, number][] { return [...this.bindings.entries()]; }

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
    if (snap) {
      const payload = JSON.parse(snap.payload.toString('utf8')) as SnapshotPayload;
      this.simSeed = payload.seed;
      this.game = restoreGame(payload.snapshot, PACK_LIST);
      this.bindings = new Map(payload.bindings);
      this.lastAppliedSeq = BigInt(snap.last_applied_seq);
      this.opts.log('region-restored', { regionId: this.opts.regionId, tick: this.game.tick, epoch: this.epoch });
    } else {
      this.simSeed = spec.seed;
      const pack = PACK_LIST.find(p => p.id === spec.packId);
      if (!pack) throw new MmoStoreError('NO_PACK', `unknown rule pack ${spec.packId}`);
      const setup: GameSetup = {
        pack,
        mapId: spec.mapId, seed: spec.seed, persistent: true,
        credits: spec.credits, techLevel: spec.techLevel, worms: spec.worms,
        renewal: spec.renewal, superCharge: spec.superCharge, crates: spec.crates,
        doctrine: spec.doctrine,
        players: spec.players.map(p => ({ name: p.name, faction: p.faction, ai: false })),
      };
      this.game = new Game(setup);
      this.opts.log('region-created', { regionId: this.opts.regionId, tick: 0, epoch: this.epoch });
    }

    // Wall-clock ↔ sim-tick anchor. A region that was down fast-forwards through the
    // elapsed ticks on recovery — the sim is the only authority, so there is no
    // shortcut; quiescent accrual is PW22's concern, not this runner's.
    const now = this.opts.now();
    this.startedAtMs = this.region.started_at_ms != null
      ? Number(this.region.started_at_ms)
      : now - this.game.tick * this.opts.tickMs;
    if (this.region.started_at_ms == null) await setRegionSimStart(this.opts.regionId, this.startedAtMs);

    await this.catchUpTo(this.tickFor(now));
    await this.applyUnappliedEvents();
    await setRegionLifecycle(this.opts.regionId, 'active');

    this.running = true;
    this.lastPoll = now; this.lastRenew = now;
    this.stepTimer = setInterval(() => void this.onTick(), this.opts.tickMs);
    this.stepTimer.unref?.();
    this.pollTimer = setInterval(() => void this.onPoll(), this.opts.pollMs);
    this.pollTimer.unref?.();
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
    this.stats.catchUpTicks += this.game!.tick - before;
    if (this.game!.tick !== before) this.opts.log('region-catchup', { from: before, to: this.game!.tick });
  }

  private async onTick(): Promise<void> {
    if (this.busy || this.failed || !this.running || !this.game) return;
    this.busy = true;
    try {
      const expected = this.tickFor(this.opts.now());
      if (this.game.tick < expected) this.advanceTo(Math.min(expected, this.game.tick + 600));
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
    this.stepTimer = this.pollTimer = undefined;
  }

  /** Apply every unapplied command/scheduled journal event in seq order. */
  private async applyUnappliedEvents(): Promise<void> {
    for (;;) {
      const events = await listUnappliedRegionEvents(this.opts.regionId, ['command', 'scheduled'], 64);
      if (!events.length) return;
      for (const event of events) await this.applyEvent(event);
    }
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
      }
    });
    this.stats.scheduleMs += performance.now() - t0;
    this.stats.eventsApplied++;
    this.lastAppliedSeq = BigInt(event.event_seq);
  }

  private async applyPayload(tx: PoolClient, event: {
    event_kind: string; payload: unknown;
  }): Promise<{ result: unknown; intent?: { playerId: string; commandId: string } }> {
    const payload = event.payload as Record<string, unknown>;
    if (event.event_kind === 'command') {
      const playerId = String(payload.playerId ?? '');
      const commandId = String(payload.commandId ?? '');
      const action = payload.action as MmoAction;
      const slot = this.slotByPlayer.get(playerId);
      const intent = { playerId, commandId };
      if (slot === undefined) return { result: { accepted: false, reason: 'UNKNOWN_PLAYER' }, intent };
      if (SIM_ACTIONS.has(action.t)) {
        const cmd = this.toFusionCommand(action as MmoSimAction);
        if (!cmd) return { result: { accepted: false, reason: 'UNKNOWN_ENTITY' }, intent };
        this.game!.enqueue(slot, cmd);
        return { result: { accepted: true, via: 'sim', action: action.t }, intent };
      }
      if (this.opts.worldHandler) {
        const handled = await this.opts.worldHandler(tx, action as MmoWorldAction, {
          regionId: this.opts.regionId, playerId, slot,
        });
        return { result: handled ?? { accepted: true }, intent };
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
      const result = await handler(tx, job);
      if (jobId) await finishJobTx(tx, jobId, 'done');
      return { result };
    }
    return { result: { note: 'non-sim event kind' } };
  }

  /** Resolve durable entity ids to live sim ids and build the Fusion command. */
  private toFusionCommand(action: MmoSimAction): Command | null {
    const ids = (list: string[]): number[] | null => {
      const out: number[] = [];
      for (const id of list) {
        const sim = this.bindings.get(id);
        if (sim === undefined) return null;
        out.push(sim);
      }
      return out;
    };
    const one = (id: string): number | null => this.bindings.get(id) ?? null;
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
      const result = await handler(tx, job);
      await markRegionEventApplied(tx, { regionId: this.opts.regionId, eventSeq, result });
      await finishJobTx(tx, job.job_id, 'done');
      this.lastAppliedSeq = BigInt(eventSeq);
    });
    this.stats.scheduleMs += performance.now() - t0;
    this.stats.eventsApplied++;
  }

  /** Built-in scheduled kinds; region-specific kinds register via jobHandlers. */
  private async defaultJobHandler(tx: PoolClient, job: ClaimedJob): Promise<unknown> {
    if (job.kind === 'shield_expire') {
      const compoundId = (job.payload as { compoundId?: string }).compoundId;
      if (!compoundId) return { ignored: 'missing compoundId' };
      const { rowCount } = await tx.query(
        `update protection_record set status = 'ended', ends_at_ms = coalesce(ends_at_ms, $2), updated_at = clock_timestamp()
          where compound_id = $1 and status = 'active'`,
        [compoundId, this.opts.now()]);
      return { expired: rowCount === 1, compoundId };
    }
    return { ignored: `unknown job kind ${job.kind}` };
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
    } finally {
      if (this.running) await setRegionLifecycle(this.opts.regionId, 'active');
    }
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
