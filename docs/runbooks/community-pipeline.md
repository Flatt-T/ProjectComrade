# Community pipeline: problem reports, feature requests and fusion requests

Players send reports and requests through the in-game help widget (helpdot.me), which files
GitHub issues. Three kinds, each with its own rhythm. n8n on the Proxmox cluster runs the
schedules; GitHub Actions runs the agent that plans and builds; a human approves every merge.

| Kind | Label | Rhythm | Outcome |
| --- | --- | --- | --- |
| Problem report | `type:issue` | Daily 06:00 | All new reports reviewed together with the server logs before each one; one remediation PR to `main` for review. |
| New feature | `type:feature` | Weekly review (Mon 07:00), monthly vote (1st, 08:00, 7 days) | Top five shortlisted; the winner is built on `beta` and launched on the BETA server. |
| Fusion request | `type:fusion` | Weekly vote (Mon 07:30, 4 days) | Top ten most upvoted go to a vote; the winner is built as a fusion on `beta` and launched on BETA. |

Votes close daily at 06:30 when their time is up; each winner starts `community-build-selected`.

The widget’s AI answers come from the public guide at `/kb`. After a production deploy, sync
the sitemap as described in [knowledgebase.md](knowledgebase.md).

## Widget contract (helpdot.me)

The widget files issues in this shape so the pipeline can read them (the GitHub issue forms
in `.github/ISSUE_TEMPLATE` produce the same shape and are the fallback):

- Labels: `type:issue` + `needs-triage`, `type:feature` + `needs-triage`, or `type:fusion` + `needs-triage`.
- Body: `### Heading` sections. Problem reports: `What happened?`, `Steps to reproduce`,
  `Game style`, `Report ID`, `Timestamp (UTC)` (ISO 8601), `Diagnostics` (a json code block).
  Feature: `The idea`, `Why it matters`, `Heritage`, `Area`. Fusion: the headings of
  `3-fusion.yml` (`Fusion name`, `The pitch`, `Map type`, `Map size`, `Dangers`, `Tech level`,
  `Infantry`, `Vehicles`, `Aircraft`, `Naval`, `Buildings and upgrade progression`, `Superweapons`...).
- Diagnostics and report id come from the page:
  `window.comradeSupport.diagnostics()` returns recent player actions (with game ticks),
  errors, notices, connection events and a match snapshot; `await window.comradeSupport.report({ text })`
  stores them on the server and returns `{ id, at }` for the `Report ID` and `Timestamp` fields.

## Server logs

The service writes JSON-line logs (no IP addresses, no chat text): connections, rooms, match
starts, rejected messages, crashes and report ids. The last 50,000 entries are kept in memory
and exported at `GET /ops/logs?from=&to=&report=` with `Authorization: Bearer <token>`. The
export only answers on the internal network (requests through Cloudflare are refused) and only
when `COMRADE_OPS_TOKEN` is set.

## One-time setup

1. **Repository secrets and variables** (Settings, Secrets and variables, Actions):
   `ANTHROPIC_API_KEY` (the agent); optional variable `COMRADE_BETA_URL` (for example
   `https://beta.projectcomrade.co.uk`) to verify beta deploys.
2. **Human sign-off**: protect `main` and `beta` (Settings, Branches): require a pull request,
   one approving review and review from Code Owners (`.github/CODEOWNERS` names @Flatt-T).
   Note: PRs opened with the default Actions token do not trigger other workflows; re-run CI
   from the PR, or give the agent a GitHub App token if you want CI to start automatically.
3. **Labels**: run the "Sync labels" workflow once (it also runs when `.github/labels.json` changes).
4. **Ops token on the game server**: create `/opt/comrade/ops.env` (and `/opt/comrade-beta/ops.env`)
   containing `COMRADE_OPS_TOKEN=<random, 32+ characters>`, then reinstall the updated deployer
   (`infra/pull-deploy.py` to `/usr/local/lib/comrade-pull-deploy.py`).
5. **BETA server** on the same guest: `install -d /opt/comrade-beta`, copy
   `infra/containers/compose.yml` there, install `infra/comrade-deploy-beta.{service,timer}` and
   `systemctl enable --now comrade-deploy-beta.timer`. It serves on port 3002; route the beta
   hostname to `10.1.0.60:3002` in the tunnel. Merging into `beta` publishes a `beta-<sha>`
   pre-release that this deployer picks up within two minutes.
6. **n8n**: import `infra/n8n/comrade-community-schedules.json` and
   `infra/n8n/comrade-daily-issue-review.json`. Create two Header Auth credentials and attach
   them to the HTTP nodes: "GitHub" (`Authorization: Bearer <fine-grained token with Actions:
   write and Issues: read on this repo>`) for the github.com calls, and "Comrade ops"
   (`Authorization: Bearer <COMRADE_OPS_TOKEN>`) for the internal log fetch. Activate both.

## Running by hand

Every workflow has a Run button (workflow_dispatch): `Community - daily issue review`,
`Community - weekly feature review`, `Community - votes` (open feature, open fusion, close)
and `Community - build the vote winner` (issue number and kind).
