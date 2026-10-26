// Accounts, profiles, match history and the vote records Gold subscribers hold rights over.
//
// A callsign (handle) is the public identity and is claimed against one email address at
// registration. Uniqueness is owned by the database, not by the identity provider, so a
// handle can never be issued twice even if a sign-up later fails half way through.
import { Faction, GameStyle } from './index.js';
import { Entitlements, Tier } from './billing.js';

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
/** Letters, digits, single separators; no leading or trailing separator. */
export const HANDLE_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|[._-](?![._-])){1,18}[a-zA-Z0-9]$/;
/** Handles nobody may claim, because they would impersonate the platform. */
export const HANDLE_RESERVED = ['comrade', 'admin', 'administrator', 'moderator', 'mod', 'staff',
  'support', 'help', 'billing', 'system', 'root', 'official', 'projectcomrade', 'commander', 'null', 'undefined'];

export function handleValid(handle: unknown): handle is string {
  return typeof handle === 'string' && handle.length >= HANDLE_MIN && handle.length <= HANDLE_MAX
    && HANDLE_PATTERN.test(handle) && !HANDLE_RESERVED.includes(handle.toLowerCase());
}

export const DISPLAY_NAME_MAX = 32;
export const COUNTRY_PATTERN = /^[A-Z]{2}$/;
/** Avatars are resized client-side; the API refuses anything larger. */
export const AVATAR_MAX_BYTES = 256 * 1024;
export const AVATAR_DIMENSION = 256;
export const AVATAR_TYPES = ['image/webp', 'image/png', 'image/jpeg'];

/** The minimum we keep: everything here is optional except the handle and email. */
export interface Profile {
  handle: string;
  email: string;
  /** Pending address during a verified email change, if one is in flight. */
  pendingEmail?: string;
  emailVerified: boolean;
  /** Shown in place of the handle when set. */
  displayName?: string;
  /** ISO 3166-1 alpha-2, self-declared, used only for leaderboard flags. */
  country?: string;
  /** Preferred side, remembered for the lobby. */
  favouriteFaction?: Faction;
  /** True once an avatar has been uploaded; the image itself is fetched separately. */
  hasAvatar: boolean;
  /** Cache-busting token for the avatar URL. */
  avatarVersion: number;
  createdAt: string;
  /** Start of this account's weekly allowance window, anchored to registration. */
  weekAnchor: string;
}

export interface ConsentState {
  /** Required to use the service at all; recorded with a version and timestamp. */
  terms: boolean;
  termsVersion: string | null;
  /** Optional: personalised advertising. Ads still run without it, contextually. */
  personalisedAds: boolean;
  /** Optional: product and feature email. */
  marketingEmail: boolean;
  updatedAt: string | null;
}

export interface Me { profile: Profile; entitlements: Entitlements; consent: ConsentState }

/** Session tokens; the refresh token is held in an httpOnly cookie and never sent here. */
export interface AuthSession { accessToken: string; idToken: string; expiresIn: number; me: Me }

export type AuthChallenge = 'CONFIRM_SIGN_UP' | 'NEW_PASSWORD_REQUIRED' | 'MFA_SETUP' | 'SOFTWARE_TOKEN_MFA' | 'SMS_MFA';

// ---------------------------------------------------------------------------
// Match history
// ---------------------------------------------------------------------------

export type MatchOutcome = 'won' | 'lost' | 'surrendered' | 'abandoned' | 'draw';

export interface MatchParticipant {
  /** Absent for AI opponents and for guests. */
  handle?: string;
  name: string;
  faction: Faction;
  team: number;
  outcome: MatchOutcome;
  /** Final economy and army figures, as the simulation reported them. */
  score: number;
  credits: number;
  harvested: number;
  spent: number;
  unitsLost: number;
  unitsKilled: number;
  buildingsLost: number;
  buildingsKilled: number;
  ai: boolean;
}

export interface MatchRecord {
  id: string;
  style: GameStyle;
  map: string;
  mapName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  /** Lockstep matches only; a skirmish against the AI is recorded too but marked. */
  multiplayer: boolean;
  participants: MatchParticipant[];
  /** This viewer's own row, for convenience. */
  you?: MatchParticipant;
}

export interface HistoryPage { matches: MatchRecord[]; total: number; cursor?: string }

/** Aggregate record against one other player. */
export interface HeadToHead {
  handle: string;
  displayName?: string;
  hasAvatar: boolean;
  avatarVersion: number;
  played: number;
  won: number;
  lost: number;
  /** Total score across those matches, yours then theirs. */
  yourScore: number;
  theirScore: number;
  lastPlayedAt: string;
}

export interface PlayerStats {
  handle: string;
  played: number;
  won: number;
  lost: number;
  winRate: number;
  bestScore: number;
  totalScore: number;
  favouriteStyle: GameStyle | null;
  favouriteFaction: Faction | null;
  /** Longest run of wins, ever. */
  bestStreak: number;
  currentStreak: number;
}

/** Everything the profile page shows about a player's record. */
export interface PlayerRecord { stats: PlayerStats; recent: MatchRecord[]; rivals: HeadToHead[] }

// ---------------------------------------------------------------------------
// Voting (Gold subscribers)
// ---------------------------------------------------------------------------

export type ProposalKind = 'feature' | 'map' | 'fusion';
export type ProposalStatus = 'open' | 'scheduled' | 'building' | 'shipped' | 'declined';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  summary: string;
  status: ProposalStatus;
  createdAt: string;
  /** Closing date for voting, when one is set. */
  closesAt: string | null
  votes: number;
  /** Set when the viewer has voted on this proposal. */
  yourVote?: 1 | -1;
  /** Linked GitHub issue, when the community workflow has opened one. */
  issueUrl: string | null;
}

export interface ProposalPage { proposals: Proposal[]; canVote: boolean; votesRemaining: number | null }
/** Votes a Gold subscriber may cast in one weekly window. */
export const VOTES_PER_WEEK = 10;

// ---------------------------------------------------------------------------
// Content release gating
// ---------------------------------------------------------------------------

/** Release metadata that drives Gold early access for maps, packs and fusions. */
export interface ReleaseInfo {
  /** ISO timestamp the item was published. */
  publishedAt: string;
  /** Computed: still inside the early-access window. */
  earlyAccess: boolean;
  /** ISO timestamp early access ends and everyone gets it. */
  opensAt: string;
}

export interface LockReason { locked: boolean; reason?: 'early-access'; opensAt?: string }

/** Tier a visitor is treated as, resolved per request. */
export interface Viewer { tier: Tier; handle?: string; accountId?: string; guestId?: string }
