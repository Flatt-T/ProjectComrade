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
against published structure tables, and Dune buildings placed off concrete now erode
back to half health over time even after repair, as in Dune 2000.

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
