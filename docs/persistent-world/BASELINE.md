# Persistent-world beta — implementation baseline (PW01 / THU-2225)

Recorded 2026-11-11 against `main` @ `80ced46a54c61bd21365c595dbfb4e6b44403135`
("feat: wire AdSense H5 preroll and reward placements (#12)"). Everything below was read
from the working tree, not assumed from older plans. Specifications: COMRADE 11–18 in
Linear; COMRADE 18 wins on conflict.

## Toolchain (verified on this workstation)

| Tool | Version | Notes |
|---|---|---|
| Node | v24.13.0 | matches `engines.node` and CI |
| pnpm | 9.15.0 | via `corepack pnpm`; not on bare PATH |
| TypeScript | 5.9.3 root / 5.3.2 service+web | strict, `noEmit` root |
| vitest | 5.0.5 | unit suite: `pnpm test:unit` |
| Playwright | 1.56.1 | `tools/browser-smoke.mjs`, `tools/service-smoke.mjs` |
| pg | 8.23.1 | service Postgres driver |
| ws | 8.14.2 | service WebSocket server |
| Docker | 28.4.0 | available locally; disposable Postgres possible for tests |

## Repository layout that matters

- `packages/fusion` — **the persistent-world engine** (COMRADE 18 D1). Deterministic,
  integer-only sim at 15 Hz: positions in leptons (256/cell), seeded xorshift32 RNG,
  FNV-1a per-tick state checksum. `Game` (`src/game.ts`, ~2.1k lines) holds players,
  entities, production queues, projectiles, strikes, worms, crates. `RulePack`
  (`src/rules.ts`) expresses a whole game as data; packs shipped: `td`, `ra1`, `dune`,
  `ra2` (classics) plus fusion/mashup compositions. `LockstepSession`
  (`src/session.ts`) is the existing lockstep layer: 3-tick turns, commands scheduled two
  turns ahead, checksum comparison per turn packet.
  - **Packaging gap:** `packages/fusion` has no `package.json`; `apps/web` imports it by
    relative path (`../../../packages/fusion/src/index`). `apps/service` compiles only
    `src/` (`rootDir: ./src`), so the service cannot import fusion today. PW21 must give
    fusion a build/package boundary the Node service can consume.
- `apps/service` — Node HTTP + `ws` service. `/ws` room/lobby protocol
  (`rooms.ts` `RoomCoordinator`, versioned messages, rate limits, guest cookie resume);
  `/api/*` routed through the table in `http.ts` (`api.ts` registers routes);
  `/health` reports status + `configSummary()`. Accounts are AWS Cognito JWTs verified via
  `jose` JWKS (`auth.ts`); guests via HMAC-signed `cmrd_guest` cookie. Entitlements and
  play quotas in `entitlements.ts`/`credits.ts` backed by `play_ledger`, `credit_lots`,
  `play_credits`, `ad_credit_sessions`. Stripe billing in `billing.ts`.
- `apps/web` — React lobby/battle client; fusion matches run `LockstepSession` over
  turn packets relayed by the service.
- `packages/contracts` — shared API/pack/match schemas, built to `dist`, workspace dep.

## Persistence conventions (live `comrade` schema — read-only reference)

- `apps/service/src/db.ts`: `pg.Pool` with `search_path` set to the `comrade` schema on
  the shared server; **embedded numbered migrations** (`MIGRATIONS` array, currently
  versions 1–2), one transaction each, recorded in `schema_migrations`. `DATABASE_URL`
  unset ⇒ service runs open/unmetered (the documented degrade path).
- Live environment per `docs/runbooks/paid-platform-setup.md` and `deployment.md`:
  database `comrade` owned by role `comrade_app` on **postgres-core-01 = 10.1.0.35**,
  reached from the app container at `10.1.0.60`. The service creates and owns the
  `comrade` **schema** inside that database.
- The beta gets its **own database** (proposed `comrade_beta`) and role
  (`comrade_beta_app`) on the same server, per COMRADE 15/18 — never the live schema.

## Infrastructure references (authorised read-only knowledge; nothing changed)

- Live app: unprivileged Debian 13 **LXC 280** `projectcomrade-01` on **prx-h2**
  (192.168.1.200), `10.1.0.60/24` on `vmbr0v10`, gateway/DNS `10.1.0.1`, 2c/4GiB/24GiB.
  Docker inside; deploys via `comrade-deploy.timer` → `infra/pull-deploy.py`.
