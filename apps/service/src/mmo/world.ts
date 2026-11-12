// World action handler (PW09): executes persistent-world intents inside the
// journal application transaction. Alliance membership, explicit permissions and
// the caretaker auto-repair flag are durable PostgreSQL state; every change that
// the region sim must mirror is returned as an engine command so it applies at
// the same journal boundary and fans out to subscribers on mmo.sim.
//
// Permission model (COMRADE 18): membership alone grants nothing. Stationing,
// reinforcement, trade and unit ownership each require an explicit per-member
// grant; the leader holds all four implicitly. Construction is never grantable —
// there is no permission key for it. Reinforcements keep the sender's ownership
// until an accepted trade (PW13) transfers them.
import type { PoolClient } from 'pg';
import type { Command } from '@comrade/fusion';
import { PERSISTENT_RULES_V1, type MmoRulesProfile, type MmoWorldAction } from '@comrade/contracts';
import type { WorldActionHandler, WorldHandlerResult } from './runner.js';
import { MmoStoreError } from './store.js';
import {
  allianceCreate, allianceInvite, allianceJoin, allianceLeave, allianceKick,
  allianceSetPermissions, allianceDisband, setAutoRepair,
} from './store.js';

interface HandlerCtx {
  regionId: string; playerId: string; slot: number;
  slotOf: (playerId: string) => number | undefined;
}

async function worldIdFor(tx: PoolClient, regionId: string): Promise<string> {
  const { rows } = await tx.query<{ world_id: string }>(
    'select world_id from region where region_id = $1', [regionId]);
  if (!rows[0]) throw new MmoStoreError('NO_REGION', 'region not found');
  return rows[0].world_id;
}

/**
 * Emit setAlly for every listed player present in this region, reflecting their
 * CURRENT durable alliance membership (post-mutation). setAlly is idempotent, so
 * resyncing unaffected members is harmless.
 */
async function allySyncSim(
  tx: PoolClient, ctx: HandlerCtx, playerIds: string[],
): Promise<{ slot: number; command: Command }[]> {
  const present = [...new Set(playerIds)].filter(pid => ctx.slotOf(pid) !== undefined);
  if (!present.length) return [];
  const { rows } = await tx.query<{ player_id: string; ally_key: string }>(
    `select m.player_id, a.ally_key::text
       from alliance_member m join alliance a on a.alliance_id = m.alliance_id
      where m.player_id = any($1) and m.left_at is null and a.disbanded_at is null`, [present]);
  const keyByPlayer = new Map(rows.map(r => [r.player_id, Number(r.ally_key)]));
  const out: { slot: number; command: Command }[] = [];
  for (const pid of present) {
    const slot = ctx.slotOf(pid)!;
    out.push({ slot, command: { t: 'setAlly', slot, ally: keyByPlayer.get(pid) ?? -1 } });
  }
  return out;
}

function fail(error: unknown): WorldHandlerResult {
  if (error instanceof MmoStoreError) return { result: { accepted: false, reason: error.code } };
  throw error;
}

/**
 * The default persistent-world action handler. Actions owned by later issues
 * (protection, barter, sites, chat fan-out) report UNSUPPORTED until their
 * milestone lands — they stay journaled intents, never silently applied.
 */
export function createWorldHandler(rules: MmoRulesProfile = PERSISTENT_RULES_V1): WorldActionHandler {
  return async (tx: PoolClient, action: MmoWorldAction, ctx: HandlerCtx): Promise<WorldHandlerResult> => {
    try {
      switch (action.t) {
        case 'allianceCreate': {
          const worldId = await worldIdFor(tx, ctx.regionId);
          const alliance = await allianceCreate(tx, { worldId, name: action.name, leaderId: ctx.playerId });
          return {
            result: { accepted: true, allianceId: alliance.alliance_id, name: alliance.name, allyKey: Number(alliance.ally_key) },
            sim: await allySyncSim(tx, ctx, [ctx.playerId]),
          };
        }
        case 'allianceInvite': {
          await allianceInvite(tx, { allianceId: action.allianceId, playerId: action.playerId, invitedBy: ctx.playerId });
          return { result: { accepted: true } };
        }
        case 'allianceJoin': {
          await allianceJoin(tx, { allianceId: action.allianceId, playerId: ctx.playerId, maxMembers: rules.allianceMaxMembers });
          return {
            result: { accepted: true, allianceId: action.allianceId },
            sim: await allySyncSim(tx, ctx, [ctx.playerId]),
          };
        }
        case 'allianceLeave': {
          // Capture former members before the delete so the departed player (and
          // only they — keys of remaining members are unchanged) resyncs to -1.
          const { rows } = await tx.query<{ player_id: string }>(
            `select m.player_id from alliance_member m
               join alliance a on a.alliance_id = m.alliance_id
              where a.world_id = (select world_id from region where region_id = $1)
                and a.disbanded_at is null and m.left_at is null and m.player_id = $2`,
            [ctx.regionId, ctx.playerId]);
          const left = await allianceLeave(tx, ctx.playerId);
          if (!left) return { result: { accepted: false, reason: 'NOT_IN_ALLIANCE' } };
          return {
            result: { accepted: true, allianceId: left.allianceId },
            sim: await allySyncSim(tx, ctx, rows.map(r => r.player_id)),
          };
        }
        case 'allianceKick': {
          await allianceKick(tx, { allianceId: await allianceIdOf(tx, ctx), leaderId: ctx.playerId, targetId: action.playerId });
          return {
            result: { accepted: true },
            sim: await allySyncSim(tx, ctx, [action.playerId]),
          };
        }
        case 'allianceSetPermissions': {
          await allianceSetPermissions(tx, {
            allianceId: await allianceIdOf(tx, ctx), leaderId: ctx.playerId,
            targetId: action.playerId, permissions: { ...action.permissions },
          });
          return { result: { accepted: true } };
        }
        case 'allianceDisband': {
          const allianceId = await allianceIdOf(tx, ctx);
          const { rows } = await tx.query<{ player_id: string }>(
            'select player_id from alliance_member where alliance_id = $1 and left_at is null', [allianceId]);
          await allianceDisband(tx, { allianceId, leaderId: ctx.playerId });
          return {
            result: { accepted: true },
            sim: await allySyncSim(tx, ctx, rows.map(r => r.player_id)),
          };
        }
        case 'setAutoRepair': {
          await setAutoRepair(ctx.playerId, action.on);
          const slot = ctx.slotOf(ctx.playerId);
          return {
            result: { accepted: true, on: action.on },
            sim: slot === undefined ? [] : [{ slot, command: { t: 'setAutoRepair', slot, on: action.on } }],
          };
        }
        default:
          return { result: { accepted: false, reason: 'UNSUPPORTED_ACTION', action: action.t } };
      }
    } catch (error) {
      return fail(error);
    }
  };
}

async function allianceIdOf(tx: PoolClient, ctx: HandlerCtx): Promise<string> {
  const { rows } = await tx.query<{ alliance_id: string }>(
    `select m.alliance_id from alliance_member m
       join alliance a on a.alliance_id = m.alliance_id
       join region r on r.world_id = a.world_id
      where r.region_id = $1 and a.disbanded_at is null and m.left_at is null and m.player_id = $2`,
    [ctx.regionId, ctx.playerId]);
  if (!rows[0]) throw new MmoStoreError('NOT_IN_ALLIANCE', 'player belongs to no alliance in this world');
  return rows[0].alliance_id;
}
