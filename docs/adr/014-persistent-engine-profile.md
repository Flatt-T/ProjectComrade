# ADR 014 — Persistent-mode Fusion profile: snapshot/restore, region lifecycle, replication

Status: Accepted
Date: 2026-11-11
Issue: THU-2269 (PW21) · Epic: THU-2224 · Extends ADR 013 §1; amends the Vanilla Conquer baseline **for persistent regions only**

## Context

COMRADE 18 D1 moved the persistent world onto the Comrade Fusion Engine and away from the
Vanilla Conquer / C04 headless-WASM plan. PW21 had to make that engine capable of running
a region forever: headless in Node, snapshot/restore with checksum-identical replay,
players joining and leaving without ending the match, ownership transfer as a command,
and a replication model the browser client can consume. Classic C&C and Red Alert
matches must remain byte-for-byte untouched.

## Decision

### 1. Persistent profile, not a new pack

`packages/fusion/src/persistent.ts` adds the persistent-region surface on top of the
existing `Game`: `captureGame`/`restoreGame` (full deterministic state), `joinPlayer` /
`leavePlayer` (slots added or marked defeated without ending the match), `transferOwner`
(command `transfer`, preserving position, health, orders; rejecting dead or foreign
entities), and a persistent setup flag that disables the victory/match-over condition.
Entity `bound` flags (0 free, 1 starter, 2 recovery) are checksum-neutral for classic
packs. Classic packs, rules values and lockstep semantics are unchanged — the persistent
profile is selected per `GameSetup`, never inferred.

### 2. Snapshot = complete deterministic state

A snapshot serialises entities (including `bound`), players, RNG state, tick, market,
pending actions/orders, timers, queues and **every mutable map array** — `resKind`
(depletion/regrowth) and `concrete` (Dune placement) were the two that silently diverged
before being included. `Game` does not retain its seed, so `captureGame` takes the seed
as explicit metadata and `restoreGame(json, packs, meta)` rebuilds an identical sim.
Verified: snapshot at tick N, restore, replay to M reproduces every per-tick checksum
across all four classic packs (`td`, `ra1`, `ra2`, `dune`).

### 3. Headless host

`Game` has no DOM, renderer or audio dependency; the same class runs the region in Node
(the service) and in the browser. The PW21 endurance test is the headless host evidence:
24 simulated hours at 15 Hz in one process.

### 4. Replication: snapshot + ordered command stream (DEC-OPEN-4 boundary)

Clients receive an initial snapshot then the ordered journal/command stream and run the
same sim locally; the server checksum is authoritative and a mismatch triggers a fresh
snapshot. **This exposes hidden state (enemy positions, fog-hidden entities) to modified
clients.** That is the accepted beta posture per DEC-OPEN-4: if the owner later requires
server-side fog filtering, it lands as a config-gated layer, not a protocol change.

### 5. Standard-game backports delivered here

- **Skirmish save/resume**: `captureGame`/`restoreGame` are engine-level; a serialised
  snapshot plus seed resumes a solo game deterministically (API proven by tests; UI
  wiring is a client follow-up).
- **Lockstep rejoin**: the room relay now holds a dropped commander's seat for 120 s
  (`MATCH_RESUME_GRACE_MS`), fills their turns with empty `synthetic` packets so nobody
  stalls, buffers relayed turns (≤50 k `turn:slot` entries) and replays them on resume.
  The client drains the backlog at CPU speed (`LockstepSession` catch-up) and sends
  empty commands for turns at or below `heldUntil` so every client applies identical
  inputs. Surrender fires only after grace expiry. Non-lockstep (Vanilla) matches keep
  the old immediate-drop behaviour.
- **Warm-only scope**: rejoin requires the same live tab (resume token). A cold restart
  cannot rebuild mid-match state — recorded as a known limitation (DEC-IMPL-8).
- **Late-join spectating / journal replays** and **server-side result verification for
  ranked matches** remain open; the journal (`mmo` schema) and checksum machinery they
  need now exist.

## Consequences

- Region runner (PW07+) consumes journaled commands into a headless `Game`, snapshots at
  checkpoints, and serves snapshot+stream to clients — no second simulation is written.
- Classic balance is untouched: all persistent behaviour is behind the persistent
  profile and the `comrade.mmo.v1` protocol.
- The catch-up drain is bounded (240 ticks/frame) and only engages when buffered turns
  sit beyond the input-delay pipeline, so normal lockstep pacing is unchanged.
