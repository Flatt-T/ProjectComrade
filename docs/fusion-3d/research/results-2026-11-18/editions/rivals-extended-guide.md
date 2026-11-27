# Rivals combat data across dated sources

All **64 combat units** in the Rivals roster match the public community stats workbook. It contains **76 combat or mode rows**, including separate firing modes for Talon and Widowmaker, entrenched MG squads, burrowed Tick Tanks, and staged Giga-Cannon damage. The companion dataset retains each worksheet row number and source label. An August 2023 team-signed EA forum post supplies **33 dated changes on 16 combat units**. The launch articles and the balance changes constitute separate observations. [Community workbook](https://docs.google.com/spreadsheets/d/18Xe16mFIpLvy7OPxoF6-NHCaJwkMf2T6YKXv429woRI/edit) · [August team post](https://forums.ea.com/discussions/command-and-conquer-franchise-en/balance-patch-notes---latest-patch-august-2023/7276141)

| Implementation input | Roster coverage | Evidence and limits |
|---|---:|---|
| Listed cost, producer label, speed band, squad size, rate of fire and damage per shot | 64/64 | Community table. Per-target values and multiple modes remain individually addressable. GDI and Nod use a generic “War Factory” label in places. The primary showcase and navigation facility contexts are retained separately. |
| Health and numeric speed | 63/64 in the ranking worksheet | The Battering Ram has a firing-mode row with a 90-cost, 3,000 structure-damage record. Its ranking row is absent. A separate community release chronology reports 3,300 HP and speed 3.958857. It cites the stats sheet, so those specific values have unverified independence. [Battering Ram chronology](https://cnc.fandom.com/wiki/Battering_ram) |
| Turn rate and hex reservation | 37/64 and 30/64 numeric | Additional-values worksheet. Text such as “N/A” remains distinct from a missing value and from zero. |
| Separate dated purchase costs | 20/64 | Thirteen workbook values agree with an EA showcase and seven differ. Cost agreement corroborates that field only. |
| Later numeric and behavior changes | 16/64 | The August 2023 EA-hosted team post gives before-and-after values. A June 8 field report supplies an independent earlier observation for comparison. The post's migrated author identity and specific client build remain unverified. [June test report](https://cncrivals.blogspot.com/2023/06/new-balance-patch-july-2023.html) · [August team post](https://forums.ea.com/discussions/command-and-conquer-franchise-en/balance-patch-notes---latest-patch-august-2023/7276141) |

**Source dates change how these values can be used.** The workbook’s actual date cell `INTRO!B2` holds December 11, 2019. Its contents include the Catalyst Gunship and Battering Ram, which have EA showcase dates of June 10, 2020 and December 5, 2022. The source describes its baseline as Level 1. Neither the displayed date nor that level declaration certifies every row in this subsequently edited workbook. No build ID accompanies the export. Preserve it as one mixed-vintage community snapshot. For version-specific tuning use the named dated observations, and leave all other fields’ version assignments open. [Catalyst Gunship showcase](https://www.ea.com/able/news/new-unit-showcase-catalyst-gunship) · [Battering Ram showcase](https://www.ea.com/able/news/new-unit-showcase-battering-ram)

| Unit | EA showcase Tiberium | Community workbook | August 2023 team post when covered |
|---|---:|---:|---|
| Grenadier | 60 | 70 | HP 550 → 620 |
| Drone swarm | 10 | 20 | — |
| Orca bomber | 120 | 110 | Cost 110 → 100 |
| Juggernaut | 140 | 120 | — |
| Giga-cannon | 100 | 80 | Stage-two infantry damage 15 → 8 and stage-three damage 30 → 12 |
| Catalyst gunship | 50 | 60 | HP 1,485 → 1,530 |
| Shade | 40 | 70 | — |

Three behaviors need particularly careful versioning. The June testers reported that jump-jet jumping had disappeared and the August team post reported its restoration. The June report described a flat 2.5 Fanatic movement bonus while August described 40%. The June report gives a 0.7-second Giga-Cannon charge-store time and the later post literally gives a greater-than sign before 0.7. The delta file preserves both formulations. [June test report](https://cncrivals.blogspot.com/2023/06/new-balance-patch-july-2023.html) · [August team post](https://forums.ea.com/discussions/command-and-conquer-franchise-en/balance-patch-notes---latest-patch-august-2023/7276141)

## Reproduce the unit match

Acquire the public XLSX export at the URL in `rivals-extended-stats.json`. With Python and openpyxl installed, run the following from the editions folder. The script selects the named combat data and the displayed date, checks every roster match and emits a SHA-256 digest over the selected statistical rows. It preserves blank fields, zero, separate modes, and distinct worksheet observations. Column Q/R on the combat tab are interpreted by position against the corresponding cost and producer records. The numeric speed unit, HP scaling and `_ST` mode names retain the source’s scope. Live capture, raw game configuration and per-unit animation timings remain unverified.

```bash
python rivals-extended-extract.py /tmp/rivals-stats.xlsx \
  rivals-ta-rivals-reference.tsv /tmp/rivals-extended-stats.json
```

The inspected statistical projection has SHA-256 `2a7f5733bb71f8279a6058c15f28c25d4437dccbde84bd3ee6b6d89e097ca5ab`. An updated source workbook can legitimately produce a different projection. The patch records include the original publisher-hosted source URL and the prior capture’s HTML hash. The units’ existing roster, EA showcase dates and linked citations are preserved in `rivals-ta-rivals-reference.tsv`.
