# Fusion engine baseline and gap audit

Audit date: 18 November 2026. Repository: [Flatt-T/ProjectComrade](https://github.com/Flatt-T/ProjectComrade). Inspected default branch: `main`; pinned commit: [`84f411478f01ed62365a2e4d1d316eb57d9e193c`](https://github.com/Flatt-T/ProjectComrade/commit/84f411478f01ed62365a2e4d1d316eb57d9e193c), committed 17 November 2026 00:09 UTC. The open pull-request collection returned an empty list during this audit. The recursive source tree contained no `AGENTS.md`. Refresh these observations before implementation; neither a commit nor an empty PR list proves what is deployed.

## Main finding

Fusion already has a substantial deterministic RTS simulation and persistent-world infrastructure. Its present visual path is Canvas2D, and its gameplay data deliberately mixes approximated classic rules with later additions and balance changes. It is therefore a useful foundation for the new homage, but neither its large catalogue nor its existing procedural models establish the requested full-3D, fully animated, series-complete game.

The appropriate upgrade is an incremental replacement of the presentation and extension of authoritative world and gameplay contracts. A wholesale engine rewrite would discard working persistence, command ordering and protection rules while still leaving the content and art workload unresolved. Keeping the current appearance and adding more unit names would also leave the principal gap unresolved.

## What is present and what the source actually proves

| Area | Observed implementation | Meaning for the upgrade |
| --- | --- | --- |
| Simulation | `core.ts` defines 256 leptons per cell, 15 ticks per second, seeded xorshift randomness and an integer checksum helper. `Game` is headless and command driven. | Preserve time and coordinate semantics for legacy profiles; visual frame rate must never alter combat. Cross-runtime determinism remains a test obligation, not a conclusion drawn from a comment. |
| Rendering | `render.ts` obtains a `CanvasRenderingContext2D` with `canvas.getContext('2d')`. `art/forge.ts` projects procedural primitive meshes into cached sprites. | The existing meshes are useful references and possible temporary development geometry. They are not a live GPU 3D scene, a rigged model library or proof of animation coverage. |
| Art mapping | Renderer chooses shapes and cached facings; `FACINGS = 32`; separate hull and turret drawing exists; some classic packs load classic artwork. | A real model/rig/material/animation manifest must replace shape-only adequacy. Do not silently count one generic tank shape as completion of every faction vehicle. |
| Terrain | `MapData` stores terrain indices, resources, concrete, occupied cells and decorative values. `worldgen.ts` derives terrain from height noise but does not preserve a general authoritative elevation/surface graph. | Add versioned elevation, surfaces, topology and transitions. Render-only relief cannot govern bridge clearance, cliffs or line of fire. |
| Navigation | `path.ts` implements deterministic, single-grid A* with stable tie-breaking; aircraft go directly to the goal; other movement uses terrain flags and one occupancy layer. | Preserve old pathing for old profiles; layered navigation is necessary to distinguish a bridge deck from a ship beneath it. |
| Bridge combat | The persistent decision register retains `DEC-OPEN-2` for destruction/repair. Current `MapData`, terrain and path contracts have no bridge entity lifecycle. | This is new gameplay, persistence and navigation work, not a material or model swap. A design specification and replayable acceptance fixture precede implementation. |
| Economy and abilities | The rule schema and large `game.ts` implement harvesting, production, power, upgrades, transports, aircraft ammunition, engineer capture, spies, mind control and multiple superweapon types. | Reuse verified mechanics; catalogue each required source mechanic against exact behavior. Shared flag names do not establish original semantics. |
| Fusion multiplayer | `FusionBattle.tsx` selects `LockstepSession` with `conn.transport()` when more than one human plays; `session.ts` exchanges ordered command turns. | Preserve mode-specific turn ordering and test unique commands issued by both clients. |
| Native Classic multiplayer | `contracts/src/index.ts` sets `td-classic` and `ra1` to `lockstep: false`. `Battle.tsx` routes native `comrade_order` locally. The room relay accepts turn traffic only for lockstep modes. | A shared native Classic lobby is not synchronized native multiplayer. Route this existing gap to the Classic programme; do not report a two-client same-seed display as a multiplayer pass. |
| Persistent simulation | The service runs the same headless `Game`, journals commands, snapshots state, fences region authority and restores/replays. The latest commit changes lease renewal and yielding during quiescent fast-forward. | Keep these invariants. Live wake, restart, replay and rollback evidence must be refreshed against the actual deployed artifact. |
| Persistent browser replication | `apps/web/src/mmo.ts` restores a complete simulation and consumes journal effects. It deliberately renders behind the server; the constant is ten ticks. ADR014 explicitly acknowledges hidden-state exposure. | A fog material does not make this protocol secure. Competitive fog requires a distinct authorized projection protocol or an equally evidenced alternative. |
| Snapshots | `GameSnapshotV1` serializes entities, queues, fog, mutable map arrays and pending commands; static map layers are regenerated from pack/preset/seed. | Preserve v1 readers and pinned generators. A new map/bridge system requires versioned snapshots, full mutable topology coverage and an explicit migration path. |
| Content fingerprints | `fingerprints.ts` hashes engine identity, resolved pack, rules and worldgen inputs. Old rows with null fingerprints are not falsely stamped. | Do not bypass a mismatch to make a new build start. Split presentation identity from authoritative simulation identity through a versioned design, preserving historical fingerprints. |
| Test commands | Root `test:unit` and `test:integration` run Vitest. Root `test:e2e`, `test:parity`, `test:security` and `test:performance` print “not yet implemented”. `tools/browser-smoke.mjs` exists separately. | Replace placeholder gates with executable suites. A successful echo script is no evidence. Existing unit/integration and smoke evidence must be reported separately. |

Sources: [core](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/core.ts), [renderer](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/render.ts), [forge](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/art/forge.ts), [map](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/map.ts), [path](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/path.ts), [world generator](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/worldgen.ts), [persistent decisions](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/docs/persistent-world/DECISIONS.md).

Sources for mode and persistence claims: [mode registry](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/contracts/src/index.ts), [native battle client](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/apps/web/src/Battle.tsx), [Fusion battle client](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/apps/web/src/FusionBattle.tsx), [room relay](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/apps/service/src/rooms.ts), [persistent client](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/apps/web/src/mmo.ts), [snapshot implementation](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/persistent.ts), [ADR014](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/docs/adr/014-persistent-engine-profile.md), [fingerprints](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/apps/service/src/mmo/fingerprints.ts), [root scripts](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/package.json).

## Content enumeration at the pinned commit

Definitions were enumerated from a read-only copy of the pinned TypeScript modules, transformed locally solely to import their pure pack definitions and call `composeWorldPack`. This was not a gameplay test or a complete TypeScript build. `content-enumeration.json` records the output.

| Pack | Unit definitions | Structure definitions | Faction entries | Map presets |
| --- | ---: | ---: | ---: | ---: |
| Tiberian Dawn Style | 27 | 27 | 2 | 7 |
| Dune Style | 28 | 22 | 3 | 5 |
| Red Alert Style | 34 | 33 | 2 | 5 |
| Red Alert 2 Style | 44 | 43 | 9 countries | 6 |
| Leviathan Isles | 44 | 43 | 9 countries | 1 |
| Star Wars Conquer | 127 | 43 | 4 | 5 |
| Irregular Warfare | 64 | 27 | 4 | 4 |
| Holdouts | 63 | 27 | 4 | 4 |

The universal persistent pack composes **535 unit definitions and 481 structure definitions**, with 22 structure choices, 24 infantry choices, 24 vehicle choices, 21 aircraft choices and 17 naval choices. These are composed definitions and include namespaced source choices and synthesized services. They must not be advertised as 1,016 unique, fully modelled, source-accurate C&C objects. The registered source packs do not include Tiberian Sun, Firestorm, Yuri's Revenge as its own roster, Generals/Zero Hour, C&C3/Kane's Wrath, Red Alert 3/Uprising or C&C4.

The C&C/Dune source-family packs currently provide 133 unit definitions and 125 structure definitions in total. Those totals also include additions: they are not a verified original roster inventory. Source links: [pack index](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/packs/index.ts), [fusion index](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/fusions/index.ts), [mashup registry](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/mashup.ts), [world composition](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/worldpack.ts).

## Why the current gameplay can feel unlike the source games

[ADR010](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/docs/adr/010-fusion-engine.md) explicitly calls statistics approximations and documents later additions. It added upgrade gates and late structures to the older packs, more than one superweapon per side, and normalization of power classes across packs. Some tests then require these additions. The resulting behavior may be internally consistent while failing the intended historical feel.

The new programme must maintain three explicit concepts:

1. **Native Classic:** preservation-engine behavior and original projection where supported, with its own outstanding multiplayer/fidelity work.
2. **Legacy Fusion:** the exact historical pack/rules versions required to load existing saves, replays and regions.
3. **Fusion homage:** the owner's requested 3D game with researched source identities, deliberately documented adaptations and complete content coverage.

The same unit name in two eras is not a sufficient shared identity. Bind content to source game, expansion, faction, variant and revision. Record the adaptation when a unified competitive profile changes economy, scale, prerequisites or timings. Preserve originals in evidence; do not retroactively describe adapted numbers as reference values.

## Specific risks the plan must close

- Adding bridge meshes without surface identity would let a tank and a ship collide on the same cell or prevent the ship from passing at all.
- Letting animation events apply damage would make combat depend on renderer frame rate, device performance or missing assets.
- Regenerating legacy terrain using a changed algorithm would silently change persistent regions and invalidate replay.
- Changing the pack registry in place would alter hundreds of composed world identifiers and prerequisite mappings.
- Using a deployment commit as a single engine fingerprint makes a presentation-only update potentially incompatible with pinned regions; redesign requires an explicit version transition, not relaxed checks.
- A screenshot can hide missing animations, failed build chains, broken transports or absent opponent commands. Acceptance must include timed video, scripted command journeys and state evidence.
- Existing `DEC-OPEN` notes may be superseded by later owner decisions. Allied capture consent and shield rules use the latest approved COMRADE19/20 direction; earlier prohibitions must not be reintroduced.

## What this audit did not establish

No production server was changed. No claim is made that current live Classic or beta journeys, disaster recovery or the test suite pass at this commit. No current device performance benchmark was run. No licensing conclusion is inferred from a source file saying “original” or “freeware”. These are explicit implementation and release gates in the task register.
