# Yuri’s Revenge original English PC disc profiles

The English installer on two preserved CDs supplies the same original `ARTMD.INI` and `RULESMD.INI`. The disc readme identifies the game as **1.000**. The installed `GAMEMD.EXE` independently reports **1.05** in its Windows file and product version fields. The later official **1.001** patch changes 25 named rules sections. Keep separate version fields in the Fusion research catalogue so researchers can reproduce the intended balance and presentation.

## What the discs establish

| Comparison | Scope | Result |
| --- | ---: | --- |
| European disc vs English installer on Thai release | Six installer cabinet parts, executable and English readme | All eight files byte-identical. The archive records report different SHA-1 hashes for the complete raw tracks. |
| Disc 1.000 rules vs pinned community baseline | 1,477 named rules sections | Every input byte agrees after CRLF-to-LF normalization, including comments. The existing `rulesmd-original.ini` pin is a validated 1.000 rules source. |
| Disc 1.000 rules vs official 1.001 rules | 1,477 sections in each | 1,452 share identical ordered fields, 25 differ and both sets contain the same named sections. |
| Disc art vs CnCNet art comparator | 1,581 disc sections, 1,600 CnCNet sections | Of 1,580 shared section names, 1,449 have identical ordered fields and 131 differ. One section occurs only on the disc and 20 only in CnCNet. |
| Retail rules registry joined to retail art | 559 listed infantry, vehicle, aircraft and building rows | 553 resolve to an explicit disc rule section, 549 to an explicit disc art section. The resolved art leads to 37 distinct named animation sequences. Registry rows include preplaced or non-player entries. |

The retail profile zip contains five JSON-lines tables. Use `retail-object-bindings.jsonl` for per-entry section names, line locations, image overrides, presentation fields, resolved sequences and selected 1.001 balance differences. Use `retail-sequences.jsonl` for action/frame descriptors. The three section-comparison tables cover the original and comparator naming, field counts, per-section hashes, and the specific changed field pairs. Null values document unresolved lookups. For a YR retail presentation ticket, use this binding table ahead of the earlier compatibility-art join in `yr-facts.zip`. [Profiles](yr-disc-profiles.zip) · [Machine-readable preservation record](yr-disc-verification.json)

## Cases that change implementation

| Object | Retail evidence | Direction for the responsible specialist |
| --- | --- | --- |
| Battle Fortress `BFRT` | The disc art section sets `Image=SREF`. CnCNet’s section omits this field. | Resolve the original art indirection in the reference-data reader. Record a separate observation or model inspection before deciding which geometry the released runtime renders. |
| Slave Miner `SMIN` | The CnCNet art adds secondary and two elite muzzle positions of `120,0,185`. The 1.001 rules change cost from 1,500 to 1,750 and introduce a build-time multiplier of 0.8. | Store the retail attachment lookup separately from community-supplied coordinates. Exercise both price profiles and capture production timing in each. |
| Siege Chopper `SCHP` | CnCNet adds elite primary and secondary attachment coordinates `0,0,50` and `200,0,250`. The official patch reduces cost from 1,400 to 1,100 and adds a secondary-weapon voice binding. | Test normal and elite firing in both flight and deployed states. Track version and asset provenance alongside each muzzle and voice test. |
| Yuri Prime `YURIPR` | `YuriPrSequence` is disc-only in this comparison and has 21 fields. The patch adds `ImmuneToPsionicWeapons=yes` to the rule section. | Base the original rig/action reference on the resolved disc sequence. Add a version-specific psionic immunity test. |
| Magnetron `TELE` | CnCNet supplies secondary and elite attachment coordinates `85,0,130` absent in the disc art section. | Record the source of any original 3D anchor chosen for Fusion and validate it at the gameplay camera. |

The census preserves section-name case, giving `VIRUS` and `Virus` separate evidence identities. Joins prefer exact spelling and accept a case-insensitive match only when unambiguous. The section comparison strips comments and surrounding whitespace, preserves duplicate assignments and field order, and compares values as strings. This establishes declared configuration. Runtime selection, fallback rules, appearance in motion and shipping performance require separate observations in their respective tickets.

