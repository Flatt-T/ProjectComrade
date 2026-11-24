# Catalogue schema and evidence driven completion

This contract prevents a large collection of names, meshes or tests from being reported as a finished series homage. It defines the research denominator, individual entity records, the expansion of research into implementation tasks and the proof required at each stage. Proposed data contracts must be aligned with the engine specialist's actual schema before code changes; their semantic requirements are mandatory.

## 1 Establish the denominator before estimating completeness

The denominator is a versioned set of source editions, platforms, regions, patches and modes. It cannot be “all C&C content ever” without a bounded version manifest.

Create a `reference-builds` record per source profile with:

| Field | Required meaning |
| --- | --- |
| profile_id | Stable namespaced ID such as cnc.ra2.pc.retail.<verified-patch>; never use “latest” |
| title and expansion | Base game and exact expansion dependency |
| platform and region | PC/console/mobile edition, region and language |
| executable and data hashes | Hashes for lawful source-game files used for observation; do not redistribute those files by default |
| source_repository and source_commit | Official code/data commit where available; separate from executable equivalence |
| modification_state | Unmodified, official patch, community fix, mod, or unknown |
| authoritative_use | Roster, numeric rules, presentation, interface, history, or discovery only |
| observation_environment | OS/runtime/game speed/render settings, test map, input method |
| evidence_refs | Exact manual pages, source file/symbol/line or observation fixture |
| rights_reference | Existing rights-ledger record; source data and distributable assets are distinct |
| known_conflicts | Manual/code/retail mismatch records with resolution |
| locked_at and reviewer | Freeze of this researched baseline |

A remaster, expansion or patch may inherit the previous profile, but inherited rows must still be explicit and reviewable. Do not duplicate identical visual assets simply to inflate progress. Do not collapse two identically named units from different eras if their identity or behaviour differs.

A denominator is **closed** only after two independent methods reconcile: source/manual/object enumeration and the target build's selectable/producer/mission/map inventory. A missing build can block only the affected profile; it must not be silently represented as zero entities.

### Record classifications

Every discovered item receives exactly one primary classification:

- Standard playable unit or structure.
- Selectable country/subfaction variant or class-specific entry.
- Upgrade, ability, support power or superweapon.
- Alternate form, deployable structure, passenger/squad member, drone, summoned unit, projectile or wreck.
- Campaign-only or challenge-only entity.
- Neutral/civilian/tech structure, environmental prop, creature or resource.
- Edition-specific delta.
- Unused, cut, prototype or compile-guarded candidate.
- Duplicate definition/alias with an explicit canonical target.
- Unresolved source identity.

“Not a normal multiplayer unit” is a classification, not a reason for discarding the item. “Unused” requires evidence, not an absent button in one mode.

## 2 Entity record

Use a machine validated record with a stable ID and the following required sections. Store the research record separately from runtime pack data so that copyright/provenance notes and unresolved observations do not leak into gameplay state.

### Identity and lineage

`entity_id`, `source_profile_id`, `source_object_ids[]`, `display_names_by_locale`, `category`, `faction_ids[]`, `country_or_general_ids[]`, `class_ids[]`, `mode_ids[]`, `inherits_from`, `replaces[]`, `alternate_forms[]`, `child_entities[]`, `canonical_visual_family`, `source_evidence[]`, `disposition`.

The same entity may be available to multiple sides, but availability is a rule. A name or costume must never determine behaviour. A deployed form links to its mobile form and records carried state. Summoned entities and carrier aircraft have their own lifetime and ownership contracts even if not individually buildable.

### Availability and production

`producer_ids[]`, `required_all[]`, `required_any[]`, `forbidden_if[]`, `country_exclusions[]`, `required_upgrades[]`, `tech_level`, `build_limit`, `unique_scope`, `queue_kind`, `build_cost`, `payment_policy`, `build_time`, `refund_policy`, `power_policy`, `exit_policy`, `rally_policy`, `build_placement`, `capture_producer_effect`, `sell_producer_effect`, `transfer_producer_effect`.

Unknown fields must carry an explicit unknown status; a zero/null placeholder must not be read as a valid zero cost or no prerequisite.

### Physical and movement model

`footprint`, `collision_shape`, `selection_shape`, `navigation_classes[]`, `terrain_costs`, `slope_limit`, `water_depth_range`, `bridge_clearance`, `speed`, `acceleration`, `turn_rate`, `hull_facing_policy`, `turret_facing_policy`, `firing_on_move`, `crush_tier`, `crushable_by`, `altitude_bands`, `transition_capabilities[]`, `transport_slots`, `passenger_limits`, `garrison_policy`.

