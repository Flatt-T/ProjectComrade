# The Covert Operations CD mission and terrain census

Two archived English PC CD recordings have the same COVERT volume directory and identical contents for the three mission-bearing MIX files. The recorded disc README, section 1.2, lines 171–172, advertises seven new GDI missions, eight new Nod missions and ten new multiplayer maps. The installed SC-001 archive contains exactly seven GoodGuy and eight BadGuy scenarios. It also contains eleven multiplayer-labelled scenarios. Ten have candidate IDs in the 50–98 range, and the eleventh is SCM10EA, Red Sands. The archive shows presence. Its position does not establish which ten Westwood counted as new. Preserve all eleven and retain that discrepancy in the release ledger. [Disc recording A](https://archive.org/details/redump-id-28908) · [Disc recording B and publisher installation instructions](https://archive.org/details/command-conquer-the-covert-operations)

| Original package | Scenario INI rows | Paired binary terrain files | Interpretation |
| --- | ---: | ---: | --- |
| GENERAL.MIX | 48 | 48 | On-disc shared scenarios, including related base maps and earlier variants of the five SCJ maps. |
| INSTALL/SC-000.MIX | 5 | 5 | Five dinosaur missions. All five correspond to different INI payloads under the same filename candidates in GENERAL.MIX. Four terrain binaries match, the fifth differs. |
| INSTALL/SC-001.MIX | 26 | 26 | Fifteen GDI/Nod missions and eleven multiplayer scenarios. Thirteen use temperate terrain, twelve desert and one winter. |
| Across all three packages | 79 | 79 | Seventy-four distinct filename candidates. A package-level row remains necessary for each of the five duplicate names. |

The linked full fact file preserves each member digest, physical CD extent and fetched-byte checksum, logical file digest, initial placements by house and object type, terrain props, template frequencies, map rectangle, type counts per scripted team and team/trigger counts. Submitted team quantities are sums of declared team compositions. They do not bound the number spawned in a match. File references use the legacy 32-bit name hash and companion terrain hash lookup. The public archives advertise different full-track SHA-1 values and lengths. Only the named extents were fetched. Both yield identical mission-member hashes. These are archival copies of the same game data, with no implication of independent runtime playback.

## Installed single-player missions

Counts cover initial placements. The scenario scripts can introduce additional objects during play. Source theatre names retain their historical spelling.

| Side | Candidate source ID | Mission | Theatre | Infantry / units / aircraft / structures | Teams / triggers |
| --- | --- | --- | --- | --- | --- |
| GDI | SCG22EA | Blackout | TEMPERATE | 11 / 3 / 0 / 30 | 17 / 14 |
| GDI | SCG23EA | Hell's Fury | TEMPERATE | 25 / 3 / 0 / 39 | 16 / 16 |
| GDI | SCG36EA | Infiltrated! | DESERT | 8 / 30 / 0 / 30 | 14 / 10 |
| GDI | SCG38EA | Elemental Imperative | TEMPERATE | 48 / 18 / 0 / 50 | 12 / 14 |
| GDI | SCG40EA | Ground Zero | TEMPERATE | 56 / 6 / 0 / 15 | 9 / 15 |
| GDI | SCG41EA | Twist of Fate | DESERT | 66 / 48 / 0 / 58 | 14 / 15 |
| GDI | SCG50EA | Blindsided | DESERT | 38 / 4 / 0 / 65 | 22 / 20 |
| Nod | SCB20EA | Bad Neighborhood | DESERT | 12 / 6 / 0 / 43 | 16 / 22 |
| Nod | SCB21EA | Deceit | TEMPERATE | 77 / 7 / 0 / 43 | 21 / 25 |
| Nod | SCB30EA | Eviction Notice | DESERT | 29 / 25 / 0 / 49 | 16 / 18 |
| Nod | SCB31EA | The Tiberium Strain | TEMPERATE | 88 / 13 / 0 / 41 | 4 / 10 |
| Nod | SCB32EA | Cloak and Dagger | TEMPERATE | 24 / 12 / 0 / 41 | 15 / 15 |
| Nod | SCB33EA | Hostile Takeover | DESERT | 4 / 12 / 0 / 40 | 22 / 23 |
| Nod | SCB35EA | Under Siege: C&C | TEMPERATE | 52 / 29 / 0 / 38 | 5 / 8 |
| Nod | SCB37EA | Nod Death Squad | DESERT | 36 / 15 / 0 / 28 | 5 / 7 |

## Dinosaur and multiplayer coverage

The installed SCJ01EA starts with one each of STEG, TREX and TRIC under Special. SCJ02EA introduces five RAPT among its starting creatures. The installed SCJ04EA places 37 RAPT plus other creatures under Special. In installed SCJ05EA, Multi4 owns nine RAPT, four STEG, one TREX and three TRIC alongside a Nod opposition force. GENERAL.MIX and SC-000.MIX versions of SCJ05EA have different terrain binary hashes, trigger counts (16 versus 18) and team-definition counts (9 versus 14). Never deduplicate them by displayed mission title. The installation booklet directs players to the New Missions command. The dinosaur scenarios require separate mode-availability evidence.

| Multiplayer candidate | Internal map name | Theatre |
| --- | --- | --- |
| SCM10EA | RED SANDS | DESERT |
| SCM50EA | Emerald Highlands | TEMPERATE |
| SCM51EA | Four Corners | DESERT |
| SCM52EA | Cactus Valley | DESERT |
| SCM60EA | Monkey in the Middle | DESERT |
| SCM61EA | King of the Mountain | TEMPERATE |
| SCM62EA | Surgical Incision | TEMPERATE |
| SCM75EA | Village of the Unfortunate | TEMPERATE |
| SCM90EA | A Long Way from Home | TEMPERATE |
| SCM97EA | Northern Explosion | WINTER |
| SCM98EA | Diverse Region | DESERT |

## Reconciliation and implementation fixtures

The existing CnCNet GENERAL.MIX comparison has 67 scenario records. Of the 48 disc GENERAL.MIX records, 43 match a candidate filename in that community package, 21 share the exact scenario INI bytes and 35 share the same terrain binary. Neither installed expansion archive shares a candidate filename with that 67-row community set. Use the disc records for these installed-map observations. Review route and script variants individually before porting.

For a terrain and stealth encounter, use the Cloak and Dagger record SCB32EA to specify its temperate map, the BadGuy, GoodGuy and Neutral placements, and the differences between initial actors and reinforcement teams. The source row explicitly reports temperate terrain, 24 initial infantry, 12 ground units, 41 structures, 15 team definitions and 15 triggers. For the GDI opening in Blackout, SCG22EA contains 11 initial infantry, 3 ground units, 30 structures, 17 team definitions and 14 triggers. Test mobile reinforcement entry and a preplaced formation separately. For prehistoric actor motion, check each of the four creature IDs against independently authored silhouettes and locomotion, plus owner changes between the SCJ encounters. These are authored test scenes. Pacing, trigger execution order and menu visibility require the selected game executable or an independently validated scenario interpreter.

Run the companion script with Python 3 and --cache set to a local temporary directory. It uses HTTP byte ranges, validates every Mode 1 sector signature and checks each response range and track length. Preserve the input bytes privately for rechecking as needed. No CD image, original map binary, scenario script, audio or art is redistributed. [Full structured facts](td-covert-disc-facts.json.gz) · [Summary and reproducibility hashes](td-covert-summary.json) · [Extraction tool](td-covert-research.py)
