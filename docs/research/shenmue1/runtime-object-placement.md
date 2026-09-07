# Runtime Object Placement from Dreamcast RAM

This document owns the RAM extraction method and placement evidence. See
[World loading and transitions](../../implementation/world-loading-and-transitions.md)
for how reviewed placement manifests enter the current `/play` load lifecycle.

This note documents the reliable object-placement extraction path developed
for the Hazuki Residence interior (`JOMO`). It avoids fully decompiling
Shenmue's scene scripts: the game has already evaluated those scripts and
materialized the resulting model instances and transforms in Dreamcast RAM.

The first complete JOMO result was recovered from:

```text
captures/pvr/20260723-191152-frame-4977/ram.bin
```

That file is a 16 MiB snapshot of Dreamcast main RAM taken while Ryo was
inside the Hazuki Residence.

## Important distinction: loaded, instantiated, and rendered

Shenmue does not load only the contents of Ryo's current room. The JOMO
snapshot contained 167 raw `HRCM` signatures, demonstrating that a broad
scene/zone working set was resident at once.

These concepts must remain separate:

1. **Loaded model:** an `HRCM` model has a relocated copy in RAM.
2. **Instantiated model:** an `HMDL` hierarchy exists for that model.
3. **Placed render model:** a `TASK` directly references that HMDL hierarchy
   and supplies a transform.
4. **Currently visible model:** the placed model survives game-state,
   room/portal, frustum, and renderer visibility decisions for the current
   frame.

A loaded model does not necessarily have a placed instance. Conversely,
conditional models may be absent from a particular snapshot and require a
capture from another game state.

## Runtime structures

Dreamcast RAM addresses use base `0x8c000000`. Tools normalize a pointer into
the 16 MiB `ram.bin` with:

```js
const offset = pointer & 0x00ffffff;
```

### Relocated HRCM model

An MT5 file begins with `HRCM`. Its node tree contains 64-byte nodes with mesh
pointers and local transforms. When loaded by Shenmue, pointer fields are
relocated to live RAM addresses while most of the remaining bytes still agree
with the source asset.

The extractor:

1. Finds source-header matches in RAM.
2. Measures byte agreement between each source model and candidate runtime
   copy.
3. Rejects candidates below 95% agreement.
4. During a catalog scan, assigns each runtime address to the source model
   with the highest agreement.

The global best-match step matters because sibling or state-variant assets can
be more than 95% identical.

### HMDL instance

An instantiated render hierarchy begins with:

```text
Offset  Type  Meaning
0x00    char[4]  "HMDL"
0x04    u32      HMDL allocation size
0x20    ...      First instantiated 64-byte model node
```

The instantiated nodes retain relocated mesh pointers from the runtime HRCM
copy. Searching RAM for those mesh pointers identifies candidate HMDL
instances for a source model.

### TASK transform and the definitive model link

The outer placement transform is stored in a `TASK` structure:

```text
Offset  Type   Meaning
0x28    f32    Position X
0x2c    f32    Position Y
0x30    f32    Position Z
0x34    u32    Rotation X; signed low 16 bits
0x38    u32    Rotation Y; signed low 16 bits
0x3c    u32    Rotation Z; signed low 16 bits
0x54    f32    Scale X
0x58    f32    Scale Y
0x5c    f32    Scale Z
0x60    ptr    Direct pointer to the rendered HMDL node
```

Rotation is measured in turns:

```js
const signed = low16 >= 0x8000 ? low16 - 0x10000 : low16;
const degrees = signed * 360 / 0x10000;
```

`TASK + 0x60` is the critical discovery. It points directly into the HMDL
hierarchy used by the renderer. Resolve that pointer to its owning HMDL and
then match the HMDL's mesh pointers to the runtime HRCM copy.

Do **not** infer model ownership from the HMDL adjacent to a TASK or from the
HMDL's nearby/linked TASK pointer. That HMDL may be an interaction or
collision proxy for a different visible model.

## The clock proof case

The first batch extractor paired the correct nightstand transform with
`FUTS302G`. Visual checking established that a clock belonged there.

The RAM pointers explained the mismatch exactly:

