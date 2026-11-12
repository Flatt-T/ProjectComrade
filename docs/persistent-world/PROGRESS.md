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

### PW11 - THU-2235 - newcomer settlement and one-hour setup protection - 2026-11-12

- State: implemented on branch `thu-2235-pw11-newcomer-settlement`; verification
  green locally (lint 0, typecheck 0, 407 unit, 67 integration � one
  pre-existing hibernation timing flake passes standalone).
- Deliverables: `spawnSeparationCells` (24) on `MmoRulesProfile`
  (`packages/contracts/src/mmo.ts`); versioned newcomer starter grant �
  `starter.ts` `starterLoadout()` resolves the faction-equivalent pick per
  COMRADE 18 role (MCV, harvester, 4 battle tanks, 2 light vehicles, 8
  infantry) with explicit `FactionDef.starter` picks on the TD pack and a
  derived fallback for every other pack; Fusion `join` accepts `playerId`,
  explicit `cell`, `starter {credits, units}` and `newcomerProtected`
  (`PlayerSetup`), is idempotent on the durable pid, marks every granted unit
  `bound`, and a bound MCV deploys a bound construction yard so the grant
  cannot be cashed out; player-scoped protection � `newcomerProtected`
  blocks all damage both directions and superweapon fire, mirrored by the
  journaled `setNewcomerProtection` command at tick boundaries
  (`packages/fusion/src/game.ts`, snapshot/restore covered);
  `packages/fusion/src/persistent.ts` carries the flag through snapshots.
- Service: schema v8 `settlement.protection` (serialized NEWCOMER
  ProtectionRecord, NULL = pre-tracking); `store.ts`
  `createSettlement`/`getSettlement`/`updateSettlementProtection`
  transaction-aware and one-settlement-per-player via `on conflict do
  nothing`; `spawn.ts` `pickSpawnCell` � deterministic viable-cell picker
  (vehicle-passable + buildable terrain + reachable resources) honouring a
  client preference only when it meets the separation band, otherwise
  maximising practical travel distance then resource richness;
  `ensureEntryRegion` returns the settlement region or the newest in-band
  frontier region / fresh empty-roster region; `world.ts` `settle` world
  action � validates region/faction, builds keep-away cells from live
  assets, writes the settlement + NEWCOMER protection + `NEWCOMER_SPAWN`
  economy_operation audit inside the journal transaction, returns the
  journaled `join` sim command (slot -1) with starter credits =
  `pack.startCredits.standard * starterCreditsMultiplier` (2x = 12,000 for
  TD), pokes the protection evaluator; re-settle is idempotent and a
  settlement whose sim roster was lost re-joins at the recorded cell
  without re-granting; `runner.ts` `protectionEval` now also reconciles
  rostered players' NEWCOMER records across the world � `owner_online`
  accumulates the live stretch without settling (inter-eval online time is
  never lost), `owner_offline` commits it, end at
  `setupProtectionOnlineMs` online time or `setupProtectionLapseMs`
  absolute, flag mirrored via `setNewcomerProtection`, eval chain reschedules
  only to real deadlines; `ensureProtectionEval` counts open newcomer
  settlements.
- Entry: `GET /api/mmo/enter` (`api.ts` + `mmo/entry.ts`) resolves the
  caller's durable identity (same guest guard as the gateway), provisions
  the player, and returns `{regionId, playerId, settled}` � settled players
  return to their settlement region, newcomers get a frontier region and
  `settled:false`. `/world` without `?region=` renders `PersistentEntry`;
  `PersistentWorld` shows a faction picker, sends the journaled `settle`
  intent, and adopts its sim slot when the join lands on the sim stream
  (slot, fog viewer and HUD all follow the durable pid).
