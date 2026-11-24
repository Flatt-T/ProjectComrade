# Verification and release gates

The programme must prove that the game feels and behaves as intended on the actual integrated build. Source inspection, unit tests, browser journeys, visual review and performance measurements answer different questions. Keep them separately identified. Numerical budgets below are proposed qualification targets unless already fixed by an existing project contract; measure and calibrate at the performance gate before mass content production.

## Gates

| Gate | Exit evidence | What may begin before it |
| --- | --- | --- |
| G0 Baseline and authority | Current HEAD, code/issue crosswalk, preserved saves, mode boundary, source register, blocker list and validated backlog | Independent era research and original asset concept work |
| G1 Reference and content contract | Per-era census, exact builds and source confidence; entity/ability/terrain schemas; explicit rights route and transformation rules | Generic engine and original test content; no blocked asset publication |
| G2 3D feasibility | Comparable backend spike on named devices; real geometry/animation, camera/picking/fog, load/unload and target frame times | Capability fixtures, per-era research and approved concept production |
| G3 World and simulation | Layered movement, bridge lifecycle, combat/economy/capability fixtures, deterministic replay and versioned restore | Asset production for frozen interfaces |
| G4 Representative playable slice | Real opposing clients complete the full base/economy/combat/bridge/repair loop; art/audio/input acceptance | Continue source census and accepted reusable asset tasks |
| G5 Each era delivery | Every required source row has behaviour, model, animation, rights and evidence; full faction tech trees and matchup fixtures | Later era work on independent accepted capabilities |
| G6 Whole-catalogue experience | All mandatory eras/terrain/states covered; cross-era rules, AI, maps, labels, access and performance pass | Migration rehearsals and release preparation |
| G7 Qualification | Authoritative multi-client journeys, persistent old-save migration, region failure/catchup, security, mobile and load evidence | Documentation and deployment packaging |
| G8 Rollout and handover | Exact artifact deployed through authorized route; new/resumed world and supported Classic journeys; rollback verified, gaps explicitly resolved | No claim of programme completion before this gate |

No gate closes because its parent issue is Done. Existing Classic issues remain with their current owners. Fusion upgrade final acceptance references the relevant Classic regressions and pre-existing failures explicitly; it cannot relabel an unsynchronized native lobby as a playable multiplayer match.

## Representative slice

Use two intentionally contrasting factions and a mixed terrain map. The accepted source roster chooses the actual units; the slice must include constructor/MCV, producer, power/resource chain, harvester/refinery, infantry/Engineer, tank with independent turret, artillery/projectile, aircraft, naval craft or transport, defensive structure and a superweapon/support ability. Include build/sell/damage/repair/death, harvest/dock/unload, embark/disembark, attack/retarget/reload, fog/detection, capture, owner/team change, bridge crossing over navigable water, bridge collapse under load, rebuild and resumed movement.

The player loop is: found a base, build power and production, acquire resources, scout, expand, contest a choke, lose the bridge, reroute, repair or rebuild, launch a mixed-force attack, recover or win. In persistent mode continue across reconnect and worker restart with the same assets. A cinematic fly-through, turntable gallery or bots silently controlled by one client does not satisfy the slice.

## Functional case families

| Family | Required proof |
| --- | --- |
| Economy and production | Real harvesting route and resource conservation; unload capacity; spending cadence; low-power consequences; prerequisite loss/capture; queues, cancel/refund, exit blockage; faction construction differences |
| Movement and combat | Domain eligibility, turn/acceleration/turret timing, passability and layer choice, crush and garrison where applicable, armour/warhead result, range/LOS, splash and area effects, ammo/reload, repair and target reacquisition |
| Special identities | Stealth/detection/disguise, deploy/transform, transport/cargo, aircraft rearm, naval/submarine, burrow/mech/hover, mind control, shields, support powers and superweapons where their source rows require them |
| Structures and world | Placement footprint, terrain/slope validity, construction state, power/production state, damage/fire/destruction, bridge approaches/decks/water clearance, repair/rebuild interruption, neutral/capturable sites |
| Multiplayer | Unique move/build/attack command from client A reaches client B at matching authoritative tick; independent B response reaches A; ownership, visibility and resulting state agree after packet delay/reorder/loss/reconnect |
| Persistent safety | Allied consent and ownership-generation races; shields at order/arrival; trade conservation; regional handoff with cargo; crash between commit and apply; same-tick replay; old fingerprints; migration/rollback and offline catchup |
| Experience | Faction recognizable at gameplay zoom, readable unit role/action, distinctive motion/audio, camera/input responsiveness, clear failed-order explanation, no selection-through-fog or misleading labels |

