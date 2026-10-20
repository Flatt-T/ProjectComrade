# ADR 006: Self-contained Tiberian Dawn slice

Accepted project direction, 20 October 2026. Supersedes ADR 005's local-import-only policy **only for the exact pinned TD freeware pack** and the workbench-only C04 milestone. Other games and unknown retail media retain their previous gates.

The user requested C&C as the base: original GDI/Nod teams, themes and rules, bundled content with no player file prompts, then enhancement. Project Comrade authors the map and platform; it does not claim ownership of classic EA / Westwood artwork.

## Foundation

Keep pinned Vanilla Conquer for authentic simulation. Compile SDL2 video/input and OpenAL audio through Emscripten. The adapter starts COMRADE.INI directly, skips the native briefing modal, yields to the browser, and exports snapshots and validated native commands. Native null input and MSVC checks remain supported. OpenRA simulation is not substituted.

## Content provenance

OpenRA's official installer manifest labels `cnc-packages.zip` **Base Freeware Content**, pinned upstream SHA-1 `72f337464963fa37d3688eb03e80eefd33669a3d`. Project SHA-256: `a55b2c160b534f6d1b865ad6120e1f4fde8c418d47bb2fb1a9c72c586a5e1603`.

- Manifest: https://github.com/OpenRA/OpenRA/blob/bleed/mods/cnc-content/installer/downloads.yaml
- Mirror list: https://www.openra.net/packages/cnc-mirrors.txt
- Selected mirror: https://openra.ppmsite.com/cnc-packages.zip

The compact package omits Gold fonts. Extract only UPDATE.MIX from the freeware installer linked by https://cncnet.org/command-and-conquer at https://downloads.cncnet.org/TiberianDawn_Online_installer.exe. Installer SHA-256: `0f8c146e553dc222e1e359570687516f5b7e40c2676470bde8d43bda26da8bed`. UPDATE.MIX SHA-256: `15176e03bc6475bf1d65be6d80bc7b53181f034fd36f7959c5e2cd9371f2dc73`. No executable from the game installer is run or served. The build uses checksum-pinned innoextract 1.9 from https://github.com/dscharrer/innoextract.

Ledger 017 records explicit user-directed, hash-scoped packaging and these community freeware sources. This records provenance, not a new copyright licence, GPL artwork or EA endorsement. Classic artwork/audio remains EA / Westwood content. Engine licence and corresponding modified source are linked in the game. Unknown assets are not covered.

## Acceptance and limits

One authored 64×64 temperate map; GDI/Nod selection; bases and forces; 6,000 starting credits; original harvesting/unloading, production/placement, training, combat and victory/defeat rules. Browser checks exercise native commands, including power gained from placing a power plant, unloading income and enemy damage. Both factions start without file inputs.

The UI scales the classic 640×400 framebuffer. HD artwork and a larger native viewport are subsequent work. No complete campaign, full reference-parity certification or synchronized multiplayer is claimed.

Version 1 contracts validate launch, content hashes/size, move/attack/harvest/build/train/place orders, snapshots and room messages. WebSockets support four-seat lobbies, readiness and host migration with payload/rate/connection limits. Match start is explicitly rejected until deterministic synchronization exists.

Build: pnpm install; python tools/prepare-content.py; python tools/build-engine.py wasm; pnpm lint; pnpm typecheck; pnpm test:unit; pnpm build. Serve with STATIC_ROOT=apps/web/dist node apps/service/dist/index.js, then run node tools/browser-smoke.mjs. The workflow retains build/evidence screenshots.
