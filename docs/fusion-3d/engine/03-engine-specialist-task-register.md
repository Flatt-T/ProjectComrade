# Fusion 3D engine specialist work orders

Synchronized from the canonical task graph. Individual complete packets live in `../tasks/`; follow their dependencies in the unified index and native Linear relations. Parent tasks must expand into bounded children before execution.

## ENG-001 — Freeze the verified engine baseline and inventory compatibility surfaces

**Specialist:** Repository and compatibility auditor  
**Gate:** G0 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [OPS-001](../tasks/OPS-001.md) — accepted evidence required

### Exact scope

Create a machine-readable current baseline before any architecture change; distinguish code, deployed evidence, tests and known limitations.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src
- packages/contracts/src
- apps/service/src/mmo
- apps/web/src/Battle.tsx
- apps/web/src/FusionBattle.tsx
- docs/fusion-upgrade/baseline.json (new)

### Declared file boundary

- packages/fusion/src
- packages/contracts/src
- apps/service/src/mmo
- apps/web/src/Battle.tsx
- apps/web/src/FusionBattle.tsx
- docs/fusion-upgrade/baseline.json (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Resolve the actual default branch and full SHA, list active PRs and read applicable instructions. Compare with audit SHA 84f411478f01ed62365a2e4d1d316eb57d9e193c.
2. Enumerate every registered pack, unit, structure, faction, terrain, map, rule/profile key, snapshot version and protocol version through read-only exports. Preserve the sorted IDs and digests, not only totals.
3. Inventory saved-game, replay and persistent-world compatibility consumers. Acquire sanitized representative fixtures through the approved test/backup route; do not print production credentials or personal player data.
4. Classify renderer and gameplay features as implemented, partial, absent or evidenced only by documentation. Record native Classic lockstep false separately from Fusion lockstep.
5. Map existing Linear release work to this programme without reopening completed work or asserting live deployment success from a Git commit.

### Required deliverables

- Pinned baseline JSON and human-readable delta report
- Sorted registry and compatibility inventory
- Sanitized legacy fixture catalogue with provenance

### Acceptance and negative checks

- A second auditor reproduces registry counts/digests at the same SHA.
- Every compatibility consumer identifies format/profile/version and owner.
- Unverified deployment and missing fixtures remain explicitly unresolved.
- The baseline captures native Classic and Fusion as distinct modes.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not replace or regenerate existing saved worlds merely to obtain fixtures.
- A documentation claim is not implementation evidence.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-001 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-002 — Replace placeholder test commands with executable engine gates

**Specialist:** Test infrastructure engineer  
**Gate:** G0 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-001](../tasks/ENG-001.md) — accepted evidence required

### Exact scope

Make the names of required checks correspond to real tests and explicit fixture requirements.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- package.json
- .github/workflows/ci.yml
- tests/parity (new suites)
- tests/performance (new suites)
- tests/security (new suites)
- tests/e2e (new suites)
- tools/browser-smoke.mjs

### Declared file boundary

- package.json
- .github/workflows/ci.yml
- tests/parity (new suites)
- tests/performance (new suites)
- tests/security (new suites)
- tests/e2e (new suites)
- tools/browser-smoke.mjs

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Read the root scripts and existing smoke harness; retain successful unit/integration paths and avoid treating their coverage as parity or performance.
2. Implement minimal real entrypoints for parity, performance, security and E2E. Each must discover an explicit test manifest, fail when a required fixture is missing and produce machine-readable results.
3. Provide local and CI invocation documentation, including PostgreSQL test isolation and browser setup. Distinguish optional exploratory hardware runs from mandatory release runs.
4. Add deliberate failing fixtures in the harness self-check so a broken assertion, absent test discovery or swallowed error demonstrably returns nonzero.
5. Require CI artifacts with commit, suite, case IDs and results; remove all echo-only success commands.

### Required deliverables

- Executable test entrypoints and CI wiring
- Harness integrity tests
- Test-environment documentation

### Acceptance and negative checks

- Each formerly placeholder command executes a named test and reports its count.
- Zero discovered required cases and missing required fixtures fail.
- Intentionally failing fixture returns nonzero locally and in CI.
- Existing unit and integration suites remain callable without production services.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not claim a hardware performance gate passed using browser emulation.
- Do not mark unavailable licensed reference fixtures as passing.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-002 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-003 — Capture deterministic characterization and snapshot regression fixtures

**Specialist:** Deterministic simulation test specialist  
**Gate:** G0 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-001](../tasks/ENG-001.md) — accepted evidence required
- [ENG-002](../tasks/ENG-002.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2442](https://linear.app/thunderchild-creative/issue/THU-2442)
- [THU-2444](https://linear.app/thunderchild-creative/issue/THU-2444)

### Exact scope

Establish an exact regression corpus before refactoring Game, map, path or content registries.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/game.ts
- packages/fusion/src/persistent.ts
- packages/fusion/src/session.ts
- tests/unit/fusion-determinism-v2.test.ts (new)
- tests/fixtures/fusion-legacy (new)

### Declared file boundary

- packages/fusion/src/game.ts
- packages/fusion/src/persistent.ts
- packages/fusion/src/session.ts
- tests/unit/fusion-determinism-v2.test.ts (new)
- tests/fixtures/fusion-legacy (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. For every registered legacy pack, record setup, seed, versioned command stream, checkpoint snapshots and per-tick checksums with a fixed tool version.
2. Include harvesting, production, movement, attack, capture, transport, superweapon, packing, alliance, shield and recovery cases where supported; specify unsupported mechanics explicitly.
3. Restore at multiple ticks, replay to the same end and compare every checksum and terminal state. Include pending commands and pending audit receipts.
4. Replay on Node and required browser engines; compare stable serialized state, not just a weak checksum, when a mismatch occurs.
5. Run with renderer absent and with deliberately varying presentation frame rates to establish simulation independence.

### Required deliverables

- Versioned deterministic fixture corpus
- Snapshot replay runner and diff tool
- Cross-runtime baseline report

### Acceptance and negative checks

- Same inputs reproduce identical authoritative state at every checkpoint.
- Restore during active combat and pending capture receipt reproduces uninterrupted outcome.
- Rendering at 15, 30, 60 and variable FPS changes no simulation result.
- A mutated command or rules digest is detected and reported.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not regenerate expected outputs automatically after a refactor mismatch.
- Record any pre-existing divergence as a defect with a minimal fixture; do not hide it in tolerance.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-003 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-004 — Introduce explicit native, legacy Fusion and homage profile identities

**Specialist:** Rules and schema architect  
**Gate:** G0 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-001](../tasks/ENG-001.md) — accepted evidence required
- [ENG-003](../tasks/ENG-003.md) — accepted evidence required
- [OPS-002](../tasks/OPS-002.md) — accepted evidence required

### Exact scope

Prevent historical reference rules, existing saves and new homage decisions from overwriting one another.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/rules.ts
- packages/fusion/src/packs/index.ts
- packages/fusion/src/index.ts
- packages/contracts/src/index.ts
- packages/content-schema/src/profile.ts (new)

### Declared file boundary

- packages/fusion/src/rules.ts
- packages/fusion/src/packs/index.ts
- packages/fusion/src/index.ts
- packages/contracts/src/index.ts
- packages/content-schema/src/profile.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define stable profile IDs and semantic versions for native mode metadata, frozen legacy Fusion and new homage rules; source era and expansion are separate fields.
2. Separate simulation/rules/content digests from presentation digest, retaining the historical fingerprint format and interpretation for v1.
3. Require every adapted value or mechanic to point to a source observation and adaptation record. Allow unknown evidence in research manifests but reject it in a release profile.
4. Add compatibility selection to session setup and content resolution; existing callers select the exact old profile through an adapter.
5. Validate that a presentation-only manifest change leaves the authoritative digest unchanged, while damage/prerequisite/generator changes alter it.

### Required deliverables

- Profile schema and resolvers
- Legacy compatibility adapter
- Digest classification tests and ADR

### Acceptance and negative checks

- Legacy fixtures from ENG-003 are unchanged.
- Source identity cannot collide across game, expansion, faction or revision.
- Unknown profile/version and invalid adaptations fail with clear errors.
- No old save is silently assigned the newest rules.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not normalize costs, powers or economy across eras without an explicit homage adaptation.
- Do not weaken current fingerprint checks as part of this task.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-004 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-005 — Extract deterministic subsystems from Game without changing behavior

**Specialist:** Simulation refactoring engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-003](../tasks/ENG-003.md) — accepted evidence required
- [ENG-004](../tasks/ENG-004.md) — accepted evidence required

### Exact scope

Create safe extension seams for combat, production, movement and abilities while preserving the tested legacy implementation.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/game.ts
- packages/fusion/src/core.ts
- packages/fusion/src/sim (new modules)

### Declared file boundary

- packages/fusion/src/game.ts
- packages/fusion/src/core.ts
- packages/fusion/src/sim (new modules)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Map Game state ownership and tick order into a dependency diagram. Identify side effects, RNG use and iteration order before moving code.
2. Extract one subsystem per reviewed change, beginning with pure queries and command validation. Preserve public adapters and stable iteration.
3. Define explicit state/context arguments; prohibit module-global mutable gameplay state, wall-clock reads, DOM imports and renderer dependencies.
4. Run ENG-003 corpus after each extraction and explain every byte difference before further work.
5. Publish an ownership map so later ability and movement agents do not concurrently modify the same central dispatcher.

### Required deliverables

- Incremental subsystem modules
- State ownership and tick-order contract
- Checksum-preserving refactor evidence

### Acceptance and negative checks

- All legacy fixture outputs are byte-identical.
- Headless import has no DOM/GPU initialization.
- No new global random or clock source enters simulation.
- Each extracted subsystem has a bounded API and clear owner.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not convert the engine to an ECS or change tick order opportunistically.
- A mismatch blocks the extraction; it is not a reason to update expected values.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-005 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-006 — Define and implement the immutable simulation-to-view contract

**Specialist:** Rendering integration architect  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-003](../tasks/ENG-003.md) — accepted evidence required
- [ENG-004](../tasks/ENG-004.md) — accepted evidence required

### Exact scope

Make the current renderer and future 3D renderer consume the same read-only state projection.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-view/src/frame.ts (new)
- packages/fusion-view/src/adapter.ts (new)
- packages/fusion/src/render.ts
- apps/web/src/FusionBattle.tsx

### Declared file boundary

- packages/fusion-view/src/frame.ts (new)
- packages/fusion-view/src/adapter.ts (new)
- packages/fusion/src/render.ts
- apps/web/src/FusionBattle.tsx

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Specify RenderFrameV1, stable entity IDs, semantic event IDs, visible surface revisions, interpolation endpoints and explicit visibility mode.
2. Implement a projection adapter from the current Game without writable object/array references. Keep gameplay command construction on the session path.
3. Adapt the Canvas renderer through a narrow bridge sufficient to prove behavior and input compatibility before adding GPU code.
4. Handle spawn, death, teleport, unload, capture and layer change as discontinuities, with explicit event deduplication and replay seek reset.
5. Measure projection cost and allocations against the benchmark scene; retain typed arrays only when their ownership is explicit.

### Required deliverables

- RenderFrame and PickResult schemas
- Legacy adapter and contract tests
- Coordinate/timing/event documentation

### Acceptance and negative checks

- Attempted consumer mutation cannot change simulation state.
- Renderer on/off and variable FPS preserve ENG-003 checksums.
- A teleport never interpolates across the map.
- A duplicated event produces one visual/audio trigger.
- Current selection and command issuance work through the adapter.
- Persistent identity {worldId,durableEntityId} survives region/local-ID/authority changes; location handles cannot enter identity equality, event deduplication or asset ownership keys.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Readonly TypeScript syntax alone does not satisfy isolation.
- Do not rename legacy-full-sim as secure visibility.
- Treat {regionId,localEntityId,authorityEpoch} as mutable location/authority metadata, never part of the immutable persistent entity identity.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-006 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-007 — Build the bounded Three.js renderer comparison fixture

