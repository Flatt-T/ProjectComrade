# Persistent-world implementation log

One short entry per issue: state, branch, what is proven, what is open. Linear holds the
acceptance detail; this file is the resume point. Read it first in every session.

## Rules for this log

- An entry is written when an issue's PR merges, or when work is parked on a named blocker.
- "Proven" means a real test against the real thing (Postgres, the Fusion sim, a browser),
  with the command and count. Build logs and mocks are not proof.
- Never record secrets, credentials or live-environment changes here.

## Entries

### PW01 — THU-2225 — baseline, ADR, decision register — 2026-11-11

- State: implemented on branch `thu-2225-pw01-persistent-baseline`.
- Deliverables: `docs/persistent-world/BASELINE.md`, `docs/persistent-world/DECISIONS.md`,
  `docs/adr/013-persistent-world.md`, this file.
- Proven: repository baseline recorded from the live tree (commit, tool versions, engine
  and service entrypoints, schema/migration conventions, infrastructure references).
  Decision register records every COMRADE 18 §3 resolved rule with its tunable defaults and
  keeps only the four COMRADE 18 §6 items open.
- Open: nothing blocking. Next unblocked issue per dependency order: PW02 (THU-2226,
  Proxmox beta container) and PW03 (THU-2227, beta Postgres) are infrastructure; PW04
  (THU-2228, versioned contracts) is unblocked code work and can proceed locally first.
- Update: PR #13 merged to `main` (merge commit `39cbf2d`) after all required checks
  passed; `dependency-check` remains FAILURE (continue-on-error job, dev-only
  `minimatch` advisory GHSA-g3hv-75wg-m249) — recorded, not a code defect.

### PW04 — THU-2228 — versioned persistent-world contracts — 2026-11-11

- State: implemented on branch `thu-2228-pw04-mmo-contracts`.
- Deliverables: `packages/contracts/src/mmo.ts` (exported via `src/index.ts`),
  `tests/unit/mmo-contracts.test.ts` (19 tests).
- Proven: `vitest run tests/unit` — 20 files / 339 tests pass;
  `pnpm typecheck` exit 0; `pnpm lint` exit 0. Contract coverage: protocol-version
  rejection, safe-integer decimal-string counters beyond 2^53, malformed/negative/
  oversized payload rejection, intent/result separation (clients cannot assert
  credits, ownership, HP, outcomes), distinct SELL_REFUND/PACK/BARTER/DEPLOY/
  SELECT_PROTECTION operations, NEWCOMER/OFFLINE_EARNED/RECOVERY protection state
  machine under controlled clocks (online-time-only newcomer immunity + 24h lapse,
  manual offline-shield arming that cannot start mid-battle and preserves unused
  time across login, recovery ending only on milestone/choice/attack), recovery
  trigger whitelist (sell-all/defeat/grant only — pack and trade cannot trigger),
  versioned capabilities + decision state with all COMRADE 18 §6 items `open` and
  `MMO_CAPABILITIES_NONE`/`MILESTONE1` presets.
- Open: contracts only — no service, journal or engine wiring yet (PW05+).
  Classic `ClientMessage`/`PlayerOrder` untouched; `comrade.classic.v1` semantics
  unchanged.
