# Historical object and rules research, 1995 to 2003

**Original media comparisons.** For Tiberian Sun and Firestorm, the named disc and revision determine which rules, art and terrain fields apply. For Red Alert 2, the verified 1.006 rules match every named section of the comparison rules, while the community art introduces 115 additional sections and changes 112 shared ones. The English Yuri 1.001 rules differ from the comparison rules on 25 named sections. The measured corrections accompany the original observation rows. [TS and Firestorm discs](ts-retail-verification.md) · [RA2 disc and applied update](ra2-patch-disc-provenance.md) · [Yuri rules](ra2-patch-provenance.md)

Eight edition-specific fact archives support the Fusion roster, animation, terrain and simulation work. Read each row as an observation of a particular source. Model names, game icons, original sequences and filenames are identifiers for comparison. Author new meshes, animation, textures, effects and audio for Fusion.

| Edition | Inventory denominator | Further evidence | Direct qualification |
| --- | ---: | --- | --- |
| Tiberian Dawn | 113 constructor declarations | 66 buildings, 22 ground units, 20 infantry, 5 aircraft, 680 labelled infantry-action rows | Includes obsolete, scripted and civilian declarations. The companion world/td-covert-missions.md verifies the installed Covert Operations placements from two archival disc copies. |
| Red Alert | 149 constructor declarations | 87 buildings, 26 infantry, 22 ground units, 7 aircraft, 7 vessels, 273 labelled infantry-action rows, all 149 heap registration anchors | Includes expansion flags and experimental code. Separate community comparison has 209 base rule sections, 39 Aftermath and 8 multiplayer rule sections with selected facts. |
| Tiberian Sun | 237 registered type/group pairs | 236 rules sections, 233 art matches, 40 referenced weapon definitions, 6 shared animation sequences | JEEP is registered without a definition. |
| Firestorm | 265 registered type/group pairs in merged profile | 264 rules sections, 260 art matches, 49 referenced weapons, 6 shared sequences | Adds 28 registered pairs and changes selected fields of 29 base pairs. JEEP remains unresolved. |
| Red Alert 2 | 409 registered type/group pairs | 403 rules sections, 402 comparison-art matches, 137 referenced weapons, 25 shared sequences | Six section omissions listed in isometric-summary.json. Art originates in CnCNet's RA2 compatibility pack. |
| Yuri's Revenge | 559 registered type/group pairs | 553 rules sections, 549 comparison-art matches, 204 referenced weapons, 37 shared sequences | 156 additions and 6 removals compared with the base registry. Six section omissions listed individually. |
| Generals | 1,300 distinct SAGE declarations | 1,129 objects, 171 reskins, 9,553 presentation states, 79 explicit construction-menu slots, 180 weapons and 42 powers | Counts include scenery, projectiles, cinematic variants, helpers and map objects. |
| Zero Hour | 2,103 distinct SAGE declarations | 1,868 objects, 235 reskins, 27,801 presentation states, 552 construction-menu slots, 363 weapons and 79 powers | General-specific variants are preserved. The challenge boss appears in configuration as a playable template. Verify availability separately in each mode. |

The eight inventory totals are 5,135 edition-specific rows. Related profiles repeat identities. The two SAGE object sets expose 78 and 431 distinct targets linked to explicit construction buttons. Graphs start at each player template's declared starting building and units. They include alternative command sets encountered in upgrade modules. They omit purchases gated by actual state, captures, grant-only spawns, scripts, modes and map overrides. Treat the graph as a discovery aid for menu verification.

## Finding a fact

Open the ZIP for the edition. Every member contains one JSON object per line. A class can use an internal ID that describes a different unit in another title. Use edition plus class plus ID. The manifest records each member's row count, SHA-256 and size. For source lines in the 37,354 SAGE state records, join the state ID to the object's source URL and replace the anchor with the state's line number. The state preserves its condition or transition type, associated aliases, presentation model, animation/idle animation, aim parts and firing effects where declared. Empty properties can inherit a default, be implemented by a module, or require retail evidence.

