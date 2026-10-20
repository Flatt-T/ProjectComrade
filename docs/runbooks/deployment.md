# Project Comrade deployment

Target: `https://projectcomrade.thunderchildcreativetechnologies.com`.

Initial verified engine/container build: [GitHub Actions](https://github.com/Flatt-T/ProjectComrade/actions/runs/39475714528).

## Build and validation

`pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm build`.
With Emscripten 6.0.12, CMake >=3.25 and Ninja on PATH, run `python tools/build-engine.py wasm` **before** the app build. The script prepares a disposable upstream source copy, applies the documented portability changes, and writes both JS/WASM pairs into `apps/web/public/engines`. The pinned upstream submodule remains untouched. Remove the disposable `build/engine-source` directory when changing the pinned upstream revision.

Run `python tools/prepare-content.py` before the app build. Serve with `STATIC_ROOT=apps/web/dist node apps/service/dist/index.js` (using your shell's environment syntax). Run `pnpm exec playwright install chromium` and `node tools/browser-smoke.mjs`. Checks start GDI and Nod without file input, verify native harvesting, construction/placement, training, combat damage and running audio. Screenshots are retained in `build/evidence` and as workflow artifacts.

`python tools/build-engine.py native` builds both games with null video, audio, and input. On Windows, install the MSVC C++ workload and Windows SDK. The `native` release job validates with MSVC on Windows 2022. Null-input linking is a platform proof, not a completed headless simulation runner.

## Proxmox service

The service lives in unprivileged Debian 13 LXC **280**, `projectcomrade-01`, on **prx-h2 / 192.168.1.200**. It has **2 cores, 4 GiB RAM, 24 GiB local-lvm disk**, and **10.1.0.60/24** on `vmbr0v10`, gateway/DNS `10.1.0.1`. Docker nesting and keyctl are enabled. No existing guests were repurposed.

`infra/proxmox-stage.sh` records the creation recipe; it refuses to overwrite an existing guest. `infra/prepare-service.sh` prepares only the dedicated guest. Bootstrap SSH uses the existing operator key at its workstation secret location; no key material is stored in this repository.

The main-branch workflow builds WASM and native engines, runs lint/types/unit/browser checks, publishes GHCR, and exports the image plus a SHA-256/image-ID manifest into a public GitHub Release tagged `main-<commit>`. The `COMRADE_DEPLOY_ENABLED=true` repository variable enables release publication. PRs do not publish or deploy.

The browser resolves `/health` without caching and loads engine JS and WASM with that release ID in their URLs. This prevents the public edge's static-file cache from mixing releases. Browser checks verify both engine requests use the deployed ID.

Inside the guest, `comrade-deploy.timer` runs every two minutes. `/usr/local/lib/comrade-pull-deploy.py` downloads releases over HTTPS without GitHub credentials, verifies the commit format, archive checksum and loaded image ID, then starts Compose with health checks. On a failed update it restores the previous loaded image. State is `/opt/comrade/current.json`; Compose is `/opt/comrade/compose.yml`. Actions waits until the public `/health` reports the expected commit, so publishing alone does not mark deployment successful. No self-hosted GitHub runner is installed.

## Cloudflare route

The route uses the existing Nginx Proxy Manager edge rather than a new tunnel:

- Cloudflare zone: `85400a3889dbd309007a2876f833c9f1`.
- Proxied A record: `projectcomrade` → `109.145.201.162` (record `27280e70a44a06352e96ed03c7381cc7`).
- NPM: proxy host **49**, domain `projectcomrade.thunderchildcreativetechnologies.com` → `http://10.1.0.60:3001`, WebSockets enabled, forced HTTPS.
- NPM Let's Encrypt certificate **68**, initially expires 18 January 2027; normal NPM renewal applies.
- Compose binds port 3001 to the guest's workload address. For local development it defaults to loopback unless `COMRADE_BIND_ADDRESS` is set.

Operator credential locations are documented in `C:\ProjectsOnTheGo\AWS Cost optimisation`. Keep values outside this repository and workflow logs. Only the new DNS record, certificate and proxy host were created for this service.

## Rollback

Stop `comrade-deploy.timer` before a manual rollback, or it will converge back to the latest release. On the guest, set `COMRADE_IMAGE=ghcr.io/flatt-t/projectcomrade:<previous-commit>` and `COMRADE_BIND_ADDRESS=10.1.0.60`, then run `docker compose -p comrade -f /opt/comrade/compose.yml up -d --pull never --wait`. Previous images remain loaded. Verify public `/health` and initialize both games. Restart the timer when ready to follow the latest release again.

Inspect deployment with `journalctl -u comrade-deploy.service`, `cat /opt/comrade/current.json`, and `docker compose -p comrade -f /opt/comrade/compose.yml ps` (set the image/bind environment first). No player assets are persisted on the service.

## Current limits

The TD slice bundles pinned freeware content and an authored map. Classic artwork is scaled, not redrawn in HD. Full reference parity, deterministic headless stepping, synchronized multiplayer, campaigns and other games remain future work. Health confirms deployment identity; browser tests establish the playable slice. See ADR 006 for the updated project direction.