Visual scale, contact points and animation sockets map to this model. Mesh bounds do not become the authoritative footprint without an explicit engine decision.

### Combat and interaction

`health`, `armour_profile`, `directional_modifiers`, `weapon_slots[]`, `target_filters`, `range`, `minimum_range`, `acquisition`, `line_of_fire`, `projectile_contract`, `damage`, `splash`, `warmup`, `burst`, `cooldown`, `ammo`, `rearm`, `veterancy`, `status_responses`, `death_policy`, `wreck_policy`, `capture_policy`, `mind_control_policy`, `infiltration_policy`, `repair_policy`, `visibility_policy`.

A weapon's range is not enough to define it. Record whether launch, travel, impact and damage are separate events, which movement can interrupt them, and what happens to outstanding projectiles when a target dies, becomes protected, transforms or changes owner.

### Economy, powers and support

`resource_type`, `harvest_targets`, `harvest_rate`, `cargo_capacity`, `return_policy`, `unload_points`, `unload_duration`, `depletion_regrowth`, `secondary_income`, `power_produced`, `power_consumed`, `abilities[]`, `support_powers[]`, `ability_costs`, `ability_targets`, `ability_cooldowns`, `ability_interruptions`.

For alternate economies, explicitly identify which ruleset owns credits, supplies, command points, upgrade points or persistent currencies. Never perform an implicit exchange rate.

### Presentation and production assets

`model_asset_id`, `model_source_and_licence`, `textures[]`, `material_style`, `team_colour_mask`, `silhouette_reference`, `scale_reference`, `skeleton_or_rigid_rig`, `animation_state_graph`, `animation_clips[]`, `sockets[]`, `VFX_events[]`, `SFX_events[]`, `voice_events[]`, `UI_icon`, `selection_feedback`, `damage_visual_states`, `destruction_visual_states`, `LOD_contract`, `performance_budget`.

Each animation clip has semantic start/end state, looping policy, allowed transitions, interruptibility, required sockets, duration envelope, root-motion policy and source/author provenance. Event timing comes from the simulation contract. A client frame does not decide whether a weapon fires or a bridge collapses.

### Evidence, adaptation and release status

`observations[]`, `conflicts[]`, `fusion_mapping`, `capability_dependencies[]`, `acceptance_fixture_ids[]`, `stage_status`, `reviewer`, `rights_status`, `pack_release_status`, `blockers[]`.

A datum should use an evidence wrapper:

```json
{
  "value": null,
  "unit": "simulation_ticks",
  "status": "unmeasured",
  "source_profile_id": "assigned-pinned-profile",
  "evidence_refs": [],
  "measurement_protocol": "specified-fixture-id",
  "tolerance": null
}
```

This is a schema illustration. It is not a valid completed build-time value. Do not invent measurements to fill the nulls. The runtime export gate rejects unresolved required values.

## 3 Observation and conflict records

Each observation contains:

1. The exact question being answered, source profile and item IDs.
2. Setup and controllable variables; seed/map/scenario hashes.
3. Command sequence in simulation ticks or reference timestamps.
4. Expected data from the manual/source and observed result from the game.
5. Screenshots or video only when necessary to establish appearance/timing; exact source and timestamp.
6. Measured values with units, sample count, range and known uncertainty.
7. Interpretation: direct observation, source-code inference, community hypothesis or authored Fusion choice.
8. Reviewer and whether the reproduction was independent.

Conflicts use a stable ID, competing claims, scope of impact, evidence strength, resolution owner and blocking status. Resolve target-version ambiguity first. A classic source bug may be preserved by a Classic profile while corrected deliberately in Fusion. A community mod's fix cannot silently redefine the source game.

Particular controls to test:

- Infantry versus vehicles, stationary versus moving, uphill/downhill and different target armour.
- Friendly, allied, hostile and neutral owners; source ownership changes versus MMO consent/shield rules.
- Ability ready, charging, active, cooling down, interrupted, dead, packed and transferred.
- Building powered, low power, disabled, under construction, damaged, captured, sold and destroyed.
- Passenger and garrison empty/partial/full, conflicting unload locations and host death.
- Bridges intact/damaged/collapsing/destroyed/repairing/rebuilt with units on deck and below.
- Fog/shroud/stealth states from each player's perspective; spectator access separately.
- Save/reload and replay before/during/after every complex transition.

## 4 Faction integrity record