- TD and RA1 definitions expose source constructors, compile guards, shared and branch-specific fields. Infantry links use the TD do_table or RA1 control field. A frame index or count is a legacy sprite-layout observation. Frame counts alone give neither animation seconds nor authoring rights.
- Isometric definitions carry indexed registry evidence, selected gameplay fields, art binding, country restrictions, alternate deployment forms, weapon slots and sequence pointers. Case-insensitive house indexes conservatively flag declared owner, exclusive-house and negative-tech results. A prerequisite is a token or category and can require additional buildings or game state. Damage, range, ROF and speed retain original units. Weapon profiles resolve referenced projectile and warhead sections separately. Edition deltas compare selected raw property values and spelling. Firestorm merges base IDs and add-on IDs even where the expansion restarts the numeric list.
- SAGE files expose object declarations, parent ID, direct field observations, optional command-set variants, reachability from each template, locomotion, upgrade and science definitions, terrain materials and armor response. A direct object field can summarize multiple conditional modules. To resolve an exact interaction, follow the source anchor and read the enclosing module and conditions. SAGE frame times, ticks, seconds, cells, game distances and credits remain explicitly distinct.
- The 274 PortableRA maps include 171 temperate, 99 snow and 4 interior. All contain parsed map/basic sections, 46 supply entity overrides, and 64 have candidate filenames confirmed by a legacy filename hash. Individual records hold immutable package/member checksums, byte offsets, dimensions, initial house/type counts, terrain prop counts, packed payload chunk counts and trigger/team counts. Many are multiplayer, custom or bundled. File hash matches are candidates until corroborated by a campaign index or retail disc. The three-rule-layer fact file keeps expansion and multiplayer overrides separate. Compare the publisher demo against the PortableRA rows using the sibling edition research.
- The TS temperate definition registers 82 tilesets declaring 1,032 tiles. Snow registers 71 declaring 1,062. Two sets may share a graphic convention. Counts include editor-only and placeholder sets. The state/type catalog contains IDs and semantic roles, without original bitmaps. Generals and Zero Hour identify 235 and 290 terrain materials respectively. Their archives also include 145/182 locomotors, 29/53 armor tables, 53/96 sciences and 39/82 upgrades.

## Evidence and acceptance

EA's released early C++ is primary evidence of constructor inputs and build branches. For TS and Firestorm, the Vinifera project preserves an explicitly versioned 2.03 data revision. Five complete text files match the UK Firestorm 2.0 disc after newline normalization. Snow matches the base Nod 1.08 disc. The two base art differences and three added rules fields are itemized in [the retail comparison](ts-retail-verification.md). Red Alert 2 and Yuri's Revenge rules use uploader-labelled original files at one immutable commit. Their presentation references use a different publisher-independent community compatibility pack. Confirm both against the chosen retail patch before authorizing exact timing or country/mode release status. The community Generals data import matches its preceding OriginalCCG Git blobs on all 19 selected inputs. Zero Hour uses the explicit OriginalZH directory. Both remain separate from EA's released game engine source. The eight manuals in manual-sources.json are publisher documents retrieved from mirrors and fingerprinted. Page numbers in the guides are one-based PDF pages. The PortableRA comparator uses a separately locked ZIP package and never executes bundled software.

A verified declaration can advance an entity's research state. A release-ready entity still needs the chosen profile, a positive production or scenario path and exclusion evidence for other modes, independent confirmation of disputed material, original asset provenance, benchmark playback, and an editor/runtime test. For any unresolved ID, record the exact evidence type and owner in its task. Never synthesize an unlisted model, faction or fire timing as a historical fact. The public captures do not supply footage for every unit or visibility/latency samples on target mobile devices.

## Reproduce

Use Python 3.10 or newer. In this directory run the following commands. The ZIP comparator requires the exact download named in ra1-portable-summary.json. Inputs can live in a local directory supplied as the first argument to the extractors.

```sh
python fetch_inputs.py
python extract_early.py
python extract_isometric.py
python extract_sage.py
python extract_world_systems.py
python curate_eras.py
python extract_ra_portable.py /path/to/PortableRA.zip
python package_facts.py
```

The first command verifies both the Git blob digest and SHA-256 for each of 92 files, including cached copies. The packager validates locked source anchor bounds, fixtures, reskin parent and menu-target joins, ZIP CRC and content hashes. Match each generated archive SHA against archive-manifest.json. No retail media, original model, animation or texture is part of the distributable fact archives. The source-input lock and generated results allow a reviewer to inspect the corresponding original definitions directly.
