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

## The classics on the Fusion Engine (update 2026-10-24)

The engine now carries **all four classics as rule packs**: `td` (Tiberian Dawn) and
`ra1` (Red Alert) join `dune` and `ra2`. The reason is the second half of the original
direction — future fusion games. A fusion pack can only mix what the engine holds as
data, so GDI, Nod, the Allies and the Soviets of 1995 had to exist here too, not only
inside the original binaries. `CLASSIC_PACKS` in `packages/fusion/src/index.ts` is that
set, and every pack test runs over it.

- **Tiberian Dawn** (`packs/td.ts`): GDI and Nod, Tiberium that spreads from its fields,
  the full two-sided tech tree (Weapons Factory against Airstrip, Hand of Nod, Guard and
  Advanced Guard Towers, Gun Turret, SAM Site, Obelisk of Light, Repair Facility,
  Helipad, Shipyard), the Ion Cannon from the Advanced Communications Center and the
  Nuclear Strike from the Temple of Nod. No veterancy: Tiberian Dawn has no unit ranks.
- **Red Alert** (`packs/ra1.ts`): Allies and Soviets, ore and gems, a real navy
  (Shipyard and Sub Pen on water, Destroyer, Cruiser, Submarine, Transport), Tanya, the
  spy and the thief, attack dogs, Tesla coils and flame towers, the Chronosphere, the
  Iron Curtain, the Soviet Missile Silo and paratroopers from the Airfield. Also no
  ranks. The original engine still has no bootable Red Alert battlefield (ADR 007), so
  this is where Red Alert is playable today.
- **The same ground, both engines.** Tiberian Dawn's four two-player battlefields are
  converted from the authored scenarios the original-engine slice ships
  (`tools/create-map.py`): same 60x60 size, same theatre, same base anchors, same
  Tiberium field centres and the same tree cells. `tests/unit/packs.test.ts` checks the
  Fusion maps against `packs/td/comrade/maps.json`, so the two engines cannot drift
  apart silently. Two further battlefields (Tiberium Gardens, River Crossing) exist only
  on the Fusion Engine, where four players and lockstep are possible.
- **Art**: two more art styles, `gdi` and `nod` — GDI's pale concrete and steel with gold
  trim, Nod's dark slabs and red glow — plus new models for the Power Plant, Advanced
  Power Plant, Hand of Nod, Airstrip, Helipad, Advanced Communications Center, Temple of
  Nod, Guard and Advanced Guard Towers, Obelisk, SAM Site, Flame Tower and AA Gun, and
  for the Hum-vee, Buggy, Recon Bike, APC, Mammoth Tank, Flame Tank, Minelayer, Mobile
  Gap Generator, Orca and Apache. Red Alert uses the existing Allied and Soviet styles,
  which are that war's own visual language a generation later. Temperate and snow
  theatres were added to the terrain painter. All geometry is original; nothing is
  traced from the originals.
- **Lobby**: `Tiberian Dawn Style` and `Red Alert Style` are two more game styles, both
  lockstep, alongside `Classic C&C` on the original engine. The classic TD entry is
  unchanged: it remains the authentic Vanilla Conquer slice.

Fidelity is the same contract as before: values approximate the classics from public
knowledge, are labelled in-game, and are tuned against observations over time.

## Late tech for the 1995 classics (update 2026-10-25)

Play-testing Tiberian Dawn showed the two new packs stopped short: no building upgrades
at all, one superweapon a side, and nothing in the air for the Allies beyond the Helipad.
Three things were done about it.

- **An engine fix.** `canBuild` applied the lobby's tech-level cap to upgrade items as
  well as to buildings. Construction Yards sit at tech 99 so they can never be queued
  directly, which silently made their upgrade unbuildable — in Dune too, where it quietly
  locked the Rocket Turret behind a `conyard@1` that could not be bought. The cap now
  applies to what is built, not to the improvement of a building already standing.
- **Building upgrades, as gates for the late tree.** Both packs upgrade the Construction
  Yard (advanced defences: Advanced Guard Tower, Obelisk, Tesla Coil, Camo Pillbox), the
  vehicle factory (Mammoth Tank, Mobile Gap Generator, Stealth Tank and SSM Launcher) and
  each side's top technology building (its superweapons).
