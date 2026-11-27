# Independent gameplay and series-coverage review

Review date: 2026-11-18. Reviewer: independent gameplay coverage specialist. This is a review of the planning pack, not a claim that the catalogue, engine, assets or game have already passed implementation acceptance.

## Verdict

The plan substantially addresses the user's underlying concern: faction identity is treated as behaviour, economy, production, tactical decisions and readable audiovisual feedback, rather than merely a larger model catalogue. Its series matrix accounts for major factions, countries, generals, classes, inherited expansion deltas, campaign forces, neutral objects and special forms. It expressly distinguishes authentic source facts from new Fusion design.

The two narrow execution gaps identified in the initial review have been corrected and independently verified in the updated task JSON. ENG-046 now owns authoritative objective/result lifecycle; OPS-005 and ENG-031 now require bounded implementation and independent-review work orders for non-entity capabilities, including environment and objective rules. ENG-044 now explicitly prohibits programme or release closure while mandatory criteria remain failed, blocked or unverified. All three findings in this targeted review are resolved at planning level. This does not certify implementation completion.

## Finding 1 — Give match and objective rules an authoritative implementation owner

**Initial priority:** High. **Verified disposition:** Resolved in the planning pack by ENG-046, `Implement authoritative match objectives and result lifecycle contracts`.

The follow-up review read the updated `engine/engine-tasks.json` record. It assigns a named simulation owner, versioned objective/participant/terminal-state rules, first-battle elimination implementation, separate source-specific objective children, deterministic finalization, save/reconnect/restart handling and explicit persistent-world non-termination protection. Its acceptance rejects implicit elimination fallback and conflicting or duplicate results. The implementation remains future work under that task; the following initial finding is retained as the rationale for the correction.

### Evidence in this pack

- `research/01_series_research_and_fidelity.md` lists game objectives as a required capability family, separating base elimination, control nodes, arena goals, campaign scripts and persistent-world rules.
- `programme/04-content-work-order-contract.md` requires faction integration to handle victory/defeat and persistent ownership.
- `programme/pack-delivery-tasks.json`, PKG-008, explicitly requires a decision and capability contract for control-node victory. PKG-009 separately classifies purchasing and beacon victory as mode mechanics.
- ENG-042 tests a representative battle ending in win/loss, but the inspected engine task register has no dedicated implementation owner for match objectives, terminal state and result finalization. ENG-031's named specialist implementation route is ENG-032 through ENG-034 plus historian content packets; these predominantly own entity capabilities.

This is not an assertion about a missing line of existing source code. It is a task-ownership gap in the proposed upgrade: preservation or adaptation of existing result behaviour has not been assigned with the same precision as construction, economy or bridges.

### Required amendment

Create a bounded engine task, or explicitly assign the following responsibility within an existing suitable task:

1. Inventory existing skirmish, native Classic and persistent result/lifecycle rules. Freeze their compatibility fixtures before adding the new profile.
2. Define a versioned authoritative mode/objective contract: objective ownership, progress or score where applicable, eligible participants/teams, victory/defeat predicates, terminal-state evaluation order, and exactly-once result publication. This is a new engine contract, not a claim that all historic titles used the same rules.
3. For every admitted source objective, record whether Fusion preserves it, deliberately adapts it, confines it to a specific mode, or treats it only as a source reference. The unified homage may include an entity without importing its entire original game mode; that decision must be visible.
4. Define simultaneous terminal events, disconnect/reconnect, surrender or elimination where supported, ties/time limits where supported, saves/replays and post-terminal command handling. Do not invent additional game modes simply to fill the schema.
5. Keep persistent-world ownership, shields, recovery and ongoing simulation separate from finite-match termination. A skirmish loss must not silently delete or end an unrelated persistent settlement.
6. Expose permitted objective status to HUD and AI through the approved observation contract. An AI cannot pursue a control or survival goal if it only understands destruction targets.

### Acceptance

The initial homage profile has an executable end-to-end result fixture, with the same commands producing the same outcome before and after save/reconnect. Every admitted alternate objective has its own exact source/adaptation decision and implementation evidence before the associated family gate closes. Duplicate terminal events cannot publish duplicate results. Persistent-world regression fixtures remain unchanged.

## Finding 2 — Materialise shared capability work, including environment mechanics

**Initial priority:** High. **Verified disposition:** Resolved in the planning pack by the updated OPS-005 and ENG-031.

The follow-up review read both updated JSON records. OPS-005 now requires bounded implementation and independent-review leaves for referenced capability IDs/versions, explicitly including environment, weather/ice/fire/contamination/deformation where sourced, objectives and mode rules. It supplies canonical capability work-order identities under the same sole publisher. ENG-031 requires this ownership mapping and blocks dependent packs when it is absent. Their acceptance requires fixtures and accepted support evidence, preventing a registry declaration or prose mention from unlocking a pack. The following initial finding is retained as the rationale for the correction.

### Evidence in this pack

- RES-024 creates source-backed capability IDs, state/lifecycle contracts, fixtures and downstream blockers.
- OPS-005 explicitly generates per-entity stages and distinct faction, tech-tree, AI and terrain-kit work orders.
- ENG-031 creates capability registration and a child-task template; it does not itself enumerate and publish every absent capability implementation task.
- `world-art/02_terrain_and_bridges_contract.md` correctly states that researched weather, ice, fire, contamination, deformation, tunnels and civilian behaviour become explicit mechanics workstreams when relevant. Terrain kit tasks principally own geometry, materials, props, integration and evidence, while authoritative algorithms belong to engine specialists.

