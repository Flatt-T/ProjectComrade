# Existing runtime preservation

Baseline observed on 24 November 2026 under [THU-2534](https://linear.app/thunderchild-creative/issue/THU-2534). [Baseline and ticket inventory](baseline.json).

| Preserve | Pinned baseline and evidence |
| --- | --- |
| Native Classic | Existing native TD and RA1 adapters, engine/asset source pinning and public Classic routes. Both native Classic profiles currently declare `lockstep: false`. The native TD browser smoke and the separate Fusion lockstep smoke each passed. |
| Legacy Fusion profiles | Existing pack IDs, rules, save decoding, command behavior and lobby choices. New Fusion 3D work uses its own versioned profile. |
| Persistent worlds | `comrade.mmo.v1`, ruleset version 1 and `fusion-persistent-v1` snapshots at the observed source revision. The base migration list ends at version 20. The integration outbox fix adds migration 21 and retains the preexisting journal foreign key. |
| Ownership and privacy | Stable player, settlement and asset identities; replay and journal ordering; offline shields, Engineer consent and region authority. Use side-by-side play and saved-world recovery evidence to qualify changes. |
| Deployment and recovery | Public beta uses its documented isolated application and database. Both channels published the running commit with different image digests. Compare the installed image, effective channel, health response, backup and compatible rollback before promoting a new candidate. |

The baseline probes record public and private health, deployed source revisions and read-only source references. The installed image and database state still require operator evidence. Treat a missing rights record, reference hash or independent acceptance result as an open release criterion.
