# Evidence catalogue and implementation handoff, version 1

A catalogue is an envelope containing a version, an operating context and typed records. The historical examples remain candidates. Three nonrelease entity rows exercise two different game engines and two linked forms. The synthetic examples exercise every record kind and the work graph without granting authority to publish. The old raw inventories are retained verbatim as parsed records alongside immutable source-file checksums.

| Record | Required evidence and use |
| --- | --- |
| Source profile | Identifies edition, platform, language, region, exact revision, rights reference, declared authority, differences, environment and executable/data hashes. A provisional source snapshot can have no executable hash. Locking needs a date and reviewer. |
| Faction | Names its parent and variant groups, legal starting seeds, roster, economy/production graph, counter roles, terrain and AI constraints and negative fixtures. |
| Entity | Immutable identity, mode/house decisions, source status, disposition, typed relationships, acquisition mechanism and five factual domains. Visible and logic-only rows carry distinct presentation decisions. |
| Capability | Versioned state, commands, update order, persistent-world policy, dependencies, implementation and review work orders, fixtures and support status. Includes environmental, objective and mode rules. Accepted support requires resolved contracts, independently owned review, distinct implementation/review tasks, cleared blockers and a usable fixture locator. |
| Terrain feature | Historical theatre, optional authored biome, terrain family, geometry/height, route/build rules, destruction, resources, visibility, transitions, generation, budgets and dependency records. |
| Map theme | Authored biome and historical theatre IDs, features, objective, fair starts, resources, route redundancy, cover, height, visibility and playable fixtures. |
| Observation | Bounded question and setup, profile, source objects, map hash and seed, controls, input, expected and measured outcomes, sample count, evidence method and reviewer. |
| Conflict | At least two separately evidenced claims, affected records, scope, owner, blocking task and reviewed adjudication. |
| Asset provenance | Source, author, asset type, applicable permissions, derivation links, distributability, immutable artifact digest, rights reviewer and evidence. A research-reference class cannot qualify a shipping asset. A distributable asset has a concrete deliverable class, no open blockers and a rights reviewer independent of creator and owner. |
| Adaptation | Distinguishes source and Fusion semantics, names target profile, disposition, rationale, fixture and approval. |
| Completion | Per-stage evidence, dated-by-locator artifacts, independent reviewer, reason for approved sharing or exceptions, transition history and explicit release state. |

The 15 files under schemas consist of these 11 strict record schemas plus shared definitions, an envelope, a dry-run input and its output. The schemas use JSON Schema Draft 2020-12. The structural validator rejects extra keys and inconsistent datum status. Five detailed entity domains cover production, physical/movement, combat/interaction, economy/powers and presentation. A partially investigated group can represent all unmeasured fields with a single explicit resolution owner, task and action. Once the group is expanded, every defined field receives its own datum wrapper. The wrapper carries value, unit, status, profile, evidence, tolerance and resolution. An explicit measured or sourced zero needs evidence. Unknown/conflicting data has null value. A reviewed inapplicable value needs evidence and a scoped rationale in its locator or accompanying adaptation.

## Immutable identity

The fixed object member order is source_title, edition, platform, source_faction, namespace, source_object_id, form_id. Values are nonempty strings using source-authoritative spelling. Whitespace around values and ASCII control characters are invalid. Normalize each value to Unicode NFC. Serialize JSON in that order with UTF-8, Unicode characters unescaped, no whitespace or trailing newline. Compute SHA-256 of the bytes. Retain all 64 lowercase hex characters. The first 16 hex characters form rowUid. Reject duplicate identities and also reject different full digests with equal prefixes. The immutable source faction is the defining source namespace or shared origin. Access gained through another faction is an availability entry. Display text, evidence revision, Fusion mapping, price and current owner are excluded. Changing a historical identity requires a reviewed migration, never a silent rename.

Task keys take the form F3D-ENTITY-<rowUid>-<stage>-<part>. Parts start at 001. The current projection emits one part per stage and one entity per leaf. A future approved split must retain old keys as aliases, journal the full hash, part assignments and prior issue IDs, prove no dropped variant or evidence, and pass the same dependency checks. An alias points to one canonical entity with evidence. A form points back, has its own identity and declares carried state. Original and adapted forms may require different saved-state policies. Producer alternatives, mandatory prerequisites, alternative prerequisites and explicit exclusions remain distinct relationships.

## Stage prerequisites and scope

