# Research one observation · YTNK

[THU-2568](https://linear.app/thunderchild-creative/issue/THU-2568) · Red Alert 2 Yuri's Revenge historian / rules and content census coordinator · Source profile yr

**Bounded question.** What does the cited source establish about this occurrence of YTNK, and which independent observation demonstrates whether and how the player encounters it? Work on this record. Return shared engine or pipeline questions to their owner.

**Evidence address.** Open early/yr-facts.zip, member yr-definition-facts.jsonl, locator 126. Its lookup key is 509ccf6e9758142765f498. Companion evidence in this deposit includes early/yr-facts.zip, early/isometric-summary.json, early/01-faction-and-animation-briefs.md, early/ra2-patch-provenance.md, early/ra2-patch-findings.json, catalogue/edition.py, catalogue/gatling-edition-comparison.md, review/edition-comparison-readback.json, early/yr-disc-verification.md, early/yr-disc-verification.json, early/yr-disc-profiles.zip. The reported source side is YuriCountry.

**Procedure.** Compare registration, active rules, art override, country, prerequisite and tech level. Run a legal action, then repeat after removing the prerequisite or changing country. Use the original disc or patch evidence where it exists. For a selectable actor or structure, capture the applicable idle, travel, turn/aim or production, damage and destruction/replacement transitions. For a helper, terrain object or nonplayable form, identify its producer or script, visible states and lifetime. Record why an inapplicable state has that disposition.

**Deliver one result.** Supply edition, build, map/mode, row identity, acquisition path, expected and observed behavior, native units or ticks, positive and negative cases and reproducible inputs. Preserve conflicting values individually. Link any authored Fusion choice to its own profile. For a production candidate, name the original silhouette and identifying cue, required transitions, interruption behavior and a normal-camera visibility test.

**Review.** Return the result and unknowns to the existing work order. A different reviewer repeats the positive and negative cases. Record only the scope each check establishes. The accepted catalogue identity, capability, and asset-provenance decisions govern later production.

## Exact source record

~~~json
{
  "id": "YTNK",
  "kind": "vehicle",
  "registry_evidence": [
    [
      "63",
      "https://github.com/hamdirizal/red-alert-2-rules/blob/b66200ab0130a24bae8d8359caa6ab03bd78e8f7/rulesmd-original.ini#L1132"
    ]
  ],
  "definition_src": "https://github.com/hamdirizal/red-alert-2-rules/blob/b66200ab0130a24bae8d8359caa6ab03bd78e8f7/rulesmd-original.ini#L8481",
  "properties": {
    "UIName": "Name:GattTank",
    "Name": "Gattling Tank",
    "Prerequisite": "YAWEAP",
    "Primary": "AGGattling",
    "Secondary": "AAGattling",
    "Strength": "210",
    "Category": "AFV",
    "Armor": "light",
    "Turret": "yes",
    "IsTilter": "yes",
    "TurretCount": "1",
    "WeaponCount": "6",
    "TechLevel": "4",
    "Sight": "10",
    "Speed": "6",
    "Crusher": "no",
    "Owner": "YuriCountry",
    "Cost": "600",
    "ROT": "10",
    "IsSelectableCombatant": "yes",
    "Explosion": "TWLT070,S_BANG48,S_BRNL58,S_CLSN58,S_TUMU60",
    "Maxdebris": "3",
    "Locomotor": "{4A582741-9839-11d1-B709-00A024DDAFD1}",
    "MovementZone": "Destroyer",
    "VeteranAbilities": "STRONGER,FIREPOWER,SIGHT,FASTER",
    "EliteAbilities": "SELF_HEAL,STRONGER,FIREPOWER,ROF",
    "Size": "3",
    "ElitePrimary": "AGGattlingE",
    "EliteSecondary": "AAGattlingE"
  },
  "weapon_slots": {
    "primary": "AGGattling",
    "secondary": "AAGattling",
    "weapon1": "AGGattling",
    "eliteweapon1": "AGGattlingE",
    "weapon2": "AAGattling",
    "eliteweapon2": "AAGattlingE",
    "weapon3": "AGGattling2",
    "eliteweapon3": "AGGattling2E",
    "weapon4": "AAGattling2",
    "eliteweapon4": "AAGattling2E",
    "weapon5": "AGGattling3",
    "eliteweapon5": "AGGattling3E",
    "weapon6": "AAGattling3",
    "eliteweapon6": "AAGattling3E",
    "eliteprimary": "AGGattlingE",
    "elitesecondary": "AAGattlingE"
  },
  "art_key": "YTNK",
  "art_src": "https://github.com/CnCNet/cncnet-yr-client-package/blob/0e5bb2076fa600e13094daebdfbaf85f6b057b8a/game-assets/cncnet.pack/artmd.ini#L1049",
  "visual_properties": {
    "Voxel": "yes",
    "Remapable": "yes",
    "Cameo": "YTNKICON",
    "AltCameo": "YTNKUICO",
    "PrimaryFireFLH": "160,30,150",
    "SecondaryFireFLH": "160,30,150"
  },
  "art_source_tier": "community compatibility comparison"
}
~~~

## Original-edition differences for this ID or its direct bindings

These are measured differences. Use the value for the edition being researched and keep its source identifier.

~~~json
[
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattling",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattling2",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattling2E",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattling3",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattling3E",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "English Yuri 1.001",
    "layer": "rules",
    "section": "AGGattlingE",
    "source": "early/ra2-patch-findings.json",
    "differences": {
      "only_patch_key_values": [
        [
          "Range",
          "6"
        ]
      ],
      "only_comparator_key_values": [
        [
          "Range",
          "5"
        ]
      ],
      "order_differs_only": false
    }
  },
  {
    "edition": "original YR disc",
    "layer": "registered rules and presentation",
    "source": "early/yr-disc-profiles.zip",
    "retail_binding": {
      "id": "YTNK",
      "kind": "vehicle",
      "registry": "VehicleTypes",
      "registry_line": 1132,
      "rules_section": "YTNK",
      "rules_disc_line": 8481,
      "source_rules": {
        "name": "Gattling Tank",
        "uiname": "Name:GattTank",
        "primary": "AGGattling",
        "secondary": "AAGattling",
        "eliteprimary": "AGGattlingE",
        "elitesecondary": "AAGattlingE",
        "owner": "YuriCountry",
        "prerequisite": "YAWEAP",
        "techlevel": "4",
        "cost": "600",
        "strength": "210",
        "speed": "6",
        "weaponcount": "6"
      },
      "patch_rules_section": "YTNK",
      "patch_rules_line": 8484,
      "selected_rule_changes_in_1001": {},
      "art_lookup": "YTNK",
      "retail_art_section": "YTNK",
      "retail_art_section_line": 862,
      "presentation": {
        "voxel": "yes",
        "cameo": "YTNKICON",
        "altcameo": "YTNKUICO",
        "primaryfireflh": "160,30,150",
        "secondaryfireflh": "160,30,150",
        "eliteprimaryfireflh": "160,30,150",
        "elitesecondaryfireflh": "160,30,150",
        "remapable": "yes"
      },
      "retail_sequence": null,
      "retail_sequence_line": null,
      "community_section_has_identical_fields": true
    }
  }
]
~~~
