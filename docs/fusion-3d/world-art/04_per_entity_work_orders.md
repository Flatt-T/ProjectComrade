# Complete per-entity and per-terrain work order expansion

The programme is complete only when the approved inventory has been expanded into explicit bounded work orders and every included item passes independent review. The era tasks organise delivery; they are not permission to hand an entire faction to one worker with a vague instruction to finish it.

## Inputs that must exist

The expansion reads the approved source inventory revision and canonical identity schema owned by RES-003, runtime reconciliation from ART-001, style-sheet revision from ART-002, manifest/schema from ART-003, animation requirements from ART-004, provenance decisions from ART-005 and engine capability availability. Every input has a content hash and exact revision. A missing source value is marked unknown; the generator cannot invent a cost, range, animation or source variant. OPS-005 owns the single canonical work-order ledger, publication/upsert process and mapping to real Linear issue IDs. ART-013 supplies and validates the asset-stage expansion described here; it must not run a second publisher or identity scheme.

Each inventory row must supply:

```json
{
  "sourceIdentity": {
    "family": "resolved-family-id",
    "title": "resolved-title-id",
    "edition": "resolved-edition-id",
    "patch": "pinned-source-patch",
    "faction": "resolved-faction-id",
    "entity": "resolved-source-entity-id",
    "form": "resolved-form-id"
  },
  "runtimeId": "existing-or-approved-new-runtime-id",
  "scopeDecision": "include",
  "evidenceRefs": ["manual-page-or-pinned-data-reference"],
  "mechanicTags": ["explicit-versioned-capability-id"],
  "styleSheetRef": "approved-sheet-and-revision",
  "requiredStates": ["derived-required-state-id"],
  "requiredSockets": ["applicable-socket-id"],
  "requiredForms": ["declared-form-id"],
  "provenanceDecision": "resolved-ledger-record",
  "budgetClass": "approved-scene-budget-class",
  "existingAssetDecision": "reuse-or-adapt-or-replace-or-blocked"
}
```

Those strings illustrate field roles, not runtime values. The generator rejects unresolved placeholders. Unknown rights or mechanics create explicit blocked tasks linked to their dependency; they do not omit the content row.

## Stable IDs and idempotency

Use the immutable identity and canonicalisation rules in RES-003; ART-013 cannot redefine field membership or ordering. Compute SHA-256 over that canonical identity; use the first 16 hex characters as `rowUid`, while retaining the full digest and checking prefix collisions. A collision is a hard error. The sole task key is `F3D-ENTITY-<rowUid>-<stage>-<part>`, with stage `SPEC`, `SIM`, `MODEL`, `RIG`, `ANIM`, `FX_AUDIO_UI`, `INTEGRATE` or `REVIEW` and zero-padded three-digit part. Never use display name alone as identity. Any example source fields above are subordinate to the accepted RES-003 schema.

For each generated task, store source inventory hash, spec hash, input asset hashes, predecessor keys and owning era issue. OPS-005 performs the single idempotent publication/upsert by task key and returns real issue IDs. ART-013 reports asset-stage requirements and validates creates/unchanged/changed/blocked before that publication. An input change invalidates the affected task and downstream evidence; it does not silently preserve a passed review with a different asset. The supervisor resolves legitimate alias/reuse relationships in the manifest so duplicate source variants can share approved output without pretending distinct forms were authored.

## Work size and file ownership

One model task owns one entity form. A materially different second form gets its own task. One animation task owns at most six related clips for one rig/body plan; split complex transitions, locomotion and combat into separate parts. One rig task owns one base rig or one reuse-validation operation. One integration task owns one entity/form manifest and view binding. One review task covers one entity/form lifecycle; the whole-era reviewer checks the cross-entity completeness join afterwards.

A worker's required context is its full task, source dossier, style sheet, asset/animation contract, specific capability interface and predecessors. The supervisor supplies exact source paths and hashes, not just a large project link. Workers should use their available reasoning budget on this bounded task; no plan can guarantee that a smaller model never makes an error. Evidence and independent review are the mechanism for containing errors.

The file lease includes the asset's editable source subtree, export subtree, manifest row and designated fixture. Shared rig changes need a separate rig-owner task. Shared schema, renderer controller, simulation, protocol and global rule changes are not incidental cleanup. If a worker discovers one is needed, it supplies a minimal proposal and dependency to the supervisor while other independent tasks continue.

## Stage SPEC

Owner: source-aware technical artist. Input: the single inventory row, source dossier, runtime reconciliation and style sheet.

Steps:

