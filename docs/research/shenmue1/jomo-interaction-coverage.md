# JOMO Interaction Coverage

The machine-readable coverage report is:

```text
tools/evidence/jomo-interaction-coverage.json
```

Regenerate it with:

```text
node tools/worlds/build_jomo_interaction_coverage.js
```

It joins the 160 live JOMO TASK tags, the static operation/group trace, the
runtime placement manifest, and the browser behavior registry. A static group
is treated as proof that the game has a common interaction path, but not as
proof of a particular animation.

## Current implemented families

The browser currently implements all 147 active, rendered TASK-tagged
interactions:

- all runtime and statically recovered room doors;
- the two refrigerator leaves;
- root-plus-handle drawer models in static groups 0 and 1;
- captured hinged-leaf models and the remaining edge-pivot cabinet leaves;
- the paired `GGB1`/`GGB2` cabinet panels, which slide into the partner
  panel's occupied span instead of rotating;
- the captured alarm clock;
- static inspection targets in groups 5 through 14.
- one-off inspection records from JOMO's dedicated
  `0x9a800..0x9b6ff` interaction table.
- safe inspection fallbacks for the remaining live tagged props whose exact
  story-state side effects are not yet decoded. These remain inspect-only;
  the shared callback address is not treated as evidence of mechanical
  motion.

Group 1 is no longer treated as one undifferentiated hinged family. The
standalone extractor in `tools/worlds/extract_jomo_shared_object_dispatch.py`
decodes its callback tokens, per-object action IDs, interaction offsets,
flags, and node/variant selectors without running the emulator. In
particular, it proves that `GGB1` and `GGB2` are the two sides of action
`0x1c`, with opposite offsets and routes `0x0d`/`0x08`.

That table evidence does not by itself say “rotate” or “translate.” The
browser's former group-wide hinge rule was therefore too strong. The GGB
panels now use their paired runtime placements to derive a geometric sliding
endpoint: each selected panel moves to the other panel's occupied center.
Other group-1 models retain their existing behavior until their individual
action-ID dataflow is decoded or independently captured.

For retained hinged models, hinge direction is selected from the node key,
not array order:

```text
0x08  left-side leaf
0x0d  right-side leaf
```

This matters for separately modeled pairs, where filtering for the one
present node would otherwise make both leaves rotate in the same direction.

## Static inspection targets

The 22 tags in groups 5 through 14 have static geometry and no movable
drawer/door node topology. They are registered as inspection targets rather
than being assigned a false mechanical animation. Clicking one gives local
interaction feedback and plays the existing thinking animation sequence.

The coverage invariant is now:

```text
placed tags with proven interaction evidence but no browser interaction: 0
```

The companion production-loader model audit now also applies each mechanical
behavior's open endpoint and measures world-space vertex displacement. This
distinguishes “the model and route exist” from “the registered operation
actually moves visible geometry.” In particular:

```text
DR15_016 main entrance panel       0.750000 world units
DR01_016 interior/bathroom door    1.157239 maximum vertex travel
REIO101G upper refrigerator leaf   1.051987 maximum vertex travel
REIO102G lower refrigerator leaf   1.055270 maximum vertex travel
```

All 105 distinct JOMO interaction models have their required route, renderable
geometry, and nonzero endpoint motion where motion is expected.

Two records (`STAN` and `ecal`) belong to non-rendered controller TASKs and
are reported separately rather than counted as missing clickable objects.

This does not claim that the original Japanese examination text or every
story-state side effect has been recovered. Those require additional script
text/state decoding and remain separate from placement and object animation.
