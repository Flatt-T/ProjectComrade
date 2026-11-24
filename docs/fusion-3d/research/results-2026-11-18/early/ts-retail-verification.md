# Tiberian Sun retail rules, art and terrain comparison

Two archived installation discs now anchor the historical data. The Nod base-game disc has volume TS2, with FileVersion and ProductVersion 1.08 in INSTALL/GAME.EXE. The Firestorm disc has volume FIRESTORM and version 2.0 in its corresponding executable. Its preservation record identifies the UK release. The comparison source is the Vinifera historical INI revision labelled 2.03. The Firestorm 2.0 disc already contains the entire text of five of those six files. In the table, “exact” means every byte of the pinned text after converting LF line endings to CRLF occurs contiguously in the recorded retail MIX container. Adjacent padding is outside that text comparison. [Base disc](https://archive.org/details/cnc-tiberiansun-nod-108) · [Firestorm disc](https://archive.org/details/firestorm_202412) · [Pinned INI archive](https://github.com/Vinifera-Developers/Tiberian-Sun-INIs/tree/820434dd9946ae524bd8972fac764195ef2939a0)

| Comparator | Base 1.08 INSTALL/TIBSUN.MIX | Firestorm 2.0 INSTALL/EXPAND01.MIX |
| --- | --- | --- |
| RULES.INI | 8,636 shared normalized section/key values match. The comparator adds GuardRange=5 for GAFSDF, GAWALL and NAWALL. | Exact, 239,399 bytes at 409,204. |
| ART.INI | 3,768 of 3,770 normalized values match. DOGGIESEQUENCE.Prone is 74,1,0 on disc and 90,1,0 in the comparator. MMCH.PrimaryFireFLH is 20,-50,100 on disc and 250,-50,100 in the comparator. | Exact, 86,510 bytes at 313,204. |
| FIRESTRM.INI | No full-text match in the base container. | Exact, 34,504 bytes at 648,612. |
| ARTFS.INI | No full-text match in the base container. | Exact, 9,476 bytes at 399,716. |
| TEMPERAT.INI | No full-text match in this base container. | Exact, 25,195 bytes at 754,644. |
| SNOW.INI | Exact, 22,239 bytes at 22,755,032. | No full-text match in this expansion container. |

Use the complete normalized FS matches as retail text evidence for source numbers, art sequence definitions and terrain-set metadata in that release. For a 1.08 animation fixture use the earlier creature prone-frame reference and the earlier MMCH firing attachment coordinates. For a base wall-defense fixture preserve an absent GuardRange field independently of any engine default. A missing full-text match identifies only this specific container. It leaves load precedence, inheritance from the base disc and the final installed member set open. Values can also be overridden by missions.

The reader checked ISO9660 directory extents via normal HTTP byte-range reads. The 1.08 TIBSUN.MIX is 75,094,736 bytes, and the Firestorm EXPAND01.MIX is 36,972,996 bytes. Both complete containers and the two executable extents were fingerprinted. Unfetched disc extents were outside the comparison. For the two earlier INIs with differing text, the script required unique 48-byte starting and 100-byte ending anchors, indexed the text span by case-insensitive section/key, and reported all changed and extra values. Duplicate keys use their final value. The exact text span and aggregate container digests are recorded. No retail files are distributed.

Run `python ts-retail-verification.py /path/to/locked-source-cache /path/to/private-media-cache --download` after obtaining the GitHub comparator files via fetch_inputs.py. The script validates image length and HTTP ranges, sector format, full container and executable digests, version strings and comparator hashes. Without --download it reruns entirely from a private cache. [Verification data](ts-retail-verification.json) · [Comparison program](ts-retail-verification.py)