- Proven: `tests/unit/fusion-newcomer.test.ts` 7/7 (grant composition,
  bound units, explicit cell, pid idempotent join, bound yard unsellable,
  two-way damage block, protection toggle, snapshot/restore, classic
  rejection); `tests/unit/mmo-spawn.test.ts` 5/5 (determinism, preference
  honoured/rejected, max-separation pick, degenerate-map fallback);
  `tests/integration/mmo-settle.test.ts` 6/6 against real PostgreSQL +
  runner + Fusion sim � first settlement end-to-end, retry idempotency,
  24-cell separation between newcomers, online-hour end with flag mirror,
  absolute-lapse end fully offline, entry region resolution flipping to
  settled; full suite 407 unit + 67 integration.
- Open: `transfer` does not yet check `bound` (barter/trade lands with
  PW13 � the sell path is already bound-gated); spawn-cell picker does not
  avoid live unit positions, only terrain/structures/resources; multi-map
  faction picks beyond TD derive automatically but are untested on other
  packs; client shows no protection countdown yet (PW25 surface).

### PW12 - THU-2236 - sell-for-credit evacuation defeat and protected MCV recovery - 2026-11-12

- State: implemented on branch `thu-2236-pw12-recovery`; verification green
  locally (lint 0, typecheck 0, 413 unit, 73 integration).
- Engine (`packages/fusion/src/game.ts`, `recovery.ts`): `structureRoles`
  derives recovery roles from StructureDef flags (construction-yard, power,
  refinery, barracks = produces infantry) so every pack qualifies without
  per-pack data; `isMcvUnit`/`isHarvesterUnit` helpers; `Command` gains
  journaled `grantRecovery` (bound `bound=2`, `recoveryProtected` MCV,
  idempotent on the live roster, faction-equivalent pick via
  `starterPicks`) and `setRecovery` (entering clears `defeated`, leaving
  clears every entity `recoveryProtected` flag); `Player` gains
  `recovering`/`recoveryAttacked`; `Entity` gains `recoveryProtected`.
  Recovery build gate: `canBuild`/`place` allow only whitelisted roles and
  one harvester (live + queued counted), upgrades/starport denied;
  structures placed during recovery carry the flag; the flag blocks damage
  both ways and superweapon fire; a recovering player's damaging another
  player sets `recoveryAttacked`; `deploy` propagates `recoveryProtected`
  (and `bound`) MCV -> yard; `MmoTuning.recoveryCreditCap` stops banked
  credits accruing above the cap (5,000) while recovering. Snapshot/restore
  carries all new fields (`persistent.ts`).
- Service: `world.ts` `sell` world action - validates ownership/structure/
  `bound===0`, computes the engine refund rule, writes `SELL_REFUND`
  economy_operation + asset_ledger (`physical_state='destroyed'`, no
  salvage) inside the journal transaction, pokes `recovery_eval`, returns
  the journaled sim `sell`; `endRecovery` - loads the active RECOVERY
  record, `protectionTransition(player_end_recovery)`, closes the episode,
  writes `RECOVERY_TRANSITION`, mirrors `setRecovery off`. `runner.ts`
  `recovery_eval` scheduled job (dispatched via `defaultJobHandler`):
  ACTIVE episodes - milestone counts (power + barracks structures),
  `recoveryAttacked` -> 'abandoned', milestone -> 'completed', protection
  record + episode + outbox + sim mirror all in one fenced transaction,
  self-heals a lost `setRecovery` mirror AND re-issues a lost
  `grantRecovery` (protected MCV cannot be destroyed, so missing = lost
  grant); DETECTION - rostered+settled player with zero non-destroyed
  compounds world-wide, no structure, no MCV and no packed carrier in the
  sim gets `openRecoveryEpisode` (global partial-unique index = one active
  episode per player), RECOVERY protection record, `RECOVERY_GRANT` +
  `RECOVERY_TRANSITION` economy ops, journaled `grantRecovery` +
  `setRecovery` sim mirrors; never-settled roster placeholders excluded.
  Eval chain reschedules every 15 s ONLY while a rostered player is online
  (presence query) - quiescent regions stay hibernatable; pokes on sell,
  on presence notify (`pokeRecoveryEval`, incl. settlement region for
  wiped players with no compound), and a boot ensure cover the rest.
