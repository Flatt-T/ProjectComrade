## C01 Evidence

Created initial rights ledger at `rights/ledger.jsonl` with 16 entries covering:

- Source code: EA C&C/RA (GPLv3+), Vanilla Conquer, OpenRA (blocked), Chrono Divide (blocked), OpenDUNE (blocked), Emscripten
- Game assets: TD/RA1/D2K/RA2 classic assets (blocked public distribution, local-import-only)
- Brand marks: C&C, RA, Dune (fair-use reference only)
- Test assets: Clean scaffolding (MIT, approved)

Created ADR 005 at `docs/adr/005-assets-and-distribution.md` documenting classification matrix, distribution modes, and notice obligations.

### Decision Summary

- **Public classic asset distribution:** BLOCKED until explicit rights holder approval
- **Local import mode:** APPROVED as default mode; requires hash verification, user consent, no server upload
- **Clean test scaffolding:** APPROVED for development/CI; must be marked as placeholder, never passes visual parity
- **Vanilla Conquer source:** REVIEWED as preservation candidate; browser/headless compatibility UNPROVEN (requires C04 spike)
- **OpenRA:** BLOCKED due to documented gameplay changes
- **Chrono Divide:** BLOCKED until licence inquiry completed

### Blockers

Public distribution of classic game assets remains blocked. This does not block development with local-import mode or clean test scaffolding. The ledger provides explicit decision summary distinguishing zero-preparation hosted assets from first-use local import.

### Next Issue

Ready to proceed to C02 (THU-1333) to pin reference builds and parity fixtures.
