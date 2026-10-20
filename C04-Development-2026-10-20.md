# C04 development evidence — 20 October 2026

- Fresh builds of both Vanilla Conquer engines with Emscripten 6.0.12 completed locally. The pinned upstream submodule was not modified; `tools/build-engine.py` prepares a disposable patched copy.
- Both actual WASM factories initialized over HTTP in headless Microsoft Edge. Each passed a write/read probe using exported MEMFS. `tools/browser-smoke.mjs` performs the same check in CI with Chromium.
- Browser workbench supports choosing TD/RA, initializing separately from main(), selecting local game files, mounting into `/comrade/data`, setting the engine data/user paths, and starting main explicitly. Imported bytes remain in volatile browser memory.
- Null-input backend implements the keyboard factory, emits no host input, and returns no ASCII key. Native configurations select null video/audio/input. Deterministic simulation stepping and command injection are still future work.
- Native MSVC build attempted locally: CMake could not find a usable Visual Studio 2022 C++ installation. The installer exists, but `VC/Tools/MSVC` does not. A Windows 2022 CI build is provided to validate compilation/linking.
- Application build, lint, TypeScript and 16 unit tests passed. Import tests cover bytes, data path, traversal, duplicate names and memory limit.
- Production service serves the compiled UI and WASM with the correct MIME type, health endpoint and bounded `/ws` transport placeholder. Container and Compose definitions include a health check, non-root runtime and loopback origin binding.
- Main-branch release workflow builds WASM/native artifacts, validates browser initialization, and publishes the image. Deploy is gated on repository variable `COMRADE_DEPLOY_ENABLED` and a dedicated runner.

## External blockers

At inspection, no Proxmox connector was available and reading the local SSH config was denied. Cluster connection details were requested. The connected Cloudflare account `9c43bb554d99b7acc1f24b30cd90eddb` returned no `thunderchildcreative.com` zone; correct account access was requested. No container or DNS route is claimed as provisioned without those dependencies.

Original game data is absent. Gameplay, reference fidelity and authentic asset hashes are unverified. Network/audio remain deferred until the core engine executes with data.
