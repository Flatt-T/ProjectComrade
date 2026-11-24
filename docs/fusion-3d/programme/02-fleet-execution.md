# Specialist agent execution contract

The fleet works through bounded tasks with a coordinator, named specialists and independent reviewers. It must deliver the complete programme without concurrent edits corrupting shared simulation or content contracts. Each worker starts a fresh task context, reads the exact prerequisites, uses the highest reasoning capability available to its assigned runtime for substantive decisions, and returns reproducible evidence. Filling a context window is not a completion criterion.

## Roles and decision ownership

| Role | Owns | Must not decide alone |
| --- | --- | --- |
| Programme coordinator | Task readiness, dependency graph, context packets, file leases, release ledger, conflict resolution and progress | New product scope, rights claims, unreviewed gameplay changes or self-certification of implementation |
| Series researchers, one per era family | Source corpus, exact builds, faction/entity census, mechanics and reference scenarios | Runtime balance, public asset permission or unverified facts |
| Gameplay director | Fusion rules translation, faction identity, combined-arms feel and balance change records | Changes to Classic fidelity or existing persistent protections without their authority |
| Simulation architect and domain engineers | Determinism, capabilities, command/state contracts, terrain/navigation/combat/economy | Renderer frame time controlling simulation, whole-engine replacement without evidence |
| Rendering and tools engineers | GPU backend, scene, camera, visibility, picking, asset pipeline and profiling | Combat, targeting or permission outcomes |
| World/level specialists | Terrain topology, biomes, roads/water/bridges, map fairness and authoring | Unspecified movement costs or sight rules disguised as scenery |
| Technical artists and animators | Per-entity models, rigs, states, LODs, materials, motion, effects and audio cues | Hitboxes, weapon damage, gameplay timing or asset provenance approval |
| Network/persistence specialists | Wire compatibility, replay, migration, regional authority, save safety and recovery | Destructive reset or optimistic unjournaled authority |
| QA/performance/accessibility reviewers | Independent functional, visual, input, device and failure evidence | Waiving a failed criterion to match delivered code |
| Integrator/release specialist | Reviewed merge sequence, candidate builds, rollout and rollback evidence | Promoting an unqualified candidate or changing access/paid services |

The role is not permission to send messages, invite people, buy services or access unrelated systems. Use existing project resources and authorization. Record actual software/model/hardware used rather than pretending an unavailable specialist or tool ran.

## One task context packet

Every leaf ticket must contain its stable plan ID and Linear ID, source mandate, exact scope and non-goals, owning specialist, prerequisite IDs and artifact hashes, relevant files and interfaces, ordered steps, expected outputs, concrete positive/negative acceptance cases, guardrails, source links and handoff format. Include a small current baseline and the relevant decision excerpts; link large source corpora for targeted reading. Do not ask a weaker worker to infer the task from a project-sized prose document. For content work include exactly the assigned source IDs, definition IDs, animations, state combinations, terrain cases and reference fixtures.

## Dispatch algorithm

1. Refresh the current branch/head and task state. Read new owner amendments and the task's source revisions. Reconcile a moved base; never overwrite another agent's changes.
2. Select a Backlog task only when all blocking predecessors have accepted evidence and all required source/rights/design inputs are resolved for its scope. Review-only and source work can start independently.
3. Acquire a coordinator file lease naming the task, branch, allowed files/interfaces, start time and handoff checkpoint. A lease is coordination metadata, never a security bypass or reason to erase another branch.
4. Use a dedicated branch/worktree `fusion3d/<plan-id>-<short-name>`. Preserve uncommitted user work. Read repository AGENTS instructions at execution time.
5. Publish a brief implementation outline and the exact acceptance commands/scenarios before coding. If the task cannot be completed within a coherent reviewable change, split it into explicit child work orders before editing; do not silently deliver half.
6. Implement only the leased contract. Changes to shared schemas, `game.ts`, `rules.ts`, `map.ts`, protocol, migrations, dependency lockfiles or build configuration require the owning integration lane. Queue requested edits instead of concurrent blind modification.
7. Run the task's tests and capture the required visuals/raw data. An unsupported command, absent source, skipped browser or placeholder test is `unverified`, never `pass`.
8. Hand the revision to a reviewer who did not implement it. The reviewer uses the requirement and reference evidence before reading the implementation's own expected values; run at least the decisive independent scenario.
9. Fix rejected criteria in the same scope. The integrator rebases, checks interface compatibility, and reruns the affected integration checks on the combined candidate. A green task branch alone does not establish combined correctness.
10. Mark the leaf Done only after all mandatory cases pass and evidence is attached. Update native blockers, manifests, ledger and handoff. Pick the next ready task and continue autonomously. A blocked item must name the missing input and unblocked work that proceeds.

## Parallelism boundaries

Era research, original concept art, source/asset rights work, test fixture design and device profiling preparation can run concurrently. Shared simulation extraction precedes concurrent domain implementation. Once interfaces are frozen, rendering, animation/tools, terrain topology, gameplay capabilities and UI can proceed against versioned fixtures. Pack authors only consume accepted capability schemas; they cannot implement ad-hoc engine features in pack files. Each content pack uses its own directory and registry integration is serialized. One integrator owns root scripts and lockfiles. Do not let multiple agents edit the same large simulation file just because the task labels differ.

## Context exhaustion and continuity

Before context limits threaten a coherent handoff, commit or checkpoint the exact in-progress diff safely and write `HANDOFF.md` containing task/branch/base/head, completed steps, pending steps, decisions, files touched, commands/results, known failures, blockers, evidence paths and the next exact action. Leave task In Progress. A successor reads the task plus handoff and verifies the branch state before continuing. Never reset work, start the whole programme again or declare completion because an agent turn ended. Keep source and model reasoning summaries concise and actionable; do not require private chain of thought.

## Required task result

```json
{
  "taskId": "ENG-example",
  "linearId": "resolved-at-publication",
  "baseSha": "exact-sha",
  "candidateSha": "exact-sha",
  "changedFiles": [],
  "criteria": [
    {"id": "AC1", "expected": "specific observable outcome", "actual": "observed outcome", "verdict": "pass|fail|blocked|unverified", "evidence": "relative-path-or-url"}
  ],
  "sources": [],
  "commands": [],
  "reviewer": "independent-review-identity",
  "blockers": [],
  "nextAction": "precise action"
}
```

The sample values are schema examples, not fabricated task/issue/evidence records. The publishing map supplies real Linear IDs. Acceptance evidence includes test fixture versions, data seed, engine/pack/rules/render versions and UTC timestamp, and device/browser when relevant.

## Escalation and continued work

An agent can resolve routine code details under its task. Escalate only missing source authority, genuinely ambiguous owner decisions, rights/access restrictions or a failed gate that requires scope change. Finish a concrete proposal with alternatives, evidence, impact and recommended choice before requesting an owner decision. Do not manufacture new approvals for already authorized work. Existing conditional deployment authority in COMRADE 20 continues to apply when its gates are met; this planning session itself does not perform a deployment.