| Stage | Local prerequisite | Additional evidence the coordinator resolves |
| --- | --- | --- |
| SPEC | Accepted research intake | Locked profile and source identity, approved target mapping, row-specific fixture and file lease. |
| SIM | SPEC | Required capability support and authoritative source/adaptation fields. |
| MODEL | SPEC | Original or cleared rights, geometry, footprint and art direction. |
| RIG | MODEL | Model revision, approved pivots, sockets and hierarchy. |
| ANIM | RIG, SPEC | Authoritative event timing and state/pose contract. |
| FX_AUDIO_UI | SPEC, SIM | Rights, normal selection and feedback, visibility/ownership limits and idempotent events. |
| INTEGRATE | SIM, MODEL, RIG, ANIM, FX_AUDIO_UI | Normal acquisition, terrain, save/replay, agent use and performance evidence. |
| REVIEW | SIM, FX_AUDIO_UI, INTEGRATE | Independent whole-entity evidence. Rights and coverage must still pass. |

For a support power, SPEC describes targeting, charge, ownership and interruption. SIM exercises command admission and effects. Geometry, rig and animation stages record the actual visible emitter/carrier or an independent, evidence-backed exception for an abstract effect. FX_AUDIO_UI includes timer, targeting feedback and after-effect. For environmental features, the terrain feature and theme records first define meshes/LOD/transitions, collision/navigation/buildability, gameplay states, generation and resource/objective roles. The supervisor associates the appropriate world, art, scenario and review work orders. Associate required mechanics with capability records and their implementation/review tasks. The entity-key projector never fabricates an entity identity from a biome or weather name. OPS-005 alone assigns live mappings, capability task keys, final repository paths and Linear blockers.

Release evaluation resolves profile, identity, candidate disposition, source domains, approved adaptations, rights, capabilities, unresolved conflicts, fixtures and independent stage evidence. Completed art cannot bypass simulation and integration. The structural validation also rejects dangling or wrong-kind references, contradictory country/mode/edition availability, self/cyclic aliases, collapsed forms, impossible unseeded production chains for verified objects and unsafe completion transitions. Unresolved research chains remain in coverage with their exact row IDs. A capability referenced as required or accepted has both implementation and independent-review routes. The v1 producer algorithm starts from explicitly declared starting, scripted, spawned or transformation roots. Availability via a map script, spawn or transformation is only as authoritative as the recorded acquisition evidence. Verify those routes in each shipped mode before closing an era census.

## Import, version and transfer

Run with Python 3.10 or newer, jsonschema 4.18+ and referencing. From this directory:

```sh
python tools/import_candidates.py /path/to/docs/fusion-3d/research
python tools/validate_catalogue.py templates/nonrelease-examples.json
python tools/validate_catalogue.py templates/all-kinds-synthetic.json
python tools/validate_census_task_expansion.py templates/nonrelease-examples.json implementation_task_manifest.json
python tools/validate_census_task_expansion.py templates/synthetic-graph-test.json synthetic-projection.json
python tools/test_catalogue.py
```

The importer verifies equality of every parsed native row after compression and decompression. Its report preserves the exact input file hashes, source metadata and input ordinal. An early definition and a late path keep their original status. Inspecting object content in a separately pinned follow-up produces a new record linked to its evidence. It never overwrites this intake history.

Normal research projection can take --intake /path/to/lease.json. This uses fanout_input.schema.json, validates the canonical catalogue content hash and identity digest, reads permitted relative paths, outputs, accepted scenario fixtures, contract dependencies and reviewed shared-artifact instructions per stage. It carries the hashes and locations of the capability registry, rights ledger and existing issue mapping for coordinator verification. The projection does not open those external ledgers or validate their creator signatures. The coordinator must verify their bytes before issuance. Synthetic tests use isolated fictitious output paths. Every output projection sets publishable=false. The historical sample withholds all three rows. The positive synthetic projection has eight leaves and explicit source, rights and style gates.

For a v2 migration, retain a byte-for-byte v1 input, validate it, produce old-full-hash to new-full-hash mappings only when identity actually changes, and record aliases to old task and source IDs. Revalidate exclusions, case sensitivity, null/zero, shared assets, forms, fixtures and prior completion evidence on the new set. Reconcile import, distinct identity, variant and rights counts separately. Freeze a release revision only after engine, art/world and independent research approval.

Valid capability fixture locators use fixture:, repo:, https://, FIX- or FX- plus a concrete identifier. Runtime execution and repository/fixture existence are checked by the independent reviewer against the specified revision. An accepted text flag by itself grants no capability or presentation rights.
