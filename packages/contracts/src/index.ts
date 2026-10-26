// Type-only, so this stays erased at runtime and the two modules never import each other.
import type { AdBreak } from './billing.js';

export const PROTOCOL_VERSION = 1 as const;
export const MAP_ID = 'tiberium-crossing' as const;
/** Faction ids are per game style (gdi/nod, atreides/harkonnen/ordos, allies/soviets...). */
export type Faction = string;

// Game styles the platform offers. 'vanilla-*' styles run the original GPL engines;
// 'fusion' styles run the Comrade Fusion Engine with the named rule pack, which also
// supports lockstep multiplayer. Unplayable styles are declared so the roster is visible.
/** Classic styles, then community fusions (`fusion-<pack id>`). */
export type GameStyle = 'td-classic' | 'td-fusion' | 'ra1' | 'ra1-fusion' | 'ra2' | 'dune2k' | 'fusion-leviathan';
export interface FactionInfo { id: Faction; name: string; full: string; blurb: string }
export interface StyleInfo {
  id: GameStyle; name: string; engine: 'vanilla-td' | 'vanilla-ra' | 'fusion'; pack?: string;
  playable: boolean; lockstep: boolean; blurb: string; factions: FactionInfo[];
}
const RA2_COUNTRIES: FactionInfo[] = [
      { id: 'america', name: 'America', full: 'Allies · United States', blurb: 'Paratroopers.' },
      { id: 'russia', name: 'Russia', full: 'Soviets · Russia', blurb: 'Tesla Tank.' },
      { id: 'korea', name: 'Korea', full: 'Allies · Korea', blurb: 'Black Eagle jets.' },
      { id: 'libya', name: 'Libya', full: 'Soviets · Libya', blurb: 'Demolition Truck.' },
      { id: 'france', name: 'France', full: 'Allies · France', blurb: 'Grand Cannon.' },
      { id: 'iraq', name: 'Iraq', full: 'Soviets · Iraq', blurb: 'Desolator.' },
      { id: 'germany', name: 'Germany', full: 'Allies · Germany', blurb: 'Tank Destroyer.' },
      { id: 'cuba', name: 'Cuba', full: 'Soviets · Cuba', blurb: 'Terrorist.' },
      { id: 'britain', name: 'Great Britain', full: 'Allies · Great Britain', blurb: 'Sniper.' },
];
export const STYLES: StyleInfo[] = [
  { id: 'td-classic', name: 'Classic C&C', engine: 'vanilla-td', playable: true, lockstep: false, blurb: 'Tiberian Dawn on the original engine. GDI versus the Brotherhood of Nod.',
    factions: [{ id: 'gdi', name: 'GDI', full: 'Global Defense Initiative', blurb: 'Heavy armour. Superior firepower.' }, { id: 'nod', name: 'Nod', full: 'Brotherhood of Nod', blurb: 'Speed. Subterfuge. Strength through unity.' }] },
  { id: 'td-fusion', name: 'Tiberian Dawn Style', engine: 'fusion', pack: 'td', playable: true, lockstep: true,
    blurb: 'GDI versus Nod on the Fusion Engine: the same four battlefields as the original-engine slice, with synchronized multiplayer.',
    factions: [{ id: 'gdi', name: 'GDI', full: 'Global Defense Initiative', blurb: 'Heavy armour. Superior firepower.' }, { id: 'nod', name: 'Nod', full: 'Brotherhood of Nod', blurb: 'Speed. Subterfuge. Strength through unity.' }] },
  { id: 'ra1-fusion', name: 'Red Alert Style', engine: 'fusion', pack: 'ra1', playable: true, lockstep: true,
    blurb: 'Allies versus Soviets on the Fusion Engine: ore and gems, navies, the Chronosphere and the Iron Curtain.',
    factions: [{ id: 'allies', name: 'Allies', full: 'Allied Nations', blurb: 'Rangers, Tanya, the Chronosphere and a real navy.' }, { id: 'soviet', name: 'Soviets', full: 'Soviet Union', blurb: 'Heavy tanks, Tesla coils and the bomb.' }] },
  { id: 'dune2k', name: 'Dune Style', engine: 'fusion', pack: 'dune', playable: true, lockstep: true, blurb: 'Spice, sandworms and three Great Houses. Replicated on the Fusion Engine.',
    factions: [{ id: 'atreides', name: 'Atreides', full: 'House Atreides', blurb: 'Fremen allies and the Sonic Tank.' }, { id: 'harkonnen', name: 'Harkonnen', full: 'House Harkonnen', blurb: 'Sardaukar and the Devastator.' }, { id: 'ordos', name: 'Ordos', full: 'House Ordos', blurb: 'Raiders and the Deviator.' }] },
  { id: 'ra2', name: 'Red Alert 2 Style', engine: 'fusion', pack: 'ra2', playable: true, lockstep: true, blurb: 'Allies versus Soviets in isometric 3/4 view. Replicated on the Fusion Engine.',
    // Countries alternate sides so default seating puts the Allies against the Soviets.
    factions: RA2_COUNTRIES },
  { id: 'fusion-leviathan', name: 'Fusion: Leviathan Isles', engine: 'fusion', pack: 'leviathan', playable: true, lockstep: true,
    blurb: 'Red Alert 2 armies on a worm-infested archipelago: thin ore at home, riches on the central island, sandworms in the sea.',
    factions: RA2_COUNTRIES },
  { id: 'ra1', name: 'Classic Red Alert', engine: 'vanilla-ra', playable: true, lockstep: false,
    blurb: 'Red Alert on the original engine, with freeware content and authored battlefields. Each commander fights the built-in enemy.',
    factions: [{ id: 'allies', name: 'Allies', full: 'Allied Nations', blurb: 'Greece. Mobility and the navy.' }, { id: 'soviet', name: 'Soviet', full: 'Soviet Union', blurb: 'USSR. Heavy armour and numbers.' }] },
];
export function styleInfo(id: GameStyle): StyleInfo { return STYLES.find(s => s.id === id) ?? STYLES[0]; }
export function factionAllowed(style: GameStyle, faction: unknown): faction is Faction {
  return typeof faction === 'string' && styleInfo(style).factions.some(f => f.id === faction);
}

