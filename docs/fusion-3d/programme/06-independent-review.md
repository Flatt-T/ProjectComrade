# Independent programme review

Review date: 18 November 2026. Scope: the Fusion 3D planning contracts, specialist task packets and their readiness for a fleet of smaller implementation agents. This is a review of a plan, not a certification of an implemented game. The review checked consistency against the owner's current scope and preservation requirements, not whether the first renderer demonstration looks attractive.

## Findings recorded during review

| Review ID | Severity | Finding | Required resolution |
| --- | --- | --- | --- |
| REV-01 | High | The engine coordinate contract originally made `regionId` part of a persistent entity's stable identity. Region handoff would then change identity while the programme promises stable ownership, selection, effects and save continuity. | Use an immutable global identity such as `(worldId, durableEntityId/assetId)`; keep region/local handle/authority epoch as location and authority metadata. Test transfer and reconnect without duplicated or replaced ownership/effect identities. |
| REV-02 | High | The blanket bridge-collapse rule destroys all supported non-air occupants, while protected newcomer/recovery MCVs must remain protected until their existing end conditions. Reserving an infrastructure corridor does not prevent a protected MCV from travelling onto a bridge. | Publish a precise protection-precedence table for bridge damage/collapse, including protected MCVs, protected cargo and unit invulnerability. Do not allow environment damage to bypass existing guarantees. Resolve the gameplay outcome before enabling the affected combination and test it through restore/transfer. |
| REV-03 | High | Restoring the old backup as a forward-only migration rollback would discard committed player actions if the new version had already accepted writes. | Separate a write-fenced pre-admission rollback from post-admission recovery. Require lossless journal-tail/reverse-migration recovery or a forward fix after new writes. Never silently restore an old backup over newer accepted gameplay. Include post-cutover commands in the rollback rehearsal. |
| REV-04 | High | Programme, research and art documents specify competing generated-task keys and stage sets. The art-only six stages omit dedicated simulation and effects/audio/UI production, although those are required for whole-entity acceptance. | Give OPS-005 one publication and identity map, RES-003 one source identity schema, and ART-013 an asset-stage extension/validation role. Use one canonical stage set and collision/idempotency policy. An art review cannot mark an entire entity complete without simulation and effects/audio/UI evidence. |
| REV-05 | Medium | Some packets are capability-family or delivery-gate work rather than directly executable small leaves. Prose external gates and implicit dependencies can let a naive scheduler start them too early. | Classify family/gate packets explicitly; require their bounded child generation before implementation or closure. Convert resolvable external gates into actual task IDs and validate the unified dependency graph. Do not call every top-level packet a tiny implementation leaf. |
| REV-06 | Low | Engine handoffs use `Ready for Review`, while the observed Linear team uses `In Review`. | Use the real Linear state and keep any `review_ready` metadata separate; do not invent or create workflow states incidentally. |
| REV-07 | High | Broad end-to-end acceptance inserted into foundational tasks can create semantic cycles even when `depends_on` is acyclic. Likewise, early research framework tasks cannot be both accepted predecessors and unfinished whole-series integrations. | Match each task acceptance to its implementation layer. Keep regional end-to-end bridge recovery at ENG-045/WORLD-010 and final qualification; earlier schemas/reservations use contract fixtures. Close bounded research seed/framework tasks with exact reviewed records, then require every era extension at whole-series RES-028/029 and catalogue gates. |

## Locations checked

REV-01 and REV-03 originate in the [engine architecture](../engine/02-fusion-3d-architecture-and-contracts.md), especially time/coordinates and save/replay/migration. REV-02 crosses the [preserved owner rules](01-authority-and-scope.md), [bridge defaults](../world-art/02_terrain_and_bridges_contract.md) and ENG-024's blanket occupant outcome. REV-04 crosses the [programme work-order contract](04-content-work-order-contract.md), [research catalogue schema](../research/02_catalogue_schema_and_completion.md), [art work-order expansion](../world-art/04_per_entity_work_orders.md), OPS-005 and ART-013. REV-05/06 concern the structured task manifests and generated issue handoffs. REV-07 concerns ENG-022/024/026/027/032/037/038/040/045 and the acceptance/completion semantics of RES-024 through RES-029.

## Scope and evidence assessment