1. Identify the exact era/faction/form and resolve every ambiguous source fact against the evidence hierarchy. Record any Fusion adaptation separately from source behavior.
2. Describe silhouette from front/side/top/tactical views, functional parts, materials, faction/team markings, approximate dimensions and visual offsets relative to gameplay footprint.
3. Enumerate sockets, rig/components, LODs, required clips, weapon/effect/sound hooks, damage stages, construction/sell/pack/death states and icons. Each omitted state has a mechanic-based reason.
4. Define the entity's minimal lifecycle fixture with exact commands/events and review camera positions.
5. Produce the complete spec, provenance dependency and per-stage input list. The reviewer checks that a model worker could proceed without guessing.

Outputs: `spec.json`, human-readable spec, source reference list and lifecycle fixture definition. Pass: every field is resolved, approved or explicitly blocked; there are no implicit generic fallbacks. A source conflict blocks only the affected work, with an owner and resolution procedure.

## Stage MODEL

`SIM` and visual production may proceed in parallel after an accepted SPEC when their contracts are stable. INTEGRATE cannot pass before SIM and FX_AUDIO_UI are independently verified. An art-only REVIEW never completes the canonical entity row.

Owner: 3D modeller/material artist. Input: accepted SPEC and provenance decision.

Steps:

1. Create or adapt original geometry in the leased source path, preserving the specified silhouette and separately movable components.
2. Apply the shared metric authoring scale, ground origin, forward axis and named pivots. Check view from all supported camera headings before detail work.
3. Author UVs/materials/team mask and intact/damaged/rubble forms as required. Detail must improve tactical reading, not add noise or hide team identity.
4. Build LODs, collision/debug proxy metadata where required, sockets and icon setup. Gameplay footprint comes from the spec, never auto-generated from the visual mesh.
5. Export with the pinned pipeline; run validation and provide raw/editable source, texture source and importable runtime assets.

Outputs: editable model/material sources, exported GLB/textures, manifest candidate, turntable and validation log. Pass: scale/origin/winding/materials/sockets/LODs agree with spec; no missing inputs, external texture fetches or license-blocked components. Final gameplay review is still pending.

## Stage RIG

Owner: rigging technical artist. Input: accepted MODEL and rig family contract.

Steps:

1. Reuse an accepted family only when body proportions and required mechanics fit. Record the rig version and compatibility test; otherwise create a dedicated bounded rig task.
2. Build hierarchy, limits, skin weights and mechanical pivots. Distinguish authoritative root, visual body offset, aiming parts and cosmetic components.
3. Test extreme allowed poses, turret yaw/barrel pitch, doors, feet, wings and transformations. Check deformations and socket alignment across the full motion range.
4. Export the neutral rig and example poses through the runtime importer. Define bounds appropriate for animated motion and culling.

Outputs: editable rig, rig manifest, posed validation capture and bone/component budget report. Pass: no unintended root movement, collapsed skin, inverted normals, detached sockets or culling loss. Shared rig changes cannot silently alter already accepted assets.

## Stage ANIM

Owner: specialist animator appropriate to the body plan. Input: accepted rig plus a bounded list of at most six clips.

Steps:

1. Implement the exact named clips and state boundaries from SPEC; use source observation to understand character and the approved Fusion spec to settle timing adaptations.
2. Keep the authoritative root stationary. Make locomotion, wheels/tracks and relevant looping clips compatible with speed-scaled playback; provide clear start/stop and interruption poses.
3. Mark only cosmetic timing events. Weapon launch, damage, capture, production, resource credit and occupancy are supplied by the authoritative event contract.
4. Test blending/interruptions, reverse transitions where required, death during action, low update rate and replay pose reconstruction.
5. Export, validate and capture the clips in the actual renderer with state/event inputs. An editor preview alone is insufficient.

Outputs: editable clips, runtime clips, clip manifest and renderer evidence. Pass: all assigned states exist; no default-idle substitution, foot sliding beyond the reviewed tolerance, broken loop, off-axis weapon or delayed authoritative death. The animation reviewer can reproduce the state sequence.

## Stage SIM

Owner: engine/content gameplay specialist. Input: accepted SPEC, source behavior dossier, profile adaptation decisions and registered engine capabilities. This stage is owned by the gameplay workstream and included here to make the single canonical entity graph explicit.

Steps: bind the exact source/runtime/form identity to construction, cost, prerequisites, movement, weapons, abilities, targeting, armor, cargo, ownership, power, upgrades, status, AI and lifecycle rules. Register missing capability work as explicit dependencies rather than using an empty handler. Implement deterministic fixtures covering admissible and rejected commands, interruption, death, save/restore and multiplayer events. Compare source behavior to the selected edition/patch or document the deliberate Fusion adaptation. Preserve runtime IDs through an approved migration map.

