# COMRADE - Browser RTS Classics

A browser RTS platform built on a self-contained C&C Tiberian Dawn slice: original GDI/Nod teams, themes and rules, bundled freeware content, and an authored map. This unofficial community project requires no player file uploads.

## Status

**Live:** [Launch Project Comrade](https://projectcomrade.thunderchildcreativetechnologies.com). Enter a callsign (no account, no install), create or join a game, share the invite link, pick a game style and your side, and deploy.

| Game style | Engine | Multiplayer |
|---|---|---|
| **Classic C&C** (Tiberian Dawn) | Original GPL engine (Vanilla Conquer → WASM), freeware art, 4 authored maps | Lobby presence; each commander fights the built-in enemy |
| **Classic Red Alert** | Original GPL engine (Vanilla Conquer → WASM), freeware art, 2 authored maps | Lobby presence; each commander fights the built-in enemy |
| **Tiberian Dawn Style** | Comrade Fusion Engine, `td` rule pack: GDI and Nod, spreading Tiberium, building upgrades, Obelisk and Temple, Ion Cannon, Dropship Bay, Satellite Sweep, Chemical Missile and Stealth Field — on the same four battlefields as the original-engine slice | **Synchronized lockstep** with optional AI opponents |
| **Red Alert Style** | Comrade Fusion Engine, `ra1` rule pack: Allies and Soviets, ore and gems, navies, Tanya, Tesla coils, building upgrades, Chronosphere, GPS and weather control against the Iron Curtain, nuke and Tesla storm | **Synchronized lockstep** with optional AI opponents |
| **Dune Style** | Comrade Fusion Engine, `dune` rule pack: rock-only building, concrete, spice blooms, sandworms, factory and Palace upgrades, Fremen war parties with worm riders, Atreides / Harkonnen / Ordos with a power each past the Palace | **Synchronized lockstep** with optional AI opponents |
| **Red Alert 2 Style** | Comrade Fusion Engine, `ra2` rule pack, isometric: MCV deploy, ore regrowth and gems, Chrono Miners, Prism and Tesla tech, yard/factory/battle-lab upgrades, Prism Array and Airlift Command | **Synchronized lockstep** with optional AI opponents |

Superweapons are balanced by class across every pack, every building upgrade unlocks something for the side that buys it, and a second factory of a kind doubles that queue's build rate.

The **Comrade Fusion Engine** (`packages/fusion`) is one deterministic, data-driven engine: integer simulation, seeded RNG, command-only lockstep with desync checksums, and rule packs that describe a whole game as data. All four classics are packs — `td`, `ra1`, `dune`, `ra2` — so a future original "fusion" game is a further pack mixing any of their units, structures, weapons and mechanics ([ADR 010](docs/adr/010-fusion-engine.md)). These styles are independent gameplay replications with original procedural art; unit values approximate the classics and are tuned over time.

## Tiers

| Tier | Classic matches | Fusion matches | Advertisement | Extras |
|---|---|---|---|---|
| **Guest** (no account) | 2 a day | 1 a day | 30s before the match | — |
| **Free** (callsign) | 3 a day | 2 a day | 30s before the match | Record, history, sharing |
| **Bronze** £3.49/mo | Unlimited | 5 a day | None | — |
| **Silver** £7.49/mo | Unlimited | Unlimited | None | — |
| **Gold** £9.79/mo | Unlimited | Unlimited | None | Feature and map voting; new content a week early |

Every amount is retrieved live from Stripe by lookup key — no price is written into the site.
The tier table itself ([`packages/contracts/src/billing.ts`](packages/contracts/src/billing.ts))
is read by both the pages and the enforcement, so what is advertised and what is allowed cannot
drift apart. Play allowances renew 24 hours after you registered (or after a guest was first
seen), not at midnight. Gold votes still renew every seven days from that same moment.

The free tier's advertisement plays **over a simulation that is already running**: your base is
on the battlefield from the first tick with your orders held back, so subscribers walk straight
in and you arrive about thirty seconds behind — and no lockstep peer ever waits for an
advertisement ([ADR 011](docs/adr/011-paid-platform.md)).

Accounts are AWS Cognito; subscriptions, invoices and the billing portal are Stripe. With no
database configured the service runs open and unmetered exactly as before, so each layer can be
switched on independently — see the
[paid platform setup runbook](docs/runbooks/paid-platform-setup.md).

**War room:** registration-free lobby with a live public-games list, shareable `?room=CODE` invite links, public/invite-only rooms, host-controlled match setup (game style, battlefield, human players, AI opponents, starting credits, tech level, sandworm activity, resource renewal, superweapon recharge, bonus crates and game speed) and per-player side selection.

Classic C&C renders the authentic 640×400 framebuffer with an optional WebGL **Enhanced view**; that is a render filter, not redrawn HD art. **Classic Red Alert** now runs on the original engine too, with its freeware content and two authored battlefields (Ore Crossing, Winter Line) carrying their own Format80-packed terrain ([ADR 007](docs/adr/007-lobby-roster-and-multiplayer.md)). Design records: [006](docs/adr/006-playable-td-slice.md) engine slice, [007](docs/adr/007-lobby-roster-and-multiplayer.md) lobby/roster, [008](docs/adr/008-synchronized-multiplayer.md) multiplayer, [010](docs/adr/010-fusion-engine.md) Fusion Engine.

**Milestone M0 (Foundational Gates):**
- [x] C01: Code, asset and brand rights ledger
- [ ] C02 full reference parity: fixture structure exists; independent reference measurements remain future work
- [x] C03: Reproducible monorepo, engine toolchain and CI
- [x] C04 foundation: WASM gameplay, bundled content, native orders, OpenAL audio and MSVC compilation; full reference parity remains future work

## Project Structure

```
apps/
  web/              # Landing, lobby, settings, canvas host, account/billing pages
  service/          # HTTPS API, WSS, room coordinator, accounts, entitlements, billing
packages/
  contracts/        # API, pack, match, command schemas
  fusion/           # Comrade Fusion Engine: deterministic sim, rule packs, renderer, lockstep
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
- [ADR 011 - Paid platform](docs/adr/011-paid-platform.md) - Accounts, allowances, advertisements and subscriptions
- [External services](docs/runbooks/external-services.md) - What each third party is for, what it costs and in what order
- [Paid platform setup](docs/runbooks/paid-platform-setup.md) - Exact Postgres, Cognito, Stripe and advertising configuration

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
