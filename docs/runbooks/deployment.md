# Project Comrade deployment

Target: `https://projectcomrade.thunderchildcreativetechnologies.com`.

Verified initial image: `ghcr.io/flatt-t/projectcomrade@sha256:f8a7a4f3171ea2ae2d8b59ce5d9bfa831cebf29526d0a3a8d42039a1643bf320` ([successful release](https://github.com/Flatt-T/ProjectComrade/actions/runs/39475714528)). The initial release is published but has not been deployed to Proxmox.

## Build and validation

`pnpm install --frozen-lockfile`, then `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm build`.
With Emscripten 6.0.12, CMake >=3.25 and Ninja on PATH, run `python tools/build-engine.py wasm` **before** the app build. The script prepares a disposable upstream source copy, applies the documented portability changes, and writes both JS/WASM pairs into `apps/web/public/engines`. The pinned upstream submodule remains untouched. Remove the disposable `build/engine-source` directory when changing the pinned upstream revision.

Serve the built app with `STATIC_ROOT=apps/web/dist node apps/service/dist/index.js` (set the environment variable using your shell's syntax). Run `pnpm exec playwright install chromium` and `node tools/browser-smoke.mjs`. Both factories must resolve and pass a real MEMFS write/read probe over HTTP. This does not start gameplay.

`python tools/build-engine.py native` builds both games with null video, audio, and input. On Windows, install the MSVC C++ workload and Windows SDK. The `native` release job validates with MSVC on Windows 2022. Null-input linking is a platform proof, not a completed headless simulation runner.

## Proxmox service

Provision a dedicated unprivileged Debian LXC on the chosen cluster node with a free VMID, at least 2 CPU cores, 2 GiB RAM and 12 GiB storage. Inspect cluster capacity, storage, bridge and available templates before selecting these values. Enable nesting only if Docker is used inside LXC. Install Docker Engine and Compose. Do not expose the Proxmox management API through the public application route.

Register a dedicated GitHub Actions runner with labels `self-hosted,linux,comrade-deploy` in this service. Only the deployment job uses it; builds and PR checks use GitHub-hosted runners. Give its service account Docker access. Since the repository is public, restrict the runner group to the release workflow where your GitHub plan supports this; otherwise use an isolated disposable runner. Do not run untrusted PR workflows there.

The workflow publishes `ghcr.io/flatt-t/projectcomrade:<commit>` and deploys its immutable digest. Ensure the package can be pulled from the container (public visibility or a host-side read-packages credential). Set repository variable `COMRADE_DEPLOY_ENABLED=true` only after the runner, pull access and tunnel work. Deployment runs Compose with health checks and verifies the public `/health` endpoint.

## Cloudflare route

In the account owning `thunderchildcreativetechnologies.com`, create a dedicated remotely managed tunnel, run its connector on the service host, and configure:

```yaml
ingress:
  - hostname: projectcomrade.thunderchildcreativetechnologies.com
    service: http://localhost:3001
  - service: http_status:404
```

Create a proxied CNAME `projectcomrade` pointing to `<tunnel-id>.cfargotunnel.com`. The connector must share the host network with the application port or use its reachable private address. Compose binds the app to loopback. Store the tunnel token on the host, outside Git; never put it in workflow logs.

Cloudflare reference: https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/

## Rollback

Set `COMRADE_IMAGE` to the previous verified `ghcr.io/flatt-t/projectcomrade@sha256:...`, then run `docker compose -p comrade -f infra/containers/compose.yml up -d --wait`. Verify local and public `/health` and initialize each game in the browser. No player assets are persisted on the service.

## Current limits

Only engine initialization and local filesystem loading can be validated without original game data. Local files stay in volatile browser memory. Gameplay, edition hashes, reference fidelity, deterministic headless stepping, multiplayer and browser audio remain unverified or unimplemented. Do not interpret a successful health check as gameplay readiness.
