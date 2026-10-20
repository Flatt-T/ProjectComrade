# C04 development evidence — 20 October 2026

- Fresh builds of both Vanilla Conquer engines with Emscripten 6.0.12 completed locally. The pinned upstream submodule was not modified; `tools/build-engine.py` prepares a disposable patched copy.
- Both actual WASM factories initialized over HTTP in headless Microsoft Edge. Each passed a write/read probe using exported MEMFS. `tools/browser-smoke.mjs` performs the same check in CI with Chromium.
- Browser workbench supports choosing TD/RA, initializing separately from main(), selecting local game files, mounting into `/comrade/data`, setting the engine data/user paths, and starting main explicitly. Imported bytes remain in volatile browser memory.
- Null-input backend implements the keyboard factory, emits no host input, and returns no ASCII key. Native configurations select null video/audio/input. Deterministic simulation stepping and command injection are still future work.
- Native MSVC build attempted locally: CMake could not find a usable Visual Studio 2022 C++ installation. The installer exists, but `VC/Tools/MSVC` does not. A Windows 2022 CI build is provided to validate compilation/linking.
- Application build, lint, TypeScript and 16 unit tests passed. Import tests cover bytes, data path, traversal, duplicate names and memory limit.
- Production service serves the compiled UI and WASM with the correct MIME type, health endpoint and bounded `/ws` transport placeholder. Container and Compose definitions include a health check, non-root runtime and loopback origin binding.
- Main-branch release workflow builds WASM/native artifacts, validates browser initialization, and publishes the image. Deploy is gated on repository variable `COMRADE_DEPLOY_ENABLED` and a dedicated runner.

## Verified hosted release

Release commit: `7a450a585de278cc17398bc59e3aa5cd3277df4f`.
GitHub run: https://github.com/Flatt-T/ProjectComrade/actions/runs/39475714528 — successful.

- Linux WASM build: passed for both games.
- Windows MSVC x64 native headless build: passed for both games after correcting legacy timer and window callback signatures in the disposable source copy.
- CI lint, typecheck, 16 unit tests and application build: passed.
- Headless Chromium: both actual WASM factories initialized and passed MEMFS read/write over HTTP.
- Production Docker image built and published: `ghcr.io/flatt-t/projectcomrade@sha256:f8a7a4f3171ea2ae2d8b59ce5d9bfa831cebf29526d0a3a8d42039a1643bf320`.
- Deployment job: skipped because the deployment gate is disabled. No repository secrets, variables or self-hosted runners were configured at inspection. Public-domain and container-runtime validation remain pending infrastructure access.

## External blockers

At inspection, no Proxmox connector was available and reading the local SSH config was denied. Cluster connection details were requested. The connected Cloudflare account `9c43bb554d99b7acc1f24b30cd90eddb` returned no `thunderchildcreative.com` zone; correct account access was requested. No container or DNS route is claimed as provisioned without those dependencies.

Original game data is absent. Gameplay, reference fidelity and authentic asset hashes are unverified. Network/audio remain deferred until the core engine executes with data.
