# COMRADE - Browser RTS Classics

Faithful four-player browser platform for classic RTS games: Command & Conquer, Red Alert 1, Dune 2000, and optionally Red Alert 2.

## Status

**Milestone M0 (Foundational Gates):**
- [x] C01: Code, asset and brand rights ledger
- [x] C02: Reference builds and parity fixtures (structure complete, actual values blocked awaiting owner-provided reference)
- [ ] C03: Reproducible monorepo, engine toolchain and CI (in progress)
- [ ] C04: Vanilla Conquer native, WebAssembly and headless execution (blocked pending C03 completion)

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

- Node.js >= 20.10.0
- pnpm >= 8.10.0
- TypeScript >= 5.3.2
- Emscripten (for WASM builds - see engine toolchain setup)

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

Engine build scripts will be implemented after C04 completes the Vanilla Conquer spike (THU-1335). Currently blocked pending engine proof.

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

Classic game assets (artwork, sound, music, maps, fonts) are proprietary to Electronic Arts and related rights holders. Public distribution of these assets is **blocked** until explicit approval is obtained. The project supports a local-import mode where users provide their own original game media; this mode requires hash verification and does not transmit asset bytes to external servers.

See `rights/ledger.jsonl` and `docs/adr/005-assets-and-distribution.md` for complete rights information.