The plan correctly distinguishes a completed engine/content programme from an early playable slice. It includes the principal RTS families and expansions, explicit released spin-off/mobile dispositions, campaign/neutral/alternate-form accounting, Dune/custom compatibility, broad terrain kits and the required bridge lifecycle. It does not claim that discovery-source object counts are complete playable rosters. The unavailable video remains an evidence limitation rather than an invented viewing claim.

The source-to-Fusion adaptation ledger is necessary because a unified mode cannot preserve mutually incompatible economy, production and victory systems by merely sharing names and meshes. The documented capability, faction, game-feel and independent review contracts make those changes inspectable. Keeping native Classic and frozen legacy Fusion profiles separate prevents the new visual brief from silently changing historical or saved-world rules.

The planning task's scope is appropriate: engine, tools, research and production work can proceed while a specific asset or distribution route is unresolved. Rights treatment distinguishes code licences from content and commercial use; it does not treat original modelling as blanket permission for source designs. The review does not supply legal clearance.

## Publication checks

Before the pack is called implementation-ready, reconcile the high-severity findings consistently in prose and machine-readable packets, then validate:

1. Every dependency resolves to a task or a specifically identified existing owner.
2. The combined graph is acyclic and the first slice does not depend on final whole-catalogue closure.
3. Every full-scope requirement has a delivery owner and bounded expansion rule, with no silent default exclusion.
4. Final gates depend on all mandatory era, terrain, state, multiplayer, migration and operational acceptance.
5. Shared schemas and files have one integration owner; duplicate task generators cannot create parallel contradictory issue trees.
6. Claiming an entity complete requires its exact source/definition/asset/clip/behaviour/effects/audio/UI/evidence set, not a majority of stages or an aggregate count.

The final unified task graph was still being assembled during the first review pass. Graph validation and the disposition of each finding must be appended before publication; this initial review must not be represented as final graph approval.

## Follow-up contract verification

The follow-up review found the immutable-identity contract corrected to `{worldId, durableEntityId}`, with region/local/authority values explicitly separated. The bridge contract now defines protection-first damage plus deterministic reserved entry-bank refuge handling, including protected mixed cargo, admission failure, durable exceptional recovery and conservation tests. The migration contract distinguishes pre-write rollback from lossless post-write recovery and requires newly committed actions to survive. These are specification resolutions; their implementation remains future work.

Programme and art contracts now agree that OPS-005 is the sole publisher, RES-003 owns canonical source identity, and ART-013 validates asset expansion. They use eight canonical stages, including SIM and FX_AUDIO_UI, and require those stages before whole-entity closure. Final graph review must verify the research documents and generated packets carry the same contract.

The reviewer also identified stale blanket bridge-death/no-relocation sentences in the first ENG-024 packet and over-broad end-to-end acceptance copied into early protocol/reservation tasks. Those must be checked in the final rendered packets, not merely corrected in one narrative document. The same consistency requirement applies to task workflow states and framework-versus-whole-series research completion.

## Final independent planning acceptance

Final semantic review: **18 November 2026, 01:26 UTC**. Reviewed task manifest SHA-256: `388d2370296f355fbfa452632b73aac3e27adcb349c8f2ec231a1ac16f03b3f1`. Reviewed validator SHA-256: `92c63b6b923d122c67b992b6c55fc897ef1a330e9af2aa9bdd259c1ffd077d30`.

**Verdict: PASS for planning acceptance. No open execution-blocking semantic finding remains in the reviewed manifest and contracts.** The initial provisional review above is retained for traceability and is superseded by this final disposition. External issue-publication reconciliation remains a separate, mandatory check owned by the programme publisher, as specified below. This verdict does not certify implementation, a complete historical census, generated future production leaves, legal permission, device performance, multiplayer readiness or deployment.

The final pass read the entry point, both independent review records, the complete machine-readable task graph, the validator, the scope/fleet/quality/content contracts, the engine architecture, the research catalogue schema and the terrain/bridge and per-entity work-order contracts. It inspected the foundation, generator, bridge/protection, persistence, objective, first-battle, era-delivery and final-closure packets. It also compared all 138 rendered task packets with their canonical fields and compared the core contracts in all five specialist manifests with the unified manifest.

### Final findings and corrections

