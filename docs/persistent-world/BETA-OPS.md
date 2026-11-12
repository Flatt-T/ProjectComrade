# COMRADE persistent-world beta — ops runbook, evidence index, known limitations

Scope: THU-2244 / PW20. Beta = `https://beta.projectcomrade.co.uk`, LXC 283
`projectcomrade-beta-01` (10.10.0.61) on prx-h4, container `comrade-comrade-1`,
port 3001 behind the Cloudflare tunnel. Database `comrade_beta` + role
`comrade_beta_app` on the shared PG VM (10.10.0.35), schema `mmo`.

## Deploy / rollback

- Deploys are automatic: `comrade-deploy.timer` on the guest runs
  `/usr/local/lib/comrade-pull-deploy.py`, which follows the newest
  `main-<sha>` GitHub release, verifies checksums, recreates the container
  and rolls back to the previous image on health-check failure.
  State: `/opt/comrade/current.json`.
- **Manual pin / rollback** (verified 2026-11-12):
  1. `systemctl stop comrade-deploy.timer` on the guest (otherwise the
     timer redeploys mid-drill).
  2. `cd /opt/comrade && COMRADE_IMAGE=ghcr.io/flatt-t/projectcomrade:<sha> docker compose --env-file service.env -p comrade -f compose.yml up -d --wait`
  3. Verify `https://beta.projectcomrade.co.uk/health` reports the pinned
     commit with `database:true`, then smoke `/world`, `/api/me`,
     `/api/mmo/enter`.
  4. Restore: same command with the target release tag, then
     `systemctl start comrade-deploy.timer`.
- **Gotcha**: `service.env` cannot be sourced by POSIX sh — the DB URLs
  contain `&` (`uselibpqcompat`), which backgrounds the assignments and
  produces a container with `database:false` and no `/mmo`. Always use
  `docker compose --env-file service.env` or the deploy script (which
  parses the file itself).
- Images are retained on the guest; rollback targets seen working:
  `9d9f45b…` (PW19) and `3384342…` (docs). Do not roll back across MMO
  schema migrations without a DB restore plan — migrations are
  append-only but older binaries may not understand newer columns.

## Backup / restore

- `pg_dump` runs on the PG VM (native pg tools); dumps land in
  `/opt/comrade-backups/` (e.g. `comrade_beta-20261112T192115Z.dump`,
  sha256 `b12d911f…402d`). A Proxmox snapshot alone is not a
  PostgreSQL-consistent recovery plan.
- Drill (verified): dump → restore into disposable `comrade_beta_drill`
  → table counts and journal tail matched source.

## Capacity evidence (measured 2026-11-12, commit 2e9f45b/3384342)

Stated beta target: 200 registered / 50 concurrent / 20 regions.

| Measure | Observed | Where it breaks / limit |
|---|---|---|
| Concurrent WS subscribers | 50/50 subscribed, 0 errors, twice | Admission cap `MMO_MAX_CONNECTIONS` (default 128, PR #48); not load-tested at cap |
| Subscribe→snapshot latency | p50 ~1.5–1.7s, p95 ~1.8–2.0s at 50 conns | Single shared region; scales with per-region runner count, untested |
| Container CPU/mem | ~4% CPU, ~67MiB/512MiB at 50 conns | Headroom ~7x on memory; CPU bound would appear first under many awake regions |
| PG connections | 13 total (12 idle + 1 active) at 50 conns | Role limit raised 10→30 for probing; pool max 8/process — multi-process deployments need the limit re-derived |
| Outbox delivery lag | p50 0.05–0.23s by topic, max 1.66s | Notification email/push latency not measured (0 notifications in window) |
| Journal growth | 2978 events ≈ 1.9MB for ~14h of beta play | Snapshot avg 88kB; growth is per-tick commands only — fine at current density |
| Awake vs quiescent regions | 1 active region; hibernation needs 300s min-awake + 120s lookahead with zero subscribers/online players | Wake latency unmeasured on beta (no natural hibernate in window); covered by integration tests; `region-wake` log carries `wakeMs` |
| Tick cost vs unit count | Not isolated-measured; 8 settlers × ~16 units ticked cleanly at 15Hz | Concentrated-battle density unmeasured — next capacity step |

## Known limitations (kept visible per THU-2244)

- Guest identities (`MMO_ALLOW_GUESTS=1` on beta) are test scaffolding,
  not registered-account behavior; production auth path unexercised here.
- Salvage/ladder conservation verified in tests; no live salvage
  activity on beta yet (0 asset_ledger rows).
- Notification delivery: in-app path exercised in PW27 scenario;
  email/push channels unconfigured (SES vars empty) — delivery delay
  for those channels is unmeasured.
- Single beta region has been the only live region; multi-region
  contention, frontier expansion under load, and 20-region wake storms
  are unproven.
- `dependency-check` CI job fails on a known advisory — not a release
  blocker, tracked separately.
- Rollback across schema versions is not rehearsed beyond same-schema
  image pins.

## Evidence index

- PRs: #36 region liveness (853b225), #37 barter (PW13), #38/#40 packed
  carriers/factions, #41 salvage+sites+ladder (PW24), #42 PW26 audit,
  #43 sea transport, #44 frontier/worldgen, #45 cross-region transfer,
  #46 PW19 beta flows (9d9f45b), #47 PW20 liveness hardening (2e9e534),
  #48 admission cap.
- Beta health: `https://beta.projectcomrade.co.uk/health` reports the
  deployed commit; last verified `33843422e288…`.
- DB metrics snapshot script: run `node` inside `comrade-comrade-1`
  against `MMO_DATABASE_URL` (see session scratch `.tmp-pw20-metrics.cjs`
  pattern; queries are read-only).
- Load probe: `apps/service/.tmp-pw20-load.mjs` (`LOAD_N`, `LOAD_HOLD`,
  `LOAD_HOLD_MS`, `PROBE_BASE`, `PROBE_REGION`).
