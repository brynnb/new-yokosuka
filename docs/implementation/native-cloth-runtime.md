# Native Character Cloth Runtime

## Scope and design rules

Shenmue I models contain authored `CLTH` control lattices for coats, skirts,
robes, and other loose surfaces. The browser implements that contract once for
playable, scheduled, and cutscene characters. It does not copy model art,
encode actor or cutscene exceptions, or put solver policy in `play.js`.

The implementation is split into independent layers:

1. `NativeClothModel` discovers native control/output node pairs.
2. generated metadata records CHRM topology and executable-owned profiles;
3. `NativeClothSimulation` reproduces the fixed-step native solver without a
   Babylon, actor, map, or cutscene dependency;
4. `NativeClothBabylonPresentation` translates animated rigs, collision
   controllers, and dynamic mesh buffers;
5. existing character and AUTH coordinators own lifecycle and update order.

## Model contract

`FUN_0c0ae100` discovers signed MT5 control-node types `-78` through `-70`.
`FUN_0c0ae220` allocates `CLTH`, `CLID`, `CLVB`, `CLVO`, `CLUR`, and `CLUI`
records and binds control nodes to visible output nodes:

| Control | Output |
| ---: | ---: |
| `-71` | `0x56` |
| `-72` | `0x57` |
| `-73` | `0x58` |
| `-74` | `0x59` |
| `-70` | `0x5a` |
| `-75` | `0x92` |
| `-76` | `0x93` |
| `-77` | `0x94` |
| `-78` | `0x95` |

The bundled inventory covers 240 models, 111 cloth-bearing models, and 144
groups. It retains the two native control-only groups and presents all 142
groups with visible output surfaces. Control and output rest positions differ
for 23 groups. The presenter therefore applies solved control displacement to
the corresponding output rest point; replacing output points with control
points would destroy the authored garment silhouette.

Visible cloth polygons may reference body-owned vertices at an attachment
seam. Those vertices remain owned by their actual body node and use its current
rig matrix. Control lattices are hidden before GPU batching, while output
subtrees retain original materials, UVs, indices, and textures. Generated
metadata contains only topology and profile facts, never duplicate art.

## Executable profiles

`tools/animation/extract_native_cloth_evidence.py` hash-pins the supported
`1ST_READ.BIN` (`ca98879a...f32c`) and extracts:

- 140 named character rows and the native fallback row at `0x0c285248`;
- the eight raw control bytes in each 16-byte row;
- 126 body-collision profiles, including runtime-mode overrides;
- the native node mapping, allocation tags, code hashes, and solver literals.

The extractor also asserts the solver's literal pointers to profile bytes
`+0x0a`, `+0x0b`, and `+0x0d`. This prevents a nearby field from acquiring a
plausible but incorrect meaning.

Collision records are ten bytes:

```text
s16 x, s16 y, s16 z, s16 radius, u8 controllerType, u8 collisionMaskShift
```

Position and radius values use the executable's `0.001` scale. A sentinel
record ends each profile.

### Force and damping selection

Profile byte `+0x0a` chooses the primary controller field. The solver takes
the midpoint of the selected controller pair relative to controller type zero,
normalizes it, and applies the executable magnitude
`0.05444444715976715`:

| Selector | Controllers |
| ---: | --- |
| `1` | `0x22`, `0x1b` |
| `2` | `0x1f`, `0x18` |
| `3` | `0x20`, `0x19` |

Profile byte `+0x0b` optionally selects a second field from the same table;
byte `+0x0c` is its first row. Control types `-78` through `-75` use their
native direct controller pairs instead. Runtime modes `1`, `2`, and `5`,
profile selector `4`, and the native `NAT` rule select the fixed downward
field. These branches are all shared profile logic, not character code.

Profile byte `+0x0d` scales current-parent minus previous-parent motion:

