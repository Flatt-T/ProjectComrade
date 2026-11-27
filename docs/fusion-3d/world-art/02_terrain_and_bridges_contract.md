# Fusion terrain and bridge contract

Status: proposed Fusion homage profile, 18 November 2026. The bridge numbers and new cross-era rules in this document are concrete defaults for isolated implementation and design/playtest review. The programme's design lead records them in a versioned rules decision; the owner can amend them during the normal acceptance review. This does not require a new permission request before already-authorised planning or isolated implementation. They do not purport to be the rules of every Command & Conquer title. Classic preservation profiles retain their own verified source behavior.

## Current limitation and required change

At audited main `84f411478f01ed62365a2e4d1d316eb57d9e193c`, `MapData` in `packages/fusion/src/map.ts` stores a single terrain index, resource arrays and one occupied structure ID per cell. `terrainPassable` tests a handful of movement classes; `worldgen.ts` uses height to select terrain, without retaining that height as a playable elevation field. These are useful foundations but cannot represent a tank on an elevated bridge and a ship below it at the same horizontal location. Adding a bridge texture would leave the important game behavior missing. [Map source](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/map.ts), [world generator](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/worldgen.ts).

The target world stores durable geometry and gameplay surfaces, exposes navigation and visibility through deterministic interfaces, and renders the same world in real 3D. Decorative surface detail can vary by quality level; the ability to stand, build, shoot, see, cross, sail, harvest or repair cannot.

## Terrain coverage and the completeness rule

The historian must inventory each shipped title, expansion, campaign, skirmish set and special map family. The production coverage matrix below is deliberately broader than a few base colors. It specifies work that must be scheduled. It is not an assertion that every listed feature appears in every game, nor is it a substitute for a source-map inventory.

Each biome/theatre work order records its source map references, geometry grammar, ground materials, props, vegetation, architecture, water, lighting, ambience, hazards, movement/build/visibility properties and transition neighbors. If a source game's environment does not fit a row, add a row with a stable ID. An environment cannot be dropped because the first representative battle did not need it.

| Kit ID | Required environment family | Required variants and interactions | Evidence scope to resolve |
| --- | --- | --- | --- |
| T01 | Temperate countryside | Grass, bare earth, tracks, hedges, wooded and open variants | Early C&C/RA maps and later temperate campaigns |
| T02 | Forest and woodland | Conifer, deciduous, mixed, sparse/dense, clearings and felled/burnt trees | Per-title tree obstacle and destruction behavior |
| T03 | Autumn and dry temperate | Dry grass, leaf litter, golden/brown vegetation and muddy ruts | Distinct theatre where source maps support it |
| T04 | Snow and winter | Snow depth appearance, packed roads, frosted buildings, ice-edged rivers | Snow theatre and cold campaign maps |
| T05 | Tundra and arctic | Exposed rock, sparse vegetation, ice/snow transition, cold coast | Per-title maps; do not equate to T04 recolor |
| T06 | Ice surface | Frozen shore, cracks, water below, broken/open water | Breakable/weight-sensitive ice requires separate verified mechanics |
| T07 | Sand desert | Fine sand, dunes, rock outcrops, dry riverbed and access corridors | Early desert and later arid maps |
| T08 | Rocky desert and badlands | Mesas, gravel, eroded cliffs, canyons and ramp entries | Map-specific height and passability evidence |
| T09 | Semi-arid settlement and oasis | Sparse vegetation, irrigation, desert roads and inhabited pockets | Generals-era and other approved reference maps |
| T10 | Tropical coast and islands | Palms, jungle edge, beaches, reef appearance and volcanic-rock variants | Naval/amphibious map references |
| T11 | Wetland and floodplain | Reeds, mud, shallow channels, banks and crossings | Cosmetic wetness versus real movement effects |
| T12 | Temperate urban | Streets, pavements, blocks, parks, parking and service alleys | Garrison, rubble and road rules vary by profile |
| T13 | Industrial and military urban | Factories, storage, utilities, ports, airfields and rail visual language | Interactive versus decorative infrastructure |
| T14 | Distinct regional city styles | Research every approved regional/cultural architecture set | Separate kits where silhouettes/materials differ; no generic city claim |
| T15 | Ruined and war-damaged city | Broken buildings, craters, rubble, fires and evacuated streets | Persistent rubble/obstacle behavior explicit |
| T16 | Rural settlements and farms | Villages, farms, fences, fields and minor roads | Civilian/neutral interactability evidence |
| T17 | Mountain and plateau | Elevation bands, cliff faces, switchbacks, passes and overlooks | Authoritative slopes, ramps, sight and firing rules |
| T18 | Ravine and river valley | Channels, embankments, narrow choke points and bridge anchors | Multiple route levels and collapse behavior |
| T19 | Coastal and shallow water | Beaches, shallows, harbors, piers, docks and surf | Amphibious transition and structure siting |
| T20 | Deep/open water | Ocean, deep lake, strait, navigable channel and submarine presentation | Draft/clearance policy and naval route validation |
| T21 | Rivers and engineered canals | Navigable/wade-only/non-navigable variants, locks as visual props unless separately specified | Shipping corridors and bridge underpass clearance |
| T22 | Low-contamination future environment | Settled/maintained terrain with controlled resource fields | Tiberium-era source maps, not a generic green overlay |
| T23 | Degraded/contaminated frontier | Broken infrastructure, spread patterns, toxic visual language and hostile vegetation | Separate resources, hazards and infestation rules |
| T24 | Severe alien contamination | Crystalline/alien terrain, distorted silhouettes, barren zones, organic/technological forms | Specific title/patch/map evidence; do not invent alien gameplay |
| T25 | Fire, ash and volcanic environment | Burnt soil, lava/thermal visual treatments if actually represented | Exact appearances and hazard rules remain research-gated |
| T26 | Interior/underground reference set | Industrial interiors, tunnels, bunkers and special campaign spaces | Renegade/mission research; no automatic first-person or underground RTS mode |
| T27 | Special mission/experimental theatres | Every remaining source-map environment absent from T01–T26 | Must be enumerated by historian, with include/adapt/defer decision |
| T28 | Existing Dune-style compatibility | Sand, rock, spice, concrete foundations, sandworm-readable areas | Existing independent pack; preserve separately from C&C inventory |