- Edge: Cloudflare proxied DNS → Nginx Proxy Manager (hosts 49 legacy, 50 current) →
  `http://10.1.0.60:3001`, WebSockets enabled, Let's Encrypt.
- **Name collision to respect:** `infra/comrade-deploy-beta.{service,timer}` and
  `pull-deploy.py` `COMRADE_CHANNEL=beta` already define a *pre-release* channel that
  deploys `beta-<sha>` GitHub pre-releases to **port 3002 on the same LXC 280 guest**.
  That is a public-test channel for the classic/fusion builds — **not** the persistent-world
  beta. PW02 must create a new Proxmox container and hostname; the two betas must not be
  conflated, and persistent-world code must stay behind a server-side flag that is off in
  production (COMRADE 18 §2.8 / task hard limits).
- Deployment pipeline: `.github/workflows/release.yml` on `main`/`beta` builds engines +
  app, runs `tools/browser-smoke.mjs` + `tools/service-smoke.mjs` against a locally served
  build, publishes GHCR image + `main-<sha>`/`beta-<sha>` GitHub releases; PR CI is
  `.github/workflows/ci.yml` (lint, typecheck, unit, integration stub, audit).

## Engine evidence status

- **Fusion Engine:** real, shipped, exercised by unit tests (`tests/unit/fusion.test.ts`,
  `packs.test.ts`, `progression.test.ts`, `fusions.test.ts`, `mashup.test.ts`,
  `ra-pack.test.ts`) and by the release browser smoke (two-browser lockstep checksum
  comparison). This is the persistent-world sim baseline.
- **Vanilla Conquer headless WASM:** `engines/adapters/td-ra`, `tools/build-engine.py`.
  Repo evidence files (`C04-Evidence.md`, `C04-Blocker-Report.md`, etc.) record compile
  and link; headless stepping, save/restore and gameplay were never demonstrated
  (THU-1335 still Backlog). **Not a dependency** of the persistent world (COMRADE 18 §2.1).
- Persistent-mode gaps the engine must close are scoped in PW21 (THU-2269): headless
  region host, snapshot/restore with checksum verification, join/leave, ownership
  transfer, pack/deploy + carriers, salvage, capturable sites, stable entity IDs,
  region-edge hooks, persistent rules profile with no match-over condition.

## Reuse map — classic components vs persistent mode

| Reused (with care) | Must differ |
|---|---|
| Cognito accounts + `accounts` table (registered players only; guests cannot own a base — COMRADE 18 §2.8) | Protocol: new versioned `comrade.mmo.v1`-style channel; classic `/ws` room lockstep untouched |
| `db.ts` pool/migration conventions → new `mmo`-schema migrations in the **beta database** | Authority: one fenced region writer; Postgres journal-first, sim is sole in-region authority (COMRADE 18 §2.2) |
| Entitlement/identity concepts (free tier suffices; no paid combat power in persistent mode) | Time: server-authoritative real time; no pause-on-disconnect, no classic four-seat lockstep |
| Fusion `Game`/`RulePack`/determinism/checksum as the simulation | New persistent rules profile (COMRADE 18 §2.4, PW23): pacing, protection, no match-over |
| `ws` server, rate limits, cookie auth patterns | Client replication: snapshot + ordered command stream, server checksum authoritative (COMRADE 18 §4) — **not fog-secure; hidden state is exposed to a modified client (accepted for beta, documented)** |
| Smoke-test harness pattern (`tools/*-smoke.mjs`) | Persistence: journal + snapshots + hibernation (PW22), not classic match lifecycle |

## First vertical slice (PW27 target, milestone 1)

One permanent world, **one region**, Fusion Engine (`td` or `ra1` pack — decided at PW04/PW21
implementation time, tunable), registered accounts only. In scope: starter grant +
one-hour setup protection, nightly free shield allowance + earned shields with the
mid-battle rule, caretaker, recovery (sell-all and defeat), bound starter/recovery assets
(PW26 partial), region journal + snapshot/restore, hibernation (PW22), pacing profile
(PW23), notifications + away report (PW25 partial), single-region WSS command protocol and
browser client on snapshot+command-stream replication.

Out of scope for milestone 1 (later milestones): barter/trading (PW13–14), packing/carriers
(PW14), transport (PW15), terrain generation/frontier (PW16), factions/mixed forces beyond
the starting choice (PW17), multi-region handoff (PW18), ladder/notifications remainder,
full PW25/PW26.