| Mode | X | Y | Z |
| ---: | ---: | ---: | ---: |
| default | `0.5` | `0.5` | `0.5` |
| `1` | `0.8` | `0.65` | `0.8` |
| `2` | `0.2` | `0.1` | `0.2` |
| `3` | `1.0` | `1.0` | `1.0` |

The ordinary garment solver has no invented continuous gravity term.

Runtime mode `4` is a distinct native advection path. It preserves the full
row-parent displacement, then adds the cloth owner's time-varying vector
through the executable-owned `8 x 20` coefficient field at `0x0c281e2c`.
The first row is zero, and the coefficients progressively increase toward the
hem while falling off at the authored opening/seam columns. Live, unmodified
OP02 captures measure Shenhua's owner vector along native `[-1, 0, 2]`, with
initial magnitudes from `0.0366` through `0.0529`; this is the sustained gust
that makes the complete dress billow instead of behaving like ordinary
gravity cloth.

## Native update contract

`FUN_0c0ae916` establishes the frame boundary:

1. copy the freshly body-posed source buffer to current state;
2. `0x0c0aeca4`: transform current positions and auxiliary endpoints;
3. `0x0c0af35e`: solve position, constraints, and body collision;
4. `0x0c0b0512`: rebuild surface auxiliary endpoints;
5. copy solved current state to the previous buffer;
6. `0x0c0aede8`: transform current state back for output;
7. propagate the solved displacement through the render pair.

The browser runs the same state transition at 30 Hz with bounded catch-up.
Render frames that do not advance that fixed solver retain the existing local
garment buffers, allowing the actor hierarchy to carry the surface coherently.
Reprojecting an old world-space solution through a newer actor transform would
counter-translate the cloth and create a render-rate-dependent vibration.
For an ordinary dynamic point, the candidate target is:

```text
previous solved point
  + damping * (current row-parent - previous row-parent)
  + profile-selected force
  + runtime-mode advection
```

The candidate is projected to its authored distance around the already-solved
current row parent. A movement greater than the executable's `1.8` threshold
uses the current parent and zero inertia, which handles teleports without a
character-specific reset.

The freshly body-posed source buffer is still copied into current state at the
frame boundary because it supplies pinned anchors and the current parent chain.
It is not the ordinary dynamic point's integration origin. Treating it as that
origin makes a garment repeatedly collapse toward its rigid source surface and
through the animated legs.

Only anchor bindings whose high nibble is `0x10` are fixed. `0x20` bindings
are native dynamic constraints and must not be mistaken for pinned vertices.

### Horizontal constraints

Open panels (`-71` through `-74`) solve outward from the authored anchor
column in both directions, using the appropriate previous/next column rest
length. Native includes the selector in the descending pass, then begins the
ascending pass at `selector + 1`; the selector is never projected twice.

Closed rings (`-70`, `-75` through `-78`) project from both neighbors and
average the results. Their spacing mode is executable-owned:

- nonzero runtime mode: authored column rest length;
- profile `+0x0d == 3`: authored rest length multiplied by `0.3`;
- otherwise: measured current ring spacing, capped at `2.0` times the
  smallest authored body-collision radius.

The collision index at constraint byte `+0x02` does not exclude a point from
the ring pass. The native pass tests the distinct word at `+0x04`; ordinary
captured garment constraints leave that word zero, including after collision.

### Body collision and surface auxiliaries

Body spheres follow the current controller of their authored type and the
actor's uniform world scale. Incomplete controller state causes the entire
cloth update to wait; a partial collision body is never presented.

For a point inside a sphere, native code traces from the projected point along
its source auxiliary direction, solves the ray/sphere quadratic, chooses the
positive exit, and then restores the point's row-parent rest distance. This is
materially different from a radial push and avoids forcing skirts or robe
panels through the body-side seam.

After horizontal constraints, `FUN_0c0b0512` rebuilds each dynamic auxiliary:

1. cross the row-parent vector with the previous-column vector (or the next
   column at the open boundary);
