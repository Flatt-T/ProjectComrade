# Research one observation · JEEP

[THU-2549](https://linear.app/thunderchild-creative/issue/THU-2549) · Red Alert Counterstrike and The Aftermath historian / rules and content census coordinator · Source profile ra1

**Bounded question.** What does the cited source establish about this occurrence of JEEP, and which independent observation demonstrates whether and how the player encounters it? Work on this record. Return shared engine or pipeline questions to their owner.

**Evidence address.** Open early/ra1-facts.zip, member ra1-definition-facts.jsonl, locator 131. Its lookup key is dd2eb20c89f502cf0ba434. Companion evidence in this deposit includes review/ra95-demo-runtime.md, editions/ra95-demo-facts.json, early/ra1-facts.zip, early/ra1-portable-summary.json, experience/ra-mission-script-dossier.md, experience/ra-mission-graph.json.gz. The reported source side is unrecorded.

**Procedure.** Read constructor guards, ownership and scenario-local rules. Test one production or scripted path and the same actor where it is unavailable. For a selectable actor or structure, capture the applicable idle, travel, turn/aim or production, damage and destruction/replacement transitions. For a helper, terrain object or nonplayable form, identify its producer or script, visible states and lifetime. Record why an inapplicable state has that disposition.

**Deliver one result.** Supply edition, build, map/mode, row identity, acquisition path, expected and observed behavior, native units or ticks, positive and negative cases and reproducible inputs. Preserve conflicting values individually. Link any authored Fusion choice to its own profile. For a production candidate, name the original silhouette and identifying cue, required transitions, interruption behavior and a normal-camera visibility test.

**Review.** Return the result and unknowns to the existing work order. A different reviewer repeats the positive and negative cases. Record only the scope each check establishes. The accepted catalogue identity, capability, and asset-provenance decisions govern later production.

## Exact source record

~~~json
{
  "profile": "ra1",
  "class": "unit",
  "id": "JEEP",
  "enum": "UNIT_JEEP",
  "symbol": "UnitJeep",
  "src": "https://github.com/electronicarts/CnC_Red_Alert/blob/0dc09bb1d6188d1ec79ab4765b22a48b75ffee32/CODE/UDATA.CPP#L376-L404",
  "definition_guard": [],
  "inputs": {
    "name": "TXT_JEEP",
    "exp": "ANIM_FRAG1",
    "remap": "REMAP_NORMAL",
    "verticaloffset": "0x0030",
    "primaryoffset": "0x0030",
    "primarylateral": "0x0000",
    "secondaryoffset": "0x0030",
    "secondarylateral": "0x0000",
    "is_goodie": true,
    "is_nominal": false,
    "is_crusher": false,
    "is_harvest": false,
    "is_stealthy": false,
    "is_insignificant": false,
    "is_turret_equipped": true,
    "is_radar_equipped": false,
    "is_fire_anim": false,
    "is_lock_turret": false,
    "is_gigundo": false,
    "is_animating": false,
    "is_jammer": false,
    "is_gapper": false,
    "rotation": 32,
    "toffset": 0,
    "order": "MISSION_HUNT"
  },
  "heap_registration": {
    "line": 939,
    "guard": []
  }
}
~~~
