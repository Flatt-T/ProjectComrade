import { closeMmoDatabase } from '../../../apps/service/src/mmo/db.js';
import { RegionRunner } from '../../../apps/service/src/mmo/runner.js';
import { createWorldHandler } from '../../../apps/service/src/mmo/world.js';

type Game = NonNullable<RegionRunner['currentGame']>;

export type WorkerRequest =
  | { type: 'start' | 'poll' | 'checkpoint' | 'stop' }
  | { type: 'advance'; tick: number }
  | { type: 'observeTransfer'; transferId: string };

const [regionId, workerId, wallTime] = process.argv.slice(2);
const runner = new RegionRunner({
  regionId, workerId, leaseMs: 30_000, tickMs: 60_000, pollMs: 60_000,
  now: () => Number(wallTime),
  quiescence: { enabled: false },
  worldHandler: createWorldHandler(),
});
const clock = runner as unknown as { advanceTo(tick: number): Promise<void>; onPoll(): Promise<void> };

function rawTransfer(game: Game, id: number) {
  const entity = game.entities.get(id);
  if (!entity) throw new Error('The transfer is missing a bound entity');
  return {
    id: entity.id, durableId: entity.durableId, type: entity.type, owner: entity.owner,
    x: entity.x, y: entity.y, facing: entity.facing, hp: entity.hp, order: entity.order,
    path: entity.path, goal: entity.goal, carriedBy: entity.carriedBy,
  };
}

function observe(transferId?: string) {
  const game = runner.currentGame!;
  const unit = [...game.entities.values()].find(e => e.kind === 'unit' && e.owner === 0 && e.hp > 0);
  if (!unit) throw new Error('The fixture has no live unit');
  const carrier = transferId && [...game.entities.values()].find(entity => entity.durableId === transferId);
  const transfer = carrier ? {
    carrier: rawTransfer(game, carrier.id),
    cargo: carrier.passengers.map(id => rawTransfer(game, id)),
  } : undefined;
  return {
    pid: process.pid, epoch: runner.authorityEpoch!, seq: runner.appliedSeq,
    tick: game.tick, checksum: game.checksum(), credits: game.players.map(p => p.credits), transfer,
    unit: { id: unit.id, x: unit.x, y: unit.y, order: unit.order, facing: unit.facing, hp: unit.hp },
  };
}
export type WorkerState = ReturnType<typeof observe>;

process.on('message', async (request: WorkerRequest) => {
  try {
    switch (request.type) {
      case 'start': await runner.start(); break;
      case 'poll': await clock.onPoll(); break;
      case 'advance': await clock.advanceTo(request.tick); break;
      case 'observeTransfer': break;
      case 'checkpoint': await runner.checkpoint('manual'); break;
      case 'stop':
        await runner.stop();
        await closeMmoDatabase();
        break;
    }
    process.send?.({ state: observe(request.type === 'observeTransfer' ? request.transferId : undefined) });
    if (request.type === 'stop') process.disconnect?.();
  } catch (error) {
    process.send?.({ error: error instanceof Error ? error.message : String(error) });
  }
});
