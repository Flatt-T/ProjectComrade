// Persistent-region state transfer (PW21): full Game snapshot and restore.
//
// A snapshot captures every byte of deterministic simulation state — tick, RNG
// state, entity ids and fields, production queues, fog, map occupancy and resources,
// pending commands, worms, strikes, crates and projectiles — so that restoring and
// replaying the same journal produces identical per-tick checksums. Visual-only
// `effects` are excluded: the renderer regenerates them and they are not part of
// the checksum.
//
// Region hooks are runtime functions and are NOT serialized; the caller reattaches
// `game.hooks` after restore. The map's static layers are regenerated from
// pack + preset + seed; only the mutable layers (occupied, res) are stored.
import { Rng } from './core.js';
import { Game, withPersistentStructures, type Command, type Entity, type MmoTuning, type Player } from './game.js';
import type { AIState } from './ai.js';
import { generateMap, type MapData } from './map.js';
import { generateWorldMap, type WorldgenSpec } from './worldgen.js';
import type { Doctrine, MapPreset, RulePack } from './rules.js';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c ?? 0) >> 6)] : '=') + (i + 2 < bytes.length ? B64[c & 63] : '=');
  }
  return out;
}

function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map(k => {
      const ch = clean.charCodeAt(i + k);
      return k < clean.length - i ? B64.indexOf(String.fromCharCode(ch)) : 0;
    });
    const v = (n[0] << 18) | (n[1] << 12) | (n[2] << 6) | n[3];
    if (o < out.length) out[o++] = (v >> 16) & 255;
    if (o < out.length) out[o++] = (v >> 8) & 255;
    if (o < out.length) out[o++] = v & 255;
  }
  return out;
}

const u8d = (s: string) => b64ToBytes(s);