Overlay systems, shared across those kits where appropriate, are independently tracked: roads and junctions; tracks; rail visual infrastructure; rivers/banks; coast/foam; cliffs/ramps; bridges/repair huts; walls/gates; resource deposits; concrete/foundations; civilian/neutral structures; destructible props; craters/scorch/rubble; weather; contamination; water state; map boundaries and playable margins.

The full terrain gate joins source-map theatre inventory, kit manifests, surface rules and benchmark scenes. Every source environment has either an implemented coverage link or a named, approved scope decision. A kit is not complete until a map uses its geometry, props, materials and gameplay rules together at all supported quality settings.

## Geometry, materials and blending

Store height/elevation and traversable surfaces with stable quantisation. Prefer chunked heightfields for terrain plus explicit mesh structures for cliffs, buildings, bridges and tunnels; the engine architecture decision owns the final representation. Steep visual gradients cannot pretend to be passable slopes. Each ramp has explicit endpoints and navigation connections. Bridge decks are surfaces with separate IDs, not a water terrain replacement.

Terrain chunks need stable border samples and deterministic neighbor derivation. Generation order, worker count and streaming order must not create cracks, one-cell height discontinuities or mismatching water levels. Long-lived worlds pin worldgen version, seed, content/rules hash and authored overrides. Updating art must not regenerate terrain under an existing settlement.

Blend by compatible material and climate rules, not unconstrained per-cell noise. Example approved edges are grass–dirt, dirt–road shoulder, sand–rock, snow–exposed rock, beach–shallows, shallows–deep water, urban pavement–rubble, and contamination–affected soil. A cold-to-tropical transition needs geographic distance or a deliberately authored map boundary. All masks are deterministic artifacts or reproducibly derived from durable world data.

Use a small material library with coherent texel density and macro variation. Terrain details are judged from tactical view first. Large-scale landform and color organisation communicate routes; tiny noisy textures must not obscure units. Surface decals cannot change gameplay classes. Snow, camouflage, darkness and weather may lower aesthetic contrast only within the minimum readability standard.

Vegetation and props are classified as cosmetic, destroyable cosmetic, navigation obstacle, cover/garrison, resource or neutral interactive entity. The class determines whether it is in the authoritative state. Cosmetic trees cannot obstruct movement or hide otherwise visible units. An authoritative tree obstacle must still have the same collision on low detail when its foliage is simplified.

Water rendering must reveal bank edges, valid landing points, deep channels and blocked shallows. Reflections and transparent effects are optional detail; navigation boundaries and submerged-unit detection cues are not. Low quality uses a cheaper material while retaining water level, shoreline and selection clarity.

