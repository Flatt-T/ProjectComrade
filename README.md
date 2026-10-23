# COMRADE - Browser RTS Classics

A browser RTS platform beginning with a self-contained C&C Tiberian Dawn slice: original GDI/Nod teams, themes and rules, bundled freeware content, and an authored map. This unofficial community project requires no player file uploads.

## Status

**Playable slice:** [Launch Project Comrade](https://projectcomrade.thunderchildcreativetechnologies.com). Enter a callsign (no account, no install), create or join a game, share the invite link, pick your side and deploy. Harvest Tiberium, construct buildings, train infantry and fight the opposing base. Content loads automatically into verified MEMFS. Vanilla Conquer supplies the original simulation; OpenRA is a content source only. Main-branch releases deploy to Proxmox through the [existing pipeline](docs/runbooks/deployment.md).

**War room:** registration-free lobby with a live public-games list, shareable `?room=CODE` invite links, public/invite-only rooms, host-controlled match setup (game style, battlefield, max players, starting credits, tech level) and per-player side selection. Four authored battlefields ship — Tiberium Crossing, Canyon Clash, Tiberium Isles and Desert Standoff — across temperate, winter and desert theatres.

The responsive/fullscreen view scales the classic 640×400 framebuffer. An optional **Enhanced view** applies a WebGL sharp-bilinear upscaler for a smoother, higher-resolution look (toggle in-match; the engine is untouched and input passes through). This is a render filter, **not redrawn HD artwork** — redrawn sprites remain a separate asset pipeline. Today the lobby is **presence + configuration**: players share a room and all launch the configured scenario, but each runs an independent local simulation — synchronized online matches (deterministic lockstep) are the next milestone. Red Alert's engine is compiled and served but not yet playable (content pack pending); Dune and RA2 require separate engines. See the ADRs for the design and honest roadmap: [006](docs/adr/006-playable-td-slice.md) engine slice, [007](docs/adr/007-lobby-roster-and-multiplayer.md) lobby/roster, [008](docs/adr/008-synchronized-multiplayer.md) multiplayer, [009](docs/adr/009-dune-and-ra2-engine-roadmap.md) Dune/RA2.

**Milestone M0 (Foundational Gates):**
- [x] C01: Code, asset and brand rights ledger
- [ ] C02 full reference parity: fixture structure exists; independent reference measurements remain future work
- [x] C03: Reproducible monorepo, engine toolchain and CI
- [x] C04 foundation: WASM gameplay, bundled content, native orders, OpenAL audio and MSVC compilation; full reference parity remains future work

## Project Structure

```
apps/
  web/              # Landing, lobby, settings, canvas host
  service/          # HTTPS API, WSS, room coordinator
packages/
  contracts/        # API, pack, match, command schemas
  client-runtime/   # Worker bridge, rendering, input, audio
  pack-sdk/         # Adapter registry and conformance runner
engines/
  vendor/           # Pinned source/submodules with provenance
  patches/          # Numbered reviewed preservation changes
  adapters/
    td-ra/          # C ABI, platform I/O, headless, serializer
    d2k/            # Dune 2000 adapter (separate gated)
    ra2/            # RA2 adapter (separate gated)
packs/
  td/               # TD classic pack manifest and data references
  ra1/              # RA1 classic pack manifest and data references
  d2k/              # Dune 2000 pack manifest and data references
  ra2/              # RA2 pack manifest and data references (optional)
references/
  reference-builds.lock.json  # Verified edition/patch/hashes
  deviations/               # Source correspondence/deviation matrices
  fixtures/                 # Parity fixtures
  fixture-schema.json       # Fixture schema
  control-binding-template.json
rights/
  ledger.jsonl       # Code/assets/brand rights ledger
tools/
  catalog/           # Catalog extraction and validation
  maps/              # Map certification and conversion
  replay/            # Replay analysis and recovery
  parity/            # Determinism and first-divergence tooling
tests/
  unit/              # Unit tests
  integration/       # Integration tests
  e2e/               # End-to-end tests
  parity/            # Determinism and fidelity tests
  security/          # Security tests
  performance/       # Performance benchmarks
docs/
  spec/              # Detailed specifications
  adr/               # Architecture decision records
  runbooks/          # Operational runbooks
infra/
  containers/        # Container definitions
  proxy/             # Proxy configuration
  backup/            # Backup and drain scripts
```

## Setup

### Prerequisites

- Node.js 24.13.0 and pnpm 9.15.0
- Python 3.11+, CMake >=3.25, Ninja
- Emscripten 6.0.12 for WASM builds; MSVC C++ workload and Windows SDK for Windows native builds

### Installation

```bash
pnpm install
```

### Development

```bash
# Start web client and service
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Run specific test suites
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:parity
pnpm test:security
pnpm test:performance
```

### Engine Builds

With the toolchain on PATH, run `python tools/prepare-content.py` and `python tools/build-engine.py wasm` before `pnpm build`. These prepare pinned freeware content and patched browser engines. Run `python tools/build-engine.py native` for null video/audio/input binaries. See the deployment runbook for browser gameplay checks and hosted evidence.

## Documentation

- [COMRADE 10 - START HERE](docs/spec/COMRADE-10-START.md) - Agent instructions, document index and execution order
- [COMRADE 00 - Product Contract](docs/spec/COMRADE-00-PRODUCT.md) - Requirements, scope and acceptance
- [COMRADE 01 - Research and Rights](docs/spec/COMRADE-01-RESEARCH.md) - Source register, licensing and feasibility
- [COMRADE 02 - Architecture](docs/spec/COMRADE-02-ARCHITECTURE.md) - Technical architecture and repository contract
- [COMRADE 03 - Packs and Catalogs](docs/spec/COMRADE-03-PACKS.md) - Game pack schema and content inventory
- [COMRADE 04 - UX and Controls](docs/spec/COMRADE-04-UX.md) - Player experience and authentic controls
- [COMRADE 05 - Guests and Rooms](docs/spec/COMRADE-05-GUESTS.md) - Identity, lobby API and room state
- [COMRADE 06 - Multiplayer](docs/spec/COMRADE-06-MULTIPLAYER.md) - Deterministic multiplayer and recovery
- [COMRADE 07 - Assets and Maps](docs/spec/COMRADE-07-ASSETS.md) - Asset, map, rendering and audio pipelines
- [COMRADE 08 - Verification](docs/spec/COMRADE-08-VERIFICATION.md) - Fidelity oracle and acceptance tests
- [COMRADE 09 - Hosting](docs/spec/COMRADE-09-HOSTING.md) - ChatGPT Sites evaluation and deployment

## License

MIT License - see LICENSE file

## Third-Party Licences

This project incorporates third-party source code under various licences:
- EA C&C/RA source: GPLv3+ with additional terms
- Vanilla Conquer: See vanilla/License.txt
- Emscripten: MIT-style

All third-party licences are recorded in `rights/ledger.jsonl` and must be retained in distribution.

## Rights and Permissions

Classic artwork and sound remain EA / Westwood content, separate from GPL engine code and the Comrade-authored map and UI. The TD slice automatically bundles an explicitly selected, hash-pinned freeware pack from OpenRA and CnCNet sources. This is not a blanket approval for other games or unknown retail assets. No player import is required.

See `rights/ledger.jsonl` and [ADR 006](docs/adr/006-playable-td-slice.md) for current provenance and scope.
