// Match history: what was played, how it ended, and a player's record against their rivals.
//
// The match itself is created by the service when the host starts it, so the style, map and
// line-up are authoritative. Each player then reports their own final figures, and the score
// is computed here from those figures rather than accepted as a number — one formula, one
// place, the same for everyone.
import { GameStyle, HeadToHead, HistoryPage, MatchOutcome, MatchParticipant, MatchRecord, PlayerRecord, PlayerStats } from '@comrade/contracts';
import { one, query, transaction } from './db.js';
import { badRequest, forbidden, notFound } from './http.js';

const OUTCOMES: MatchOutcome[] = ['won', 'lost', 'surrendered', 'abandoned', 'draw'];

export interface NewParticipant {
  slot: number;
  accountId?: string;
  name: string;
  faction: string;
  team: number;
  ai: boolean;
  /** Secret that lets this one client report this one slot's result. */
  reportToken?: string;
}

export interface NewMatch {
  style: string;
  map: string;
  mapName: string;
  room?: string;
  multiplayer: boolean;
  participants: NewParticipant[];
}

/** Open a match record at kick-off. */
export async function createMatch(match: NewMatch): Promise<string> {
  return transaction(async client => {
    const { rows } = await client.query<{ id: string }>(
      `insert into matches (style, map, map_name, room, multiplayer, started_at)
       values ($1, $2, $3, $4, $5, now()) returning id`,
      [match.style, match.map, match.mapName, match.room ?? null, match.multiplayer]);
    const id = rows[0].id;
    for (const p of match.participants) {
      await client.query(
        `insert into match_participants (match_id, slot, account_id, name, faction, team, ai, report_token)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (match_id, slot) do nothing`,
        [id, p.slot, p.accountId ?? null, p.name.slice(0, 32), p.faction, p.team, p.ai, p.reportToken ?? null]);
    }
    return id;
  });
}

/** The figures a client reports for its own slot at the end of a match. */
export interface ReportedStats {
  outcome: MatchOutcome;
  credits: number;
  harvested: number;
  spent: number;
  unitsLost: number;
  unitsKilled: number;
  buildingsLost: number;
  buildingsKilled: number;
  durationSeconds: number;
}

/** One formula, used for every player: economy worked plus damage done, less what was lost. */
export function scoreOf(stats: Omit<ReportedStats, 'outcome' | 'durationSeconds'>, outcome: MatchOutcome): number {
  const score = Math.round(stats.harvested / 10)
    + stats.unitsKilled * 10 + stats.buildingsKilled * 25
    - stats.unitsLost * 2 - stats.buildingsLost * 5
    + (outcome === 'won' ? 250 : 0);
  return Math.max(0, score);
}

const whole = (value: unknown, max = 10_000_000) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, Math.trunc(value))) : 0;

export function parseReport(value: Record<string, unknown>): ReportedStats {
  const outcome = OUTCOMES.find(o => o === value.outcome);
  if (!outcome) throw badRequest('Unknown match outcome');
  return {
    outcome,
    credits: whole(value.credits), harvested: whole(value.harvested), spent: whole(value.spent),
    unitsLost: whole(value.unitsLost, 100_000), unitsKilled: whole(value.unitsKilled, 100_000),
    buildingsLost: whole(value.buildingsLost, 100_000), buildingsKilled: whole(value.buildingsKilled, 100_000),
    durationSeconds: whole(value.durationSeconds, 86_400),
  };
}

/** Resolve which slot a report token speaks for; anything else is refused. */
export async function slotForToken(matchId: string, reportToken: string): Promise<number> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(reportToken)) throw forbidden('That result cannot be reported');
  const row = await one<{ slot: number }>(
    `select slot from match_participants where match_id = $1 and report_token = $2`, [matchId, reportToken]);
  if (!row) throw forbidden('That result cannot be reported');
  return row.slot;
}

/**
 * Record one player's result. The slot must already exist on the match, so a player can
 * only ever write their own row, and only once — a second report is ignored.
 */
