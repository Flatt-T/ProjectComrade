export const PROTOCOL_VERSION = 1 as const;
export const MAP_ID = 'tiberium-crossing' as const;
/** Faction ids are per game style (gdi/nod, atreides/harkonnen/ordos, allies/soviets...). */
export type Faction = string;

// Game styles the platform offers. 'vanilla-*' styles run the original GPL engines;
// 'fusion' styles run the Comrade Fusion Engine with the named rule pack, which also
// supports lockstep multiplayer. Unplayable styles are declared so the roster is visible.
export type GameStyle = 'td-classic' | 'ra1' | 'ra2' | 'dune2k';
export interface FactionInfo { id: Faction; name: string; full: string; blurb: string }
export interface StyleInfo {
  id: GameStyle; name: string; engine: 'vanilla-td' | 'vanilla-ra' | 'fusion'; pack?: string;
  playable: boolean; lockstep: boolean; blurb: string; factions: FactionInfo[];
}
export const STYLES: StyleInfo[] = [
  { id: 'td-classic', name: 'Classic C&C', engine: 'vanilla-td', playable: true, lockstep: false, blurb: 'Tiberian Dawn on the original engine. GDI versus the Brotherhood of Nod.',
    factions: [{ id: 'gdi', name: 'GDI', full: 'Global Defense Initiative', blurb: 'Heavy armour. Superior firepower.' }, { id: 'nod', name: 'Nod', full: 'Brotherhood of Nod', blurb: 'Speed. Subterfuge. Strength through unity.' }] },
  { id: 'dune2k', name: 'Dune Style', engine: 'fusion', pack: 'dune', playable: true, lockstep: true, blurb: 'Spice, sandworms and three Great Houses. Replicated on the Fusion Engine.',
    factions: [{ id: 'atreides', name: 'Atreides', full: 'House Atreides', blurb: 'Fremen allies and the Sonic Tank.' }, { id: 'harkonnen', name: 'Harkonnen', full: 'House Harkonnen', blurb: 'Sardaukar and the Devastator.' }, { id: 'ordos', name: 'Ordos', full: 'House Ordos', blurb: 'Raiders and the Deviator.' }] },
  { id: 'ra2', name: 'Red Alert 2 Style', engine: 'fusion', pack: 'ra2', playable: true, lockstep: true, blurb: 'Allies versus Soviets in isometric 3/4 view. Replicated on the Fusion Engine.',
    factions: [{ id: 'allies', name: 'Allies', full: 'Allied Nations', blurb: 'Prism tech, Chrono Miners, the Grizzly.' }, { id: 'soviets', name: 'Soviets', full: 'Soviet Union', blurb: 'Tesla power, Rhino armour, the Apocalypse.' }] },
  { id: 'ra1', name: 'Red Alert', engine: 'vanilla-ra', playable: false, lockstep: false, blurb: 'Original engine built; content pack and map pending (ADR 007).',
    factions: [{ id: 'allies', name: 'Allies', full: 'Allied Nations', blurb: '' }, { id: 'soviet', name: 'Soviet', full: 'Soviet Union', blurb: '' }] },
];
export function styleInfo(id: GameStyle): StyleInfo { return STYLES.find(s => s.id === id) ?? STYLES[0]; }
export function factionAllowed(style: GameStyle, faction: unknown): faction is Faction {
  return typeof faction === 'string' && styleInfo(style).factions.some(f => f.id === faction);
}

export type Visibility = 'public' | 'invite';
export type CreditsPreset = 'low' | 'standard' | 'high';
/** `ai` is the number of computer opponents added to Fusion Engine matches (0..3). */
export interface MatchSettings { credits: CreditsPreset; techLevel: number; ai: number }
export const DEFAULT_SETTINGS: MatchSettings = { credits: 'standard', techLevel: 15, ai: 1 };
export const CREDITS_VALUES: Record<CreditsPreset, number> = { low: 30, standard: 60, high: 120 };

export interface RoomOptions { style: GameStyle; map: string; visibility: Visibility; maxPlayers: number; settings: MatchSettings }
export const DEFAULT_OPTIONS: RoomOptions = { style: 'td-classic', map: MAP_ID, visibility: 'public', maxPlayers: 2, settings: DEFAULT_SETTINGS };

export interface LaunchPlayer { id: string; name: string; faction: Faction }
/** Fusion matches also carry the shared seed and every human in slot order. */
export type LaunchRequest = {
  version: 1; type: 'launch'; map: string; faction: Faction; style: GameStyle; settings: MatchSettings;
  seed?: number; players?: LaunchPlayer[]; you?: string;
};

export type ClientMessage =
  | { version: 1; type: 'join'; room: string; name: string; faction: Faction }
  | { version: 1; type: 'configure'; options: RoomOptions }
  | { version: 1; type: 'faction'; faction: Faction }
  | { version: 1; type: 'ready'; ready: boolean }
  | { version: 1; type: 'start' }
  | { version: 1; type: 'list' }
  | { version: 1; type: 'leave' }
  | TurnMessage;

