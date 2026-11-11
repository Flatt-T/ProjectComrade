import { describe, expect, it, vi } from 'vitest';
import { RoomCoordinator } from '../../apps/service/src/rooms';

const OPTIONS = { style: 'td-fusion', map: 'canyon-clash', visibility: 'public', maxPlayers: 2, settings: { credits: 'standard', techLevel: 15 } };
const TURN = { version: 1, type: 'turn', tick: 15, checksum: 1, commands: [] };

function roomOf(log: string[]) {
  return JSON.parse([...log].reverse().find(m => JSON.parse(m).type === 'room')!);
}
function messages(log: string[], type: string) {
  return log.map(m => JSON.parse(m)).filter(m => m.type === type);
}
function turnOf(log: string[], slot: number, turn: number) {
  return messages(log, 'turn').find(m => m.slot === slot && m.turn === turn);
}

async function startedMatch() {
  const coordinator = new RoomCoordinator();
  const a: string[] = [], b: string[] = [];
  const first = coordinator.connect(x => a.push(x));
  const second = coordinator.connect(x => b.push(x));
  const join = (id: string, name: string) => coordinator.receive(id, JSON.stringify({ version: 1, type: 'join', room: 'rejoin-room', name, faction: 'gdi' }));
  join(first, 'First'); join(second, 'Second');
  coordinator.receive(first, JSON.stringify({ version: 1, type: 'configure', options: OPTIONS }));
  coordinator.receive(first, JSON.stringify({ version: 1, type: 'ready', ready: true }));
  coordinator.receive(second, JSON.stringify({ version: 1, type: 'ready', ready: true }));
  coordinator.receive(first, JSON.stringify({ version: 1, type: 'start' }));
  await vi.waitFor(() => expect(roomOf(b).phase).toBe('started'));
  return { coordinator, a, b, first, second };
}

describe('lockstep match resume', () => {
  it('holds a dropped commander\'s seat with synthetic turns and replays the buffer on resume', async () => {
    const { coordinator, a, b, first, second } = await startedMatch();
    const resumeToken = JSON.parse(a.find(m => JSON.parse(m).type === 'welcome')!).resumeToken;
    // Both commanders exchange turns; first is slot 0, second slot 1.
    coordinator.receive(first, JSON.stringify({ ...TURN, turn: 4 }));
    coordinator.receive(second, JSON.stringify({ ...TURN, turn: 4 }));
    coordinator.receive(first, JSON.stringify({ ...TURN, turn: 5 }));
    // First's socket dies mid-match: the seat is held, not surrendered.
    coordinator.connectionLost(first, coordinator.connectionVersion(first));
    expect(roomOf(b).players.find((p: { id: string }) => p.id === first)!.connected).toBe(false);
    // Second keeps playing; the relay fills first's turns with empty synthetics.
    coordinator.receive(second, JSON.stringify({ ...TURN, turn: 6 }));
    const synthetic = turnOf(b, 0, 6);
    expect(synthetic?.synthetic).toBe(true);
    expect(synthetic?.commands).toEqual([]);
    // First resumes inside the grace window: welcome names the held boundary and the
    // buffered turns are replayed so the client can catch up deterministically.
    const a2: string[] = [];
    const resumed = coordinator.connect(x => a2.push(x), undefined, resumeToken);
    expect(resumed).toBe(first);
    const welcome = JSON.parse(a2.find(m => JSON.parse(m).type === 'welcome')!);
    expect(welcome.resumed).toBe(true);
    expect(welcome.heldUntil).toBe(6);
    const replayed = messages(a2, 'turn');
    expect(replayed.length).toBeGreaterThanOrEqual(4);
    expect(replayed.some(m => m.slot === 1 && m.turn === 6)).toBe(true);
    // Once resumed, real turns flow again and no more synthetics are minted.
    coordinator.receive(first, JSON.stringify({ ...TURN, turn: 7 }));
    expect(turnOf(b, 0, 7)?.synthetic).toBeUndefined();
  });

  it('surrenders the seat only after the resume grace expires', async () => {
    const { coordinator, b, first, second } = await startedMatch();
    vi.useFakeTimers();
    try {
      coordinator.receive(first, JSON.stringify({ ...TURN, turn: 4 }));
      coordinator.connectionLost(first, coordinator.connectionVersion(first));
      coordinator.receive(second, JSON.stringify({ ...TURN, turn: 5 }));
      expect(turnOf(b, 0, 5)?.synthetic).toBe(true);
      vi.advanceTimersByTime(121_000);
      const final = messages(b, 'turn').filter(m => m.slot === 0 && m.final).at(-1);
      expect(final?.commands).toEqual([{ t: 'surrender' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still drops a non-lockstep match immediately', async () => {
    const coordinator = new RoomCoordinator();
    const a: string[] = [], b: string[] = [];
    const first = coordinator.connect(x => a.push(x));
    const second = coordinator.connect(x => b.push(x));
    const join = (id: string, name: string) => coordinator.receive(id, JSON.stringify({ version: 1, type: 'join', room: 'classic-room', name, faction: 'gdi' }));
    join(first, 'First'); join(second, 'Second');
    coordinator.receive(first, JSON.stringify({ version: 1, type: 'ready', ready: true }));
    coordinator.receive(second, JSON.stringify({ version: 1, type: 'ready', ready: true }));
    coordinator.receive(first, JSON.stringify({ version: 1, type: 'start' }));
    await vi.waitFor(() => expect(roomOf(b).phase).toBe('started'));
    coordinator.connectionLost(first, coordinator.connectionVersion(first));
    // Classic styles surrender the slot promptly: the peer is gone, not held.
    expect(messages(b, 'room').at(-1)!.players.find((p: { id: string }) => p.id === first)).toBeUndefined();
  });
});
