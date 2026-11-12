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
import { randomUUID } from 'node:crypto';
import type { Command, Game } from '@comrade/fusion';
import { PACKS, starterLoadout, toCell } from '@comrade/fusion';
import {
  PERSISTENT_RULES_V1, newProtection, parseProtectionRecord, protectionTransition,
  type MmoRulesProfile, type MmoWorldAction, type ProtectionRecord,
} from '@comrade/contracts';
import type { WorldActionHandler, WorldHandlerResult } from './runner.js';
import { MmoStoreError } from './store.js';
import {
  allianceCreate, allianceInvite, allianceJoin, allianceLeave, allianceKick,
  allianceSetPermissions, allianceDisband, setAutoRepair,
  availableShieldSeconds, committedShieldSeconds, armShieldRecord, clearShieldRecord,
  compoundForPlayer, createSettlement, getSettlement, scheduleJob,
  closeRecoveryEpisode, saveProtectionRecord,
  type ProtectionRow, type Queryable,
} from './store.js';
import { pickSpawnCell } from './spawn.js';

interface HandlerCtx {
  regionId: string; playerId: string; slot: number | undefined;
  slotOf: (playerId: string) => number | undefined;
  /** Live sim access for spawn placement and roster checks (read-only). */
  game?: () => Game | undefined;
  /** Resolve a durable entity id to a live sim id (bound assets, then the bridge). */
  simIdFor?: (durableId: string) => number | null;
  /** Fence epoch and sim tick for durable operation audit rows. */
  epoch?: string; tick?: number;
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
          await setAutoRepair(ctx.playerId, action.on, tx);
          const slot = ctx.slotOf(ctx.playerId);
          return {
            result: { accepted: true, on: action.on },
            sim: slot === undefined ? [] : [{ slot, command: { t: 'setAutoRepair', slot, on: action.on } }],
          };
        }
        case 'selectShield': {
          // PW10: explicit owner selection only — nothing activates here. The
          // armed record waits for the offline transition the region's
          // protection_eval job applies under the fence.
          const compound = await compoundForPlayer(action.compoundId, ctx.playerId);
          if (!compound || compound.state !== 'active' || compound.region_id !== ctx.regionId) {
            return { result: { accepted: false, reason: 'NO_COMPOUND' } };
          }
          const now = Date.now();
          const available = await availableShieldSeconds(tx, {
            playerId: ctx.playerId, nightlyGrantSeconds: rules.nightlyShieldSeconds, nowMs: now,
          });
          const committed = await committedShieldSeconds(ctx.playerId, now, tx);
          if (BigInt(action.seconds) > available - committed) {
            return { result: { accepted: false, reason: 'INSUFFICIENT_SHIELD' } };
          }
          await armShieldRecord(tx, { compoundId: action.compoundId, playerId: ctx.playerId, seconds: action.seconds, nowMs: now });
          await pokeProtectionEval(ctx.regionId, now, tx);
          return { result: { accepted: true, compoundId: action.compoundId, seconds: action.seconds } };
        }
        case 'settle': {
          // PW11 newcomer settlement: first world-entry creates the one-ever
          // settlement row (faction, spawn cell, starter grant, NEWCOMER
          // protection state) and joins the player into the sim. Repeated
          // settles are idempotent — they never duplicate assets or restart
          // the protection clock.
          const worldId = await worldIdFor(tx, ctx.regionId);
          const { rows: regionRows } = await tx.query<{ seed: unknown }>(
            'select seed from region where region_id = $1', [ctx.regionId]);
          const simSpec = (regionRows[0]?.seed as { sim?: { packId?: string; mapId?: string; seed?: number } } | null)?.sim;
          const packId = simSpec?.packId ?? 'td';
          const pack = PACKS[packId];
          if (!pack) return { result: { accepted: false, reason: 'BAD_PACK' } };
          const mapId = simSpec?.mapId ?? pack.maps[0].id;
          const preset = pack.maps.find(m => m.id === mapId) ?? pack.maps[0];
          const mapSeed = Number(simSpec?.seed ?? 0);

          const existing = await getSettlement(ctx.playerId, tx);
          const game = ctx.game?.();
          const inSim = ctx.slotOf(ctx.playerId) !== undefined
            || (game?.players.some(pl => pl.pid === ctx.playerId) ?? false);

          const { rows: nameRows } = await tx.query<{ display_name: string }>(
            'select display_name from player where player_id = $1', [ctx.playerId]);
          const displayName = nameRows[0]?.display_name ?? 'Commander';

          if (existing) {
            if (existing.region_id !== ctx.regionId) {
              return { result: { accepted: false, reason: 'SETTLED_ELSEWHERE', regionId: existing.region_id } };
            }
            if (inSim) return { result: { accepted: true, settled: true, alreadySettled: true } };
            // The durable settlement stands but the sim lost the player (region
            // rebuilt from an older spec): re-join at the recorded cell WITHOUT
            // re-granting the starter army — assets already granted stay gone
            // only if the snapshot lost them, and a second grant would dupe.
            let prot: ProtectionRecord | null = null;
            try { prot = existing.protection ? parseProtectionRecord(existing.protection) : null; } catch { prot = null; }
            const cell = existing.cell_y * preset.width + existing.cell_x;
            return {
              result: { accepted: true, settled: true, rejoin: true },
              sim: [{
                slot: -1,
                command: {
                  t: 'join',
                  player: {
                    name: displayName, faction: existing.faction, ai: false,
                    playerId: ctx.playerId, cell,
                    newcomerProtected: prot?.status === 'active',
                  },
                },
              }],
            };
          }

          const faction = pack.factions.find(f => f.id === action.faction);
          if (!faction) return { result: { accepted: false, reason: 'BAD_FACTION' } };

          // Keep-away cells: every live asset of every other player, so the
          // spawn lands the configured practical travel distance away.
          const keepAway: number[] = [];
          if (game) {
            for (const e of game.entities.values()) {
              if (e.hp <= 0 || e.owner < 0) continue;
              if (game.players[e.owner]?.pid === ctx.playerId) continue;
              keepAway.push(toCell(e.y) * preset.width + toCell(e.x));
            }
          }
          const preferCell = action.x >= 0 && action.y >= 0 && action.x < preset.width && action.y < preset.height
            ? action.y * preset.width + action.x : undefined;
          const pick = pickSpawnCell({
            packId, mapId, seed: mapSeed, keepAwayCells: keepAway,
            separationCells: rules.spawnSeparationCells, preferCell,
          });
          const loadout = starterLoadout(pack, faction);
          const credits = pack.startCredits.standard * rules.starterCreditsMultiplier;
          const settlementId = randomUUID();
          const nowMs = Date.now();
          const protection = newProtection('NEWCOMER', settlementId, ctx.playerId, nowMs, rules);
          const { settlement, created } = await createSettlement({
            settlementId, playerId: ctx.playerId, worldId, regionId: ctx.regionId,
            faction: faction.id, cellX: pick.x, cellY: pick.y, protection,
          }, tx);
          if (!created) {
            // A concurrent settle won the insert — behave exactly like the
            // already-settled path above.
            return { result: { accepted: true, settled: true, alreadySettled: true } };
          }
          // Durable audit: the settle command is the journaled cause; this row
          // records the grant for the asset ledger's NEWCOMER_SPAWN kind.
          if (ctx.epoch !== undefined) {
            await tx.query(
              `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
               values ($1,$2,$3,$4,'NEWCOMER_SPAWN',$5,$6)`,
              [randomUUID(), ctx.regionId, ctx.epoch, String(ctx.tick ?? 0),
               JSON.stringify({ kind: 'NEWCOMER_SPAWN', playerId: ctx.playerId, regionId: ctx.regionId, faction: faction.id, x: pick.x, y: pick.y }),
               JSON.stringify({ settlementId: settlement.settlement_id, cellX: pick.x, cellY: pick.y })]);
          }
          // Schedule the durable evaluator so the online-hour/lapse deadlines are
          // journaled even if no further pokes arrive (PW11).
          await pokeProtectionEval(ctx.regionId, nowMs, tx);
          return {
            result: {
              accepted: true, settled: true, settlementId: settlement.settlement_id,
              faction: faction.id, cellX: pick.x, cellY: pick.y, adjusted: pick.adjusted,
            },
            sim: [{
              slot: -1,
              command: {
                t: 'join',
                player: {
                  name: displayName, faction: faction.id, ai: false,
                  playerId: ctx.playerId, cell: pick.cell,
                  starter: { credits, units: loadout.units },
                  newcomerProtected: true,
                },
              },
            }],
          };
        }
        case 'sell': {
          // PW12: ordinary SELL_REFUND — remove the structure and credit its
          // owner exactly once. Bound assets (starter grant, recovery MCV/yard)
          // cannot be sold; the engine re-checks `bound` at apply time. There
          // is deliberately no attack lockout: selling under fire is the
          // approved escape-and-rebuild rule, and the recovery evaluator (not
          // this handler) decides whether the sale qualified for recovery.
          if (ctx.slot === undefined) return { result: { accepted: false, reason: 'UNKNOWN_PLAYER' } };
          const simId = ctx.simIdFor?.(action.entityId);
          const g = ctx.game?.();
          const e = simId != null ? g?.entities.get(simId) : undefined;
          if (simId == null || !g || !e || e.kind !== 'structure' || e.hp <= 0 || e.carriedBy
            || e.owner !== ctx.slot || e.bound !== 0) {
            return { result: { accepted: false, reason: 'NOT_SELLABLE' } };
          }
          const sdef = g.pack.structures[e.type];
          const refund = Math.floor((sdef.cost * g.pack.sellRefundPercent * e.hp) / (100 * e.maxHp));
          const { rows: compRows } = await tx.query<{ compound_id: string }>(
            `select compound_id from compound
              where player_id = $1 and region_id = $2 and state <> 'destroyed'
              order by created_at limit 1`, [ctx.playerId, ctx.regionId]);
          const compoundId = compRows[0]?.compound_id;
          const operationId = randomUUID();
          if (ctx.epoch !== undefined) {
            await tx.query(
              `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
               values ($1,$2,$3,$4,'SELL_REFUND',$5,$6)`,
              [operationId, ctx.regionId, ctx.epoch, String(ctx.tick ?? 0),
               JSON.stringify({
                 kind: 'SELL_REFUND', entityId: action.entityId,
                 ...(compoundId ? { compoundId } : {}),
               }),
               JSON.stringify({ refund, structure: e.type, simId })]);
            await tx.query(
              `insert into asset_ledger (operation_id, entity_id, region_id, kind, from_owner, to_owner, physical_state, engine_entity_key, detail)
               values ($1,$2,$3,'SELL_REFUND',$4,null,'destroyed',$5,$6)`,
              [operationId, action.entityId, ctx.regionId, ctx.playerId, String(simId),
               JSON.stringify({ refund, structure: e.type })]);
          }
          // A sale can be the qualifying last building — nudge the recovery
          // evaluator so the grant lands promptly after the sim applies.
          await scheduleJob({
            regionId: ctx.regionId, kind: 'recovery_eval', dueAtMs: Date.now(),
            dedupeKey: `rec_eval:${ctx.regionId}:sell:${operationId}`,
            payload: { reason: 'sell' },
          }, tx).catch(() => undefined);
          return {
            result: { accepted: true, sold: action.entityId, refund },
            sim: [{ slot: ctx.slot, command: { t: 'sell', id: simId } }],
          };
        }
        case 'endRecovery': {
          // PW12: the player's choice ends recovery early. The durable RECOVERY
          // record (keyed by episode id) is the authority; the sim mirror
          // drops the protection flags at the same journal boundary.
          if (ctx.slot === undefined) return { result: { accepted: false, reason: 'UNKNOWN_PLAYER' } };
          const { rows } = await tx.query<{
            episode_id: string; compound_id: string; player_id: string; kind: 'RECOVERY';
            status: 'active'; generation: string; armed_seconds: string;
            online_ms: string; online_since_ms: string | null; lapse_at_ms: string | null;
            started_at_ms: string | null; ends_at_ms: string | null;
            milestone_power: string; milestone_barracks: string;
          }>(
            `select re.episode_id, pr.compound_id, pr.player_id, pr.kind, pr.status, pr.generation::text,
                    pr.armed_seconds::text, pr.online_ms::text, pr.online_since_ms::text,
                    pr.lapse_at_ms::text, pr.started_at_ms::text, pr.ends_at_ms::text,
                    pr.milestone_power::text, pr.milestone_barracks::text
               from recovery_episode re
               join protection_record pr on pr.compound_id = re.episode_id and pr.kind = 'RECOVERY'
              where re.player_id = $1 and re.region_id = $2 and re.status = 'active' and pr.status = 'active'`,
            [ctx.playerId, ctx.regionId]);
          const row = rows[0];
          if (!row) return { result: { accepted: false, reason: 'NO_RECOVERY' } };
          const rec: ProtectionRecord = {
            kind: 'RECOVERY', status: 'active', compoundId: row.compound_id, ownerId: row.player_id,
            generation: row.generation, onlineMs: Number(row.online_ms),
            onlineSinceMs: row.online_since_ms !== null ? Number(row.online_since_ms) : null,
            lapseAtMs: row.lapse_at_ms !== null ? Number(row.lapse_at_ms) : null,
            armedSeconds: Number(row.armed_seconds),
            startedAtMs: row.started_at_ms !== null ? Number(row.started_at_ms) : null,
            endsAtMs: row.ends_at_ms !== null ? Number(row.ends_at_ms) : null,
            milestonePower: Number(row.milestone_power), milestoneBarracks: Number(row.milestone_barracks),
          };
          const nxt = protectionTransition(rec, { t: 'player_end_recovery', atMs: Date.now() }, rules);
          const record: ProtectionRow = {
            compound_id: row.compound_id, player_id: row.player_id, kind: 'RECOVERY',
            status: nxt.status, generation: String(nxt.generation), armed_seconds: String(nxt.armedSeconds),
            online_ms: String(nxt.onlineMs),
            online_since_ms: nxt.onlineSinceMs !== null ? String(nxt.onlineSinceMs) : null,
            lapse_at_ms: nxt.lapseAtMs !== null ? String(nxt.lapseAtMs) : null,
            started_at_ms: nxt.startedAtMs !== null ? String(nxt.startedAtMs) : null,
            ends_at_ms: nxt.endsAtMs !== null ? String(nxt.endsAtMs) : null,
            milestone_power: String(nxt.milestonePower), milestone_barracks: String(nxt.milestoneBarracks),
          };
          await saveProtectionRecord(tx, record);
          await closeRecoveryEpisode(row.episode_id, 'completed', tx);
          if (ctx.epoch !== undefined) {
            await tx.query(
              `insert into economy_operation (operation_id, region_id, authority_epoch, simulation_tick, kind, canonical_action, authoritative_result)
               values ($1,$2,$3,$4,'RECOVERY_TRANSITION',$5,$6)`,
              [randomUUID(), ctx.regionId, ctx.epoch, String(ctx.tick ?? 0),
               JSON.stringify({ kind: 'RECOVERY_TRANSITION', compoundId: row.compound_id, enter: false }),
               JSON.stringify({ episodeId: row.episode_id, reason: 'player_end_recovery' })]);
          }
          return {
            result: { accepted: true, ended: true, episodeId: row.episode_id },
            sim: [{ slot: ctx.slot, command: { t: 'setRecovery', slot: ctx.slot, on: false } }],
          };
        }
        case 'clearShield': {
          const cleared = await clearShieldRecord(tx, { compoundId: action.compoundId, playerId: ctx.playerId });
          if (!cleared) {
            const { rows } = await tx.query<{ status: string }>(
              `select status from protection_record
                where compound_id = $1 and player_id = $2 and kind = 'OFFLINE_EARNED'`,
              [action.compoundId, ctx.playerId]);
            const reason = rows[0]?.status === 'active' ? 'SHIELD_ACTIVE' : 'NO_SELECTION';
            return { result: { accepted: false, reason } };
          }
          await pokeProtectionEval(ctx.regionId, Date.now(), tx);
          return { result: { accepted: true, compoundId: action.compoundId } };
        }
        default:
          return { result: { accepted: false, reason: 'UNSUPPORTED_ACTION', action: action.t } };
      }
    } catch (error) {
      return fail(error);
    }
  };
}

/**
 * PW10: nudge the region's protection evaluator. Dedupe is bucketed to one poke
 * per region per 5 s; the eval itself is idempotent and reschedules its own chain
 * at real deadlines (shield expiry, battle-clear recheck).
 */
export async function pokeProtectionEval(regionId: string, nowMs: number, q?: Queryable): Promise<void> {
  await scheduleJob({
    regionId, kind: 'protection_eval', dueAtMs: nowMs,
    dedupeKey: `prot_eval:${regionId}:poke:${Math.floor(nowMs / 5000)}`,
    payload: { reason: 'poke' },
  }, q).catch(() => undefined);
}

/**
 * PW12: nudge the region's recovery evaluator — a returning player may need a
 * grant (evacuated while offline), a milestone check, or an attack-end. Same
 * 5 s bucket dedupe as the protection poke.
 */
export async function pokeRecoveryEval(regionId: string, nowMs: number, q?: Queryable): Promise<void> {
  await scheduleJob({
    regionId, kind: 'recovery_eval', dueAtMs: nowMs,
    dedupeKey: `rec_eval:${regionId}:poke:${Math.floor(nowMs / 5000)}`,
    payload: { reason: 'poke' },
  }, q).catch(() => undefined);
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
