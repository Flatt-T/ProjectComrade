# WORLD-010 — Verify world state recovery and schedule region seam bridges

**Specialist:** persistent-world QA specialist  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** WORLD

## Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

## Dependencies

- [WORLD-007](WORLD-007.md) — accepted evidence required
- [WORLD-009](WORLD-009.md) — accepted evidence required
- [ENG-026](ENG-026.md) — accepted evidence required
- [ENG-037](ENG-037.md) — accepted evidence required
- [ENG-038](ENG-038.md) — accepted evidence required
- [ENG-045](ENG-045.md) — accepted evidence required

## Exact scope

Prove save/restart/handoff behavior for new world state, and retain an explicit follow-up for region-spanning bridges before removing the initial authoring restriction.

## Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- world-art/01_art_and_animation_contract.md
- world-art/02_terrain_and_bridges_contract.md
- world-art/03_experience_audio_and_quality_gates.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- Current repository AGENTS.md and approved programme decisions
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/runner.ts
- Proposed packages/fusion/src/world-v2/

## Outside this task

- Production deployment or live-state migration
- Unrelated mechanics or a global gameplay rebalance
- Changes outside the file lease

## Additional acceptance conditions

- Engine schema migration and regional durability implementation

## Procedure

1. Read this task, the listed contracts and the exact dependency artifacts; record current HEAD, accepted profile version and the file lease before implementation.
2. Snapshot/restore worlds with damaged bridges, active repair, blocked completion, destroyed props and mixed surfaces; compare uninterrupted versus resumed state.
3. Inject owner-region restart and duplicate command/event delivery and confirm no repeat debits, lost entities or topology disagreement.
4. Verify v1 flat-save adapter preserves all existing state and leaves bridges empty instead of regenerating a new world.
5. Independently verify ENG-045's completed region-seam protocol, single authority, traversal barrier, failure/recovery and cross-region ownership evidence. Keep authoring rejected until those tests pass; cross-region bridges are a scheduled implementation leaf, not a permanent deferral.

## Required deliverables

- World recovery evidence package
- Migration compatibility report
- Independent ENG-045 region-seam bridge conformance report

## Acceptance and negative checks

- Resume equals uninterrupted results for all fixtures
- No current world content silently regenerated
- Cross-region bridge remains rejected before tested protocol exists
- Rollback preserves the matching runtime, state snapshot and complete committed journal tail; replay/reconcile post-cutover writes or use an explicit forward recovery, never silently discard them

## Guardrails

- Pin the implementation base commit and dependency evidence before editing; rebase/re-review if a shared contract changes.
- Lease only the declared files. Simulation schemas, game.ts, rules.ts and protocol files remain engine-owner territory unless explicitly delegated.
- A catalogue row, fallback model, stub, disabled assertion or self-reported completion is not acceptance evidence.
- Keep Classic preservation behavior and existing persistent shields, allied capture consent, ownership labels and saved-state guarantees intact.
- No public asset bundle may contain a provenance-blocked input. Record BLOCKED_SPEC, BLOCKED_RIGHTS or BLOCKED_TOOL with exact evidence instead of inventing completion.

## Handoff

Submit commit/diff, changed-file list, artifact hashes, relevant command results, scene/tick evidence, acceptance checklist and unresolved defects. An independent specialist must reproduce the decisive checks; do not mark Done before that review. If a required tool or input is absent, preserve completed work and provide the precise blocker and next bounded task.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.