export type Visibility = 'public' | 'invite';
export type CreditsPreset = 'low' | 'standard' | 'high';
export type AILevel = 'easy' | 'normal' | 'hard';
/**
 * `ai` is the number of computer opponents added to Fusion Engine matches (0..3); `aiLevel` how hard they play.
 * `worms` is sandworm activity as a percent of the rule pack's base rate (0 = no worms, 100 = pack default):
 * it sets how many worms roam and how long they stay under between attacks.
 * `renewal` is how fast mined-out resource cells grow back, 0 (never) to 50; 25 is the pack's own rate.
 * `superCharge` is superweapon recharge speed in percent, 100 (classic) to 200 (twice as fast).
 * `crates` is bonus-crate frequency, 0 (none) to 200; 100 drops one about every minute.
 * `speed` is how fast the clock runs, 100 (classic 15 ticks a second) to 300.
 */
export interface MatchSettings {
  credits: CreditsPreset; techLevel: number; ai: number; aiLevel: AILevel;
  worms: number; renewal: number; superCharge: number; crates: number; speed: number;
}
export const WORMS_MAX = 200;
export const RENEWAL_MAX = 50;
/** The renewal setting at which fields grow back at the rule pack's own rate. */
export const RENEWAL_CLASSIC = 25;
export const SUPER_CHARGE_MIN = 100, SUPER_CHARGE_MAX = 200, SUPER_CHARGE_STEP = 25;
export const CRATES_MAX = 200;
export const SPEED_MIN = 100, SPEED_MAX = 300, SPEED_STEP = 25;
export const DEFAULT_SETTINGS: MatchSettings = {
  credits: 'standard', techLevel: 15, ai: 1, aiLevel: 'normal',
  worms: 50, renewal: RENEWAL_CLASSIC, superCharge: 100, crates: 0, speed: 100,
};
export const CREDITS_VALUES: Record<CreditsPreset, number> = { low: 30, standard: 60, high: 120 };

export interface RoomOptions { style: GameStyle; map: string; visibility: Visibility; maxPlayers: number; settings: MatchSettings }
export const DEFAULT_OPTIONS: RoomOptions = { style: 'td-classic', map: MAP_ID, visibility: 'public', maxPlayers: 2, settings: DEFAULT_SETTINGS };

/** `team` 0 means no team (everyone else is an enemy); players sharing 1..4 are allies. */
export interface LaunchPlayer { id: string; name: string; faction: Faction; team?: number }
/** Fusion matches also carry the shared seed and every human in slot order. */
export type LaunchRequest = {
  version: 1; type: 'launch'; map: string; faction: Faction; style: GameStyle; settings: MatchSettings;
  seed?: number; players?: LaunchPlayer[]; you?: string;
};