Each faction/profile record links to all its entities and validates a complete playable loop. Required outputs are a full build graph, upgrade graph, producers/queues, costs/timing profile, terrain restrictions, defence/air/naval/transport roles, strengths, weaknesses and counters. A faction is not complete merely because its most recognisable units exist.

Acceptance must establish:

- Every allowed starting state reaches a legal first economy and production path.
- Every advertised unit/structure can be produced through a valid chain in at least one permitted mode.
- Every forbidden option is unavailable for the correct reason and explained in the UI.
- Multiple producers, power loss, capture, sale and defeat do not leave ghost prerequisites.
- Faction variants inherit shared objects correctly and do not inherit explicitly prohibited technology.
- Research upgrades affect existing and newly produced units according to the source/adaptation contract.
- Unique/epic/superweapon limits persist across ownership changes, packing, save/load and transfer.
- All essential roles have intended counters within the chosen unified ruleset; gaps are deliberate and tested.
- Campaign-only factions with no original economy receive an authored economy or remain a distinct mode/content group. Neither result may be represented as original source fact.
- A visual reviewer can identify the faction at combat zoom through shape/animation/weapon cues, not only colours.

## 5 Terrain and map record

Use `theatre_id` for a source asset system and `biome_id` for a Fusion environmental design. These are related but not interchangeable.

Each terrain record needs the source tile/texture/prop family; visuals; collision and navigation; buildability; height and water model; movement costs; resource/hazard role; destructibility; line-of-sight role; supported transitions; state changes; map-generation rules; provenance; LOD and performance expectations.

Each map exemplar needs spawn fairness, harvesting access, expansion routes, land and naval connectivity, choke/bridge alternatives, strategic height/visibility, civilian cover, path recovery after destruction, map bounds and an objective-specific test. Every biome is demonstrated with a playable exemplar, not a texture swatch.

Distinguish environmental ambience from simulation weather. If fog reduces visibility or an ion storm disables a unit class, that is a sourced or authored rule, versioned and replicated. Particle density must not alter visibility authorisation or collision.

## 6 Capability dependency graph

Every entity references named capabilities. Unknown capabilities block the implementation leaf until the engine specialist supplies a contract and test fixture. The reference record may proceed independently.

A capability includes:

- Input commands and validation.
- Authoritative state fields and lifecycle.
- Deterministic update order and numeric representation.
- Ownership/permission and visibility rules.
- Cancel/death/transform/capture/transport/transfer behaviour.
- Persistence, migration and replay semantics.
- Client presentation events.
- Golden scenario, adversarial edge cases and performance checks.

Examples requiring separate capabilities are mind-control ownership, underground travel, water building, air rearm, transforming forms, mobile production, engineer bridge repair, multi-layer bridge topology, garrison weapon substitution and persistent-world capture consent. Do not rename a missing capability “generic support” and claim equivalence.

## 7 Exact fan-out from research to implementation

After each bounded verified inventory slice closes, use the single programme generator to create implementation leaf specifications. RES-003 owns the canonical source-identity schema; RES-028 supplies and validates the census inputs; OPS-005 owns generation orchestration, publication/upsert and actual issue-ID mapping; ART-013 expands and validates asset stages only. No research or art tool may create a competing publisher. This is how a fleet completes the entire denominator without requiring this planning turn to invent unverified thousands of entities.

### Generation inputs

- Locked reference profile and entity inventory.
- The selected Fusion inclusion/adaptation ledger.
- Approved schema and capability registry.
- Rights and provenance status.
- Shared asset/rig dependency map.
- Existing GitHub/Linear task reconciliation map.
- The programme's release slices and file ownership registry.

### Stable identity

Use `F3D-ENTITY-<rowUid>-<stage>-<part>`. RES-003 defines canonical immutable identity serialization. `rowUid` is the first 16 hexadecimal characters of SHA-256 of that identity; retain the full hash and fail on a prefix collision rather than merging rows. Display-name, balance-value and task-title changes do not change identity. OPS-005 stores the semantic key beside the actual Linear identifier and alone reconciles/upserts existing tasks. Do not create a second `ENT/...` namespace or independent asset publisher.

### Required stages per included entity

1. **SPEC:** source behaviour, adaptation, interfaces and fixtures.
2. **SIM:** runtime definition, legal production and all capabilities.
3. **MODEL:** approved 3D geometry, materials, team colour, LOD and provenance.
4. **RIG:** skeleton or rigid-part hierarchy, articulation, sockets and state binding.
5. **ANIM:** every applicable lifecycle and combat clip, transition and timing contract.
6. **FX_AUDIO_UI:** event effects, permitted sound/voice, icon and interface feedback.
7. **INTEGRATE:** gameplay, visual, AI, navigation, save/replay, network and performance proof.
8. **REVIEW:** independent acceptance of the whole entity, including verified SIM and FX_AUDIO_UI evidence as well as geometry, rig and animation.