/** One lockstep turn of Fusion Engine commands; the service relays it untouched. */
export interface TurnMessage { version: 1; type: 'turn'; turn: number; tick: number; checksum: number; commands: unknown[] }

export interface RoomPlayer { id: string; name: string; faction: Faction; ready: boolean; host: boolean }
export interface RoomState {
  version: 1; type: 'room'; room: string; host: string; phase: 'lobby' | 'started'; options: RoomOptions; players: RoomPlayer[];
  /** Set when the match starts: shared random seed and player ids in slot order. */
  seed?: number; slots?: string[];
}
export interface RoomSummary { room: string; hostName: string; style: GameStyle; map: string; players: number; maxPlayers: number; phase: 'lobby' | 'started' }

export interface MapInfo { id: string; name: string; theater: string; maxPlayers: number; description: string; ini: string; bin: string }
export interface ContentFile { name: string; bytes: number; sha256: string }
export interface ContentManifest { version: 1; id: string; engine: 'vanilla-td'; notice: string; source: string; maps: MapInfo[]; files: ContentFile[] }
export interface EngineSnapshot { frame: number; audioRunning?: boolean; camera?: number; mouseX?: number; mouseY?: number; selected?: number; credits?: number; harvested?: number; spent?: number; units?: number; buildings?: number; power?: number; drain?: number; lost?: number; won?: boolean; defeated?: boolean; entities?: { id: number; owner: number; cell: number; hp: number; name: string }[] }
export type ServerMessage = RoomState
  | { version: 1; type: 'welcome'; id: string; capabilities: string[]; gameplay: 'lobby-presence' }
  | { version: 1; type: 'rooms'; rooms: RoomSummary[] }
  | { version: 1; type: 'error'; message: string }
  | { version: 1; type: 'turn'; slot: number; turn: number; tick: number; checksum: number; commands: unknown[]; final?: boolean };
export type PlayerOrder = { version: 1; type: 'order'; sequence: number; tick: number; action: 'move' | 'attack' | 'harvest' | 'build' | 'train' | 'place'; entities: number[]; cell?: number; target?: number; item?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
const isFaction = (x: unknown): x is Faction => typeof x === 'string' && /^[a-z0-9-]{2,24}$/.test(x);
const isStyle = (x: unknown): x is GameStyle => STYLES.some(s => s.id === x);

export function parseSettings(value: unknown): MatchSettings {
  if (value === undefined || value === null) return { ...DEFAULT_SETTINGS };
  const v = object(value);
  const credits = ['low', 'standard', 'high'].includes(String(v.credits)) ? v.credits as CreditsPreset : 'standard';
  const techLevel = typeof v.techLevel === 'number' && Number.isInteger(v.techLevel) && v.techLevel >= 1 && v.techLevel <= 15 ? v.techLevel : 15;
  const ai = typeof v.ai === 'number' && Number.isInteger(v.ai) && v.ai >= 0 && v.ai <= 3 ? v.ai : DEFAULT_SETTINGS.ai;
  return { credits, techLevel, ai };
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
    return { version: 1, type: 'join', room: v.room, name: v.name.trim() || 'Commander', faction: v.faction };
  }
  if (v.type === 'configure') return { version: 1, type: 'configure', options: parseOptions(v.options) };
  if (v.type === 'faction' && isFaction(v.faction)) return { version: 1, type: 'faction', faction: v.faction };
  if (v.type === 'ready' && typeof v.ready === 'boolean') return { version: 1, type: 'ready', ready: v.ready };
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
  if (v.version !== 1 || v.engine !== 'vanilla-td' || typeof v.id !== 'string' || !Array.isArray(v.files) || v.files.length > 64) throw new Error('Invalid content manifest');
  const names = new Set<string>();
  let bytes = 0;
  for (const raw of v.files) {
    const f = object(raw);
    if (typeof f.name !== 'string' || !/^[A-Z0-9_-]+\.(MIX|INI|BIN)$/.test(f.name) || names.has(f.name)
      || typeof f.bytes !== 'number' || !Number.isSafeInteger(f.bytes) || f.bytes < 1
      || typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error('Invalid content file');
    names.add(f.name); bytes += f.bytes;
  }
  if (bytes > 96 * 1024 * 1024 || !names.has('CONQUER.MIX') || !names.has('COMRADE.INI') || !names.has('COMRADE.BIN')) throw new Error('Incomplete or oversized content pack');
  if (!Array.isArray(v.maps) || v.maps.length < 1 || v.maps.length > 32) throw new Error('Content pack is missing maps');
  const mapIds = new Set<string>();
  for (const raw of v.maps) {
    const m = object(raw);
    if (typeof m.id !== 'string' || !/^[a-z0-9-]{3,40}$/.test(m.id) || mapIds.has(m.id)
      || typeof m.name !== 'string' || typeof m.ini !== 'string' || typeof m.bin !== 'string'
      || !names.has(m.ini) || !names.has(m.bin)) throw new Error('Invalid map entry');
    mapIds.add(m.id);
  }
  return v as unknown as ContentManifest;
}
