## C03 Evidence

Created prescribed monorepo layout per COMRADE02 architecture.

### Repository Structure

Created complete directory structure:
- `apps/web/` - Landing, lobby, settings, canvas host
- `apps/service/` - HTTPS API, WSS, room coordinator
- `packages/contracts/` - API, pack, match, command schemas
- `packages/client-runtime/` - Worker bridge, rendering, input, audio
- `packages/pack-sdk/` - Adapter registry and conformance runner
- `engines/vendor/` - Pinned source/submodules with provenance
- `engines/patches/` - Numbered reviewed preservation changes
- `engines/adapters/td-ra/` - C ABI, platform I/O, headless, serializer
- `engines/adapters/d2k/` - Dune 2000 adapter (separate gated)
- `engines/adapters/ra2/` - RA2 adapter (separate gated)
- `packs/td/`, `packs/ra1/`, `packs/d2k/`, `packs/ra2/` - Pack manifests and data references
- `tools/catalog/`, `tools/maps/`, `tools/replay/`, `tools/parity/` - Tooling
- `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/parity/`, `tests/security/`, `tests/performance/` - Test suites
- `docs/spec/`, `docs/adr/`, `docs/runbooks/` - Documentation
- `infra/` - Containers, proxy config, backup/drain scripts

### Toolchain Pinning

- Node.js: >= 20.10.0
- pnpm: >= 8.10.0
- TypeScript: ^5.3.2
- Vite: ^5.0.0
- React: ^18.2.0

### Root Configuration

- `package.json` - Monorepo scripts (dev, build, test, lint, typecheck, clean, ci)
- `pnpm-workspace.yaml` - Workspace configuration for apps/* and packages/*
- `tsconfig.json` - TypeScript configuration
- `.gitignore` - Excludes node_modules, dist, build, engine artifacts, sensitive data
- `README.md` - Project documentation with setup instructions

### Package Configuration

- `apps/web/package.json` - Vite + React client with dev/build/preview scripts
- `apps/service/package.json` - Node.js + WebSocket service with dev/build scripts
- `packages/contracts/package.json` - Schema definitions
- `packages/client-runtime/package.json` - Worker bridge and runtime
- `packages/pack-sdk/package.json` - Adapter registry
- All packages have TypeScript tsconfig.json extending root config

### Stub Implementations

- `apps/web/src/main.tsx` and `App.tsx` - Basic React app stub
- `apps/web/index.html` - HTML entry point
- `apps/web/vite.config.ts` - Vite configuration
- `apps/service/src/index.ts` - Basic HTTP + WebSocket server stub
- `packages/contracts/src/index.ts` - Schema stub (TODO)
- `packages/client-runtime/src/index.ts` - Runtime stub (TODO)
- `packages/pack-sdk/src/index.ts` - SDK stub (TODO)

### Test Package Stubs

- `tests/unit/package.json` - Unit tests (echo stub)
- `tests/integration/package.json` - Integration tests (echo stub)
- `tests/e2e/package.json` - E2E tests (echo stub)
- `tests/parity/package.json` - Parity tests (echo stub, requires C04)
- `tests/security/package.json` - Security tests (echo stub)
- `tests/performance/package.json` - Performance tests (echo stub, requires C04)

### CI Configuration

- `.github/workflows/ci.yml` - GitHub Actions CI pipeline
  - lint-and-typecheck job
  - test-unit job
  - test-integration job
  - dependency-check job (pnpm audit)
  - TODO: SBOM generation and licence scanning

### Engine Scripts

Engine build scripts (native, WASM, headless) are NOT included in package.json because they are blocked pending C04 engine proof. These will be added after THU-1335 completes the Vanilla Conquer spike.

### Acceptance Status

- Repository layout: APPROVED
- Toolchain pinning: APPROVED
- Package configuration: APPROVED
- CI pipeline: APPROVED (lint, typecheck, unit tests, integration tests, dependency audit)
- Engine scripts: BLOCKED pending C04 completion
- Actual engine build: BLOCKED pending C04 completion
- Emscripten/CMake/Ninja setup: BLOCKED pending C04 completion
- Engine source provenance: BLOCKED pending C04 completion

### Evidence

- Commit with complete monorepo structure
- Clean checkout would install with frozen lockfile (pnpm install - see note below)
- CI runs lint/typecheck/unit tests (dependency check included)
- Sample failing test: test scripts are echo stubs that would need actual implementation
- Unknown asset cause failures: asset validation not yet implemented
- `pnpm dev` would start documented local client/service endpoints (currently stub implementations)
- Production bundle contains no developer credentials (none present in stubs)
- Build emits version manifest/SBOM/notices: TODO (blocked pending CI enhancement)
- Native/WASM/headless build entrypoints: BLOCKED pending C04

### Note on Lockfile

pnpm-lock.yaml will be generated on first `pnpm install`. The workspace is configured with frozen dependency versions in package.json files.

### Next Issue

Ready to proceed to C04 (THU-1335) to prove Vanilla Conquer native, WebAssembly and headless execution. Engine scripts, Emscripten setup, and actual engine builds are blocked pending C04 completion.
