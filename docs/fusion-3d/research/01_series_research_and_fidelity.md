# Command and Conquer series research and Fusion fidelity contract

Research date: 18 November 2026. This work defines how Project COMRADE will research and realise a complete, full 3D homage while preserving the existing Classic contracts. It is a researched programme with explicit closure gates. It is not a claim that the entire franchise has already been reverse specified or that all existing catalogue entries have working source-faithful behaviour.

## The central design finding

The requested improvement has three inseparable parts: recognisable content, distinctive behaviour, and convincing presentation. A named tank with a recoloured generic mesh cannot establish faction completeness. A beautiful model with generic movement, firing, economy and production cannot establish game fidelity. Every included entity needs a documented role, its source-edition behaviour, a deliberate Fusion adaptation, a finished visual and animation set, and evidence that the result works in an actual battle.

The series does not have one universal construction system, resource system, unit-control model or victory condition. The sources show, for example, conventional base construction and harvesting in Tiberium Wars, water-focused warfare and transforming Empire units in Red Alert 3, and class-based mobile Crawlers with command points in Tiberian Twilight. These must become explicit capabilities and ruleset decisions. A shared engine can serve them; a single generic tank/harvester/building implementation cannot silently stand in for them. [SRC-15](source_register.md#src-15-tiberium-wars-manual), [SRC-23](source_register.md#src-23-ra3-publisher-steam-listing), [SRC-19](source_register.md#src-19-tiberian-twilight-manual).

### Product contracts

1. **Classic:** retain each already agreed source-game fidelity contract, edition, networking behaviour and save boundary. The new homage must not overwrite those profiles.
2. **Fusion source reference profiles:** preserve measured facts under namespaced edition IDs. They exist to explain where the design came from and permit fidelity comparisons.
3. **Fusion unified homage:** provide deliberately authored cross-era interoperability, while retaining each faction's role and signature mechanics. Every changed cost, build time, weapon rule, production rule, technology dependency or identity requires an adaptation record.
4. **Persistent world:** preserve the user's agreed persistence, shielding, alliance and trade rules. Those world rules take precedence over imported single-match mechanics where the rules conflict. Preserve consent for allied Engineer capture, enemy capture only when allowed by shield state, no new entry into an offline protected base, and protection for allies already stationed inside as previously specified.
5. **Content coverage:** researching a franchise entry is mandatory; adopting its entire game mode is a separate explicit decision. The user asked for the units, buildings, terrain and essence of the whole series. A FPS or mobile game's unique objects cannot silently disappear, but its unrelated account economy or direct-control mode must not be introduced without a design disposition.

## Evidence actually established in this planning session

The official EA collection establishes the main RTS families and their expansions. The official 2025 release provides recovered source for TD, RA1, Renegade and Generals/Zero Hour, plus a separate modding-support repository for later games. The source release does not make all retail models, voices, music, videos or branding freely reusable. The modding-support repository's additional terms explicitly retain trademark/publicity restrictions. Treat source/code licensing, art permissions, sound permissions and marketing naming as separate records. [SRC-01](source_register.md#src-01-ea-ultimate-collection-release-inventory), [SRC-02](source_register.md#src-02-ea-2025-source-and-workshop-announcement), [SRC-05](source_register.md#src-05-ea-modding-support-additional-terms).

The research inspected nine TD/RA1 type-definition files and produced **262 source-definition candidates**: 113 in TD and 149 in RA1. They include structures, infantry, ground units, aircraft and vessels, with civilians, campaign-only, conditional and unused records. This is not a count of playable units. See `primary_definition_candidates.json`.

The official later-era XML trees were enumerated without truncation:

| Source tree | All XML file paths | Faction-related XML paths | Paths under Units, Structures or Crawlers |
| --- | ---: | ---: | ---: |
| Tiberium Wars | 2,768 | 374 | 189 |
| Kane's Wrath | 3,930 | 963 | 605 |
| Red Alert 3 | 6,512 | 443 | 137 |
| Uprising | 7,113 | 669 | 155 |
| Tiberian Twilight | 5,725 | 329 | 151 |

These are **file-path counts**, not logical-object or playable-roster counts. A file may define support effects, include multiple objects, inherit another entity, or never ship. The 2,778 faction-related paths, file sizes, blob hashes and exact repository URLs are in `later_era_primary_path_inventory.json`. A second-stage parser and retail reconciliation are still required. [SRC-04](source_register.md#src-04-ea-modding-support-repository-and-licence).

Pinned official-source commits:

| Repository | Commit |
| --- | --- |
| electronicarts/CnC_Tiberian_Dawn | e0d372dc582c053a699114942b984dad0457f9b3 |
| electronicarts/CnC_Red_Alert | 0dc09bb1d6188d1ec79ab4765b22a48b75ffee32 |
| electronicarts/CnC_Generals_Zero_Hour | 0a05454d8574207440a5fb15241b98ad0b435590 |
| electronicarts/CnC_Modding_Support | 3aad8e412961ab543192ae70f8503dc8e178e095 |

These are source snapshots observed today; they are not proof that the current Steam executable exactly matches that code. Reference researchers must record executable/asset hashes, patch, platform and language before using measured values as the authority.

## The supplied documentary

The supplied link resolves to video ID `BYlEgGHx4II`. Direct retrieval of both the shortened URL and YouTube watch/oEmbed endpoints failed. A community page links the same ID, but it does not establish a reliable title, channel, transcript or sequence of examples. No timestamp or claim in this programme is attributed to unseen footage. [SRC-32](source_register.md#src-32-user-supplied-documentary), [SRC-33](source_register.md#src-33-documentary-link-corroboration).

RES-002 is a finite evidence task: obtain lawful playback or a user-provided transcript, record title/channel/date/duration, separate gameplay from cinematics/mod footage, and create a timestamped lesson register. Every clip must identify game, edition, likely mod status, shown mechanic, presentation lesson and proposed Fusion acceptance scene. Its current status is **blocked on media access**, not “watched.” Other source-based work can continue. No agent may substitute a different documentary without recording that substitution.

## Series and faction coverage

The machine-readable coverage ledger is `era_faction_matrix.json`. Its terrain entries are research candidates until verified against shipped assets and maps. Its group lists establish the minimum research coverage; they do not assert that every group had a complete playable tech tree in the original.

### Tiberian Dawn and The Covert Operations

Research GDI and the Brotherhood of Nod separately, including their producer/air-delivery differences, economic pressure, ground/air roles, support weapons, infrastructure and upgrade dependencies. Track all civilian structures and infantry, mission-only units, special creatures and console-edition deltas. The official source's type declarations are an especially useful initial census, but production legality and compile-time gates must be checked. TD source also declares a Jungle theatre; this is a source-only candidate until shipped map and asset evidence establishes its status. Do not turn an enum into a claim that a complete retail theatre existed. [SRC-06](source_register.md#src-06-td-official-recovered-definitions), [SRC-37](source_register.md#src-37-td-theatre-declarations).

Identity questions for the specialist: how a light fast force differs from an armoured force; how infantry density, crushing and suppression alter engagements; how limited aircraft sorties change timing; how a resource convoy and vulnerable production building create attack opportunities. Give every answer a measured scenario, not a paragraph of lore.

### Red Alert, Counterstrike and The Aftermath

Cover Allied/Soviet forces, the active country selections, campaign-house variants, naval and submarine units, aircraft, defensive systems, spies, mines, support powers, expansion additions and ant-mission entities. Keep source-declared but inactive objects, including conditional vessels, outside the shipped denominator until verified. The official source distinguishes temperate, snow and interior theatres. Its engineer code contains health-sensitive damage/capture behaviour under build flags; the research must record the active version instead of importing RA2 assumptions. [SRC-07](source_register.md#src-07-ra1-official-recovered-definitions), [SRC-35](source_register.md#src-35-ra1-engineer-behavior), [SRC-38](source_register.md#src-38-ra1-theatre-declarations).

Important research outcomes are naval reach, submarine detection, placement pressure, timing of support powers, service/rearm patterns and bridge chokepoints. Retaliation is handled as a console delta, with each unique item accounted for.

### Tiberian Sun and Firestorm

GDI and Nod remain separate full research rosters. Forgotten characters, mutants and creatures need explicit campaign/neutral/adaptation records. Firestorm's CABAL forces need a complete campaign census; a new balanced CABAL faction would be an authored Fusion design, not a falsely attributed original multiplayer tech tree.

The Tiberian Sun manual directly describes Engineers restoring damaged and missing bridge sections through repair huts. It also distinguishes side-specific forces and repair/capture roles. The Firestorm manual lead adds mutated environments and environmental events that must be verified against its scan and executable. These are important candidates for a world that feels alive, but exact damage, propagation, day/night and weather behaviour is not yet measured here. [SRC-09](source_register.md#src-09-tiberian-sun-manual), [SRC-10](source_register.md#src-10-firestorm-manual).

Specialist questions: underground pathing and emergence, pavement implications, walker stance and weapon arcs, artillery deployment, EMP state and recovery, stealth-field visibility, gates and protective barriers, Tiberium damage versus healing, vein/lifeform interactions, terrain height, tunnels, ice and destructive terrain. Each uncertain feature has to remain an evidence task until reproduced.

### Red Alert 2 and Yuri's Revenge

The initial faction/country denominator includes America, France, Germany, Great Britain and Korea for the Allies, and Russia, Cuba, Libya and Iraq for the Soviets. Each shared unit needs country-eligibility records; each exclusive unit or structure needs its own entity identity. Yuri's Revenge adds Yuri as a full side, while changing and expanding inherited rosters. Do not mistake the original game's Yuri infantry for a complete Yuri faction.

The manuals support Engineer bridge repair, civilian garrisons, and distinct Yuri structures and resource roles. Research must preserve the differences between mobile Slave Miner and deployed production state, transport/passenger weapon behaviour, mind-control ownership and overload, recycling, magnetic lifts, and naval children or parasites. [SRC-11](source_register.md#src-11-red-alert-2-manual), [SRC-12](source_register.md#src-12-yuris-revenge-manual).

Map coverage must include urban and coastal play, inherited temperate/snow sets and expansion desert/lunar/new-urban candidates. A lunar mission is a distinct environmental/locomotion profile, not a grey recolour of an ordinary skirmish. Confirm its shipped entities and gravity/animation behaviour before adopting them.

### Generals and Zero Hour

Research USA, China and GLA as separate construction/economy/technology systems. Zero Hour includes the three base factions and nine specialist general armies: USA Air Force, Laser and Superweapon; China Infantry, Nuclear and Tank; GLA Toxin, Demolition and Stealth. Challenge-only boss and mission records must remain separate from standard selectable armies.

The manuals and official source are available; the task is to reconcile their versions, inherited definitions and restrictions. Negative capability is part of identity: a general's missing production option matters as much as its unique unit. A global generic building list would erase these choices. [SRC-08](source_register.md#src-08-generals-and-zero-hour-official-source), [SRC-13](source_register.md#src-13-generals-manual), [SRC-14](source_register.md#src-14-zero-hour-manual).

Researchers must specify worker/dozer construction, collectors, supply routes, secondary income, tunnels, salvage, destroyed-building remnants, garrison clearing, force bonuses, upgrades and powers. Scripted naval assets still belong in content research; their existence does not prove a full playable naval faction. Adaptation into Fusion naval play needs an explicit design record.

### Tiberium Wars and Kane's Wrath

The base denominator is GDI, Nod and Scrin. Kane's Wrath expands it to nine playable profiles: GDI, Steel Talons, ZOCOM, Nod, Black Hand, Marked of Kane, Scrin, Reaper-17 and Traveler-59. Keep their omissions, replacements and shared inheritance explicit. Global Conquest strategic entities must be separated from battlefield entities.

Primary references establish squad infantry, research upgrades, support powers, construction/economy mechanics and the expansion profiles. The official XML paths are now available for systematic include/inheritance parsing. Epic units need an identity/uniqueness/loadout contract; an enlarged tank does not complete them. [SRC-15](source_register.md#src-15-tiberium-wars-manual), [SRC-16](source_register.md#src-16-kanes-wrath-manual), [SRC-04](source_register.md#src-04-ea-modding-support-repository-and-licence).

Research the distinctions between clean, damaged and heavily contaminated zones, the influence of Tiberium on each side, walker wrecks and recovery, aircraft hardpoints, directional armour, squad-member presentation and sight/detection behaviour. Facts about a lore zone are not numerical terrain modifiers until the game data or a measured fixture establishes them.

### Red Alert 3 and Uprising

Allies, Soviets and Empire of the Rising Sun require separate complete rosters. AI commander personalities are not automatically new factions. Uprising requires inherited and new units, EP1 additions, FutureTech campaign content, challenge variations and Yuriko campaign objects to be classified individually.

The official publisher describes naval resource control and Empire transformations as central mechanics. The manuals expose the units and abilities, while the source files supply state-specific definitions to investigate. A transforming unit's alternate forms are linked states with cancellation, movement, targeting and damage continuity; they are not unrelated units swapped by the renderer. [SRC-23](source_register.md#src-23-ra3-publisher-steam-listing), [SRC-17](source_register.md#src-17-red-alert-3-manual), [SRC-18](source_register.md#src-18-uprising-manual).

Priorities include amphibious transitions, water construction, faction production methods, local/global tech dependencies, a usable secondary ability on every applicable unit, movement/attack form changes, cryo and shrink interactions, and readable naval battles. Uprising's direct-control campaign can contribute content and animation references without changing COMRADE's core command model by accident.

### Tiberian Twilight

Research six class profiles: GDI Offense, Defense and Support; Nod Offense, Defense and Support. Track Forgotten and campaign entities separately. Classes are not six unrelated factions.

The manual explicitly describes mobile Crawlers, production while moving, deploy/redeploy, command points, separate upgrades and class-bound structures/powers. These are incompatible with blindly treating every C&C4 unit as a conventional refinery-funded, War-Factory-produced unit. Record the source rules, then author the Fusion production mapping and balance. C&C4's official XML contains an Obsolete directory; it must not inflate released-content coverage. [SRC-19](source_register.md#src-19-tiberian-twilight-manual), [SRC-04](source_register.md#src-04-ea-modding-support-repository-and-licence).

The unified mode can include its content without adopting its entire victory/economy model. That decision must remain visible in the adaptation ledger and user-facing pack description.

### Renegade, Sole Survivor and other modes

Renegade's primary manual describes GDI/Nod team base warfare with credits, vehicle/class purchase and beacons. It is a valuable 3D scale, sound, building interior and infantry/vehicle reference. Its purchased character classes and mission-only objects need an inventory, but turning it into a direct-control FPS is a separate feature decision. [SRC-20](source_register.md#src-20-renegade-manual).

Sole Survivor is a one-unit arena branch according to the specialist archive; a primary manual and pinned retail fixture are still required. Its unique playable/arena objects must be accounted for, while its rules remain a separate possible mode. [SRC-28](source_register.md#src-28-sole-survivor-overview), [SRC-29](source_register.md#src-29-sole-survivor-manual-index).

Remastered supplies a modern presentation comparison and edition deltas, not a duplicated set of logical GDI/Nod/Allied/Soviet entities. Console ports require delta research because a PC-only census can miss mission-specific content. [SRC-22](source_register.md#src-22-remastered-official-reveal).

### Browser, mobile and current-service branches

Tiberium Alliances, Rivals, older mobile editions, regional Red Alert titles and Legions all receive explicit inventory/disposition tasks. Rivals has an official publisher listing supporting its two-side mobile design. Legions sources inspected here are announcements; they do not prove its current global availability, regional build or complete shipped roster. The Alliances FAQ body was only partly accessible. No researcher may turn these into a “complete current mobile catalogue” without a versioned source and observation record. [SRC-24](source_register.md#src-24-rivals-publisher-app-store-listing), [SRC-25](source_register.md#src-25-tiberium-alliances-official-faq), [SRC-26](source_register.md#src-26-legions-licensing-announcement), [SRC-27](source_register.md#src-27-legions-red-alert-season-announcement).

Research their content, touch readability, strategic signalling and world concepts. Account progression, payment design and live-service loops are not automatically part of the requested homage. Each unique unit/structure receives “include as authored adaptation,” “mode-specific,” “rights blocked,” “source unverified,” or another explicit disposition approved by the programme owner. “Ignored because mobile” is invalid.

### Dune and cancelled projects

The existing Dune 2000 contract remains intact. Dune II is relevant historical lineage, and Emperor is a possible research comparison, but Dune is a separate franchise with its own rights and scope. Do not silently convert its roster into Command & Conquer canon. [SRC-31](source_register.md#src-31-manuals-directory-including-dune-lineage).

Cancelled, leaked, prototype, community-mod and unused source objects must have distinct classifications. They may inspire an authored design after approval. They do not belong in the denominator of released main-series content. A specialist must identify them rather than quietly either shipping or deleting them.

## Engine capabilities the research must resolve

| Capability family | Required research contract | Failure that must block completion |
| --- | --- | --- |
| Construction | Producer, placement space, ground control, worker travel/build, deploy core, mobile factory, cancellation and refund | All buildings become instant placements regardless of source role |
| Economy | Resource type, ownership, yield, collectors, cargo, unloading, regeneration/depletion, storage, secondary income, caps | Every side uses an interchangeable generic harvester |
| Production | Queues, parallel producers, factory exit, rally, blocked exit, power, capture/sell effects | A count in a catalogue is mistaken for a producible roster |
| Technology | Positive and negative prerequisites, upgrades, replacement units, per-side limits, persistent effects | All factions inherit all technologies automatically |
| Locomotion | Foot, tracked, wheeled, water, submerged, amphibious, hover, air, burrow, jump, tunnel, teleport; transition rules | Visual height decides collision or a transform silently teleports |
| Weapon behavior | Warm-up, burst, reload, ammo, rearm, arcs, projectile movement, impact, splash, armour/target filters | All signatures reduce to one instant damage event |
| Ownership | Capture, mind-control, release, disguise, infiltration, hijack, trade, allied permission, shield precedence | Imported mechanics bypass consent or durable ownership |
| Transport and garrison | Capacity units, passenger types, child weapons, unload legality, death consequences, conversion states | Passengers are cosmetic or disappear on migration |
| Visibility | Sight, shroud, stealth, sonar/detection, disguise, radar/gap, attack reveal and spectator information | 3D renderer exposes entities the sim has not authorised |
| Status effects | EMP, stun, fire, toxin, radiation, freeze, shrink, temporal effects, shields, healing, immunity precedence | Several overlapping effects create contradictory ownership/targetability |
| Environment | Height/layers, bridges, gates, cliff/ramps, tunnels, props, hazards, water and buildability | Detailed terrain has no tactical consequences |
| Abilities and support | Costs, targeting, countdowns, telegraph, cooldowns, interruptions, stacking, lifecycle | Shared superweapon blast substitutes for every faction's ability |
| Unit identity | Individual versus squad, subobjects, hardpoints, deployed forms, unique units, wrecks, summoned units | A recolour or duplicated row counts as a finished unique unit |
| Game objectives | Base elimination, control nodes, arena goals, campaign scripts, persistent-world rules | A borrowed alternate-mode rule changes every game |
| Presentation | Silhouette, scale, locomotion, working mechanisms, firing cues, damage, death, UI, voices/sound provenance | Only idle mesh exists or animations carry authoritative logic |

For each family, the research agent supplies facts and fixtures; the engine specialist supplies schema and implementation. Do not assign fictional numeric parameters to make an unsupported unit appear complete. If a source behaviour is impractical in the unified mode, write the explicit adaptation and assess its effect on the faction's role.

## Bridges as a proving case

Bridge work should be used as the first systemic acceptance scene because it joins rendering, navigation, combat, engineering, terrain, persistence and player intent.

Source evidence currently establishes TS and RA2 repair-hut interactions and RA1 bridge destruction source code. It does not establish one universal repair model across all titles. RA1's source even contains an engineer bridge allowance under an obsolete build condition, demonstrating why raw source mentions alone are insufficient. [SRC-09](source_register.md#src-09-tiberian-sun-manual), [SRC-11](source_register.md#src-11-red-alert-2-manual), [SRC-35](source_register.md#src-35-ra1-engineer-behavior), [SRC-36](source_register.md#src-36-ra1-bridge-destruction).

A source-profile fixture must record bridge type, deck and underpass topology, ramps, navigation classes, health/segments, destruction cause, unit-on-deck result, unit-below result, current paths, repair entry/cost/time, rebuild obstruction and the resulting world state.

A Fusion fixture must additionally resolve server authority, simultaneous damage/repair ordering, region crossing, saves/reconnects, ownership and shield permissions, aircraft and naval clearance, blocker notifications and deterministic replays. Compare actual simulation state before/after with rendered collapse and repair; a bridge mesh breaking while units walk invisibly across is a fail.

The chosen Fusion rules are authored product decisions. They should be tested against this matrix even when they intentionally differ from a source title.

## The full terrain denominator

Do not equate a terrain theme with a ground texture. A complete theatre consists of:

- Ground material families and transitions, including resource-bearing surfaces.
- Height and traversal topology: cliffs, ramps, slopes, plateaus, shores and water depths.
- Natural props and vegetation with visibility, collision and destruction classifications.
- Civilian and military environment architecture, roads, rail, power/pipe/industrial systems.
- Water bodies and crossings: seas, straits, islands, rivers, canals, fords and bridge variants.
- Environmental hazards and events with a declared simulation or cosmetic role.
- Lighting, sky, fog, weather, audio ambience, decals and debris tuned for readability.
- Map-generation grammar, hand-authored exemplars, placement rules and legal biome transitions.
- State changes: damaged, destroyed, repaired, burned, contaminated, regrown or cleared, where the ruleset supports them.
- Performance and visibility tiers that preserve essential tactical cues.

For each era, researchers must enumerate the actual shipped tile/texture, prop, civil-structure, bridge, hazard and map-theme IDs. The broad terrain candidates in the era matrix are a starting taxonomy. A library labelled “desert/snow/grass” cannot close this task.

## What “the feel” must mean in acceptance terms

Define replayable evidence instead of relying only on “looks more like C&C.”

1. **Readability:** at the normal command zoom, a reviewer can distinguish side, class, movement state, threat type, damaged state and selected targets without opening tooltips. Record identification errors, lighting and device.
2. **Command response:** measure input-to-feedback and authoritative command-to-action separately. State which delay comes from selection UI, networking, path planning, acceleration, turret alignment or weapon warm-up.
3. **Production rhythm:** a reference opening records income at fixed times, first scout/defender timing, power pressure, first expansion, factory exit cadence and comeback cost. Compare source and authored Fusion profiles.
4. **Combat character:** matchups must expose meaningful counters, range, speed, hull/turret arcs, firing cadence, projectile travel, crush/avoidance, retreat and target switching. Choreographed animations cannot conceal absent rules.
5. **Environmental consequence:** routes and strategic choices change when a crossing, bridge, gate, tree cluster, garrison or resource patch changes.
6. **Faction identity:** benchmark at least one economy, production, movement, weapon, ability and counterplay distinction per faction. Shared assets must not erase these.
7. **Audio and feedback:** every applicable cue tells the player about an actual permitted state or event. Generated or newly recorded voices require their own provenance; no copying original voice lines by assumption.
8. **Scale and spectacle:** use a 3D scene with fighting land units, animated infantry, aircraft, naval movement where supported, build/repair work, destruction and terrain depth. A still screenshot is insufficient proof.
9. **Player learning:** new players can discover construction prerequisites, low-power effects, blocked routes, capture permission and unavailable abilities through clear feedback.
10. **Persistence:** the same battlefield retains rules, identities, orders and visual lifecycle after save/load, reconnect and region handoff.

Numerical thresholds belong to the approved benchmark specification and real device baseline. Research tasks must measure references before selecting source-fidelity tolerances. The unified mode can deliberately use different values, but the adaptation and user-visible outcome must remain explicit.

## Specialist research method and oversight

Every research leaf starts with its assigned edition/profile and one bounded question. The agent receives the source register, relevant issue/spec, the pinned build manifest, catalogue schema, known conflicts and exact required outputs. It does not need unrelated world history filling its context.

The research hierarchy is:

1. Producer/publisher documentation and official released code/data.
2. A lawfully obtained, hash-pinned source-game build measured with a reproducible fixture.
3. Primary-authored manuals on archival mirrors, with scan provenance and edition caveats.
4. Community references as discrepancy leads, clearly tagged.
5. Personal recollection as a hypothesis only.

Contradictions are resolved by stating the target profile first. A printed manual, retail patch and source snapshot may each be correct for different versions. Record each result; do not blend them into an invented average. If the target build cannot be accessed, that narrow item remains blocked and the programme can continue other independent work.

Each completion needs an independent reviewer who did not write the source record. The reviewer tests the disputed/complex mechanics and audits every included entity's identity/disposition. Automation checks coverage and structure; humans or capable visual reviewers judge the aesthetic acceptance scenes. Neither a test count nor a giant generated roster substitutes for the other.

## Programme handoff

The finite research tasks are in `research_tasks.json`; their readable copies are in `research_task_cards.md`. Every main era has a named owner, explicit faction/subfaction census, scope boundaries and outputs. Research completion generates bounded per-entity implementation tasks using the contract in `02_catalogue_schema_and_completion.md`.

The first implementation slice is a vertical proof of the new contracts, not a reduction of final scope. The whole-series denominator stays open until every included record has completed its required stages, and every exception has an explicit approved disposition. The final release must report completed, blocked and deliberately deferred coverage separately.

