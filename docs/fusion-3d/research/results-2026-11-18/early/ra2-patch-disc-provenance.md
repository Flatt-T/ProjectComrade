# Red Alert 2 retail disc and the official English 1.006 update

**The 1.006 rules comparator is exact at the parsed field level. The art comparator needs 227 section-level decisions.** An original Allied disc furnished the exact source container required by the Westwood patch. Applying its actual delta produced the following directly recovered files.

| Comparison | Names shared | Equal ordered field lists | Shared sections with differences | Sections present on only one side |
|---|---:|---:|---:|---|
| Original disc → 1.006 RULES.INI | 1,190 | 1,176 | 14 | 0 |
| 1.006 RULES.INI → current RA2 rules comparator | 1,190 | 1,190 | 0 | 0 |
| Original disc → 1.006 ART.INI | 1,299 | 1,299 | 0 | 0. The files are also byte-identical. |
| 1.006 ART.INI → current RA2 comparison art | 1,299 | 1,187 | 112 | 115 comparator-only, zero official-only |

For a model, rig, sprite or effect work order, look up its art section in the [227-row correction ledger](ra2-patch-art-corrections.tsv). Each of 112 changed sections includes every key/value pair unique to the official file and every pair unique to the comparator, including repeated-key multiplicity. For the 115 remaining rows, exclude the comparator-only section from a claim about 1.006. A change in original art binding still requires separate original-asset authoring and gameplay validation. For instance the comparator adds SecondaryFireFLH and ElitePrimaryFireFLH to ADOG; neither field is present on that official section. The [full structured comparison](ra2-patch-disc-comparison.json.gz) includes all per-section digests and both original-to-patch and patch-to-comparator differences. Collection paths are comparisons → ART.INI or RULES.INI → base_to_1006 or 1006_to_existing_comparator. Within a pair, differences is keyed by exact section name. The left/right values follow those comparison directions.

The fourteen rules changes include CRElectricBolt, whose source ROF changes from 30 to 45. Use the original values for the original disc profile and the updated values for the English 1.006 profile. Neither numeric equality nor title identity independently establishes campaign accessibility, inherited defaults or real-time animation duration.

## Tested English media

| Archive item and member | Directory/extent measurement | Use in this result |
|---|---|---|
| [European two-disc image](https://archive.org/details/CC_Red_Alert_2_Europe_201708), RA1.img | 793,734,144 bytes; volume RA1; catalogued full-track SHA-1 de45484501e23644bff166d47919aeb88fc5a121. INSTALL/GAME1.CAB starts at sector 243773 and is 158,758,291 bytes. | Read the entire cabinet through bounded 2352-byte physical sectors with 2048-byte data payloads. The Allied INSTALL/GAME.EXE has fixed file version **1.0.0.1**. Cabinet size and digest, both nested data archives, retail and patch checksums were verified. |
| [Same archive](https://archive.org/details/CC_Red_Alert_2_Europe_201708), RA2.img | 731,761,296 bytes; volume RA2; catalogued track SHA-1 118db5405ce63b3911d1a274a10fa54f8e81be0d. INSTALL/GAME1.CAB starts at sector 217424 and has the same size. | Checked directory and cabinet header. Its first 2,048 logical bytes match the Allied header; full cabinet equality was not inferred. |
| [Separately hosted EU ISO](https://archive.org/details/ra-2_20251001), RA2.iso | 670,351,360 bytes; volume RA2; catalogued image SHA-1 6beee4eaa462cee4e84068da76c3b5b056730613. The ISO directory names the cabinet INSTALL/GAME1_07, starting at sector 233771. | Checked directory and cabinet header. It declares the same two installed members and lengths, with the same header hash. Scope is those bytes; the catalogued track SHA-1 was not recomputed for any entire optical image. |

Each directory had 232 non-directory file entries. All three MS cabinet headers specify language.mix at 53,105,368 bytes and ra2.mix at **281,074,192 bytes**. The full Allied cabinet SHA-256 is 74f714560536804ad184b326fafa8134c38de7617bef9ab89b86c59899a29a62. [Native media measurements, names, executable digest and exact extents](ra2-patch-disc-media.json)

## Read and validate

The English patch EXE from C&C Labs and a separately downloaded archived executable both have SHA-256 9b66734863c12f7634c44ef9a401a136d897010eed10f3aafe28d5a424e48156. The Allied CAB's second MSZIP folder extracted to the original RA2.MIX. Both independent rolling checksum values and file size matched the patch record. Decompressing and applying its 936,760-byte opcode stream produced the expected 281,888,480-byte destination and matched both target checksum values. The SHA-1 trailers embedded in each outer and inner MIX were checked before reading individual rules and art records. [Patch mirror with publisher attribution](https://www.cnclabs.com/downloads/details/943/) · [Independent patch archive](https://archive.org/details/ra-21006-en)

| Container or member | Original / 1.006 size | Original / 1.006 SHA-256 |
|---|---|---|
| RA2.MIX | 281,074,192 / 281,888,480 | adea10f3125700257362bc73a3ac73647036335a0a705632a29330a390f20f43 / 896a8b64f9f1bb8ad5e0bc64fc0b8ea8c84112494761ea1a43478d10c5ef9914 |
| LOCAL.MIX | 34,774,152 / 34,793,784 | 8a2d949b59f3549c7af007a5cbcdf83ba6fcd87f768aa9fbb3ad9cfc32f46d98 / d748797f59a652a296d3825e1703b8781380f43eba7b3d1825477752a395ba08 |
| RULES.INI | 541,406 / 541,915 | f34900cbe115a593adc22a91a7b86e7d4e1511eff995b5170af7d89c8a254d0a / fd1e95cea0306ea78049dc81c8cd816e18c28c496872a1ff02edd50bd082062f |
| ART.INI | 245,825 / 245,825 | b477f861063a9509e87b7836b78190204c73bea5ea5595a842c456f5920ea223 in both |

To reproduce, supply the Allied GAME1.CAB, the identified patch EXE, the two existing pinned comparator files, and upstream codec.rs and apply.rs to the [Python reader](ra2-patch-disc-audit.py). The adjacent [Rust wrapper](ra2-patch-disc-delta.rs) checks both sets of rolling checksums. The [shared reader](ra2-patch-audit.py) parses and checksum-validates the encrypted archive directory using the published MIX format. Each normalized section strips semicolon comments and surrounding whitespace while preserving spelling, value text, case, duplicate keys and order. Case folding is never used for equality between INI fields. The comparison reads raw config values and does not substitute interpretations for strings found in a shipping file. [Pinned decoder and applicator upstream](https://github.com/bwrsandman/rtptool/tree/258d1750340917bcf1361a177b90abd16de40453/src) · [Comparator source locks](source-lock.json)

**Independent section-reader check.** The strict counts use a closing bracket at the end of the heading after semicolon-comment removal. Both original rule files also contain a MirageWH header followed by a double-slash annotation. Allowing that suffix gives 1,191 RA2 and 1,478 Yuri rules sections. The 1.006 comparator still matches every RA2 rule section, and the 25 Yuri patch differences and all RA2 art counts are unchanged. These are compared source fields under two parser conventions. [Comparison results](../review/edition-comparison-readback.json) · [Independent reader](../review/verify_rules_comparisons.py)
