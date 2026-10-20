# ADR 005: Assets and Distribution Rights

**Status:** Historical. The pinned TD freeware slice is superseded by [ADR 006](006-playable-td-slice.md); other assets remain gated.
**Date:** 2026-10-18
**Context:** COMRADE C01 - Establish code, asset and brand rights ledger

## Context

Project COMRADE requires faithful preservation of classic RTS games (Command & Conquer, Red Alert 1, Dune 2000, optionally Red Alert 2) in a browser-native environment. This creates complex rights questions across:

1. **Source code:** EA-released original C&C/RA source (GPLv3+), Vanilla Conquer preservation fork, other engine projects
2. **Game assets:** Original artwork, sound, music, maps, fonts from retail game media
3. **Brand marks:** Trademarks for Command & Conquer, Red Alert, Dune
4. **Test data:** Clean scaffolding for development vs. classic content for release

Unknown rights must default to blocked. A packaging test that includes an unknown asset must fail. Public distribution requires explicit approval; local import is an explicit first-use setup, not secretly "name only."

## Decision

### Classification Matrix

| Category | Distribution Class | Public Distribution | Local Import | Notes |
|----------|-------------------|---------------------|--------------|-------|
| EA C&C/RA source (GPLv3+) | source-available | Yes with compliance | N/A | Source-corresponding, retain notices |
| Vanilla Conquer source | source-available | Yes with compliance | N/A | Retain vanilla licence, credit TheAssemblyArmada |
| OpenRA engine | not-for-this-project | No | N/A | Blocked due to gameplay changes |
| Chrono Divide | not-for-this-project | No | N/A | Blocked until licence inquiry completed |
| OpenDUNE | not-for-this-project | No | N/A | Blocked - wrong game (Dune II, not Dune 2000) |
| Classic game assets (TD/RA1/D2K/RA2) | not-publicly-distributed | **Blocked until approval** | Reviewed local-import only | User-provided via local import feature |
| Brand marks | not-claimed | No | N/A | Fair-use reference descriptive only |
| Clean test scaffolding | generated-project-assets | Yes with MIT licence | N/A | Placeholder only, never release parity |

### Asset Distribution Modes

1. **Public hosted assets:** Requires affirmative redistribution clearance from rights holder. All classic game assets are currently **blocked** in this mode until explicit approval is obtained.

2. **Reviewed local import:** User provides their own original game media; browser processes it without uploading to server. This is the default mode for classic content pending public distribution approval. Requires:
   - Clear labelling in UI as "local import mode"
   - Explicit user consent flow
   - No transmission of asset bytes to external servers
   - Cryptographic hash verification of reference builds
   - Privacy notice that assets never leave the browser

3. **Clean test scaffolding:** Project-generated synthetic assets for development and CI. These are MIT-licensed and can be publicly distributed. They must:
   - Be clearly marked as placeholder/synthetic
   - Never pass visual parity tests
   - Never be presented as classic game completion

### Source Code Distribution

- EA C&C/RA source: GPLv3+ with additional terms. Must retain all notices, provide source correspondence, comply with licence.
- Vanilla Conquer: Must retain the vanilla/License.txt, credit TheAssemblyArmada, pin specific commit.
- Emscripten: Build tool with its own licence (MIT-style), must comply with runtime licence compliance.

### Brand Usage

- Use trademarks only for descriptive, fair-use identification (e.g., "compatible with Command & Conquer")
- Do not claim official affiliation, endorsement, or partnership
- Do not use brand marks in a way that suggests the project is official

### Notice Obligations

All distributed code must include:
- Original licence notices
- Attributions to upstream projects (EA, TheAssemblyArmada, Emscripten, etc.)
- Project licence for generated code
- Source-corresponding offer where required by GPLv3

## Consequences

### Positive

- Clear, auditable rights ledger prevents accidental infringement
- Local import mode enables development while respecting rights
- Classification system makes blocking unapproved assets explicit
- Supports eventual public distribution approval when obtained

### Negative

- Public distribution of classic assets is blocked until rights holder approval
- Cannot rely on publicly accessible downloads as redistribution grants
- Additional engineering required for local import flow and hash verification
- Brand use is limited to descriptive fair use

### Risks

- Rights holder may not grant public distribution approval
- Local import mode may be less convenient for users than hosted assets
- Maintaining ledger as rights landscape changes requires ongoing attention

## Next Steps

1. Maintain rights/ledger.jsonl as source of truth; update when new rights information obtained
2. Implement local import hash verification before any classic asset loading
3. Seek explicit public distribution approval for classic assets from rights holder before any hosted distribution
4. Document UI flow for local import mode with clear notices
5. Create ADR updates if rights situation changes or new distribution modes are proposed

## Blocked Items (Unresolved Permissions)

The following items remain blocked until explicit approval or rights holder permission:

- Public distribution of any classic game assets (TD/RA1/D2K/RA2 artwork, sound, music, maps, fonts)
- Use of Chrono Divide engine or SDK without confirmed licence suitability
- Embedding OpenRA engine as primary engine (blocked due to gameplay changes)
- Use of OpenDUNE as Dune 2000 implementation (wrong game)

These blockers are intentional and must be resolved before respective features can proceed. Do not bypass by using accessible downloads without explicit permission.