An entity can therefore be blocked by a valid capability ID without a clearly identified task that will build the missing capability. Shared terrain or match mechanics are especially vulnerable because they do not necessarily correspond to one unit or structure. The problem is ownership and graph completeness, not a requirement to implement every candidate effect before research confirms it.

### Required amendment

Extend the single canonical generation/publication process so that every approved required capability maps to:

- an accepted, versioned existing implementation with applicable evidence; or
- one or more bounded implementation leaves and independent review leaves, identified by capability ID and version, with an explicit owner and exact prerequisite contracts.

The implementation packet must include commands or triggering events, authoritative state, deterministic ordering, interaction/permission rules, presentation events, save/network migration, required AI/UI access where applicable, fixtures, permitted edit paths and a concrete handoff. A complex capability must split by stable interfaces; a weak worker must not be assigned the entire environment or status system in one turn.

Validate the complete dependency closure:

`required source fact → approved Fusion decision → capability version → implementation/review work → entity/terrain/mode acceptance`.

Every required capability must have either accepted evidence or an open implementation owner. A terrain artist cannot close thin-ice mechanics through an attractive ice material. An entity worker cannot implement a private mind-control variant to bypass the common lifecycle contract. An unresolved source candidate stays unresolved rather than causing speculative implementation.

### Acceptance

Deliberately introduce a required capability with no implementation mapping; generation or release validation must fail with its exact ID and dependent rows. Regeneration must preserve shared capability ownership and avoid creating duplicate modules under separate faction entities. All admitted environment and objective mechanics participate in this same closure check.

## Finding 3 — Clarify that an unresolved disposition is not programme completion

**Initial priority:** Small wording correction. **Verified disposition:** Resolved in the updated ENG-044 acceptance and guardrails.

The follow-up review confirms ENG-044 now explicitly distinguishes an honest reconciliation report from programme/release closure: mandatory capability, era, entity, animation, terrain and qualification criteria must not remain failed, blocked or unverified at closure. Its added guardrail says an unresolved disposition is not a waiver; removing an obligation requires an explicit owner scope decision. This aligns the task with the existing PKG/G5/G6 gates. The original observation below is retained for traceability.

ENG-044's acceptance says every requested item has accepted evidence **or** an explicit unresolved disposition. That is suitable for an honest reconciliation report, but could be read as allowing final closure despite mandatory unfinished work. PKG gates and G5/G6 already require accepted mandatory content and keep unresolved obligations open.

Make the distinction explicit in ENG-044: reconciliation may be complete with named blockers; the full requested-content programme and its affected delivery gates remain open until all mandatory rows are accepted. A narrower preview release can truthfully report its scope. Changing a mandatory final requirement requires an explicit scope decision; recording a blocker alone does not make it optional.

## Coverage that should be retained

The reviewed pack already contains strong safeguards in the following areas. These are positive findings, not reasons to claim that the underlying research or implementation is finished.

| Area | Adequate planning coverage observed |
| --- | --- |
| Factions and derivatives | Countries, generals, subfactions and C&C4 classes have separate availability/delta accounting. Campaign forces are not automatically misrepresented as historically complete playable factions. |
| Every unit and building | Source denominators, aliases, inherited definitions, forms, spawned children, projectiles, wrecks, upgrades and neutral/civilian objects are reconciled separately. Runtime definition totals cannot certify unique finished content. |
| Production and economy | ENG-029 and RES-024 separate construction policies, harvest/node/supply economies, secondary income, caps and resource types, with accounting and cancellation rules. |
| Tactical character | Research schema and RES-026/INT-002 include acceleration, turning, turret alignment, acquisition, firing cadence, range, projectile travel, counters, harvest routes, power pressure, production emergence and input response. |
| Animation and combat truth | Simulation owns outcome/timing; animation, effects and audio must depict confirmed gameplay state. Generic models and idle-only animation cannot satisfy finished content. |
| AI usability | ENG-035 owns legal observations, economy/tech progression, signature capability use, dynamic route changes and seeded evidence; faction integration must exercise the intended tools. |
| Terrain consequence | Layered surfaces, elevation, occupancy, bridge topology, ramps, shipping clearance, resource access and strategic map validation are explicit. Theme names and textures alone do not complete terrain coverage. |
| Full catalogue versus budgets | UX-006 and the quality contracts preserve entities, states and authoritative behaviour across quality settings. Streaming/LOD and measured scene budgets cannot justify quietly reducing the final roster or skipping animation. |
| Cross-era integrity | RES-027 preserves source values and requires explicit authored decisions for incompatible economies, technology, scale, status interactions and persistent-world eligibility. |

## Limits of this review

This review examined the research overview/schema/matrix, engine architecture/task register, world/art/experience contracts, programme content contract, programme gates and family delivery gates. It did not independently enumerate every shipped object, execute a game build, inspect every generated future leaf, view the currently unavailable user video, or certify all source claims. No new historical fact is introduced by the proposed corrections. The additions above are implementation-governance recommendations derived from the pack's own stated requirements.