- **Superweapons to the original scope and one tier beyond, per side's theme.**
  - *GDI* — the Ion Cannon, then the **Dropship Bay** (airborne reinforcements: two
    Medium Tanks and two Rocket Soldiers at the base) and the **GDI Uplink Center**
    (a Satellite Sweep that reveals the map for a minute). Orbital and airborne, which is
    how GDI fights.
  - *Nod* — the Nuclear Strike, then the **Chemical Missile Silo** (less blast than the
    nuke, a far wider cloud) and the **Stealth Field Generator**, which hides the ground
    around it from the enemy. Chemicals and concealment, which is how Nod fights.
  - *Allies* — the Chronosphere, plus an **Allied Airbase** of their own (helicopters fly
    from it or the Helipad, and it calls in paratroopers), the **GPS Satellite Uplink**
    and the **Weather Control Device**, the Allied storm tier.
  - *Soviets* — the Nuclear Missile, Iron Curtain and Badger paratroopers, plus the
    **Tesla Storm Array**: a rolling electrical storm over the target.

Dune 2000 and RA2 keep the upgrades and powers their originals had; the rule is per pack,
not global. `tests/unit/packs.test.ts` holds each side to a superweapon, an air option and
priced upgrades, requires more than one power and several upgradable buildings in the two
1995 packs, and covers the yard-upgrade regression.

## The same tier for Dune and RA2 (update 2026-10-25)

The late-tech pass was extended to the other two packs, so all four classics now end in a
tier of their own rather than one power and a flat tree.

- **Dune**: the Palace can be improved once, and each house gets a building past it —
  the Atreides **Sonic Array** (a sonic barrage walked across the target area), the
  Harkonnen **Drop Platform** (two Devastators delivered to the base) and the Ordos
  **CHOAM Observation Post** (a bought look at the whole map), with an Ordos **Scrambler
  Field** that hides the ground around it. The factory and yard upgrades the original had
  are unchanged.
- **RA2**: building upgrades are new to this style and are the tier beyond it. The
  Construction Yard upgrade carries the Prism Tower and the Tesla Coil, the War Factory
  upgrade the Prism Tank, Mirage Tank and Apocalypse, and each Battle Lab upgrade carries
  everything that ends a game — including the Allied **Prism Array** (an orbital prism
  strike) and the Soviet **Airlift Command** (two Apocalypse tanks at the base).
- **AI**: upgrades now gate real tech in every pack, so the skirmish AI no longer buys
  them blindly in alphabetical order. It buys an upgrade when that upgrade unlocks
  something it could build immediately (Dune's factory levels, which open most of its
  arsenal), and otherwise leaves the late ones until the rest of the base stands — which
  is what kept an RA2 AI from reaching its Battle Lab once upgrades existed there.

Every side in every pack now holds to the same rule, checked in `tests/unit/packs.test.ts`:
more than one superweapon, more than one building worth upgrading, aircraft of some kind,
and a price on every upgrade.

## Balance, upgrades that pay and clearer production (update 2026-10-25)

Play-testing found the Ion Cannon feeble beside a Nuclear Missile, upgrades that bought
nothing, and a build queue that hid what it was doing. All four packs were brought onto
one scale.

- **Superweapons are balanced by class, across packs.** A class is a shape of attack, and
  every pack's version of it now lands about the same blow for about the same wait:
  *missile* 1500 damage over a 1024-lepton radius on a 6300-tick charge; *ion* the same
  damage focused into 512 leptons, sooner (4500); *storm* 24 bolts of 260 across 1152;
  *reinforce* and *paradrop* about 2200 credits of units. Deliberate variants stay
  distinct by shape rather than by being weaker — Nod's Chemical Missile trades blast for
  a far wider cloud, and keeps a comparable total. `tests/unit/packs.test.ts` measures
  damage across area, charge time and credits delivered, and holds each class inside a
  1.5x (1.8x for squads) spread, so a future pack cannot quietly ship a weak Ion Cannon.
- **Every upgrade opens something.** A test now walks each pack, each side and each
  upgrade level and requires at least one unit or structure that side can build to hang
  off it. It found a real hole: the Harkonnen bought the High Tech Factory upgrade and
  got nothing, since Ornithopters are Atreides and Ordos. Every house now also gets the
  **Heavy Carryall** from that upgrade.
- **A second factory doubles production.** `extraFactoryBonus` is 100 in every pack, so
  two War Factories build at twice the rate, three at three times, as the sidebar
  arithmetic always implied. A behavioural test times a tank with one factory and with
  two.