Outputs: verified entity definition, capability version links, deterministic behavior fixtures, source/adaptation evidence and save/protocol compatibility. Pass: every required mechanic is real and tested; visual completion cannot stand in for a missing ability. The engine specialist reviews this stage independently before entity INTEGRATE closes.

## Stage FX_AUDIO_UI

Owner: effect/audio/interface specialists working through bounded parts. Input: accepted SPEC, authoritative event/capability contract, asset sockets and faction presentation direction.

Steps: enumerate every required attack/ability/status effect, sound/voice, production portrait/icon, label, tooltip, cooldown and denied-action reason. Assign one coherent family per part; keep each part small enough for independent review. Bind effects and sound to event IDs and visibility permissions; create original/licensed source material and quality variants. Implement accurate icon/action state and localised text hooks. Verify source/target/time/area, event deduplication, no fog leak and no loss of warnings at reduced effects.

Outputs: manifests, rights-cleared assets, UI bindings, coverage and gameplay evidence. Pass: all required audiovisual and interface states exist and match SIM; no copied unapproved audio, generic placeholder icon, hidden unit leak or misleading action feedback. INTEGRATE remains blocked until every required part is independently verified.

## Stage INTEGRATE

Owner: content integration engineer. Input: verified SIM and FX_AUDIO_UI, accepted model/rig/clips and tested engine capability versions.

Steps:

1. Bind source/runtime/form identity to asset hashes, sockets, state controller, sound/effect manifests and icons. Preserve runtime IDs or use the approved migration map.
2. Exercise the lifecycle fixture through real commands: produce/spawn, move, fire/use abilities, take damage, repair, change ownership if applicable, sell/pack if applicable and destroy/despawn.
3. Verify every form/variant/upgrade and the correct team color, silhouette, fog entitlement, footprint and exit points. Do not hide a missing gameplay capability behind a completed visual.
4. Test low/high quality, cold load, cache, resource unload and snapshot/replay reconstruction. Check the asset's allocated scene cost.
5. Produce the review bundle with exact build, commands/ticks, captures, manifests and validator output.

Outputs: integrated manifest/content entry, fixture evidence, performance contribution and handoff. Pass: complete lifecycle works in gameplay without fallback or console errors; rendering changes do not change simulation checksums.

## Stage REVIEW

Owner: independent content/gameplay/presentation reviewer; not the maker of the asset.

Steps:

1. Reproduce the deterministic lifecycle from a clean checkout at the supplied commit and asset hashes.
2. Inspect close/normal/far camera views and a monochrome/team-color comparison against role peers. Review shape, articulation, timing, readable status and faction identity.
3. Verify all required forms/clips/sockets/icons/sounds/provenance, low/high quality parity, fog behavior and the complete acceptance checklist.
4. Check no shared schema/mechanic changed outside scope and no test was weakened. If a capability is blocked, keep the content item incomplete even if the model is attractive.
5. Record pass or exact defects with entity/form/clip/tick/camera, expected/observed result and evidence. Only an independent passing review moves the row to verified.

Outputs: review decision, reproduced evidence and linked repair tasks. Pass: every criterion passes, including independently accepted SIM and FX_AUDIO_UI predecessors. A majority score cannot override a missing required form or broken mechanic. Only this complete canonical REVIEW closes the entity, not a narrower model or animation review.

## Terrain and environment work orders

Use `WORLD-KIT-<kitUid>-<stage>-<part>` with the same hash/version/idempotency rules. Expand each T01–T28 row and every approved subkit into SPEC, GEOMETRY, MATERIAL, PROPS, INTEGRATE and REVIEW. One geometry job owns one modular family, one material job at most four compatible surface materials, and one prop job at most ten small variants sharing one base grammar. A functional building or a bridge is always a separate entity/spec, never bundled among decorative props.

Terrain SPEC contains source-map coverage, landform/height/surface rules, allowed material transitions, prop classifications, light/ambience, hazard rules and reference scene. GEOMETRY supplies terrain/chunk/ramp/bank modules with border contracts. MATERIAL supplies coherent resolution, blending and low-detail variants. PROPS distinguishes cosmetic and authoritative obstacles and supplies destruction states where required. INTEGRATE makes an actual authored map with routes, resources, buildable space and performance measurements. REVIEW verifies border continuity, strategic viability, role/team readability and the biome completeness matrix.

Every title/expansion gate links all its terrain and entity work orders. The full-programme closure query must count blocked and failed rows, rather than reporting only the finished rows. An explicit owner-approved scope change is the only way to remove a source row from the required set.
