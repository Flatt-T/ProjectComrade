export const PROTOCOL_VERSION = 1 as const;
export const MAP_ID = 'tiberium-crossing' as const;
export type Faction = 'gdi' | 'nod';
export type LaunchRequest = { version: 1; type: 'launch'; map: typeof MAP_ID; faction: Faction };
export type ClientMessage =
  | { version: 1; type: 'join'; room: string; name: string; faction: Faction }
  | { version: 1; type: 'ready'; ready: boolean }
  | { version: 1; type: 'start' }
  | { version: 1; type: 'leave' };
export interface RoomPlayer { id: string; name: string; faction: Faction; ready: boolean }
export interface RoomState { version: 1; type: 'room'; room: string; host: string; phase: 'lobby' | 'started'; map: typeof MAP_ID; players: RoomPlayer[] }
export interface ContentFile { name: string; bytes: number; sha256: string }
export interface ContentManifest { version: 1; id: string; engine: 'vanilla-td'; notice: string; source: string; files: ContentFile[] }
export interface EngineSnapshot { frame: number; audioRunning?: boolean; camera?: number; mouseX?: number; mouseY?: number; selected?: number; credits?: number; harvested?: number; spent?: number; units?: number; buildings?: number; power?: number; drain?: number; lost?: number; won?: boolean; defeated?: boolean; entities?: { id: number; owner: number; cell: number; hp: number; name: string }[] }
export type ServerMessage = RoomState
  | { version: 1; type: 'welcome'; id: string; capabilities: ['rooms']; gameplay: 'single-player' }
  | { version: 1; type: 'error'; message: string };
export type PlayerOrder = { version: 1; type: 'order'; sequence: number; tick: number; action: 'move' | 'attack' | 'harvest' | 'build' | 'train' | 'place'; entities: number[]; cell?: number; target?: number; item?: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, unknown>;
}
export function parseLaunch(value: unknown): LaunchRequest {
  const v = object(value);
  if (v.version !== 1 || v.type !== 'launch' || v.map !== MAP_ID || !['gdi', 'nod'].includes(String(v.faction))) throw new Error('Invalid launch contract');
  return { version: 1, type: 'launch', map: MAP_ID, faction: v.faction as Faction };
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
    && typeof v.name === 'string' && /^[\p{L}\p{N} _-]{1,24}$/u.test(v.name) && ['gdi','nod'].includes(String(v.faction))) {
    return { version: 1, type: 'join', room: v.room, name: v.name.trim() || 'Commander', faction: v.faction as Faction };
  }
  if (v.type === 'ready' && typeof v.ready === 'boolean') return { version: 1, type: 'ready', ready: v.ready };
  if (v.type === 'start' || v.type === 'leave') return { version: 1, type: v.type };
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
  if (bytes > 64 * 1024 * 1024 || !names.has('CONQUER.MIX') || !names.has('COMRADE.INI') || !names.has('COMRADE.BIN')) throw new Error('Incomplete or oversized content pack');
  return v as unknown as ContentManifest;
}
