## C02 Evidence

Created reference build lock file at `references/reference-builds.lock.json` with structure for TD, RA1, D2K, and RA2. All hash values are BLOCKED placeholders awaiting owner-provided verified reference builds.

### Reference Build Structure

- **TD-CLASSIC-001**: GOG Classic Release (td-gog-1995) - executables, MIX archives, RULES.INI, environment setup BLOCKED
- **RA1-CLASSIC-001**: GOG Classic Release (ra1-gog-1996) base game, plus Counterstrike and Aftermath expansion profiles - all BLOCKED
- **D2K-CLASSIC-001**: GOG Classic Release (d2k-gog-1998) - BLOCKED; note: this is Dune 2000 NOT Dune II
- **RA2-CLASSIC-001**: GOG Classic Release (ra2-gog-2000) base and Yuri's Revenge - BLOCKED; optional separately gated extension

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

### Baseline Fixtures

Created 10 TD baseline fixtures in `references/fixtures/td-baseline.json`:
- Economy: basic harvester cycle, two harvesters competing, power plant construction
- Movement: basic movement, pathfinding around obstacle
- Production: unit production, building construction with power dependency
- Combat: infantry attack, tank vs infantry weapon interaction
- Victory: destroy all enemy structures

Created 10 RA1 baseline fixtures in `references/fixtures/ra1-baseline.json`:
- Economy: ore truck cycle, gem field harvesting, spy cash capture
- Movement: basic movement, naval movement, aircraft movement and rearm
- Production: unit production
- Combat: infantry attack, submarine detection and attack
- Victory: destroy all enemy structures

### Blockers

All fixture expected results (observations, hashes, timings) are BLOCKED placeholders. Actual values must be computed from controlled observations of approved reference builds. Missing binaries/permissions/internal visibility are explicit blockers with exact needed input.

### Acceptance Status

- Schema and structure: APPROVED
- Actual hash values: BLOCKED awaiting owner-provided reference builds
- Fixture expected results: BLOCKED awaiting controlled observations
- This establishes evidence structure, not proof of full-game parity

### Next Issue

Ready to proceed to C03 (THU-1334) to bootstrap reproducible monorepo, engine toolchain and CI. Reference build actual values can be populated when owner provides verified binaries.
