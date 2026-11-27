"""Print one bounded researcher packet for a known fact locator."""
import argparse
import gzip
import json
from find import INDEX, ROOT, details
from edition import original_differences

PROFILE_TASK={'td':4,'ra1':5,'ts':6,'fs':7,'ra2':8,'yr':9,'generals':10,'zh':11,
              'tw':12,'kw':13,'ra3':14,'uprising':15,'tt':16,'ren.demo':17,'ss':18,
              'ta':20,'rivals':21,'dune.manual':23,'dune.fusion':23}
GROUPS=[
    ({'td','ra1'},'Read constructor guards, ownership and scenario-local rules. Test one production or scripted path and the same actor where it is unavailable.'),
    ({'ts','fs','ra2','yr'},'Compare registration, active rules, art override, country, prerequisite and tech level. Run a legal action, then repeat after removing the prerequisite or changing country. Use the original disc or patch evidence where it exists.'),
    ({'generals','zh'},'Follow the starting builder to the command set, button and destination. Test the required general, science or upgrade present and absent. Preserve cinematic and reskin forms.'),
    ({'tw','kw','ra3','uprising','tt'},'Resolve the exact source path, parent and includes. Check producer, menu and target. Observe admission with and without the class, map, upgrade or form controlling this occurrence. Inspect the exception ledger when an include or declaration is missing.'),
    ({'ren.demo'},'Match side, terminal tab, slot and variant across binary settings and terminal screens. Record normal and outage prices separately. Try the purchase with the producing building alive and destroyed.'),
    ({'ss'},'Name the channel or practice mode, legal selection and pickup behavior. Test eligibility in a restricted channel and preserve the server revision.'),
    ({'rivals'},'Find the dated showcase or patch for faction, building, costs and ability. Prove deck legality with and without the unlock and observe the ability on the named patch.'),
    ({'ta'},'Prove faction, map context and layout position in the named world. Distinguish the viewer’s offense from the defending base. Repeat with an ineligible formation or cell.'),
    ({'dune.manual','dune.fusion'},'Compare the manual and current engine house and acquisition path. Test another house and remove the required upgrade. Record retail and original Fusion results separately.')
]
def packet(key):
    with gzip.open(INDEX,'rt') as f:
        rows=[r for r in map(json.loads,f) if r['key']==key]
    if len(rows)!=1: raise ValueError('Supply one existing 22-character lookup key')
    r=rows[0]
    task=f"RES-{PROFILE_TASK[r['profile']]:03}"
    tasks=json.loads((ROOT/'review/task-results.json').read_text())
    owner=next(t for t in tasks if t['task']==task)
    action=next(s for games,s in GROUPS if r['profile'] in games)
    files=', '.join(owner['evidence_files'])
    fact=details(r)
    changes=original_differences(r,fact)
    edition_notes=''
    if changes:
        edition_notes='\n## Original-edition differences for this ID or its direct bindings\n\nThese are measured differences. Use the value for the edition being researched and keep its source identifier.\n\n~~~json\n'+json.dumps(changes,indent=2,ensure_ascii=False)+'\n~~~\n'
    if r['profile']=='rivals':
        path='editions/rivals-extended-stats.json'
        supplement=json.loads((ROOT/path).read_text())
        matched=[u for u in supplement['units'] if u['faction']==r['source_side'] and u['unit']==r['id']]
        if matched:
            edition_notes+='\n## Additional Rivals comparison\n\nThis is a mixed-date community worksheet. The game build is unresolved. Keep its dated publisher cross-checks and variant rows distinct. Source: '+path+'\n\n~~~json\n'+json.dumps(matched[0],indent=2,ensure_ascii=False)+'\n~~~\n'
    return f"""# Research one observation · {r['id']}

[{owner['linear']}](https://linear.app/thunderchild-creative/issue/{owner['linear']}) · {owner['specialist']} · Source profile {r['profile']}

**Bounded question.** What does the cited source establish about this occurrence of {r['id']}, and which independent observation demonstrates whether and how the player encounters it? Work on this record. Return shared engine or pipeline questions to their owner.

**Evidence address.** Open {r['file']}, member {r['member'] or '(direct file)'}, locator {r['locator']}. Its lookup key is {key}. Companion evidence in this deposit includes {files}. The reported source side is {r['source_side'] or 'unrecorded'}.

**Procedure.** {action} For a selectable actor or structure, capture the applicable idle, travel, turn/aim or production, damage and destruction/replacement transitions. For a helper, terrain object or nonplayable form, identify its producer or script, visible states and lifetime. Record why an inapplicable state has that disposition.

**Deliver one result.** Supply edition, build, map/mode, row identity, acquisition path, expected and observed behavior, native units or ticks, positive and negative cases and reproducible inputs. Preserve conflicting values individually. Link any authored Fusion choice to its own profile. For a production candidate, name the original silhouette and identifying cue, required transitions, interruption behavior and a normal-camera visibility test.

**Review.** Return the result and unknowns to the existing work order. A different reviewer repeats the positive and negative cases. Record only the scope each check establishes. The accepted catalogue identity, capability, and asset-provenance decisions govern later production.

## Exact source record

~~~json
{json.dumps(fact,indent=2,ensure_ascii=False)}
~~~
{edition_notes}"""
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('key')
    args=p.parse_args()
    try: print(packet(args.key),end='')
    except ValueError as err: p.error(str(err))