- Client: `commandToMmo` maps Fusion `sell` to the durable world action;
  `PersistentWorld` shows a RECOVERY badge + banner with an "End recovery"
  button sending the journaled `endRecovery` intent.
- Proven: `tests/unit/fusion-recovery.test.ts` 6/6 (grant idempotency,
  explicit cell, snapshot/restore, role whitelist + single-harvester cap,
  placement-time gate + flag propagation, attack flag, unsellable bound
  MCV); `tests/integration/mmo-recovery.test.ts` 6/6 real PG + runner +
  sim - SELL_REFUND op+ledger, bound refusal, sale-under-attack allowed,
  wipeout grant idempotent, attack end 'abandoned', last-building sale
  grant + power/barracks milestone 'completed', endRecovery close;
  full suite 413 unit + 73 integration (hibernation CPU scaling still
  0 ms across 8 quiescent regions).
- Open: PACK/BARTER remain unimplemented engine ops (PW13/PW26) - the
  contract already excludes them from `operationMayTriggerRecovery` and
  bound=2 blocks the sell path; `transfer` bound-check still owed to
  PW26; packed-building-carrier detection is vacuous until transport
  lands (MCV/compound checks already cover today's carriers); recovery
  credit cap is engine-side only (durable accrual journal doesn't cap
  yet); multi-region MCV/units visibility is region-local - a player
  rostered here with assets only in another region's sim could false-
  positive (mitigated: compounds are world-checked, roster co-locates
  with assets until inter-region movement exists).

### PW25 (milestone 1) - THU-2272 - opt-in notifications and away report - 2026-11-12
- Contracts (`packages/contracts/src/mmo.ts`): `NotificationKind`
  (compound_under_attack, shield_ending, storage_full,
  superweapon_nearby, trade_offer, ally_call), `NotificationPrefs`
  per-channel opt-in (inApp / webPush / email) all default OFF,
  `notificationRules` profile block (dedupe window, shield-warning
  horizon, max per window), `awayReport` server message + REST shapes,
  capability keys notifications / notificationsEmail / awayReport.
- Schema v9: `player_notification_prefs` (one row per player+channel,
  opt-in only), `player_notification` (durable, dedupe_key unique per
  player, read_at nullable), `player_offline_since` presence marker.
- Store (`apps/service/src/mmo/store.ts`): pref get/upsert, insert
  notification ON CONFLICT dedupe, list unread/all, mark-read,
  away-report query joining notifications + region journal tail.
- Producer (`apps/service/src/mmo/runner.ts` + `notify.ts`):
  `notify_eval` scheduled job (same fenced-journal pattern as
  protection/recovery eval) detects: compound in battle
  (`battleAt` within window), active shield ending inside
  `shieldWarningMs`, storage at cap, superweapon strike nearby;
  emits durable notifications with `dedupe_key` = kind+subject+window
  so repeated damage/conditions cannot spam; delivery honours per-
  channel opt-in via the existing outbox/gateway path (in-app push
  message now; web-push/SES adapters in `ses.ts`/`notify.ts` wired to
  config and gated on credentials).
- API (`apps/service/src/api.ts`): GET/PUT notification prefs,
  GET notifications, POST mark-read, GET away-report.
- Web: `apps/web/src/api.ts` typed methods; `PersistentWorld.tsx`
  notification panel (unread badge, kind icons, mark-read), per-channel
  opt-in toggles, away-report modal listing offline-window entries with
  region/event_seq replay references into the journal.
- Proven: `tests/unit/mmo-contracts.test.ts` 20/20 (pref validation,
  capability parsing, defaults off); `tests/integration/
  mmo-notify.test.ts` 6/6 real PG + runner + sim - attack dedupe per
  window, shield-ending once, storage-full + superweapon_nearby,
  opt-in/unsubscribe stops all channels, defaults off + mark-read,
  away report contains durable notifications inside the offline
  window; full suite 413 unit + 79 integration green; lint + typecheck
  clean; service + web builds pass.
- Open: trade_offer / ally_call producers land with PW13/PW25-M2
  (no trade/alliance-chat surface yet); web-push VAPID + SES send are
  config-gated and need owner credentials to go live; away-report
  replay parity (journal checksum match) asserted structurally via
  event_seq references, not yet a dedicated checksum test;
  milestone-2 items (objectives, daily/weekly rewards, alliance chat,
  mute/report, map pings) remain.

### PW27 - THU-2274 - isolated beta deployment and three-browser scenario - 2026-11-12

- Beta environment: pull-deployer on Proxmox guest 10.10.0.60
  (`/opt/comrade-beta`, compose + service.env), image
  `ghcr.io/flatt-t/projectcomrade:<sha>` selected from the newest
  `beta-*` prerelease by `published_at` (PR #31). Guest Postgres at
  10.10.0.35 (`comrade_beta`, sslmode=require), `MMO_ALLOW_GUESTS=1`
  for the scenario. Served at beta.projectcomrade.co.uk; local verify
  via SSH tunnel to 10.10.0.60:3002.
- Client/transport fixes found only by live browser testing:
  `/world` added to SPA routes (PR #32); single `server.on('upgrade')`
  dispatcher for `/mmo` + `/ws` (PR #33 - the separate
  `WebSocketServer({server})` swallowed `/mmo` upgrades with 400);
  `onSnapshot` dispatch wired so `__comradeWorld` builds (PR #34 -
  the settle overlay appeared but the rig never did); integer-ms
  region sim-start anchor (PR #35 - float tick broke restore);
  presence-aware quiescence + command-path wake (PR #36 - regions
  hibernated under connected-but-idle players, stranding commands
  with REGION_UNAVAILABLE).
- Shield surface for the scenario (PR #30): `GET
  /api/mmo/protection` read model (compounds, OFFLINE_EARNED
  records, available/earned/nightly seconds) and the shield panel -
  presets 1h/4h/8h/24h + custom seconds, remaining-hours display,
  arm/clear via the journaled selectShield/clearShield actions.
- Live scenario on beta commit 853b225 (three independent browser
  contexts, guests, region 3417e60a):
  - Spawn: three players settled same region (GDI/GDI/Nod, slots
    3/4/5 after six total), 16 bound starter units each, credits
    12000->~10656, newcomerProtected on.
  - Build: each MCV moved to open ground, deployed bound `fact`
    yard, built+placed `nuke` (power), `proc` (refinery + free
    harvester), faction barracks (`pyle` GDI / `hand` Nod);
    powerGen 100 / powerUse 40-60, queues drained, credits ~8.6k.
  - Alliance + shield: A created alliance, invited+accepted B;
    B PUT notification prefs {inapp:true} (200); B armed a 3600s
    OFFLINE_EARNED shield through the real panel UI ("Armed 1h 0m -
    starts when you go offline", 7h available).
  - Orders: A unit move observed en route; C lighttank attacked A's
    `nuke` - HP 10000 -> 7348 over ~30s once newcomer protection
    lapsed (protected players cannot fire or be damaged, verified
    both directions during the window).
  - Offline cycle: B disconnected ~100s - away-report endpoint
    returned the window (empty entries, nobody attacked B);
    protection record consumed ~30s armed->active->paused; second
    ~95s absence observed from A's replica with B's `fact` yard
    `shielded=true` mid-absence, then paused back to `armed` on
    reconnect with armedSeconds preserved (3600 -> 3535 across both
    absences). Reconnect restored same playerId/slot - guest
    identity persists across disconnect.
- Open: beta DNS/Let's Encrypt cert remains owner-blocked (currently
  plain-HTTP tunnel verification); stray browser contexts/pages from
  earlier runs accumulate - scenario scripts discover pages by
  playerId across all contexts; MCP evaluate kills multi-minute
  in-page waits, so long phases are driven as short issue/poll
  steps; dependency-check CI advisory still fails (pre-existing,
  non-blocking).

## PW13 - allied barter (THU-2237)

- Journaled barterOffer/barterAccept/barterDecline/barterCancel in the
  world handler (world.ts): free-priced bilateral packages over units,
  credits, earned shield seconds and power-ups; packedBuilding items
  reject UNSUPPORTED_ITEM until PW14.
- Settlement is one journal transaction: offer claimed via
  status='open' guard (duplicate/competing accepts lose with zero side
  effects), BARTER economy_operation + asset_ledger rows per transferred
  unit, earned-shield and power-up balances moved in-tx, then sim
  commands (transfer + new adjustCredits engine command) apply at the
  same journal boundary.
- Reservations: open outgoing offers lock credits/shield seconds/power-up
  counts and unit refs so the same asset cannot be offered twice;
  acceptance revalidates EVERYTHING fresh (unit alive/owned/unbound/
  uncarried, balances, permissions, harvest gate) so death or state
  change before settlement rejects cleanly (GIVE_* reasons).
- PW26 gates: bound assets untransferable, nightly shield hours never
  enter the tradable pool (earned only, minus shield-armed commitments),
  starter-grant harvest gate on both sides, every settlement audited.
- Alliance model: both parties need 'trade'; unit-carrying sides need
  'unitTransfer'; leader implicit.
- REST: GET /api/mmo/trade-offers (incoming/outgoing inbox); /world UI
  lists offers with Accept/Decline/Cancel (offer authoring stays
  wire-protocol for now - noted gap).
- Tests: tests/integration/mmo-barter.test.ts 11/11 (real PG + runner):
  credits settle + audit, mid-battle unit handover preserving
  hp/position/orders with old-owner authority loss, duplicate accept,
  decline/cancel, unit reservation, death-before-settle,
  insufficient-at-accept, earned-only shield transfer, bound-unit and
  harvest-gate rejection, power-up exchange.
- Also fixed latent adjustPowerup bug: negative deltas violated the
  count>=0 check on the INSERT path before ON CONFLICT resolved.

## PW14 - packed buildings, barter carriers, superweapon redeployment (THU-2238)

- One stable asset identity: pack morphs the SAME entity in place
  (kind structure->unit, type -> `pack_<structure>`), so the sim id and
  therefore the durable entity id never change across pack, barter and
  redeploy. `Entity.packedType` marks the carrier form; snapshots
  predating PW14 normalize it to ''.
- Carrier defs are synthesized per pack by `withPackedCarriers()` and
  injected ONLY into persistent games (Game constructor when
  persistent:true, restoreGame for persistent snapshots) - classic
  matches, mashup composition, audio catalogs and pack-integrity tests
  never see them. tech 99 keeps carriers out of every build menu.
- packStructure frees the footprint, drops storage/power, turns docked
  harvesters away and zeroes superweapon charge; unpackStructure
  re-validates adjacency + canPlace BEFORE mutating, so an illegal site
  can never lose or duplicate the asset (D6: charge restarts from zero
  on redeploy, no extra delay).
- World actions pack/unpack/redeploy journaled with PACK/UNPACK/DEPLOY
  economy_operation + asset_ledger rows ('packed'/'deployed' physical
  states). Bound assets, walls, floors and water builds reject
  NOT_PACKABLE; non-owners and non-carriers reject cleanly.
- packedBuilding barter items now settle through PW13: validation
  requires a live unbound carrier owned by the giver; the ledger row
  records physical_state 'packed' so payment and carrier ownership move
  atomically in one journal transaction.
- Compounds: a packed construction yard keeps its compound identity in
  state 'packed' (syncCompounds carries the state through); recovery
  anchors count deployed structures AND carriers so packing the last
  building never triggers a duplicate recovery grant.
- Superweapon redeployment notifies every settled player in the region
  (system notification, deduped per operation).
- Client: selection panel gains Pack / Redeploy-here actions for owned
  packable structures and carriers (PersistentWorld.tsx).
- Tests: tests/unit/fusion-packed.test.ts 8/8 (morph identity/HP/
  ownership, footprint+storage release, valid/invalid/unreachable
  sites, superweapon charge reset, snapshot round-trip, classic-match
  rejection); tests/integration/mmo-packed.test.ts 5/5 (real PG +
  runner: pack->audit->redeploy, invalid-site safety, packedBuilding
  barter end-to-end with 'packed' ledger state, compound packed->active
  cycle, bound/wall/non-owner rejection).
- Known gaps (explicit decision gates, not implemented): dedicated
  transport rules between regions, carrier-destroyed salvage detail
  (rides the existing unit-death path until PW24), charge-progress
  announcement beyond the deploy notice, offer-authoring UI for
  packedBuilding (wire-protocol works).

## PW17 - fixed factions, mixed forces, pack availability (THU-2241)

- Fixed faction: player.faction is stamped at join/settle and no command
  path mutates it (verified by test). Every entity now carries
  `Entity.faction` � the faction it was CREATED under, stamped in blank()
  and preserved through transfer, packing and redeploy. Pre-PW17 snapshots
  normalize it to the owner's faction.
- Imported factories (COMRADE 18 amendment): production is now
  factory-scoped in persistent games. `factoryFaction()` resolves the
  faction a building fields � faction-locked structures produce their own
  faction's units regardless of current owner; shared ones fall back to
  creator faction then owner. `eligibleFactories()` gates each candidate
  by factionCanUse(unitDef, factoryFaction) + owner prereqs.
- Role-matched prerequisites: `structurePrereqRoles()` maps structures to
  role keys (power, refinery, infantry/vehicle/aircraft/naval-plant,
  tech-centre, superweapon, construction-yard) with a faction suffix for
  faction-locked defs � 'nuke' accepts any power plant, 'pyle|hand' a
  barracks of either faction, 'tmpl' still requires the NOD superweapon
  (a GDI 'eye' does not substitute). '@level' matches the best upgrade
  level held for that role. Role-less prereq ids fall back to exact
  type+level. Classic matches keep exact prereqsMet � deliberate
  persistent-only change, classic fidelity untouched.
- Build menu: importing a factory never adds the donor faction's
  structures � structure/defense items remain player-faction gated;
  unit queues offer whatever ANY owned eligible factory can produce
  (gdi player with an imported nod 'hand' sees flamethrower, not
  grenadier which still needs a gdi barracks).
- Production routing picks an eligible factory per item (preferring the
  prereq-named one); ineligible queues stall rather than misproduce.
- Pack compatibility manifest (apps/service/src/mmo/packs.ts):
  PERSISTENT_PACK_MANIFEST declares per-pack revision + status
  (supported/retained/unsupported). The region runner refuses specs whose
  packId is not runnable; new worlds pin the manifest revision via
  entry.ts. 'td' is the supported baseline; future packs must prove
  Fusion-mechanics compatibility before listing � unsupported combos are
  explicitly unavailable, never substituted. Retired revisions stay
  'retained' so existing worlds keep resolving; snapshots pin packId so
  restores never hot-reinterpret content.
- Tests: tests/unit/fusion-mixed.test.ts 8/8 (creator-faction stamp +
  transfer preservation, fixed-faction invariant, imported factory roster,
  real production of a nod unit for the gdi owner, faction-specific tech
  gating incl. eye?tmpl, nuk2 satisfies power role, donor structures stay
  out of the build menu, manifest accept/reject); tests/integration/
  mmo-mixed.test.ts 1/1 (real PG + runner: packed nod 'hand' bartered to
  gdi player via PW13/PW14 path, redeployed, mixed-force buildOptions and
  faction gates verified live).
- Full suite: 429 unit + 96 integration green; typecheck + lint clean.
- Known gaps: cross-PACK mixed forces (units from a second rule pack in
  one region) await an approved second pack + adapter proof � the manifest
  is the gate; AI players do not exploit imported factories (they build
  for their own faction only); starport queue eligibility follows the same
  per-factory rule but no td starport structure exists to exercise it.