## Movement and visibility contracts

The new surface interface must answer passability per movement profile, not just per unit category. Foot, wheeled, tracked, amphibious, hover, naval with draft/clearance, air, and research-approved subterranean modes each need declared rules. A content item may switch profiles only through an authoritative form/state transition.

The authoritative location is `(x, y, surfaceId/layer, elevation, movementMode)`, with versioned compatibility for existing flat maps. Two units at the same x/y on different surfaces are not colliding by default. Occupancy and reservation keys include surface identity. Path results include surface transitions and a topology revision; collapse or rebuilt edges invalidate dependent paths. No stale route may carry a unit across a missing deck.

Line of sight, projectile trajectories, cover and high-ground bonuses are independent decisions. Full 3D visuals do not automatically add a high-ground damage bonus or physics projectile model. Each is sourced for Classic profiles or deliberately specified for Fusion. The new geometry must at least allow explicit height-aware visibility and firing rules without deriving outcomes from a GPU depth buffer.

Air units do not inherit terrain obstacles just because their shadows touch them. Submerged/underground entities obey detection and targeting rules rather than a renderer opacity setting. Fog filtering occurs before the renderer, minimap, labels, particles, audio, shadows, selection rays and accessibility descriptions receive enemy state.

## Bridge gameplay specification

### Evidence and design boundary

