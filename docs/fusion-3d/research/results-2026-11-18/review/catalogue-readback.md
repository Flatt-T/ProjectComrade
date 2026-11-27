# Independent catalogue, provenance and stage readback

The independent reviewer re-executed the importer, regression suite and both projections and separately inspected every original candidate against the native JSON. Review scope is the v1 research catalogue and synthetic work-order graph. A real release certificate requires its own edition evidence, asset permissions, engine fixtures, integration results and real device measurements.

| Check | Evidence and result |
|---|---|
| Full-fidelity intake | Parsed both original source documents and compared every key/value in each native record, every ordinal, source status, canonical record SHA-256, input file SHA-256 and top-level source metadata with the decompressed intake. **3,040/3,040 matched**, all distinct canonical hashes, all still unverified. This is 262 definition_observed plus 2,778 path_observed_contents_not_read. The scope is those older inventories, separate from this wave’s direct XML, map and object evidence. |
| Exact reproducibility | A fresh importer run to an empty temporary destination reproduced candidate-intake.jsonl.gz and candidate-intake-report.json byte-for-byte. Compressed SHA-256 ff42c3d01ec7314da2bf1215f120bf0ce91063a16c34dc8bf99c9459f1acbb3c. Uncompressed SHA-256 48a86f3b4a7b6e5fca0950c4943fff9b05ded956867110074f2666f0b06b3a26. [Intake report](../foundation/catalogue/candidate-intake-report.json) |
| Schemas and basic regressions | Counted 15 schema files, including 11 record kinds. Re-ran the original 18 unit tests. All passed. Independently mutated an unknown datum to zero and confirmed schema rejection. The regression suite also accepts an evidence-backed source zero and rejects an unknown without a resolution task. |
| Form integrity | The two RA3 JapanAntiInfantryVehicle forms maintain a single source object but separate identities, reciprocal links and explicit carry state. Independently redirected the air form to TD E1. Validation rejected it for both incompatible profile and missing reciprocal relationship. State inheritance in the game still requires transform-time integration, damage/ownership/cargo carry-over and a mode-specific acceptance fixture. |
| Eight-stage projection | Both newly executed manifests compared byte-for-byte to the checked-in result. Historical sample withheld all three candidate entities, yielding zero production tasks. Synthetic sample produced exactly SPEC, SIM, MODEL, RIG, ANIM, FX_AUDIO_UI, INTEGRATE and REVIEW, all explicitly nonpublishable. A separate topological traversal reached all eight leaves and terminated. Zero real release rows, approved assets, mobile performance results or completed production entities follow from either projection. [Real manifest](../foundation/catalogue/implementation_task_manifest.json) · [Synthetic projection](../foundation/catalogue/synthetic-projection.json) |
| Source-vs-art evidence | The source-profile/observation record and immutable model bytes have different purposes. A source clip-name, filename or recorded screenshot does not supply redistribution permission. An approved model cannot prove its authoritative damage, transform, path or timing rules. The implementation-stage projection is per entity; terrain families still need distinct landscape/bridge/movement work orders under the terrain contract. |

## Semantic mutation results before corrective changes

Two constructed in-memory records exposed genuine gaps in the original checker. These were independent negative tests and did not change the stored historical examples or trigger any external action.

1. Changing a source record with asset_class=research_reference into distribution=original_approved, assigning a syntactically valid hash and using its original owner as reviewer allowed structural validation and cleared the visible entity’s presentation-rights blocker. This contradicts the stated rule that a research reference cannot qualify a shipping asset. The evidence URL and hash format alone cannot establish the creator’s actual permission. Separate reference-only status, appropriate production asset class, distinct reviewer, immutable artifact and external rights verification at issuance.
2. Setting a capability to accepted, assigning identical implementation/review tasks, leaving reviewer null and leaving fixture IDs empty also passed structural validation and cleared the capability blocker. Require actual review evidence and distinct responsibility before marking a 3D surface, animation event or bridge/path capability accepted. The unchecked baseline reports were all research-only, so these tests found prospective release hazards rather than evidence of an accidentally released row.

## Corrective verification

The catalogue owner corrected both conditions before this independent review closed. I reran the updated suite: **23/23 regressions passed**. Each of the three supplied example catalogues validated, the real projection remained byte-equivalent with zero leaves, and the positive synthetic projection retained exactly the same eight nonpublishable leaves.

I constructed a separate positive synthetic model and capability, including metric source fields, cleared blockers, genuinely distinct task strings, independently named reviewer, hash and an addressable fixture. Both records passed validation and cleared their two specific release blockers. From that same passing control I made eight isolated negative changes, one at a time. Each was rejected by the validator and restored the appropriate release blocker:

| Change | Output |
|---|---|
| Mark only the approved model’s asset class as research_reference | Open presentation rights |
| Make the owner its rights reviewer | Open presentation rights |
| Make its declared creator its rights reviewer | Open presentation rights |
| Give the accepted capability the same implementation and review task | Unsupported capability |
| Delete its fixture IDs | Unsupported capability |
| Remove its reviewer | Unsupported capability |
| Make its owner its reviewer | Unsupported capability |
| Replace its fixture URI with unaddressable prose | Unsupported capability |

**Disposition.** Pass for the exercised research preflight and dry-run graph. Valid-looking fixture and artifact addresses still need real content, permission and device checks at issuance. Distinct strings for two reviewers or task IDs do not attest their identity or the authenticity of their reviews. Zero historical completions remain in these illustrative projections.

The coordinator received the negative cases before publication and the results after correction. [Schema contract](../foundation/catalogue/schema_contract.md) · [Validation program](../foundation/catalogue/tools/validate_catalogue.py) · [Regression suite](../foundation/catalogue/tools/test_catalogue.py)