## Preservation and reproduction

Both tracks contain 815,699,472 bytes and expose an ISO9660 volume called `YR1`. The PVD is at LBA 16. Each raw Mode 1 sector is 2,352 bytes, with its 2,048-byte payload starting at byte 16. EU `YR1.img` and Thai `Disc/YR1.bin` have archive-reported SHA-1 values `9bada069e6c64bac51eaddfe39db4172435798bf` and `ba3a7336d231e5377158911ba9fd7eabeca14911`. The eight compared files are under the ISO `INSTALL` directory. Full-track digests above come from the preservation records. Our byte comparison covered the selected file extents. [European physical release](https://archive.org/details/CC_YR_Europe) · [Thai physical release](https://archive.org/details/cnc-ra2-yuri-thai-release)

1. For an available local image of either pressing, run `python yr-disc-read-media.py /path/to/track /private/yr-install`. The reader validates the shared volume and the eight per-file SHA-256 values before writing each file. Alternately extract `INSTALL/GAME1.CAB` through `GAME6.CAB`, `INSTALL/GAMEMD.EXE`, and `INSTALL/README.TXT` through an ISO reader. [Verifier for original media](yr-disc-read-media.py)
2. In that private directory, provide each capitalized cabinet with its embedded continuation filename, `Game1.cab` through `Game6.cab`. On a case-sensitive filesystem the command `for n in 1 2 3 4 5 6; do ln -s "GAME${n}.CAB" "Game${n}.cab"; done` supplies aliases in a fresh directory. Run `cabextract -q -F ra2md.mix -d . Game1.cab`. This extraction was checked with cabextract 1.9. Verify 204,527,696 bytes and SHA-256 `69d886defad9114dd440a013b364c8c004e369b5221d1889957b49d00058559d` for `ra2md.mix`.
3. The outer archive contains 25 named-ID entries. `localmd.mix` begins at byte 6,237,612 and spans 4,819,480 bytes, with SHA-256 `cd181596b2deaeacf7bba77e661ae4438d3f778efc0e38ae2b967c410bf3f931`. The inner archive has 187 entries. The verifier checks the embedded SHA-1 on both containers and resolves both target INIs by their directory IDs. [MIX reader](ra2-patch-audit.py)
4. Prepare the locked source cache using `fetch_inputs.py` and extract `rulesmd.ini` from the documented official 1.001 update. Run `python yr-disc-verify.py /private/yr-install /private/locked-inputs /private/patch/rulesmd.ini --other-disc /private/other-yr-install --out /private/recheck`. Two independent runs regenerated the same JSON and ZIP. The ZIP’s SHA-256 is `259cc6622725fc2db5faec7004233ebdafbd0685f983b356fe4dbbff8d3fb277`; the JSON lists the digest and line count of each member. [Profile generator](yr-disc-verify.py) · [Official update evidence](ra2-patch-provenance.md) · [Locked rule comparator](https://github.com/hamdirizal/red-alert-2-rules/blob/b66200ab0130a24bae8d8359caa6ab03bd78e8f7/rulesmd-original.ini) · [Locked art comparator](https://github.com/CnCNet/cncnet-yr-client-package/blob/0e5bb2076fa600e13094daebdfbaf85f6b057b8a/game-assets/cncnet.pack/artmd.ini)

| Original INI | ID | Offset in `localmd.mix` | Bytes | SHA-256 |
| --- | --- | ---: | ---: | --- |
| `ARTMD.INI` | `5b47d8d5` | 140,884 | 336,535 | `e1f0378394313c04ebbd5073f47785ee3e46f1b3c62d65724e8f3c310ee7ba31` |
| `RULESMD.INI` | `8218f9f4` | 477,428 | 742,958 | `06761dd7f714e7d9400216ec3c06109ec5c1461f6a0727be7401eb9d8b0f6d05` |

These preservation hashes establish research provenance. Every new Fusion mesh, sprite, clip, voice and texture still needs its own author, source and approval record.