2. reverse the open-boundary result;
3. orient it consistently with the parent row's auxiliary;
4. normalize it and store `position + normal`.

Across 864 dynamic point samples from live Lan Di and Ine-san updates, this
formula matches the captured direction with a minimum dot product above
`0.9999999999994`; captured dynamic auxiliary lengths remain within about
`0.000001` of one.

## Runtime architecture

### Pure data and simulation

- `play/characters/NativeClothTopology.js` builds row/column order, seam
  closure, anchor layout, masks, neighbor records, and output mapping.
- `play/characters/NativeClothProfiles.js` resolves the model/fallback row,
  collision profile, damping, and closed-ring mode.
- `play/characters/NativeClothControllerPose.js` maps native controller types
  and coordinate transforms.
- `play/characters/NativeClothForces.js` resolves shared primary/secondary
  fields, fixed-downward modes, and the captured mode-4 gust projected through
  the executable lattice field.
- `play/characters/NativeClothSimulation.js` owns only deterministic native
  state and math.

`play/data/native-cloth-models.web.js` and
`play/data/native-cloth-profiles.web.js` are deterministic generated metadata.

### Babylon presentation

`NativeClothBabylonPresentation` owns one persistent model state. It:

- validates generated metadata against the loaded CHRM;
- transforms source positions and `sourcePos + sourceNorm` endpoints;
- creates the complete authored collision body before advancing;
- preserves distinct output rest offsets and body-owned seam vertices;
- updates every UV-duplicate vertex, then recomputes normals and bounds;
- detaches only acquired cloth output surfaces from rigid skinning;
- restores the exact original buffers and skeleton state on release.

CPU-baked playable models and GPU scheduled/cutscene actors use this same
adapter. AUTH presentation runs body, FACE, HAND, OSAG, then CLTH, followed by
camera presentation. Camera cuts do not reset cloth; activity seeks,
teleports, replacement, and disposal have deterministic state boundaries.

## Reproduction and validation

Regenerate and verify metadata with:

```sh
npm run extract:native-cloth-profiles
npm run extract:native-cloth-models
python3 -m tools.animation.extract_native_cloth_evidence --check
node tools/animation/build_native_cloth_model_inventory.mjs --check
```

Focused native capture uses:

- `tools/emulator/capture_shenmue1_cloth_runtime.py`
- `tools/emulator/capture_shenmue1_cloth_force_runtime.py`
- `tools/emulator/summarize_shenmue1_cloth_runtime_capture.py`

The state capture stops after the surface-auxiliary return. The force probe
stops at the first lattice-row instruction after both force vectors have been
resolved. Neither writes guest cloth state or calls game functions. The
committed pointer-free evidence
contains 12 Lan Di samples, six Ine-san samples, 108 walking Hiroko Tahashi
samples, and 15 Eiko Kusano samples. Eiko's profile and captured ring spacing
prove that the authored `0.3` branch tests profile byte `+0x0d`, not `+0x0a`.
The evidence retains exact native topology, collision states, closed-ring row
spacing, motion hashes, and the auxiliary-direction validation.

The `NativeCloth*.test.js` suites cover generated-data freshness, exact live
topology, every bundled force/profile selection, fixed-step behavior,
source/previous advection, anchors, teleport handling, native ray collision,
surface ownership/restoration, Lan Di and Ine-san, and a real two-update audit
of all 142 rendered bundled garment groups. AUTH tests pin shared ordering and
cleanup so later cutscenes cannot bypass the system with local cloth code.

## Evidence boundary

The current browser contract covers the ordinary authored garment path used by
the shared character presentation: model pairing, profile-selected force and
damping, open and closed constraints, teleport state, body collision, surface
auxiliaries, and render mapping. Executable branches requiring a native world
ground-height sampler remain evidence rather than receiving a guessed browser
equivalent. If that environmental path is needed, add a shared terrain-query
input and focused native capture; do not introduce per-map or per-character
offsets.
