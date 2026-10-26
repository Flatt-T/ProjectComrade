// Early access: new maps, packs and fusions are Gold-only for their first week.
//
// Each item carries a publish date. Until `published_at + EARLY_ACCESS_DAYS` only Gold
// subscribers may launch it; after that it opens to everyone, with no further action needed.
// Content with no row has always been available, so nothing existing is locked by adding
// this and a new map is gated simply by recording the day it shipped.
import { EARLY_ACCESS_DAYS, LockReason, ReleaseInfo, Tier, plan } from '@comrade/contracts';
import { platformEnabled } from './config.js';
import { query } from './db.js';
import { forbidden } from './http.js';

const WINDOW_MS = EARLY_ACCESS_DAYS * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

let cache: { at: number; rows: Map<string, Date> } | undefined;

async function published(): Promise<Map<string, Date>> {
  if (!platformEnabled()) return new Map();
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await query<{ id: string; published_at: Date }>('select id, published_at from content_releases');
  cache = { at: Date.now(), rows: new Map(rows.map(r => [r.id, r.published_at])) };
  return cache.rows;
}

/** Release details for one item, or undefined when it has no early-access window. */
export async function releaseFor(id: string): Promise<ReleaseInfo | undefined> {
  const at = (await published()).get(id);
  if (!at) return undefined;
  const opensAt = new Date(at.getTime() + WINDOW_MS);
  return { publishedAt: at.toISOString(), earlyAccess: opensAt.getTime() > Date.now(), opensAt: opensAt.toISOString() };
}

/** Whether this tier may use this item yet. */
export async function lockFor(id: string, tier: Tier): Promise<LockReason> {
  const release = await releaseFor(id);
  if (!release?.earlyAccess || plan(tier).earlyAccess) return { locked: false };
  return { locked: true, reason: 'early-access', opensAt: release.opensAt };
}

/** Everything still inside its early-access window, for the lobby to label. */
export async function earlyAccessItems(): Promise<Record<string, ReleaseInfo>> {
  const rows = await published();
  const out: Record<string, ReleaseInfo> = {};
  for (const [id, at] of rows) {
    const opensAt = new Date(at.getTime() + WINDOW_MS);
    if (opensAt.getTime() <= Date.now()) continue;
    out[id] = { publishedAt: at.toISOString(), earlyAccess: true, opensAt: opensAt.toISOString() };
  }
  return out;
}

/** Refuse a launch of content this tier cannot reach yet. */
export async function assertUnlocked(ids: string[], tier: Tier): Promise<void> {
  for (const id of ids) {
    const lock = await lockFor(id, tier);
    if (lock.locked) {
      const opens = lock.opensAt ? new Date(lock.opensAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : 'shortly';
      throw forbidden(`That is in Gold early access until ${opens}`);
    }
  }
}

/** Record or move an item's publish date. Used by the content release tooling. */
export async function setRelease(id: string, kind: 'map' | 'pack' | 'fusion', publishedAt: Date): Promise<void> {
  await query(
    `insert into content_releases (id, kind, published_at) values ($1, $2, $3)
     on conflict (id) do update set kind = excluded.kind, published_at = excluded.published_at`,
    [id, kind, publishedAt]);
  cache = undefined;
}