```text
Transform TASK:              0x8c8141e0
TASK + 0x60 render pointer:  0x8c814600
Owning HMDL:                 0x8c8145e0
Owning source model:         S1_JOMO_CLKS501G.MT5
```

The incorrectly adjacent/proxy HMDL was:

```text
Proxy HMDL:                  0x8c814140
Proxy source model:          S1_JOMO_FUTS302G.MT5
```

After following `TASK + 0x60`, the recovered browser placements became:

```text
CLKS501G: [-18.299999, 0.45, 6.1]
FUTS302G: [-18.995001, 0.551, 4.391]
```

This was not a special-case swap. Changing the ownership rule corrected the
entire JOMO catalog.

## The wardrobe proof case

The corrected direct links independently reproduce the wardrobe composition:

```text
Model       Count  Runtime positions
TANM4W3G    4      x=18.018999, y=1.51/1.22/0.93/0.64, z=2.44
TANM4W4G    2      x=18.299999, y=0.36/0.08, z=2.44
TANM402G    1      x=18.584999, y=0.64, z=2.42
```

These correspond to four small drawers, two wide drawers, and the wardrobe
doors. The browser no longer requires hand-authored wardrobe substitutions.

## Dreamcast-to-browser coordinate conversion

JOMO's map origin and units already agree with the browser scene, but the
browser's MT5 conversion reflects the X axis. Apply the same reflection to
instance transforms:

```js
browserPosition = [-runtimeX, runtimeY, runtimeZ];
browserRotationDegrees = [runtimeRotX, -runtimeRotY, -runtimeRotZ];
browserScale = runtimeScale;
```

The rotation array is not a Babylon Euler vector. It retains MT5's explicit
X-then-Y-then-Z composition order after the coordinate reflection. Convert it
to a source-order matrix or quaternion before assigning it to a Babylon node;
directly calling `node.rotation.set(...browserRotationDegrees)` is only
accidentally correct for zero- or single-axis rotations.

Equivalently, reflect the complete MT5 local matrix with
`F = Scale(-1, 1, 1)`:

```text
sourceLocal  = Scale × RotationX × RotationY × RotationZ × Translation
browserLocal = F × sourceLocal × F
```

Decomposing `browserLocal` supplies Babylon-compatible position, scale, and
quaternion values while preserving parent-child composition. The Y and Z
coordinates do not need a hand-tuned room offset.

Animations of a loaded node must also update its quaternion. Babylon ignores
Euler `rotation.x/y/z` writes while `rotationQuaternion` is non-null. The
browser retains each animated MT5 node's authored browser-space angle triple,
applies the captured animation delta to the relevant axis, and regenerates the
X-Y-Z source-order quaternion for that pose.

## Inactive and parked objects

Shenmue retains some task/model records but deliberately parks them outside
the active world. Examples in the JOMO snapshot included:

```text
z = -1000
z = -10000
y = -100.4315
position = [99999.992, 99999.992, 99999.992]
```

The JOMO manifest generator currently accepts positions satisfying:

```text
abs(x) < 100
-5 < y < 100
abs(z) < 100
```

This removed ten parked instances from this capture. These bounds are a JOMO
policy, not a universal rule for every Shenmue map; reconsider them when
processing a larger outdoor zone.

## JOMO extraction results

For the reference capture:

```text
JOMO catalog models:              213
Catalog names with runtime copy:  137
Globally resolved runtime copies: 145
Direct TASK/HMDL instances:       156
Filtered active placements:       146
Static-only door placements:        9
Final browser placements:          155
Distinct placed model names:      105
```

The final manifest is:

```text
play/data/jomo-runtime-placements.json
```

## Static door-table reconciliation

The runtime snapshot did not instantiate every door in JOMO. `MAPINFO.BIN`
contains a separate, exact table with seven door model names followed by 18
36-byte placement records:

```text
record type
model-table index
scale XYZ
position XYZ
16-bit-turn Y rotation
```

The manifest builder joins those records to runtime placements by model and
position, then emits every unmatched static record. This produces 18 traced
door placements: nine already present in the RAM-derived set and nine
recovered only from the static table.

Notable recovered records include:

```text
DR15_016  [-14.886, -0.219,  6.3261]  main entrance / dor0
DR01_016  [ -5.400,  0.000, -3.6149]  single hinged interior door
```