**Specialist:** Three.js graphics specialist  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ART-006](../tasks/ART-006.md) — accepted evidence required

### Exact scope

Implement only the agreed renderer comparison scene in Three.js against RenderFrameV1.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- experiments/fusion-3d/three (new)
- experiments/fusion-3d/shared-fixture (new shared read-only inputs)

### Declared file boundary

- experiments/fusion-3d/three (new)
- experiments/fusion-3d/shared-fixture (new shared read-only inputs)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Pin a current exact Three.js release and decoder versions after checking official docs; record license and build configuration.
2. Load the common licensed/original GLB test assets, with identical camera, lights, shadow settings and animation coverage to the Babylon fixture.
3. Render 64, 256 and 1,024 mixed-unit scenes, 64 structures, terrain, bridge underpass, fog, selection and representative effects.
4. Exercise WebGL2 and WebGPU where supported, recording actual selected backend; test failed initialization, context/device loss and teardown.
5. Export measured timings, download size, resource counters and implementation limitations without selecting the production winner.

### Required deliverables

- Isolated Three.js spike
- Reproducible benchmark script and raw results
- Feature-gap and complexity assessment

### Acceptance and negative checks

- Shared fixture content and visible quality match the comparison manifest.
- Both supported backends produce correct picking, animation and occlusion.
- Resource counters return to baseline after repeated teardown.
- Results identify device/browser/backend/commit and warm-up protocol.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- No simulation changes or production dependency introduction.
- Do not benchmark static boxes while the competing scene uses rigs.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-007 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-008 — Build the bounded Babylon.js renderer comparison fixture

**Specialist:** Babylon.js graphics specialist  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ART-006](../tasks/ART-006.md) — accepted evidence required

### Exact scope

Implement the identical renderer comparison scene in Babylon.js against RenderFrameV1.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- experiments/fusion-3d/babylon (new)
- experiments/fusion-3d/shared-fixture (new shared read-only inputs)

### Declared file boundary

- experiments/fusion-3d/babylon (new)
- experiments/fusion-3d/shared-fixture (new shared read-only inputs)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Pin exact Babylon packages/loaders after checking official docs and record license and production build setup.
2. Use the same assets, lights, camera, visibility and animation states as ENG-007, explicitly normalizing glTF handedness and root transforms.
3. Run the 64, 256 and 1,024 unit fixtures using appropriate rigid/thin instancing and independently animated instances where required.
4. Select WebGL or WebGPU before scene creation; exercise initialization failure, device loss and clean disposal/rebuild.
5. Export the same measurement fields and list any unsupported feature or semantic compromise.

### Required deliverables

- Isolated Babylon.js spike
- Matched raw benchmark results
- Feature-gap and complexity assessment

### Acceptance and negative checks

- Scene content, coverage and quality match the shared comparison manifest.
- Backend identity is recorded; fallback does not silently drop a feature.
- Independent unit animations and selection identities remain correct.
- Repeated creation/disposal shows no monotonic resource growth.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- No Babylon Lite/WebGPU-only substitution unless the decision gate explicitly changes support requirements.
- No authoritative physics or nav from the scene engine.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-008 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-009 — Select the production renderer and ratify measured budgets

**Specialist:** Independent graphics lead and performance reviewer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-007](../tasks/ENG-007.md) — accepted evidence required
- [ENG-008](../tasks/ENG-008.md) — accepted evidence required

### Exact scope

Make one explicit, reproducible library/backend decision after comparing identical fixtures.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- docs/adr/fusion-3d-renderer.md (new)
- docs/fusion-upgrade/device-matrix.json (new)
- experiments/fusion-3d/results (new)

### Declared file boundary

- docs/adr/fusion-3d-renderer.md (new)
- docs/fusion-upgrade/device-matrix.json (new)
- experiments/fusion-3d/results (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Verify both spikes used identical inputs and rerun a representative subset on actual mobile and desktop devices.
2. Score correctness, device support and developer complexity before throughput; reject a candidate failing required animation, visibility or input behavior.
3. Choose one production library, baseline backend, optional acceleration backend, supported device set and exact dependency versions.
4. Ratify or explicitly revise provisional frame/load/resource targets with evidence. Record that benchmark entity counts are not MMO capacity promises.
5. Publish the ADR and freeze shared scene/material conventions for art and renderer workers; archive unused spike code outside runtime imports.

### Required deliverables

- Accepted renderer ADR
- Supported-device and quality-tier matrix
- Ratified budgets and raw evidence links

### Acceptance and negative checks

- Every selected requirement has a measured result or explicit blocker.
- A low-end supported device has physical-device evidence.
- Only one renderer library enters the production architecture.
- The decision preserves fixed-tick simulation and full-3D product requirements.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not select on popularity or one desktop FPS number.
- Do not lower visual requirements silently to obtain a pass.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-009 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-010 — Implement versioned 3D asset manifests and ingestion validation

**Specialist:** Asset pipeline engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-009](../tasks/ENG-009.md) — accepted evidence required
- [ART-003](../tasks/ART-003.md) — accepted evidence required

### Exact scope

Connect asset production to the runtime with explicit provenance, capabilities and coverage.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/content-schema/src/presentation.ts (new)
- tools/assets/validate-3d.ts (new)
- packages/fusion-renderer-3d/src/assets (new)
- tools/art-coverage.ts

### Declared file boundary

- packages/content-schema/src/presentation.ts (new)
- tools/assets/validate-3d.ts (new)
- packages/fusion-renderer-3d/src/assets (new)
- tools/art-coverage.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define model/material/texture/rig/clip/socket/LOD/collision-preview metadata keyed by source identity and presentation version.
2. Validate GLB structure, transforms, bounds, scale, winding, required clips, sockets, LOD coverage, texture dimensions and selected compression decoder compatibility.
3. Add rights/provenance and release-eligibility references; a technically valid asset with blocked rights cannot enter a public pack.
4. Resolve model keys from content definitions; development fallback is visibly labelled and release validation rejects missing required assets.
5. Generate asset coverage and byte-budget reports, including shared rig dependencies and decoded texture/resource estimates.

### Required deliverables

- Presentation schema
- Deterministic ingestion/validation CLI
- Asset coverage report and failing fixtures

### Acceptance and negative checks

- Malformed transforms, missing fire/death clips, absent muzzle sockets and incompatible compressed textures fail.
- Every playable definition resolves to an approved asset or an explicit release blocker.
- Asset hashes and tool versions are reproducible.
- Model bounds and gameplay footprints agree within the approved art contract.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not use artwork titles or shape aliases as unique entity identity.
- A flat image generated by AI is not a deliverable 3D model.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-010 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-011 — Implement GPU scene lifecycle and robust backend initialization

**Specialist:** Rendering platform engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-009](../tasks/ENG-009.md) — accepted evidence required
- [ENG-010](../tasks/ENG-010.md) — accepted evidence required

### Exact scope

Create the production 3D renderer behind an explicit homage feature flag, with deterministic resource lifetime.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/renderer.ts (new)
- packages/fusion-renderer-3d/src/resources.ts (new)
- apps/web/src/FusionBattle.tsx
- apps/web/src/PersistentWorld.tsx

### Declared file boundary

- packages/fusion-renderer-3d/src/renderer.ts (new)
- packages/fusion-renderer-3d/src/resources.ts (new)
- apps/web/src/FusionBattle.tsx
- apps/web/src/PersistentWorld.tsx

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Initialize the accepted backend asynchronously and expose loading/error/retry state without blocking the simulation service.
2. Create camera, lights, render targets and material cache according to the accepted art/render conventions.
3. Own every GPU/CPU asset through reference-counted or equivalent explicit lifetime rules; dispose on battle exit and pack change.
4. Handle context/device loss with reload/recreation from a current view snapshot, preserving selection where identities remain valid.
5. Keep native Classic and legacy Canvas selection independent; log renderer/backend/version for diagnostics.

### Required deliverables

- Production renderer shell
- Lifecycle/resource manager
- Initialization/loss/teardown tests

### Acceptance and negative checks

- Entering and leaving 20 battles does not accumulate scene resources.
- A forced device/context loss recovers or gives an actionable error without corrupting sim state.
- Unsupported backend follows the accepted fallback policy.
- Native Classic still initializes through its existing adapter.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not auto-upgrade existing saved profile selection.
- No scene object may own authoritative entity state.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-011 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-012 — Implement RTS camera, height-aware picking and command surfaces

**Specialist:** RTS interaction engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-011](../tasks/ENG-011.md) — accepted evidence required
- [ENG-006](../tasks/ENG-006.md) — accepted evidence required

### Exact scope

Preserve fast and predictable RTS control while allowing genuine 3D viewing.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/camera.ts (new)
- packages/fusion-renderer-3d/src/picking.ts (new)
- apps/web/src/FusionBattle.tsx
- apps/web/src/touch.ts

### Declared file boundary

- packages/fusion-renderer-3d/src/camera.ts (new)
- packages/fusion-renderer-3d/src/picking.ts (new)
- apps/web/src/FusionBattle.tsx
- apps/web/src/touch.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Implement default isometric-like perspective/orthographic settings from the art contract, with bounded pan, zoom, rotation and pitch.
2. Raycast only selectable permitted views; return exact surface ID for ground, elevated deck and water. Use a spatial/indexed picking path rather than per-frame all-mesh tests.
3. Implement click, box select, same-type select, control groups, minimap jump, placement ghosts and context commands with keyboard/mouse and touch.
4. Define selection priority and occluded-object handling at bridge overlaps; never select a hidden enemy through fog.
5. Test camera changes during drag/placement, browser resize, DPR change, portrait/landscape and touch cancellation.

### Required deliverables

- Camera/picking modules
- Input-to-command integration
- Interaction fixture videos and automated cases

### Acceptance and negative checks

- A deck unit and an under-bridge ship can be intentionally selected separately.
- Identical intended orders produce identical gameplay commands at all camera headings.
- Placement ghost uses server/sim-valid footprint and surface rules.
- Touch can select, move, attack, deploy, cancel and place without hover.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Camera ray hits do not authorize commands.
- Do not require free-flight camera controls to play.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-012 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-013 — Render streamed 3D terrain chunks and water surfaces

**Specialist:** Terrain rendering engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-011](../tasks/ENG-011.md) — accepted evidence required
- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-020](../tasks/ENG-020.md) — accepted evidence required

### Exact scope

Display authoritative elevations and surface layers with biome materials and bounded streaming.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/terrain (new)
- packages/fusion-renderer-3d/src/water (new)
- packages/fusion-view/src/frame.ts (new)

### Declared file boundary

- packages/fusion-renderer-3d/src/terrain (new)
- packages/fusion-renderer-3d/src/water (new)
- packages/fusion-view/src/frame.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Consume MapV2 surface/elevation data and legacy adapter output; construct chunk meshes with shared edge samples so adjacent chunks have no cracks.
2. Apply approved biome material sets, transition masks and texture compression; preserve command readability at normal RTS zoom.
3. Render water, shorelines and underpasses without hiding depth/clearance information required for navigation.
4. Stream/evict chunks by camera region with hysteresis; collision and nav remain in the authoritative map independently of visual residency.
5. Update only chunks affected by a topology revision or destruction event; verify fog and selection overlays at seams.

### Required deliverables

- Chunked terrain/water renderer
- Streaming policy and instrumentation
- Biome and seam visual fixtures

### Acceptance and negative checks

