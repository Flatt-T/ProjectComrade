# Complete content inventory and per-entity work orders

The programme has two levels of work. Finite research, engine, tools, world, QA and release tasks can be assigned now. Every verified faction, entity, terrain kit and complex ability then receives bounded implementation work orders generated from the accepted census. This avoids inventing a complete roster and prevents a large parent ticket from disguising hundreds of missing assets.

## Required census records

Each record has immutable source title/version/platform/faction/identifier; original name for research; object kind; gameplay availability (skirmish, campaign, civilian, neutral, support, transformation, unused); source symbol/data path and provenance; active/conditional/unused determination; aliases/inheritance; prerequisites; production/capture ownership; economy/power/tech; movement/footprint/layer/collision; weapon/armour/target domains; abilities and upgrades; transport/garrison/transform states; animation/audio/VFX states; terrain dependencies; proposed Fusion mapping; implementation status; rights status; evidence links and reviewer. Exact numerical behaviour stays versioned with units and source confidence. Unknown is an allowed research value and a blocker to a dependent claim; zero is not a substitute for unknown.

Keep source entities, runtime definitions, unique art assets and visible variants in separate tables. A composed alias cannot increase the count of unique models. A civilian or unused source constant cannot increase the count of playable units. The catalogue must distinguish no-art-required logic helpers from visible objects and justify the distinction. Deleted/removed content remains in the ledger with disposition and replacement links.

## Minimal machine-readable record example

```json
{
  "sourceKey": "<game>@<exact-build>/<faction>/<source-id>",
  "kind": "unit|building|terrain|ability|form|civilian|effect",
  "availability": ["skirmish"],
  "sourceEvidence": [{"url": "<primary-url>", "revision": "<sha-or-build>", "locator": "<symbol-or-page>", "confidence": "verified|corroborated|unverified"}],
  "fusionId": "<namespaced-stable-id>",
  "mapping": "direct|translated|shared|restricted|excluded-with-owner-decision",
  "capabilities": [],
  "forms": [],
  "requiredStates": [],
  "requiredAnimations": [],
  "artAssetIds": [],
  "rightsRecord": "<ledger-id>",
  "taskIds": [],
  "acceptanceEvidence": [],
  "reviewStatus": "unreviewed"
}
```

This example describes a schema; placeholder values must never enter accepted inventory data. The research/schema tasks supply validation and actual rows.

## Fan-out algorithm

There is one canonical generator and publication map. RES-003 owns the immutable source identity schema; OPS-005 owns task generation, issue upsert, dependency expansion and the map of real Linear IDs. ART-013 supplies asset-stage expansion/validation to that generator and must not create a competing issue namespace. The canonical stages are `SPEC`, `SIM`, `MODEL`, `RIG`, `ANIM`, `FX_AUDIO_UI`, `INTEGRATE`, `REVIEW`. Canonicalise the accepted immutable source identity in a fixed schema field order and UTF-8 JSON, compute SHA-256, retain the full digest and use its first 16 hex characters as `rowUid`. A prefix collision is a hard error. Use stable task keys `F3D-ENTITY-<rowUid>-<stage>-<part>` with a zero-padded three-digit part. Source evidence revisions and the target profile/version are explicit inputs; accepted identity migrations preserve task aliases and evidence lineage. Never use display names or current region IDs as source/task identity.

An art-only reviewer may approve an asset-stage task. The whole-entity `REVIEW` requires accepted `SIM`, all required asset/animation stages and `FX_AUDIO_UI` evidence, including build icon, selection and state cues. Explicit not-applicable decisions are allowed only with a source/profile reason and independent review; omission is not a stage completion.

The same OPS-005 publisher must materialise shared capability implementation and review leaves. Every referenced capability ID/version, including non-entity environment rules (ice, weather, fire, contamination or deformation where sourced) and objective/mode/result policies, needs either accepted existing support or bounded implementation and independent-review tasks. Use stable `F3D-CAPABILITY-<immutable-capability-version-hash>-<stage>-<part>` keys with retained full digest and collision checks. Each packet includes input/state/command contracts, source and Fusion semantics, lifecycle/tick order, deterministic fixtures, dependencies, ownership and acceptance. The validator rejects a referenced capability with no builder/reviewer. A capability registration, terrain art task or prose mention is insufficient to unlock dependent content.

RES-024–027 close bounded framework and first-battle seed contracts. The initial seed uses source-verified RA1 Allied/Soviet reference profiles plus explicitly cited bridge observations and the authored Fusion protection/rebuild policy. Their manifests enumerate exact source IDs and fixtures; they do not assert all-era coverage. Each era's accepted extensions feed RES-028/029 whole-census closure. OPS-005 can finish its generator and independently reviewed seed-publication proof before whole-series research closes, and reuse the same generator for later accepted era batches.

