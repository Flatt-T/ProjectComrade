## C01 Evidence (Corrected 2026-10-18)

Created rights ledger at `rights/ledger.jsonl` with 16 entries covering source code, game assets, brand marks, and test assets. Created ADR 005 at `docs/adr/005-assets-and-distribution.md` documenting classification matrix and distribution modes.

### Corrections from Original Submission

**Original claim:** "Local import mode: APPROVED"  
**Corrected status:** "conditional-unverified" - Local import mode is proposed but not yet validated. Requires actual rights holder approval and implementation of hash verification.

**Original claim:** "Vanilla Conquer source: REVIEWED as preservation candidate"  
**Corrected status:** "reviewed-candidate-unproven-browser-with-evidence" - Added exact licence snapshots, hashes, pinned commit (ce83b59), and evidence review.

**Original claim:** Source code entries marked "reviewed-known-terms"  
**Corrected status:** "reviewed-known-terms-with-evidence" - Added licence snapshots, hashes, version dates, and review evidence for EA TD, EA RA, and Vanilla Conquer.

### Licence Evidence Captured

- EA TD source: GPLv3 + Section 7 additional terms (no trademark rights, indemnification), hash A6F116DD47F739DA4E0211142C0EDBBADAB8B819EDCD7686CEC3DBBA50A56524
- EA RA source: GPLv3 + Section 7 additional terms (identical to TD), hash 2938103A75A886806DE48C593191E63E4510C65D4DFD5E3A2A9670DF09C65E98
- Vanilla Conquer: GPLv3 + Section 7 additional terms + EA DLL-release-only term, hash 69162534E6D1BD22F953883D24D7763B73DB81F726B03993B655DB39CE28086C
- All snapshots stored in `rights/snapshots/`

### Validation Tool

Created `tools/fingerprint/validate-rights.ts` to validate that no unapproved public assets are included in the build. The tool:
- Loads and parses the rights ledger
- Validates ledger entries for game assets are correctly marked as blocked or conditional
- Checks file patterns against asset classification
- Fails if unapproved public assets are detected

### Current Decision Summary

- **Public classic asset distribution:** BLOCKED/CONDITIONAL-UNVERIFIED - Requires explicit rights holder approval
- **Local import mode:** CONDITIONAL-UNVERIFIED - Proposed but not yet validated; requires hash verification implementation
- **Clean test scaffolding:** APPROVED for development/CI with validation
- **Vanilla Conquer source:** REVIEWED-CANDIDATE-UNPROVEN-BROWSER - With evidence: pinned commit ce83b59, licence snapshot, hash
- **OpenRA:** BLOCKED due to documented gameplay changes
- **Chrono Divide:** BLOCKED until licence inquiry completed

### Notice Obligations

The project's MIT licence does NOT relicense upstream code or game assets. Upstream GPL licences must be retained:
- EA TD/RA: GPLv3 + Section 7 terms (no trademark rights, indemnification, mark modified versions)
- Vanilla Conquer: GPLv3 + Section 7 terms + EA DLL-release-only term
- Emscripten: MIT-style (terms to be verified)

### Blockers

Public distribution of classic assets remains blocked/unverified. Local import validation not yet implemented. Asset-free engineering subtasks can proceed independently.

### Acceptance Status

- Ledger structure: COMPLETE
- Licence snapshots and hashes: COMPLETE for source code
- Asset validation tool: COMPLETE
- Local import implementation: NOT IMPLEMENTED
- Public distribution approval: NOT OBTAINED

### Next Issue

Proceed to C02 (THU-1333) to correct scenario templates and build fingerprinting tool.
