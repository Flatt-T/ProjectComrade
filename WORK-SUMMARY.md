# COMRADE Implementation Work Summary

**Date:** 2026-10-18
**Linear Project:** P-THU-30
**Master Epic:** THU-1331

## Completed Work

### C01 (THU-1332): Establish code, asset and brand rights ledger ✅

**Deliverables:**
- `rights/ledger.jsonl` - 16 entries covering source code, game assets, brand marks, and test assets
- `docs/adr/005-assets-and-distribution.md` - Classification matrix and distribution modes
- C01 evidence document

**Key Decisions:**
- Public classic asset distribution: BLOCKED until explicit rights holder approval
- Local import mode: APPROVED as default mode with hash verification
- Vanilla Conquer source: REVIEWED as preservation candidate (browser/headless UNPROVEN)
- OpenRA: BLOCKED due to documented gameplay changes
- Chrono Divide: BLOCKED until licence inquiry completed

**Commit:** 7161be9

---

### C02 (THU-1333): Pin original reference builds and independent parity fixtures ✅

**Deliverables:**
- `references/reference-builds.lock.json` - Structure for TD, RA1, D2K, RA2 (all hash values BLOCKED placeholders)
- `references/deviations/` - Deviation matrices for TD, RA1, D2K, RA2
- `references/fixture-schema.json` - Complete fixture structure schema
- `references/control-binding-template.json` - Control binding capture template
- `references/fixtures/td-baseline.json` - 10 TD baseline fixtures (economy, movement, production, combat, victory)
- `references/fixtures/ra1-baseline.json` - 10 RA1 baseline fixtures (economy, movement, production, combat, victory)
- C02 evidence document

**Status:**
- Schema and structure: APPROVED
- Actual hash values: BLOCKED awaiting owner-provided reference builds
- Fixture expected results: BLOCKED awaiting controlled observations

**Commit:** b322294

---

### C03 (THU-1334): Bootstrap reproducible monorepo, engine toolchain and CI ✅

**Deliverables:**
- Complete monorepo structure per COMRADE02:
  - `apps/web/` - Vite + React client
  - `apps/service/` - Node.js + WebSocket service
  - `packages/contracts/` - Schema definitions
  - `packages/client-runtime/` - Worker bridge and runtime
  - `packages/pack-sdk/` - Adapter registry
  - `engines/vendor/` - Pinned source
  - `engines/patches/` - Preservation changes
  - `engines/adapters/td-ra/d2k/ra2/` - Engine adapters
  - `packs/td/ra1/d2k/ra2/` - Pack manifests
  - `tools/catalog/maps/replay/parity/` - Tooling
  - `tests/unit/integration/e2e/parity/security/performance/` - Test suites
  - `docs/spec/adr/runbooks/` - Documentation
  - `infra/` - Deployment infrastructure
- Toolchain pinning: Node >=20.10.0, pnpm >=8.10.0, TypeScript ^5.3.2, Vite ^5.0.0, React ^18.2.0
- Root configuration: package.json, pnpm-workspace.yaml, tsconfig.json, .gitignore, README.md
- Package configurations for all apps and packages
- Stub implementations for web app, service, and packages
- Test package stubs
- GitHub Actions CI workflow (.github/workflows/ci.yml) with lint, typecheck, unit tests, integration tests, dependency audit

**Status:**
- Repository layout: APPROVED
- Toolchain pinning: APPROVED
- CI pipeline: APPROVED
- Engine scripts: BLOCKED pending C04 completion

**Commit:** 8afabb3

---

### C04 (THU-1335): Prove Vanilla Conquer native, WebAssembly and headless execution ⚠️ BLOCKED

**Initial Work:**
- Cloned TheAssemblyArmada/Vanilla-Conquer to engines/vendor/vanilla-conquer (commit ce83b59)
- Analyzed build system: CMake 3.25+, C++11, Ninja
- Analyzed dependencies: SDL2, OpenAL, networking, winmm, filesystem
- Created `engines/adapters/td-ra/dependencies.md` - Dependency analysis
- Created `C04-Spike-Plan.md` - Detailed spike plan
- Created `C04-Blocker-Report.md` - Comprehensive blocker analysis

