import { describe, expect, it, vi } from 'vitest';
import { MAP_ID, parseLaunch, parseClientMessage, parseOrder, parseContentManifest, parseOptions } from '../../packages/contracts/src/index';
import { RoomCoordinator } from '../../apps/service/src/rooms';

describe('protocol contracts', () => {
  it('accepts supported launches and factions, rejects malformed ones', () => {
    expect(parseLaunch({ version: 1, type: 'launch', map: MAP_ID, faction: 'nod', style: 'td-classic' }).faction).toBe('nod');
    expect(() => parseLaunch({ version: 1, type: 'launch', map: MAP_ID, faction: 'gdi', style: 'made-up' })).toThrow();
    expect(() => parseLaunch({ version: 1, type: 'launch', map: 'x', faction: 'gdi', style: 'td-classic' })).toThrow();
    expect(() => parseClientMessage({ version: 9, type: 'leave' })).toThrow();
    expect(parseClientMessage({ version: 1, type: 'recheck' }).type).toBe('recheck');
    expect(() => parseClientMessage({ version: 1, type: 'join', room: '../root', name: 'Test', faction: 'gdi' })).toThrow();
  });
  it('validates room options and clamps player counts', () => {
    const options = parseOptions({ style: 'td-classic', map: 'canyon-clash', visibility: 'invite', maxPlayers: 9, settings: { credits: 'high', techLevel: 6 } });
    expect(options.maxPlayers).toBe(2);
    expect(options.visibility).toBe('invite');
    expect(options.settings.credits).toBe('high');
    expect(() => parseOptions({ style: 'nope', map: 'canyon-clash', visibility: 'public', maxPlayers: 2 })).toThrow();
  });
  it('bounds commands and requires action-specific targets', () => {
    const order = { version: 1, type: 'order', sequence: 1, tick: 12, action: 'move', entities: [1,2], cell: 400 };
    expect(parseOrder(order).cell).toBe(400);
    for (const change of [{ cell: -1 }, { entities: [1,1] }, { action: 'attack' }, { tick: 2.5 }, { item: '<script>' }]) expect(() => parseOrder({ ...order, ...change })).toThrow();
  });
  it('rejects content traversal, duplicate entries, missing maps and oversized downloads', () => {
    const files = ['CONQUER.MIX','COMRADE.INI','COMRADE.BIN'].map(name => ({ name, bytes: 8, sha256: 'a'.repeat(64) }));
    const maps = [{ id: 'tiberium-crossing', name: 'Tiberium Crossing', theater: 'TEMPERATE', maxPlayers: 2, description: 'd', ini: 'COMRADE.INI', bin: 'COMRADE.BIN' }];
    const pack = { version: 1, id: 'test', engine: 'vanilla-td', maps, files };
    expect(parseContentManifest(pack).maps).toHaveLength(1);
    expect(() => parseContentManifest({ ...pack, maps: [] })).toThrow();
    expect(() => parseContentManifest({ ...pack, maps: [{ ...maps[0], ini: 'MISSING.INI' }] })).toThrow();
    expect(() => parseContentManifest({ ...pack, files: [...files,files[0]] })).toThrow();
    expect(() => parseContentManifest({ ...pack, files: [{ ...files[0], name: '../CONQUER.MIX' }] })).toThrow();
    expect(() => parseContentManifest({ ...pack, files: files.map(f => ({ ...f, bytes: 100000000 })) })).toThrow();
  });
});
describe('room coordinator', () => {
  it('assigns identities, transfers host on disconnect and starts when others are ready', async () => {
    const coordinator = new RoomCoordinator(); const a: string[] = []; const b: string[] = [];
    const first = coordinator.connect(x => a.push(x)); const second = coordinator.connect(x => b.push(x));
    const join = (id: string, name: string) => coordinator.receive(id, JSON.stringify({ version: 1, type: 'join', room: 'test-room', name, faction: 'gdi' }));
    join(first,'First'); join(second,'Second');
    const roomOf = (log: string[]) => JSON.parse([...log].reverse().find(m => JSON.parse(m).type === 'room')!);
    expect(roomOf(b).players[0].host).toBe(true);
    coordinator.receive(second, JSON.stringify({ version: 1, type: 'ready', ready: true }));
    expect(roomOf(b).players[1].ready).toBe(true);
    coordinator.disconnect(first);
    expect(roomOf(b).host).toBe(second);
    expect(roomOf(b).players[0].ready).toBe(false);
    // Second is now the sole host; with no other members, start succeeds. Starting checks
    // every commander's weekly allowance first, so the transition is asynchronous.
    coordinator.receive(second, JSON.stringify({ version: 1, type: 'start' }));
    await vi.waitFor(() => expect(roomOf(b).phase).toBe('started'));
  });
  it('lets only the host configure the match', () => {
    const coordinator = new RoomCoordinator(); const a: string[] = []; const b: string[] = [];
    const host = coordinator.connect(x => a.push(x)); const guest = coordinator.connect(x => b.push(x));
    const join = (id: string) => coordinator.receive(id, JSON.stringify({ version: 1, type: 'join', room: 'cfg-room', name: 'C', faction: 'gdi' }));
    join(host); join(guest);
    coordinator.receive(host, JSON.stringify({ version: 1, type: 'configure', options: { style: 'td-classic', map: 'canyon-clash', visibility: 'public', maxPlayers: 4, settings: { credits: 'high', techLevel: 15 } } }));
    const roomOf = (log: string[]) => JSON.parse([...log].reverse().find(m => JSON.parse(m).type === 'room')!);
    expect(roomOf(a).options.map).toBe('canyon-clash');
    coordinator.receive(guest, JSON.stringify({ version: 1, type: 'configure', options: { style: 'td-classic', map: 'tiberium-isles', visibility: 'public', maxPlayers: 2, settings: { credits: 'low', techLevel: 3 } } }));
    expect(JSON.parse(b.at(-1)!).message).toContain('host');
  });
});