- No terrain cracks at supported zoom/heading or chunk LOD transitions.
- A ship is correctly occluded beneath a deck and visible at its exit.
- Evicting a visual chunk changes no gameplay path or state.
- Repeated traversal respects the accepted memory/load budget.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Water wave displacement is cosmetic unless a later versioned mechanic explicitly makes it authoritative.
- Do not preload every biome/faction asset for the first match.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-013 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-014 — Render entities with stable identity, LOD and measured instancing

**Specialist:** Entity graphics engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-010](../tasks/ENG-010.md) — accepted evidence required
- [ENG-011](../tasks/ENG-011.md) — accepted evidence required

### Exact scope

Display every admitted unit/building asset efficiently without identity or silhouette substitution.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/entities (new)
- packages/fusion-renderer-3d/src/lod (new)

### Declared file boundary

- packages/fusion-renderer-3d/src/entities (new)
- packages/fusion-renderer-3d/src/lod (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Create entity-to-scene and entity-to-instance maps separate from mutable GPU slot indices.
2. Use shared geometry/materials and rigid instancing where compatible; preserve independent turret and animated components.
3. Apply team colour, source faction marking, construction state, damage material and selection outlines using manifest data.
4. Implement screen-size LOD with hysteresis and bounds that include attachments/animations; define separate animated LOD policy.
5. Handle spawn/death/capture/pack/unpack without a stale mesh, duplicate entity or inherited wrong-owner colour.

### Required deliverables

- Entity scene cache and instance registry
- LOD policy
- Coverage/performance fixture evidence

### Acceptance and negative checks

- GPU slot reuse cannot select or label a different entity.
- Each approved definition retains its required silhouette and markings at tactical zoom.
- Capture changes owner relation/colour while preserving source model identity.
- Large scenes meet the ratified budgets without removing gameplay-significant entities.
- Persistent identity {worldId,durableEntityId} survives region/local-ID/authority changes; location handles cannot enter identity equality, event deduplication or asset ownership keys.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not count repeated aliases as new finished models.
- Do not assume ordinary instancing supports independently skinned animation for free.
- Treat {regionId,localEntityId,authorityEpoch} as mutable location/authority metadata, never part of the immutable persistent entity identity.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-014 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-015 — Implement capability-driven animation controllers and clip validation

**Specialist:** Technical animation engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-010](../tasks/ENG-010.md) — accepted evidence required
- [ENG-014](../tasks/ENG-014.md) — accepted evidence required
- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ART-004](../tasks/ART-004.md) — accepted evidence required

### Exact scope

Turn authoritative state into complete, interruptible unit/building animation behavior.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/animation (new)
- packages/fusion-view/src/events.ts (new)
- tools/assets/validate-animation.ts (new)

### Declared file boundary

- packages/fusion-renderer-3d/src/animation (new)
- packages/fusion-view/src/events.ts (new)
- tools/assets/validate-animation.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define clip/state requirements from the approved art animation matrix and capability IDs, including transition and interruption priorities.
2. Drive locomotion, turret aim, recoil, reload, deploy, harvest, cargo, construction, repair and death from state/event anchors.
3. Match movement speed visually without root motion changing sim coordinates; prevent foot sliding with controlled clip phase/speed adaptation.
4. Handle paused simulation, fast replay, seek, snapshot replacement and offscreen LOD without duplicate actions or permanently frozen units.
5. Provide a per-asset automated animation viewer that exercises every required state and exports a contact sheet/video plus coverage report.

### Required deliverables

- Animation controller and adapters
- Clip/sockets validators
- Per-asset animation evidence tool

### Acceptance and negative checks

- Every applicable required state has a clip or an approved procedural component implementation.
- Damage occurs at the same sim tick with animations disabled.
- Reload/deploy/death interruption cases produce valid final visual state.
- Replay seek and snapshot replacement restore correct ongoing action phase.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- No animation callback may change hit points, build progress, cargo or position.
- Missing required clips block release; idle-loop fallback is development only.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-015 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-016 — Implement semantic effects and audio event delivery

**Specialist:** Effects systems engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-011](../tasks/ENG-011.md) — accepted evidence required
- [ENG-015](../tasks/ENG-015.md) — accepted evidence required

### Exact scope

Deliver visible and audible battle feedback consistently across normal play, network duplication and replay.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-view/src/events.ts (new)
- packages/fusion-renderer-3d/src/effects (new)
- packages/fusion/src/audio.ts

### Declared file boundary

- packages/fusion-view/src/events.ts (new)
- packages/fusion-renderer-3d/src/effects (new)
- packages/fusion/src/audio.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Version event payloads for fire, impact, damage, destruction, build/sale, capture, ability, transport and bridge changes.
2. Map events to muzzle sockets, trails, impacts, decals, debris and audio cues supplied by art/audio specialists.
3. Implement event deduplication, bounded lifetime, visibility eligibility and prioritization so important warnings survive heavy battles.
4. Add replay seek reset and catch-up suppression for obsolete transient audio; retain present ongoing effects.
5. Expose quality budgets and reduced-flash/camera-shake controls without changing gameplay or information availability.

### Required deliverables

- Semantic event router
- Effects/audio adapters and budget controls
- Duplication/seek/visibility tests

### Acceptance and negative checks

- Duplicate command/event delivery triggers one sound and one logical effect.
- Hidden events leak no unauthorized position through light, audio, debris or minimap.
- Effects disabled versus enabled produce identical authoritative state.
- Important unit/deployment warnings remain intelligible in the stress fixture.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Audio/video source rights are checked separately by the content pipeline.
- Particle physics is presentation-only.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-016 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-017 — Implement readable 3D fog, shroud, radar and ownership overlays

**Specialist:** Visibility presentation engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-011](../tasks/ENG-011.md) — accepted evidence required
- [ENG-012](../tasks/ENG-012.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2443](https://linear.app/thunderchild-creative/issue/THU-2443)

### Exact scope

Present visible, explored and unknown space correctly in 3D while identifying what security mode supplies the data.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion-renderer-3d/src/visibility (new)
- packages/fusion-renderer-3d/src/overlays (new)
- apps/web/src/FusionBattle.tsx

### Declared file boundary

- packages/fusion-renderer-3d/src/visibility (new)
- packages/fusion-renderer-3d/src/overlays (new)
- apps/web/src/FusionBattle.tsx

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define visible/explored/unknown rendering and last-known structure behavior from the selected profile.
2. Apply fog to geometry, shadows, lights, particles, decals, animation, selection and labels; test tall buildings and elevated surfaces.
3. Render owner and ally/foe labels on approach/selection as required, using permitted source data and accessibility colours.
4. Implement minimap/radar information from the same view rather than the entire map object.
5. Expose legacy-full-sim versus server-filtered mode in diagnostics and test that secure views never contain hidden data.

### Required deliverables

- Fog/shroud shaders and view filters
- Ownership/relationship overlays
- Visibility leak fixture suite

### Acceptance and negative checks

- No hidden enemy is pickable or visible through shadow/light/effects leaks.
- Explored terrain and last-known structures obey profile rules.
- Labels remain readable at tactical zoom and on mobile.
- Legacy protocol remains honestly labelled as exposing full state.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- A fog mask is not server-side hidden-state security.
- Do not remove enemy state from a legacy local sim and expect deterministic replay to remain correct.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-017 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-018 — Isolate browser simulation and view transport from rendering load

**Specialist:** Browser concurrency engineer  
**Gate:** G2 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-005](../tasks/ENG-005.md) — accepted evidence required
- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-011](../tasks/ENG-011.md) — accepted evidence required

### Exact scope

Prevent asset decoding and GPU preparation from starving command/tick processing in legacy and homage sessions.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/session.ts
- packages/fusion-view/src/worker-protocol.ts (new)
- apps/web/src/mmo.ts
- apps/web/src/FusionBattle.tsx

### Declared file boundary

- packages/fusion/src/session.ts
- packages/fusion-view/src/worker-protocol.ts (new)
- apps/web/src/mmo.ts
- apps/web/src/FusionBattle.tsx

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Profile the existing worker timer versus actual simulation ownership; document what runs on each thread.
2. Introduce a dedicated simulation worker for local/lockstep full-sim modes with versioned message types and immutable/transferable view buffers.
3. Keep secure authoritative-view mode on its appropriate network/view path; do not create a hidden full simulation there.
4. Bound queued work, snapshot size, event history and backpressure. Commands retain sequence and session identity across worker restart.
5. Exercise background tab, asset decode spikes, reconnect and renderer failure while verifying checksum/order continuity.

### Required deliverables

- Worker/session transport
- Thread ownership diagram
- Stall/backpressure/restart evidence

### Acceptance and negative checks

- Renderer stalls do not change command order or authoritative tick results.
- Transfer buffers are not reused while still owned by the receiver.
- Background/rejoin behavior satisfies the existing session contract.
- Worker failure gives a recoverable state without duplicate commands.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not add SharedArrayBuffer as a requirement without separately proving deployment headers and browser support.
- Never use timing-dependent races as an ordering policy.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-018 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-019 — Define authoritative elevation, surface and topology schemas

**Specialist:** World simulation architect  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-005](../tasks/ENG-005.md) — accepted evidence required
- [RES-025](../tasks/RES-025.md) — accepted evidence required

### Exact scope

Represent bridges, water underpasses, cliffs and ramps without collapsing them onto one occupancy layer.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/world-v2/schema.ts (new)
- packages/content-schema/src/map.ts (new)
- packages/fusion/src/map.ts

### Declared file boundary

- packages/fusion/src/world-v2/schema.ts (new)
- packages/content-schema/src/map.ts (new)
- packages/fusion/src/map.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Specify integer height units, stable surface/connector IDs, traversal tags, occupancy domains, clearance and build policy.
2. Separate immutable generator identity from mutable topology and cosmetic material metadata.
3. Define bridges/spans/terminals, destructible blockers and revision invalidation interfaces without implementing combat yet.
4. Provide examples: flat legacy map, ramp to plateau, elevated bridge over navigable water and tunnel portal.
5. Validate bounds, graph consistency, safe numeric ranges, cycle/connector rules and source-content references.

### Required deliverables

- MapV2/surface/connector schemas
- Canonical serialized examples
- Schema validator and ADR

### Acceptance and negative checks

- A tank deck surface and ship water surface coexist in one horizontal cell.
- Malformed connectors, invalid elevations and duplicate IDs fail.
- Cosmetic changes leave authoritative topology digest unchanged.
- The old MapData API remains available to frozen profiles.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- No renderer-specific vector or mesh class enters map state.
- Do not change legacy seeded maps in place.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-019 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-020 — Implement versioned map loading and immutable generator dispatch

**Specialist:** Procedural world engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-003](../tasks/ENG-003.md) — accepted evidence required

### Exact scope

Load both frozen legacy maps and new authored/generated surface maps reproducibly.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/worldgen.ts
- packages/fusion/src/map.ts
- packages/fusion/src/world-v2/load.ts (new)
- tests/fixtures/maps-v2 (new)

### Declared file boundary

- packages/fusion/src/worldgen.ts
- packages/fusion/src/map.ts
- packages/fusion/src/world-v2/load.ts (new)
- tests/fixtures/maps-v2 (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Freeze legacy generator dispatch by explicit version and retain exact existing output for old seeds.
2. Implement a lossless adapter from a legacy map to a single-surface MapV2 view; preserve every resource, concrete, start and occupancy value.
3. Add a new generator version that persists elevation and authoritative connectors instead of using elevation only to choose terrain.
4. Integrate authored terrain/bridge templates from world specialists and validate start safety, accessible resources and land/sea connectivity.
5. Create deterministic seed fixtures and failure diagnostics; terrain-family coverage is reported independently from connectivity success.

### Required deliverables

- Dual map loader and generator registry
- Legacy parity fixtures
- Map connectivity validation reports

### Acceptance and negative checks

- Legacy seed outputs remain byte-identical.
- Same new seed/version produces identical authoritative surfaces across runtimes.
- Invalid generated maps fail or retry deterministically with recorded attempt.
- No new player starts on an isolated invalid surface.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not overwrite old generator code and rely on the seed alone.
- Do not claim all terrain families from one noise/material palette.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-020 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-021 — Implement deterministic layered navigation and route outcomes

**Specialist:** Pathfinding specialist  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-020](../tasks/ENG-020.md) — accepted evidence required
- [ENG-005](../tasks/ENG-005.md) — accepted evidence required

