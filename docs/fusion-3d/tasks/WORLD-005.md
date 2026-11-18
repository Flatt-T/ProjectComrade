# WORLD-005 — Produce urban contaminated and special terrain kits

**Specialist:** environment production lead with bounded kit artists  
**Gate:** G5 · **Type:** production_parent · **Workstream:** WORLD

## Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

## Dependencies

- [WORLD-001](WORLD-001.md) — accepted evidence required
- [WORLD-002](WORLD-002.md) — accepted evidence required
- [ART-003](ART-003.md) — accepted evidence required
- [ART-005](ART-005.md) — accepted evidence required
- [ENG-013](ENG-013.md) — accepted evidence required
- [OPS-005](OPS-005.md) — accepted evidence required

## Exact scope

Produce complete environment kits T12, T13, every T14 subkit, T15, T22, T23, T24, T25, T26 and every T27 subkit and their researched subkits. Keep civilian garrisons, industrial props, rubble, contaminated resources, alien forms and mission interiors explicitly classified; research decides interactive effects.

## Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- world-art/01_art_and_animation_contract.md
- world-art/02_terrain_and_bridges_contract.md
- world-art/03_experience_audio_and_quality_gates.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- Current repository AGENTS.md and approved programme decisions
- Proposed assets/source/terrain/
- Proposed packages/fusion-renderer-3d/src/terrain/
- WORLD-001 coverage matrix

## Outside this task

- Production deployment or live-state migration
- Unrelated mechanics or a global gameplay rebalance
- Changes outside the file lease

## Additional acceptance conditions

- G2 renderer and G3 surface contracts

## Procedure

1. Read this task, the listed contracts and the exact dependency artifacts; record current HEAD, accepted profile version and the file lease before implementation.
2. Materialise one bounded geometry/material/prop/integration/review job per approved kit and subkit; record source maps and original-production provenance.
3. Author landform modules, texture/material variants, prop sets, destruction variants and ambience with compatible transition masks.
4. Build an authored representative map for each kit and validate movement/build/visibility/resource rules against its explicit profile.
5. Capture normal/close/far zoom, every team color, low/high detail and performance; a different reviewer closes each kit.

## Required deliverables

- Complete kit assets/manifests/editable sources
- Representative maps and blend rules
- Per-kit gameplay/readability/performance evidence

## Acceptance and negative checks

- All listed kits/subkits have full geometry/material/prop/ambience coverage
- No seams or passability mismatch at chunk borders
- Distinct environment identity beyond hue change
- Every gameplay obstacle has an authoritative and visible footprint

## Guardrails

- Pin the implementation base commit and dependency evidence before editing; rebase/re-review if a shared contract changes.
- Lease only the declared files. Simulation schemas, game.ts, rules.ts and protocol files remain engine-owner territory unless explicitly delegated.
- A catalogue row, fallback model, stub, disabled assertion or self-reported completion is not acceptance evidence.
- Keep Classic preservation behavior and existing persistent shields, allied capture consent, ownership labels and saved-state guarantees intact.
- No public asset bundle may contain a provenance-blocked input. Record BLOCKED_SPEC, BLOCKED_RIGHTS or BLOCKED_TOOL with exact evidence instead of inventing completion.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

## Handoff

Submit commit/diff, changed-file list, artifact hashes, relevant command results, scene/tick evidence, acceptance checklist and unresolved defects. An independent specialist must reproduce the decisive checks; do not mark Done before that review. If a required tool or input is absent, preserve completed work and provide the precise blocker and next bounded task.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.
