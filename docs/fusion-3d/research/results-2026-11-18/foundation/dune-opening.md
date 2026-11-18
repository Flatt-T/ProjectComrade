# Three-house Dune 2000 opening in the existing Fusion simulation

Atreides, Harkonnen and Ordos each deployed an MCV, placed a Windtrap, built a refinery and barracks, banked spice, trained infantry, produced the house-legal scout and built a distinct combat tank. Two fresh simulations produced identical complete command/event/credit records. Two further game instances independently replayed the recorded 56 commands and then applied a three-command barracks-upgrade branch. Ordinary Game.enqueue and Game.step performed every world mutation. Health, eligibility, banked income and placement were read from the running game.

| Checkpoint | Recorded result |
| --- | --- |
| Tick 1 | Three construction yards replaced their MCVs. |
| Ticks 15 and 197 | Atreides and Ordos laid four-cell slabs. Their Windtraps began at 700/700 HP. Harkonnen built its Windtrap on uncovered rock and it began at 350/700 HP. |
| Tick 1,102 | Each refinery provided one harvester. Light factories became available. Heavy factories remained unavailable to all three houses. |
| Ticks 1,284–1,339 | Each ordinary, level-zero barracks trained a new Trooper. The starting troops were counted separately. |
| Ticks 1,642–1,824 | The three light factories unlocked Heavy Factory. Commands for enemy-house scouts left all vehicle queues empty. Atreides and Harkonnen produced Trikes and Ordos produced a Raider. |
| Ticks 1,968, 2,185, 2,193 | Atreides, Ordos and Harkonnen respectively made their first 7-credit spice deposits. Route, placement and base position differ between houses in this fixture. |
| Tick 2,398 | Atreides produced a Thumper after building the Outpost. The other houses could not purchase it. |
| Tick 3,454 | Actual purchased combat-tank IDs were combattank, combattank-h and combattank-o. Total harvested credits were 1,400, 1,064 and 700 in Atreides/Harkonnen/Ordos order. Final checksum 440717404. |
| Branch tick 3,816 | Upgrading all three barracks enabled Engineers for all three houses. Thumper access remained exclusive to Atreides. The branch checksum was 1318883217. |

The map was Four Sietches, seed 14077, with three non-AI opponents, standard starting credits and worms/crates set to zero. The opening records a particular scheduled build order and legal site selection. Cost, unlocks and timings belong to this compiled Fusion pack. The result does not measure the native Dune 2000 executable, network play, rendering or phone responsiveness.

## Comparison with the English Windows manual

| Manual evidence | Current Fusion behavior | Disposition for a specialist |
| --- | --- | --- |
| Page 36 describes weathering on rock when slabs do not fully cover a building. | The exposed Windtrap started at half the covered HP. Its 350 HP and exposed flag persisted through branch tick 3,816, while both covered Windtraps stayed at 700. | Preserve the observed placement difference in a Fusion fixture. Verify native weathering cadence and any health-floor behavior separately before changing ongoing damage. |
| Pages 37–38 connect the Wind Trap, Refinery and Light Factory. Page 37 describes a refinery holding 1,000 solaris of spice. | The opening confirmed the production chain and three legal refinery payouts. The pack declares storage 2,000 on each refinery. | Test storage saturation separately. The observed banking loop supplies income evidence; its native capacity and rate remain edition-specific. |
| Page 39 lists Refinery as the Heavy Factory prerequisite. | The heavy factory was blocked after the refinery and became eligible after the light factory. The pack explicitly lists lightfactory as its prerequisite. | Record the additional prerequisite as an existing Fusion difference. Preserve or revise it through a scoped adaptation decision. |
| Page 40 requires an upgraded Barracks for Troopers. | All three unupgraded barracks manufactured one. | Track a versioned prerequisite difference and test the blocked state if a native-equivalent profile is approved. |
| Page 41 describes Thumpers for any house in multiplayer with an upgraded barracks. | The existing skirmish allowed only Atreides, required an outpost, and manufactured one without the upgrade. Upgrading every barracks still left Harkonnen and Ordos blocked. | Keep house, mode, outpost and upgrade requirements as separate rules and reproduce native multiplayer before freezing equivalence. |
| Pages 41–42 assign the Trike to Atreides/Harkonnen, the Raider to Ordos and the combat tank to all three houses after the Heavy Factory. | Every legal scout and house tank exited its producer. Three hostile-house scout build attempts were rejected. | Reuse this as an access regression when original rigs and faction-specific movement are introduced. |

The manual SHA-256 is 05e11724256310251458a93dd7866d38c3db917b757def582246e7b3621940a2. [Publisher manual mirror](https://oldgamesdownload.com/wp-content/uploads/manuals/dune-2000_win_manual_en_8jn.pdf) · [Page-indexed manual findings](../editions/dune2000-manual-to-fusion.json)

Run `node dune-opening.mjs /absolute/path/to/compiled/fusion` and compare complete stdout with dune-opening-results.json. The result records seed, roles, exact commands and application ticks, source commit and SHA-256 for five compiled files. Full opening result SHA-256 6e71f23a5f8b640b43b075738e072af547e12818509bc08c6e9ae631c65fef0d. [Runner](dune-opening.mjs) · [Recorded result](dune-opening-results.json)