export async function recordResult(matchId: string, slot: number, stats: ReportedStats): Promise<MatchRecord> {
  const updated = await one<{ match_id: string }>(
    `update match_participants set outcome = $3, credits = $4, harvested = $5, spent = $6,
       units_lost = $7, units_killed = $8, buildings_lost = $9, buildings_killed = $10, score = $11
     where match_id = $1 and slot = $2 and outcome is null
     returning match_id`,
    [matchId, slot, stats.outcome, stats.credits, stats.harvested, stats.spent,
      stats.unitsLost, stats.unitsKilled, stats.buildingsLost, stats.buildingsKilled,
      scoreOf(stats, stats.outcome)]);
  if (updated) {
    // The first player to finish fixes the match's end time and length.
    await query(
      `update matches set ended_at = coalesce(ended_at, now()),
         duration_seconds = coalesce(duration_seconds, $2) where id = $1`,
      [matchId, stats.durationSeconds]);
  }
  const record = await matchById(matchId);
  if (!record) throw notFound('No such match');
  return record;
}

interface ParticipantRow {
  slot: number; handle: string | null; name: string; faction: string; team: number;
  outcome: string | null; score: number; credits: number; harvested: number; spent: number;
  units_lost: number; units_killed: number; buildings_lost: number; buildings_killed: number; ai: boolean;
  account_id: string | null;
}

interface MatchRow {
  id: string; style: string; map: string; map_name: string; multiplayer: boolean;
  started_at: Date; ended_at: Date | null; duration_seconds: number | null;
}

function participantOf(row: ParticipantRow): MatchParticipant {
  return {
    handle: row.handle ?? undefined,
    name: row.name, faction: row.faction, team: row.team,
    outcome: (row.outcome ?? 'abandoned') as MatchOutcome,
    score: row.score, credits: row.credits, harvested: row.harvested, spent: row.spent,
    unitsLost: row.units_lost, unitsKilled: row.units_killed,
    buildingsLost: row.buildings_lost, buildingsKilled: row.buildings_killed,
    ai: row.ai,
  };
}

const PARTICIPANT_FIELDS = `p.slot, p.account_id, a.handle, p.name, p.faction, p.team, p.outcome, p.score,
  p.credits, p.harvested, p.spent, p.units_lost, p.units_killed, p.buildings_lost, p.buildings_killed, p.ai`;

async function participantsOf(matchIds: string[]): Promise<Map<string, ParticipantRow[]>> {
  if (!matchIds.length) return new Map();
  const rows = await query<ParticipantRow & { match_id: string }>(
    `select p.match_id, ${PARTICIPANT_FIELDS} from match_participants p
     left join accounts a on a.id = p.account_id and a.status = 'active'
     where p.match_id = any($1::uuid[]) order by p.slot`, [matchIds]);
  const out = new Map<string, ParticipantRow[]>();
  for (const row of rows) out.set(row.match_id, [...(out.get(row.match_id) ?? []), row]);
  return out;
}

function recordOf(match: MatchRow, participants: ParticipantRow[], viewer?: string): MatchRecord {
  const mapped = participants.map(participantOf);
  const yours = viewer ? participants.findIndex(p => p.account_id === viewer) : -1;
  return {
    id: match.id,
    style: match.style as GameStyle,
    map: match.map,
    mapName: match.map_name,
    startedAt: match.started_at.toISOString(),
    endedAt: (match.ended_at ?? match.started_at).toISOString(),
    durationSeconds: match.duration_seconds ?? 0,
    multiplayer: match.multiplayer,
    participants: mapped,
    you: yours >= 0 ? mapped[yours] : undefined,
  };
}

const MATCH_FIELDS = 'id, style, map, map_name, multiplayer, started_at, ended_at, duration_seconds';

export async function matchById(id: string, viewer?: string): Promise<MatchRecord | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const match = await one<MatchRow>(`select ${MATCH_FIELDS} from matches where id = $1`, [id]);
  if (!match) return undefined;
  const participants = (await participantsOf([match.id])).get(match.id) ?? [];
  return recordOf(match, participants, viewer);
}

/** A player's own history, newest first. The cursor is the previous page's last start time. */
export async function historyFor(accountId: string, limit = 20, cursor?: string): Promise<HistoryPage> {
  const size = Math.min(50, Math.max(1, limit));
  const before = cursor ? new Date(cursor) : undefined;
  if (before && Number.isNaN(before.getTime())) throw badRequest('Invalid cursor');
  const matches = await query<MatchRow>(
    `select m.${MATCH_FIELDS.split(', ').join(', m.')} from matches m
     join match_participants p on p.match_id = m.id and p.account_id = $1
     where ($2::timestamptz is null or m.started_at < $2)
     order by m.started_at desc limit ${size + 1}`, [accountId, before ?? null]);
  const page = matches.slice(0, size);
  const participants = await participantsOf(page.map(m => m.id));
  const total = await one<{ total: string }>(
    `select count(*)::text as total from match_participants where account_id = $1`, [accountId]);
  return {
    matches: page.map(m => recordOf(m, participants.get(m.id) ?? [], accountId)),
    total: Number(total?.total ?? 0),
    cursor: matches.length > size ? page[page.length - 1].started_at.toISOString() : undefined,
  };
}

