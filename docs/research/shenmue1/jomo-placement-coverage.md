# JOMO Placement Coverage

The machine-readable coverage report is:

```text
tools/evidence/jomo-placement-coverage.json
```

Record coverage is paired with a production-loader instance audit:

```text
tools/evidence/jomo-runtime-instance-audit.json
```

That second report loads all 155 placements, applies their browser transforms,
and verifies that each one produces finite, enabled, visible render geometry.
It prevents a catalog or manifest record from being counted as a visible
object when `Mt5Loader` returned no scene root.

Regenerate it with:

```text
node tools/worlds/build_jomo_placement_coverage.js
```

The report treats three sources separately:

1. active HMDL/TASK instances recovered from emulator RAM;
2. all 18 records in JOMO's static door placement table;
3. the nine `S1_JOMO_MAP*.MT5` static map models loaded by the browser.

Current invariants:

```text
active runtime instances missing from browser manifest: 0 / 146
static door records missing from browser manifest:      0 / 18
static JOMO map models selected by browser:              9 / 9
final independently placed objects:                       155
```

Some model resources are loaded by the original game without having a world
instance. They are retained in the report but are not automatically placed.
Examples include alternate cassette models and LGWS state variants. A loaded
resource is not placement evidence; an HMDL instance or explicit static
placement record is required.