export type ClientMessage =
  /** `token` is a Cognito access token: it links this peer to an account for quotas and history. */
  | { version: 1; type: 'join'; room: string; name: string; faction: Faction; token?: string }
  /** Sent when a player signs in or out without leaving the lobby. */
  | { version: 1; type: 'identify'; token?: string }
  | { version: 1; type: 'configure'; options: RoomOptions }
  | { version: 1; type: 'faction'; faction: Faction }
  | { version: 1; type: 'ready'; ready: boolean }
  | { version: 1; type: 'team'; team: number }
  | { version: 1; type: 'chat'; text: string; to: ChatAudience }
  | { version: 1; type: 'start' }
  | { version: 1; type: 'list' }
  | { version: 1; type: 'leave' }
  | TurnMessage;

/** One lockstep turn of Fusion Engine commands; the service relays it untouched. */
export interface TurnMessage { version: 1; type: 'turn'; turn: number; tick: number; checksum: number; commands: unknown[] }

export type ChatAudience = 'all' | 'allies';
export const CHAT_MAX = 200;
export interface RoomPlayer {
  id: string; name: string; faction: Faction; ready: boolean; host: boolean; team?: number;
  /** Set once the peer has identified itself with an access token. */
  handle?: string;
  /** Subscription tier, so the lobby can show who is skipping the advertisement. */
  tier?: string;
  /** False when this player has no weekly allowance left for the chosen style. */
  entitled?: boolean;
}
export interface RoomState {
  version: 1; type: 'room'; room: string; host: string; phase: 'lobby' | 'started'; options: RoomOptions; players: RoomPlayer[];
  /** Set when the match starts: shared random seed and player ids in slot order. */
  seed?: number; slots?: string[];
  /** Slots watching a pre-match advertisement, so the others can see who is held up. */
  adSlots?: number[];
}
export interface RoomSummary { room: string; hostName: string; style: GameStyle; map: string; players: number; maxPlayers: number; phase: 'lobby' | 'started' }

/** `bin` is Tiberian Dawn's separate terrain file; Red Alert keeps terrain inside the INI. */
export interface MapInfo { id: string; name: string; theater: string; maxPlayers: number; description: string; ini: string; bin?: string }
export interface ContentFile { name: string; bytes: number; sha256: string }
export interface ContentManifest { version: 1; id: string; engine: 'vanilla-td' | 'vanilla-ra'; notice: string; source: string; maps: MapInfo[]; files: ContentFile[] }
export interface EngineSnapshot { frame: number; audioRunning?: boolean; camera?: number; mouseX?: number; mouseY?: number; selected?: number; credits?: number; harvested?: number; spent?: number; units?: number; buildings?: number; power?: number; drain?: number; lost?: number; won?: boolean; defeated?: boolean; entities?: { id: number; owner: number; cell: number; hp: number; name: string }[] }
export type ServerMessage = RoomState
  | { version: 1; type: 'welcome'; id: string; capabilities: string[]; gameplay: 'lobby-presence' }
  | { version: 1; type: 'rooms'; rooms: RoomSummary[] }
  | { version: 1; type: 'error'; message: string }
  | { version: 1; type: 'chat'; from: string; name: string; text: string; to: ChatAudience; at: number }
  | { version: 1; type: 'turn'; slot: number; turn: number; tick: number; checksum: number; commands: unknown[]; final?: boolean }
  /**
   * Sent privately to each player as the match starts. `ad` is present only for the tiers
   * that watch one; the simulation runs underneath it from the first tick either way, so a
   * player watching an advertisement arrives with their base already thirty seconds idle
   * and never holds up anyone else's lockstep.
   */
  | { version: 1; type: 'match'; matchId: string; reportToken: string; slot: number; ad?: AdBreak };
