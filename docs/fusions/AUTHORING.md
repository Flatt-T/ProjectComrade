# Authoring a fusion

A fusion is a playable level for the Comrade Fusion Engine. Most fusions remix a classic
rule pack (`packages/fusion/src/packs/dune.ts`, `ra2.ts`) plus their own map and mechanics.
A fusion may also be a **full original pack** with its own units, buildings and art, as
[`packages/fusion/src/fusions/conquer.ts`](../../packages/fusion/src/fusions/conquer.ts)
does. Community fusion requests (GitHub issues labelled `type:fusion`) are voted on weekly.
The remix reference is
[`packages/fusion/src/fusions/leviathan.ts`](../../packages/fusion/src/fusions/leviathan.ts).

## 1. Map the request to the engine

| Request field | Where it goes |
| --- | --- |
| Sides and factions | Spread the base pack: `...ra2Pack` (countries, teams) or `...dunePack` (houses). Original-pack fusions declare their own `factions`. |
| Map, type, size | A `MapPreset` (64, 80, 96 or 128 square). Features paint terrain (`circle`, `rect`, `ridge`); use `quad()` / `mirror()` from `packs/mapkit.ts` so starts are fair. |
| Characteristics, resources | `fields` with `resource`, radius `r` and optional `amount` (scarce fields: lower `amount`). |
| Dangers | `mechanics`: `sandworm` (`count`, `speed`, `sight`, `damage`, `appearAfter`, `eatChance`, `habitat` terrain ids such as `['sand', 'water']`, `nearResources` radius); `bloom`; `regrowth`. Resources regrow via `regrowEvery`. |
| Tech level | Players pick it in the lobby; "full" needs nothing. To cap a fusion, filter `units`/`structures` by `tech`. |
| Infantry, vehicles, aircraft, naval | Keep the base pack's units, remove with object rest, or add units copied from the other pack (bring their `weapons` and `warheads`). Original-pack fusions author a full roster. Units need a `shape` the art knows (see `art/models.ts`). |
| Buildings and upgrades | `structures`; upgrades are `upgrades`/`upgradeCost` plus `name@1` prerequisites. |
| Superweapons | A structure's `superweapon` (`missile`, `storm`, `ion`, `reinforce`, `paradrop`, `chrono`, `curtain`, `reveal`). |
| Two armies in one pack | `doctrine: 'regular' \| 'irregular'` on a unit or building. A definition with no doctrine belongs to both; one that has it is only buildable under that doctrine, and the lobby offers the choice to any pack where both appear (`packHasDoctrines`). Give each faction a `regularStart` when its regular escort differs. |
| Bonus objects | Not in the engine yet: say so in the PR and suggest the closest substitute. |

Where the engine cannot do something exactly, choose the closest option that stays true to the
classics and write the difference in the PR description.

### Balancing two doctrines

A pack that describes both armies is promising that the regular one is even, so say so in data
and prove it in a test. The pair in
[`irregular.ts`](../../packages/fusion/src/fusions/irregular.ts) and
[`holdout.ts`](../../packages/fusion/src/fusions/holdout.ts) share one ladder: every faction
fields the same five roles (line infantry, tank, field gun, strike aircraft, warship), each
worth about the same in a fight — durability times rate of fire, within a 1.35 spread — and
differing only in workmanship. Read the factions poorest-first and the price climbs while the
machine gets smaller and less tough, fires sooner, reaches further, lands tighter and loses its
minimum range. Build time is not a field: the engine derives it from `cost`, so the crude
machine being cheaper is what makes it quicker to field.

## 2. Files to add or change

1. `packages/fusion/src/fusions/<id>.ts` exporting `<id>Pack: RulePack` with a unique `id`,
   `name`, `fidelityNote` (one sentence, credits the community fusion) and `maps`.
2. Add the pack to `FUSIONS` in `packages/fusion/src/fusions/index.ts`.
3. In `packages/contracts/src/index.ts` add `'fusion-<id>'` to `GameStyle` and a `STYLES` entry:
   `engine: 'fusion', pack: '<id>', playable: true, lockstep: true`, a one-line `blurb`, and the
   factions (reuse `RA2_COUNTRIES` or list the houses).
4. Tests in `tests/unit/fusions.test.ts`: the map generates and every start can deploy its MCV;
   the request's key promises hold (for example "resources are scarce at home"); dangers behave
   as described; two identical games stay identical (lockstep).

## 3. It joins the Custom Mashup on its own

Adding the pack to `FUSIONS` (step 2 above) is all it needs to appear in the Gold Custom
Mashup — `MASHUP_PACKS` is built from `CLASSIC_PACKS` and `FUSIONS`: its battlefields are offered there, and its
buildings, soldiers, vehicles, aircraft and ships become selectable sets — one per faction,
or one for the pack where every faction fields the same things. There is no mashup data to
author and no service deploy; see `docs/adr/012-custom-mashup.md` for how a mashup is composed.

A pack that reuses another's roster (Leviathan Isles is Red Alert 2's armies) contributes its
battlefields only, so the unit lists are not doubled up.

## 4. Check it

`pnpm exec tsc --noEmit`, `pnpm lint` and `pnpm exec vitest run tests/unit` must pass. The
`fusions are registered and playable` test checks that the pack and lobby style agree.
