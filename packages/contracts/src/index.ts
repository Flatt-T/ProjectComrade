export const PROTOCOL_VERSION = 1 as const;
export const MAP_ID = 'tiberium-crossing' as const;
export type Faction = 'gdi' | 'nod';

// Game styles the platform can offer. Only playable styles boot an engine today;
// the rest are declared so the lobby can present the full roster and gate launches.
export type GameStyle = 'td-classic' | 'ra1' | 'ra2' | 'dune2k';
export interface StyleInfo { id: GameStyle; name: string; engine: 'vanilla-td' | 'vanilla-ra' | 'none'; playable: boolean; blurb: string }
export const STYLES: StyleInfo[] = [
  { id: 'td-classic', name: 'Classic C&C', engine: 'vanilla-td', playable: true, blurb: 'Tiberian Dawn. GDI versus the Brotherhood of Nod.' },
  { id: 'ra1', name: 'Red Alert', engine: 'vanilla-ra', playable: false, blurb: 'Allies versus Soviets. Engine built; content pack pending.' },
  { id: 'ra2', name: 'Red Alert 2', engine: 'none', playable: false, blurb: 'Planned. Requires a separate gated engine.' },
  { id: 'dune2k', name: 'Dune Style', engine: 'none', playable: false, blurb: 'Planned. Atreides, Harkonnen and Ordos.' },
];

export type Visibility = 'public' | 'invite';
export type CreditsPreset = 'low' | 'standard' | 'high';
export interface MatchSettings { credits: CreditsPreset; techLevel: number }
export const DEFAULT_SETTINGS: MatchSettings = { credits: 'standard', techLevel: 15 };
export const CREDITS_VALUES: Record<CreditsPreset, number> = { low: 30, standard: 60, high: 120 };

export interface RoomOptions { style: GameStyle; map: string; visibility: Visibility; maxPlayers: number; settings: MatchSettings }
export const DEFAULT_OPTIONS: RoomOptions = { style: 'td-classic', map: MAP_ID, visibility: 'public', maxPlayers: 2, settings: DEFAULT_SETTINGS };

export type LaunchRequest = { version: 1; type: 'launch'; map: string; faction: Faction; style: GameStyle; settings: MatchSettings };

export type ClientMessage =
  | { version: 1; type: 'join'; room: string; name: string; faction: Faction }
  | { version: 1; type: 'configure'; options: RoomOptions }
  | { version: 1; type: 'faction'; faction: Faction }
  | { version: 1; type: 'ready'; ready: boolean }
  | { version: 1; type: 'start' }
  | { version: 1; type: 'list' }
  | { version: 1; type: 'leave' };

export interface RoomPlayer { id: string; name: string; faction: Faction; ready: boolean; host: boolean }
export interface RoomState { version: 1; type: 'room'; room: string; host: string; phase: 'lobby' | 'started'; options: RoomOptions; players: RoomPlayer[] }
export interface RoomSummary { room: string; hostName: string; style: GameStyle; map: string; players: number; maxPlayers: number; phase: 'lobby' | 'started' }

export interface MapInfo { id: string; name: string; theater: string; maxPlayers: number; description: string; ini: string; bin: string }
export interface ContentFile { name: string; bytes: number; sha256: string }
export interface ContentManifest { version: 1; id: string; engine: 'vanilla-td'; notice: string; source: string; maps: MapInfo[]; files: ContentFile[] }
export interface EngineSnapshot { frame: number; audioRunning?: boolean; camera?: number; mouseX?: number; mouseY?: number; selected?: number; credits?: number; harvested?: number; spent?: number; units?: number; buildings?: number; power?: number; drain?: number; lost?: number; won?: boolean; defeated?: boolean; entities?: { id: number; owner: number; cell: number; hp: number; name: string }[] }
export type ServerMessage = RoomState
  | { version: 1; type: 'welcome'; id: string; capabilities: string[]; gameplay: 'lobby-presence' }
  | { version: 1; type: 'rooms'; rooms: RoomSummary[] }
  | { version: 1; type: 'error'; message: string };
export type PlayerOrder = { version: 1; type: 'order'; sequence: number; tick: number; action: 'move' | 'attack' | 'harvest' | 'build' | 'train' | 'place'; entities: number[]; cell?: number; target?: number; item?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
const isFaction = (x: unknown): x is Faction => x === 'gdi' || x === 'nod';
const isStyle = (x: unknown): x is GameStyle => STYLES.some(s => s.id === x);

export function parseSettings(value: unknown): MatchSettings {
  if (value === undefined || value === null) return { ...DEFAULT_SETTINGS };
  const v = object(value);
  const credits = ['low', 'standard', 'high'].includes(String(v.credits)) ? v.credits as CreditsPreset : 'standard';
  const techLevel = typeof v.techLevel === 'number' && Number.isInteger(v.techLevel) && v.techLevel >= 1 && v.techLevel <= 15 ? v.techLevel : 15;
  return { credits, techLevel };
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
  if (v.version !== 1 || v.type !== 'launch' || typeof v.map !== 'string' || !/^[a-z0-9-]{3,40}$/.test(v.map) || !isFaction(v.faction) || !isStyle(v.style)) throw new Error('Invalid launch contract');
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
