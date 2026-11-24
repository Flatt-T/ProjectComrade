# WORLD-002 — Specify and verify height surface and transition fixtures

**Specialist:** world simulation QA specialist  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** WORLD

## Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

## Dependencies

- [WORLD-001](WORLD-001.md) — accepted evidence required
- [ENG-019](ENG-019.md) — accepted evidence required
- [ENG-021](ENG-021.md) — accepted evidence required

## Exact scope

Own the world-art acceptance fixtures for the engine's MapV2/layer/navigation contract. Engine owners implement authoritative data and algorithms.

## Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- world-art/01_art_and_animation_contract.md
- world-art/02_terrain_and_bridges_contract.md
- world-art/03_experience_audio_and_quality_gates.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- Current repository AGENTS.md and approved programme decisions
- packages/fusion/src/map.ts
- packages/fusion/src/path.ts
- Proposed packages/fusion/src/world-v2/

## Outside this task

- Production deployment or live-state migration
- Unrelated mechanics or a global gameplay rebalance
- Changes outside the file lease

## Additional acceptance conditions

- Engine MapV2 and deterministic navigation implementation

## Procedure

1. Read this task, the listed contracts and the exact dependency artifacts; record current HEAD, accepted profile version and the file lease before implementation.
2. Create tiny authored fixtures for flat ground, slope, cliff/ramp, deck-over-water, narrow channel, shore transition and blocked connector.
3. Specify integer heights, surface IDs, movement profiles, occupancy and expected routes independently of visual geometry.
4. Run identical topology queries in headless and rendered builds; compare mutation revisions after destruction.
5. Verify picking and drawing use the same permitted surfaces without deriving passability from a mesh.

## Required deliverables

- Authored layered-world fixture set
- Expected route/occupancy results
- Render versus simulation conformance evidence

## Acceptance and negative checks

- Tank and ship coexist at same x/y on different surfaces
- No cliff/bridge stale-edge traversal
- Quality settings do not alter connectivity
- Old flat maps retain exact state through supported adapter

## Guardrails

- Pin the implementation base commit and dependency evidence before editing; rebase/re-review if a shared contract changes.
- Lease only the declared files. Simulation schemas, game.ts, rules.ts and protocol files remain engine-owner territory unless explicitly delegated.
- A catalogue row, fallback model, stub, disabled assertion or self-reported completion is not acceptance evidence.
- Keep Classic preservation behavior and existing persistent shields, allied capture consent, ownership labels and saved-state guarantees intact.
- No public asset bundle may contain a provenance-blocked input. Record BLOCKED_SPEC, BLOCKED_RIGHTS or BLOCKED_TOOL with exact evidence instead of inventing completion.

## Handoff

Submit commit/diff, changed-file list, artifact hashes, relevant command results, scene/tick evidence, acceptance checklist and unresolved defects. An independent specialist must reproduce the decisive checks; do not mark Done before that review. If a required tool or input is absent, preserve completed work and provide the precise blocker and next bounded task.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.