`dor0` is joined back to its live TASK by its exact static/runtime transform.
This fixes the earlier false `model: null` result without assigning a model
from filename similarity.

Each placement preserves:

- source model name;
- browser position, rotation, and scale;
- runtime HRCM address;
- runtime HMDL address;
- runtime TASK address.
- the four-character runtime object tag stored at `TASK + 0x168`;
- the TASK callback address stored at `TASK + 0x64`.

Those addresses make every placement traceable back to the captured RAM.

The v2 JOMO manifest contains a valid object tag for all 146 active
placements. This is the authoritative bridge between room-script identifiers
such as `TOKE`, `ATS1`, and `dor3` and their placed browser models. The shared
`0x0c2de638` callback is retained as evidence, but is not treated as proof
that a particular object animates.

Its top-level `objectTags` registry contains all 160 matching runtime TASK
records from the capture, including fourteen controller/proxy records that
do not have an active placed render model. Each entry states whether it maps
to an active placement and which browser behavior, if any, has been proven.

## Repeatable workflow

### 1. Capture RAM

Load the desired Shenmue map/state in the instrumented Flycast build and
request a PowerVR/RAM capture. The resulting capture directory must contain
`ram.bin`.

### 2. Scan the map catalog

For JOMO:

```bash
node tools/worlds/extract_runtime_placements.js \
  captures/pvr/20260723-191152-frame-4977 \
  --catalog-prefix S1_JOMO_ \
  --json \
  --out .disc-work/jomo-runtime-placements.json
```

The extractor fetches bare model names from the project's public asset bucket.
Use `--catalog` or `--asset-url` when processing another catalog/source.

### 3. Build the browser manifest

```bash
node tools/worlds/build_runtime_placement_manifest.js \
  .disc-work/jomo-runtime-placements.json \
  play/data/jomo-runtime-placements.json \
  --mapinfo .disc-work/exact/jomo/MAPINFO.BIN
```

### 4. Load the manifest

`play/PlayApplication.js` imports the JSON manifest. Placement loading groups entries by
model, fetches the MT5 and texture pack once per group, uses separate loaders
with bounded concurrency, then applies the captured transform to each root.

Static `MAP*.MT5` geometry remains loaded through the normal map path. Map
models can combine world-authored geometry with node-local pieces, so the
normal loader must still apply every node's authored transform and hierarchy.
JU00's individually transformed uphill guardrails are one concrete example;
the map vertices must not be assumed to already contain their final world
orientation.

### 5. Verify

Programmatic verification should establish:

- every TASK address is unique in the final manifest;
- all numeric transforms are finite;
- no parked sentinel coordinates survive;
- known composed objects have the expected model counts;
- tests and production build pass.

Visual checking remains useful as a final confirmation, but it should not be
used to guess model identity or manually nudge coordinates. The runtime
pointers and numeric transforms are the correctness source.

## Extending this to another map

Use the map's catalog prefix and a RAM capture from that zone. A single
capture may contain most of the zone, as JOMO did. Compare the catalog against
the recovered runtime copies to produce a precise list of missing models.

Additional captures are needed only when objects are:

- conditional on story or interaction state;
- swapped between open/closed or damaged/intact variants;
- spawned only at a different time or weather state;
- genuinely absent from the zone's current RAM working set.

Merge captures by model and TASK identity only after confirming whether task
addresses are stable across reloads. When addresses are not stable, deduplicate
by model plus transform and retain capture provenance.

## Static formats recovered beyond JOMO

Two additional deterministic MAPINFO sources now complement RAM capture:

- BETD's `CHRD/CHRS` records directly associate six exterior models with
  named `Position`, `Angle`, and `Image` properties. See
  [BETD Exterior Object Placement](betd-object-placement.md).
- Contiguous `DRxx_xxx` resource tables are followed by 16-byte descriptors
  and packed 36-byte placement records. The generalized extractor recovers
  18 JOMO doors and 120 D000/Dobuita doors without running the emulator.

D000 still requires additional evidence for non-door dynamic props. Its
static door table is complete, but that narrow completeness must not be
presented as complete Dobuita object placement.
