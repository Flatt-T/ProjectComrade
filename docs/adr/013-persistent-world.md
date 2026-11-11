# ADR 013 — Persistent world mode: Fusion Engine, journal-first authority, beta isolation

Status: Accepted
Date: 2026-11-11
Issue: THU-2225 (PW01) · Epic: THU-2224 · Supersedes nothing; extends ADR 008/010

## Context

The owner approved an additional **persistent-world ("massively multiplayer") mode** for
COMRADE: a permanent real-time world where bases, production, combat and scheduling
continue while players are offline. COMRADE 18 (11 Nov 2026) records the owner decisions
and the design review's amendments; where older documents (COMRADE 11–17) conflict,
COMRADE 18 wins. The September plan assumed a Vanilla Conquer headless WASM runner (C04);
the repository state of 11 Nov 2026 contradicts that premise — C04 is still Backlog and
only compile/link was ever evidenced — while the Fusion Engine already ships a
deterministic integer simulation, seeded RNG, command-only input, per-tick checksums,
lockstep multiplayer and all four classic packs in one sim, runnable in Node.

## Decision

### 1. Engine: the Comrade Fusion Engine, under a separate persistent rules profile

The persistent world runs on `packages/fusion` — the same deterministic simulation as
the standard game — extended for massively multiplayer use (PW21, THU-2269). Vanilla
Conquer and the C04 headless-WASM path are **not** dependencies and remain Classic-only.
"Do not write a second simplified simulation" means: no parallel auto-battle calculator;
in-region truth lives in the real Fusion sim. Classic matches keep their existing rules,
protocols and evidence gates untouched; persistent mode is an addition under its own
versioned rules profile (`persistent_world`), never a silent change to classic balance.

### 2. Journal-first, single authority (COMRADE 18 §2.2)

The **region simulation is the only authority** for entities inside a region. Every
simulation-affecting input — player command, scheduled job, trade settlement, transfer
arrival — is first committed to the region journal in PostgreSQL under the region
fence, then applied by the sim in journal order at a tick boundary. Region state =
snapshot + journal replay, verifiable through Fusion's determinism and checksums.
PostgreSQL is authoritative only for what lives outside a region sim: accounts,
alliance membership, shield-hour and power-up inventories, ladder, trade offers,
cross-region transfers, journals and snapshots. `asset_identity`-style tables are
derived read models, never independently writable; stable entity IDs live in sim state.
This replaces the earlier prepare/commit/apply dual-write tick-barrier design, which was
the plan's largest duplicated/lost-asset risk. Region leases, fencing, idempotent
command IDs, the transactional outbox and the cross-region transfer state machine from
COMRADE 13/14 are retained.

### 3. Region hibernation (COMRADE 18 §2.3, PW22)

A region is *quiescent* when nothing is moving under orders, no hostiles are within
engagement range, and no transfer arrives inside the look-ahead window; it then stops
ticking after a checkpoint. While quiescent, queues complete by durable deadline and
harvesting accrues at the region's measured recent rate **capped by storage**; shield and
protection timers run from server time. Any event that could change the outcome wakes the
region: accrual is applied to that instant, then real simulation resumes. This bounds
server cost by active play rather than stored bases, and replaces the blanket ban on
rate-based harvesting for quiescent intervals only — consequential simulation is never
approximated.

### 4. Beta isolation (COMRADE 15/18 §2.8)

The beta runs in a **new Proxmox container** (never LXC 280), its own hostname
(`beta.projectcomrade.co.uk` proposed), a **separate database and role** on the shared
PostgreSQL server (proposed `comrade_beta` / `comrade_beta_app`), beta-scoped secrets,
session names and backups. The live `comrade` schema, site, credentials and container are
read-only references. Merging to `main` must not change what production serves; all
persistent-world code stays behind a server-side flag that is off in production. The
beta role gets a connection limit, pool cap and statement timeout so it cannot exhaust
the shared server. Capacity target to measure against: 200 registered, 50 concurrent,
20 regions — a target, not a claim.

### 5. Client replication and its accepted limitation (COMRADE 18 §4)

For the beta, the browser receives a snapshot plus the ordered command stream and runs
the same sim locally; the server's checksum is the authority and a mismatch triggers a
fresh snapshot. This reuses the lockstep code and keeps bandwidth low. **It exposes hidden
state to a modified client (map hack); that exposure is accepted for the beta and is
documented, not described as fog-secure.** Whether server-side fog filtering is required
before leaving beta is an open decision (COMRADE 18 §6); the design leaves it a
configuration-gated layer.

### 6. Standard-game benefits carried by the same work (COMRADE 18 §4)

Snapshot/replay, rejoin-from-snapshot, late-join spectating, server-side match-result
verification and optional salvage/sites in skirmish are applied to the standard game as
part of PW21 — useful capabilities, not scope creep.

## Consequences

- Persistent mode is a new `mmo`-schema data layer inside the **beta database** plus a
  new versioned protocol (`comrade.mmo.v1` proposed) on a separate WSS route; classic
  `/ws` lockstep and the `comrade` schema are untouched.
- `packages/fusion` needs a package boundary the Node service can import (today only
  `apps/web` consumes it by relative path); PW21 owns that change.
- Determinism is the recovery mechanism: snapshot + journal replay must reproduce
  committed state, and every crash window (before commit, after commit before apply,
  during handoff) is a named test, not an assumption.
- An existing `beta-*` GitHub pre-release channel deploys to port 3002 on LXC 280; it is
  a public-test channel for classic/fusion builds and is **not** this beta. Names,
  credentials and routes must not be conflated (see BASELINE.md).
- Open items (paid tiers in persistent world, bridge rules, hostile engineer capture,
  fog security) are tracked in `docs/persistent-world/DECISIONS.md` §C and built so each
  answer is a configuration change.
