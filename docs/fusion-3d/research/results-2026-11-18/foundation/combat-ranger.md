# Measured Ranger combat on Bridgehead

Four headless matches on Fusion commit `84f411478f01ed62365a2e4d1d316eb57d9e193c` measured the same Allied Ranger against two Soviet armor classes. Each encounter ran twice from a fresh game with seed 14077. All timed observations, per-encounter trace digests and final engine checksums repeated. Both scenarios used the standard RA1-style skirmish, original starting units, no AI, and normal queued move and attack commands. [Pack and units](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/packs/ra1.ts#L201)

| Observed outcome, in post-step simulation ticks | Conscript, unarmored, 50 HP | Mobile construction vehicle, heavy armor, 600 HP |
|---|---:|---:|
| Allied player first sees opponent | 556 | 431 |
| Ranger acquires target | 587 | 459 |
| First Ranger damage | 591, opponent 50 → 14 | 462, opponent 600 → 598 |
| Both players have sight and explicit attack commands are enqueued | 592 | 472 |
| Return fire | 593, Ranger 150 → 147 | MCV has no weapon |
| Opponent destroyed | 605, Ranger retains 147 HP | 4,648, Ranger retains 150 HP |
| Final engine checksum | `1925073728` | `631760324` |

At tick 1 the players send their units to neighboring cells (39,22) and (40,22) at the northern crossing. Both targets start outside opposing sight. The Ranger arrives within automatic engagement range before the Soviet unit sees it. Explicit targeting is enqueued after mutual sight, with a Soviet attack order only for the armed conscript. The tabulated times are the outcomes for those two routes and unit speeds. Each run ends immediately after the target dies, with one Allied kill and one Soviet loss. [Automatic acquisition and vision](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/game.ts#L2086)

The Ranger’s `m60mg` fires a two-shot burst, 18 nominal damage per shot, every 14 simulation ticks. Each shot is scaled and rounded down separately. Against an unarmored conscript, two full hits remove 36 HP. Against heavy armor, each shot receives the 10% multiplier and removes one HP. The MCV therefore takes 300 bursts. The first and final MCV hits are separated by 4,186 ticks, exactly 299 refire intervals. The captured ticks are suitable for testing whether a 3D client’s attack, hit and death cues match authoritative combat. Presentation frame times and persistent-world shields require separate measurements. [Weapon firing](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/game.ts#L2735) · [Armor rounding](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/game.ts#L2853)

## Reproduction

Run the harness with Node against the compiled Fusion package at the pinned commit. It performs both matches twice and asserts identical event summaries and HP trace digests. The JSON includes both sides’ positions at the sampled events, kill/loss accounting, intrinsic weapon values, and checksums. The harness observes the simulation after each tick, so two hits within one tick appear as one HP delta. It uses the existing game build without source edits.

```bash
node combat-ranger.mjs /path/to/compiled/packages/fusion > /tmp/combat-ranger-results.json
cmp /tmp/combat-ranger-results.json combat-ranger-results.json
```
