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
- Update: PR #14 merged to `main` (merge commit `d16397a`); THU-2228 Done.

### PW05 — THU-2229 — durable world records and asset ownership ledger — 2026-11-11

- State: implemented on branch `thu-2229-pw05-durable-world`.
- Deliverables: `apps/service/src/mmo/{db,schema,store,fixture}.ts` (isolated
  `mmo` schema, own pool gated on `MMO_DATABASE_URL` — live `comrade` schema
  untouched), `Entity.bound` flag in `packages/fusion/src/game.ts` (0 free /
  1 starter / 2 recovery, checksum-neutral for classic),
  `tests/integration/mmo-store.test.ts` (14 tests), real `test:integration`
  script + Postgres service in `ci.yml`.
- Proven against disposable `postgres:16-alpine` (docker, localhost:55432):
  `vitest run tests/integration/mmo-store.test.ts` — 14/14 pass covering
  migration reload, ordered journal + outbox, fence rejection (stale epoch,
  wrong worker, stale tick), lease takeover epoch bump, idempotent
  operation commit with canonical-payload conflict detection, distinct
  SELL_REFUND/PACK ledger causes, separate nightly/earned shield balances
  with generation-fenced consumption and receipt-idempotent grants,
  protection-record round-trips for all three reasons, contract-validated
  trade offers resolving once, receipt-idempotent ladder, unique live
  transfer per asset with the COMRADE 14 state machine, at-most-once
  recovery episodes and settlements, snapshot applied-vs-committed
  positions, leased scheduled jobs, deduplicated command intents.
  `pnpm test:unit` 339 pass, `pnpm typecheck` 0, `pnpm lint` 0.
- Open: journal/event bus ordering across workers (PW06), scheduler/activation
  (PW07), engine snapshot/replay integration (PW21).

### PW06 — THU-2230 — ordered authoritative mutations and transactional event bus — 2026-11-11

- State: merged to `main` (merge commit `1bd10a9`), PR #16; THU-2230 Done.
- Deliverables: `apps/service/src/mmo/commands.ts` (contract-validated command
  intake: intent + journal + outbox in one fenced transaction; stale-epoch and
  duplicate/conflicting commandId rejection; `applyCommandEffects` writes the
  economy_operation cause, asset ledger, applied receipt, intent completion and
  outbox notification atomically and exactly once), `apps/service/src/mmo/bus.ts`
  (leased transactional-outbox dispatcher: per-region head-of-line ordering via a
  NOT EXISTS claim guard, publish→ack→reclaim loop, bounded exponential backoff,
  parking after max attempts, at-least-once redelivery — no exactly-once claim),
  migration v2 (region_event applied markers + operation_id), `assertRegionFence`
  non-consuming fence check for outcome recording, `tests/integration/mmo-bus.test.ts`
  (9 tests), `fileParallelism: false` in vitest config (integration files share one
  real database).
- Proven against disposable `postgres:16-alpine` (docker, localhost:55432):
  `vitest run tests/integration` — 23/23 pass (14 store + 9 bus) covering atomic
  intent+journal+outbox commit, replay dedupe with no second journal entry,
  COMMAND_CONFLICT on payload reuse and protocol rejection, 3-way concurrent
  identical submission → exactly 1 journal event, apply-once semantics with
  Postgres side-effects running exactly once, OPERATION_CONFLICT on replayed
  events with a different operation, expired-lease FENCE_LOST on submit, ordered
  outbox delivery with single acknowledgement, crash-between-publish-and-ack
  redelivery deduped by event id, failed-publish backoff with head-of-line
  blocking of later same-region events, and one-winner concurrent trade-offer
  resolution. `pnpm test:unit` 339 pass, `pnpm typecheck` 0, `pnpm lint` 0,
  `pnpm --filter @comrade/service build` 0.
- Open: the runner that consumes `mmo.command` journal entries and calls
  `applyCommandEffects` at tick boundaries lands with the region worker (PW07/PW21);
  client-facing commandResult emission over WS is part of PW09+; multi-dispatcher
  live failover is exercised only via lease expiry in tests.

### PW21 — THU-2269 — Fusion persistent-region engine — 2026-11-11

- State: implemented on branch `thu-2269-pw21-fusion-persistent` (in progress).
- Deliverables: `packages/fusion/src/persistent.ts` (`captureGame`/`restoreGame`
  full deterministic snapshot incl. RNG, pending orders, queues, timers, map
  mutations `resKind`/`concrete`, stable entity IDs and `nextId`; `joinPlayer`/
  `leavePlayer` without match-over; `transferOwner` command preserving
  position/health/orders and rejecting dead/foreign entities; persistent rules
  profile separate from classic packs), `Entity.bound` flags, `Game` persistent
  setup flag disabling victory, `tests/unit/fusion-persistent.test.ts`,
  ADR 014, DEC-IMPL-7/8.
- Standard-match backport in the same branch: lockstep rejoin — the room relay
  holds a dropped commander's seat for 120 s with empty `synthetic` turns,
  buffers relayed turns (≤50 k) and replays them on resume; the client drains
  catch-up at CPU speed and sends empty commands for turns ≤ `heldUntil`.
  Surrender only after grace expiry; non-lockstep matches unchanged.
  Files: `apps/service/src/rooms.ts`, `apps/service/src/index.ts` (dead-socket
  send guard), `packages/fusion/src/session.ts` (synthetic packets, stale-turn
  guard, catch-up drain, `heldUntil`), `packages/contracts` (`synthetic`,
  `heldUntil` fields), `apps/web/src/net.ts`, `apps/web/src/FusionBattle.tsx`.
- Proven: `vitest run tests/unit` — 22 files / 355 tests pass including
  snapshot-at-N/replay-to-M checksum equality across all four classic packs,
  join/leave lockstep agreement, transfer mid-combat, no-match-over, 2 h
  headless endurance (108 000 ticks, 0.346 ms/tick, 541 entities, heap Δ 9.2 MB,
  snapshot 450 KB), end-to-end lockstep rejoin with checksum equality after a
  200+-tick outage, and 3 room-coordinator resume tests. `pnpm typecheck` 0,
  `pnpm lint` 0.
- Open: 24 h endurance run in progress; region-runner/journal integration is
  PW07+; client replication wiring (snapshot+stream into FusionBattle) is PW08;
  cold-restart rejoin, late-join spectating/journal replay UI and server-side
  ranked verification remain open (DEC-IMPL-8, ADR 014 §5).
