# ADR 010 — Comrade Fusion Engine: independent gameplay replication for Dune and RA2

Status: Accepted
Date: 2026-10-23
Supersedes the engine-sourcing blockers in ADR 009 and DEV-D2K-003 / DEV-RA2-002

## Context

The owner's direction for this fan site is to **replicate the classic gameplay as
closely as possible without cloning the original engines**, and then to use one
platform to build original "fusion" games that mix elements of each classic.

Dune 2000 and Red Alert 2 have no source release and are not freeware, so they cannot
follow the Vanilla Conquer route used for Tiberian Dawn. The deviation register already
names "independent adaptation" as the acceptable path (DEV-D2K-003).

## Decision

Build **one** web-native engine, `packages/fusion`, and express each game as data.

- **Independent implementation.** No EA/Westwood code is used or decompiled. Gameplay is
  reproduced from public knowledge of how the games play: unit roles, costs, armour
  classes, harvesting, production, power and signature mechanics.
- **Deterministic simulation.** Integer-only maths (positions in leptons, 256 per cell),
  a seeded xorshift RNG, fixed 15 Hz ticks, and every player action expressed as a
  command applied at a tick boundary. The same seed and command stream produce the same
  game on every machine, which gives replays, a state checksum for desync detection, and
  **lockstep multiplayer** without engine surgery. AI opponents run inside the
  deterministic sim, so they behave identically on every client.
- **Rule packs as data.** A `RulePack` declares terrain, the resource, armour types,
  warheads, weapons, units, structures, factions, maps and mechanic flags. Dune-style
  and RA2-style games are two packs. A fusion game is a third pack that combines
  definitions from both, for example Dune spice and sandworms with RA2 Tesla technology.
- **Projection-agnostic rendering.** The sim is a grid. The renderer projects it
  top-down (Dune) or isometrically (RA2), so a fusion pack can choose either.
- **Original art.** Dune 2000 and RA2 assets are not freeware, so the engine ships
  procedurally drawn, faction-coloured artwork. Sprites are referenced by key, so a later
  asset pipeline (original commissioned art, or a player's own installed game files for
  personal use) can replace them without engine changes.

## Fidelity

Unit statistics are **approximations of the classic values** taken from public
knowledge of the games. They are labelled for tuning and should be checked against
recorded observations using the existing parity-fixture schema. Signature mechanics are
modelled directly:

- **Dune:** buildings only on rock, concrete slabs (no-concrete placements start
  damaged), spice fields and spice blooms, sandworms that hunt vehicles on open sand,
  house-specific units (Sonic Tank, Devastator, Deviator), windtrap power.
- **RA2:** MCV deploy into a Construction Yard, ore regrowth and high-value gems, power
  shortfall slowing production and disabling powered defences, faction tech (Prism and
  Tesla weapons, Apocalypse, Rhino and Grizzly), the classic two-sides roster.

## Consequences

- Dune-style and RA2-style skirmish are playable in the browser, and lockstep multiplayer
  works for them.
- Tiberian Dawn remains on authentic Vanilla Conquer. The Fusion Engine is the platform
  for Dune, RA2 and all future original games.
- Exact parity with the originals is a tuning exercise against observations, not a
  property of the code. The ADR and the in-game credits say so.

## Art direction (update 2026-10-23)

The owner chose redrawn built-in art modelled on the originals rather than a
bring-your-own-files loader. Public screenshots of Dune 2000 and Red Alert 2 were used
only as visual reference; no original pixels, sprites or tiles are used or bundled.

- **Sprite forge** (`packages/fusion/src/art/forge.ts`): buildings and vehicles are small
  3D models (boxes, cylinders, domes, roofs) rendered with fixed north-west lighting,
  vertical-face gradients and baked soft ground shadows into cached sprites. Vehicles are
  pre-rendered at 32 facings with independently rotating turrets, echoing RA2's voxel
  units; the same models produce the sidebar cameos.
- **Models** (`art/models.ts`): Dune 2000's rounded cream-metal structures with house
  accents (domed Windtraps, silo Refineries, crane Construction Yards); RA2's ribbed
  silver Allied and brutal concrete Soviet buildings (twin-drum Power Plant, coil Tesla
  Reactor, Prism and Tesla towers); light hulls with player markings.
- **Terrain** (`art/terrain.ts`): painted per pixel from noise-perturbed terrain fields, so
  edges erode organically instead of following the grid, with procedural material
  textures and a height field providing relief lighting and cast shadows (raised
  orange rock over cream sand; olive grass, red-brown dirt, navy water, orange cliffs).
  Spice is drawn as dusty stains, ore and gems as glinting crystals, trees as
  depth-sorted scenery, and the shroud as a smoothly scaled soft mask.

Gameplay fidelity from the same review: RA2 costs and prerequisites were corrected
against published structure tables, and Dune buildings placed off concrete start at half
health (repairable). An earlier ongoing erosion rule was removed: buildings losing health
with nothing attacking them read as a bug in play.

## Animation and superweapons (update 2026-10-23)

- **Construction**: buildings rise from the ground behind scaffolding with a welding seam
  and sparks; selling plays the same animation in reverse. An MCV folds away while its
  Construction Yard unfolds.
- **Weapons**: oriented rockets with flame and smoke trails, artillery on ballistic arcs
  with ground shadows, cannon tracers and star muzzle flashes, Tesla arcs and Prism beams.