All eight stages require evidence or an explicit applicable-stage reuse/exception record. REVIEW cannot close merely because asset stages passed; it requires actual SIM, FX_AUDIO_UI and INTEGRATE results. Any reused stage must name its immutable artifact and include entity-specific verification.

For an entity whose model/rig is genuinely shared, the stage may reference a reviewed shared asset task plus a variant verification task. It may not skip identity-specific animation, loadout, collision or behaviour checks. Already completed work is reused only after a targeted verification against the new contract.

### Bounded task size

A complex entity receives its own specification and simulation task. One simple data-variant leaf may cover up to five closely related variants when their only differences are explicitly listed. One asset leaf covers one approved visual family. One observation leaf answers one mechanic or one bounded entity family. If a task includes independent capability implementations, split it before execution.

The planner, not the implementation agent, owns the split. The worker reports an oversized or contradictory task rather than redesigning the scope. Each worker gets its complete relevant context packet and can use its full available reasoning capacity on that precise task.

### Generated task contents

Every leaf contains the exact source/adaptation record; required capability versions; files it may edit; files it must not edit; source-profile hashes; dependent assets/interfaces; a numbered procedure; fixture inputs and expected outcomes; generated outputs; reviewer specialization; failure conditions; and a handoff record. Numeric expected outcomes must be supplied by approved evidence or clearly labelled authored design values.

### Generator validation

The generator must fail if an included entity has no required-stage task or approved reuse record; if it creates an orphan stage; if dependencies cycle; if IDs collide; if a rights-blocked asset reaches a distributable pack; if source evidence is unknown while a task claims exact fidelity; or if a declared capability is unsupported.

OPS-005 emits the sole publication dry run with counts by era, faction, entity category and canonical stage, plus unchanged/reused/new/blocked tasks. RES-028 validates census coverage and ART-013 validates asset expansion without publishing separate tasks. Its output is reviewed before applying Linear/GitHub mutations. This is task publication review, not permission to shrink the scope. Re-running the generator must be idempotent.

## 8 Completion statuses

Track each entity's stages independently:

- `unresearched`
- `source_verified`
- `adaptation_approved`
- `engine_blocked`
- `data_implemented`
- `model_complete`
- `animation_complete`
- `audio_ui_complete`
- `integration_verified`
- `rights_blocked`
- `release_ready`
- `explicitly_deferred`

Use structured fields rather than one mutually exclusive state if multiple conditions apply. For instance a verified behaviour and an original mesh can coexist with an unresolved voice licence. Only the relevant deliverable is blocked; the programme must report it honestly.

Coverage dashboards show the full denominator and the counts in each stage. Never use “99% complete” when missing signature mechanics can invalidate play. “264 entities have data; 37 have complete animation; 12 have independent gameplay proof” is useful. These numbers are illustrative format examples, not current Project COMRADE counts.

## 9 Independent acceptance

The independent reviewer must check the actual artifacts and scenarios, not simply the implementer's completion summary. For each entity, run its essential command lifecycle; verify its source/adaptation record; inspect mesh and animation at gameplay zoom and close range; confirm sound/UI triggers; exercise relevant cancellation/ownership/save/transfer edges; and confirm rights/provenance.

For shared mechanisms, exhaustive engine tests can be reused. The entity must still prove correct parameters, bindings, model sockets, animation transitions, producer availability and signature behaviour. A generic passing engine test cannot establish that a specific faction's content is finished.

For the whole era, compare discovery records with the reference census. Every candidate is included, an alias, a verified inactive item, or a documented exception. Unresolved items remain visible. For the unified mode, test cross-era interactions as a matrix of capability classes plus targeted high-risk combinations; do not attempt only pairwise name-based testing.

## 10 Required final handoff per research owner

Deliver the locked reference manifest; entity/faction/terrain census; evidence table; conflicts and unresolved source blockers; source profile tests; Fusion adaptation proposals; capability gaps; generated implementation-leaf dry run; and independent review record. Link each result to the exact task and repository commit.

The research owner cannot mark a game complete because a plausible list was produced. The denominator and reconciliation evidence are the product of the research. A later programmer must be able to trace any unit, building, upgrade or terrain object back to the source record and forward to an acceptance fixture.

