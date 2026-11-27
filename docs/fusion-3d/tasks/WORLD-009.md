# WORLD-009 — Validate strategic generation and add world authoring inspection

**Specialist:** world generation QA and tools engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** WORLD

## Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

## Dependencies

- [WORLD-001](WORLD-001.md) — accepted evidence required
- [WORLD-002](WORLD-002.md) — accepted evidence required
- [WORLD-007](WORLD-007.md) — accepted evidence required
- [ENG-020](ENG-020.md) — accepted evidence required
- [ENG-021](ENG-021.md) — accepted evidence required

## Exact scope

Build deterministic generation checks and a diagnostic authoring view for geometry, surfaces, navigation, bridges, resources and exclusion corridors.

## Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- world-art/01_art_and_animation_contract.md
- world-art/02_terrain_and_bridges_contract.md
- world-art/03_experience_audio_and_quality_gates.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- Current repository AGENTS.md and approved programme decisions
- packages/fusion/src/worldgen.ts
- Proposed packages/fusion/src/world-v2/
- Proposed apps/web/src/world-tools/

## Outside this task

- Production deployment or live-state migration
- Unrelated mechanics or a global gameplay rebalance
- Changes outside the file lease

## Additional acceptance conditions

- Engine deterministic generator/schema implementation

## Procedure

1. Read this task, the listed contracts and the exact dependency artifacts; record current HEAD, accepted profile version and the file lease before implementation.
2. Separate strategic connectivity, landforms and decoration; validate spawn/MCV deployment, resources, naval lanes, shore entry and infrastructure corridors.
3. Test fixed seeds, chunk-order permutations, border continuity and stable generator versions; cosmetic variation uses a separate seed stream.
4. Expose surface IDs/heights/movement classes/occupancy/topology/bridge spans in an authoring overlay with exportable reports.
5. Reject disconnected starts, unsuitable footprints, unreachably placed resources, illegal bridges and inconsistent water levels before a world is published.

## Required deliverables

- World generation validator
- Authored/fixed-seed fixture collection
- Debug/authoring overlay and report export

## Acceptance and negative checks

- All fixtures produce expected geometry hashes/routes regardless of generation order
- Existing persistent worlds are never re-seeded by an art update
- Invalid topology is rejected with a useful reason
- No live world mutation exposed as ordinary editor action

## Guardrails

- Pin the implementation base commit and dependency evidence before editing; rebase/re-review if a shared contract changes.
- Lease only the declared files. Simulation schemas, game.ts, rules.ts and protocol files remain engine-owner territory unless explicitly delegated.
- A catalogue row, fallback model, stub, disabled assertion or self-reported completion is not acceptance evidence.
- Keep Classic preservation behavior and existing persistent shields, allied capture consent, ownership labels and saved-state guarantees intact.
- No public asset bundle may contain a provenance-blocked input. Record BLOCKED_SPEC, BLOCKED_RIGHTS or BLOCKED_TOOL with exact evidence instead of inventing completion.

## Handoff

Submit commit/diff, changed-file list, artifact hashes, relevant command results, scene/tick evidence, acceptance checklist and unresolved defects. An independent specialist must reproduce the decisive checks; do not mark Done before that review. If a required tool or input is absent, preserve completed work and provide the precise blocker and next bounded task.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.