- **Aftermath**: particles (smoke, fire, sparks, debris, sand), persistent scorch marks,
  craters and burning wrecks, and screen shake scaled to the blast. Harvesters kick up
  dust or sand while gathering.
- **Superweapons** are real, deterministic gameplay (charge needs power; impacts are
  scheduled strikes inside the simulation, so they work in lockstep and for the AI):
  the Harkonnen Palace's **Death Hand**, the Soviet **Nuclear Missile Silo** and the
  Allied **Weather Control Device**. The engine also supports an **Ion Cannon** strike
  type that any fusion pack can grant with one structure entry. Each has its own
  animation: launch plume and climbing missile, target warning and falling warhead, then
  flash, fireball, shockwave and mushroom cloud; storm clouds, rain and branching
  lightning; an orbital focusing beam and a sky-column strike.

## Full tech trees and capabilities (update 2026-10-23)

Both styles now carry their complete build progression, expressed as rule-pack data on a
wider engine schema:

- **Movement classes**: infantry, vehicles, **aircraft** (fly straight over everything,
  only weapons that list `aircraft` can hit them), **ships** (water only, built at
  shipyards that must be placed on water) and **amphibious** units (SEALs, Tanya).
- **Upgrades** (`heavyfactory@1` in a prerequisite) are bought from the Base tab, like
  Dune 2000's factory, yard and Hi-Tech upgrades.
- **Countries and houses**: a unit may list a faction (`germany`) or a whole side
  (`allies`). RA2 now offers its nine countries, each with its special: American
  Paratroopers, the Korean Black Eagle, the French Grand Cannon, the German Tank
  Destroyer, the British Sniper, the Libyan Demolition Truck, the Iraqi Desolator, the
  Cuban Terrorist and the Russian Tesla Tank.
- **Veterancy**: kills earn experience worth the victim's cost; veterans and elites hit
  harder and take less damage, and elites slowly heal.
- **Abilities**: engineers capture or repair; spies steal credits, black out power, jam
  radar, steal veteran tech or reset a superweapon; C4 (Tanya, SEAL, Crazy Ivan,
  Saboteur); terror drones that ride inside a vehicle until a repair pad evicts them;
  Yuri's permanent, one-at-a-time mind control; deployable stances (G.I. sandbags,
  Desolator rad field, Thumper worm lure); Mirage Tank, submarine, Fremen and Saboteur
  concealment; death explosions (Devastator, Demolition Truck, Kirov, Nuclear Reactor);
  aircraft ammunition and rearming at airfields; Dune Carryalls ferrying harvesters.
- **Support buildings**: Repair Pad / Service Depot, Starport with drifting CHOAM
  prices, Cloning Vats, Ore Purifier, Industrial Plant, Gap Generator, Spy Satellite
  Uplink and Psychic Sensor.
- **More powers**: Paratroopers, Fremen and the Saboteur (reinforcements), the
  Chronosphere (pick an area, then a destination; infantry do not survive the jump) and
  the Iron Curtain (invulnerable vehicles and buildings, lethal to infantry). Dune
  palaces give each house its own power.
- The skirmish AI climbs the whole tree: it saves for its core buildings and upgrades,
  keeps two harvesters per refinery, flies air strikes, sends saboteurs and fires every
  power except the Chronosphere, which is left to human players.

Everything new stays inside the deterministic simulation, so it works unchanged in
lockstep multiplayer. `tests/unit/progression.test.ts` exercises each system.

## Sound (update 2026-10-23)

Fusion Engine games now have sound. `tools/prepare-audio.py` (run by `prepare-content.py`)
packs selected effects, unit replies and EVA speech from the pinned freeware packs into one
bank per game: Tiberian Dawn audio for the Dune style, Red Alert audio for the RA2 style
(rights ledger 017 and 018; Red Alert's MIX headers are decrypted with the public key from
EA's Red Alert source release, see `tools/westwood.py`). Sounds stay in Westwood's IMA ADPCM
form and are decoded in the browser (`packages/fusion/src/audio.ts`). Effects the classics
never had (Prism, sonic, chrono, psychic, rad, sandworms, thunder) are synthesised with Web
Audio. Sound is presentation only: it reads `Game.effects` and never affects the
simulation, so lockstep is unaffected. Volume (master, effects, voices) and mute persist in
the browser.

## Teams, chat, difficulty, transports and regrowth (update 2026-10-24)

- **Teams and chat**: players pick a team (or none) in the lobby; teammates are allies in
  the match. Chat goes to everyone or to allies only; the service filters allied messages
  so opponents never receive them, strips control characters and rate-limits senders.
- **AI difficulty** (Easy / Normal / Hard): thinking rate, first attack, wave growth and a
  build-speed handicap. Normal is gentler than the previous AI; Hard keeps it.
- **Transports**: the Amphibious Transport (both sides, crosses land and water) and the
  Allied Night Hawk (infantry only) carry units; passengers die with their transport.
  The Soviet Radar Tower grants the Spy Plane (temporary sight over an area). Dune houses
  field their own Combat Tanks.
- **Resource regrowth**: every map remembers its original fields; mined-out cells grow
  back slowly to their starting amount (spice every 30 s, ore 20 s, gems 40 s per unit).
- **Chrono Miner** charges for just over a second (fading out in a blue shimmer) before
  jumping to the refinery, instead of vanishing in a single frame.
- **Maps**: four-player maps are 96x96; new Four Isles (mostly sea), Deep Desert, Carthag
  Pass and Desert Crossing. Shipyards may be placed further from the base (+6 cells).