function i32ToB64(a: Int32Array): string {
  const bytes = new Uint8Array(a.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) view.setInt32(i * 4, a[i], true);
  return bytesToB64(bytes);
}
function b64ToI32(s: string): Int32Array {
  const bytes = b64ToBytes(s);
  const out = new Int32Array(bytes.length / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt32(i * 4, true);
  return out;
}
function u16ToB64(a: Uint16Array): string {
  const bytes = new Uint8Array(a.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) view.setUint16(i * 2, a[i], true);
  return bytesToB64(bytes);
}
function b64ToU16(s: string): Uint16Array {
  const bytes = b64ToBytes(s);
  const out = new Uint16Array(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

export interface SnapshotMeta {
  /** World seed the map was generated from (Game does not retain it). */
  seed: number;
}

export interface GameSnapshotV1 {
  v: 1;
  setup: { packId: string; mapId: string; seed: number; persistent: boolean; mmo?: MmoTuning; worldgen?: WorldgenSpec };
  state: {
    tick: number; market: number; over: boolean; winnerTeam: number;
    rngState: number; nextId: number; powerDirty: boolean; startMoney: number;
    techCap: number; doctrine: Doctrine; wormRate: number; renewal: number;
    superCharge: number; crateRate: number;
    players: unknown[];
    ai: (AIState | null)[];
    entities: unknown[];
    projectiles: unknown[];
    worms: unknown[];
    strikes: unknown[];
    reveals: unknown[];
    crates: unknown[];
    pending: [number, { slot: number; cmd: Command }[]][];
    map: { occupied: string; res: string; resKind: string; concrete: string };
  };
}

const serPlayer = (p: Player) => {
  const { explored, visible, ...rest } = p;
  return { ...rest, explored: bytesToB64(explored), visible: bytesToB64(visible) };
};
const derPlayer = (raw: Record<string, unknown>): Player => ({
  ...(raw as unknown as Player),
  explored: u8d(raw.explored as string),
  visible: u8d(raw.visible as string),
  // Snapshots predating PW09 lack these fields.
  ally: (raw.ally as number) ?? -1,
  autoRepair: raw.autoRepair === true,
  // Snapshots predating PW11 lack newcomer protection.
  newcomerProtected: raw.newcomerProtected === true,
  // Snapshots predating PW12 lack recovery state.
  recovering: raw.recovering === true,
  recoveryAttacked: raw.recoveryAttacked === true,
});

interface GameInternals {
  nextId: number;
  pending: Map<number, { slot: number; cmd: Command }[]>;
  powerDirty: boolean;
  ai: (AIState | null)[];
  startMoney: number;
}

/** Serialize a running Game to a JSON string. `meta.seed` regenerates the map. */
export function captureGame(game: Game, meta: SnapshotMeta): string {
  const internals = game as unknown as GameInternals;
  const snap: GameSnapshotV1 = {
    v: 1,
    setup: {
      packId: game.pack.id, mapId: game.mapPreset.id, seed: meta.seed,
      persistent: game.persistent, mmo: game.mmo, worldgen: game.worldgenSpec,
    },
    state: {
      tick: game.tick, market: game.market, over: game.over, winnerTeam: game.winnerTeam,
      rngState: game.rng.getState(), nextId: internals.nextId,
      powerDirty: internals.powerDirty, startMoney: internals.startMoney,
      techCap: game.techCap, doctrine: game.doctrine, wormRate: game.wormRate,
      renewal: game.renewal, superCharge: game.superCharge, crateRate: game.crateRate,
      players: game.players.map(serPlayer),
      ai: internals.ai,
      entities: [...game.entities.values()],
      projectiles: game.projectiles, worms: game.worms, strikes: game.strikes,
      reveals: game.reveals, crates: game.crates,
      pending: [...internals.pending.entries()].sort((a, b) => a[0] - b[0]),
      map: { occupied: i32ToB64(game.map.occupied), res: u16ToB64(game.map.res), resKind: bytesToB64(game.map.resKind), concrete: bytesToB64(game.map.concrete) },
    },
  };
  return JSON.stringify(snap);
}

/**
 * Rebuild a Game from a snapshot. `packs` resolves the rule pack by id (PACKS
 * values or CLASSIC_PACKS). The restored game is bit-identical: replaying the same
 * commands reproduces the same checksums. Reattach `game.hooks` afterwards.
 */
export function restoreGame(json: string, packs: RulePack[]): Game {
  const snap = JSON.parse(json) as GameSnapshotV1;
  if (snap.v !== 1) throw new Error(`Unsupported snapshot version ${snap.v}`);
  const pack = packs.find(p => p.id === snap.setup.packId);
  if (!pack) throw new Error(`Unknown rule pack ${snap.setup.packId}`);
  // PW16: worldgen regions regenerate from the stored spec + seed; preset maps
  // regenerate from pack + preset + seed as before.
  const generated = snap.setup.worldgen
    ? generateWorldMap(pack, snap.setup.worldgen, snap.setup.seed)
    : undefined;
  const preset: MapPreset = generated?.preset
    ?? pack.maps.find(m => m.id === snap.setup.mapId) ?? pack.maps[0];
  const map: MapData = generated?.map ?? generateMap(pack, preset, snap.setup.seed);
  map.occupied.set(b64ToI32(snap.state.map.occupied));
  map.res.set(b64ToU16(snap.state.map.res));
  // resKind is dynamic: cells deplete to 0 and regrowth/spread restore it.
  map.resKind.set(u8d(snap.state.map.resKind));
  // concrete is dynamic on Dune: poured under placed structures.
  map.concrete.set(u8d(snap.state.map.concrete));

  const game = Object.create(Game.prototype) as Game;
  const internals = game as unknown as GameInternals;
  internals.nextId = snap.state.nextId;
  internals.pending = new Map(snap.state.pending);
  internals.powerDirty = snap.state.powerDirty;
  internals.ai = snap.state.ai;
  internals.startMoney = snap.state.startMoney;

  const g = game as unknown as Record<string, unknown>;
  // PW14: restored persistent games get the same carrier-augmented pack the
  // constructor would have produced — captures store only the pack id.
  g.pack = snap.setup.persistent ? withPersistentStructures(pack) : pack;
  g.map = map;
  g.mapPreset = preset;
  const rng = new Rng(0);
  rng.setState(snap.state.rngState);
  g.rng = rng;
  g.players = snap.state.players.map(p => derPlayer(p as Record<string, unknown>));
  g.entities = new Map((snap.state.entities as { id: number }[]).map(e => [e.id, e as unknown as Entity]));
  // Snapshots predating PW10 lack the shield fields.
  for (const e of (g.entities as Map<number, Entity>).values()) {
    e.shielded = e.shielded === true;
    e.battleAt = typeof e.battleAt === 'number' ? e.battleAt : -1;
    // Snapshots predating PW12 lack the recovery protection flag.
    e.recoveryProtected = e.recoveryProtected === true;
    // Snapshots predating PW14 lack the packed-building carrier marker.
    e.packedType = typeof e.packedType === 'string' ? e.packedType : '';
    // Snapshots predating PW17 lack the creator-faction stamp; fall back to the
    // owner's faction — the best available approximation for old assets.
    e.faction = typeof e.faction === 'string' && e.faction ? e.faction
      : ((g.players as Player[])[e.owner]?.faction ?? '');
    // Snapshots predating PW24 lack the site capture state.
    const ss = (e as { siteState?: unknown }).siteState as { progress?: number; by?: number; heldSince?: number } | undefined;
    e.siteState = ss && typeof ss === 'object'
      ? { progress: ss.progress ?? 0, by: ss.by ?? -1, heldSince: ss.heldSince ?? -1 }
      : undefined;
  }
  g.projectiles = snap.state.projectiles;
  g.worms = snap.state.worms;
  g.strikes = snap.state.strikes;
  g.reveals = snap.state.reveals;
  g.crates = snap.state.crates;
  // Audit feeds are transient (the runner drains them); Object.create skips
  // field initializers, so re-arm them empty on every restore.
  (g as unknown as { salvageEvents: unknown[] }).salvageEvents = [];
  (g as unknown as { siteEvents: unknown[] }).siteEvents = [];
  g.effects = [];
  g.tick = snap.state.tick;
  g.market = snap.state.market;
  g.over = snap.state.over;
  g.winnerTeam = snap.state.winnerTeam;
  g.techCap = snap.state.techCap;
  g.doctrine = snap.state.doctrine;
  g.wormRate = snap.state.wormRate;
  g.renewal = snap.state.renewal;
  g.superCharge = snap.state.superCharge;
  g.crateRate = snap.state.crateRate;
  g.persistent = snap.setup.persistent;
  g.mmo = g.persistent ? snap.setup.mmo : undefined;
  g.worldgenSpec = snap.setup.worldgen;
  g.hooks = {};
  return game;
}