### Exact scope

Find paths over surfaces/connectors with explicit complete, partial, blocked and budget-exhausted results.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/path.ts
- packages/fusion/src/world-v2/navigation.ts (new)
- tests/unit/layered-path.test.ts (new)

### Declared file boundary

- packages/fusion/src/path.ts
- packages/fusion/src/world-v2/navigation.ts (new)
- tests/unit/layered-path.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Implement graph expansion keyed by surface/cell with stable tie-break and integer costs.
2. Apply movement capability, width, slope, clearance and occupancy constraints; prohibit diagonal corner cutting across unavailable surfaces.
3. Return structured route status and endpoint/reason instead of treating closest-reachable partial paths as successful arrivals.
4. Cache by topology revision and movement capability; invalidate only affected routes after a relevant change.
5. Bound expansions per tick and queue deterministic continuation work; record congestion/path-budget telemetry.

### Required deliverables

- Layered pathfinder and legacy adapter
- Route-status contract
- Bridge/ramp/shore/tunnel fixtures

### Acceptance and negative checks

- Deck and underpass routes remain distinct.
- Unavailable route and expansion-budget exhaustion are distinguishable.
- Repeated searches tie-break identically on all test runtimes.
- Destroying a deck invalidates existing paths before their next invalid traversal.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not use a GPU/navmesh library result as authoritative without determinism proof and an accepted ADR.
- Legacy path results remain unchanged for frozen profiles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-021 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-022 — Implement movement reservations, congestion and formation behavior

**Specialist:** RTS movement engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [ENG-005](../tasks/ENG-005.md) — accepted evidence required

### Exact scope

Make group movement readable and reliable at bottlenecks without changing commands according to frame rate.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/movement.ts (new)
- packages/fusion/src/world-v2/reservations.ts (new)
- tests/unit/formation-movement.test.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/fusion/src/sim/movement.ts (new)
- packages/fusion/src/world-v2/reservations.ts (new)
- tests/unit/formation-movement.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define deterministic per-tick reservation ownership and conflict resolution by stable entity/order priority.
2. Implement formation destination assignment and local avoidance constrained by the chosen capability and surface graph.
3. Treat bridges/ramps/doors as capacity-limited transitions; permit queues and replanning instead of overlap or teleport.
4. Handle mixed speed, unit death, stop, new command, capture and transport transitions without stale reservations.
5. Expose valid waiting/no-route feedback through RenderFrame for UI and AI.

### Required deliverables

- Reservation/formation movement system
- Congestion debug view
- Bottleneck and mixed-army fixtures

### Acceptance and negative checks

- Opposing traffic cannot deadlock indefinitely in the agreed fixtures.
- Units do not overlap invalid surfaces or teleport to satisfy formation.
- A stopped/dead/captured unit releases or transfers reservations correctly.
- Order replay produces identical positions/reservations each tick.
- Reservation/admission fixtures allocate at most one durable refuge berth per protected root and reject unavailable berths without mutation; use accepted bridge contract fixtures, not a prerequisite of completed bridge runtime.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Movement feel changes only in the new profile or explicitly approved legacy bug fix.
- Do not use wall-clock timeout to break authoritative congestion.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-022 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-023 — Implement bridge identities and the authoritative lifecycle

**Specialist:** Bridge gameplay engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [WORLD-007](../tasks/WORLD-007.md) — accepted evidence required

### Exact scope

Represent each bridge, span and repair terminal as deterministic state with approved policy values.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/world-v2/bridges.ts (new)
- packages/content-schema/src/bridge.ts (new)
- tests/unit/bridge-state.test.ts (new)

### Declared file boundary

- packages/fusion/src/world-v2/bridges.ts (new)
- packages/content-schema/src/bridge.ts (new)
- tests/unit/bridge-state.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Read world-art/02_terrain_and_bridges_contract.md and record its concrete fusion-bridge-v1 defaults for isolated implementation. Escalate only substantive conflicts; ordinary design review does not require a new owner permission request.
2. Implement the canonical fusion-bridge-v1 states intact, damaged, destroyed and rebuilding. Zero HP removes deck edges/reservations and resolves occupants in the same tick; collapsing is a cosmetic event, not a durable state.
3. Bind span state to deck surfaces, endpoint connectors and underpass clearance; emit topology revisions and semantic events.
4. Handle multi-span order, target resolution and duplicate commands with stable IDs.
5. Provide debug inspection for health/state, repair eligibility, surface links and next transition tick.

### Required deliverables

- Bridge state system
- Bridge definition validator
- Lifecycle state-transition fixtures

### Acceptance and negative checks

- Every permitted transition has a tested entry/exit condition.
- An unsupported transition fails without partial mutation.
- Span destruction affects only specified topology.
- Animation length does not determine transition timing.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- First release bridges must belong to one region; cross-region authoring is rejected pending a seam authority protocol.
- No visual-only repair or collapse can stand in for gameplay.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-023 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-024 — Resolve bridge damage, collapse and occupants deterministically

**Specialist:** Combat and topology engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-023](../tasks/ENG-023.md) — accepted evidence required
- [ENG-022](../tasks/ENG-022.md) — accepted evidence required
- [ENG-028](../tasks/ENG-028.md) — accepted evidence required

### Exact scope

Apply bridge combat and occupant consequences without lost, duplicated or arbitrarily relocated entities.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/world-v2/bridges.ts (new)
- packages/fusion/src/sim/combat.ts (new)
- tests/unit/bridge-collapse.test.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/fusion/src/world-v2/bridges.ts (new)
- packages/fusion/src/sim/combat.ts (new)
- tests/unit/bridge-collapse.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Implement targeting/armour/damage rules for spans and terminals as specified; enforce friendly-fire/protection policy.
2. At the damage tick that reaches zero HP, enumerate occupants by stable identity and classify deck support, water below, air, passengers and attached effects.
3. Implement the WORLD reserved-refuge protocol exactly: durable deterministic entry-bank berth selection; direct and nested protected cargo roots; atomic reservation on entry/new protection/load; same-identity support-loss relocation; recoverable invariant failure, no force-kill or arbitrary fallback.
4. For fusion-bridge-v1 apply normal environmental damage to vulnerable supported non-air occupants and preserve protected roots through their reserved refuge; leave ships below and aircraft above unaffected. Use normal cargo/death/salvage accounting. Amphibious survival is a future profile extension, not a v1 alternative.
5. Invalidate routes and reservations before subsequent movement; resolve same-tick repair/damage in the published tick order.
6. Test chained span collapse and explosions with occupied transports, allies and neutral entities.

### Required deliverables

- Bridge damage/collapse implementation
- Occupant outcome fixtures
- Replay and visual event evidence

### Acceptance and negative checks

- No entity exists on both deck and lower surface after collapse.
- No arbitrary relocation or invented amphibious landing is allowed; only the explicit protected reserved-refuge transaction moves a surviving supported entity.
- Transport cargo and attached states obey normal destruction rules.
- Same-tick competing actions have the same result after replay and restart.
- Single-region collapse applies normal damage/protection first and preserves protected entities/cargo through their reserved-refuge transaction with the same immutable IDs; duplicate commands have one local outcome.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Enforce the infrastructure corridor exclusion and latest protection validation from the canonical bridge contract; do not let bridge actions bypass shields or newcomer/recovery protection.
- Cosmetic falling bodies cannot keep a dead unit operational.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-024 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-025 — Implement bridge repair and rebuilding commands with resource accounting

**Specialist:** Interaction and economy engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-023](../tasks/ENG-023.md) — accepted evidence required
- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [ENG-029](../tasks/ENG-029.md) — accepted evidence required

### Exact scope

Make destroyed bridges rebuildable through a visible, authorized and interruptible player interaction.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/world-v2/bridge-repair.ts (new)
- packages/fusion/src/sim/commands.ts (new)
- tests/unit/bridge-repair.test.ts (new)

### Declared file boundary

- packages/fusion/src/world-v2/bridge-repair.ts (new)
- packages/fusion/src/sim/commands.ts (new)
- tests/unit/bridge-repair.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Implement repair action prerequisites, terminal reachability, cost/time, engineer consumption or reusable worker policy from the approved profile.
2. Reserve cost and interaction identity exactly once; define cancellation, death, ownership change and enemy contest outcomes.
3. Revalidate deck clearance and occupancy at the commit tick; pause/reject according to the published policy rather than displacing boats or protected units.
4. Show progress, blocked reason and completion through semantic state/events, with touch-accessible UI hooks.
5. Exercise duplicate repair requests, insufficient funds, terminal destruction and interrupted rebuild.

### Required deliverables

- Bridge repair command/state implementation
- Cost/refund and idempotency tests
- Repair progress/view integration

### Acceptance and negative checks

- A repairable destroyed bridge becomes traversable only at the authoritative completion tick.
- Duplicate requests cannot consume twice or give free progress.
- Blocked occupancy never creates overlapping surfaces/entities.
- Restart/cancel/death preserves the documented resource outcome.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not infer that every game used the same engineer/repair-hut rule.
- Credits and engineer consumption are simulation authority, not UI callbacks.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-025 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-026 — Persist and replicate bridge and topology state across recovery