- **Production reads as production.** An upgrade left the sidebar the moment it was
  queued, because it is no longer buildable while it is being built; the tile now stays,
  and anything under construction shows a bar filling in the player's own colour with the
  percentage on it, instead of a black shadow creeping down the cameo.
- **Dune's Fremen come as a war party.** The Atreides Palace power now delivers a team —
  four Fremen and two **Worm Riders**, a new unit that is exactly what it sounds like: a
  ridden sandworm, fast, armoured, crushing, with a maw that hits everything around it.
  Worm Riders cannot be built; they answer the call or not at all. The Ordos power
  likewise became a Saboteur Cell rather than a single saboteur.

## Match settings, and worms that answer their slider (update 2026-10-25)

The lobby now carries five Fusion Engine settings, all fixed at launch and shared by every
client, so lockstep is unaffected:

- **Sandworm activity (0-200%)** — this one was reported as doing nothing, and the report
  was right. The setting only moved the first worm's arrival and the delay after one was
  killed; the worm *count* came straight from the rule pack, and Dune's count is 1. So a
  match at 25% and a match at 200% both ended up with one worm roaming for ever. Activity
  now scales the number of worms as well (200% doubles the fleet), and a worm that is not
  hunting anything dives after a stint on the surface, with the time underground stretched
  or shortened by the same setting. Quiet settings mean fewer worms, out less often.
- **Resource renewal (0-50%)** — how fast mined-out cells grow back. 25% is the rule
  pack's own rate, 0 leaves the ground bare for the rest of the match, 50% fills it twice
  as fast. It scales both kinds of regrowth the engine has (spreading ore and refilling
  fields).
- **Superweapon recharge (1x-2x, in quarters)** — one number scales every power's charge
  time together, so the balance between classes holds whatever the setting. `chargeFor`
  is the single place that knows it, and the sidebar, the AI and the launch check all read
  it.
- **Bonus crates (off, or 25-200%)** — crates of money, field repairs, a promotion, a
  sweep of intel or a free unit, dropped on open ground away from the start positions and
  opened by the first ground unit to walk onto one. Frequency sets how often they drop and
  how many may be out at once. Off by default, since the classics did not all have them.
- **Game speed (100-300%)** — wall-clock pacing only: the simulation is untouched, both
  session kinds step the same ticks, and the per-frame catch-up ceiling scales with the
  setting so a fast match can still make up a stall.

Two things found while testing these. The Construction Yard upgrade bought nothing for a
base that had only a power plant, so every pack now puts a better power plant behind it
(an Advanced Power Plant, Advanced Tesla Reactor or Advanced Windtrap). And the AI picked
its upgrades alphabetically, which had it saving for a 1000-credit yard upgrade while its
harvesters were being shot out from under it; it now takes the cheapest upgrade that
unlocks something it can build now.

## Airstrips, silos, harvester orders and a deeper Dune (update 2026-10-25)

- **Airstrips fly bombers.** Nod's Airstrip rearms aircraft and its upgrade opens a
  **Bomber Flight**, which builds a bomber that makes one heavy pass and returns to
  rearm. Red Alert's Soviet Airfield and the Allied Airbase both build the **Badger
  Bomber** on the same terms. A test requires every airstrip in every pack to put a
  bomb-carrying aircraft in the air for the side that owns it.
- **Silos hold four times as much** (1500 to 6000 a silo), and Red Alert 2 finally has
  Ore Silos of its own. This matters more than it sounds: income above a player's storage
  is thrown away on delivery, so a base without silos was quietly losing most of a
  harvester run.
- **Harvester orders.** Clicking your own refinery with harvesters selected sends them to
  *that* refinery and keeps them returning to it, instead of the nearest one. Ctrl-click
  on a resource field ties them to that field: after every delivery they go back to it,
  and only when it is worked out do they take the nearest again. Both are covered by
  tests that watch a full gather-deliver-return cycle.
- **A queued item shows `[1]` at once**, rather than staying blank until a second one is
  queued, so a click on a unit is visibly a click.
- **Dune's ladder no longer stops at the Heavy Factory.** The Construction Yard now
  improves three times, as the classic's did, and each level opens the next part of the
  base: Advanced Windtrap and Rocket Turret, then Repair Pad and Starport, then the IX
  Research Centre and the Palace. The Barracks improves once (Engineers for every house,
  Grenadiers for the Atreides, Sardaukar for the Harkonnen), the Heavy Factory twice
  (Siege and Missile Tanks, then the **Heavy Harvester**), and the High Tech Factory
  twice (Heavy Carryall and Ornithopter, then the **Assault Ornithopter**, the gunship
  every house can field). That is ten rungs a house, against five before.