| Review ID | Final disposition | Evidence and acceptance boundary |
| --- | --- | --- |
| REV-01 | Resolved in the plan | The architecture and ENG-006/026/037/045 use immutable `{worldId, durableEntityId}` identity. Region, local handle and authority epoch are location/authority metadata. Their fixtures require ownership, cargo, event and selection continuity across handle changes. |
| REV-02 | Resolved in the plan | The bridge contract and final ENG-024 packet apply the ordinary damage/protection path before occupant consequences. Protected roots and mixed cargo have deterministic reserved entry-bank berths, atomic admission and a durable exceptional recovery record. The earlier unconditional death/no-relocation conflict is absent from the accepted packet. |
| REV-03 | Resolved in the plan | The architecture, release contract and ENG-038 distinguish rollback before admitting newer writes from lossless post-admission recovery. Post-cutover build/spend/capture/transfer actions must survive; a blind old-backup restore cannot pass. |
| REV-04 | Resolved in the plan | Programme, research and art contracts assign canonical identity to RES-003, the sole publisher and real-ID map to OPS-005, and upstream asset expansion to ART-013. They agree on eight entity stages, including SIM and FX_AUDIO_UI, with stable hash identities, collision failure, idempotence and complete-entity review. |
| REV-05 | Resolved in the plan | Tasks distinguish bounded work, seed specifications, research/capability/production parents, audits and delivery/integration gates. Parent packets require bounded children before substantive execution and accepted child evidence before closure. All declared blocking dependencies resolve to tasks in the unified graph. |
| REV-06 | Resolved in the plan | Published task packets use the native `In Review` state. No active Markdown contract retains `Ready for Review`; its occurrence in this historical findings table is explanatory only. |
| REV-07 | Resolved in the plan | ENG-022/027/037/038 accept reservation, capability, serialization and migration fixtures at their own layer. ENG-024/026/040 qualify single-region runtime behavior; ENG-045 and WORLD-010 own actual spanning-bridge recovery. RES-024–027, ART-002 and WORLD-001 explicitly close bounded seed/framework work, with whole-series extensions retained at later gates. |
| REV-08 | Found and corrected during the final pass | ART-013's former deliverable demanded a report against the not-yet-published OPS-005 real-ID map, and its idempotence criterion referred to the downstream publisher. The corrected deliverable is a seed/expected-ID coverage report and downstream reconciliation template. Fragment idempotence uses fixture inputs; OPS-005 owns actual publication proof. ART-013 can now finish before its consumer. |
| REV-09 | Found and corrected during the final pass | ART-006 formerly demanded captures in both renderer candidates even though ENG-007/008 depend on ART-006. It now supplies immutable GLB bytes, camera/light/pose settings and offline previews. ENG-007/008 and ENG-009 own actual comparison captures and input-equality verification. The semantic dependency cycle is removed. |
| REV-10 | Found and corrected during the final pass | ENG-029/030/032/033/034/035/046 required published bounded implementation children but lacked an explicit prerequisite on the sole publisher. Each now depends on OPS-005. ENG-031 remains an upstream foundation: its corrected procedure and acceptance prove support/ownership validation with positive/negative fixtures and one adapted ability, while actual publication and implementation evidence remain downstream obligations. This makes readiness explicit without requiring the registry to wait for its own consumers. |

REV-08 through REV-10 were verified after correction in the specialist JSON, unified JSON, complete task packets and regenerated workstream register. They are closed planning findings, not deferred implementation defects.

### Structural verification

Running `python validate_plan.py` against this snapshot returned **PASS**, 138 initial tasks and zero errors. Independent closure inspection confirmed:

- The graph is acyclic. There are no unresolved declared dependency IDs, duplicate task IDs, repeated dependencies or unreconciled `required_external_gates` fields.
- INT-005 has both INT-004 and INT-006 as prerequisites. INT-006 depends on the qualified candidate INT-004, so candidate documentation is required before rollout closes without depending on rollout completion itself.
- The final closure contains **137 tasks including INT-005**. The only task outside that closure is RES-002. Its exception is explicitly limited to inaccessible video-dependent observations; it cannot waive source evidence, requested functionality or another mandatory task.
- INT-001 has 72 tasks in its closure including itself. It has no PKG delivery gate, RES-028/029 whole-census closure or later INT-002–006 gate as an ancestor. The first playable battle therefore does not wait on final catalogue acceptance.
- All 138 complete Markdown packets exist. Their titles, scopes, handoffs, prerequisites, context, procedures, deliverables, acceptance and guardrails contain the canonical manifest text. Core contracts in the programme, era-delivery, research, engine and world/art manifests agree with the unified manifest.

