// Region service (PW08): the service-side owner of RegionRunner instances. It starts
// a runner on demand for a subscribed region, supervises it (bounded restart backoff
// on failure), produces subscription snapshots and exposes the fence subscribers
// need to submit commands. Everything here is inert unless MMO_DATABASE_URL is set.
import { createHash, randomUUID } from 'node:crypto';
import { mmoOne } from './db.js';
import { getRegion, joinWorld, createPlayer, type RegionRow } from './store.js';
import { RegionRunner, type RegionRunnerOptions } from './runner.js';
import { MMO_PROTOCOL, MMO_RULESET_VERSION, type MmoSnapshotHeader } from '@comrade/contracts';

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

export class RegionService {
  private entries = new Map<string, RunnerEntry>();
  private readonly opts: Omit<RegionRunnerOptions, 'regionId' | 'workerId'>;
  private readonly log: (event: string, data?: Record<string, unknown>) => void;

  constructor(options?: {
    runner?: Omit<RegionRunnerOptions, 'regionId' | 'workerId'>;
    log?: (event: string, data?: Record<string, unknown>) => void;
  }) {
    this.opts = options?.runner ?? {};
    this.log = options?.log ?? (() => undefined);
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
    const region = await getRegion(regionId);
    if (!region) return undefined;
    const workerId = randomUUID();
    const runner = new RegionRunner({ ...this.opts, regionId, workerId });
    const entry: RunnerEntry = { runner, workerId, startedAt: Date.now(), restarts: existing?.restarts ?? 0, nextRestartAt: 0 };
    this.entries.set(regionId, entry);
    try {
      await runner.start();
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
  regions(): { regionId: string; tick?: number; failed: boolean }[] {
    return [...this.entries.entries()].map(([regionId, e]) => ({
      regionId, tick: e.runner.currentGame?.tick, failed: e.runner.isFailed,
    }));
  }

  /** Find or provision the durable player row for an authenticated identity. */
  async playerFor(identity: RegionIdentity, worldId: string) {
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
