# WORLD-008 — Create bridge geometry lifecycle presentation and targeting

**Specialist:** bridge technical artist and interaction specialist  
**Gate:** G4 · **Type:** bounded_work_order · **Workstream:** WORLD

## Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

## Dependencies

- [WORLD-007](WORLD-007.md) — accepted evidence required
- [ART-004](ART-004.md) — accepted evidence required
- [ART-011](ART-011.md) — accepted evidence required
- [WORLD-011](WORLD-011.md) — accepted evidence required
- [ENG-024](ENG-024.md) — accepted evidence required
- [ENG-025](ENG-025.md) — accepted evidence required
- [ENG-016](ENG-016.md) — accepted evidence required
- [ENG-012](ENG-012.md) — accepted evidence required

## Exact scope

Build deck/support/hut/scaffold assets and collapse/repair animation, with layer-correct selection and status presentation.

## Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- world-art/01_art_and_animation_contract.md
- world-art/02_terrain_and_bridges_contract.md
- world-art/03_experience_audio_and_quality_gates.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- Current repository AGENTS.md and approved programme decisions
- Proposed assets/source/world/bridges/
- Proposed packages/fusion-renderer-3d/src/world/
- apps/web/src/FusionBattle.tsx

## Outside this task

- Production deployment or live-state migration
- Unrelated mechanics or a global gameplay rebalance
- Changes outside the file lease

## Additional acceptance conditions

- Engine view bridge events
- UI picking contract

## Procedure

1. Read this task, the listed contracts and the exact dependency artifacts; record current HEAD, accepted profile version and the file lease before implementation.
2. Model the span kit and anchors to the actual bridge definition; supports/clearance/width must match authoritative geometry.
3. Bind damage/collapse/repair/reopen visuals to bridge events and leave navigation authority outside rendering.
4. Implement explicit bridge/hut targeting and ambiguous deck/ship chooser for mouse and touch.
5. Capture tank above ship during collapse/rebuild, with low effects and fog cases; verify owner/repair denial labels explain the actual state.

## Required deliverables

- Bridge/hut/scaffold asset kit
- Lifecycle animations and UI states
- Multi-layer gameplay capture

## Acceptance and negative checks

- Deck and water remain spatially distinguishable
- Cosmetic debris never blocks shipping or kills entities
- Rebuild visual does not open route early
- Fog hides current repair/damage detail when not entitled

## Guardrails

- Pin the implementation base commit and dependency evidence before editing; rebase/re-review if a shared contract changes.
- Lease only the declared files. Simulation schemas, game.ts, rules.ts and protocol files remain engine-owner territory unless explicitly delegated.
- A catalogue row, fallback model, stub, disabled assertion or self-reported completion is not acceptance evidence.
- Keep Classic preservation behavior and existing persistent shields, allied capture consent, ownership labels and saved-state guarantees intact.
- No public asset bundle may contain a provenance-blocked input. Record BLOCKED_SPEC, BLOCKED_RIGHTS or BLOCKED_TOOL with exact evidence instead of inventing completion.

## Handoff

Submit commit/diff, changed-file list, artifact hashes, relevant command results, scene/tick evidence, acceptance checklist and unresolved defects. An independent specialist must reproduce the decisive checks; do not mark Done before that review. If a required tool or input is absent, preserve completed work and provide the precise blocker and next bounded task.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.
