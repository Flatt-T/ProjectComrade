# Fusion battlefield experience and quality gates

Status: proposed Fusion 3D acceptance specification, 18 November 2026. Numeric targets below are initial engineering targets to be measured and ratified at the representative-battle gate. They are not claims of current performance or promises of a particular MMO population.

## What the player must feel

The game must communicate a functioning base, an exposed economy, distinct military doctrines, useful terrain, meaningful technology progression and immediate command response. A recognisable tank mesh does not restore that experience if it glides without weight, fires through its own turret, ignores the bridge it appears to occupy, receives orders ambiguously, or plays the same sound as every other unit.

The review has two independent tracks. Mechanical evidence establishes legal orders, timing, costs, counters, pathing, information and state transitions. Presentation evidence establishes silhouette, animation, camera, material, sound, effects, legibility and command feedback. An impressive video cannot excuse broken mechanics; passing unit tests cannot certify presentation quality. Both must pass each scenario.

## Camera and framing

Use a tactical camera with perspective and optional orthographic-style framing within the selected real-time 3D renderer. The architecture spike selects the default projection by comparing the same scene. The initial design target is a moderately elevated view that reads footprints and heights together, with a bounded zoom range and a quick return to a canonical orientation. Free cinematic camera movement is confined to spectator/replay tooling or an explicit setting.

The camera must pan, zoom and optionally rotate without changing simulation coordinates or issuing an order. Zoom anchors at the pointer or gesture centre. Rotation maintains intuitive world-space movement and minimap orientation. A map-edge clamp respects the visible frustum, not only the camera centre. Tall buildings and cliffs cannot conceal a player's own selected units; use occlusion fade or an outline that still respects enemy visibility permissions.

At the closest supported zoom, meshes, articulated parts, material edges, construction and damage states must hold up. At normal play zoom, role and allegiance dominate detail. At maximum tactical zoom, stable silhouettes, markers and command indicators remain interpretable. Do not solve distant readability by exposing units outside fog or by scaling some factions' silhouettes so much that footprints become misleading.

## Input and orders

Preserve established desktop controls and hotkeys unless an explicit UI design change is approved. Mouse and touch map to a shared semantic command layer. The UI decides the intended command, the server validates it, and the renderer displays accepted/rejected feedback. Picking uses authoritative entity IDs and allowed surfaces; mesh hit geometry is only a selection aid.

For touch, distinguish tap-select, context order, pan, pinch, long-press preview and multi-select. A pinch that begins on a building must not sell it or place a structure. Gesture arbitration is a finite-state machine with cancellation and pointer-capture rules. Add explicit order mode buttons where the context would otherwise be ambiguous. Gesture-only access cannot be the sole route to a critical action.

Selection must handle units under bridge decks, crowded exits, aircraft over ground units, multiple owned units and a repair hut near a ship. Use a deterministic priority policy with a visible chooser for ambiguous projected targets. Selection never chooses an invisible enemy. A player can inspect a known neutral bridge without accidentally ordering an Engineer to capture a nearby ally's building.

Building placement shows the true footprint, valid/invalid cells, height/ground requirement, approach clearance and reason for failure. The visual model cannot hang over a cliff in a way that disguises an illegal foundation. Production exits and rally points are clear, and rally markers survive camera changes. Sell, pack, capture consent and other destructive/strategic actions retain existing safeguards and authoritative rules.

## HUD information contract

Keep the player's resources, income state where supported, power/capacity, production queues, selected-unit abilities, minimap/radar state, alerts and match/world status visible without covering the battlefield. Use collapsible detail panels for statistics rather than permanent labels over every unit.

The existing persistent-world owner and Ally/Foe labels are a preserved feature, not a new blank-slate task. At the audited commit, `packages/fusion/src/render.ts` contains owner-label visibility gating, proximity behavior and label collision handling. Reuse that policy through the new adapter and add 3D occlusion handling without changing who is entitled to see which identity. [Existing renderer](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/render.ts).

