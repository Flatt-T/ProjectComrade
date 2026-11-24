# Fusion 3D art and animation contract

Status: proposed implementation specification for the Fusion homage profile, prepared 18 November 2026. The preservation-oriented Classic profiles retain their own fidelity contracts. Performance numbers, presentation dimensions, and new behavior defaults below are design targets to validate, not claims about shipped capability or universal C&C behavior.

## The outcome

Every included building and unit must be recognisable through its own silhouette, motion, weapons, construction and destruction behavior, and tactical role. Real-time 3D geometry must be visible from the supported camera angles, with continuous movement and appropriate articulation. A catalogue entry, a tinted generic model, a static icon, or an animation only shown in an asset viewer does not satisfy this contract.

The first representative battle proves the pipeline; the final acceptance gate covers every approved faction and every inventory item. Passing the representative battle never removes the remaining roster, animation, biome, or effect tasks. A playable subset may ship as an explicitly named preview while the complete programme remains open.

## Verified starting point

The audit baseline is `Flatt-T/ProjectComrade` main commit `84f411478f01ed62365a2e4d1d316eb57d9e193c`. In that revision, `packages/fusion/src/render.ts` renders through Canvas2D. `packages/fusion/src/art/forge.ts` rasterises procedural meshes into sprite views; the presence of a mesh authoring helper does not make the gameplay a real-time 3D scene. `packages/fusion/src/art/models.ts` already contains original procedural geometry and faction-style palettes. That investment can supply blockouts and reference comparisons, but each use must be classified rather than automatically discarded or accepted as production art. Existing selection, owner labels, fog restrictions, effects, and audio hooks must be carried through the presentation adapter. [Repository baseline](https://github.com/Flatt-T/ProjectComrade/tree/84f411478f01ed62365a2e4d1d316eb57d9e193c), [renderer](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/render.ts), [models](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/art/models.ts).

Existing Linear work `THU-2447` (building coverage), `THU-2448` (unit coverage), `THU-2449` (HUD), and `THU-2450` (owner and Ally/Foe labels) must be cross-referenced by the new tasks. Their existence does not prove that each new requirement is satisfied; evidence decides reuse, extension, or replacement.

## Art direction that preserves distinct factions

The common direction is a crisp, readable battlefield with intentionally composed shapes and restrained material complexity. Unity comes from scale conventions, lighting, material response, camera and UI, not from giving every faction identical silhouettes. Each source-era faction receives a one-page style sheet containing architecture grammar, vehicle silhouettes, infantry gear, energy and weapon language, palette, material wear, motion character, sound character, and at least six reference observations with sources.

The following are research and production assignments, not permission to copy protected artwork. The historian approves the precise faction list and distinctions. The art lead then writes an original visual interpretation that makes the tactical identity legible.

| Family | Required presentation investigation | Production separation rule |
| --- | --- | --- |
| Tiberian Dawn and expansions | Early industrial base silhouettes; conventional armor; asymmetry between heavy military and insurgent/stealth roles; harvesting and compact base rhythm | GDI and Nod must not collapse into one tank/building kit with different colors |
| Red Alert and expansions | Alternate-history military silhouettes; land/air/naval roles; electrical versus conventional weapon signatures | Preserve country/side variants where the approved inventory gives them distinct behavior or visuals |
| Tiberian Sun and Firestorm | Mechanised walkers, subterranean and hover forms, damaged future industry, contaminated environments, cybernetic units | Walker, hover, burrow, and tracked locomotion receive different motion systems |
| Red Alert 2 and Yuri's Revenge | Strong exaggerated silhouettes, urban combat, naval identities, psychic effects, production/transport variants | Yuri and expansion units receive dedicated form and ability visuals; a purple palette is insufficient |
| Generals and Zero Hour | Conventional, improvised, industrial, aircraft and support-power identities; dozer/worker construction; general variants | Shared base geometry needs declared variant attachments, ability and damage differences |
| Tiberium Wars and Kane's Wrath | Contemporary 3D battlefield scale, biome contamination, alien forms, squads, walkers, epic and subfaction variants | Scrin requires a nonhuman geometry and motion grammar; subfactions preserve loadout differences |
| Red Alert 3 and Uprising | Amphibious transitions, transforming machines, naval economy, distinctive units and faction construction methods | Every mode/form must have transition, locomotion, targeting, and silhouette evidence |
| Tiberian Twilight | Mobile base classes and class-specific identities | Research completely; integrate through explicit mode/rules decisions instead of silently replacing classic base economy |
| Renegade and other released spin-offs | Relevant structure/vehicle/interior references and unique content | Separate research inventory; no automatic first-person mode or unrelated gameplay scope |
| Remastered Collection | Readability, interface, audio and restored detail | Treat visual improvement as a comparison reference; preserve original-era behavior distinctions |
| Existing Dune-style and other non-C&C packs | Existing approved identities and compatibility needs | Keep namespaces and scope separate; no new franchise assets implied by this C&C request |

Publisher material for Red Alert 3 explicitly treats sea control and transforming Empire units as central features. That supports making amphibious and transformation readability a first-class workstream rather than a skin exercise. The Remastered Collection's publisher description separately emphasises modernised UI, zoom, audio and control improvements, which supports evaluating the entire presentation loop. [Red Alert 3 publisher page](https://store.steampowered.com/app/17480/Command__Conquer_Red_Alert_3/), [Remastered publisher page](https://store.steampowered.com/app/1213210/Command__Conquer_Remastered_Collection/).

## Canonical asset identity and evidence

Every asset work order must bind to a signed content inventory row. The minimum identity is `sourceFamily/sourceTitle/sourceEdition/sourcePatch/factionId/contentId/formId`. Runtime identity and source identity are separate fields. Preserve existing runtime IDs through migration or map them explicitly; do not rename units because two eras share a display name.

Each record contains:

- Gameplay classification: buildable, campaign-only, summoned, spawned, support power, civilian, neutral, unused, cut, or variant. Unsupported source content stays visible in the scope register with its reason.
- Source evidence: manual page, released source/data path at a pinned revision, and lawful gameplay observation when the data does not explain appearance or timing. Record discrepancies instead of inventing an average.
- Runtime evidence: current definition ID, present mechanics, current model/shape alias, icon, sounds, tests and current completion state.
- Asset evidence: editable source path, export path, content hash, creator, permission/provenance record, derivative inputs, tool/version and exporter settings.
- Art requirements: silhouette, footprint, height, materials, team mask, sockets, animation set, damage stages, destroyed state, LODs, icons and UI labels.
- Validation: automatic validator output, turntable, gameplay captures at three zooms, performance contribution and independent review result.

Allowed stage values are `unresearched`, `researched`, `specified`, `blocked-rights`, `blocked-mechanics`, `blockout`, `modelled`, `rigged`, `animated`, `integrated`, `verified`, and `released`. A model can be complete while the row remains blocked on a missing mechanic; task reports must say so. No global completion percentage may count an `integrated` or `blockout` row as `verified`.

Aliases are permitted only where the inventory deliberately represents the same visual object. Reusing a common skeleton is encouraged; reusing a final silhouette for unrelated units requires an explicit art-lead decision. Runtime fallback meshes are acceptable for development diagnostics and failed loads, and are conspicuously marked in development. A release manifest fails when an included item resolves to fallback art.

## Asset exchange and authoring conventions

Use editable sources plus a reproducible exported runtime asset. The proposed runtime exchange is glTF 2.0/GLB, subject to the renderer decision and validation spike. glTF defines a right-handed coordinate system, +Y up, +Z forward and metric linear units; its core supports transforms, skinning and animation data. The project adapter must handle the existing simulation coordinate system explicitly. [Khronos glTF specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

Proposed authoring standard:

1. Export root at the ground contact origin, scale applied, no negative root scale, no hidden scene cameras/lights, and no external texture URL. The default authoring scale is four metres per simulation cell. The renderer uses cell units as specified in the engine contract, so imported metre-authored asset geometry receives the explicit 1/4 conversion before placement; world transforms use the engine's lepton-to-cell conversion. This is an RTS composition scale, not a claim of literal real-world unit dimensions. Changing it requires re-running camera, reach, height and picking fixtures.
2. Gameplay positions stay in their integer/fixed-point representation. The adapter alone converts X/Y map coordinates and authoritative elevation into render coordinates. Mesh bounds never become movement collision, weapon range, build footprint, or target permissions.
3. A building's placement origin is the existing canonical footprint origin, with an explicit visual offset. A unit's root is its authoritative planar centre. Turret roots, muzzle sockets, cargo doors, landing points and effect sockets are named in an asset manifest and validated.
4. Required common sockets are `fx.root`, `ui.label`, `ui.health`, and, when applicable, `weapon.<slot>.muzzle.<n>`, `turret.<slot>.yaw`, `barrel.<slot>.pitch`, `cargo.entry.<n>`, `cargo.exit.<n>`, `production.exit.<n>`, `engine.exhaust.<n>`, `track.left`, `track.right`, `rotor.<n>`, and `repair.attach`. Only applicable sockets are required; `notApplicable` needs a reason.
5. Material names distinguish body, team mask, glass, emissive, moving tread and optional damage variants. Team identity is layered over faction identity and remains legible on all supported terrain themes. No flashing color is the sole warning signal.
6. Texture and geometry budgets are assigned per class after the representative benchmark. Start with at most two opaque materials for ordinary units, three for large buildings, and one shared transparent/FX material where possible. These are proposal budgets; a measured exception must identify the scene cost.
7. LOD0 preserves the close-view silhouette and articulation. LOD1/LOD2 reduce geometry, bones and update frequency; the tactical silhouette, team identity, firing direction, selected state and important ability state remain readable. Far tactical markers can supplement geometry, not replace all close-range 3D assets.
8. Icons and production portraits come from the accepted 3D asset and a shared lighting/camera setup, with a separately authored high-contrast variant for very small controls. A hero illustration alone cannot stand in for a complete gameplay asset.
9. Export validation checks finite transforms, nonzero bounds, legal names, texture dimensions, missing textures, max skin weights, socket presence, clip names, import correctness and disposal. Unsupported exporter features must fail before integration.

## Complete animation matrix

Every content row derives its animation requirements from mechanic tags. A task cannot mark a clip omitted without a documented `notApplicable` reason. An animation may be authored, procedurally articulated, or driven by a reusable rig if the result is reviewed in gameplay. Rotation of a whole rigid model does not satisfy full infantry/walker animation.

| Class | Mandatory states for every applicable item | Conditional states that become mandatory with their mechanic |
| --- | --- | --- |
| Infantry and crew | Idle/breathing; start/stop; locomotion; facing/aim; primary attack; hit reaction; death; selected/command acknowledgement presentation | Prone/kneel; secondary weapon; reload; throw/place charge; heal/repair; enter/exit; parachute; swim; jetpack; disguise; stealth; mind-control source/victim; deploy; garrison; hero ability; frozen/EMP/disabled |
| Tracked vehicles | Hull movement; speed-coupled tread motion; turning; turret yaw; barrel pitch/recoil; attack; damage; stop; destruction/wreck | Reverse move; deploy/undeploy; stabilisers; missile reload; cargo doors; repair bay; harvester work/unload; cloak; amphibious transition; overheat; weapon mode; transformation |
| Wheeled vehicles | Wheel rotation; steering; suspension visual response; hull/turret separation; recoil; damage; destruction | Cargo, build, collect, deploy, amphibious, upgraded mount, suicide attack and recovery states |
| Walkers and creatures | Distinct gait; foot/ground contact; turn; stop; aim; fire; hit; collapse/death | Bracing; stomp; melee; burrow/surface; jump; climb if supported; mode transition; detachable or respawning parts |
| Fixed-wing aircraft | Ground idle if landable; takeoff; cruise; bank/turn; attack run; impact/destruction | Landing; rearm; cargo deployment; parachute release; variable wings; VTOL mode; carrier launch/recovery |
| Rotorcraft and hover craft | Rotor/fan state; hover; accelerate/decelerate; banking; attack; destruction | Land/rearm; winch/transport; deploy; altitude mode; water contact and transition |
| Ships and submarines | Wake matched to speed; hull orientation; turrets/weapons; launch/attack; damage; sink/destruction | Submerge/surface; torpedo/bomb release; carrier deck operations; shore landing; amphibious transition; transport loading/unloading |
| Structures | Construction sequence; intact idle activity; production activity; low-power or disabled state if relevant; damage states; repair; sell/decommission; destruction; final rubble or cleared footprint | Doors and production exit; refinery unloading; turret tracking; launch silo; superweapon charge/ready/fire/cooldown; capture/ownership update; garrison occupancy; upgrade appearance; deploy/pack; shield generator; burning; waterborne motion |
| Resources and props | Intact/readable resource type; depletion/harvest stage; exhausted state; regeneration where allowed | Toxicity/damage indication; spread; burning; destruction; collapsing tree; removable obstacle; salvage; civilian traffic if included |
| Bridges | Intact deck/supports; progressive damage; collapse; broken span; repair work; rebuild completion | Multiple spans; repair hut activity; traffic markers; water debris; elevation-specific fragments; attack/repair targeting cues |
| Projectiles and abilities | Launch; flight or beam; impact; end; unique source and target cues | Guidance; split/burst; interception; bounce; area duration; charge; warning footprint; persistent status; detection/stealth effects |

For structures, a generic upward scale is only a temporary blockout. Final construction must show a logical build-up: foundation, structural mass, recognisable functional machinery, then operational lighting. Use staged meshes, skeletal pieces or a controlled reveal with authored mechanical movement. Selling needs a distinct controlled teardown or pack sequence; it must not look identical to combat destruction. Production should visibly connect factory activity, doors, and the emerging unit without changing authoritative production timing or trapping units inside the mesh.

For special forms, asset records contain both forms and their transition contract. A transforming unit needs a pose bridge, event timing, ability cooldown display and legal interruption behavior. No sudden mesh swap in the close view unless the approved reference or homage design explicitly uses teleportation. Teleportation itself requires departure, destination and interruption cues that respect visibility permissions.

## State binding and animation timing

Animation consumes a presentation snapshot and ordered public events. It never decides damage, movement completion, capture, resource credit, production completion, bridge support, occupancy, or status expiration. The server/simulation owns those events. A clip marker can emit cosmetic particles or sound, but cannot send a gameplay mutation.

The binding contract includes entity ID, content/form ID, authoritative tick, state start tick, planar position, elevation/layer, facing, turret/aim data, speed, health stage, status flags, owner/team, visibility mode and event sequence. Missing state is a schema fault; do not infer attack by watching a health bar fall. The engine specialist owns the exact types and version negotiation.

At the current 15 Hz simulation baseline, graphics interpolate state. Do not alter simulation tick rate merely to obtain smooth animation. Blend movement from actual presented displacement; footstep/tread playback follows speed and stops when movement stops. Disable root motion in exported gameplay clips. Render-level banking, recoil, suspension and idle motion are bounded offsets that cannot move the authoritative root or weapon hit calculation.

A visual shot occurs at the event's presentation time and uses the authoritative weapon outcome. If interpolation runs behind the server, the impact and projectile trajectory use the same event timeline; the renderer cannot pretend a confirmed hit missed. Reconnects and snapshot rewinds must suppress duplicate attack sounds, deaths and construction celebrations. Track event IDs with a bounded deduplication window, reset by session/epoch rather than global local storage.

Priority is death/despawn, teleport/form transition, hard disabled state, explicit ability action, attack overlay, locomotion, then idle. The exact priority matrix is data and tested. Upper-body aiming or turret motion can blend over locomotion; a whole-body deploy animation cannot overlap incompatible movement. Uninterruptible visual clips must still yield immediately to authoritative death/despawn.

Animation continuity is tested at 15, 30, 60 and irregular render frame rates. A recorded command stream must produce the same authoritative state with animation disabled, at low detail, and at full detail. Replay seek reconstructs pose from state-start tick and deterministic cosmetic seed; it must not require replaying every video frame from the start.

## Damage, effects and destruction

Provide at least intact, visibly damaged and critical damage presentation for structures and large vehicles where useful; map thresholds from profile data. Dirt and smoke cannot conceal team identity or the footprint edge. Burning and steam distinguish material types but should not imply ongoing damage unless that is true.

Weapon families need distinct silhouettes and timing: ballistic kick and impact; missile smoke and acceleration; electric arcing; flame volume and ignition cue; coherent beam; sonic pulse; radiation/contamination field; psychic source-target relationship; torpedo wake. The exact set follows the inventory, including abilities absent from the current `WeaponVisual` enum. Adding an effect without its gameplay behavior cannot close a content task.

Destruction has three layers: authoritative removal or wreck state; guaranteed readable presentation cue; optional cosmetic detail. On constrained devices, optional fragments and lights may be reduced. Do not remove the readable cue or gameplay obstacle. Cosmetic debris uses bounded lifetimes, no authoritative collision and no hidden-enemy information. If wrecks are salvageable or block navigation, those objects are separately simulated and persisted.

Screen shake, bloom, motion blur, flashes and dramatic cameras are restrained and user-adjustable. They cannot cover selection feedback, warn about an unseen unit, or move the gameplay camera without opt-in. Normal combat must remain understandable without sound, color discrimination or particle density.

## Original asset production and reuse gate

Read the existing rights ledger and preserve its distinctions. A model built from original geometry still needs provenance and review of inputs, names, logos, textures, audio and any extracted original data used during production. Technical access to source code, manuals or an installed game is not a shipping permission. The public asset build accepts only records whose permission status meets the project's release policy; review-bound entries stay outside public bundles.

For every new asset, the maker supplies editable geometry/rig, export, texture sources, manifest and a brief describing the original design choices. The reviewer checks reference fidelity at the level approved for the homage while also checking the provenance record. Do not use another mod's assets, ripped game models, original audio clips, faction emblems or music as convenient placeholders in a public preview.

Image generation, if later used for concept exploration, does not produce a validated rigged 3D asset. Generated concepts must go through modelling, retopology, materials, rigging, export, provenance and gameplay review like any other input. Tool availability does not reduce the task's acceptance requirements.

## Per-entity completion gate

An individual asset is complete only when:

1. Its source/variant/scope row is approved and current gameplay behavior is reconciled.
2. Every required form, socket, clip, damage state, icon and sound hook exists or has a signed reason for non-applicability.
3. It loads without fallback and passes the manifest/import validator at the pinned build.
4. A turntable and three gameplay zoom captures prove silhouette, team ID, articulation and correct footprint.
5. A replay exercises build/spawn, movement, attack/ability, damage, repair, ownership change if applicable, sell/pack if applicable, and destruction/despawn.
6. Tests show render quality settings do not change gameplay state, fog information, command selection, or hit results.
7. Its contribution fits the accepted scene budget, and repeated load/unload does not leak resources.
8. A different reviewer signs the evidence; the maker cannot self-certify final visual quality.

The final roster audit performs a relational join between the approved source inventory, runtime catalogue and asset manifest. Missing rows, unexplained extra rows, fallback aliases, omitted forms and unreviewed required clips are hard failures. Source content that is deliberately excluded remains in the coverage report with the owner's explicit scope decision; it cannot disappear from the denominator.
