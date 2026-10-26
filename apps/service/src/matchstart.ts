// Starting a match: check every commander's allowance, spend it, open the match record and
// resolve each player's advertisement.
//
// This is the single place a play is spent, because a match can only begin in a room. Either
// everyone who is entering is entitled and every allowance is spent together, or nothing is
// spent at all and the room stays in the lobby — a half-charged room is not a state worth
// having.
//
// A player on an advertising tier is handed a VAST waterfall to play. Their simulation still
// starts on the first tick with their input locked, so their turns keep flowing and nobody
// else's lockstep waits on them; they simply arrive with thirty seconds already gone.
import { randomBytes } from 'node:crypto';
import { AdBreak, PlayKind, Tier, plan, playKind } from '@comrade/contracts';
import { consentFor } from './accounts.js';
import { adBreak } from './ads.js';
import { platformEnabled } from './config.js';
import { attachMatch, quotaFor, spendPlay, type Subject } from './entitlements.js';
import { createMatch, type NewParticipant } from './history.js';
import { log } from './ops.js';
import { lockFor } from './releases.js';

export interface StartingPlayer {
  peerId: string;
  slot: number;
  name: string;
  faction: string;
  team: number;
  accountId?: string;
  guestId?: string;
  tier: Tier;
  /** Start of this player's weekly window, resolved when their peer identified. */
  anchor: Date;
}

export interface StartingAi { slot: number; name: string; faction: string; team: number }

export interface MatchBrief {
  style: string;
  map: string;
  mapName: string;
  room: string;
  multiplayer: boolean;
  players: StartingPlayer[];
  ai: StartingAi[];
}

export interface PlayerStart { reportToken: string; ad?: AdBreak }

export interface StartOutcome {
  matchId?: string;
  /** Per-peer kick-off details, keyed by peer id. */
  starts: Map<string, PlayerStart>;
  /** Players who may not enter, with the reason to show them. */
  refusals: { peerId: string; name: string; message: string }[];
}

function subjectOf(player: StartingPlayer): Subject {
  return player.accountId ? { accountId: player.accountId } : { guestId: player.guestId! };
}

/** Check everyone, then spend everything. Returns what each client needs to kick off. */
export async function beginMatch(brief: MatchBrief): Promise<StartOutcome> {
  const starts = new Map<string, PlayerStart>();
  const token = () => randomBytes(24).toString('base64url');

  if (!platformEnabled()) {
    // No database: open play, exactly as before billing existed.
    for (const player of brief.players) starts.set(player.peerId, { reportToken: token() });
    return { starts, refusals: [] };
  }

  const kind: PlayKind = playKind(brief.style as Parameters<typeof playKind>[0]);
  const refusals: StartOutcome['refusals'] = [];

  // 1. Nobody is charged until everyone entering has been checked.
  const checks = await Promise.all(brief.players.map(async player => {
    const subject = subjectOf(player);
    const quota = await quotaFor(subject, kind, player.tier, player.anchor);
    const lock = await lockFor(brief.map, player.tier);
    return { player, subject, quota, lock };
  }));

  for (const { player, quota, lock } of checks) {
    if (lock.locked) {
      const opens = lock.opensAt ? new Date(lock.opensAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : 'soon';
      refusals.push({ peerId: player.peerId, name: player.name, message: `${player.name}: that battlefield is in Gold early access until ${opens}` });
      continue;
    }
    if (quota.remaining !== null && quota.remaining <= 0) {
      const what = kind === 'fusion' ? 'Fusion' : 'Classic';
      refusals.push({
        peerId: player.peerId,
        name: player.name,
        message: `${player.name} has no ${what} matches left — watch an advertisement or buy a battle pack`,
      });
    }
  }
  if (refusals.length) return { starts, refusals };

  // 2. Open the match record, so every result has somewhere to land.
  const participants: NewParticipant[] = brief.players.map(player => ({
    slot: player.slot,
    accountId: player.accountId,
    name: player.name,
    faction: player.faction,
    team: player.team,
    ai: false,
    reportToken: token(),
  }));
  for (const bot of brief.ai) {
    participants.push({ slot: bot.slot, name: bot.name, faction: bot.faction, team: bot.team, ai: true });
  }

  let matchId: string | undefined;
  try {
    matchId = await createMatch({
      style: brief.style, map: brief.map, mapName: brief.mapName, room: brief.room,
      multiplayer: brief.multiplayer, participants,
    });
  } catch (error) {
    // History is not worth blocking a match for; play on and record nothing.
    log('match-record-failed', { message: String(error).slice(0, 200) });
  }

  // 3. Spend the allowances and resolve each player's advertisement.
  for (const { player, subject, quota } of checks) {
    const reportToken = participants.find(p => p.slot === player.slot)?.reportToken ?? token();
    if (quota.limit !== null) {
      try {
        const ledgerId = await spendPlay({
          subject, kind, tier: player.tier, anchor: player.anchor,
          style: brief.style, map: brief.map, room: brief.room, matchId,
        });
        if (matchId) await attachMatch(ledgerId, matchId);
      } catch (error) {
        log('play-spend-failed', { message: String(error).slice(0, 160) });
      }
    }
    const shows = plan(player.tier).ads;
    const personalised = shows && player.accountId ? (await consentFor(player.accountId)).personalisedAds : false;
    starts.set(player.peerId, { reportToken, ad: shows ? adBreak(personalised) : undefined });
  }

  log('match-begun', {
    style: brief.style, map: brief.map, humans: brief.players.length, ai: brief.ai.length,
    ads: [...starts.values()].filter(s => s.ad).length,
  });
  return { matchId, starts, refusals: [] };
}
