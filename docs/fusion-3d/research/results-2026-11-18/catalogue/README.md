# Find an object, building or variant across editions

[The offline index](source-lookup.jsonl.gz) contains **23,723 source records**. All records point into files included in this research deposit. Use it to hand one specialist the right edition, source identity and complete factual row. Its lookup key identifies a single observation in this export. The canonical production identity and release gate are defined in the [catalogue contract](../foundation/catalogue/schema_contract.md).

Run from the evidence directory. Python 3 and its standard library are sufficient.

```sh
python catalogue/find.py E1 --profile ts --limit 5
python catalogue/find.py AnnihilatorTripod --profile tw --detail --limit 1
python catalogue/find.py GDIDropship --profile tw
python catalogue/find.py Mammoth --profile ren.demo --detail
python catalogue/find.py Thumper --profile dune.manual --detail
```

The response reports total and returned matches. A source ID can occur on a shared archetype, a mission map, a dead husk, a faction substitute or a character menu. Inspect the exact match, then use `--key KEY --detail` to reopen the fully cited record. The default limit is twelve. The `--side` filter uses the source spelling or owner expression where available. Missing side evidence is preserved as null. For RA1, consult the rules and mission-layer evidence as the recovered constructors alone do not assign ownership for every unit. Search terms match source identifiers and labels retained on those objects. The specialized [producer menu index](../later/producer-menus.tsv) and primary [seed crosswalk](../foundation/seed-entities.json) carry producer and source-versus-Fusion naming differences.

| Source records | Count | Address in the delivered evidence |
|---|---:|---|
| Eight early games and expansions | 5,135 | Archive, JSONL member and one-based physical line. Includes registry-without-definition entries and reskins under their original profiles. |
| Five later games, strict extraction | 18,099 | Publisher-tree object occurrence with source path and line retained in the fact. A repeated ID in another file has its own lookup key. |
| Separately recovered later declarations | 13 | JSON path to a specific recovered projection, including ambiguous alternatives. The edition's baseline population stays measurable. |
| Rivals and Tiberium Alliances | 96 and 194 | Tabular row in the faction ledger or pinned adapter, with faction and group context. A commander power, base layout symbol and combat unit have different meanings. |
| Renegade 1.019 demo | 73 | Exact configured slot or variant with side, menu, preset and localized label when available. The source row permits comparison of a pictured and a configured price. |
| Sole Survivor | 23 | Exact manual quick reference entry. Channel restrictions require the companion primary-source facts. |
| Dune 2000 manual and current Fusion pack | 40 and 50 | Manual name or current engine ID, with its own house, section, page, code line and disposition where known. |

Run `python catalogue/find.py --build` to reproduce the compressed index from the supplied inputs. Use a fresh copy and compare to the [deposit manifest](../manifest.json). The [programme-level gates](../foundation/catalogue/era_delivery_gates.json) still govern exhaustive before/after enumeration. Port- and live-service profiles known only through a release document remain in the [edition register](../editions/reference-profiles.json) until a per-object source exists. A plausible name or familiar texture cannot fill that gap.

## Give a smaller model exactly one record

Run `python catalogue/brief.py dd2eb20c89f502cf0ba434` for the RA1 Ranger constructor, or supply a key returned by the lookup. The [example work packet](ranger-research-packet.md) contains its exact source record, existing Linear task, edition-specific procedure, counterexample, review and return format. The [packet generator](brief.py) applies the appropriate procedure for all 19 profile groups. Its output is a research assignment. Accepted canonical entities enter the existing production workflow independently. [Independent lookup verification](../review/lookup-readback.json)