**Blockers Identified:**
1. **Emscripten SDK Not Installed** - Cannot compile WASM code
2. **No Game Data for Testing** - C02 reference builds blocked awaiting owner-provided binaries
3. **Network Bridge Architecture Not Designed** - Native sockets must be replaced with WSS (HIGH complexity, 2-4 weeks)
4. **Filesystem Loading Strategy Not Defined** - Native filesystem access must be replaced with EMFS (MEDIUM complexity, 1-2 weeks)
5. **SDL2/Emscripten Compatibility Unverified** - Unknown if Emscripten SDL2 covers all Vanilla Conquer usage (MEDIUM complexity, 1 week)
6. **OpenAL/Emscripten Compatibility Unverified** - Unknown if Emscripten OpenAL covers all Vanilla Conquer usage (LOW-MEDIUM complexity, 3-5 days)

**Feasibility Assessment:**
- Native build: HIGH feasibility (1-2 days)
- WASM build: MEDIUM-HIGH feasibility with 4-8 week total effort (due to networking bridge)
- Headless build: MEDIUM feasibility with 3-5 week effort

**Recommended Path Forward:**
1. Install Emscripten SDK (immediate)
2. Request game data from owner (requires owner action)
3. Audit Vanilla Conquer network code (immediate)
4. Audit Vanilla Conquer SDL2 usage (immediate)
5. Design WSS bridge protocol (1 week)
6. If game data not available within 2 weeks, defer C04 and proceed with independent tasks

**Commit:** e059827

---

## Git Repository

All work committed to local git repository:
```
e059827 C04: Initial spike analysis and blocker report
8afabb3 C03: Bootstrap reproducible monorepo, engine toolchain and CI
b322294 C02: Pin original reference builds and independent parity fixtures
7161be9 C01: Establish code, asset and brand rights ledger
```

---

## Next Steps / Resume Point

### Immediate Actions Required

1. **Owner Actions:**
   - Provide verified TD and RA1 reference builds for C02 hash population
   - Provide approved game data for C04 testing

2. **Coding Agent Actions (can proceed without owner):**
   - Install Emscripten SDK and test basic WASM compilation
   - Audit Vanilla Conquer network code to understand socket usage
   - Audit Vanilla Conquer SDL2 usage to verify Emscripten compatibility
   - Design WSS bridge protocol architecture

3. **Alternative Path (if game data delayed >2 weeks):**
   - Proceed with independent tasks that don't require engine proof:
     - COMRADE05: Guest identity, lobby API, room state design
     - COMRADE06: Deterministic multiplayer protocol design
     - COMRADE04: UX and controls specification
     - COMRADE07: Asset pipeline design

### Exact Resume Point

**Resume at:** C04 (THU-1335) - Prove Vanilla Conquer native, WebAssembly and headless execution

**First action:** Install Emscripten SDK and begin network/SDL2 audits

**Prerequisites for completion:**
- Emscripten SDK installed
- Game data provided by owner
- WSS bridge architecture designed
- Filesystem loading strategy defined

---

## Linear Updates

Comments have not been posted to Linear due to GraphQL API issues. The following updates should be posted to Linear:

### THU-1332 (C01)
Status: Completed
Evidence: Created rights/ledger.jsonl with 16 entries and ADR 005. Public classic asset distribution BLOCKED; local import mode APPROVED.

### THU-1333 (C02)
Status: Completed
Evidence: Created reference-builds.lock.json structure, deviation matrices, fixture schema, and 20 baseline fixtures (10 TD, 10 RA1). All hash values BLOCKED awaiting owner-provided reference builds.

### THU-1334 (C03)
Status: Completed
Evidence: Created complete monorepo structure, toolchain pinning, CI pipeline. Engine scripts BLOCKED pending C04.

### THU-1335 (C04)
Status: Blocked
Evidence: Cloned Vanilla Conquer, analyzed dependencies, identified 6 blockers (Emscripten SDK, game data, network bridge, filesystem, SDL2 compatibility, OpenAL compatibility). Estimated 4-8 weeks for full WASM port. Requires owner-provided game data and Emscripten SDK installation before spike can proceed.

---

## Files Modified/Created

Total: 42 files
- rights/: 2 files
- docs/: 5 files
- references/: 10 files
- apps/: 8 files
- packages/: 9 files
- tests/: 6 files
- engines/: 2 files (plus Vanilla Conquer submodule)
- .github/: 1 file
- Root: 5 files

---

## Compliance with Requirements

✅ No .sh files executed locally (Windows PowerShell only)
✅ No destructive operations without confirmation
✅ No unapproved publishing or costs incurred
✅ Linear treated as source of truth
✅ Existing work preserved
✅ One unblocked issue at a time (C01 → C02 → C03 → C04 blocked)
✅ C04 blocker documented with clear next steps
✅ No invented unit statistics, permissions, reference data, or test results
✅ Requirements preserved: registration-free browser play, max 4 players, authentic controls, complete original mechanics