1. Accept a title/version census after independent review and discrepancy reconciliation. Hash the canonical JSON and pin the capability schema version.
2. Sort by source key. For every required record, resolve a unique Fusion definition or an explicit reviewed shared mapping. Expand transformation forms, upgrades, weapons, summons and faction variants. Inspect referenced objects recursively until no unresolved visible or mechanical dependency remains.
3. Create a faction integration work order for each faction/subfaction/general/country with distinct build access or mechanics. Link its exact entity keys, tech graph, economy/production model, support powers, AI rules and test fixtures.
4. Create per-entity behaviour, model/material, rig/animation, effects/audio, integration and independent acceptance orders. A single simple entity may combine consecutive production stages if one specialist and coherent review suffice; a complex transforming/carrying/mind-control unit must remain split. Cap an ordinary art batch at one complex entity or five genuinely shared simple variants, with acceptance per row.
5. Create per-terrain-kit production and gameplay integration orders from the biome/theatre matrix; include transitions, roads/cliffs/water/resource ground, destructible props and bridge approaches. Bridge functional styles need their own state and movement fixtures.
6. Generate native Linear blockers from capability and asset prerequisites. Set generated leaves under the appropriate era/terrain delivery parent. Keep existing task IDs stable on regeneration; update scope from a reviewed census revision, never silently duplicate or delete.
7. Emit a manifest linking every record to required work orders and the real Linear IDs. Fail the generator when a required source row has no owner, output, prerequisite or acceptance plan; when an alias hides an uncovered variant; or when a task refers to an unknown capability.
8. At every era gate compare accepted source keys, runtime keys, asset manifest, animation clips, test cases and reviewed evidence. Require exact set reconciliation and zero unexplained generic fallbacks. Counts alone never pass this gate.

## Behaviour work order

Inputs: exact source record; source mechanics and reference fixture; accepted Fusion translation decision; required capability versions; faction tech access; costs and time units; persistent-state constraints. Implement the definition without modifying shared algorithms. For each ability not supported, open its named capability dependency and stop that part; do not emulate it with a generic attack or alter unrelated stats. Prove build/access, motion, attack or support action, damage/armour, target restrictions, upgrade/transform, death/sell/capture and save/replay as relevant. Include a counter and a forbidden-target case. Output normalized data, schema pass, scenario fixtures and decision/evidence mapping.

## Model and material work order

Inputs: art brief, faction visual grammar, source/rights record, dimensions/footprint, gameplay camera distances, LOD/texture budget and state/socket contract. Produce original/cleared live 3D geometry with readable role and faction silhouette, correct pivot/orientation/scale, team materials, UVs, normals/tangents, colliders/picking proxy separate from simulation footprint, required sockets and damage/construction forms. Export under the approved interchange contract. A billboard, sprite baked from a mesh or scaled generic tank cannot satisfy a true 3D model requirement. Evidence includes strategic zoom, close zoom, full rotation, team variants and all required states in engine.

## Rig and animation work order

Inputs: mesh, rig class, state machine and authoritative event timing. Produce the exact required clips and state transitions. Cover locomotion and turn, aim/recoil/fire/reload, idle, damage/death, deploy/undeploy, construction/sell, production emergence, resource gather/unload, cargo load/unload or special forms as applicable. Validate attachment sockets and turret/weapon independence. Root motion is visual unless an accepted deterministic simulation contract explicitly owns displacement. Rendering may interpolate; it cannot decide attack hit, reload completion or death. Run state-transition and interruption fixtures, multiple speeds, capture/team change and load/resume.

## Effects and audio work order

Inputs: weapon/action event contract, faction palette and audio style, provenance, accessibility and performance budgets. Make distinct readable fire/hit/explosion/trails, smoke/fire/dust/water wake, build/repair/resource feedback and unit/announcer cues as required. Bind effects to confirmed events with deterministic IDs so reconnect/replay does not duplicate them. Occlusion/fog and private information rules apply to sound as well as mesh visibility. Avoid unlicensed soundtrack/voice copying. Prioritize player action confirmation and tactical distinctions; intense effects cannot obscure selected units or consume the full frame budget.

## Integration and acceptance work order

Inputs: all prior accepted artifacts, source-row hash, definition and asset manifest. Instantiate the entity through actual production and relevant world acquisition paths. Test normal/close zoom, all team states, terrain and required lighting, fog/stealth, ownership transfer, damage, transport, transform, save/resume and multiplayer observation. Measure resource and performance cost in representative formations. The independent reviewer compares role, faction, movement and action behaviour with the reference/accepted Fusion specification. Attach defects by exact entity/state. A gallery-only image cannot close in-game integration.

## Faction completion

A faction needs a complete build graph and economy loop, all required units/structures/forms/abilities, distinctive tactics and readable identity, AI able to use its intended tools, victory/defeat and persistent ownership handling, mirrored-match and cross-faction scenarios, and all content states checked. A country/general that shares most of a roster still requires verification of changed access, costs, abilities, upgrades, art and AI. Never duplicate base rows to claim an independently complete subfaction.

## Whole-series completion

All released-era and derivative dispositions must be explicit. Missing sources block that row's claim and dependent asset/function; they do not cancel other work. Restricted reference content can remain unavailable for public distribution while its requirement and safe implementation path stay visible. Only an owner scope decision may remove a requirement. The final manifest identifies exactly what shipped, what is restricted, and any remaining mandatory gaps; the full programme remains open while mandatory gaps remain.