- The Allied War Factory upgrade in Red Alert was worth only a Mobile Gap Generator, so
  Allied **artillery** now sits behind it too.

## Leaving an operation actually ends it (update 2026-10-25)

Reported from play: after leaving a Classic C&C match the sound effects carried on, and
the match with them. The Fusion battle tears itself down properly (its loop, worker
ticker, session and audio context all go when the view unmounts, which a browser check
confirms by `window.comradeFusion` disappearing the moment you leave). The original
engine does not: it is an Emscripten module started with `callMain`, so it owns the main
loop and its OpenAL audio for the life of the document, and removing its canvas changes
nothing.

Engines were built exporting only `FS`, `callMain`, `UTF8ToString` and `ccall`, so a
loaded build has no way to be stopped at all. Two changes:

- `stopEngine` in the client runtime pauses the main loop and closes any audio context
  the module exposes, and reports whether it managed anything. Leaving a classic match
  calls it, drops the module and clears `window.comrade`; when the build cannot be
  stopped, the page reloads, which is the only thing that silences it. The callsign is
  remembered, so the way back into the war room is one click.
- An attempt to export `pauseMainLoop` from the engine build failed: Emscripten has no
  runtime method by that name, and asking for it stops both engines linking (it broke a
  deploy, caught in CI and reverted the same day). A module started with `callMain` owns
  the main loop until the document goes, so the reload is the fix, not a stopgap.

## The classics drawn with their own art (update 2026-10-25)

The art direction above says the engine ships procedurally drawn artwork because Dune 2000
and RA2 assets are not freeware. That holds for those two. Tiberian Dawn and Red Alert are
different: their content *is* freeware and the project already bundles it, checksum-pinned,
for the original engines. So the `td` and `ra1` packs are now drawn with the originals.

- `tools/prepare-art.py` bakes, per pack, a sprite atlas, a greyscale remap mask and an
  index of frames, theatre tiles and trees, out of the same pinned packs the rest of the
  content pipeline uses (rights ledger `ledger-019`). `tools/westwood.py` gained the SHP,
  PAL, template and PNG readers for it, beside the MIX and Format80 code already there.
- `packages/fusion/src/art/classic.ts` loads that atlas and rebuilds Westwood house
  colouring the way the originals did it: the sprites carry a sixteen-step ramp, kept out
  of the base image and repainted in each player's colour, so a Fusion faction colour still
  reads as that faction. It serves frames by facing, with infantry walk cycles and turrets
  that rotate apart from the hull.
- The renderer takes a sprite where the pack has one and falls back to its baked 3D model
  otherwise. Dune, RA2 and the fusion packs are untouched, the pieces invented for the late
  tech tiers keep their procedural models, and a missing atlas costs nothing but the old
  look. The ground is likewise laid from the theatre's own tiles once the art has loaded.
- The deploy builds the atlases with the rest of the content.

Still procedural for these two packs, and worth finishing: resource overlays (the index
carries the Tiberium and ore tiles), scenery, and drawing the Fusion maps from the authored
scenarios cell by cell rather than from map features.

## Buildings stay modelled, and look the part (update 2026-10-25)

Drawing buildings from the original sprites was reported as wrong in play, and it was: a
sprite is sized to its own artwork, not to a footprint, so a placed building no longer sat
where the placement outline had been, and a building still going up (drawn from the model)
changed shape when it finished. Buildings are modelled again, which keeps them on the grid
and the same shape throughout; units, ground tiles, resources and scenery keep the original
artwork, which is where it reads best.

The models themselves now follow the originals rather than Red Alert 2's look. Their
colours are measured from the sprites instead of guessed - Tiberian Dawn is light grey
concrete with darker roof panels, sand-coloured tanks and a gold trim for GDI, near-black
slabs for Nod; Red Alert's Soviets took the red-brown roofs their buildings wear. The
Construction Yard, refinery, barracks and weapons factory have Tiberian Dawn silhouettes
of their own: a walled compound under a gantry crane, a processing tower beside a holding
tank and an unloading bay, a flat-roofed hut, and a hangar that is mostly its dark open
mouth.
