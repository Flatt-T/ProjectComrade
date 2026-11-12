// Region service (PW08): the service-side owner of RegionRunner instances. It starts
// a runner on demand for a subscribed region, supervises it (bounded restart backoff
// on failure), produces subscription snapshots and exposes the fence subscribers
// need to submit commands. Everything here is inert unless MMO_DATABASE_URL is set.
import { createHash, randomUUID } from 'node:crypto';
import { mmoOne, mmoQuery } from './db.js';
import { getRegion, joinWorld, createPlayer, MmoStoreError, type RegionRow } from './store.js';
import { RegionRunner, type RegionRunnerOptions } from './runner.js';
import { createWorldHandler } from './world.js';
import { authEnabled } from '../config.js';
import { PERSISTENT_RULES_V1, MMO_PROTOCOL, MMO_RULESET_VERSION, type MmoSnapshotHeader } from '@comrade/contracts';

export interface RegionIdentity {
  /** Stable account key: platform account uuid for registered users, a derived uuid for guests. */
  accountId: string;
  displayName: string;
  kind: 'account' | 'guest';
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** Deterministic uuid from an arbitrary identity string (guest ids are not uuids). */
export function identityUuid(kind: string, id: string): string {
  const h = sha256(`${kind}:${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export interface SubscriptionSnapshot {
  header: MmoSnapshotHeader;
  /** The runner's live state envelope — restore with restoreGame(state.snapshot, packs). */
  state: { v: 1; seed: number; snapshot: string; bindings: [string, number][]; tick: number };
}

interface RunnerEntry {
  runner: RegionRunner;
  workerId: string;
  startedAt: number;
  restarts: number;
  nextRestartAt: number;
}

const MAX_RESTARTS = 5;
const RESTART_BACKOFF_MS = 5_000;
const WAKE_POLL_MS = 5_000;

export class RegionService {
  private entries = new Map<string, RunnerEntry>();
  private readonly opts: Omit<RegionRunnerOptions, 'regionId' | 'workerId'>;
  private readonly log: (event: string, data?: Record<string, unknown>) => void;
  private readonly wakePollMs: number;
  private wakeTimer?: ReturnType<typeof setInterval>;
  /** PW22 metrics: hibernation/wake accounting for capacity reporting. */
  readonly metrics = {
    wakes: 0,
    wakeLatenciesMs: [] as number[],
    hibernations: 0,
  };

  constructor(options?: {
    runner?: Omit<RegionRunnerOptions, 'regionId' | 'workerId'>;
    log?: (event: string, data?: Record<string, unknown>) => void;
    /** Quiescent-region job wake scan interval. Default 5 s. */
    wakePollMs?: number;
  }) {
    this.opts = options?.runner ?? {};
    this.log = options?.log ?? (() => undefined);
    this.wakePollMs = options?.wakePollMs ?? WAKE_POLL_MS;
  }

  private async entryFor(regionId: string, startIfMissing = true): Promise<RunnerEntry | undefined> {
    const existing = this.entries.get(regionId);
    if (existing) {
      if (!existing.runner.isFailed && existing.runner.isRunning) return existing;
      // Failed runners restart under bounded backoff — the region row stays 'failed'
      // until a new owner takes it, which is exactly the supervision contract.
      if (existing.runner.isFailed) {
        if (existing.restarts >= MAX_RESTARTS || Date.now() < existing.nextRestartAt) return undefined;
        existing.restarts++;
        existing.nextRestartAt = Date.now() + RESTART_BACKOFF_MS * existing.restarts;
        this.log('region-restart', { regionId, attempt: existing.restarts });
      }
    }
    if (!startIfMissing) return undefined;
    if (existing?.runner.didHibernate) this.metrics.hibernations++;
    const region = await getRegion(regionId);
    if (!region) return undefined;
    const workerId = randomUUID();
    // PW09: durable world actions (alliances, caretaker flag, later protection
    // and barter) resolve through the journaled world handler by default.
    const runner = new RegionRunner({
      ...this.opts, regionId, workerId,
      worldHandler: this.opts.worldHandler ?? createWorldHandler(this.opts.rules ?? PERSISTENT_RULES_V1),
    });
    const entry: RunnerEntry = { runner, workerId, startedAt: Date.now(), restarts: existing?.restarts ?? 0, nextRestartAt: 0 };
    this.entries.set(regionId, entry);
    try {
      await runner.start();
      if (runner.wakeLatencyMs !== undefined) {
        this.metrics.wakes++;
        this.metrics.wakeLatenciesMs.push(runner.wakeLatencyMs);
        if (this.metrics.wakeLatenciesMs.length > 512) this.metrics.wakeLatenciesMs.shift();
      }
    } catch (error) {
      this.entries.delete(regionId);
      this.log('region-start-failed', { regionId, error: String(error) });
      throw error;
    }
    return entry;
  }

  /** Ensure the region's runner is live; returns it or undefined when it cannot start. */
  async ensure(regionId: string): Promise<RegionRunner | undefined> {
    return (await this.entryFor(regionId))?.runner;
  }

  /** The fence a subscriber must present on submitCommand for this region. */
  async fenceFor(regionId: string): Promise<{ workerId: string; epoch: string } | undefined> {
    const entry = await this.entryFor(regionId, false);
    const epoch = entry?.runner.authorityEpoch;
    return entry && epoch ? { workerId: entry.workerId, epoch } : undefined;
  }

  /**
   * Build the subscription snapshot: header + live sim state. lastAppliedSeq labels
   * exactly what the state represents; the durable tail may be ahead (COMRADE 14 §6).
   */
  async snapshotFor(regionId: string): Promise<SubscriptionSnapshot | undefined> {
    const entry = await this.entryFor(regionId);
    if (!entry) return undefined;
    const state = entry.runner.captureState();
    if (!state) return undefined;
    const region = await getRegion(regionId);
    const tail = await mmoOne<{ last_committed_seq: string }>(
      'select last_committed_seq from region where region_id = $1', [regionId]);
    const stateJson = JSON.stringify(state);
    const header: MmoSnapshotHeader = {
      protocol: MMO_PROTOCOL, type: 'snapshot',
      regionId, epoch: entry.runner.authorityEpoch ?? '0',
      lastAppliedSeq: entry.runner.appliedSeq,
      lastCommittedSeq: tail?.last_committed_seq ?? entry.runner.appliedSeq,
      tick: String(state.tick),
      rulesetVersion: MMO_RULESET_VERSION,
      engineArtifactSha256: region?.engine_artifact_sha256 ?? 'unknown',
      stateSha256: sha256(stateJson),
      state,
    };
    return { header, state };
  }

  /** Cheap observation for subscriber checksum verification. */
  async observationFor(regionId: string) {
    const entry = this.entries.get(regionId);
    if (!entry || entry.runner.isFailed) return undefined;
    const obs = entry.runner.observation();
    const epoch = entry.runner.authorityEpoch;
    return obs && epoch ? { ...obs, epoch, regionId } : undefined;
  }

  /** All live runners (ops/diagnostics). */
  regions(): { regionId: string; tick?: number; failed: boolean; awake: boolean }[] {
    return [...this.entries.entries()].map(([regionId, e]) => ({
      regionId, tick: e.runner.currentGame?.tick, failed: e.runner.isFailed,
      awake: e.runner.isRunning,
    }));
  }

  /**
   * PW22 wake poller: quiescent regions have no runner to claim their due jobs, so
   * the service scans for scheduled work inside the look-ahead window and ensures
   * those regions awake. Logins and commands wake through ensure() directly.
   */
  start(): void {
    if (this.wakeTimer) return;
    this.wakeTimer = setInterval(() => {
      void mmoQuery<{ region_id: string }>(
        `select distinct j.region_id from scheduled_job j
           join region r on r.region_id = j.region_id
          where j.state = 'pending' and r.lifecycle = 'quiescent'
            and j.due_at_ms <= $1`,
        [Date.now() + PERSISTENT_RULES_V1.hibernateInboundLookaheadMs])
        .then(rows => {
          for (const row of rows) void this.ensure(row.region_id).catch(() => undefined);
        })
        .catch(() => undefined);
    }, this.wakePollMs);
    this.wakeTimer.unref?.();
  }

  stop(): void {
    if (this.wakeTimer) clearInterval(this.wakeTimer);
    this.wakeTimer = undefined;
  }

  /** Find or provision the durable player row for an authenticated identity. */
  async playerFor(identity: RegionIdentity, worldId: string) {
    // COMRADE 18 PW09: guests cannot own a persistent base. The gateway rejects
    // them earlier; this is the durable-layer guard so no path can provision one.
    // Auth-disabled dev deployments treat the guest cookie as the only identity.
    if (identity.kind === 'guest' && authEnabled() && process.env.MMO_ALLOW_GUESTS !== '1') {
      throw new MmoStoreError('GUEST_NOT_ALLOWED', 'Persistent worlds require a registered account');
    }
    let player = await mmoOne<{ player_id: string; display_name: string }>(
      'select player_id, display_name from player where account_id = $1', [identity.accountId]);
    if (!player) {
      const created = await createPlayer({ accountId: identity.accountId, displayName: identity.displayName });
      player = { player_id: created.player_id, display_name: created.display_name };
    }
    await joinWorld(worldId, player.player_id);
    return player;
  }

  /** Region row for gateway validation (exists? which world?). */
  async regionInfo(regionId: string): Promise<RegionRow | undefined> {
    return getRegion(regionId);
  }

  /** Stop every runner (service shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.entries.values()].map(e => e.runner.stop().catch(() => undefined)));
    this.entries.clear();
  }
}
