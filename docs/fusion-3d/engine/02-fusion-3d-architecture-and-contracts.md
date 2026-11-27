# Fusion 3D architecture and contracts

Status: implementation design for the new Fusion homage. Existing behavior is described in `01-engine-baseline-and-gap-audit.md`. New defaults below are concrete instructions for isolated implementation and playtest; the responsible programme design/review gate records their accepted version before wider promotion. They do not require a fresh owner permission request for routine reversible work. Paths labelled **new** do not exist at the audit baseline. Workers must not mistake them for already available interfaces.

## Architectural decision

Keep the deterministic simulation and authoritative persistent-world service. Introduce a read-only presentation boundary and a genuine GPU 3D renderer; extend simulation contracts where elevation, bridges and additional series mechanics require them. Preserve native Classic and legacy Fusion profiles separately. No renderer, animation, particle, camera, audio or GPU physics result may determine authoritative game state.

Full 3D means real meshes with depth, authored materials, arbitrary supported camera heading, independently animated components, height-aware terrain and correct occlusion. It does not require a free-flight camera or physically simulated tank suspension. An RTS camera with restricted pitch and a useful default angle remains compatible with full 3D and improves command readability.

## Proposed module boundaries

| Module | Responsibility | Forbidden responsibilities |
| --- | --- | --- |
| Existing `packages/fusion` | Authoritative fixed-tick simulation; validated profile dispatch; compatibility adapters; deterministic map and bridge state | DOM, GPU objects, wall-clock decisions, asset loading, animation-driven damage |
| **New** `packages/fusion-view` | Serializable RenderFrame, semantic presentation events, visibility view and picking results; shared presentation types | Direct mutation of `Game`, database access, backend-specific scene objects |
| **New** `packages/fusion-renderer-3d` | Scene, cameras, meshes, materials, LOD, rigs, lighting, particles, fog display, resource disposal | Trust decisions, navigation outcomes, production completion, damage application |
| **New** `packages/content-schema` | Versioned source identity, capability refs, entity specs, adaptation records, presentation manifests and validation | Auto-filling unknown source facts with plausible defaults |
| **New** `packages/fusion/src/world-v2` | Surface graph, elevation, bridge spans and connectors, deterministic topology revisions | Changes to v1 map regeneration or silent conversion of old worlds |
| Existing `apps/web` | React shell, lobby, HUD, input mapping, settings, accessibility, session selection | Per-entity React rerenders every animation frame; hidden state authorization |
| Existing `apps/service/src/mmo` | Command validation, journal first authority, fences, save/migration tools, authorized state projection | Browser-renderer imports; unjournaled repairs, bridge damage or ownership changes |

These are boundaries, not permission for a big-bang rewrite. First extract testable seams, retain adapters and prove unchanged per-tick checksums for legacy fixtures. Move one simulation subsystem at a time only after its characterization fixture exists.

## Renderer choice and evidence gate

There is no incumbent GPU scene renderer in the audited dependency manifest. Benchmark **Three.js** and **Babylon.js** against the same small fixture and production build. Both remain viable; documentation cannot choose the winner for this workload.

The first candidate is Three.js because the project already owns its simulation, input and React shell and needs a presentation layer. The competing Babylon implementation tests whether its scene and animation facilities reduce integration complexity enough to justify its footprint. Do not add React Three Fiber or another scene framework during this comparison; that would introduce a third architectural variable.

