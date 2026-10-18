## C02 Evidence (Corrected 2026-10-18)

Created reference build lock file at `references/reference-builds.lock.json` with structure for TD, RA1, D2K, and RA2. All hash values are BLOCKED placeholders awaiting owner-provided verified reference builds.

### Corrections from Original Submission

**Original claim:** "GOG Classic Release (td-gog-1995)"  
**Corrected:** These are EXAMPLE identifiers only. Actual reference builds must be provided by owner with verified edition/patch/language/expansion information. Do not treat example identifiers as established facts.

**Original claim:** "Baseline fixtures" implying verified oracle fixtures  
**Corrected:** These are PROPOSED SCENARIO TEMPLATES only. All 20 fixtures now marked with `"template": true`. They define test structure and coverage areas but contain NO actual expected results. Verified oracle fixtures require controlled observations with actual hash values.

### Reference Build Structure

- **TD-CLASSIC-001**: BLOCKED-awaiting-owner-provision - No actual reference build provided
- **RA1-CLASSIC-001**: BLOCKED-awaiting-owner-provision - No actual reference build provided
- **D2K-CLASSIC-001**: BLOCKED-awaiting-owner-provision - No actual reference build provided; note: this is Dune 2000 NOT Dune II
- **RA2-CLASSIC-001**: BLOCKED-awaiting-owner-provision - No actual reference build provided; optional separately gated extension

### Deviations Ledgers

Created CSV deviation matrices in `references/deviations/`:
- `td-classic.csv`: 3 deviations (source compatibility, engine choice, port behavior)
- `ra1-classic.csv`: 4 deviations (source compatibility, engine choice, port behavior, expansion separation)
- `d2k-classic.csv`: 3 deviations (source availability, game identity, engine approach)
- `ra2-classic.csv`: 3 deviations (source availability, integration path, gate status)

### Fixture Schema and Templates

Created `references/fixture-schema.json` defining complete fixture structure with:
- Initial state (map hash, credits, factions, seed)
- Settings (game speed, unit cap, tech level, fog/shroud)
- Input trace with timing semantics
- Expected observations (checkpoints, event trace)
- Source evidence (capture method, reference version)
- Oracle capture method
- Expected invariants
- Tolerance policy
- Linked catalog IDs

Created `references/control-binding-template.json` for capturing default controls and settings.

### Scenario Templates (Not Verified Fixtures)

Created 10 TD scenario templates in `references/fixtures/td-baseline.json` (marked `"template": true`):
- Economy: basic harvester cycle, two harvesters competing, power plant construction
- Movement: basic movement, pathfinding around obstacle
- Production: unit production, building construction with power dependency
- Combat: infantry attack, tank vs infantry weapon interaction
- Victory: destroy all enemy structures

Created 10 RA1 scenario templates in `references/fixtures/ra1-baseline.json` (marked `"template": true`):
- Economy: ore truck cycle, gem field harvesting, spy cash capture
- Movement: basic movement, naval movement, aircraft movement and rearm
- Production: unit production
- Combat: infantry attack, submarine detection and attack
- Victory: destroy all enemy structures

**Important:** These templates define test structure but contain NO actual expected results. All expected credits, HP, positions, timings, etc. are placeholders marked BLOCKED.

### Blockers

- No actual reference builds provided
- No actual hash values available
- No verified oracle fixtures created
- No actual game data for testing
- Example unit caps, timings, commands, expected states are not established facts

### Acceptance Status

- Schema and structure: COMPLETE
- Scenario templates: COMPLETE (not verified fixtures)
- Actual hash values: BLOCKED awaiting owner-provided reference builds
- Verified oracle fixtures: NOT CREATED
- Fingerprinting tool: NOT YET IMPLEMENTED (next step)

### Next Steps

Build local fingerprinting tool to compute SHA-256 hashes of provided reference files. This tool will:
- Accept file paths as input
- Compute SHA-256 hashes
- Validate against reference-builds.lock.json structure
- Generate reference-file checklist

Do not proceed to C03 until C02 actual acceptance criteria are met.