**Specialist:** Persistence and networking engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-024](../tasks/ENG-024.md) — accepted evidence required
- [ENG-025](../tasks/ENG-025.md) — accepted evidence required
- [ENG-037](../tasks/ENG-037.md) — accepted evidence required
- [ENG-038](../tasks/ENG-038.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2242](https://linear.app/thunderchild-creative/issue/THU-2242)
- [THU-2442](https://linear.app/thunderchild-creative/issue/THU-2442)

### Exact scope

Ensure bridge damage, repair and topology changes survive crashes and remain identical for every client.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/runner.ts
- packages/contracts/src/mmo.ts
- tests/integration/mmo-bridge-replay.test.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/fusion/src/persistent.ts
- apps/service/src/mmo/runner.ts
- packages/contracts/src/mmo.ts
- tests/integration/mmo-bridge-replay.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Add versioned bridge/topology state to new snapshots and checksum coverage, including pending transitions and repair reservations.
2. Journal every persistent bridge-affecting input before application under the existing fence/idempotency model.
3. Extend view/state messages with bridge revision and events while preserving version negotiation.
4. Test crash immediately before/after journal commit, collapse, repair completion and checkpoint; restore into isolated test worlds.
5. Verify duplicate/reordered transport delivery causes resync or deduplication rather than divergent bridges.

### Required deliverables

- Snapshot/protocol bridge integration
- Crash recovery fixtures
- Multi-client bridge evidence

### Acceptance and negative checks

- Uninterrupted and restored runs have identical state/checksums.
- No free rebuild or resurrection appears after restart.
- All clients agree on deck availability and occupied surfaces.
- Legacy v1 snapshots still load through the frozen reader.
- Persistent identity {worldId,durableEntityId} survives region/local-ID/authority changes; location handles cannot enter identity equality, event deduplication or asset ownership keys.
- A single-region collapse or repair survives commit/apply interruption and reconnect with exactly one debit/reservation/relocation and unchanged protected identities; cross-region bridge execution is qualified in ENG-045.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- No database side path may independently mutate a bridge while the region sim is authoritative.
- Do not modify production snapshots to force a test pass.
- Treat {regionId,localEntityId,authorityEpoch} as mutable location/authority metadata, never part of the immutable persistent entity identity.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-026 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-027 — Implement locomotion transitions and transport surface rules

**Specialist:** Mobility and transport engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [ENG-022](../tasks/ENG-022.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2446](https://linear.app/thunderchild-creative/issue/THU-2446)

### Exact scope

Represent foot, tracked, wheeled, hover, amphibious, naval, submerged, air and special transition modes without cosmetic shortcuts.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/locomotion.ts (new)
- packages/fusion/src/sim/transport.ts (new)
- tests/unit/locomotion-surfaces.test.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/fusion/src/sim/locomotion.ts (new)
- packages/fusion/src/sim/transport.ts (new)
- tests/unit/locomotion-surfaces.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Map each approved movement capability to allowed surfaces, connectors, depth/clearance and turn/acceleration rules.
2. Implement boarding/disembarking surface validation and stable passenger identity; preserve capacities, protection and cargo loss semantics.
3. Support approved transition state machines such as shore crossing, takeoff/landing and submerge/surface; subterranean/tunnel/teleport modes require their own registered fixtures.
4. Apply bridge underpass clearance and ramp/shore restrictions to normal movement and transport exits.
5. Add per-capability diagnostic fixtures and reject unimplemented movement IDs in release content.

### Required deliverables

- Locomotion/transport capability adapters
- Transition fixtures
- Capability support report

### Acceptance and negative checks

- Naval units cannot traverse a deck because the horizontal cell contains water.
- Aircraft landing and cargo unloading require valid destination surfaces.
- Passengers survive identity-preserving transport transitions and die/escape only per approved rules.
- Every admitted locomotion ID has deterministic save/replay evidence.
- Locomotion/transport admission follows surface and protected-refuge contracts using independent capability fixtures; unavailable reservations cause explicit zero-mutation rejection.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Special movement is not implemented by setting altitude or transparency.
- Do not relax current shield and cargo protection rules.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-027 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-028 — Implement height-aware combat, visibility and projectile contracts

**Specialist:** Combat simulation engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required

### Exact scope

Make elevation and layers meaningful only through explicit rules, with visuals accurately reflecting the outcome.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/combat.ts (new)
- packages/fusion/src/sim/visibility.ts (new)
- packages/fusion/src/rules.ts
- tests/unit/elevation-combat.test.ts (new)

### Declared file boundary

- packages/fusion/src/sim/combat.ts (new)
- packages/fusion/src/sim/visibility.ts (new)
- packages/fusion/src/rules.ts
- tests/unit/elevation-combat.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define range, line-of-fire, line-of-sight, cover, arc and target-height semantics per profile; source-specific height bonuses require research evidence.
2. Implement deterministic projectile/beam collision against permitted authoritative volumes/surfaces, separate from render mesh triangles.
3. Distinguish deck targets from under-bridge targets and define whether bridge spans intercept each weapon class.
4. Preserve warm-up, burst, reload, hardpoint and target-category state through the capability runtime.
5. Create fixtures for plateau/cliff/ramp, underpass, splash above/below, air target and fog/stealth interaction.

### Required deliverables

- Height-aware combat/visibility modules
- Weapon target/collision schema
- Cross-layer combat fixtures

### Acceptance and negative checks

- A shell aimed at a ship does not accidentally select a deck tank through a shared cell ID.
- Occlusion and splash behavior match the published profile.
- Projectile visuals never decide damage or RNG.
- Legacy combat fixtures remain unchanged.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not introduce a universal high-ground bonus from intuition.
- GPU raycasts/physics cannot be authoritative collision.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-028 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-029 — Implement pluggable construction and economy policies

**Specialist:** RTS economy engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-005](../tasks/ENG-005.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

### Exact scope

Provide explicit policy interfaces for the distinct construction/economy families required by the researched series.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/economy.ts (new)
- packages/fusion/src/sim/construction.ts (new)
- packages/content-schema/src/economy.ts (new)

### Declared file boundary

- packages/fusion/src/sim/economy.ts (new)
- packages/fusion/src/sim/construction.ts (new)
- packages/content-schema/src/economy.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Freeze current sidebar/placement and field-harvester behavior as a legacy policy adapter.
2. Specify finite state and accounting interfaces for placement construction, worker/dozer site construction, deployable cores and mobile-production foundations.
3. Specify resource providers for field harvest, fixed nodes, supply collection, secondary income and command-point/upgrade-point models; do not combine currencies implicitly.
4. Implement the common transaction/reservation/refund contract and one approved fixture per policy; unsupported policy variants remain blocked through capability validation.
5. Create per-policy child execution packets from the approved historian matrix for all source-specific rules not covered by the common implementation.

### Required deliverables

- Construction/economy policy interfaces and adapters
- Accounting invariants and fixture set
- Explicit unresolved per-profile policy tasks

### Acceptance and negative checks

- Credits/resources cannot be created by cancel, capture, death, repeated build or reconnect.
- Every released policy has a complete build/produce/cancel/destruct loop.
- Legacy policy output is unchanged.
- Incompatible economy families cannot be silently mixed into one world.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- A schema or policy name alone is not completion of that game family.
- Every generated child task requires independent acceptance before the parent can claim capability coverage.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-029 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-030 — Implement technology, production and upgrade dependency contracts

**Specialist:** Technology tree engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-029](../tasks/ENG-029.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

### Exact scope

Preserve faction identity and make every admitted roster producible without fabricated prerequisite substitutions.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/production.ts (new)
- packages/content-schema/src/technology.ts (new)
- packages/fusion/src/worldpack.ts
- packages/fusion/src/mashup.ts

### Declared file boundary

- packages/fusion/src/sim/production.ts (new)
- packages/content-schema/src/technology.ts (new)
- packages/fusion/src/worldpack.ts
- packages/fusion/src/mashup.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Represent prerequisites, alternative producers, negative exclusions, upgrade effects and faction/era restrictions as validated typed expressions.
2. Retain exact legacy world namespaces and prerequisite remapping for old profiles; new composition records any role substitution explicitly.
3. Implement producer loss/capture/pack/unpack behavior, queue pause/resume, refunds and upgrade ownership rules.
4. Generate reachability proof for every buildable definition from its allowed starting state, including faction-specific construction policies.
5. Produce an inspector explaining why an item is locked, unavailable, unsupported or excluded by the chosen homage rules.

### Required deliverables

- Technology/production validator and runtime
- Per-faction build reachability proofs
- UI lock-reason data

### Acceptance and negative checks

- No buildable unit has an unreachable or wrong-faction producer.
- Capture and loss cannot duplicate queues or upgrades.
- A missing producer is a release failure rather than an automatic generic service building.
- All legacy composed IDs and fixture outputs remain stable.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not enforce the current artificial more-than-one-superweapon rule on every researched source profile.
- Do not silently strip prerequisites to make cross-era composition work.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-030 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-031 — Implement typed capability registration and finite-state execution

**Specialist:** Gameplay systems architect  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-005](../tasks/ENG-005.md) — accepted evidence required
- [RES-024](../tasks/RES-024.md) — accepted evidence required

### Exact scope

Create the common execution contract needed for researched signature mechanics without generic fallbacks.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/content-schema/src/capabilities.ts (new)
- packages/fusion/src/sim/capabilities.ts (new)
- tests/unit/capability-runtime.test.ts (new)

### Declared file boundary

- packages/content-schema/src/capabilities.ts (new)
- packages/fusion/src/sim/capabilities.ts (new)
- tests/unit/capability-runtime.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define a capability ID/version with state schema, command schema, costs, targeting, interruption, tick ordering, checksum, serialization and event requirements.
2. Implement deterministic registration and dispatch with explicit conflicts and capability composition rules.
3. Adapt a small already-tested ability (for example existing deploy or repair) through the new runtime and prove legacy parity.
4. Add release validation rejecting unknown capability IDs, absent serializers and incomplete fixtures.
5. Publish the approved capability matrix and child-task template for specialist implementations from ENG-032 through ENG-034 and historian content packets.
6. Encode and fixture-test the downstream invariant that OPS-005 materializes bounded implementation and independent-review work orders for every referenced capability ID/version, including environment, objective and mode rules. An unowned or unsupported reference blocks dependent content; a registry declaration is not implementation. Prove the validator using explicitly labelled test fixtures here; actual published ownership and full capability acceptance are checked by OPS-005, capability parents and pack gates.

### Required deliverables

- Capability schema/runtime
- Legacy ability adapter
- Completeness and conflict validators

### Acceptance and negative checks

- Unknown capability fails content loading rather than silently doing nothing.
- Duplicate commands and interrupted actions follow registered semantics.
- All persistent capability state participates in snapshot and checksum.
- An existing adapted ability preserves the ENG-003 output.
- Registry and positive/negative fixtures prove that every referenced capability needs an honest versioned support/ownership record and that missing builder, reviewer, serializers or fixtures blocks dependent content. This foundation closes with its bounded adapted-ability fixture; it does not wait for all downstream capability implementations. OPS-005, generated capability reviews and pack gates must later verify actual implementation evidence, including non-entity weather/ice/hazard/objective rules.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Avoid a stringly-typed catch-all ability callback with unvalidated state.
- No unit may be released while its signature capability is only a registry placeholder.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-031 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-032 — Implement occupation, cargo, garrison and portal state contracts

**Specialist:** Entity interaction systems engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2445](https://linear.app/thunderchild-creative/issue/THU-2445)

### Exact scope

Unify identity-safe occupancy accounting while keeping garrison, transport, capture and tunnel semantics distinct.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/occupation.ts (new)
- packages/fusion/src/sim/transport.ts (new)
- packages/content-schema/src/occupation.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/fusion/src/sim/occupation.ts (new)
- packages/fusion/src/sim/transport.ts (new)
- packages/content-schema/src/occupation.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define location states for world surface, passenger slot, garrison slot, portal transit and destroyed; an entity has exactly one authoritative location.
2. Implement shared enter/exit/reservation/death accounting and adapters for existing transport and engineer interactions.
3. Instantiate separate capability packets for garrison firing/clearing, tunnel travel, capture/repair terminals and faction-specific transport rules from research.
4. Enforce capacity, owner/alliance permissions, valid exit surface and protection checks at both reservation and completion.
5. Test owner changes, destroyed carrier/host, blocked exits, duplicate enters and snapshot in transit.

### Required deliverables

- Occupation state/accounting layer
- Existing-mechanic adapters
- Per-capability execution packets and interaction fixtures

### Acceptance and negative checks

- No entity can occupy both a map surface and a carrier/garrison.
- Blocked exits return a stable reason without teleporting.
- Capture preserves or releases occupants exactly as the selected source/homage policy says.
- All occupation states restore without identity loss.
- Nested cargo protection roots and reserved-refuge references survive capability-state serialization; contract fixtures prohibit detaching or relocating the same protected child twice.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not treat a tunnel as an invisible transport without its approved rule packet.
- Allied capture requires current explicit one-use consent in persistent mode.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-032 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-033 — Implement control, detection and timed-power lifecycle contracts

**Specialist:** Abilities and status-effects engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [ENG-028](../tasks/ENG-028.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2445](https://linear.app/thunderchild-creative/issue/THU-2445)

### Exact scope

Provide exact lifecycle support for mind control, stealth/detection, EMP, timed protection and other approved powers.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/status-effects.ts (new)
- packages/fusion/src/sim/ownership.ts (new)
- packages/content-schema/src/status-effects.ts (new)

### Declared file boundary

- packages/fusion/src/sim/status-effects.ts (new)
- packages/fusion/src/sim/ownership.ts (new)
- packages/content-schema/src/status-effects.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define status identity, source, target, start/end tick, stacking policy, dispel/death behavior and saved ownership generation.
2. Adapt existing timed conversion, permanent control and shield/power behavior without changing legacy outputs.
3. Instantiate source-specific packets for control caps/overload, stealth detectors/disguise, EMP, temporal effects, toxins/radiation/fire and support-strike variants.
4. Resolve effect precedence and simultaneous expiry in deterministic order; prevent a stale effect from restoring an obsolete owner.
5. Emit authorized presentation events and save every active effect and pending transition.

### Required deliverables

- Timed status/control lifecycle layer
- Legacy adapters
- Per-effect semantic packets and replay fixtures

### Acceptance and negative checks

- Source death, target death and intervening capture cannot resurrect or misassign ownership.
- Stacking/expiry follows explicit profile rules.
- Hidden effects do not leak unauthorized information in secure view mode.
- Every admitted effect has save/replay and interruption evidence.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- A green tint does not implement radiation, and transparency does not implement stealth.
- Do not bypass persistent shield/capture rules through special abilities.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-033 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-034 — Implement multi-mode entities, hardpoints and squad lifecycle contracts

**Specialist:** Advanced unit systems engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [ENG-027](../tasks/ENG-027.md) — accepted evidence required
- [ENG-030](../tasks/ENG-030.md) — accepted evidence required
- [ENG-032](../tasks/ENG-032.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

### Exact scope

Support transformations, deployable production, hardpoints and squads through explicit state rather than interchangeable unit aliases.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/sim/multimode.ts (new)
- packages/content-schema/src/multimode.ts (new)
- packages/fusion-view/src/frame.ts (new)

### Declared file boundary

- packages/fusion/src/sim/multimode.ts (new)
- packages/content-schema/src/multimode.ts (new)
- packages/fusion-view/src/frame.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define stable root entity identity with mode-specific movement, weapons, footprint and production capabilities.
2. Implement transition eligibility, cost/time, interruption, clearance and preserved health/veterancy/cargo rules.
3. Define hardpoint/squad-member identity, damage targeting, replacement and aggregate UI rules; instantiate source-specific child packets before admission.
4. Adapt existing MCV deploy/pack behavior through compatibility adapters and prove saved-state consistency.
5. Create fixtures for transformation on invalid terrain, damaged transition, producer destruction and snapshot mid-transition.

### Required deliverables

- Multi-mode and component lifecycle schema/runtime
- Legacy deploy adapter
- Per-family child packets and fixtures

### Acceptance and negative checks

- Transforming cannot heal, duplicate cargo, reset reload or evade damage unless an approved rule explicitly says so.
- A mode change cannot leave an invalid surface/footprint.
- Squad members and hardpoints preserve stable identity through save/replay.
- Every admitted mobile-production policy has a complete deploy/produce/pack cycle.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not call a static factory a crawler merely because it uses a crawler model.
- Parent completion requires implementation evidence for admitted child capabilities, not just generated tickets.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-034 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-035 — Teach AI the new economy, surfaces and signature capabilities

**Specialist:** RTS AI engineer  
**Gate:** G5 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-021](../tasks/ENG-021.md) — accepted evidence required
- [ENG-029](../tasks/ENG-029.md) — accepted evidence required
- [ENG-030](../tasks/ENG-030.md) — accepted evidence required
- [ENG-032](../tasks/ENG-032.md) — accepted evidence required
- [ENG-033](../tasks/ENG-033.md) — accepted evidence required
- [ENG-034](../tasks/ENG-034.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

### Exact scope

Make computer opponents exercise the actual game systems without omniscient shortcuts in the new homage profile.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/fusion/src/ai.ts
- packages/fusion/src/sim/ai (new)
- tests/scenarios/faction-ai (new)

### Declared file boundary

- packages/fusion/src/ai.ts
- packages/fusion/src/sim/ai (new)
- tests/scenarios/faction-ai (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define AI observation and command interfaces equivalent to the chosen player information policy.
2. Implement economy/base plans for each admitted construction policy and legal faction build graph.
3. Add tactical use of bridges, repair, transports, garrisons, detection, special powers and transformations only when supported by the faction packet.
4. Handle topology changes and unreachable objectives with explicit replanning; avoid sending endless units to a destroyed bridge.
5. Run seeded scenario suites and export command logs, economy stalls and capability-use coverage.

### Required deliverables

- Capability-aware AI adapters
- Per-faction strategy packets
- Seeded AI scenario report

### Acceptance and negative checks

- AI can establish a working economy and reach its admitted tech tree.
- Bridge destruction and repair lead to legal tactical adaptation.
- AI uses signature capabilities with valid commands and information.
- Difficulty changes are documented profile data rather than hidden resource cheating.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not claim full faction support because the AI builds one generic tank.
- Legacy AI behavior remains frozen unless separately approved.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-035 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-036 — Build release content completeness and semantic coverage gates

**Specialist:** Content validation engineer  
**Gate:** G5 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-010](../tasks/ENG-010.md) — accepted evidence required
- [ENG-030](../tasks/ENG-030.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required

### Exact scope

Make every requested faction building/unit and its behavior auditable without inflated alias counts.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- tools/content/coverage.ts (new)
- packages/content-schema (new)
- tools/art-coverage.ts
- tests/content (new)

### Declared file boundary

- tools/content/coverage.ts (new)
- packages/content-schema (new)
- tools/art-coverage.ts
- tests/content (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Consume historian source-roster manifests with stable source game/expansion/faction/entity/variant IDs.
2. Join each record to rules, production reachability, capability fixtures, model/animation/audio assets, rights eligibility and playable acceptance evidence.
3. Report counts separately for source identities, adapters, aliases, buildable entries, campaign-only entries, finished models and fully accepted content.
4. Reject missing or contradictory references, generic visual stand-ins, missing signature abilities and unsupported mechanics in release packs.
5. Generate per-faction remaining-work packets automatically from the exact missing rows; never replace the source roster with what the engine already supports.

### Required deliverables

- Coverage validator and reports
- Missing-row task generator
- Release content gate

### Acceptance and negative checks

- Every researched in-scope source entity has a traceable disposition.
- Alias expansion cannot increase unique-source or unique-model completion counts.
- A model-only or stats-only entry cannot be marked fully complete.
- An incomplete faction remains visibly incomplete and cannot pass its release gate.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not remove difficult units from the source roster to obtain 100%.
- Campaign-only and unbuildable content require explicit handling, not silent exclusion.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-036 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-037 — Version snapshot and network contracts for the new engine profile

**Specialist:** Protocol architect  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2444](https://linear.app/thunderchild-creative/issue/THU-2444)

### Exact scope

Negotiate exact authoritative and presentation formats before any new-profile state or commands are used.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- packages/contracts/src/mmo.ts
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/fingerprints.ts
- packages/fusion-view/src/protocol.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- packages/contracts/src/mmo.ts
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/fingerprints.ts
- packages/fusion-view/src/protocol.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Specify snapshot v2 and protocol/view schema identities with profile, sim/rules/content/map/presentation digests.
2. Define strict command parsing including surface targets and capability versions; reject unknown fields/types according to the published compatibility policy.
3. Implement handshake/capability negotiation and actionable unsupported-version responses.
4. Preserve the v1 reader/protocol and fingerprint interpretation for legacy worlds; establish explicit new-world selection.
5. Test old/new client-server combinations, mismatch, malformed data and replay provenance.

### Required deliverables

- Versioned snapshot/protocol schemas
- Handshake and compatibility matrix
- Malformed/mismatched input tests

### Acceptance and negative checks

- Incompatible client cannot send partially interpreted commands.
- Presentation-only changes do not invalidate authoritative state through the new versioned path.
- Legacy clients/worlds remain on documented supported paths.
- Every snapshot carries enough identity to resolve the correct generator/rules.
- Persistent identity {worldId,durableEntityId} survives region/local-ID/authority changes; location handles cannot enter identity equality, event deduplication or asset ownership keys.
- Versioned schemas round-trip protected-refuge reservations, support-loss recovery records and immutable identity without region IDs entering identity equality; use independent serialization fixtures.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not alter the meaning of v1 fields in place.
- Do not bypass digest mismatch with dev or null values.
- Treat {regionId,localEntityId,authorityEpoch} as mutable location/authority metadata, never part of the immutable persistent entity identity.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-037 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-038 — Implement isolated migration, verification and rollback tooling

**Specialist:** Persistence migration engineer  
**Gate:** G3 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-003](../tasks/ENG-003.md) — accepted evidence required
- [ENG-019](../tasks/ENG-019.md) — accepted evidence required
- [ENG-020](../tasks/ENG-020.md) — accepted evidence required
- [ENG-037](../tasks/ENG-037.md) — accepted evidence required

### Exact scope

Make any supported legacy-to-new state transition reviewable and reversible before it touches a live world.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- tools/migration/fusion-v2.ts (new)
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/store.ts
- docs/fusion-upgrade/migration-runbook.md (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- tools/migration/fusion-v2.ts (new)
- packages/fusion/src/persistent.ts
- apps/service/src/mmo/store.ts
- docs/fusion-upgrade/migration-runbook.md (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define the exact supported conversion subset and reject unsupported profiles or missing provenance without mutation.
2. Create a copy-only dry run that preserves original snapshot/journal bytes, backup hashes and pinned old runtime identity.
3. Convert legacy map to equivalent single-surface state and map all persistent entity/status/queue/capture identities without adding new rules automatically.
4. Replay an agreed command interval and compare invariants, balances, ownership, populations, resources and protected state.
5. Document the cutover write fence/cursor and lossless rollback route; restore old artifact+backup only before new writes or with verified reverse migration/journal-tail preservation. Exercise on an isolated clone with post-cutover build/spend/capture/transfer commands.

### Required deliverables

- Migration CLI with dry-run/report mode
- Compatibility and invariant report
- Verified rollback runbook

### Acceptance and negative checks

- Dry run never mutates the source database/files.
- Unsupported migration exits before writing.
- Before admitting new writes, rollback restores the exact original playable state and identity; after new writes it preserves the equivalent current committed state through lossless conversion or forward recovery.
- Every converted record is counted and reconciled; none silently drops.
- Rollback after new-version player writes preserves every committed asset, credit, ownership change and journal event; no blind restore of a pre-cutover backup.
- Migration preserves protected-refuge and support-loss records in declared conversion fixtures, including immutable IDs/protection generations; full bridge runtime qualification belongs to later integration tasks.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- A forward-only database migration cannot be undone merely by redeploying old frontend code.
- No automatic migration of existing players on login.
- If no lossless rollback exists after new writes, use validated forward recovery; data loss is not authorized by a routine rollout/rollback task.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-038 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-039 — Implement server-filtered authoritative view replication

**Specialist:** Multiplayer information-security engineer  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-006](../tasks/ENG-006.md) — accepted evidence required
- [ENG-017](../tasks/ENG-017.md) — accepted evidence required
- [ENG-037](../tasks/ENG-037.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2443](https://linear.app/thunderchild-creative/issue/THU-2443)

### Exact scope

Close the acknowledged hidden-state exposure for the new secure persistent profile through a distinct projection protocol.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- apps/service/src/mmo/view.ts (new)
- packages/contracts/src/mmo.ts
- apps/web/src/mmo.ts
- tests/security/mmo-hidden-state.test.ts (new)

### Declared file boundary

- apps/service/src/mmo/view.ts (new)
- packages/contracts/src/mmo.ts
- apps/web/src/mmo.ts
- tests/security/mmo-hidden-state.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Write an ADR amendment explaining why full local simulation cannot remain secret merely by hiding its rendered objects.
2. Define per-recipient visible/current/last-known data and permitted events; exclude private account/inventory and hidden enemy data.
3. Implement authoritative view deltas and resnapshot with version, epoch, sequence, visibility revisions and bounded history.
4. Use a presentation-only client for secure mode; commands are server validated and cosmetic interpolation cannot fabricate hidden state.
5. Test payload inspection, hidden movement, out-of-sight destruction, cloaking, ally changes, spectator permissions, effects/audio and reconnect.

### Required deliverables

- Secure projection protocol and service
- Presentation-only client session
- Payload-level information-leak test report

### Acceptance and negative checks

- Network messages and client memory contain no prohibited hidden enemy state in secure mode.
- Legal orders still function and server rejects unseen/unauthorized targeting as specified.
- Reconnect and visibility changes do not reveal old hidden state.
- Legacy full-sim beta remains clearly separate with its accepted limitation.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not use client-side obfuscation as the security boundary.
- Do not claim fog security based on screenshot tests.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-039 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-040 — Prove MMO authority and protection invariants under new mechanics

**Specialist:** Persistent systems verification engineer  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-026](../tasks/ENG-026.md) — accepted evidence required
- [ENG-027](../tasks/ENG-027.md) — accepted evidence required
- [ENG-032](../tasks/ENG-032.md) — accepted evidence required
- [ENG-033](../tasks/ENG-033.md) — accepted evidence required
- [ENG-034](../tasks/ENG-034.md) — accepted evidence required
- [ENG-038](../tasks/ENG-038.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2442](https://linear.app/thunderchild-creative/issue/THU-2442)
- [THU-2443](https://linear.app/thunderchild-creative/issue/THU-2443)
- [THU-2444](https://linear.app/thunderchild-creative/issue/THU-2444)
- [THU-2445](https://linear.app/thunderchild-creative/issue/THU-2445)
- [THU-2242](https://linear.app/thunderchild-creative/issue/THU-2242)
- [THU-2244](https://linear.app/thunderchild-creative/issue/THU-2244)

### Exact scope

Ensure new bridges, abilities and modes do not break existing persistence, protection and transfer decisions.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- apps/service/src/mmo/runner.ts
- apps/service/src/mmo/world.ts
- tests/integration/mmo-engine-upgrade-invariants.test.ts (new)
- docs/persistent-world/DECISIONS.md
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- apps/service/src/mmo/runner.ts
- apps/service/src/mmo/world.ts
- tests/integration/mmo-engine-upgrade-invariants.test.ts (new)
- docs/persistent-world/DECISIONS.md

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Create a latest-rule invariant matrix from COMRADE19/20: one-use allied consent bound to owner generation, hostile capture unshielded, no shield entry, stationed ally protection and no outward-fire bypass.
2. Test starter/recovery bindings, packing, superweapon charge, transport protection, barter, ownership and cross-region transfer with new surfaces/capabilities.
3. Extend quiescence detection for active bridge repairs/collapse, status transitions, moving occupants and inbound events.
4. Compare hibernated/woken state to uninterrupted simulation while exercising lease renewal and event-loop yielding under long catch-up.
5. Inject stale fences, duplicate/out-of-order events and interrupted transfer commits; verify idempotent recovery without lost assets.

### Required deliverables

- MMO invariant matrix and executable suite
- Hibernation/catch-up comparison report
- Recovery defect list with minimal reproductions

### Acceptance and negative checks

- No special ability or bridge interaction bypasses shield/consent rules.
- Exactly one authority mutates a region at a time.
- Long wake preserves leases and exact accrual outcomes.
- Every asset is accounted for across transfers, collapse and restart.
- Single-region bridge/protection/cargo authority tests preserve each protected asset exactly once across restart; existing regional handoff remains lossless, while spanning-bridge qualification is owned by ENG-045.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Older decision text cannot override newer approved allied-consent rules.
- No capacity promise follows from a single endurance test.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-040 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-041 — Meet mobile and desktop performance budgets without gameplay degradation

**Specialist:** Performance specialist  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-013](../tasks/ENG-013.md) — accepted evidence required
- [ENG-014](../tasks/ENG-014.md) — accepted evidence required
- [ENG-015](../tasks/ENG-015.md) — accepted evidence required
- [ENG-016](../tasks/ENG-016.md) — accepted evidence required
- [ENG-018](../tasks/ENG-018.md) — accepted evidence required
- [ENG-035](../tasks/ENG-035.md) — accepted evidence required
- [UX-006](../tasks/UX-006.md) — accepted evidence required

### Exact scope

Optimize and validate the accepted visual/gameplay workload on actual supported hardware.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- tests/performance/fusion-3d (new)
- packages/fusion-renderer-3d
- packages/fusion-view
- docs/fusion-upgrade/performance-results (new)

### Declared file boundary

- tests/performance/fusion-3d (new)
- packages/fusion-renderer-3d
- packages/fusion-view
- docs/fusion-upgrade/performance-results (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Run ratified small/normal/stress scenes using fixed camera/command traces and physical device/browser matrix.
2. Measure frame distributions, long tasks, sim tick, input feedback, cold load, transferred bytes, resource lifetime and thermal stability.
3. Profile bottlenecks before changing LOD, instancing, animation update frequency, shadow resolution, texture budgets or chunk streaming.
4. Implement quality tiers and bounded adaptive resolution preserving gameplay-significant state, readable models and fog.
5. Repeat the exact failed workload and publish before/after data plus remaining limits.

### Required deliverables

- Measured performance report
- Quality-tier implementation
- Automated regression thresholds and reproducible traces

### Acceptance and negative checks

- Ratified normal-scene thresholds pass on every supported baseline device.
- A 10-minute thermal run and repeated scene transitions remain stable.
- Low and high presets produce identical gameplay and information policy.
- Unsupported stress capacity is reported honestly with degradation behavior.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not remove units, slow simulation or disable required abilities to meet FPS.
- Do not substitute synthetic desktop throttling for real mobile evidence.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-041 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-042 — Run complete play and synchronized multiplayer acceptance journeys

**Specialist:** Independent RTS gameplay QA lead  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-024](../tasks/ENG-024.md) — accepted evidence required
- [ENG-025](../tasks/ENG-025.md) — accepted evidence required
- [ENG-035](../tasks/ENG-035.md) — accepted evidence required
- [ENG-036](../tasks/ENG-036.md) — accepted evidence required
- [ENG-039](../tasks/ENG-039.md) — accepted evidence required
- [ENG-040](../tasks/ENG-040.md) — accepted evidence required
- [ENG-041](../tasks/ENG-041.md) — accepted evidence required
- [ENG-045](../tasks/ENG-045.md) — accepted evidence required
- [ENG-046](../tasks/ENG-046.md) — accepted evidence required
- [PKG-001](../tasks/PKG-001.md) — accepted evidence required
- [PKG-002](../tasks/PKG-002.md) — accepted evidence required
- [PKG-003](../tasks/PKG-003.md) — accepted evidence required
- [PKG-004](../tasks/PKG-004.md) — accepted evidence required
- [PKG-005](../tasks/PKG-005.md) — accepted evidence required
- [PKG-006](../tasks/PKG-006.md) — accepted evidence required
- [PKG-007](../tasks/PKG-007.md) — accepted evidence required
- [PKG-008](../tasks/PKG-008.md) — accepted evidence required
- [PKG-009](../tasks/PKG-009.md) — accepted evidence required
- [PKG-010](../tasks/PKG-010.md) — accepted evidence required
- [PKG-011](../tasks/PKG-011.md) — accepted evidence required
- [PKG-012](../tasks/PKG-012.md) — accepted evidence required
- [INT-002](../tasks/INT-002.md) — accepted evidence required
- [UX-007](../tasks/UX-007.md) — accepted evidence required
- [WORLD-010](../tasks/WORLD-010.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2487](https://linear.app/thunderchild-creative/issue/THU-2487)

### Exact scope

Validate playable essence and integration through complete tasks, not isolated screenshots or two matching seeds.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- tests/e2e/fusion-3d-journeys (new)
- tools/browser-smoke.mjs
- docs/fusion-upgrade/acceptance-evidence (new)

### Declared file boundary

- tests/e2e/fusion-3d-journeys (new)
- tools/browser-smoke.mjs
- docs/fusion-upgrade/acceptance-evidence (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Run the approved two-faction vertical slice from lobby to economy, full tech progression, mixed combat, bridge destruction/repair and win/loss.
2. Issue a unique move/build/attack from client A and verify it at B, then a distinct command from B at A; exercise contested same-tick actions and reconnect.
3. Run persistent new-settlement and resumed-settlement journeys including protection, allied consent, transfer, restart and away-state reconciliation.
4. Capture real-time video, tactical-zoom stills, journals/checksums, device performance and animation/content coverage.
5. Have an independent experienced RTS reviewer compare the source-informed feel checklist and record specific failed acceptance cases.

### Required deliverables

- Complete gameplay and multiplayer evidence bundle
- Independent review findings
- Mode-by-mode release verdict

### Acceptance and negative checks

- A and B causally affect one another in every mode advertised as synchronized.
- A full faction economy and production ladder can complete without debugging commands.
- Bridge and animation requirements are visible during normal play.
- Persistent restored journeys preserve assets and latest protection rules.
- Native Classic is not marked multiplayer-ready without its own command-fanout evidence.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Screenshots, identical seeds and server-recorded results do not alone prove multiplayer.
- Do not waive critical feel/content failures because infrastructure tests are green.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-042 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-043 — Prepare controlled beta rollout and rehearsed rollback

**Specialist:** Release engineer  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-038](../tasks/ENG-038.md) — accepted evidence required
- [ENG-040](../tasks/ENG-040.md) — accepted evidence required
- [ENG-042](../tasks/ENG-042.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2244](https://linear.app/thunderchild-creative/issue/THU-2244)
- [THU-2487](https://linear.app/thunderchild-creative/issue/THU-2487)

### Exact scope

Make a concrete new-profile beta release reviewable with migration, observability and rollback evidence.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- docs/fusion-upgrade/release-runbook.md (new)
- ops (existing release scripts after inspection)
- apps/service/src/mmo/fingerprints.ts

### Declared file boundary

- docs/fusion-upgrade/release-runbook.md (new)
- ops (existing release scripts after inspection)
- apps/service/src/mmo/fingerprints.ts

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Resolve actual deployed Classic/beta commit, image, database schema and fingerprint; preserve separate beta host/container/database isolation.
2. Build an immutable artifact with sim/rules/content/presentation identities, SBOM/asset manifests and test evidence.
3. Rehearse backup restore, migration and rollback on an isolated clone; verify startup, catch-up, health and representative player journeys.
4. Specify release thresholds, operator steps, canary world/profile selection, monitoring and automatic/explicit rollback triggers.
5. Submit the concrete release record for the existing authorization/review flow; execute only within standing owner authorization and record exact outcome.

### Required deliverables

- Release candidate manifest
- Beta rollout/rollback runbook
- Rehearsal evidence and monitoring checklist

### Acceptance and negative checks

- Rollback restores code plus compatible state, not only frontend assets.
- Classic and legacy worlds remain isolated from the new-profile canary.
- Health includes region startup/catch-up and protocol/digest compatibility.
- Any unfinished live journey remains a release blocker with an owner.
- Rollback after new-version player writes preserves every committed asset, credit, ownership change and journal event; no blind restore of a pre-cutover backup.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not describe a CI artifact as a successful live deployment.
- Never force-stamp fingerprints or mutate existing player worlds to unblock startup.
- If no lossless rollback exists after new writes, use validated forward recovery; data loss is not authorized by a routine rollout/rollback task.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-043 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-044 — Reconcile final coverage and retire temporary paths only after proof

**Specialist:** Programme integration reviewer  
**Gate:** G7 · **Type:** coverage_audit · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-036](../tasks/ENG-036.md) — accepted evidence required
- [ENG-042](../tasks/ENG-042.md) — accepted evidence required
- [ENG-043](../tasks/ENG-043.md) — accepted evidence required

### Exact scope

Close the programme using evidence-linked acceptance for every source entity, mechanic, terrain and release requirement.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- docs/fusion-upgrade/completion-register.json (new)
- packages/fusion-renderer-3d
- experiments/fusion-3d
- Linear programme issues

### Declared file boundary

- docs/fusion-upgrade/completion-register.json (new)
- packages/fusion-renderer-3d
- experiments/fusion-3d
- Linear programme issues

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Reconcile researcher source manifests, per-faction tasks, engine capabilities, terrain/bridge families, art/animation and playable evidence.
2. Distinguish accepted, blocked, deferred by explicit owner decision and out-of-scope reference content; no unresolved item disappears from totals.
3. Verify that every release claim maps to a tested mode/profile and actual deployed artifact.
4. Retire comparison spike runtime imports and development placeholders; retain legacy readers/assets required by existing saves and profiles.
5. Publish residual limitations, maintenance ownership, future content-onboarding template and acceptance record; mark completion only for the agreed scope.

### Required deliverables

- Evidence-linked completion register
- Residual-work and ownership report
- Clean production dependency/artifact inventory

### Acceptance and negative checks

- Every requested in-scope roster/terrain/mechanic has an accepted evidence row or explicit unresolved disposition.
- No development placeholder appears in release content.
- Legacy saves/replays required by compatibility policy still open.
- All public capability claims match the mode-by-mode evidence.
- A reconciliation report may record unresolved dispositions, but neither this release closure nor the programme may be certified complete while any mandatory capability, era, entity, animation, terrain or qualification criterion remains failed, blocked or unverified.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not call the whole series complete because the first vertical slice shipped.
- Do not delete legacy state/readers merely to simplify the codebase.
- Do not use an unresolved disposition as a waiver of mandatory requested content; only an explicit owner scope decision can remove an obligation.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-044 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-045 — Coordinate bridges and topology across region boundaries

**Specialist:** Distributed simulation architect  
**Gate:** G7 · **Type:** bounded_work_order · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-026](../tasks/ENG-026.md) — accepted evidence required
- [ENG-037](../tasks/ENG-037.md) — accepted evidence required
- [ENG-038](../tasks/ENG-038.md) — accepted evidence required
- [ENG-040](../tasks/ENG-040.md) — accepted evidence required

### Exact scope

Extend the single-region bridge release into a durable cross-region infrastructure protocol without two authorities owning the same bridge or occupant.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/01-engine-baseline-and-gap-audit.md
- engine/02-fusion-3d-architecture-and-contracts.md
- docs/adr/010-fusion-engine.md
- docs/adr/014-persistent-engine-profile.md
- apps/service/src/mmo/bridge-coordinator.ts (new)
- packages/fusion/src/world-v2/bridges.ts (new)
- apps/service/src/mmo/runner.ts
- packages/contracts/src/mmo.ts
- tests/integration/mmo-cross-region-bridge.test.ts (new)
- world-art/02_terrain_and_bridges_contract.md

### Declared file boundary

- apps/service/src/mmo/bridge-coordinator.ts (new)
- packages/fusion/src/world-v2/bridges.ts (new)
- apps/service/src/mmo/runner.ts
- packages/contracts/src/mmo.ts
- tests/integration/mmo-cross-region-bridge.test.ts (new)

### Outside this task

- No production deployment or mutation of existing persistent worlds in this task.

### Procedure

1. Define global bridge/span/surface coordinates and choose one canonical authority for bridge state. Use a reviewed ADR; the recommended design places all deck occupants under that authority while on the bridge, with existing idempotent transfer on entry/exit.
2. Specify approach/exit connector subscriptions, topology revision acknowledgements and transfer admission tied to a committed bridge version. Neighbouring regions may mirror topology but never independently mutate bridge health or occupant outcomes.
3. Implement fenced coordinator journals and durable prepare/commit/abort records for operations requiring neighbour clearance. Rebuild clearance reservations must be confirmed before the deck is created; stale, timed-out or partitioned neighbours fail closed.
4. Handle damage/collapse concurrent with transfer admission, duplicate events, owner-region failover, hibernation and reconnect. At every point an entity has one authority/location and one durable transfer identity.
5. Run partition/fence/crash injection at each coordination step, then restore all participating regions and reconcile bridge revision, passengers, cargo, salvage and reservations. Enable cross-boundary authoring only after these fixtures pass.

### Required deliverables

- Cross-region bridge authority ADR and protocol
- Coordinator/connector implementation
- Partition and recovery evidence
- Map authoring validator extension

### Acceptance and negative checks

- A unit crossing a boundary during collapse is neither lost nor duplicated and has one documented authoritative outcome.
- Only the current fenced bridge authority can change bridge state.
- A stale neighbour cannot admit an entity onto a removed deck or complete a conflicting rebuild.
- Restart/partition recovery converges every participating region to one bridge revision without manual data editing.
- The single-region first-slice path remains supported while cross-region capability is gated.
- Persistent identity {worldId,durableEntityId} survives region/local-ID/authority changes; location handles cannot enter identity equality, event deduplication or asset ownership keys.
- Actual cross-region bridge collapse with protected occupants and mixed cargo preserves one authority, one berth/relocation and identical immutable assets across partition, fence change, reconnect and process loss.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Do not implement dual writes to two region simulations as if they were one transaction.
- Do not silently mark all cross-boundary bridges permanently unsupported; this task is the explicit completion path.
- No time-based heuristic may declare a distributed operation committed without its durable acknowledgement evidence.
- Treat {regionId,localEntityId,authorityEpoch} as mutable location/authority metadata, never part of the immutable persistent entity identity.
- Bridge support loss must call the current damage/protection policy; protected MCVs and cargo use the canonical reserved-refuge transaction. Never bypass protection, create a replacement grant or use arbitrary destination fallback.

### Handoff

Provide base/head SHA, changed paths, exact commands and exit codes, evidence artifact paths, dependency versions, unresolved findings and reviewer notes. Mark ENG-045 In Review only when every acceptance item is evidenced. The orchestrator schedules the independent specialist reviewer and downstream work after acceptance.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

## ENG-046 — Implement authoritative match objectives and result lifecycle contracts

**Specialist:** RTS mode and objective simulation engineer  
**Gate:** G3 · **Type:** capability_parent · **Workstream:** Fusion engine and integration

### Execution contract

Read this entire packet, the programme entry point, the current owning Linear issue and its latest amendments, all named context, and accepted prerequisite evidence. Refresh repository instructions and exact HEAD. The coordinator grants an exclusive file lease and a separate reviewer. Use a fresh specialist context for the bounded task; checkpoint evidence and remaining steps before exhaustion. Do not claim completion from this plan or from a commit alone.

Plan paths are relative to `docs/fusion-3d/`; other source paths are repository-root paths. A `(new)` path is an instructed future deliverable, not an existing file. File/context lists do not authorize unrelated edits. Native state is `In Review` until independent acceptance.

### Dependencies

- [ENG-004](../tasks/ENG-004.md) — accepted evidence required
- [ENG-031](../tasks/ENG-031.md) — accepted evidence required
- [RES-024](../tasks/RES-024.md) — accepted evidence required
- [OPS-005](../tasks/OPS-005.md) — accepted evidence required

Related existing owners (do not infer current completion):

- [THU-2487](https://linear.app/thunderchild-creative/issue/THU-2487)

### Exact scope

Define and implement the bounded objective/match-lifecycle foundation and first-battle elimination profile; materialize separate source-specific objective children for later packs. Persistent worlds retain their ongoing-world and existing ladder contracts.

### Required context

- 00-START-HERE.md
- programme/02-fleet-execution.md
- engine/02-fusion-3d-architecture-and-contracts.md
- programme/01-authority-and-scope.md
- research/01_series_research_and_fidelity.md
- packages/fusion/src/game.ts
- packages/fusion/src/modes/ (new)
- packages/contracts/src/index.ts
- apps/service/src/rooms.ts

### Declared file boundary

- packages/fusion/src/modes/ (new)
- packages/fusion/src/game.ts via integration lease
- tests/unit/fusion-objectives.test.ts (new)
- tests/integration/fusion-match-results.test.ts (new)

### Outside this task

- Do not clone original campaigns or add an FPS mode.
- Do not make persistent worlds terminate because a skirmish victory condition fires.

### Procedure

1. Read current mode selection/result handling and the pinned seed rules; separate match, team/player status and persistent settlement lifecycle.
2. Define versioned objective state, required victory/defeat predicates, team/alliance policy, draw/tiebreak/simultaneous terminal-event ordering, surrender/disconnect handling, post-terminal command policy and result identity.
3. Implement the seed elimination/capability fixture through authoritative fixed-tick commands, keeping native Classic and legacy Fusion values unchanged.
4. Generate source-specific objective work orders for control-node/crawler/class modes and any approved Renegade/arena adaptations; document unavailable or deliberately mode-specific behavior rather than silently using elimination for every pack.
5. Serialize objectives and result-finalization cursor; make duplicate finalization, replay, reconnect and server restart produce one outcome and exactly-once reward/result bookkeeping.
6. Test simultaneous last-unit/base loss, cargo/packed-asset accounting, team defeat, surrendered/rejoining clients, early disconnect and late commands; verify persistent world continues under its own contract.

### Required deliverables

- Mode/objective schema and first-battle implementation
- Source-specific objective child manifest
- Independent terminal-event/replay/result fixtures

### Acceptance and negative checks

- Each included mode selects an explicit versioned objective policy; a missing policy cannot silently fall back to elimination.
- The seed battle reaches a visible deterministic victory/defeat/draw outcome agreed by opposing clients.
- Simultaneous terminal events, duplicates and restart never finalize two conflicting outcomes or award twice.
- Persistent protection/recovery/world continuity remains unchanged; source-specific objective children are required before their era gate closes.

### Guardrails

- Read the current repository instructions and record the exact base SHA before editing; refresh this audit if HEAD has moved.
- Acquire an exclusive file lease for shared simulation, rules, schema or protocol files. Do not edit outside the listed ownership boundary without an orchestrator-approved task amendment.
- Preserve native Classic behavior and frozen legacy Fusion profiles. New homage behavior must be selected by an explicit versioned profile, never inferred from renderer or faction name.
- Unknown source semantics, missing art, failed tests and incomplete dependencies are blocking evidence, not permission to invent defaults, alias an unrelated unit, skip a test or mark the task complete.
- Submit implementation plus measured evidence for independent review. Passing a test does not establish visual or historical fidelity unless that test explicitly checks it.
- Avoid a stringly-typed catch-all ability callback with unvalidated state.
- No unit may be released while its signature capability is only a registry placeholder.
- Do not count a local win banner or server-recorded unverified client claim as authoritative match result.
- This is a bounded coordination/contract parent, not permission to implement an entire era or capability family in one context. Before substantive execution, materialize the required source/entity/capability children using the canonical work-order contract; delegate one bounded leaf per worker, retain every parent criterion, and close only after independent child evidence reconciles.

### Handoff

Return exact revisions, mode policies and generated child IDs, expected/actual terminal-event traces, persistence/reconnect evidence and independent review; use In Review until accepted.

The handoff must include exact base/head and manifest hashes; changed paths; each criterion with expected/actual result and evidence; commands and exit codes; reviewer identity; blockers and next action. A mandatory failed, blocked or unverified criterion cannot be converted to Done by an unresolved-disposition note.

---

