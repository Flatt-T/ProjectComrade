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

- State: merged to `main` (PR #17, squash `db47228`); THU-2269 Done.
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

### PW07 - THU-2231 - durable region scheduler and runner - 2026-11-11

- State: MERGED to main as aac888f (PR #18); THU-2231 Done.
- Deliverables: `apps/service/src/mmo/runner.ts` (RegionRunner: fenced lease
  acquire/renew, snapshot restore + journal-first replay, wall-clock<->tick
  anchor via `region.started_at_ms`, real-time stepping, periodic checkpoint,
  durable job claim/apply/finish in one transaction, stale-worker fail without
  clobbering the new owner), migration v3 (`started_at_ms`, lifecycle
  `checkpointing`/`inactive`, job `attempts`/`last_error`/`dedupe_key`),
  epoch-fenced `claimDueJobs` + attempt-refunding `releaseJobClaim`,
  `@comrade/fusion` workspace package so the service consumes the real engine,
  fixture sim spec in `region.seed.sim`, `tests/integration/mmo-runner.test.ts`
  (9 tests).
- Proven: `vitest run tests/integration` - 3 files / 32 tests pass against real
  PostgreSQL 16 (docker `comrade-mmo-test-pg`) incl. journal-ordered command
  application with intent completion, deduplicated resubmission, durable-id
  resolution and UNKNOWN_ENTITY rejection, exactly-once scheduled jobs with
  journal+outbox+completion atomicity, dedupe-key suppression, shield_expire
  default handler, epoch-fenced claims, stale-worker fence loss, claim-expiry
  reclaim, and stop-checkpoint -> restore -> journal replay across a simulated
  restart. `vitest run tests/unit` 22 files / 355 pass, `pnpm typecheck` 0,
  `pnpm lint` 0, `pnpm --filter @comrade/service build` 0.
- Open: runner is library-only (no WS/HTTP wiring - that is PW08/PW09); world
  actions need per-kind handlers registered by later issues; quiescent/hibernate
  accrual is PW22; checkpoint interval default is stop-only (`checkpointEveryTicks`
  option exists for the beta config).

### PW08 - THU-2232 - region orchestration, /mmo gateway and client transport - 2026-11-11

- State: MERGED to main as 04ec477 (PR #19, commits 98cc9e5 + d422d70 ESM fix); THU-2232 Done.
- Deliverables: `apps/service/src/mmo/regions.ts` (RegionService: on-demand
  runner supervision with bounded restart backoff, subscription snapshots,
  durable player provisioning, fence lookup), `apps/service/src/mmo/gateway.ts`
  (`/mmo` WebSocket: guest/account identity from upgrade cookies, subscribe ->
  welcome+snapshot, journaled commands -> commandResult, ordered `mmo.sim`
  event fan-out, 2 s authoritative observations, stale-epoch and rate limits),
  contracts (durable entity-id bridge `mmoEntityId`/`mmoSimEntityId`,
  capabilities/decisions, snapshot/event/welcome/observation/result messages),
  runner durable-entity bridge + `mmo.sim`/`mmo.result` outbox emission,
  `apps/web/src/mmo.ts` (MmoConnection + PersistentSession: snapshot restore,
  wall-time stepping, durable-id intents, no client prediction) and
  `apps/web/src/PersistentWorld.tsx` + `/world?region=` route (select/move/
  attack/harvest/build/place/repair/guard/scatter/stop/deploy/enter/super,
  checksum-mismatch auto-resync). `/mmo` is inert unless `MMO_DATABASE_URL` is
  set; classic `/ws` is untouched.
- Proven: `vitest run tests/integration/mmo-gateway.test.ts` - 4 tests pass
  against real PostgreSQL + real WebSocket clients (guest welcome + durable
  player provisioning, snapshot + observation stream, ordered sim event +
  applied result fan-out, UNKNOWN_PLAYER authoritative rejection, STALE_EPOCH,
  same-cookie reconnect -> same player + fresh snapshot). Full suite:
  `pnpm test:unit` 22 files / 355 pass, `pnpm test:integration` 4 files /
  36 pass, `pnpm typecheck` 0, `pnpm lint` 0.
- Open: region entry is URL-driven (`/world?region=<id>`) - there is no lobby
  region picker yet; fog is render-side only (documented DEC-IMPL-9); world
  actions (sell/barter/shield/chat/ping/objective) journal but need handlers
  from PW09+; client e2e (Playwright) pending; capacity measurements pending.

### PW22 - THU-2270 - region hibernation and capped idle accrual - 2026-11-11

- State: implemented on branch `thu-2270-pw22-region-hibernation`, PR #20 (in progress).
- Deliverables: `Game.fastForwardQuiescent(ticks, rates)` in
  `packages/fusion/src/game.ts` (arithmetic per-tick production with cached
  factory/speed context, measured per-slot harvest accrual with income bonus
  and storage cap, `stats.harvested` parity with live delivery);
  `RegionRunner` quiescence detection (rejects deliberate orders incl. timed
  `deploy`/`rearm`/`enter`, armed entities with enemies in weapon range,
  pending journal input, scheduled jobs inside `inboundLookaheadMs`),
  hibernation metadata in snapshots (`hib`: wall anchor, sim tick, per-slot
  rates), lease release + lifecycle `quiescent`, journaled `accrual` event on
  wake applied exactly once (schema migration v4 adds the `accrual` kind),
  wall-clock re-anchor after wake, restore path that re-applies the slept
  interval even when the accrual event is already marked applied (crash
  between apply and checkpoint cannot lose or double it);
  `hibernateMinAwakeMs` (default 300 000) in `MmoRulesProfile` with parser
  validation; `RegionService` wake poller (`wakePollMs`, default 5 000) and
  `wakes`/`wakeLatenciesMs`/`hibernations` metrics.
- Proven: `vitest run tests/unit/fusion-quiescent.test.ts` 6/6 (incl. live vs
  fast-forward queue equivalence over 20k ticks); `vitest run
  tests/integration/mmo-hibernation.test.ts` 6/6 against real PostgreSQL +
  real Fusion: hibernate->checkpoint->lease release->ticking stops; no
  hibernation under orders then hibernates once idle; wake accrual once,
  storage-capped, exactly once across a simulated crash; queued production
  completes during quiescence; service poller wakes a region for an in-window
  scheduled job; scaling measurement `[pw22-load] awake control: 415 ticks,
  234.0ms cpu; 8 quiescent regions: +0 ticks, 47.0ms cpu over 1500ms`.
  Full integration suite 5 files / 42 tests pass. Also fixed a PW08 CI
  regression: `@comrade/fusion` emitted extensionless ESM specifiers that
  crash plain `node dist/index.js` once `/mmo` pulls the engine in - all
  relative imports now carry `.js` (commit on the PW08 branch).
- Open: hibernation look-ahead covers scheduled jobs and pending journal
  input; cross-region inbound transfers waking a region land with PW10+.

### PW23 - THU-2275 - persistent pacing profile and anti-snowball rules - 2026-11-11

- State: merged to main as `d5456d3` (PR #21, commits `745b891` + `cb12e68`
  command-intent race fix); THU-2275 Done.
- Deliverables: `MmoRulesProfile` extended with every COMRADE 18 §2.4/§3 tunable
  in one validated place (`structureHpMultiplier`, `armySupply`, `maxCompounds`,
  `baseLevelMinutes`, `powerScoreWeights`, `spawnRegionPowerBandRatio`,
  `spawnCohortBaselineScore`); engine `MmoTuning` carried through
  `GameSetup`/snapshot/restore and ignored entirely outside persistent mode;
  structure HP scaling at spawn; supply cap gating queue admission and production;
  per-minute supply upkeep inside `step()` and `fastForwardQuiescent`;
  compound cap inside `canPlace` (ghost, AI and place command share the gate);
  `computePowerScore`/`powerScoreMismatch`/`spawnRegionInBand` contracts;
  runner persists member power scores at every checkpoint (schema v5
  `world_member.power_score`); `apps/service/src/mmo/spawn.ts` frontier
  selection + frontier-region generation.
- Proven: `vitest run tests/unit/fusion-pacing.test.ts` 14/14 incl. balance
  harness `[pw23-balance] small: 14.0 min, medium: 24.7 min, large: 30.0 min vs
  20 tanks` (developed-base band 20-30 min met at multiplier 25);
  `tests/unit/mmo-contracts.test.ts` profile validation cases;
  `vitest run tests/integration/mmo-pacing.test.ts` 4/4 against real
  PostgreSQL + real Fusion (checkpoint power-score persistence, in-band frontier
  join, out-of-band frontier generation, empty-world first spawn).
- Open: anti-snowball reward suppression is contracted and unit-tested; wiring it
  into salvage/ladder payouts lands with PW24/PW26. Frontier join places the
  newcomer in the world + region roster selection; the join command into a live
  region sim is exercised by PW11 settlement work.

### PW09 - THU-2233 - persistent identity, alliances and limited caretaker - 2026-11-12

- State: merged to `main` (PR #22, squash `0fd60cc`); THU-2233 Done.
- Deliverables: `MmoWorldAction` alliance + caretaker union and parser
  validation (`packages/contracts/src/mmo.ts`); `AlliancePermissions` grant set
  (station/reinforce/trade/unitTransfer — membership grants nothing, leader
  implicit, construction never grantable); schema v6 extending the PW05 alliance
  tables (`ally_key` sequence, `alliance_invite`, per-member `permissions`,
  presence columns `online_count`/`online_since_ms`/`offline_since_ms`/
  `last_seen_ms`, `player.auto_repair`); store lifecycle functions
  (create/invite/join/leave/kick/succession/disband/permission grants) plus
  `alliancePermission` mutual-consent check and presence helpers; engine
  `Player.ally`/`Player.autoRepair`, `isEnemy` alliance awareness, persistent-only
  `setAlly`/`setAutoRepair` commands, bounded caretaker auto-repair (1% max HP
  per in-game minute, no spend/orders), snapshot/restore of both fields;
  `apps/service/src/mmo/world.ts` journaled world-action handler returning
  `mmo.result` + fan-out `mmo.sim` commands; runner world-handler wiring,
  multi-command sim fan-out and fresh-region ally/autoRepair seeding;
  gateway guest rejection (`GUEST_NOT_ALLOWED` when auth enabled,
  `MMO_ALLOW_GUESTS=1` dev hatch), durable-identity provisioning guard in
  `RegionService.playerFor`, and socket-count presence with offline grace.
- Proven: `tests/unit/fusion-ally.test.ts` 10/10; `tests/unit/mmo-contracts.test.ts`
  parser cases; `tests/integration/mmo-alliance.test.ts` 10/10 against real
  PostgreSQL + real runner — display-name reuse cannot claim an identity,
  guest provisioning rejected, journaled alliance create/invite/join syncs the
  sim ally key, membership grants zero permissions until explicit grants,
  mutual-consent `alliancePermission` semantics, allies reinforce while
  non-allies cannot, revoke kills permissions without ending membership,
  leave/kick restore hostility and resync `ally = -1`, leader succession,
  `setAutoRepair` durable+sim, presence multi-socket/offline-grace.
- Open: `alliancePermission` is the enforcement primitive; the barter/trade
  actions that consume `trade`/`unitTransfer` grants land in PW13/PW17, and
  shield-gated reinforcement boundary completes with PW10 protection. Client UI
  for alliances/presence is not part of this issue.

### PW10 - THU-2234 - manual offline shields and allied protection boundary - 2026-11-12

- State: implemented on branch `thu-2234-pw10-offline-shields`; verification
  green locally (lint 0, typecheck 0, 395 unit, 61 integration).
- Deliverables: `shieldRadiusCells` on `MmoRulesProfile`; Fusion persistent
  shield state — `shielded` entity flag, journaled `setShield` command applied
  at tick boundaries, enforcement across movement, damage, fire, superweapons,
  paradrops and `battleAt` tracking (`packages/fusion/src/game.ts`);
  `packages/contracts/src/mmo.ts` action/profile surface; schema v7 —
  `shield_balance` nightly/earned kinds with `nightly_day`/`earned_day`/
  `earned_today_seconds` lazy daily accounting, composite
  `protection_record (compound_id, kind)` PK for PW10+PW11 coexistence,
  `armed_at_ms`; store layer — `armShieldRecord`, `clearShieldRecord`,
  `applyShieldTransition`, `consumeShieldSecondsAuto` (nightly-first),
  `grantEarnedShieldSeconds` (daily income cap, idempotent effect keys),
  `availableShieldSeconds`/`committedShieldSeconds` over a generic `Queryable`,
  transaction-aware `scheduleJob`/`pokeProtectionEval`/`setAutoRepair`;
  world actions `selectShield`/`clearShield` (explicit selection only,
  `compoundForPlayer` ownership, `INSUFFICIENT_SHIELD`/`SHIELD_ACTIVE`/
  `NO_SELECTION` reasons); runner `protectionEval` scheduled job — reconciles
  open `OFFLINE_EARNED` records against durable presence inside the fenced
  job transaction, applies contract `protectionTransition`, consumes elapsed
  seconds, chains evals only to real deadlines, mirrors the active set into
  the sim via journaled `setShield` plus `mmo.sim` outbox rows;
  `syncCompoundsNow` durable compound reconciliation; presence connect/
  disconnect pokes including a grace-expiry poke (`regions.ts`, `gateway.ts`).
- Semantics: selection only arms — activation requires the owner offline past
  `offlineAfterMs` and the compound out of battle; shield start is
  `max(offline grace end, armed_at_ms)` so a long-offline owner still gets the
  full selected duration; online presence pauses and preserves unused time;
  expiry is authoritative on absolute `ends_at_ms`; consumption is
  nightly-first then earned, drawn in the same transaction as the transition.
- Proven: `tests/unit/fusion-shield.test.ts` 9/9 (movement boundary, owner/
  ally/outsider admission oracle, hostile-fire immunity inside, allies
  protected, protected units leave to engage, snapshot/restore + pre-PW10
  default, classic-mode isolation, `battleAt` stamping);
  `tests/integration/mmo-shield.test.ts` 5/5 against real PostgreSQL + runner
  + Fusion sim — explicit arm-only selection, offline activation after grace,
  authoritative expiry with nightly-first consumption, pause preserving unused
  time, foreign-compound/overdraft/duplicate-command rejection, earned
  stacking + post-nightly consumption, snapshot/restart persistence;
  full integration suite 61/61, unit 395/395.
- Fixes found in verification: journal-transaction self-deadlock — pool-side
  `scheduleJob` inside the fenced world-handler tx needed `FOR KEY SHARE` on
  the `region` row locked `FOR UPDATE` by `assertRegionFence`; resolved by
  running pokes/jobs writes on the transaction client; `battleAt = -1`
  sentinel read as in-battle for the first `battleWindowMs`; long-offline
  owners got instantly-expired shields because activation backdated to grace
  end regardless of arm time — fixed with `armed_at_ms`; test isolation —
  file-scoped presence leaks closed via `afterEach` disconnect and
  `RegionService.stopAll()` in hibernation teardown.
- Open: `RegionService.stop()` stops only the wake poller — callers needing
  runner shutdown must use `stopAll()` (production has no shutdown path yet);
  pg@8 logs a deprecation warning for the `pool.on('connect')` search_path
  pattern in both db pools (pre-existing, queries still queue); shield
  selection client UI lands with the PW25 notification/away-report surface.
