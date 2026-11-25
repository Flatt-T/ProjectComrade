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
import { readFileSync } from 'node:fs';
import { packById } from '@comrade/fusion';
import type { MmoRulesProfile } from '@comrade/contracts';
import { betaDeployment } from '../config.js';
import { canonicalize } from './store.js';
import type { RegionSimSpec } from './runner.js';

export interface RegionFingerprints {
  v: 1;
  /** Pinned identity of the deployed engine artifact. */
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

// These 38 compiled Fusion and contracts modules matched in the two deployed
// beta images. This is the historical engine ID already in their checkpoints.
const VERIFIED_BETA_ENGINE = {
  artifact: 'd762fef75c1f348ef519cef0b81f28fed42da6189f8005534e16707d1f3221fb',
  checkpointEngine: 'ef42e0e3b2405da1fa149d181c8e4496ba436c85',
};

export function engineFingerprint(): string {
  const explicit = process.env.COMRADE_ENGINE_SHA?.trim();
  if (explicit) return explicit;
  const artifactPath = process.env.COMRADE_ENGINE_ARTIFACT_PATH;
  if (betaDeployment() && artifactPath) {
    const digest = readFileSync(artifactPath, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid beta engine artifact fingerprint');
    return digest === VERIFIED_BETA_ENGINE.artifact ? VERIFIED_BETA_ENGINE.checkpointEngine : digest;
  }
  return process.env.COMRADE_COMMIT?.trim() || 'dev';
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