Three.js documents a WebGPU renderer with a WebGL2 fallback and asynchronous initialization. Its instancing facilities batch objects sharing geometry/materials. Babylon maintains WebGL and WebGPU implementations and requires explicit engine selection/initialization. These facts justify the shortlist; they are not performance results. Sources: [Three WebGPU guide](https://threejs.org/manual/pages/webgpurenderer), [Three InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [Babylon WebGPU](https://doc.babylonjs.com/setup/support/webGPU/), [Babylon optimization guidance](https://doc.babylonjs.com/features/featuresDeepDive/scene/optimize_your_scene/).

Use the same glTF assets, scene, camera, lighting, texture sizes, animation coverage and visibility in both spikes. Include 256 mixed animated units, 64 buildings, one raised bridge with a ship below it, terrain, fog, selection, shadows and representative effects. These counts are **benchmark design targets**, not a capacity claim. Also run a 64-unit small scene and 1,024-unit stress scene. Record device model, OS, browser version, backend, resolution, DPR, temperature/warm-up conditions, asset bytes and commit.

Score correctness and supported-device coverage before throughput. Then compare P50/P95/P99 frame times, long tasks, cold load, bytes, renderer-managed memory accounting, scene teardown, context/device loss and code complexity. Select one backend/library in a reviewed ADR; pin exact package/decoder versions. No mixed Three/Babylon production scene. Both supported graphics backends must pass the same gameplay/view tests. WebGPU-only techniques cannot become a gameplay dependency.

## Time and coordinate contract

- Legacy simulation remains at 15 Hz and 256 leptons per cell. A profile may introduce different pacing only as an explicit rules version with fixture changes, never because a device renders at 30 or 60 Hz.
- Authoritative horizontal coordinates remain integer east/south axes. New elevation uses signed integer height leptons, 256 per cell; physical metres are an art scale convention, not a claim about source maps.
- Renderer coordinates are `X = east`, `Y = up`, `Z = south`, in cell units. Conversion is `X = simX / 256`, `Y = elevation / 256`, `Z = simY / 256`. glTF root orientation and authored forward axis must be normalized by the asset pipeline. Legacy forge coordinates swap their second and third axes; the conversion tool must explicitly correct triangle winding and normals.
- A frame carries previous and current tick transforms and a clamped interpolation fraction. Teleport, spawn, death, unload, ownership change and layer change are discontinuities; never interpolate through solid terrain, between ownership states or across the map after teleport.
- Visual particles and ambient variation use a separate seed/event identifier. They never consume the simulation RNG. A paused or absent renderer must leave the same checksum stream.
- Immutable entity identity is `{worldId, durableEntityId}` for persistent mode, using the globally unique durable asset/entity ID, and `{matchId, entityId}` for skirmish. Current `{regionId, localEntityId, authorityEpoch}` is a separate location/authority handle. Region handoff, bridge authority transfer, capture and reconnect must never change identity equality. Temporary GPU instance indices are not identities. Tests must prove selection, animation/event deduplication, ownership, cargo and persistence continuity when region/local handles change.

## RenderFrame contract

Introduce `RenderFrameV1` in **new** `packages/fusion-view/src/frame.ts`. It carries `schemaVersion`, session/profile identity, authoritative tick, simulation digest, presentation digest, visible surface revisions, camera-independent entity views, presentation events and locally permitted selection/action metadata.

An entity view contains stable identity, source definition ID, presentation key, permitted owner/team relation, previous/current transform, surface/layer, hull facing, turret facing, state tags, build/repair progress, health information permitted by the rules, and animation phase anchors. It contains no renderer class and no writable reference to `Game`, `Entity`, arrays or map buffers. Derive a fresh value or transfer ownership of a dedicated immutable copy; a TypeScript `readonly` annotation alone is not isolation.

Input returns a `PickResult`: surface ID, cell/lepton point, visible target identity and permitted action hints. UI constructs a validated gameplay command through the session. The server/simulation rechecks target ownership, terrain, visibility requirements, range and action legality. A hit test is never authorization.

Keep full-state legacy mode explicitly tagged `visibilityMode: legacy-full-sim`; a secure authoritative view uses `visibilityMode: server-filtered`. A renderer must not advertise the latter merely because it paints fog.

## Animation and event contract

Use glTF/GLB as the runtime interchange format. glTF stores mesh, material, skin and animation data; the application must define playback, transitions and semantics. This is why an animation state controller is required in addition to a loader. Sources: [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [Three animation system](https://threejs.org/manual/pages/animation-system.html), [Three GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html).

The simulation emits semantic events such as weapon fired, impact resolved, damage state changed, production started/completed, transport loaded/unloaded, capture completed, bridge state changed and structure sold. Event IDs contain session/epoch, tick, emitter identity and sequence. Replayed or duplicated network deliveries must not create duplicate audio/explosions. Seeking a replay reconstructs current visual state and bounded active effects without replaying the whole sound history.

Authoritative firing, damage and build completion occur at their simulation tick. Animation shows those events at the corresponding presented time. Footsteps, wheel roll, track scroll, rotor rotation, recoil, welding and debris are cosmetic. Art clips may expose muzzle/door/foot sockets and visual markers; no clip callback may issue an authoritative effect.

Each model declares required clips and components for its capability set. Idle, movement, turn, fire, reload/rearm, deploy/undeploy, load/unload, harvest/unload-resource, construction, repair, damaged state, sale and death are required where applicable. “Not applicable” requires a capability reason; missing clips cannot be marked as idle by default. Shared rigs are allowed only where proportions and silhouette remain correct. CPU skinning/animation update frequency and distant animation LOD are measured; do not assume ordinary rigid instancing batches arbitrary independent skeletons.

## Authoritative surfaces and elevation

**New** `MapV2` separates persistent topology from presentation decoration:

- Immutable identity: schema version, generator version, seed, source map ID, biome/material-set ID, dimensions and content digest.
- Height: integer ground and water heights; quantized slope and clearance classes needed by gameplay.
- Surfaces: stable `surfaceId`, cell coordinates, height, traversal tags, build policy, occupancy domain, cover/visibility metadata and owning bridge/structure where relevant.
- Connectors: deterministic transitions between surfaces, including ramps, shore entry, bridge endpoints and tunnel portals. Each has capability and width/clearance constraints.
- Mutable state: structure occupancy per surface, bridge-span health/state, destructible blocker state, resource changes, terrain mutation where a profile supports it and monotonic topology revision.
- Cosmetic data: foliage, material blend, detail noise and decorative debris. Cosmetic changes cannot alter connectivity.

Do not turn every decorative rock into a gameplay obstacle. Every blocking feature must have an authored or generated authoritative footprint and be visible enough to explain its effect. Pure water shaders cannot determine ship depth or bridge clearance.

Navigation nodes are `(surfaceId, cell)` rather than a cell alone. Stable ordering resolves ties by cost, heuristic, surface ID and cell index. A deterministic reservation phase prevents two heavy units acquiring the same narrow transition. Return structured route results: complete, reachable partial endpoint, temporarily blocked, no route, budget exhausted. Existing `findPath` silently returns the closest reachable path; new command UX must distinguish that result from a route to the requested destination.

Persist topology revision and invalidate affected routes on destruction/repair. An invalidated route cannot continue walking over a removed deck for one extra frame or wait forever on a permanently unreachable goal. Replanning has a deterministic per-tick budget; exceeding it queues work with a visible waiting state rather than blocking the main tick.

## Bridge system contract

The world/art specification defines the visual and gameplay policy. The engine representation must support it without hardcoded art assumptions.

A bridge contains stable bridge ID; ordered spans; endpoint and repair-terminal IDs; deck surfaces; underpass clearance; capacity/width; hit points and armour; allowed damage/repair actions; current state; topology revision; damage/repair event journal links. A span has its own ID so a multi-span bridge can lose one section without losing every section automatically.

Use the canonical `fusion-bridge-v1` contract in `world-art/02_terrain_and_bridges_contract.md`. Persistent span states are `intact`, `damaged`, `destroyed` and `rebuilding`; there is no durable `collapsing` state in this first profile. The damage event that reduces HP to zero removes traversable deck edges/reservations and resolves supported occupants in the same authoritative tick, then emits a cosmetic collapse event. Debris/clip duration never delays the gameplay transition. State thresholds and later structural variants remain versioned rules. Naval access below an intact bridge depends on clearance; its open water surface remains a distinct path.

At the authoritative destruction tick the simulation processes occupants in stable immutable identity order and applies the existing damage/protection policy first. Vulnerable supported non-air entities receive lethal environmental damage through the ordinary damage/death path. Protected entities and protected cargo use the precise durable entry-bank refuge reservation and support-loss relocation protocol in `world-art/02_terrain_and_bridges_contract.md`: preserve the same IDs, HP, owner, inventory, cargo, bound/recovery flags and protection generation; grant no replacement army or credits. Protected admission or a new protection/cargo action on a deck must first obtain its valid reservation, with zero partial mutation if unavailable. A violated refuge invariant retains a fenced `RECOVERY_REQUIRED` record and must be recovered losslessly before promotion. Ships below and aircraft above are unaffected by ordinary collapse. Amphibious survival for otherwise vulnerable entities is a separately versioned future capability. Infrastructure corridors prevent shields, new settlements and ordinary base placement from occupying bridge/approaches/huts/shipping channels, but that exclusion alone never overrides travelling protected MCVs or cargo. Never assign HP directly, force a quiet kill, choose an arbitrary fallback cell, duplicate a protected child or bypass normal death accounting.

Repair is an authorized command on a bridge terminal/span, with cost, time, reachability, ownership/neutral access and enemy contest policy in the rules profile. An engineer must reach a valid interaction surface. Rebuilding must not materialize a deck through occupying boats/aircraft or displace protected units arbitrarily. Revalidate placement at the commit tick; if blocked, pause or reject with an explicit reason according to policy. Duplicate requests consume no additional engineer or credits. A disconnect, restart or region transfer cannot reset progress or allow a free rebuild.

The first bridge implementation lives wholly inside one authoritative region. A bridge crossing region boundaries remains non-authorable until an explicit seam-ownership protocol is tested; otherwise two region authorities could disagree about collapse. This is a deliberate authoring constraint on the first release, not a permanent omission from the world roadmap. ENG-045 supplies the cross-region authority/transfer/clearance protocol and its failure-injection evidence; whole-programme qualification includes it.

## Gameplay policies and capability system

Avoid a single universal rule that flattens the series. Separate construction policy, economy policy, production policy, technology progression, movement capability, weapon behavior, ability behavior and presentation metadata. A reference profile preserves the researched source behavior; an homage profile references that behavior and records a deliberate adaptation when needed.

Examples that must remain distinct include sidebar placement versus dozer construction; mobile deployed production versus permanent factories; free-roaming resource fields versus fixed ore nodes; credits versus command-point systems; permanent versus timed mind control; infantry slots versus vehicle cargo; submerged movement versus a transparent ship model; and a scripted teleport versus high-speed movement.

Every ability is registered by stable capability ID and version. Registration includes state schema, admissible commands, prerequisite conditions, resource cost, tick order, target filters, interruption rules, save representation, checksum coverage, presentation events and contract fixtures. Unknown capability IDs fail validation and block a pack. No fallback to an unarmed generic tank, ordinary infantry or an empty ability is permitted in a release pack.

The first runtime capability clusters are construction/economy, production/upgrades, occupation/cargo, control/detection/powers and multi-mode entities. Each cluster task must instantiate a separate subtask for any concrete capability not already bounded by an approved fixture. The historian's per-faction/era entity dossiers supply exact values and semantics. Engine workers do not invent those values to keep a task moving.

## Save, replay and protocol migration

Freeze v1 decoding and generation behavior. New saves use a new explicit version; they contain profile version, simulation artifact digest, rules digest, source content digest, map generator version, authoritative map/surface state, bridge state, RNG state, tick, pending commands, persistent identity and event cursor. Render resources are not serialized into authoritative snapshots.

Add deterministic `v1 → v2` conversion only for a documented subset. A legacy single-surface map can become a single-ground-surface v2 map while retaining exact current terrain/resources/occupancy. It does not gain bridges, height advantages or new economy rules retroactively. Unsupported profile conversion returns a report with reasons and leaves the original untouched. Test both state invariants and replay equivalence for the supported interval. Archive the original bytes and pinned runtime needed to read them.

Maintain distinct digests for simulation behavior, content/rules and presentation. A new mesh may change the presentation digest without rewriting historical simulation provenance. A changed damage table or generator must change the authoritative digest. Existing v1 fingerprints retain their current interpretation; migration records connect old and new provenance. Never stamp a previously null fingerprint with the current hash as if historical provenance were known.

Protocol handshakes negotiate exact simulation/profile/map and view-schema versions before commands are accepted. A mixed client/server version returns a clear supported-version response. Migrations are side-by-side: snapshot and journal copies are restored into an isolated world, validation runs, then a selected test world is cut over. Cutover has a documented write fence and last committed event cursor. Restoring the old artifact and backup is valid only while no newer player write has been admitted, or when a tested reverse migration/journal-tail translation preserves every committed newer action. Once new-version gameplay has committed, never blindly restore an older backup. Use validated lossless reverse migration or forward recovery; a genuinely unavoidable data-loss decision requires explicit owner authority and cannot be hidden in a routine rollback. Rehearse with real post-cutover move/build/spend/capture/transfer commands and prove exact asset, balance, ownership and journal conservation. Redeploying old JavaScript alone is insufficient for an incompatible schema.

## Persistent multiplayer and hidden-state security

Legacy persistent clients currently receive full state. Preserve that fact in diagnostics and public capability claims until secure projection is implemented. Adding 3D must not enlarge the exposed account/private metadata, but the renderer cannot fix the already exposed enemy state.

The new secure authoritative protocol sends only the recipient's permitted current and last-known entity views, visible map mutations and authorized events. The browser presents these views; it does not re-run a full hidden-world simulation. Cosmetic interpolation and locally acknowledged selection remain client side. Own-command prediction, if added later, must not infer hidden enemies and must reconcile to server authority. Server validation covers attacks on unseen targets, formation orders across restricted shields, bridge actions, ownership, alliance consent and asset identity.

This requires a reviewed amendment to ADR014's earlier suggestion that fog filtering could be only a configuration layer. A complete locally replicated simulation and hidden-state protection are incompatible without changing what is replicated or trusting the client. Keep Classic lockstep and legacy beta compatibility separate from secure persistent mode.

MMO rules that remain mandatory during the upgrade include explicit one-use allied engineer consent tied to current ownership generation; enemy capture only when permitted and unshielded; no entry into a shielded offline compound even with consent; already stationed permitted allies remaining protected; no outward fire/exploit path through shields; starter/recovery bindings; lossless packing state; superweapon charge rules; transport protection; idempotent barter and cross-region transfers; and journal/fence consistency. Source-of-truth precedence is the latest approved owner requirement and current COMRADE19/20 decisions, not an older conflicting note.

Hibernation must account for new simulation activity. Active bridge repair, moving occupants, timed effects, pending topology transitions, combat and inbound arrivals can make a region non-quiescent. Cosmetic collapse/debris alone cannot keep a region ticking. A changed hibernation predicate needs exact resumed-versus-uninterrupted comparisons. Preserve lease renewal/yielding in long catch-up, introduced in the audited latest commit.

## Performance and delivery budgets

The following are provisional acceptance targets to ratify with measured hardware in ENG-009; they are not existing results or promises of supported player counts.

| Metric | Desktop target | Mid-range mobile target | Measurement rule |
| --- | --- | --- | --- |
| Normal-scene frame time | P95 ≤16.7 ms, P99 ≤33.3 ms | P95 ≤33.3 ms, P99 ≤50 ms | 256 mixed units/64 buildings, 10-minute run after warm-up, documented camera path |
| Authoritative 15 Hz tick | P95 ≤12 ms, P99 ≤25 ms | Browser legacy sim measured separately | Server hardware recorded; no tick may hide unbounded pathfinding/asset work |
| Input feedback | Local selection/order marker ≤100 ms P95 | ≤150 ms P95 | Does not promise network-confirmed action in this time |
| Cold interactive load | ≤10 s at controlled 20 Mbps | ≤15 s at controlled 10 Mbps | First playable slice only; all-faction preload forbidden |
| Initial required download | ≤20 MiB compressed | ≤12 MiB on low preset | Detailed budget allocation from selected slice, lazy pack downloads |
| Long-run resource growth | No monotonic growth after repeated load/unload cycles | Same | Renderer resource counters and available browser telemetry; no invented GPU memory number |

Use actual Android Chromium and iOS Safari devices, plus desktop Chromium/Firefox/WebKit coverage where supported. Browser automation emulation is useful for layout but cannot substitute for real mobile GPU/thermal measurements. Pin the device set and test the lowest intended supported device; do not redefine the baseline after failure without a product decision.

Tune by reducing shadows, particle counts, texture resolution, offscreen animation work and render resolution. Preserve readable silhouettes, all gameplay-significant animation states, fog boundaries and command controls. Simulation accuracy and entity existence never change with quality preset. Instanced far silhouettes remain genuine 3D; any impostor use must preserve the product's visual contract and never substitute for required close-view models.

## Required end-to-end evidence

The first finished slice uses two researched opposed factions, one complete build progression per side, an economy loop, distinct infantry/vehicle/air/naval roles, one destructible/rebuildable elevated bridge, a ship passing underneath, readable combat, all required animations, fog, sound, keyboard/mouse and touch controls. It runs as a local skirmish and a synchronized Fusion match. Persistent beta tests then use the same content under a separate world profile with snapshot/restart and protection/consent fixtures.

The review package contains a short real-time captured playthrough, fixed-angle stills at normal play zoom, a command journal, per-tick checksum report where applicable, animation coverage, content coverage, navigation debug overlay, device performance report and failure-case results. A cinematic orbit alone is insufficient; a passing simulation suite alone is insufficient.

Before any claim of multiplayer readiness, client A must issue a unique order that client B observes, client B must independently issue a different order observed by A, both must apply contested actions in the same order, and disconnect/rejoin must converge. Native Classic modes require their own synchronized-order evidence and remain a separate existing backlog until it exists.

## Specialist handoff rules

Every worker opens only its leaf task, mandatory contracts, referenced evidence and exact dependencies. It first confirms the current commit and file lease. It records assumptions, implements the bounded change, runs the specified relevant gate, and submits an evidence bundle for an independent reviewer. It does not claim complete by changing a status, disabling a test or creating a stub.

When a capability needs more detail than the leaf permits, the worker stops that leaf at a typed `BLOCKED_SPEC` finding and asks the orchestrator to instantiate the specified bounded subtasks. Other independent tasks continue. The orchestrator owns decisions, integration order and shared schemas; it cannot let two workers edit `game.ts`, `rules.ts`, map schemas or protocol contracts simultaneously.

No deployment, save migration, asset release or branch merge is implied by completion of this planning document. Implementation agents follow the owner's standing authorization and the repository's actual execution gates; they never claim an irreversible migration is a routine renderer change.
