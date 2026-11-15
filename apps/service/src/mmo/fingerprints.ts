// PW33 (THU-2444): immutable content fingerprints for the persistent profile.
//
// A region's durable identity must pin the EXACT content that produced its
// journal and snapshots — engine artifact, resolved rules profile, pack
// definitions and world-generation settings — not just matching identifiers.
// `canonicalize` gives key-sorted JSON so equal content hashes equally across
// processes and restarts.
//
// Provenance rules (COMRADE 19/20):
//  - Regions created by this build record `fingerprints` at creation; the
//    runner refuses to start when the stored fingerprint differs from what
//    this build resolves — before any snapshot restore or journal mutation.
//  - Regions predating the column carry NULL and stay runnable: stamping
//    today's digest onto content we cannot verify would falsify provenance.
//    Migrating them is an explicit operator action, never implicit.
import { createHash } from 'node:crypto';
import { packById } from '@comrade/fusion';
import type { MmoRulesProfile } from '@comrade/contracts';
import { canonicalize } from './store.js';
import type { RegionSimSpec } from './runner.js';

export interface RegionFingerprints {
  v: 1;
  /** Deployed engine artifact identity (COMRADE_ENGINE_SHA at build/deploy). */
  engine: string;
  /** sha256 of the canonical resolved pack definitions. */
  pack: string;
  /** sha256 of the canonical rules profile actually in force. */
  rules: string;
  /** sha256 of mapId + worldgen spec + sim seed inputs. */
  worldgen: string;
  /** sha256 over the four components — the single comparable value. */
  content: string;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/**
 * Engine artifact identity. Deploys inject COMRADE_ENGINE_SHA (the built
 * commit); local/dev runs share the 'dev' marker — honest, since dev builds
 * are not content-pinned artifacts.
 */
export function engineFingerprint(): string {
  // COMRADE_ENGINE_SHA wins when set explicitly; the deploy image already
  // carries COMRADE_COMMIT=<github.sha> as a build arg/env.
  const explicit = process.env.COMRADE_ENGINE_SHA?.trim() || process.env.COMRADE_COMMIT?.trim();
  return explicit || 'dev';
}

// Pack definitions only change across deploys; cache the digest per process.
const packDigestCache = new Map<string, string>();
function packDigest(packId: string): string {
  const cached = packDigestCache.get(packId);
  if (cached) return cached;
  const pack = packById(packId);
  if (!pack) throw new Error(`fingerprint: unknown pack ${packId}`);
  const digest = sha256(canonicalize(pack));
  packDigestCache.set(packId, digest);
  return digest;
}

/** Compute the full fingerprint set for a region sim spec + rules profile. */
export function regionFingerprints(spec: RegionSimSpec, rules: MmoRulesProfile): RegionFingerprints {
  const engine = engineFingerprint();
  const pack = packDigest(spec.packId);
  const rulesHash = sha256(canonicalize(rules));
  const worldgen = sha256(canonicalize({
    mapId: spec.mapId, seed: spec.seed, worldgen: spec.worldgen ?? null,
    credits: spec.credits ?? null, techLevel: spec.techLevel ?? null, worms: spec.worms ?? null,
  }));
  const content = sha256([engine, pack, rulesHash, worldgen].join('|'));
  return { v: 1, engine, pack, rules: rulesHash, worldgen, content };
}