The Tiberian Sun manual explicitly describes Engineers entering a repair hut to rebuild missing bridge sections and repair damaged ones. The Red Alert 2 manual also describes Engineer repair at bridge huts. These sources support bridge-repair research; they do not settle every occupant, timing, ownership or shipping interaction. [Tiberian Sun manual, printed pages 12 and 43](https://www.bestoldgames.net/download/games/command-and-conquer-tiberian-sun/command-and-conquer-tiberian-sun-win-manual.pdf), [Red Alert 2 manual, printed page 23](https://oldgamesdownload.com/manual/command-conquer-red-alert-2-windows-manual-english/).

The proposal below is `fusion-bridge-v1`. Record its economic and balance parameters in the Fusion rules profile before isolated implementation. The programme design and gameplay review determines promotion beyond the preview. If that review chooses a different repair/collapse rule, change the profile, tests and documentation together. No agent may silently substitute whichever C&C game's behavior it remembers.

### Entity and span records

A bridge has a stable ID, neutral infrastructure owner, owning simulation region, endpoint/hut IDs, definition version, ordered span IDs, deck width, deck surface height, underpass clearance, support/pier collision, per-span maximum/current HP, state, topology revision and any repair job. Every span links its deck cells and adjoining graph edges. The bridge definition says which spans are structurally independent; the initial version uses independently destructible spans. A severed middle span leaves surviving portions as dead-end deck surfaces rather than erasing the whole bridge.

Huts are neutral, noncapturable interaction anchors and are not ordinary production structures. For the initial profile they are indestructible. Bridges never become the repairer's private property, cannot be traded or packed, and do not extend a player's build radius. Future capturable or destructible hut variants require separate profiles and tasks.

Reserve an infrastructure corridor covering deck, endpoint approach cells, supports, huts and the shipping channel. Base placement, shields, ordinary buildings, resource generation and starting settlements cannot occupy it. Infrastructure cannot be used to circumvent an offline shield or change the existing consent rules for allied Engineer capture. A bridge-repair action is a distinct command from building capture.

### Concrete proposed default parameters

| Parameter | `fusion-bridge-v1` default | Reason for explicit value |
| --- | --- | --- |
| Span HP | 2,400 HP per standard span | Fixture value; rebalance via profile version after playtests |
| Damage presentation | `intact` above 50%; `damaged` at 1–50%; `destroyed` at zero | Shared thresholds for HUD, mesh and test fixtures |
| Rebuild cost | 600 credits per destroyed span | Whole quote shown before command admission |
| Partial repair cost | `ceil(sum(missing HP of surviving spans) / 4)` credits | Deterministic integer accounting |
| Repair duration | 450 simulation ticks for a job containing any destroyed span; otherwise 150 ticks | At current 15 Hz, 30 seconds or 10 seconds; tick count remains authoritative |
| Engineer | One eligible Engineer is consumed at successful job admission | Failed admission never consumes it |
| Simultaneous jobs | One active job per bridge | Duplicate commands do not double-spend or accelerate |
| Hostile damage during job | A confirmed damage event to a bridge span or its visible rebuilding scaffold aborts the job; no credit/Engineer refund | Clear contest rule; show cancellation feedback |
| Scaffold | Visible target proxy during a rebuild, 600 HP; only belongs to bridge job, never creates walkable deck | Keeps rebuilding contestable while deck is absent |
| Job completion | Restore the targeted snapshot of spans to full HP in one atomic topology commit | No partially available rebuilt deck |
| Extra collapse after admission | Already aborts via damage rule; any other inconsistency cancels as a fault before completion | Prevent stale quotes and silent shape changes |
| Deck collapse | Apply the existing damage/protection policy first. Vulnerable supported non-air occupants receive lethal environmental damage through the ordinary damage path; protected entities/cargo use the reserved-refuge protocol below | No immunity bypass, duplicate recovery army or arbitrary destination; amphibious survival for otherwise vulnerable units is a separate versioned extension |
| Ships underneath | Ordinary bridge collapse does not damage ships or create a new shipping obstruction | No cosmetic debris-derived deaths or blockade |
| Air above | Unaffected unless separately struck by a valid attack | Surface membership, not screen overlap, controls collapse |
| Rebuild obstruction | Completion waits while a deck/transition volume is authoritatively occupied incompatibly; no entity is teleported, crushed or deleted to finish | See blocked completion rule below |

No claim is made that these values are balanced. They exist so the first bridge implementation and playtest are precise and reviewable. Structural variants can have different HP/cost/width/clearance, with explicit profile rows and the same invariants.

### States and transitions

Span state is derived from HP except during rebuild: `intact`, `damaged`, `destroyed`, or `rebuilding`. Bridge-level repair job state is `none`, `working`, `blocked-completion`, `completed`, or `aborted`, with a transaction/event ID.

1. A valid damage event reduces span HP. On transition to zero, remove its traversable deck edges and reservations, process supported occupants in stable entity-ID order, update topology revision, then allow subsequent traversal queries. Rendering collapse begins from the emitted event and may continue after the deck has ceased to exist in gameplay.
2. Damage to one span does not delete ships below, unrelated endpoint cells, surviving deck segments, or neighboring roads. Projectiles hitting the bridge must select its surface/structure target explicitly. A ground attack cannot accidentally hit an unseen ship because the screen coordinates overlap.
3. A repair command identifies bridge ID, Engineer ID, command ID and expected world/topology version. Validate ownership/control of the Engineer, eligible ability, reachable hut, actual hut arrival, current visibility/interaction permission, no existing job, needed repair, credits and the infrastructure/shield rules. Quote totals are calculated server-side from current state.
4. At successful admission, atomically debit credits, remove the Engineer, create the job and emit exactly one admission event. Inaccessible hut, stale state, insufficient funds, missing Engineer or duplicate command returns an explicit reason without partial mutation. A retry returns the prior result for that command ID.
5. The job targets the damaged/missing spans in its admitted snapshot. Surviving deck stays usable during repair; destroyed spans stay nontraversable during rebuilding. Visual scaffolding never opens navigation. Confirmed hostile damage aborts the job once; no refund is issued under this proposed default.
6. At completion, validate target set and blocker volumes. Normal ships using an underpass with adequate clearance are not blockers. A unit or structure illegally occupying the reconstructed volume or ramp connection prevents completion. Enter `blocked-completion` and show the exact reason; do not consume additional credits or Engineers. Recheck each tick. After 900 blocked ticks, abort and refund the credit cost but not the consumed Engineer, with an explicit event; this exceptional case should normally be prevented by reservations and placement validation.
7. On successful completion, restore the quoted spans, clear scaffold/job reservations, add deck edges and increment topology revision atomically. Queued orders may replan; no unit automatically teleports onto the bridge. Duplicate completion/replay is idempotent.
8. Save/snapshot contains damage, job ID, targets, accepted cost, start/progress tick, blocked deadline and topology revision. Restore and reconnect cannot replay the debit or consume another Engineer.

The engine lead must formalise global tick ordering so bridge topology updates become visible to every later movement/path query in that tick. Existing Classic event ordering is not changed by this new Fusion profile. Movement that has already completed before a damage event uses its new support membership; collapse membership is taken at the damage commit. Do not retroactively kill a unit that had crossed off the span before it failed.

### Protection precedence and reserved refuge

The current damage path in `packages/fusion/src/game.ts` explicitly respects temporary invulnerability, compound shields, newcomer protection, entity-scoped recovery protection and transports carrying only protected cargo. Environmental bridge failure must not bypass those checks with direct HP assignment or a quiet/forced kill. Existing legacy profiles remain unchanged. The new Fusion default treats any protection that blocks the ordinary environmental damage path as requiring safe support-loss preservation. [Current damage implementation](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/game.ts).

Use this concrete new-profile protocol:

1. Before a protected entity enters a destructible bridge, acquire a durable refuge reservation on the entry bank. Inspect both carrier and nested cargo. An entirely protected carrier/subtree may share a berth large enough for the carrier. A mixed, vulnerable carrier needs separate reserved berths for each protected cargo root that would survive its destruction. Stable entity IDs, not array order, determine processing order.
2. Candidate berths are authoritatively traversable, unoccupied, unreserved stable ground within eight cells of that entry endpoint and reachable from the entry bank without crossing the destructible span. Exclude water, another destructible support, protected compounds the entity cannot enter, infrastructure approaches, buildings and future construction reservations. Sort by shortest valid bank-route cost, then squared distance to the endpoint, then surface ID, then cell index. Select the first fit for the full footprint. If none exists, reject that protected bridge admission with a visible reason; do not delete, relocate, downgrade protection or grant a new unit.
3. Reserve the berth against movement occupancy, building placement and terrain mutation until the entity leaves the bridge or no longer needs protection. Persist world/bridge/span/entry endpoint, entity/subtree IDs, protection generation, footprint, berth surface/cells and transaction ID. The first implementation is wholly within one authoritative region; ENG-045 extends the same reservation ownership across region seams.
4. Any new protection grant or loading of protected cargo while already on a bridge must acquire the required reservations atomically before that new state becomes active. If it cannot, that specific new-profile action is rejected with an explicit reason and no partial charge/ability consumption. Existing protection is never revoked to admit a move. A protection expiry releases an unnecessary reservation; adding/removing cargo recomputes the protected roots without duplicating reservations.
5. On collapse, remove failed deck topology, evaluate ordinary protection rules, and process entity roots in stable ID order. Vulnerable entities follow normal damage/death/cargo accounting. Protected roots/subtrees relocate atomically to their own reserved berth, preserving the same IDs, HP, ownership, bound/recovery flags, cargo relationships, inventory, veterancy, packed-building state, superweapon charge, command provenance and protection generation. Do not create an MCV or award credits. Cancel the now-invalid movement path and issue a permitted support-loss/relocation event.
6. A protected child of a destroyed mixed carrier is detached and placed at its own reserved berth through the same transaction. A child still inside a preserved protected carrier moves with that carrier and must not also receive a second relocation. Clear only the relevant consumed reservation after successful placement.
7. If an invariant violation makes a previously valid berth unavailable, preserve the exact entity/subtree in a durable `RECOVERY_REQUIRED` support-loss record and fence its further commands until the existing recovery/transfer machinery resolves the original destination. Do not insert it into an arbitrary nearest cell, erase it, keep a phantom traversable deck or run starter-army recovery. Admission should make this path exceptional. A failure-injection test must prove recovery without loss or duplication before the affected profile can be promoted.

The rescue behavior is an explicit Fusion adaptation for protection compatibility, not a claim about source-game bridge physics. It must be visible in the rules decision and tested for abuse: repeated bridge crossing cannot clone cargo, refund credits, reset protection, bypass shields, transport an unprotected army for free, or move farther than the reserved entry-bank berth. Profiles with a different researched environmental immunity rule require their own versioned decision and tests; no agent may silently choose one.

### Regional authority and long-lived worlds

One region is the bridge authority. The first implementation requires the entire bridge and both endpoints to lie inside that region; generation and authoring reject a bridge that crosses a region boundary. Cross-boundary bridges remain a separately scheduled extension, requiring an authoritative bridge-state revision and transfer barrier before that authoring restriction is removed. Do not split a bridge job into independent regional updates. A crashed owner region pauses new traversals/repair completion until recovery; it cannot guess an intact bridge from client geometry.

Log bridge damage, collapse, supported entity results, job admission/debit, cancellation/refund, completion and topology revision. These events must correlate to existing durable transactions and replay hashes. Repair job state migrates with world schema versions; existing flat saves receive an empty bridge collection and default ground surface without re-seeding their map.

### Presentation and interaction

Bridge deck, supports and water remain visibly separate. Selection provides span health and a bridge-level repair action where appropriate. The hut is visually legible and can be reached from either bank if the definition has two endpoints. Touch players can select the bridge/hut without hitting a ship below; an explicit layer/target chooser appears only when projected targets are ambiguous.

Damage exposes meaningful missing/unstable geometry. Collapse runs along the failed span's structural form, not an arbitrary explosion covering the whole river. Construction visibly repairs supports/deck, but the HUD says when the route is closed and when it reopens. Every denied action states its practical reason: unreachable hut, insufficient credits, repair in progress, bridge intact, protected corridor conflict, or completion blocked.

Enemy bridge damage and repair activity are shown only when the viewer has the appropriate current visibility. Fogged remembered infrastructure may show last-known state, clearly treated as memory; it must not update live HP, progress, particles, labels or audio through fog. Navigation knowledge for the player may need exploration updates, while the authoritative path planner always knows the real world; rejected routes must not leak the exact unseen attacker.

## Bridge acceptance matrix

| Scenario | Required result |
| --- | --- |
| Tank on deck, ship below, aircraft above | Distinct surfaces, correct targeting, independent selection and collision |
| Span destroyed with infantry/tank/transport on it | Ordinary damage/protection policy first; vulnerable occupants follow normal death once and protected entities/cargo use their reserved refuge transaction |
| Tank steps off span before collapse commit | Survives; membership taken at commit |
| Tank path was planned before span failure | Path invalidated; never crosses an absent edge |
| A ship moves under bridge during collapse | Survives normal collapse and continues through valid channel |
| Piers/narrow or low clearance | Ships rejected by authoritative profile constraints, not visual guesses |
| Simultaneous attacks and repair completion | Stable tick order and identical results on replay |
| Two Engineers/order retries | One admitted job, one debit/consumption; explicit result for the other |
| Repair with insufficient funds/unreachable hut | Zero world/economy changes |
| Attack during rebuild | One cancellation, correct no-refund rule, closed route remains closed |
| Restore mid-job / reconnect / replay seek | Same remaining ticks, no double charge, correct animation reconstructed |
| Rebuild volume obstruction | No teleport/delete; blocked status, recheck and timeout rule applied |
| Region restart or handoff | One authority, no duplicate completion, safe traversal barrier |
| Hidden enemy activity | No labels, particles, sounds, shadows, minimap or timing leakage |
| Shield/base relocation near bridge | Infrastructure exclusion preserves original shield and capture rules |
| Protected newcomer/recovery MCV crosses or is carried across | Entry-bank berth reserved before admission; collapse preserves the same asset and all state, with no starter grant |
| Mixed cargo carrier collapses | Vulnerable carrier dies normally; protected cargo roots relocate once to separately reserved berths |
| Temporary invulnerability begins while on deck | Atomic refuge reservation precedes grant; failure rejects the new action without charge or existing-protection loss |
| Reserved berth becomes invalid under failure injection | Durable recoverable record preserves identity/state; no fallback spawn/delete/duplicate; exact recovery proved before promotion |
| Low graphics quality | Same legal routes, bridge state, selection and clear warning cues |

## Terrain generation, editing and saved-state gates

The generator must first produce strategic topology, then landforms, then biome materials and decorative detail. It must validate spawn spacing, safe initial deployment, a usable resource approach, land/sea connectivity, viable amphibious transitions, bridge endpoints, ship clearances, building footprints and cliff/ramp consistency. A beautiful map that traps a new MCV or makes a nominal sea lane unusable fails.

Use fixed-seed fixtures with expected geometry hashes and route assertions. Include tiny maps for edge cases, medium authored matches and large persistent chunks. Test chunk load order permutations and regenerated cache equivalence. Art randomness has a separate seed/stream and cannot change gameplay noise consumption.

An authoring/debug tool must display surface IDs, height samples, movement classes, occupancy, topology revisions, visibility, bridge spans and excluded infrastructure corridors. It also exports a human-reviewable map image and machine-readable validation report. Editing a persistent live world is not implicitly authorised by providing an editor; changes need a separate operational transaction and rollback plan.

Weather, day/night, ice cracking, fire spread, contamination growth, deformable terrain, tunnels and civilian behavior are each explicit mechanics workstreams when the research confirms relevance. Start with their durable schema and fixtures. Do not let a shader quietly add a movement penalty or lightning damage. If retained as cosmetic-only in the initial Fusion profile, say so in the rules manifest while leaving the full source-coverage task open until the owner approves that adaptation.