async function statsFor(accountId: string, handle: string): Promise<PlayerStats> {
  const totals = await one<{ played: string; won: string; lost: string; best: string; total: string }>(
    `select count(*)::text as played,
            count(*) filter (where outcome = 'won')::text as won,
            count(*) filter (where outcome in ('lost', 'surrendered'))::text as lost,
            coalesce(max(score), 0)::text as best,
            coalesce(sum(score), 0)::text as total
     from match_participants where account_id = $1 and outcome is not null`, [accountId]);
  const favourite = await one<{ style: string; faction: string }>(
    `select m.style, p.faction from match_participants p join matches m on m.id = p.match_id
     where p.account_id = $1 group by m.style, p.faction order by count(*) desc limit 1`, [accountId]);
  // Streaks need the order the matches were played in, so they are computed here.
  const outcomes = await query<{ outcome: string }>(
    `select p.outcome from match_participants p join matches m on m.id = p.match_id
     where p.account_id = $1 and p.outcome is not null order by m.started_at desc limit 500`, [accountId]);
  let current = 0, best = 0, run = 0;
  for (const [index, row] of outcomes.entries()) {
    if (row.outcome === 'won') { run++; best = Math.max(best, run); if (index === run - 1) current = run; }
    else run = 0;
  }
  const played = Number(totals?.played ?? 0), won = Number(totals?.won ?? 0);
  return {
    handle,
    played, won, lost: Number(totals?.lost ?? 0),
    winRate: played ? Math.round((won / played) * 100) : 0,
    bestScore: Number(totals?.best ?? 0),
    totalScore: Number(totals?.total ?? 0),
    favouriteStyle: (favourite?.style as GameStyle) ?? null,
    favouriteFaction: favourite?.faction ?? null,
    bestStreak: best,
    currentStreak: current,
  };
}

/** Record against the opponents this player has met most often. */
export async function rivalsOf(accountId: string, limit = 8): Promise<HeadToHead[]> {
  const rows = await query<{
    handle: string; display_name: string | null; has_avatar: boolean; avatar_version: number;
    played: string; won: string; lost: string; your_score: string; their_score: string; last_played: Date;
  }>(
    `select a.handle, a.display_name, (a.avatar_type is not null) as has_avatar, a.avatar_version,
            count(*)::text as played,
            count(*) filter (where mine.outcome = 'won')::text as won,
            count(*) filter (where mine.outcome in ('lost', 'surrendered'))::text as lost,
            coalesce(sum(mine.score), 0)::text as your_score,
            coalesce(sum(theirs.score), 0)::text as their_score,
            max(m.started_at) as last_played
     from match_participants mine
     join match_participants theirs
       on theirs.match_id = mine.match_id and theirs.slot <> mine.slot
      and theirs.account_id is not null and theirs.account_id <> mine.account_id
     join matches m on m.id = mine.match_id
     join accounts a on a.id = theirs.account_id and a.status = 'active'
     where mine.account_id = $1 and mine.outcome is not null
     group by a.handle, a.display_name, a.avatar_type, a.avatar_version
     order by count(*) desc, max(m.started_at) desc limit $2`, [accountId, Math.min(25, limit)]);
  return rows.map(r => ({
    handle: r.handle,
    displayName: r.display_name ?? undefined,
    hasAvatar: r.has_avatar,
    avatarVersion: r.avatar_version,
    played: Number(r.played), won: Number(r.won), lost: Number(r.lost),
    yourScore: Number(r.your_score), theirScore: Number(r.their_score),
    lastPlayedAt: r.last_played.toISOString(),
  }));
}

export async function playerRecord(accountId: string, handle: string): Promise<PlayerRecord> {
  const [stats, recent, rivals] = await Promise.all([
    statsFor(accountId, handle),
    historyFor(accountId, 10),
    rivalsOf(accountId),
  ]);
  return { stats, recent: recent.matches, rivals };
}
