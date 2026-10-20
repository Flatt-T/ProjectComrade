import { describe, expect, it } from 'vitest';
import { MAP_ID, parseLaunch, parseClientMessage, parseOrder, parseContentManifest } from '../../packages/contracts/src/index';
import { RoomCoordinator } from '../../apps/service/src/rooms';

describe('protocol contracts', () => {
  it('accepts only the supported map and factions', () => {
    expect(parseLaunch({ version: 1, type: 'launch', map: MAP_ID, faction: 'nod' }).faction).toBe('nod');
    expect(() => parseLaunch({ version: 1, type: 'launch', map: 'elsewhere', faction: 'gdi' })).toThrow();
    expect(() => parseClientMessage({ version: 9, type: 'leave' })).toThrow();
    expect(() => parseClientMessage({ version: 1, type: 'join', room: '../root', name: 'Test', faction: 'gdi' })).toThrow();
  });
  it('bounds commands and requires action-specific targets', () => {
    const order = { version: 1, type: 'order', sequence: 1, tick: 12, action: 'move', entities: [1,2], cell: 400 };
    expect(parseOrder(order).cell).toBe(400);
    for (const change of [{ cell: -1 }, { entities: [1,1] }, { action: 'attack' }, { tick: 2.5 }, { item: '<script>' }]) expect(() => parseOrder({ ...order, ...change })).toThrow();
  });
  it('rejects content traversal, duplicate entries and oversized downloads', () => {
    const files = ['CONQUER.MIX','COMRADE.INI','COMRADE.BIN'].map(name => ({ name, bytes: 8, sha256: 'a'.repeat(64) }));
    const pack = { version: 1, id: 'test', engine: 'vanilla-td', files };
    expect(parseContentManifest(pack).files).toHaveLength(3);
    expect(() => parseContentManifest({ ...pack, files: [...files,files[0]] })).toThrow();
    expect(() => parseContentManifest({ ...pack, files: [{ ...files[0], name: '../CONQUER.MIX' }] })).toThrow();
    expect(() => parseContentManifest({ ...pack, files: files.map(f => ({ ...f, bytes: 100000000 })) })).toThrow();
  });
});
describe('room coordinator', () => {
  it('assigns server identities, updates ready state and transfers host on disconnect', () => {
    const coordinator = new RoomCoordinator(); const a: string[] = []; const b: string[] = [];
    const first = coordinator.connect(x => a.push(x)); const second = coordinator.connect(x => b.push(x));
    const join = (id: string, name: string) => coordinator.receive(id, JSON.stringify({ version: 1, type: 'join', room: 'test-room', name, faction: 'gdi' }));
    join(first,'First'); join(second,'Second');
    coordinator.receive(second, JSON.stringify({ version: 1, type: 'ready', ready: true }));
    expect(JSON.parse(b.at(-1)!).players[1].ready).toBe(true);
    coordinator.disconnect(first);
    expect(JSON.parse(b.at(-1)!).host).toBe(second);
    expect(JSON.parse(b.at(-1)!).players[0].ready).toBe(false);
    coordinator.receive(second, JSON.stringify({ version: 1, type: 'start' }));
    expect(JSON.parse(b.at(-1)!).message).toContain('not enabled');
  });
});
