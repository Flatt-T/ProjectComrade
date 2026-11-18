# What the terrain and bridge evidence establishes

The parser measured every .map member in the seven named directories of EA’s public mod-support archive. Each row has both the publisher Git blob and a SHA-256 of the exact file. Internal, library and official-directory paths stay visible. Some folders named official even contain tests. A file in that directory alone cannot certify a shipped map.

| Family | Map files | Distinct hashes within family | Material identifiers | Files with a bridge-named placed object |
|---|---:|---:|---:|---:|
| Generals | 264 | 263 | 220 | 54 |
| Zero Hour | 402 | 401 | 241 | 93 |
| Tiberium Wars | 352 | 352 | 326 | 50 |
| Kane’s Wrath | 398 | 396 | 375 | 49 |
| Red Alert 3 | 206 | 206 | 361 | 40 |
| Uprising | 254 | 254 | 394 | 48 |
| Tiberian Twilight | 241 | 213 | 488 | 17 |

The binary parser decompresses EAR/RefPack or ZL5/zlib when needed, resolves the chunk-name table, validates width × height against the height data and reads placed object type strings. The blend table lists materials available to the map. It does not measure the area drawn with each material. Raw elevation bounds use the original sample widths. Compare them within the specified edition until vertical scale has been measured. The bridge column counts object identifiers containing “bridge”. Those can be scenery, ruins, towers or a playable span. The path graph and rule can only be established with the corresponding object definition and observed traversal.

The XML index produced 522 filename-bearing metadata records. The binary/header cross-check gave 459 header agrees, 50 metadata lacks header values, 13 unmatched. Read [the cross-check](metadata-crosscheck.jsonl) for each exact path and disagreement. A match tests width, height and border. The published CRC is retained without assuming its algorithm.

## Maps for the first art reviews

| Family | Source environment | Map and measured material or placement | Review at touch zoom |
|---|---|---|---|
| Generals | alpine and snow | [CHI04](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Generals/Maps/official/CHI04/CHI04.map) · SnowLargeType1, CliffMediumType17bsnowy, CliffLargeType1snow | Keep dark track silhouettes and pale road edges distinguishable on the snow. |
| Zero Hour | desert and dry industrial | [USA05_EndsConflict](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Zero%20Hour/Maps/official/USA05_EndsConflict/USA05_EndsConflict.map) · SandLargeType3Rocky2, SandMediumType9, SandMediumType12Grassy | Separate traversable sandy flats from rock shelves with shape and value. |
| Tiberium Wars | contaminated zone | [MAP_SP_GDI_5_1_Tower](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Tiberium%20Wars/Xml/Maps/official/MAP_SP_GDI_5_1_Tower/MAP_SP_GDI_5_1_Tower.map) · DirtRedZone01, Tiberium01, DirtRedZone10 | Use a contamination transition distinguishable from team colour. |
| Kane’s Wrath | uplifted rock and cliff | [BAMAP_KK03_3](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Kanes%20Wrath/Xml/Maps/official/BAMAP_KK03_3/BAMAP_KK03_3.map) · CliffYellowZone06, CliffYellowZone08, CliffYellowZone07 | Use ledges and ramp silhouettes to communicate passable grade. |
| Red Alert 3 | coast and island | [MAP_MP_4_BLACK_XSlice](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Red%20Alert%203/Xml/Maps/official/MAP_MP_4_BLACK_XSlice/MAP_MP_4_BLACK_XSlice.map) · Dirt_Yucatan01, Rock_Yucatan03, Dirt_Yucatan02 | Keep shore, shallow water, docks and offshore structures readable from the same camera. |
| Uprising | urban pavement | [CAMP_S09_NewYork_Rao](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Uprising/Xml/Maps/official/CAMP_S09_NewYork_Rao/CAMP_S09_NewYork_Rao.map) · Pavement_CapeCod01, Pavement_SaintPetersburg02, Pavement_Yucatan01 | Maintain an uninterrupted traversable road silhouette through dense city props. |
| Tiberian Twilight | bridge structures | [MAP_MP_10_PanAmerica_1](https://github.com/electronicarts/CnC_Modding_Support/blob/3aad8e412961ab543192ae70f8503dc8e178e095/Tiberian%20Twilight/Xml/Maps/official/MAP_MP_10_PanAmerica_1/MAP_MP_10_PanAmerica_1.map) · PARUINEDBRIDGE01, PARUINEDBRIDGE02, PARUINEDBRIDGE03 | Mark ruined or ornamental geometry separately from a live topology edge. |

Use [the aggregate data](world-comparisons.json) to select variants and the title JSONL files to find the complete material table, counts, raw elevations and source hashes. For every commissioned original terrain kit, record walk/build/naval classes, shore geometry, lighting, team masks, resource and hazard read, prop persistence and connected transition pieces. Keep map compositions original. Test seams across road–mud, snow–rock, build pad–shore and deck–ramp at normal camera height. Render quality may simplify waves or grass while preserving deck, underpass, occupancy, fog and selection.