Each source-derived feature has at least one positive and one negative/edge case. Select high-risk pairwise interactions from the capability graph and mandatory three-way cases (bridge+transport+collapse, shield+capture+ownership reversal, transform+cargo+transfer, fog+stealth+reconnect). Randomized tests supplement these cases; they cannot replace named requirements.

## Visual review rubric

Score separately: faction identity; unit/structure role readability; terrain material and topology readability; animation completeness and timing; combat feedback; construction/destruction states; team/owner identification; HUD clarity; mobile readability; coherent composition. A reviewer records object IDs and captures for each failure. Required categories cannot be averaged away by attractive scenery. Compare the same seeded battle at normal strategic zoom and useful close zoom. Include mixed ownership, low power, damage and heavy combat. Original and generated assets are subject to the same review. A procedural fallback may support development but cannot satisfy final coverage without a specific reviewed justification.

## Device and performance contract

Preserve the existing representative 1080p p95 frame target of 16.7 ms and 30 fps worst-legal-load requirement where applicable. Establish explicit desktop and mobile device/browser tiers before implementation promises. Test sustained play, not a one-second empty map. Record viewport, DPR, render scale, device model, OS/browser/GPU, thermal state, visible/simulated units, structure count, animation mix, effects, map size, observers, active regions and network conditions. Record p50/p95/p99 frame time, long tasks, input-to-visible acknowledgment, memory, texture/geometry bytes, draw calls, download/load time, server tick cost, replay/catchup duration and bandwidth. A lower visual tier may reduce shadows, LOD/detail, particles and resolution, while keeping exact gameplay, visibility and command results.

Until the measured envelope is accepted, do not promise a player count or unlimited active units. The coordinator records budgets as targets and observed results separately. Capped quality settings cannot hide a reduced supported roster. Under memory pressure or context loss, restore the scene without losing authoritative game state.

## Save and rollout protocol

1. Pin engine, simulation schema, rules profile, pack versions, world generation, renderer, assets and migration revision in a build manifest. Rendering-only updates must not invalidate simulation state by accidental coupling.
2. Read existing world formats and fingerprints. Produce a migration fixture for every supported saved version, including legacy flat maps; default missing elevation/layer fields through a defined compatible transform, not a new random world.
3. Rehearse on a permitted isolated copy: counts, IDs, owners, balances, HP, cargo, production queues, orders, shields, consent generations, transfers and journal checksums must reconcile before and after.
4. Prove crash recovery at each migration/commit boundary and mixed-version join rejection or compatibility. Retain the old artifact and a safe data-compatible rollback route; an irreversible schema needs its own reviewed operational plan. Define the cutover write fence and last committed cursor. Old-backup rollback is permitted only before newer writes or with a validated lossless reverse migration/tail translation. After accepting new gameplay, use lossless rollback or forward recovery; never erase committed player actions through a blind backup restore. Rehearse post-cutover spending, building, capture and transfers, and prove their exact conservation.
5. Run actual new and resumed player journeys plus the approved multi-client scenario on the exact candidate. Classic and persistent deployments are distinct destinations; record what actually serves each route.
6. Use existing conditional deployment authorization after required gates. Do not redeploy an incident-prone world merely to gather attractive screenshots. Confirm live version, WSS, playable state, retained assets and monitoring, then attach evidence to the existing release owner and new programme epic.

## Evidence baseline

At the reviewed SHA root `test:e2e`, `test:parity`, `test:security` and `test:performance` only echo unimplemented messages. They must be replaced by meaningful executable suites before being cited as acceptance. Existing targeted smoke and unit/integration tests remain useful within their scope. Latest Linear release comments report remaining wake/replay, three-client consent, rollback and live journey work; their existence is not a newly run failure or pass in this planning session. [Package scripts](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/package.json) · [release owner](https://linear.app/thunderchild-creative/issue/THU-2487) · [existing evidence ledger](https://linear.app/thunderchild-creative/document/comrade-20a-release-acceptance-and-evidence-ledger-a869b291ddbb).