export type PlayerOrder = { version: 1; type: 'order'; sequence: number; tick: number; action: 'move' | 'attack' | 'harvest' | 'build' | 'train' | 'place'; entities: number[]; cell?: number; target?: number; item?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
const isFaction = (x: unknown): x is Faction => typeof x === 'string' && /^[a-z0-9-]{2,24}$/.test(x);
/** A JWT as the client holds it: shape-checked only — the service verifies the signature. */
const token = (x: unknown): string | undefined =>
  typeof x === 'string' && x.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(x) ? x : undefined;
const isStyle = (x: unknown): x is GameStyle => STYLES.some(s => s.id === x);

export function parseSettings(value: unknown): MatchSettings {
  if (value === undefined || value === null) return { ...DEFAULT_SETTINGS };
  const v = object(value);
  const credits = ['low', 'standard', 'high'].includes(String(v.credits)) ? v.credits as CreditsPreset : 'standard';
  const techLevel = typeof v.techLevel === 'number' && Number.isInteger(v.techLevel) && v.techLevel >= 1 && v.techLevel <= 15 ? v.techLevel : 15;
  const ai = typeof v.ai === 'number' && Number.isInteger(v.ai) && v.ai >= 0 && v.ai <= 3 ? v.ai : DEFAULT_SETTINGS.ai;
  const aiLevel = ['easy', 'normal', 'hard'].includes(String(v.aiLevel)) ? v.aiLevel as AILevel : DEFAULT_SETTINGS.aiLevel;
  const whole = (value: unknown, min: number, max: number, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
  const worms = whole(v.worms, 0, WORMS_MAX, DEFAULT_SETTINGS.worms);
  const renewal = whole(v.renewal, 0, RENEWAL_MAX, DEFAULT_SETTINGS.renewal);
  const superCharge = whole(v.superCharge, SUPER_CHARGE_MIN, SUPER_CHARGE_MAX, DEFAULT_SETTINGS.superCharge);
  const crates = whole(v.crates, 0, CRATES_MAX, DEFAULT_SETTINGS.crates);
  const speed = whole(v.speed, SPEED_MIN, SPEED_MAX, DEFAULT_SETTINGS.speed);
  return { credits, techLevel, ai, aiLevel, worms, renewal, superCharge, crates, speed };
}
export function parseOptions(value: unknown): RoomOptions {
  const v = object(value);
  if (!isStyle(v.style)) throw new Error('Unknown game style');
  if (typeof v.map !== 'string' || !/^[a-z0-9-]{3,40}$/.test(v.map)) throw new Error('Invalid map');
  const visibility: Visibility = v.visibility === 'invite' ? 'invite' : 'public';
  const maxPlayers = typeof v.maxPlayers === 'number' && v.maxPlayers >= 2 && v.maxPlayers <= 4 ? Math.trunc(v.maxPlayers) : 2;
  return { style: v.style, map: v.map, visibility, maxPlayers, settings: parseSettings(v.settings) };
}
export function parseLaunch(value: unknown): LaunchRequest {
  const v = object(value);
  if (v.version !== 1 || v.type !== 'launch' || typeof v.map !== 'string' || !/^[a-z0-9-]{3,40}$/.test(v.map) || !isStyle(v.style) || !factionAllowed(v.style, v.faction)) throw new Error('Invalid launch contract');
  return { version: 1, type: 'launch', map: v.map, faction: v.faction, style: v.style, settings: parseSettings(v.settings) };
}
export function parseOrder(value: unknown): PlayerOrder {
  const v = object(value);
  const integer = (x: unknown, max: number) => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= max;
  if (v.version !== 1 || v.type !== 'order' || !integer(v.sequence, 0x7fffffff) || !integer(v.tick, 0x7fffffff)
    || !['move','attack','harvest','build','train','place'].includes(String(v.action)) || !Array.isArray(v.entities) || v.entities.length > 128
    || !v.entities.every(x => integer(x, 65535)) || new Set(v.entities).size !== v.entities.length
    || (v.cell !== undefined && !integer(v.cell, 16383)) || (v.target !== undefined && !integer(v.target, 65535))
    || (v.item !== undefined && (typeof v.item !== 'string' || !/^[A-Z0-9]{1,8}$/.test(v.item)))) throw new Error('Invalid player order');
  if (['move','harvest','place'].includes(String(v.action)) && v.cell === undefined) throw new Error('Order requires a cell');
  if (v.action === 'attack' && v.target === undefined) throw new Error('Attack requires a target');
  if (['build','train','place'].includes(String(v.action)) && !v.item) throw new Error('Production requires an item');
  if (['move','attack','harvest'].includes(String(v.action)) && !v.entities.length) throw new Error('Unit orders require entities');
  if (['build','train','place'].includes(String(v.action)) && v.entities.length) throw new Error('Production orders do not take entities');
  return { version: 1, type: 'order', sequence: v.sequence as number, tick: v.tick as number, action: v.action as PlayerOrder['action'], entities: v.entities as number[], cell: v.cell as number | undefined, target: v.target as number | undefined, item: v.item as string | undefined };
}
export function parseClientMessage(value: unknown): ClientMessage {
  const v = object(value);
  if (v.version !== 1) throw new Error('Unsupported protocol version');
  if (v.type === 'join' && typeof v.room === 'string' && /^[a-z0-9-]{3,32}$/.test(v.room)
    && typeof v.name === 'string' && /^[\p{L}\p{N} _-]{1,24}$/u.test(v.name) && isFaction(v.faction)) {
    return { version: 1, type: 'join', room: v.room, name: v.name.trim() || 'Commander', faction: v.faction, token: token(v.token) };
  }
  if (v.type === 'identify') return { version: 1, type: 'identify', token: token(v.token) };
  if (v.type === 'configure') return { version: 1, type: 'configure', options: parseOptions(v.options) };
  if (v.type === 'faction' && isFaction(v.faction)) return { version: 1, type: 'faction', faction: v.faction };
  if (v.type === 'ready' && typeof v.ready === 'boolean') return { version: 1, type: 'ready', ready: v.ready };
  if (v.type === 'team' && Number.isInteger(v.team) && (v.team as number) >= 0 && (v.team as number) <= 4) return { version: 1, type: 'team', team: v.team as number };
  if (v.type === 'chat' && typeof v.text === 'string' && (v.to === 'all' || v.to === 'allies')) {
    // Plain text only: control characters are dropped and length capped.
    const text = [...v.text].filter(c => c >= ' ' && c !== String.fromCharCode(127)).join('').trim().slice(0, CHAT_MAX);
    if (text) return { version: 1, type: 'chat', text, to: v.to };
  }
  if (v.type === 'start' || v.type === 'leave' || v.type === 'list') return { version: 1, type: v.type };
  if (v.type === 'turn') {
    const int = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 0;
    if (!int(v.turn) || !int(v.tick) || !Number.isSafeInteger(v.checksum) || !Array.isArray(v.commands) || v.commands.length > 64
      || !v.commands.every(c => c && typeof c === 'object' && !Array.isArray(c))) throw new Error('Invalid turn');
    return { version: 1, type: 'turn', turn: v.turn as number, tick: v.tick as number, checksum: v.checksum as number, commands: v.commands };
  }
  throw new Error('Invalid room message');
}
export function parseContentManifest(value: unknown): ContentManifest {
  const v = object(value);
  // Red Alert keeps its terrain inside the scenario INI, so its maps carry no .BIN.
  const engine = v.engine === 'vanilla-ra' ? 'vanilla-ra' : 'vanilla-td';
  const needsBin = engine === 'vanilla-td';
  if (v.version !== 1 || (v.engine !== 'vanilla-td' && v.engine !== 'vanilla-ra') || typeof v.id !== 'string' || !Array.isArray(v.files) || v.files.length > 64) throw new Error('Invalid content manifest');
  const names = new Set<string>();
  let bytes = 0;
  for (const raw of v.files) {
    const f = object(raw);
    if (typeof f.name !== 'string' || !/^[A-Z0-9_-]+\.(MIX|INI|BIN)$/.test(f.name) || names.has(f.name)
      || typeof f.bytes !== 'number' || !Number.isSafeInteger(f.bytes) || f.bytes < 1
      || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Invalid content file');
    names.add(f.name); bytes += f.bytes;
  }
  if (bytes > 96 * 1024 * 1024 || !names.has('CONQUER.MIX') || !names.has('COMRADE.INI')
    || needsBin && !names.has('COMRADE.BIN')) throw new Error('Incomplete or oversized content pack');
  if (!Array.isArray(v.maps) || v.maps.length < 1 || v.maps.length > 32) throw new Error('Content pack is missing maps');
  const mapIds = new Set<string>();
  for (const raw of v.maps) {
    const m = object(raw);
    if (typeof m.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(m.id) || mapIds.has(m.id)
      || typeof m.name !== 'string' || typeof m.ini !== 'string' || !names.has(m.ini)
      || needsBin && (typeof m.bin !== 'string' || !names.has(m.bin))) throw new Error('Invalid map entry');
    mapIds.add(m.id);
  }
  return v as unknown as ContentManifest;
}

// Paid platform vocabulary: tiers, quotas, billing payloads, accounts, history and voting.
export * from './billing.js';
export * from './account.js';
