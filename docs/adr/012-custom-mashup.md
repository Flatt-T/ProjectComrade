# ADR 012 — Custom Mashup, the Gold game type

## Status

Accepted.

## Context

Gold wants something the other tiers do not have, and the Fusion Engine already holds every
classic as plain data: four classic packs and two community fusions, each a `RulePack` of
terrain, resources, weapons, units, structures, factions and maps.

A Gold commander should not have to pick one of them. They should pick a battlefield and then,
slot by slot, whose buildings (with their upgrade progression), soldiers, vehicles, aircraft
and ships they field — Dune ground, Nod boots, Star Wars walkers, Russian air — and every
commander in the room should choose for themselves, independently. More packs are coming, and
each one has to turn up in those lists on the day it ships, without anybody editing the mashup.

The engine plays exactly one `RulePack` per match. Two commanders with different rosters are
therefore not two packs: they are one pack that knows who may build what.

## Decision

**A mashup is composed, not authored.** `packages/fusion/src/mashup.ts` derives the catalogue
of choices from the registered packs, and composes the chosen sets into a single `RulePack` at
launch. Nothing about the mashup is written per pack, so registering a pack in `MASHUP_PACKS`
is the whole of making it selectable.

- **The battlefield decides the world.** Terrain, resources, projection, mechanics (worms,
  blooms, concrete, regrowth), veterancy and the economy all come from the pack the chosen map
  belongs to. Only the forces are mixed.
- **Each commander is a faction.** Every definition they chose is copied in under their own
  namespace (`p1-…`) and tagged `factions: ['p1']`, which is what the engine already uses to
  keep a sidebar to its owner. Seat ids stay inside the 32-character `[a-z0-9-]` budget that
  lockstep commands allow for an item.
- **Prerequisites are bridged by role.** A gate names a building in its own pack, which this
  commander may not have chosen, so every building is reduced to the role that makes it a gate
  (construction yard, power, refinery, radar, a producer of a queue, a laboratory) and the gate
  is re-pointed at whichever of their own buildings plays that role, at the same rung of the
  ladder and clamped to the upgrades that building actually offers.
- **Nothing chosen is unbuildable.** Where the chosen base has no producer for a chosen force —
  Dune has no navy at all — that producer is imported from the pack the units come from and
  gated like any other building of theirs. A commander always ends up with something that
  deploys a base and something that mines, taken from their own vehicles where possible and
  from the base's pack otherwise.
- **One armour vocabulary.** Warheads are authored against their own pack's armour list, so on
  import the missing classes are filled in: `medium` and `wood` fall between their neighbours
  where both are known, otherwise the nearest class that warhead does define. No hull is ever
  left undefended because the shell came from another war.
- **Composition is pure and order-stable.** No clock, no randomness, no unordered iteration, so
  every client in a lockstep match composes a byte-identical pack from the same loadouts. The
  loadouts travel in the launch; the pack itself never crosses the wire.

**The service holds no rule data.** It validates the shape of a loadout (`parseLoadout`) and
nothing else, so a new pack needs no deploy of the service. The catalogue, the composition and
the choice of an AI commander's army all live with the rule packs in the client.

**Gold is enforced where plays are spent.** `fusion-mashup` carries `tier: 'gold'` in the style
table and `customMashup` in the plan table; the lobby hides it, the room refuses to switch to
it, and `beginMatch` refuses the match — the same place every other entitlement is decided. It
bills as a Fusion play. A deployment with no database leaves it open, like everything else.

## Consequences

- Balance between two mashed-up rosters is the commanders' problem, not the platform's. The
  bridging rules keep a match *playable*, not fair; the lobby says who fielded what.
- A battlefield with no water makes sea forces useless, so the lobby labels dry maps and warns
  a commander who picks a navy for one.
- `fusion-mashup` is the first style with no `pack`. Anything reading `styleInfo(style).pack`
  must go through the battlefield instead (`arenaPack` in the lobby, `composeMashup` in battle).
- Match history records the style and map; the rosters live in the room state, not the ledger.
- A pack whose roster is identical to one already offered (Leviathan Isles is Red Alert 2's
  armies) contributes its battlefields without a second copy of the unit lists.

## Alternatives considered

- **Per-player rule packs.** The simulation is one pack by construction; two would mean two
  simulations, and lockstep could not hold them together.
- **A hand-authored mashup pack.** Every new pack would need mashup work, which is exactly what
  this had to avoid.
- **Namespacing by source pack rather than by seat.** Cheaper, but two commanders with the same
  units and different bases need different prerequisites, so the gates would collide.
