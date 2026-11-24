# Red Alert Windows 95 demo execution and map review

**Observed in the original executable.** The February 1997 Windows demo opened a game window at 640×400. Choosing Start New Game brought up a red campaign-difficulty panel above the title artwork. With Normal selected, the Allied route reached a snow-covered playable battlefield with infantry, vehicles, a construction yard and a build sidebar showing a power plant and sandbags. The 640×480 host capture letterboxes the game viewport. The two observations come from fresh launches with the same original PE executable and MIX files. [Emulator reference and route](https://github.com/vgrichina/berrry-wine/blob/8718fa0bd82f9c73dce1c92f78adc59db4f76237/docs/re-notes/red-alert-95-demo.md) · [Westwood demo mirror](https://www.boxedwine.org/app/command-conquer-red-alert/)

| Observation | Input at emulator batch (x, y) | End batch | Host wall time for this run | Private PNG SHA-256 |
|---|---|---:|---:|---|
| Difficulty controls visible | 120000 (321, 183) | 130000 | 29.681 s | c5a45758148cbb43bdb59928c6140e57711ad5d568a8712ae185888f55481955 |
| Allied snowy battlefield | Above, 170000 (500, 253), 200000 (260, 228), 640000 (318, 271) | 710000 | 96.252 s | 81cd884a255cdf146b0c433bb961ab15dc9cae90380a2830b054b791db2edfde |

The counters are emulator scheduler batches; the two wall times include emulated boot and setup. They cannot be used to set native game speed, animation FPS, move duration or phone performance requirements. A separate shipped-window trace is required for each of those measurements. Chromatic snow, cliff and road edges, compact squad clusters and the clearly separated command sidebar were visible at the same default view. Compare landmarks and selection readability at that camera before enlarging units or terrain contrast in the homage.

## Reproduction

Use Node 24.22.3 with the emulator's declared `pngjs` dependency and the public 1997 Windows demo. In a local checkout at **8718fa0bd82f9c73dce1c92f78adc59db4f76237**, place the demo ZIP's `ra95demo/INSTALL/` contents under `test/binaries/win98-games-a-d/CnC-Red Alert Demo-SW/INSTALL/`. The inspected `RA95.EXE` SHA-256 is `52d282523555cba978a1d90ec739abb5035fdb32e5bc1f63e8225914599f2580`. Compile the emulator with its own compiler and create its input manifest. The tested tail-call WASM digest is `ddf2f1905e28a8ed6d6100e409a9eb82d32a3db25094e8921bc465470348af62`. Published files here contain observations and digests only. Keep the game data and screen captures in a local working directory.

```sh
node tools/build-compile-wat.js
node tools/gen-win98-games-a-d-manifests.js --only=red_alert_95_demo
node test/run.js --no-build --app=red_alert_95_demo --no-close --quiet-blocks --quiet-api \
  --max-batches=710000 \
  --input=120000:click:321:183,170000:click:500:253,200000:click:260:228,640000:click:318:271 \
  --png-canvas --png=private-allied-mission.png
```

The more recent emulator snapshot dd9b09da5845779ddf48202a87d112610eeaa58f requires a desktop authority that opens a local Unix-domain socket. A local probe returned EPERM and the authority returned ECONNECTION in this environment. That version's headless harness also attempts to open a locally supplied OLE type library. Returning to the upstream revision documenting the demo enabled a full execution using its published, unmodified game and simulation paths.

## Independent data comparisons

[The verification program](verify_map_and_demo.py) recomputed SHA-256 and Git blob digests for **all 2,117** EA SAGE map members across seven titles. Both values matched each corresponding catalog row, with zero missing and zero extra paths. All 522 map-metadata rows had every retained field matched against the associated elements of the original XML. A digest check verifies identity and coverage. It cannot establish each extracted object’s gameplay behavior or a retail map’s playability.

The program also independently found each demo scenario’s Basic section in the MIX, checked theater, bounds, faction/object initial placements, team and trigger counts, and decoded the actual tile and overlay chunks. Each map yielded 16,384 two-byte template IDs, 16,384 one-byte icon indices and 16,384 one-byte overlay IDs. Each compressed block passed declared-size and terminator checks. The [machine results](map-demo-independent-results.json) retain aggregate distributions and content hashes rather than complete proprietary layouts. The format follows the publisher’s [map reader](https://github.com/electronicarts/CnC_Red_Alert/blob/0dc09bb1d6188d1ec79ab4765b22a48b75ffee32/CODE/MAP.CPP#L934), [overlay reader](https://github.com/electronicarts/CnC_Red_Alert/blob/0dc09bb1d6188d1ec79ab4765b22a48b75ffee32/CODE/OVERLAY.CPP#L265), [LCW implementation](https://github.com/electronicarts/CnC_Red_Alert/blob/0dc09bb1d6188d1ec79ab4765b22a48b75ffee32/CODE/LCW.CPP) and [enumerations](https://github.com/electronicarts/CnC_Red_Alert/blob/0dc09bb1d6188d1ec79ab4765b22a48b75ffee32/CODE/DEFINES.H#L1700).

| Demo scenario | Playable bounds area | Distinct raw template IDs | Distinct raw overlay IDs | Bridge-template cells |
|---|---:|---:|---:|---:|
| ALLY2, snow | 2,100 | 80 | 7 | 22 |
| ALLY5, temperate | 5,060 | 133 | 12 | 94 |
| SOVIET2, temperate | 1,960 | 79 | 14 | 41 |

Bridge counts measure cells carrying a template whose enum name contains BRIDGE. A bridge spans several cells and can have multiple visual or attachment variants. The ALLY5 map includes gold, gems, chain-link, brick wall and fence overlay cells. SOVIET2 includes gold, wood and steel crates, multiple agricultural overlays, chain-link and sandbags. In ALLY2, 1,058 playable cells use raw template ID 255. Its numerical position resolves to an interior arrow in the released enumeration, which conflicts with the snowy theater. The name is deliberately withheld in that grid’s distribution. EA’s remastered editor independently checks the theater after resolving a template ID and treats a template unavailable to a theater as empty in that editor. [Editor loader](https://github.com/electronicarts/CnC_Remastered_Collection/blob/f1f0d42bc2dcd06d5d1df943c6150ab34bf307ae/CnCTDRAMapEditor/RedAlert/GamePlugin.cs#L478)

Reproduce the two comparisons by running `python verify_map_and_demo.py EA-Mod-Support.zip ra95demo.zip DEFINES.H world/ editions/ra95-demo-facts.json local-results.json`. Use the official archive and header pins listed above and in the adjoining catalogs. The result pertains to these files and this executable; neither a packed map nor a static BridgeStrength value measures the destruction and repair lifecycle at runtime.

### Paired unit order

Two further original-executable launches took the same Allied route to identical batch **835000**. Both clicked the Ranger at (275, 268) at batch 720000. Only the command trial then clicked open snow at (191, 287), at batch 735000. At the end the control displayed the selected, labeled Ranger over its original position (center near host image 276, 308). The command trial displayed the Ranger at the destination (center near 191, 328), with the original spot clear. The primary green selection-bar color was present in the 34×28-pixel source region only in the control, and in the destination region only in the command trial. These paired scenes establish selection and ground movement for this demo's Allied Ranger, with scroll/camera position held fixed. They do not isolate native travel speed or a particular stopping tick; independent emulator launches showed slight differences in other units’ idle/movement phases.

| Run through batch 835000 | Ground click | Host wall time | Private frame SHA-256 |
|---|---|---:|---|
| Control | None after selection | 118.407 s | d5ac68d56a67ac3bb1f415c8d841f79e2345e3dc69e30cebb897b52541f9d3ee |
| Move | 735000 (191, 287) | 119.594 s | 2cec485ee7bcc6a375a38537166abe5e267d912ee8ae89718cb60b66755e89c5 |

For reproduction, extend the input list in the command above with `,720000:click:275:268` for the control. Append `,735000:click:191:287` for the command trial. Set the same batch limit in both runs and choose distinct local filenames. The host canvas includes the 40-pixel letterbox at the top. All supplied input coordinates are the emulator’s expected coordinates.
