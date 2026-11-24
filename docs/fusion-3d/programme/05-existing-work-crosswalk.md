# Existing work and upgrade crosswalk

Reviewed 18 November 2026. GitHub default branch is `main` at `84f411478f01ed62365a2e4d1d316eb57d9e193c`; the repository had no open PRs at intake. Linear P-THU-30 returned 91 existing issues: 31 Done, 47 Backlog, 9 In Progress and 4 In Review. These are workflow states, not release certifications. The new programme extends existing work; it does not reopen every historical issue or discard the working simulation and persistent backend.

## Verified starting point

| Area | Evidence at the pinned source | Consequence |
| --- | --- | --- |
| Fusion rendering | `packages/fusion/src/render.ts` obtains Canvas2D and uses cached sprites generated through `art/forge.ts`; 32 facing angles | The upgrade requires a live 3D scene and renderer boundary, not a claim that existing baked meshes already satisfy full 3D. |
| World | Single logical terrain/occupancy representation, rendering altitude and existing movement domains | Introduce authoritative elevation and layered surfaces, with bridge/nav/combat/save semantics. |
| Current content | Actual composed pack enumeration yields 535 unit definitions and 481 structures; aliases and generated service definitions are included | Use these as preservation baselines. Build a separate complete series census and asset/animation coverage denominator. |
| Rules identity | Fusion ADR and packs deliberately contain authored extensions and normalizations | Keep a source-to-Fusion decision ledger. A pack name or original-looking sprite is not proof of Classic parity. |
| Multiplayer | Fusion uses its lockstep session; native Classic paths have `lockstep:false` and local native orders | Existing Classic multiplayer needs a separately owned actual cross-client order proof/correction. Do not repeat same-seed lobby smoke as synchronization evidence. |
| Verification | Root e2e/parity/security/performance scripts print placeholders, alongside substantive unit/integration and targeted smoke work | Install real gates and reference independent scenario evidence. |
| Latest operational report | THU-2487's 17 November comment reports PR92–94 on 84f4114 and pending wake/replay, consent E2E, rollback and live journeys | Refresh live evidence in the baseline task. This planning review does not assert those pending journeys have since passed or failed. |

Source: [pinned repository](https://github.com/Flatt-T/ProjectComrade/tree/84f411478f01ed62365a2e4d1d316eb57d9e193c), [render source](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/packages/fusion/src/render.ts), [package scripts](https://github.com/Flatt-T/ProjectComrade/blob/84f411478f01ed62365a2e4d1d316eb57d9e193c/package.json), [release record](https://linear.app/thunderchild-creative/issue/THU-2487). Specialist audit documents contain additional exact file/line evidence and enumeration method.

## Owning issue crosswalk

| Existing owner | Continuing responsibility | New programme relationship |
| --- | --- | --- |
| THU-1331, THU-1332–THU-1367 | Classic platform, rights, reference builds, adapters and original fidelity | Retain current owners; add only specifically verified defects and preserve regression evidence. |
| THU-2224 and PW01–PW42 | Persistent mode and its accepted rules | New engine capabilities must preserve these semantics and existing saved worlds. |
| THU-2487, COMRADE 20/20A | Existing two-mode release and runtime evidence | Cross-link upgrade epic; old scope completion does not close the new 3D mandate. |
| THU-2269 | Shared Fusion extension for persistent and standard game | Reuse headless/fixed-tick/snapshot architecture and accepted standard-game benefits. |
| THU-2421 | Universal world and mixed faction content | Preserve supported legacy definitions and stable namespaced identities; extend through versioned packs. |
| THU-2440, THU-2441, THU-2442, THU-2443, THU-2444 | Durable mutation, replay, client order, recipient filtering and content identities | Reuse the accepted fixes; add upgrade-specific compatibility and projection tests. |
| THU-2445, THU-2452 | Capture consent and multi-player behaviour verification | Add bridge/height/new-capability interaction cases, never weaken shield/ownership checks. |
| THU-2446 | Approved starter rosters | Preserve existing grants and saved armies; new faction starter mapping requires an explicit source/role contract. |
| THU-2447 | Earlier building graphics task | Its native/baked-sprite polish is prior work. New live 3D models, states and animations have separate evidence and coverage. |
| THU-2448 | Earlier unit graphics task | Carry incomplete art rows into new per-entity tasks with traceable provenance; avoid duplicate competing implementations. |
| THU-2449, THU-2450 | HUD, camera, placement, owner and Ally/Foe labels | Preserve accepted interactions and fog/relation semantics in the new 3D input/label implementation. |
| THU-2238, THU-2239, THU-2240, THU-2241, THU-2242 | Packing, transport, terrain, mixed forces and regional boundaries | Add layered geometry, bridge, updated content and transition tests under the new contracts. |
| THU-2234, THU-2235, THU-2236 | Shields, newcomers and recovery | Require regression and migration evidence with stable IDs and exact inventory conservation. |
| THU-2244, THU-1367 | Existing operational and final acceptance | Link the new programme's qualified candidate and its expanded release criteria. Existing Done status is insufficient for expanded scope. |

## Preservation procedure

For each new task, read the related issue's latest comments, current code and actual evidence. Reuse a completed mechanism when its contract and tested revision apply. Record the exact extension or defect. Existing unrelated work keeps its status. If a task discovers an actual regression in an old owner, link a concrete reproducible case rather than restating a broad accusation. A new asset/animation acceptance criterion is expanded scope and should not retroactively mislabel an earlier limited implementation as never done.

## New facts versus historical evidence

The review inspected current source, enumerated Fusion definitions, and read current Linear records. It did not execute a full game qualification, inspect every rendered model, or establish current public deployment health. Source-proven limitations, prior reported outcomes, proposed architecture and unverified runtime conditions stay visibly separate throughout the programme.

## 24 November source and runtime refresh

The dated baseline records the observed source revisions, live Classic smoke, isolated PostgreSQL evidence, deployed-release manifests and open qualifications. It includes the opening Linear inventory and points to matching source history where available. The preservation record identifies the existing mode and recovery contracts. [Baseline](../baseline.json) · [Preservation record](../preservation-manifest.md)