These checks establish the initial graph only. Future generated entities, capability implementations, terrain kits, variants and review parts are mandatory additional work. OPS-005, RES-028/029, ENG-036 and the delivery gates must validate the expanded graph and exact coverage sets when those leaves exist. A green initial-plan validator cannot certify those future tasks by implication.

### Semantic closure and ownership

**Seed scope remains finite.** RES-024–027 pin independently reviewed RA1 Allied/Soviet first-battle records and explicit bridge evidence/adaptations. Their broad category lists define schema coverage and later extension obligations; they are not permission to invent other eras' values or require every era to finish before the seed can close. ART-002 and WORLD-001 apply the same distinction to faction style and terrain mapping. RES-028 explicitly joins all RES-004–023 source dispositions and their capability, terrain, feel and adaptation extensions. RES-029, the era gates and INT-003 retain full-scope reconciliation. A seed-only result cannot satisfy those gates.

**Foundation contracts precede consumers.** ART-003 supplies the export/schema proposal before ENG-010 implements runtime ingestion. ART-004 supplies clip/pose/event fixtures before ENG-015/016 implement production playback. The corrected ART-006 supplies offline benchmark assets before the two renderer spikes. The corrected ART-013 supplies expansion fixtures before OPS-005 publishes. These interfaces can be independently reviewed without requiring their downstream implementations to be complete.

**Capability and objective work has an owner.** The [gameplay coverage review](07-gameplay-coverage-review.md) is consistent with the final packets: ENG-031 owns capability registration, lifecycle and support validation; OPS-005 materializes bounded implementation and independent-review leaves for every required capability version, including non-entity environment and mode rules. All seven capability parents explicitly depend on OPS-005. The registry foundation can close with its bounded adapted-ability and validator fixtures; it cannot certify other capabilities merely by declaring them. ENG-046 owns authoritative objective/result lifecycle and the first-battle elimination profile, with later source-specific objective children required at the affected era gates. Duplicate finalization, simultaneous terminal events, save/reconnect/restart and persistent-world non-termination are explicit acceptance cases. A declared capability or terrain effect cannot replace accepted implementation evidence.

**Completion cannot be obtained by relabelling a blocker.** PKG gates cannot close with mandatory children incomplete, source-blocked or rights-blocked for the promised route. ENG-044 explicitly distinguishes an honest reconciliation report from programme/release acceptance. INT-003 routes missing rows back to production and keeps its gate open; INT-005 requires every mandatory programme criterion to be accepted. The universal packet handoff also prohibits turning failed, blocked or unverified criteria into Done through an unresolved-disposition note. Counts, attractive samples, generic fallbacks and self-reported status therefore do not constitute closure.

### Remaining publication check and review limits

At this review snapshot the local validator reported `published_task_count: 0` while the publisher was still creating the external task set. The validator deliberately permits an absent or empty publication map, so **PASS alone is not proof of completed publication**. Before declaring the external backlog fully published, the programme publisher must install the final `linear-publication.json`, rerun validation and explicitly require `published_task_count == 138`, unique real issue identifiers, valid issue URLs and exact plan-ID set equality. It must also verify the published packet descriptions and required native blocker relations against the accepted graph. This is an outstanding publication verification, not an unresolved design or scope finding.

Implementation agents must refresh the actual repository, source revisions, owner amendments and operational evidence when each task begins. This review did not run the game, execute migrations, enumerate every shipped historical object, view the unavailable video or exercise generated future leaves. The plan is accepted as an executable staged programme with explicit future evidence gates; none of those gates has been represented here as already passed.

## Completed publication reconciliation

The independent native readback completed at 2026-11-18T01:35:19Z with **PASS: 138 of 138 actual issues, zero mismatches**. The publisher installed the complete real-ID map, reran the validator with `published_task_count == 138`, and separately read the full live epic child list: the exact 138 expected IDs were present in Backlog under THU-2533. All 566 required native task dependencies match the frozen graph. The independent readback verified full packet content, including 1,004 procedure steps, 588 deliverables, 697 acceptance clauses and 910 guardrails.

This closes the publication check that was pending at the semantic-review snapshot above. See [publication-verification.json](../publication-verification.json), [validation-report.json](../validation-report.json) and [linear-publication.json](../linear-publication.json). These results certify planning/publication only; every future implementation and runtime gate remains open.