Each actionable status has a visual/text cue: low power, production blocked, insufficient credits, full transport, invalid terrain, out of range, disabled weapon, rearming, repair unavailable, ownership protection, ungranted allied capture consent, bridge closed, bridge rebuilding and region resynchronisation. A rejected command must not appear to be succeeding because an animation started optimistically.

Keep observed live information separate from last-known information. A fogged building may retain an approved last-known visual, but current health, production, owner change, superweapon charge, repair work, sound and shadows cannot update through that memory. Minimap, camera centring, selection boxes, tooltips and screen-reader descriptions use the same visibility decision.

Presentation concealment and network confidentiality are different gates. The first G4 battle may use the existing full-state/lockstep transport while verifying that RenderFrame/HUD presentation respects the viewer. That does not make hidden state secure from a modified client. Persistent release qualification separately requires ENG-039's server-filtered protocol and adversarial wire inspection through UX-007/ENG-042. Do not claim a renderer fog pass secures a full-simulation client.

## Accessibility and player control

Use shape, text, icon and pattern together with team colors. Supply a color-vision palette and test every faction against every terrain family at normal zoom. Give selected/hovered/focused states distinct outlines and readable labels. The project target for normal HUD text is 4.5:1 contrast, and meaningful non-text controls/indicators 3:1, consistent with W3C guidance. Touch UI targets should generally be 44 CSS pixels or larger; do not mislabel that product target as the WCAG 2.2 AA minimum, which is 24 CSS pixels with stated exceptions. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast), [WCAG 2.2 target size](https://www.w3.org/TR/WCAG22/#target-size-minimum).

Support UI scale, subtitle/caption size, independent speech/music/effects levels, mute, reduced motion, reduced flashing, shake off, and key rebinding where the existing controls permit it. Important alerts have visible equivalents. Full screen-reader equivalence for a real-time battlefield is a separate design problem; do not claim complete accessibility from labeled buttons alone. Menus, settings, production and selected-unit actions must be keyboard usable with a visible focus state.

User settings do not change competitive information. A reduced-effects option cannot remove a hostile area-of-effect boundary or a crucial charge-up warning. A contrast option cannot reveal stealth entities. A low-volume setting cannot reduce the authoritative reaction time of units; all audio is presentation.

## Audio direction and runtime

Build a sound vocabulary by faction and mechanic. Infantry acknowledgement, mechanical movement, turret recoil, projectile flight, impact material, building machinery, resource loading, electric energy, psychic effects, naval motion and construction have distinct signatures. Share technical processing and source libraries where rights permit, while preserving identifiable weapon and role differences.

Each asset record lists selection, move, attack, unable, ready, damage, ability, destruction and specialist work sounds as applicable. The sound designer defines variant pools, priority, repetition limits, volume range, spatial behavior and caption text. Faction ambience must support the visual identity without burying warnings. New voice lines and music must be original or properly licensed; copying familiar source-game lines is not the default production method.

Use event IDs and a bounded deduplication policy so reconnects, resimulation and repeated snapshots do not replay explosions or unit acknowledgements. Coalesce mass-selection responses into a bounded number of voices. Limit simultaneous engines and weapons by audible relevance, distance and priority. A rejected command sound is different from an accepted order response. Essential strategic alerts outrank ambience and avoid unbounded repetition.

The browser audio context must start or resume following a permitted user interaction, and controls must expose mute/volume. MDN documents autoplay restrictions and the distinction between streamed long tracks and buffered short sounds. [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices).

Audio obeys visibility policy. A hidden unit's engine, weapon charging, production completion or repair work must not reveal its exact position unless the rules explicitly grant audible information. The default Fusion proposal uses visible/audible-event entitlements from the server, not client distance to all enemy objects. Spectator audio uses the spectator's own entitlement rules.

## VFX readability and material response

Make an effect readable by source, target, duration and outcome. The ground marker for a dangerous area is tied to the authoritative area, not a prettier larger texture. Projectile count and impact timing must reflect actual bursts. Cheap detail modes can reduce sparks, smoke subdivisions, secondary lights and fragments while keeping the warning, shot and impact envelope.

Effects expose no hidden entities through light, reflections, shadows, particles or sound. The camera and minimap never centre on a hidden effect's true position just because the renderer knows it. On a bridge, place muzzle, tracer, impact and selection ring at the correct surface height; water splash belongs below the deck only when the authoritative impact is in water.

Terrain reactions are classified. Track marks, footprints and scorch marks are cosmetic unless explicitly persisted for gameplay. Destructible buildings, bridge collapse, resource depletion, civilian garrison clearing and blocking wrecks are authoritative. The same class is used across rendering, save/replay and physics/debug views.

## Initial benchmark and resource targets

The representative-battle spike must name exact tested hardware, OS, browser version, viewport, device-pixel ratio, graphics backend, quality setting, power state and asset revision. Test at least one integrated-GPU desktop/laptop, one current Android device, one constrained Android device, and an iOS/Safari device if iOS is a launch target. A desktop browser with CPU throttling is not proof of mobile GPU behavior.

| Measure | Desktop target | Mobile target | Required evidence |
| --- | --- | --- | --- |
| Sustained ordinary battle | 60 FPS target; frame p95 <=16.7 ms and p99 <=33.3 ms | 30 FPS baseline; p95 <=33.3 ms and p99 <=50 ms | Common ENG-009 fixture: 256 mixed units and 64 buildings for 10 minutes after warmup; no average-FPS-only pass |
| Soak | 20-minute scripted battle plus camera traversal | Same, including sustained device temperature/load | Start/end performance and memory trend; thermal degradation noted |
| Stress scene proposal | 1,000 visible mixed units, 300 structures, 10,000 instanced props | 300 visible mixed units, 100 structures, 3,000 props | Distribution includes rigs, turrets, naval, aircraft, shadows and active effects |
| CPU presentation slice | p95 <=8 ms on selected desktop reference | p95 <=12 ms on selected mobile reference | Separate sim, network, UI, animation, culling and render submission |
| Draw submission proposal | <=300 ordinary-battle draws, exceptions measured | <=150 ordinary-battle draws, exceptions measured | Renderer statistics and measured scene; no fake empty scene |
| Estimated GPU resource budget | <=512 MiB initial target | <=192 MiB initial target | Accounting of textures, geometry, buffers and render targets, not an unavailable portable VRAM query |
| First representative-battle assets | <=20 MiB compressed total required download, with progress | <=12 MiB compressed total required download on low preset, with progress | Cold cache bytes, per-pack breakdown and usable-ready time; shared with ENG-009 |
| Input feedback | Local selection/command acknowledgement presentation within 100 ms p95 when main thread is responsive | <=150 ms p95 | Pointer timestamp to visible feedback; server acceptance measured separately |

These workloads are presentation benchmarks, not concurrent player guarantees. The engine workstream defines server tick and regional capacity gates. If the target fails, change measured budgets, LOD, batching, content density or quality policy with an explicit decision; do not quietly reduce the full roster or stop testing animation.

MDN advises conservative GPU-resource accounting, graphics settings, prompt resource disposal, handling context loss and batching work. Those are relevant requirements for a long-lived browser battlefield; there is no portable WebGL API that simply reports the device's full VRAM budget. [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

Instancing must be chosen per object lifecycle. Static vegetation and repeated debris differ from skinned, stateful units. Babylon's official documentation, for example, describes thin-instance group culling and lifecycle tradeoffs; that is evidence to measure batching rather than assume one batching method suits every scene. The chosen renderer may use a different implementation with equivalent measurements. [Babylon thin instances](https://doc.babylonjs.com/features/featuresDeepDive/mesh/copies/thinInstances/).

## Loading, streaming and failure behavior

Ship a content manifest with hashes and explicit compatibility versions. Split common UI/material/shader resources from faction, biome, unit and high-detail bundles. A world containing many factions cannot download every close-detail texture before becoming usable. Every visible item therefore needs an accepted low-detail representation in the critical bundle or a documented readiness gate before it enters the view. An unverified generic fallback cannot satisfy the full-content gate.

Use publicly permitted pack manifests or currently visible entity information for predictive loading. Do not reveal a hidden opponent's unique unit type through an asset request. Cache by immutable hash and validate corrupted/missing responses. Surface a clear download/retry state when essential assets fail, with the existing world state preserved.

A reconnect, tab resume, orientation change, browser GPU context loss or graphics-backend failure must rebuild presentation from the authoritative snapshot without creating gameplay events. Dispose old meshes, textures, buffers, event handlers and audio nodes. Repeat enter/leave/quality-switch/reconnect cycles in the resource test; bounded caching needs an explicit eviction policy.

## Experience review scenes

Each scenario is a deterministic map/seed/command fixture with a narrated human-review checklist, a bounded capture and simulation assertions. Use current rights-cleared assets. Do not call scripted cinematic shots a playable-quality pass.

| Scene | Required experience | Mechanical and presentation checks |
| --- | --- | --- |
| E01 First base | Deploy, power, refinery, barracks, first unit, queue and exit | Real build order and costs; construction staging; exit clearance; alert rhythm |
| E02 Harvest route under threat | Harvester leaves, works, returns, unloads; raid interrupts | Route/targeting and income timing; harvesting/unload animation; readable distress |
| E03 Faction contrast | Equal-role forces from at least three distinct families | Tactical differences and counters; silhouettes, locomotion, weapons and sound distinguish without labels |
| E04 Combined arms | Infantry, tanks, artillery, AA, aircraft and repair | Target restrictions; turret/weapon alignment; line of sight; role readability |
| E05 Bridge choke | Tank over ship, collapse, reroute, Engineer rebuild, crossing restored | Entire bridge matrix and shared topology transaction; no decorative shortcut |
| E06 Amphibious operation | Beach transition, landing/transport unloading, naval support | Legal forms and occupancy; smooth transitions, waterlines, wakes and shore cues |
| E07 Transform/deploy | At least one walker/aircraft or alternate-mode unit | Ability restrictions/cooldown and interruption; complete transition and pose states |
| E08 Base under attack | Damage, low power, repair, production blocked, sell/pack | Correct economy/state; legible urgency, damage and teardown cues |
| E09 Capture and ownership | Enemy capture when legal; allied consent; shield denial | Existing persistent rules preserved; owner labels and colors update once, no identity leakage |
| E10 Terrain expedition | Same force crosses temperate, arid, cold, urban and contaminated test maps | Surface/nav validity; distinct kits, visibility and readable team identity |
| E11 Superweapon/status | Charge, warning, fire, impact, cooldown, disable/recover | Actual affected area/ticks; warning remains clear on low detail and without audio |
| E12 Restore and adverse network | Resume persistent settlement mid-action, reconnect and region restart | No duplicate effects, charges or units; correct remaining bridge/production state |
| E13 Mobile crowded battle | Repeated select/order/pan/pinch, multi-select and bridge-layer choice | No ghost orders, HUD covers no essential controls, target chooser and cancel work |
| E14 Fog and stealth | Visible, remembered, invisible, detected, disguised and spectator cases | No leakage via effects, shadows, audio, labels, picking, minimap or streaming |

The final gallery contains those scenes across every biome kit and each unique mechanic/animation family, plus per-entity proofs from the content pipeline. The review records a clear failure for placeholder silhouettes, missing clips, floating wheels/feet, wrong fire sockets, generic effects, unreadable ownership, broken path choices or incongruent audio.

## Review rubric and release gate

Score silhouette/role recognition, motion/weight, environment coherence, command feedback, information readability, audio identity and battle pacing on a documented 1–5 rubric. A score of 1 means missing/broken; 3 means functional with obvious placeholder or clarity defects; 5 means polished and consistent at play speed. Proposed pass is at least 4 in every category with no blocker; the owner can amend it after reviewing the first battle. Numerical scoring supplements written evidence, it does not pretend to objectively measure artistic taste.

Independent review must include a gameplay specialist and a presentation specialist. For each failure, provide exact scene, camera, entity ID, tick/time, expected and observed result, image/clip and an owning task. The supervisor cannot close the work merely because the contributing agent reports success. The final review proves the full inventory, not just E01–E05.
