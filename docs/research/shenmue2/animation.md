# Shenmue II Animation Research

This document records the current understanding of Shenmue II animation in
New Yokosuka. It covers source formats, runtime controller structures, NPC
selection and scheduling, Dreamcast emulator evidence, the browser
implementation, and the remaining unknowns.

For the authoritative end-to-end browser architecture, research workflow,
evidence policy, render-rig design, and safe extension checklist, read
[the animation implementation guide](../../implementation/shenmue2-animation.md). This file is
the detailed chronological evidence record behind that current-system guide.

The evidence labels used below are:

- **Proven:** directly established by source bytes, native code, or repeatable
  runtime observation.
- **Strong inference:** supported by multiple independent observations but not
  yet a complete native-code reconstruction.
- **Unresolved:** not safe to encode as a general rule yet.

## Why Shenmue I's animation runtime cannot be reused unchanged

Shenmue I and II share engine ancestry, actor concepts, and many high-level
motion semantics, but their relevant runtime representations differ.

Shenmue I's browser implementation works with the decoded MOMT/HRCM controller
pipeline. Shenmue II Dreamcast characters use MT7/CHRM render models and a
compact `.MOT` format. Shenmue II evaluates compact curves into five native
solver structures and binds the resulting matrices to live MDC7 render
records. Therefore, reusing Shenmue I's timing, scheduling, blending, and
render-application architecture is appropriate; assuming its skeleton storage
or direct curve-to-node binding is not.

## Source assets

### Character models

The browser's Shenmue II characters are extracted `.CHRM` files parsed as MT7.
MT7 retains:

- authored node IDs;
- local position, fixed-turn rotation, and scale;
- parent, child, and sibling pointers;
- attached mesh/material data.

Common humanoid node IDs include `0x01`, `0x04`, `0x09`, `0x0e`, the limb
chains `0x05..0x07`, `0x0a..0x0c`, `0x10..0x13`, `0x15..0x18`, and signed
terminal IDs such as `0xffbd`, `0xffbe`, and `0xffbf`. Optional terminal,
clothing, hair, and accessory nodes vary by model family.

**Proven:** MT7 preorder is not a stable compact-controller index. Different
model families reorder branches and add optional render nodes.

### Compact motion banks

The decoded banks currently include:

- `NPC.MOT`;
- `NPC_TBL.MOT`;
- `MOTION.MOT`;
- area/special-character banks such as `NPC_WESM.MOT`, `NPC_KUN.MOT`, and
  `NPC_WT00.MOT`.

The native encoded motion ID ranges and browser bank registry live in
`src/Shenmue2MotLoader.js`. The selector and format evidence is retained in
`tools/evidence/shenmue2-motion-format.json`.

## Compact `.MOT` format

**Proven:** a normal sequence contains 69 curves:

```text
3 root-translation curves
+ 22 controllers * 3 component curves
= 69 curves
```

The sequence layout is:

- a 78-byte header;
- 69 unsigned interior-key counts;
- one alignment byte;
- compact Hermite curve records.

The three components are storage-level controller inputs, not universally
Euler rotations. Some are rotations, while the native aimed-limb solvers use
other triplets as basis rotations and target positions. Naming all 22
triplets `rotation` was an early browser assumption, not a format fact.

Each key contains a half-float value and tangent. Bit zero of the value word
selects an optional separate outgoing tangent. First and last key times are
implicit; interior times are `uint16` frame numbers. The sequence header is a
frame count, so native builder `0x8c1cda80` places the terminal key at
`durationFrames - 1`. A retained `0xf03e` runtime curve has a 34-frame header
and a terminal time of exactly `1.1` seconds (frame 33), independently proving
that boundary. Playback is 30 frames per second, and interpolation is cubic
Hermite with tangents converted to seconds.
The leading sequence half-float is not a multiplier for these samples. Native
curve builder `0x8c1cda80` applies per-runtime-curve scale/base fields at
`+0x34/+0x38`; the synchronized `0xf086` curves contain `1.0/0.0` there and
match the unscaled decoded half-floats exactly. The earlier browser decoder
multiplied every value and tangent by the sequence half-float (`1.19921875` in
`MOTION.MOT`), exaggerating every controller channel.

The parser is `src/Shenmue2MotLoader.js`. The complete bundled corpus is
covered by `tests/Shenmue2MotLoader.test.js`.

## Native motion selection

**Proven:** ordinary NPC locomotion is selected by a model/body-family index.
Examples include:

| Family | Steady walk motion |
| ---: | ---: |
| 0 | `0xf03e` |
| 2 | `0xf07e` |
| 4 | `0xf09e` |
| 6 | `0xf060` |
| 7 | `0xf086` |
| 9 | `0xf078` |

The raw body value is stored in the MT7 root type as
`(root.id & 0xffff) - 0x7001`. Native Xbox function `FUN_000813db` reads the
same value from IMGM payload `+0x14`, indexes the 97-byte table at Xbox VA
`0x4ec000`, and passes that mapped family to the locomotion selector. The
actor-code suffix is not involved. Native runtime captures independently
confirm `CF1_L -> family 4 / 0xf09e`, `BA7_L -> family 6 / 0xf060`, and
`JN5_L -> family 7 / 0xf086`. The browser crowd extractor now uses this exact
MT7/table path.

Idle selection uses model variant, actor motion subtype, and an age/variant
category. Character-table motions occupy 17 logical slots per HUMANS actor.
Area-specific programs can request additional motion IDs.

The selector tables were recovered from the supplied Xbox executable and
cross-checked against the Dreamcast data. The relevant Xbox functions and
tables are recorded in `tools/evidence/shenmue2-motion-format.json`.

## Five native motion slots

**Proven:** the native descriptor builder partitions the 69 ordinary curves as
27/9/9/12/12 curves. After the root XYZ triplet, those partitions correspond
to these compact-controller indices:

| Slot | Controller indices | Pose-structure offset |
| ---: | --- | ---: |
| 0 | `0..7` | `+0x08` |
| 1 | `8..10` | `+0xe18` |
| 2 | `11..13` | `+0x11a8` |
| 3 | `14..17` | `+0x1578` |
| 4 | `18..21` | `+0x1af8` |

The native application order is 0, 1, 2, 3, 4. Actor motion layers use mask
bits `0x02`, `0x04`, `0x08`, and `0x10` to request slots 1 through 4. Slot 4,
for example, can retain a separately evaluated pose that is applied after the
ordinary locomotion pose. It must not replace the entire walk or idle clip.

The native default blend window is eight frames.

## Live Dreamcast compact-controller layout

The currently observed controller allocation is `0x2440` bytes. Important
controller-relative fields are:

| Offset | Meaning |
| ---: | --- |
| `+0x08` | affine actor root and slot 0 solver base |
| `+0xe18` | slot 1 solver base |
| `+0x11a8` | slot 2 solver base |
| `+0x1578` | slot 3 solver base |
| `+0x1af8` | slot 4 solver base |
| `+0x23c0` | five slot flags |
| `+0x2400` | five current motion IDs (`u16`) |
| `+0x240a` | five requested motion IDs (`u16`) |
| `+0x2428` | five blend counters |
| `+0x2432` | five blend durations |

Synchronized slot-2 captures also identify the live sample-frame fields. Slot
0 exposes its current compact-MOT frame at controller `+0x94`; slots 1, 2,
and 3 expose the same value at solver-base `+0x08` (`+0xe20`, `+0x11b0`, and
`+0x1580`). Ten half-second captures of walk `0xf086` produced frames
`8, 23, 5, 20, 1, 16, 31, 13, 28, 9`, including the expected wrap at the
35-frame duration. This permits exact native-versus-browser pose comparison
without estimating phase from wall-clock capture time.

Slot 4 must be treated independently. For some actors its analogous field did
not share the main locomotion phase, and its output matrices remained static;
for another captured family (`0xf09e`) it was synchronized and animated. The
browser must not assume that all five slots use slot 0's frame merely because
their reported motion IDs match.

The reusable extractor is:

```bash
node tools/actors/extract_shenmue2_runtime_controller_bindings.js \
  CAPTURE/ram.bin [--motion-id 0xf03e] \
  --out .disc-work/s2-controller-bindings.json
```

It finds live controllers from their five slot records and affine root, then
follows MDC7 binding pointers to matrices inside the adjacent controller.
Runtime addresses are capture-local and must be rediscovered after every load
or restart.

## Renderer-consumed solver matrices

**Proven for three audited pedestrian families:** the renderer consumed the
same 19 controller-relative matrix offsets, distributed 7/1/1/5/5 across the
five solvers:

| Slot | Matrix offsets |
| ---: | --- |
| 0 | `+0x3e0`, `+0x620`, `+0x660`, `+0x760`, `+0xb10`, `+0xb50`, `+0xc50` |
| 1 | `+0x1168` |
| 2 | `+0x1508` |
| 3 | `+0x1690`, `+0x18c8`, `+0x1908`, `+0x1980`, `+0x1a80` |
| 4 | `+0x1c10`, `+0x1e48`, `+0x1e88`, `+0x1f00`, `+0x2000` |

The model/render-record ordering attached to those matrices differed between
families. This establishes a shared solver layout and model-specific binding.
It does not establish a universal render-record ordinal.

The SH-4 render traversal at `0x8c0da780` also establishes how a bound record
is consumed. When MDC7 record `+0x38` is nonzero, the renderer passes that
pointer directly to the matrix-load path. It does not read the record's static
XYZ fields and does not multiply a static local transform after the solver
matrix. Static XYZ is used only by the null-binding branch. An FPU read trace
of a live bound record confirms that the apparent static 4x4 words are not
read. Therefore browser animation must reproduce the model-specific binding
to the solved matrices; rotating a fixed static MT7 hierarchy is not generally
equivalent.

MDC7 occurrences in live RAM are not all skeleton nodes. They include simple
model-node records and embedded geometry/render records. Treating each MDC7
record as one bone is another form of the same flat-mapping bug.

## Matrix writer trace

A deterministic Worker’s Pier capture followed motion `0xf03e` for 145
animated frames. The first trace restricted PCs to
`0x8c1c0000..0x8c1e1000`. It captured compact-curve working fields but omitted
the final matrices.

A second trace widened the PC filter to
`0x8c040000..0x8c1e1000` and enabled both general and FPU writes. It showed
function `0x8c04f320` copying every renderer-consumed 4x4 matrix. The return
address in `PR` identified the solver call site responsible for each output.

Important native Dreamcast functions currently identified are:

| Function | Role |
| ---: | --- |
| `0x8c0ef9a0` | build the five compact-motion slot descriptors |
| `0x8c0ef220` | update motion slots and blends |
| `0x8c1cd920` | dispatch/evaluate one slot |
| `0x8c1ce2e0` | apply all five solver slots |
| `0x8c1d14e0` | slot 0 solver |
| `0x8c1d3000` | slot 1 solver |
| `0x8c1d4020` | slot 2 solver |
| `0x8c1cf0a0` | slot 3/4 limb solver |
| `0x8c04f320` | final 4x4 matrix copy helper |

An entry trace of `0x8c1cf0a0` adds a stable calling convention to that map.
At function entry, `r4` addresses the limb slot (`controller+0x1578` or
`controller+0x1af8`), `r1` carries the same controller-relative offset, and
`r9` retains the owning compact-controller base. The two calls use the same
function and structure layout; they are not separate ad-hoc animation paths.

The operational procedure and full trace command are in
`docs/guides/emulator-research.md`.

## Anatomical topology

The live matrices and authored MT7 hierarchy establish that the apparent MT7
root siblings `0x04` and `0x09` are native limb/shoulder controls, not the first
two entries of a flat animation array. The solver attaches their authored arm
chains before producing render matrices.

**Strong inference, supported by matrix positions, source hierarchy, curve
partitions, and output order:**

- the actor root feeds slot 0's pelvis output at `+0x3e0`;
- the pelvis feeds the two three-link leg chains and slot 1's torso output at
  `+0x1168`;
- slot 2 produces the head/neck matrix;
- slots 3 and 4 produce the two shoulder/arm chains;
- MT7 terminal nodes can inherit a solved parent without owning another
  independent compact-controller triplet.

The corrected pelvis-to-torso direction is visible directly in matrix
translations: the actor root is at ground level, `+0x3e0` is near hip height,
`+0x1168` is above it, and `+0x1508` is at head height. Reversing the first two
matrices gives plausible rotations but the wrong local frame, so spatial
topology is part of the numeric validation rather than merely a label.

Three synchronized walking families (`0xf03e`, `0xf086`, and `0xf09e`) now
show near-perfect correlations between selected compact curves and native
local matrix axes. In particular, the torso output follows the slot-1
controller group, the head follows the slot-2 group, and the animated arm
outputs follow their own slot-3/4 groups. These observations confirm the group
partition while also showing that one solved output can compose more than one
controller triplet; a one-triplet/one-visible-node implementation remains
insufficient.

One captured pedestrian bound only 18 of the usual 19 solver matrices while
the other sampled models bound all 19. The omitted output was an intermediate
arm matrix (`+0x1f00`), not an absent `.MOT` controller. Optional model/render
branches therefore have to be represented in the native binding layer rather
than rejected as malformed skeletons.

The retained captures now establish and test the per-axis composition inside
slots 0, 1, and 2. Several compact controller triplets are solver inputs or
basis controls rather than direct Euler deltas for a visible MT7 node.

### Slot-zero pelvis orientation

**Proven from Dreamcast SH-4:** the ordinary slot-zero path at
`0x8c1d18c0..0x8c1d1906` evaluates the first rotation triplet at slot-relative
offsets `+0x168`, `+0x1a8`, and `+0x1e8`. Each value is converted from radians
to a 16-bit fixed turn with `FTRC` (truncation toward zero), then applied by
three matrix helpers in this exact order:

| Compact channel | Native axis | SH-4 helper |
| --- | --- | ---: |
| first (`rx`) | Z | `0x8c1e0040` |
| second (`ry`) | Y | `0x8c1dff90` |
| third (`rz`) | X | `0x8c1dfed0` |

The helpers use `FSCA` and rewrite the live `XMTRX` basis; this is not the
generic MT7 `Rx * Ry * Rz` conversion. The solver consumes the absolute compact
angles rather than clip-start-subtracted deltas. After Dreamcast-to-browser X
reflection, Babylon's row-vector convention expresses the browser composition
as `Rx(rz) * Ry(-ry) * Rz(-rx)`. This order is verified against the native
controller-0 intermediate at structure-relative `+0x228` (matrix data at
`+0x230`), not selected by fitting the final pose.

That intermediate is not the rendered pelvis. At
`0x8c1d1928..0x8c1d1a50`, `FUN_8c1d14e0` saves controller 0, translates the
authored pelvis rest displacement, applies controller 1's second Z/Y/X
triplet from descriptors `+0x2d8/+0x318/+0x358`, and saves the final pelvis at
structure-relative `+0x3d8` (matrix data at `+0x3e0`). Controller 1 contains
the live pelvis basis, including its roughly quarter-turn neutral orientation;
the old MT7 bind quaternion was only an approximation of that neutral value.
The exact reflected browser orientation is therefore `controller0 *
controller1`, with no additional MT7 bind multiplication. The rest
displacement is transformed by controller 0 before controller 1 changes the
orientation, so controller 1 must not rotate that already-installed position.
Across the retained ARI, SEI, SAM, and LLY captures, this composition matches
native pelvis orientation within `0.026` degrees.

Every synchronized fixture now retains two earlier slot-zero intermediates as
well as the rendered `+0x3e0` pelvis. Controller `+0x48` is the identity-space
root-translation matrix saved at `0x8c1d1870..0x8c1d1876`; for scheduled
actors its horizontal translation is the exact inverse of the evaluated
compact X/Z curves because controller `+0x08` already owns world travel.
Controller `+0x230` is the post-callback controller-0 world matrix. Each frame
also records its capture-local controller address, so evidence joined across
allocations remains traceable to the exact RAM structure that produced it.

The controller-0 callback is now decoded and naturally validated. SH-4
`0x8c0e7f00` reads the three installed controller descriptors at
`+0x170/+0x1b0/+0x1f0`; the slot-zero caller does not replace the first pointer
with a hidden stack curve. At complete blend and mode zero, the callback runs
the ordinary native curve evaluator for all three values, converts each radian
value to a fixed turn, and invokes the Z, Y, then X matrix helpers. An isolated
GDB observer captures the exact descriptors at callback entry and the native
`+0x230` matrix after the caller saves it. A parallel interpreter trace records
the evaluator returns, fixed-turn helper arguments, and FR/XF state without
redirecting execution. Natural same-cycle observations for `01A_`, `01B_`, and
`05A_` reproduce the saved native primary basis within `0.024` degrees. The
browser's existing controller-0 path already uses those same curves and order;
no actor correction or replacement matrix is required.

The independently reproducible, normalized observation is committed as
`tools/evidence/shenmue2-pelvis-callback-conformance.json`. Its builder joins
the hashed GDB and interpreter captures by controller, callback context, helper
order, and exact fixed-turn values. In the retained example browser Hermite
evaluation yields `[0, -973, 0]`, exactly matching the native helper inputs;
the independently captured primary matrix differs by `0.0184` degrees.

This validation also identified a capture-timing problem that had been
misclassified as animation behavior. Two retained `CCA_L / 0xf03e` frames and
two `BA7_L / 0xf060` frames paired one scheduler phase's descriptors with a
different phase's renderer matrix, producing apparent errors of
`0.247–0.687` degrees. Valid synchronized captures top out below `0.024`
degrees. Fixture generation now requires a fixed-axis callback's captured
descriptors to reproduce its captured `+0x230` intermediate within `0.05`
degrees before that frame may judge browser output. Rejected frames remain in
fixture provenance with their capture name, controller, phase, and measured
error. Removing those internally inconsistent comparisons promotes both former
callback discrepancies to strict evidence; it does not loosen a browser
threshold or conceal an implementation failure.

The callback's `direction-up-blend` branch calls the same decoded
`FUN_8c1d53a0` direction/up solver already proven by strict slot-3/4 arm
captures. SH-4 passes callback context word 3 to that helper; every retained
controller places this four-vector structure at controller `+0x270`. The
capture bridge and fixture builder now retain its target-forward, target-up,
source-forward, and source-up vectors together with the helper's live
`0x8c308348/0x8c308350` frame pair. The browser callback dispatch consumes
that exact structure, and fixture validation rejects a mode-1 observation
unless all inputs are present. A natural pelvis mode-1 execution is still
required to promote this path to strict end-to-end matrix conformance; the
shared helper proof alone does not establish when gameplay selects the branch.

### Proven torso solver

Slot-1 function `0x8c1d3000` produces the single torso output at slot-relative
`+0x350` (controller-relative `+0x1168`). Its three compact controllers are
procedural inputs, not three visible MT7 rotations:

| Controller | Slot-relative curves | Native role |
| ---: | --- | --- |
| 8 | `+0x20/+0x60/+0xa0` | root rotation |
| 9 | `+0x118/+0x158/+0x198` | torso aim vector |
| 10 | `+0x258/+0x298/+0x2d8` | terminal rotation |

Controller 8 and controller 10 use the same fixed-turn Z/Y/X helpers as the
pelvis and arm roots. Helper `0x8c1ce200` treats controller 9 as a vector: it
normalizes XY, rotates Z to align that projection, then rotates Y to align Z.
The resulting local X axis is the torso direction. The solver transforms that
direction through the animated parent, stores its intermediate matrix at
`+0x218`, advances by the authored torso segment length, applies controller
10 around that endpoint, and copies the final matrix to `+0x350`.

The slot-1 solver basis is the native reflection of the live controller-1
pelvis basis inverse. Its roughly 90-degree neutral value explains why the old
MT7 pelvis-bind approximation often looked close, but the approximation left
every downstream torso, head, and arm output carrying controller 1's animated
residual. The runtime now passes the sampled controller-1 basis directly. Its
segment length remains the authored pelvis-to-torso distance (`0.166846` for
the original SAM-profile comparison rig), matching the native
`+0x154 + +0x294` value.

Across the ten synchronized exact `JN5_L / 0xf086` frames, the complete chain
places every measured point within `0.007920` model units (the worst sample is
a separately aimed head), every orientation within `0.038` degrees, and every
limb bend within `0.025` degrees. The ordinary torso and appendage samples are
substantially tighter; no arm-specific corrective rotation is involved.

### Proven head solver

Slot-2 function `0x8c1d4020` produces the head output at controller-relative
`+0x1508`. Its three controllers are another procedural chain:

| Controller | Native role |
| ---: | --- |
| 11 | root Z/Y/X rotation |
| 12 | second Z/Y/X rotation |
| 13 | head aim vector |

The function applies controller 11 through the fixed-turn Z/Y/X helpers at
`0x8c1d4160..0x8c1d41a2`. The controller-12 branch uses the same helpers at
`0x8c1d42a0..0x8c1d4406`. It then evaluates controller 13's vector at
slot-relative `+0x260/+0x2a0/+0x2e0`, calls `0x8c1ce200` to align native X to
that vector, and copies the resulting matrix through `0x8c04f320` at
`0x8c1d44ec`.

In Babylon row-vector notation, before Dreamcast-X reflection, the local
orientation is `aim(13) * rotation(12) * rotation(11)`. Unlike the torso
path, slot 2 begins in identity local space: inserting the extracted head or
torso bind rotation creates errors of 90 degrees or more. The identity-basis
composition matches both JN1 and CM5 directly. Ordinary JN1 head-orientation
errors are below `0.2` degrees, its retained mixed-phase frame is below `0.9`
degrees, and CM5 is below `0.001` degrees. The earlier browser path applied
only controller 11 and produced errors around 7--9 degrees.

Controller 12 also has a native current-actor callback path. When slot-relative
`+0x258` contains `0x8c0e7a40`, the callback first builds the ordinary
controller-11/12 basis. The render wrapper temporarily publishes the active
compact controller through `0x8c24e628`; controller-relative `+0x26c0`
supplies a blend amount and `+0x04` chooses one of two fixed target bases.
`FUN_8c1d53a0` blends the completed basis's forward and up columns toward that
target before controller 13 applies its aim.

This path is active in 19 synchronized `RYO_M / 0xf002` frames: `+0x26c0` is
exactly `1.0` in every formerly discrepant frame and `0.0` in matching frames.
Applying the recovered callback reduces the former constant
`1.9116`-degree head error to floating-point noise. It is driven by captured
native state and the SH-4 callback contract; there is no per-model quaternion
or fitted angular offset.

### Proven arm-controller roles

The synchronized `JN1_L` / motion `0xf086` capture establishes the four-input
role sequence used by both arm slots:

| Slot 3 | Slot 4 | Native role |
| ---: | ---: | --- |
| 14 | 18 | shoulder/root rotation |
| 15 | 19 | two-bone solver basis rotation |
| 16 | 20 | solver target position |
| 17 | 21 | terminal rotation |

This is the same structural split used by Shenmue I's controller runtime:
ordinary articulated root, two-bone basis, position target, and terminal
control. The native arm outputs retain the MT7 upper/lower lengths exactly
(`0.277974` and `0.229545` for `JN1_L`), demonstrating that the target triplet
drives IK rather than becoming a forearm rotation.

The two shoulder/root controls are identity transforms in all 102 extracted
S2 character families. Synchronized `JN1_L` matrices likewise show their
runtime outputs nearly identity-relative-to-torso during the sampled walk.
They must therefore be inserted under the torso while retaining their local
identity transforms. A world-preserving reparent bakes `inverse(torso)` into
both controls and creates an artificial 83–90 degree shoulder twist; this was
the source of the detached-looking arms and oppositely facing shoulder seams.

The shared slot-3/4 implementation is SH-4 function `0x8c1cf0a0`. Relative to
either slot base (`+0x1578` or `+0x1af8`), it writes the root, shoulder, elbow,
hand, and terminal matrices at `+0x118`, `+0x350`, `+0x390`, `+0x408`, and
`+0x508`. Its important input fields are:

| Slot-relative offsets | Native role |
| --- | --- |
| `+0x20/+0x60/+0xa0` | shoulder/root rotation curves |
| `+0x5c/+0x9c/+0xdc` | authored root translation |
| `+0x158/+0x198/+0x1d8` | animated two-bone basis rotation |
| `+0x194/+0x1d4/+0x214` | authored shoulder offset |
| `+0x250/+0x290/+0x2d0` | compact hand target |
| `+0x28c/+0x2cc` | upper- and lower-arm lengths |
| `+0x30c` | transformed target vector |

Both the root and basis rotations use the same fixed-turn Z-then-Y-then-X
matrix helpers as the recovered pelvis branch. They consume absolute compact
values, not clip-start deltas. The basis is not multiplied by the MT7 upper
arm's bind rotation; doing that was a browser invention that rotated the
solver plane away from the native one.

An exhaustive permutation/sign comparison over every retained frame in both
slots establishes the compact target conversion as native XYZ reflected into
browser space: `[-rx, +ry, +rz]`. Its RMS error is `0.000334`; the next-best
mapping is roughly `0.187`, so this is no longer a visual fit or tentative axis
guess. The target is a shoulder-relative vector transformed by the animated
basis. Native code uses it at its authored magnitude. The former per-clip arm
reach normalization and `0.8339` scale were compensating browser behavior and
have been removed.

The target endpoint is native slot output `+0x508`, not the visible hand
attachment at `+0x408`. This distinction matters on short rigs. For SEI,
`FUN_8c1cd380` copies solver lengths `0.20225` and `0.17711` from rest-record
`+0x68/+0x6c` into arm slot `+0x2cc/+0x28c`; the rendered hand attachment is
only `0.103` beyond the elbow. Measuring the IK reach to that attachment made
the browser believe the authored target was unreachable and straightened the
elbow. The browser now uses the native per-family solver lengths while leaving
the intermediate hand attachment at its authored local distance.

The same rest record owns arm placement. `+0x50/+0x54/+0x58` and
`+0x78/+0x7c/+0x80` are the two arm-root translations relative to the torso;
`+0x64` and `+0x8c` are the paired shoulder translations relative to those
roots. After MT7 X reflection, SEI becomes `[-0.1131, 0, +0.022]` with a
`[0, 0, +0.103]` shoulder and its mirrored counterpart. SAM similarly uses
`[-0.18201, 0, +0.045]` and `[0, 0, +0.158]`. Installing these native local
translations removes the earlier preserve-world placement compromise.

The native bend plane is the animated basis's projected Z axis. After the MT7
X reflection, both slots bend along `cross(planeNormal, targetDirection)`.
They use the same native subtype; the old reversed second-arm bend was another
visual compensation. Bilateral placement instead comes from model-specific
root/shoulder translations and solver bases.

The native output sides also prove that curve-slot ownership crosses the
numeric MT7 arm branches: slot 3 drives the positive-Z `0x09 -> 0x05 -> 0x06
-> 0x07` chain, while slot 4 drives the negative-Z `0x04 -> 0x0a -> 0x0b ->
0x0c` chain. Binding slot 3 to `0x04` and slot 4 to `0x09` caused the earlier
cross-torso motion even when the local solver mathematics was otherwise close.

Across the ten synchronized `JN1_L / 0xf086` frames, arm bend errors are now
below `0.004` degrees. Ordinary-frame arm point errors are below `0.0014`
model units; the independently phased frame 31 remains below `0.0043`. Its
worst arm orientation error is `0.772` degrees. CM5's intermediate hand
attachment previously differed by `5.391/1.238` degrees. The normal
`FUN_8c1cf0a0` path proves that controller 17/21's first component is applied
as a local-X rotation between elbow output `+0x390` and visible-hand output
`+0x408`; its other two components belong only to the later `+0x508` terminal.
After porting that split, CM5 hand orientation errors are below `0.00005`
degrees. The visible arm chain is now native-conformant in the retained frames.

The two renderer outputs after the visible hands are no longer anonymous.
Native MDC7 preorder and controller pointers bind signed MT7 nodes `0xffbf`
and `0xffbe` to the two slot `+0x508` attachment-terminal matrices. Static
analysis of `FUN_8c1cd380` also proves that rest-record fields `+0x74` and
`+0x9c` are copied into controller slot `+0x484` as explicit terminal lengths;
they are not inferred from the difference between solver reach and visible-arm
length. The ordinary branch places each terminal along the visible hand's
local negative-X axis and composes reflected browser rotation as
`Y(-rz) * Z(-ry) * X(rx)` relative to the lower-arm matrix. An exhaustive
six-permutation comparison across retained native frames selects that YZX
order with about `0.0000054` degrees maximum residual, while the alternatives
miss by 6–17 degrees. Transition mode 1 instead consumes its independent
direction/up data at slot `+0x548`; promoting both terminal paths to refreshed
strict corpus gates remains active work.

The same solver has a second, transition-specific orientation mode. When slot
field `+0x00` is `1`, `FUN_8c1cf0a0` does not use the ordinary compact Z/Y/X
path for its root, basis, or terminal. It calls `FUN_8c1d53a0` on direction/up
pairs at slot offsets `+0xe0`, `+0x218`, and `+0x3d0`. That helper rotates the
stored source-forward vector toward the target-forward vector by
`currentFrame / blendEndFrame`, linearly blends the two up vectors, and
rebuilds an orthonormal basis. The angle is converted to a 16-bit turn before
the blend and truncated again afterward; retaining both Dreamcast truncations
is required for exact agreement.

The exact `JN1_L / 0xf086` captured-input fixture exercises this branch while slot 4 runs
independent motion `0x80c3` at frame `9/12`. The captured browser-space arm
root quaternion matches native to floating-point precision. Across the whole
captured-input frame the worst orientation error is `0.006` degrees, worst bend error is
`0.010` degrees, and the worst point is the separately aimed head at
`0.006037` model units. This removes the former `5.368`-degree hand residual
without a fitted arm rotation.

### Proven lower-body roles

Slot 0 is not five independently rotated visible nodes. Synchronized runtime
matrices and the two mirrored SH-4 branches establish this ownership:

| Controller | Native role | MT7 result |
| ---: | --- | --- |
| 0 | pelvis rotation | `0x0e` |
| 1 | shared approximately 90-degree leg-root basis | both leg solvers |
| 2 | first leg's animated bend-plane basis | `0x10 -> 0x11` |
| 3 | first foot-position target | solved `0x10 -> 0x11 -> 0x12` leg |
| 4 | first terminal foot control | `0x12` |
| 5 | second leg's animated bend-plane basis | `0x15 -> 0x16` |
| 6 | second foot-position target | solved `0x15 -> 0x16 -> 0x17` leg |
| 7 | second terminal foot control | `0x17` |

The knee output matrices at controller offsets `+0x660` and `+0xb50` rotate
on one local axis. The previous browser binding instead applied all three axes
of controller 4/7 directly to those knees. That was a controller-ownership
error, not a coordinate-conversion problem. The native leg path uses the
opposite two-bone bend subtype from the arm path, matching the existing
Shenmue I humanoid rig.

The synchronized `0xf086` series also establishes the leg target coordinate
composition. In native actor space, each foot position is
`[targetX - rootX, targetY, targetZ - rootZ]`. Y is absolute from the actor's
ground anchor; it is not relative to compact root Y or to the current hip.
Browser conversion reflects X. The former uniform `0.8339` limb-target factor
was exactly the reciprocal of the incorrectly applied `1.19921875`
sequence-header value; it was a compensating browser workaround, not native
behavior, and has been removed.

**Proven from Dreamcast SH-4:** slot-zero function `0x8c1d14e0` builds each
leg with the same two-bone triangle sequence:

- output matrices are `+0x620/+0x660/+0x760` for the first leg and
  `+0xb10/+0xb50/+0xc50` for the second;
- `0x8c1e0290` measures hip-to-target distance;
- `0x8c1ce280` applies the law of cosines to the two authored segment lengths
  and that distance, constraining only the mathematical cosine domain to
  `[-1, 1]`;
- `0x8c1e0020` applies the resulting sine/cosine rotation at the hip and then
  the opposite rotation at the knee.

The target-alignment helper at `0x8c1ce120` does not choose a bend plane from
the rendered thigh alone. It first expresses the foot target in the current
solver basis. Controller 1 supplies the common near-90-degree leg-root basis,
then controllers 2 and 5 animate the first and second leg bases before their
respective triangle solves. Those two controls had previously been ignored.
Their captured Y values match the former orientation residual directly: in
the retained CM5 frame they are `8.13` and `8.24` degrees, while the browser's
thigh/shin errors were `8.70` and `8.24` degrees. Applying them through the
same fixed-turn Z/Y/X matrix path reduces ordinary JN1 thigh/shin orientation
errors below `0.3` degrees (many are below `0.01` degrees). Frame 31 remains a
mixed-slot phase outlier rather than defining the ordinary basis behavior.

Foot orientation has separate ownership. At entry, `0x8c1d14e0` calls
`0x8c1e5fe0 -> 0x8c1dfa30` to save its incoming actor matrix. After each
two-bone solve it calls `0x8c1e64c0 -> 0x8c1dfb20`, restoring that saved 3x3
before applying controller 4/7's terminal Z/Y/X channels and writing
`+0x760/+0xc50`. A foot therefore remains actor-relative; it must not inherit
the shin orientation and then receive the terminal rotation locally. The
captured native foot matrices independently confirm this composition: all
ordinary JN1 frames are within `0.2` degrees, the mixed-phase frame is within
`0.59` degrees, and CM5 is within `0.022` degrees.

The captured first-leg lengths at `+0x554/+0x594` are `0.35694` and
`0.40565`. Across all ten retained frames, those lengths and the target stored
at `+0x5d4` reproduce the native knee angle directly from the law of cosines;
for example frame 31 gives `68.871` degrees mathematically and `68.860`
degrees in the native matrices. This is the game's solver, not a browser IK
shape selected by eye.

The paired render chains are mirrored: controller 3 drives the authored
`0x10` chain and controller 6 drives `0x15`, matching S1's paired walk-IK
swap. Attaching either target to the same-numbered render branch makes it
reach across the pelvis. Combining that error with a static-bind target anchor
pushes the requested distance beyond the thigh/shin length, producing the
fully extended result also implied by the native law-of-cosines domain.

The pelvis foundation is part of the same calculation. Slot zero evaluates
the compact root-position curves as absolute values, aligns them to the
actor's authored ground reference, applies the pelvis rotation, and only then
translates along the authored rest vector at controller-relative `+0x354`
(overall controller `+0x35c`). For `JN1_L` that vector has length `0.17`.
Babylon normally leaves a node's own translation unrotated, so the browser
must explicitly rotate this retained MT7 vector after composing the pelvis
orientation. This recovers the native millimeter-scale horizontal pelvis sway;
it is not a separately fitted locomotion offset.

With that exact order, the ten-frame pelvis-position error falls from a
`0.012923` maximum / `0.010898` mean to `0.000643` / `0.000176`. Ordinary
captured knee-bend errors are below `0.063` degrees. Frame 31 remains a
`2.77`-degree outlier and is retained as a capture/evaluator-timing anomaly,
consistent with its independently observed pelvis and target residuals.

The locomotion families are authored against different source-rig leg
lengths. Synchronized matrices measure total thigh-plus-shin reach as
`0.722473` for the actor captured using `0xf03e`, `0.762590` for the actor
captured using `0xf086`, and only `0.473027` for the actor captured using
`0xf09e`. Those measurements belong to the rendered actors in the captures;
they must not be treated as universal properties of a motion ID.

The static MT7 hierarchy does preserve model-specific proportions. For
example, both child bodies `OK6_L` and `CM3_L` contain `0.47302`-length leg
chains, while adult `ST4_L` and `JN1_L` contain approximately `0.76259`-length
chains. The source reach comes from the active actor's native rest record:
`FUN_8c1cd380` copies its authored upper- and lower-leg lengths into the
compact controller. A motion's farthest pelvis-relative target is not a safe
substitute because many clips never fully extend a leg.

The browser scales each compact foot target by the ratio between that
rest-profile reach and the loaded MT7 chain. This is body-profile retargeting
from authored data, not an actor-specific height correction. It prevents a
short body from clamping both knees straight when a longer-stride family is
selected and prevents short-rig targets from producing a permanent deep squat
on a taller body.

The absolute target remains relative to the actor ground anchor. A retained
`CM5_L` / `0xf09e` frame proved that the triangle must not blindly begin at
the loaded static hierarchy's apparent hip. Both native `f09e` controllers in
that frame place their first solved leg root at exactly `0.5555267` above the
actor anchor, while the old browser path placed CM5's root at `0.3951809`.

SH-4 function `0x8c1cd380` explains the discrepancy. It selects one of 18
native rest-rig records, and instruction `0x8c1cd714` copies record `+0xa0`
to controller `+0x35c`. For the SEI family used by both captured short rigs,
that value is `0.102`; CM5's standalone preserve-world node sum is instead
`-0.024334`. Adjacent record fields hold the paired hip offsets, torso length,
and limb lengths used by the procedural solvers.

The exact model-to-record selection was later recovered from the SH-4 caller
chain rather than inferred from those dimensions. Caller `0x0c0f6cc0` asks
`0x0c0f92c0` for the selector before initializing the controller at
`0x0c0ee5c0`. The helper at `0x0c0b8ba0` reads the model object's family word
at object-data `+0x14`; `0x0c0f92c0` indexes the 97-byte table at
`0x8c24f05c` and passes the resulting record number to `FUN_8c1cd380`. The
family word is encoded by the MT7 root as `(root.id & 0xff) - 1`. The table is
three repeated 32-entry banks mapping records 0 through 17, with unused bank
tails saturated to record 17 and a final special entry selecting record 4.

The browser now follows that authored root/table selector exactly. Limb
dimensions remain useful diagnostics, but they are not allowed to choose a
profile. This distinction is observable: `JUK_L` is dimensionally nearer SYE,
yet its root `0x7008`, native controller selector `7`, and native segment
lengths all identify SAM. Using the old nearest-dimension rule therefore put a
real character into the wrong native skeleton family.

With the SEI rest record, CM5 pelvis error at native frame 21 falls from
`0.126328` to `0.0000113`, torso point error from `0.035996` to `0.0000024`,
and knee-bend errors from `84.12/64.60` degrees to `4.74/1.25` degrees. Using
the same record's terminal solver lengths reduces its arm bend errors from
`32.74/6.53` degrees to `0.0025/0.0004` degrees; shoulder and elbow orientation
errors are below `0.0002` degrees. Applying the paired root/shoulder fields
reduces CM5's worst arm point error from `0.115217` to `0.000015`; ordinary
JN1 frames are within `0.0014` model units. Applying the recovered first
terminal channel also reduces both visible-hand orientation errors below
`0.00005` degrees. The unrepresented `+0x508` attachment terminal remains
separate from the visible shoulder/elbow/hand chain.
Scheduled S2 NPCs do not raycast their feet against the pier:
route Y supplies both actor and foot-target ground, and the post-pose grounding
correction cancels algebraically from this animated path.

### How limb bend angles are measured

Reported knee and elbow angles are measured from the resulting world-space
joint positions after the browser pose has been applied; they are not guessed
from one compact curve channel. For a root joint `A`, middle joint `B`, and
terminal joint `C`, the measurement is:

```text
u = normalize(B - A)
v = normalize(C - B)
bendDegrees = acos(clamp(dot(u, v), -1, 1)) * 180 / pi
```

For a leg, `A/B/C` are hip, knee, and foot. For an arm they are shoulder,
elbow, and hand. Under this convention `0°` is a straight limb, `90°` is a
right-angle bend, and a value approaching `180°` is folded back on itself.
The dot-product clamp only removes floating-point overshoot outside the legal
`acos` range; it does not alter the rendered pose.

Browser ranges are normally measured at every integer frame in a decoded
clip. Synchronized browser/native comparisons use the exact compact sample
frames read from emulator RAM. Native angles use the same calculation on the
translations from the renderer-consumed Dreamcast matrices. Consequently,
the two measurements compare final joint geometry rather than unlike Euler
channels.

## Why the first browser implementation broke

The initial implementation decoded the compact curves correctly but assigned
curve triplet N directly to the Nth selected MT7 node. A later revision joined
some authored node IDs to those same flat indices and recreated a guessed
controller hierarchy. Both approaches retain the same false premise.

The visible consequences match that error:

- rotations appear on unrelated body parts;
- heads disappear or detach;
- some actors remain rigid because their selected render family has fewer
  nodes than the guessed threshold;
- repeated/terminal nodes receive independent rotations they do not own;
- model families with different MT7 branch order fail differently.

A second independent error applied compact root translation to MT7 torso node
`0x01`. That moved the torso, head, and arms without moving the pelvis or legs.
Root translation belongs above the entire render hierarchy; scheduled routes
already provide horizontal travel, so their motion playback uses only the
whole-character vertical component.

The compact `.MOT` decoder itself is not the primary cause of those symptoms.

## Emulator versus static analysis

The Dreamcast emulator is valuable for:

- identifying which controllers and motions are active in a real scene;
- observing final matrices and their model-specific bindings;
- aligning writes by SH-4 cycle and caller;
- validating the result of a port against native frames.

Static Dreamcast/Xbox analysis is preferable for:

- recovering the complete solver control flow;
- identifying table layouts and selector rules;
- proving behavior across paths not exercised by one save state;
- avoiding a manual emulator recording for every character or animation.

The Xbox executable is a useful static reference because it retains readable
versions of many selector and controller functions. It does not replace the
Dreamcast runtime evidence, and no extracted executable needs to be run.

## Automated native conformance

The browser animation path can be checked without launching Flycast or
visually inspecting `/play`:

```bash
npm run analyze:shenmue2-animation
npm run test:s2-animation
```

The conformance set now binds each captured controller through the live native
actor record to an exact actor code. Ordinary actors resolve through
HUMANS.IDX/AFS; separately audited CLMD records resolve global story actors.
The main series contains ten synchronized `JN5_L / 0xf086`
Dreamcast frames, plus exact `CCA_L`, `BA7_L`, `CF2_L`, `SYB_L`, and `OM2_L`
fixtures. Older research notes below call JN1 and CM5 the captured actors;
those were same-profile representative browser rigs used before exact runtime
actor binding was decoded, not the models actually rendered in those captures.
Each frame retains
the five native motion IDs, five native sample frames, actor-root matrix, and
all 19 renderer-consumed solver matrices.
The harness loads the real CHRM and MOT files through the same loaders and pose
functions used by `/play`, applies all five slots in native order, and compares
actor-relative joint positions and orientations, two-bone bend angles, and
segment lengths.

The foundation comparison is intentionally separate from the appendage
comparison. It treats controller `+0x08` as the universal actor/ground anchor
and `+0x3e0` as the anatomical pelvis output. Browser actors are grounded the
same way as `/play`, compact horizontal locomotion is disabled because the
scheduled actor root already owns travel, and pelvis position/orientation are
measured relative to the actor root. Older versions of this harness subtracted
the pelvis before every point comparison and enabled compact horizontal travel;
that made pelvis error zero by definition and understated the remaining leg
solver error.

`native-foundation.json` adds 106 synchronized Dreamcast samples across 10
motions and 19 capture-local controller instances. Those samples establish two
portable invariants without needing to identify a CHRM visually:

- `+0x08` owns horizontal travel; native pelvis outputs stay within 3.2 cm of
  its horizontal axis across the retained set.
- compact root Y drives pelvis height plus a stable per-rig rest offset. For a
  given captured controller/motion pair, that offset varies by less than 1.2
  cm. It is therefore incorrect to force every body family's pelvis directly
  to compact root Y and erase its authored rest offset.

The exact `JN5_L` walk keeps horizontal root drift exactly zero, places the
pelvis within `0.000012` model units of native, and keeps every measured
orientation within `0.038` degrees over all ten frames. Its worst limb bend
error is `0.025` degrees. Correcting the compact reader's final implicit key
from header duration to `duration - 1` removed the former frame-31 anomaly;
the duration is a frame count, so a 34-frame sequence ends at frame 33.

`test:s2-animation` runs each strict fixture twice and requires every fixture
to satisfy the native-equivalence thresholds. The first pass supplies the
captured post-evaluation 69-curve values and therefore isolates the procedural
solver. The second (`--raw-motion`) samples the repository's MOT decoder and
applies only the captured runtime scale/base affine state. The two paths agree
to floating-point precision in the retained JN5 locomotion and OM2 action
series, so a solver pass can no longer conceal a MOT timing/decoder mismatch.
`test:s2-animation:native` enforces the tighter native-equivalence limits.

The broader coverage boundary is generated rather than estimated:

```bash
npm run analyze:shenmue2-animation-coverage
```

`tools/evidence/shenmue2-animation-coverage.json` joins the extracted S2 crowd
records, the complete Disc 1 HUMANS.IDX/AFS inventory, retained native
controller reports, and strict matrix fixtures. HUMANS contains 776 actor-code
bindings and 715 distinct models; 689 classify into all 16 recovered native
rest profiles, while 26 non-humanoid or still-unclassified assets stay visible
as such. The current browser asset set contains 120 character models; the
crowd subset contains 102 models used by 482 instances. It reduces to six rest
profiles and six default locomotion
profile/motion combinations after using the native MT7 body-family selector,
instead of guessing the motion family from an actor-code suffix.

The strict corpus currently has 37 fixtures over exact ARI/CCA and
ARI/CC3, KMN/BA7,
KMN/JJ9, KMN/JJA, KMN/ZKN, SAM/JN1, SAM/JN4, SAM/JN5, SAM/JN8, SAM/HOI,
SAM/ST2, SAM/XHO, SEI/CF2, SEI/CM5, SEI/SYB, SEI/OK1, LLY/OM2, MEI/RRN,
SYE/SYE, and RYO/RYO_M
actors. Five global locomotion IDs (`0xf03e`, `0xf060`, `0xf078`, `0xf086`,
and `0xf09e`) are represented.
OM2 adds a five-frame `0xe11b` NPC-table action, OK1 adds ten `0xe26a`
frames, and CC3 adds six independently layered `0xe101 + 0x80c4` frames.
Global actions `0xf061` and `0xf0e6` add strict KMN and two-model SEI
coverage. The OM2 and OK1 action series retain non-identity runtime curve
state. OM2 matches native
within `0.000040` model units and `0.010` degrees of limb bend; OK1's formerly
large error falls to `0.000059` model units and `0.012` degrees of limb bend
once native `sample * scale + base` state and the complete pelvis basis are
applied. A separate blended CCA frame proves the same
path for locomotion. Raw-MOT passes independently reconstruct the 69 live
descriptor values within floating-point tolerance, so captured values cannot
silently hide a decoder mismatch.

Those fixtures prove ten of the sixteen native rest-profile families: ARI,
BBY, KMN, LLY, MEI, RYO, SAM, SEI, SYE, and WON. The generated
`nativeRestProfileCoverage` table keeps the other six explicit instead of treating the current crowd subset as
the whole game. All 120 available CHRM files hash-identically to their disc
inventories and now cover all sixteen profiles. CHA/CHA, HGN/HGN, JOY/JOY,
SIN/SIN, TGY/TGY, and YUA/YUA still need strict native fixtures.
`SYE_M` is the exact HUMANS model for actor `SYE_`; its root-family selector
maps to SYE independently of the similarly dimensioned `JUK_L`, which SH-4
proves belongs to SAM.

Direct captures are also reused across compatible models in a separate,
explicitly bounded family-conformance corpus:

```bash
npm run analyze:shenmue2-animation-family
npm run test:s2-animation:family
```

`tools/evidence/shenmue2-animation-family-conformance.json` replays every
strict synchronized fixture against every bundled CHRM assigned to the same
SH-4 rest-record family. It currently evaluates 744 model/fixture pairs, twice
each (captured post-evaluation curves and independently decoded MOT curves),
covering 114 models, 37 native references, 27 primary motions, and five motion
categories with no failures. This turns a correction that works for one
captured mesh into a measurable whole-family claim.

The sweep exposed two omitted parts of `FUN_8c1cd380`. Rest-record
`+0xc4/+0xc8` and `+0xec/+0xf0` are separate upper/lower lengths copied into
the two leg solvers. The browser formerly left each CHRM variant's standalone
second-leg translation in place; `PG3_L` therefore retained a shin 0.00145
units longer than the native ARI solver and missed knee bend by 2.43 degrees.
Both leg pairs now use the original record values. Native scalar limb lengths
also define straight local-X solver segments, so incidental CHRM Y/Z offsets
are no longer folded into leg or arm reach. This removed the remaining
systemic family failures without a model exception or tolerance change.

Family reuse now gates head translation as well as every orientation, point,
pelvis foundation, limb bend, and segment length. The earlier exclusion was
based on differing standalone MDC7 head attachment lengths, but SH-4
`FUN_8c1d4020` proves that those lengths are not the animated solver input. It
first translates by the selected rest record's `+0x14` neck segment, applies
controller 11, and then translates by rest-record `+0x28`. The browser now
preserves this operation order. A turned neck therefore changes the combined
torso-to-head displacement even though both rest lengths remain fixed. All 744
model/fixture observations pass with head translation included; direct captures
are still required for unrepresented families rather than promoting them by
resemblance.

`A06_E` proves a separate reduced-renderer case. Its exact native CHRM omits
the invisible `0x09` and `0x04` arm-root nodes, while two synchronized native
controllers still compute their matrices at `+0x1690/+0x1c10` and bind all 17
visible outputs through MDC7. The browser materializes only those two proven
non-rendering solver nodes, and fixture construction reads only their matrices
directly from synchronized controller RAM. The resulting exact
`A06_E / 0x80eb` fixture passes all 19 outputs. Because the omitted renderer
records are model topology rather than a KMN-family invariant, that fixture is
replayed only against A06_E. The reduced model is still replayed against all
six full-renderer KMN references after preserving the authored-root/external-
actor scale product. All seven A06_E observations pass in both curve modes;
no output or tolerance is excluded.

Several story-character CHRM hierarchies are not ordinary pedestrian rigs.
CHA, REN, SIN, YUA, and RYO omit the usual `0xffbd` head render node, while JOY
also omits the otherwise standard `0x04` and `0x09` arm-root render nodes. Ryo's
live MDC7 records follow the exact `RYO_M` preorder `0x04, 0x09, 0x01, 0x46`;
the fourth record binds controller matrix `+0x1508`. This proves that a direct
`0x46` child of torso `0x01` is controller 11's head output when `0xffbd` is
absent. The browser implements that hierarchy-based alias. Replacement outputs
without equivalent native binding evidence remain unresolved.

The shared native acceptance limits are deliberately close to the observed
data: `0.000025` pelvis-position units, `0.3` degrees of pelvis orientation,
`0.01` point units, `1.5` degrees of joint orientation, `0.5` degrees of limb
bend, and `0.0001` units of segment length. These are regression gates, not
visual-quality tolerances; no per-model exception, corrective offset, or IK
clamp is allowed to make a fixture pass.

The exact `JN1_L / 0xf086 + 0x80c3` layered frame is now a strict fixture in
both captured-input and raw-MOT passes. Native slot mode 1 blends stored
direction/up bases while the old browser path always ran the ordinary
compact-angle branch. Capturing the three mode-1 structures and porting
`FUN_8c1d53a0` resolves that procedural branch.

Its remaining raw-MOT mismatch exposed a separate native layer-transition
stage. `0x80c3` contains a constant controller-20 target, but the live
descriptor does not jump to it. SH-4 `FUN_8c1d49a0` rewrites the three target
curves into a twelve-frame Hermite segment. For the synchronized JN1 frame,
the layer starts from primary motion `0xf086` at frame 17, retains one half of
that curve's outgoing velocity, and reaches the `0x80c3` value at frame 12
with zero terminal velocity. The captured X descriptor therefore starts at
`-0.0266724` with tangent `-0.442696`, rather than immediately taking the raw
target `0.00413513`. Reconstructing that descriptor from the decoded source
motion removes the former `0.014191` hand-position and `1.765` degree
orientation errors. Both paths now finish at `0.006037` point units and
`0.006` degrees, with the point maximum belonging to the separately aimed
head. Normal browser playback uses the same twelve-frame, half-source-velocity
transition when an independently scripted arm layer is installed; this is not
a fixture-only correction or a widened tolerance.

The former exact-model discrepancies `HOI_L / 0x8035` and `ST2_L / 0xe0f7`
are strict fixtures. SH-4 `FUN_8c1d14e0` proves that the
renderer-consumed pelvis output is not controller 0 plus an MT7 bind pose: it
saves controller 0's intermediate, then applies controller 1's compact Z/Y/X
rotation before writing `+0x3d8`. Controller 1 contains the animated pelvis
basis. Porting that order removed the former 5--7.5 degree pelvis error and the
downstream leg-bend error without a model exception or clamp.

Expanding `XHO_L / 0xe381` across both observed controller allocations exposed
three additional synchronized frames, producing an 11-frame fixture rather
than the old narrower eight-frame fixture.
Ten frames have at most `0.0000131` pelvis-position error. The newly captured
startup frame initially appeared to have `0.0002324`, almost entirely
horizontal; every other point,
orientation, limb bend, and segment length remains within `0.000058`, `0.0062`
degrees, `0.0121` degrees, and `0.000006`. Its captured `+0x48` matrix proves
that compact horizontal root motion is canceled as expected, while the two
world-space float matrices retain a small cancellation residual at large world
coordinates. Foundation comparison now removes exactly the X/Z residue stored
in the captured pre-controller-1 `+0x230` intermediate, preserves its Y,
reports the discarded magnitude, and continues to gate browser horizontal
drift separately. The resulting maximum pelvis-position error is `0.0000131`.
Both curve paths pass the unchanged native threshold, so the full 11-frame
fixture is strict; no frame is excluded and no tolerance is widened.

The formerly missing outdoor `MEI / 0xf07e` combination is now strict through
exact actor `04F_ / RRN_L`. Fourteen synchronized frames span two independent
native controller allocations. Slot 4 runs `0x80c4` independently of the four
`0xf07e` slots; both captured-value and decoded-MOT paths reproduce all 19
renderer matrices with maxima of `0.000443` position, `0.006` degrees
orientation, and `0.010` degrees bend error. The model was never inferred from
the shared motion: the live actor record proves `04F_`, HUMANS binds that code
to hash-verified `RRN_L`, and its native segment lengths classify as MEI.

RRN_L also proves a detail of native layer installation that the first
transition capture could not distinguish. The target endpoint stored in each
temporary Hermite descriptor is the target MOT sample after that target
curve's live affine: `sample * scale + base`. Its slot-4 scale is
`0.9880495071411133`, so the first raw target value `0.016082763671875`
becomes the captured endpoint `0.015890566632151604`. Fixture generation now
validates that native affine explicitly, and a focused regression requires a
non-identity example so raw target samples cannot accidentally pass.

The remaining ARI/KMN/SEI residual is not a universal capture-phase lag.
Sweeping every slot cursor by `-1.5..+1.5` frames fails to remove it, while a
shift of only `0.05` frame makes the otherwise exact JN5 series roughly twenty
times worse. SH-4 `FUN_8c1cdee0` independently confirms the cubic Hermite
basis and duration-scaled incoming/outgoing tangents used by the browser, and
the native global linear-interpolation flag is zero in the retained captures.
The next investigation therefore remains in the per-slot solver composition
or an uncaptured native input, not a guessed global timing correction.

The retained binding reports contain 737 distinct native controller
observations over 27 primary motion IDs. Ordinary actor records preserve their
HUMANS code beside duplicate controller pointers, while CLMD story records use
a separate proven pointer relation. In the retained Ryo record, `CLMD` is at
`0x8c7815dc`, the compact-controller pointer is at `+0x2c`, and actor code
`RYO_` is at `+0x4c`. The exact global `RYO_M` model hashes to
`feb7c61ce446fae3ce2fac431f7483000eca04be12bb187276c22472ee44116f`.
Fixture generation requires this actor evidence; a primary motion match alone
never identifies a model.

Renderer binding no longer assumes an MDC7 model allocation lies within 256
KiB before its controller. The exact `CC9_L / 0xe0df` save-state controller has
all 19 model records roughly 700 KiB earlier in RAM. The extractor now scans
RAM-resident MDC7 boundaries and accepts only records whose final pointer
addresses an affine matrix inside the particular controller. That pointer
invariant recovers all 19 bindings without widening a proximity guess.

New fixtures can be generated from retained binding reports and RAM captures:

```bash
node tools/animation/build_shenmue2_animation_fixture.mjs \
  --bindings-dir .disc-work --controller 0x8c8082e8 \
  --motion-id 0xf086 \
  --model play/assets/shenmue2-characters/JN5_L.CHRM \
  --motion play/assets/shenmue2-motion/MOTION.MOT \
  --out tests/fixtures/shenmue2-animation/f086-jn5-native.json
```

The cross-actor root/pelvis evidence fixture can be rebuilt separately:

```bash
npm run capture:s2-animation-foundation
```

The controller address is capture-local provenance, not a reusable runtime
address. Fixture generation can pin the native actor code with `--actor-code`;
it then joins that exact actor/model/motion identity across every observed RAM
allocation and records all contributing controller addresses as provenance.
This expands retained evidence after a scene reload instead of silently
splitting one actor into address-shaped subsets. Fixture generation also reads
each slot's actual motion and phase, avoiding false solver failures when an arm
slot is independently animated.

The retained-capture corpus can be refreshed without manually choosing actors:

```bash
npm run refresh:shenmue2-animation-corpus
```

The refresh scans every retained `captures/pvr/**/ram.bin`, generates any
missing binding reports, accepts only candidates with one exact live actor and
one hash-verified native model, builds both captured-value and raw-MOT
conformance inputs, and promotes a fixture to the strict directory only when
both paths pass. Failures are retained under
`tests/fixtures/shenmue2-animation/discrepancies/`; they are evidence to solve,
not silently discarded captures. Every retained discrepancy is rebuilt from
the current synchronized captures before it is checked again. This matters
when a newly decoded native solver input changes fixture construction itself:
rechecking an old JSON would otherwise leave a solved mismatch stale. The
current complete refresh expanded the inventory to 737 native controller
observations and added strict `CC3_L / 0xe101` coverage.
It then rebuilds and strictly checks the family-conformance corpus, so a new
fixture automatically expands compatible-model coverage and a runtime change
cannot leave the generated whole-cast report stale.

Only completed synchronized PVR frames can supply pose-conformance matrices.
Offline save-state RAM remains useful for discovering controllers and models,
but saving can stop between a solver-input update and its renderer-matrix
write. Coverage reports those observations separately and fixture generation
rejects them rather than treating two scheduler phases as one pose.

That refresh also exposed three exact one-frame solver discrepancies. The
shared cause was the former browser fallback that inferred source leg reach
from the farthest foot target in each clip. A motion that never fully extends
its leg cannot reveal the skeleton's reach: `0xf0e6` was therefore treated as
a `0.631225`-unit source rig even though both exact SEI actors and their native
solver matrices prove a `0.47301`-unit leg. SH-4 `FUN_8c1cd380` instead copies
the active body rest record's two authored leg lengths. Using those decoded
profile values reduces the former `0.112698` maximum point error to
`0.001513` or less. It also reduces JJA/`0xf061` from `0.006929` knee position
and `2.337` degrees of bend to `0.000241` and `0.081` degrees. All three pass
both captured-input and raw-MOT gates and are now strict fixtures; no inferred
reach, model exception, clamp, or widened threshold remains.

The CLMD binding also turns the retained Ryo captures into exact-model
evidence. `RYO_M / 0xf006` passes both conformance paths with `0.000148`
maximum point error, `0.002` degrees maximum orientation error, and `0.005`
degrees maximum bend error. Ryo's player structure embeds the shared compact
controller at `+0x500`. When its two terrain-adjustment fields are active, the
structure supplies post-ground-query, root-relative foot targets to the shared
slot-zero triangle solver. Capturing those inputs removes the apparent
75-degree `0xf002` knee mismatch without changing ordinary NPC IK or inventing
a foot clamp. Recovering controller 12's current-actor callback removes the
remaining `1.912`-degree head residual. Across 32 synchronized frames,
`RYO_M / 0xf002` now has `0.000163` maximum point error, `0.010` degrees
maximum orientation error, and `0.013` degrees maximum bend error in both
captured-input and raw-MOT passes, so it is a strict fixture.

The same controller-12 callback also resolves all eight synchronized
`CC9_L / 0xe0df` frames. Their previously unexplained dynamically aimed head
residual falls from `11.870` degrees to `0.016` degrees; the complete pose has
`0.000092` maximum point error and `0.005` degrees maximum bend error. This
promoted that head-specific discrepancy without a model correction or widened
threshold. The expanded corpus now contains 37 strict fixtures across ten
rest-record families. It covers 114 bundled models through 744 model/fixture
observations, with both captured-value and raw-MOT modes passing. One exact
native discrepancy remains explicit: `JJ3_L / 0xe0e5` reproduces pelvis and
limbs but has a `21.687`-degree head-orientation residual. Its former
`0.020724` head-point error is now `0.000021`: SH-4 proved that the head uses
two rest-record translations with controller 11 between them, rather than the
CHRM node's single static attachment. It remains under `discrepancies/`, not
admitted by a wider orientation gate. The
rejected mixed-phase callback frames remain named in fixture provenance, and
offline save-state snapshots remain discovery-only rather than being admitted
to pose conformance.

The JJ3 frame installs controller-12 callback `0x8c0e7a40`, but its retained
post-render RAM does not contain the callback-time matrix consumed by
`FUN_8c1d53a0`. Static SH-4 proves that this callback reads a render-time
current-controller global, selects the slot-2 mode, saves the live matrix's
direction/up columns, and temporarily changes the shared interpolation time
before returning to the head solver. Treating the final RAM values as though
they were all callback-time values does not reproduce JJ3, and disabling the
callback increases its orientation residual to `37.485` degrees. Neither is
accepted as a correction.

`tools/emulator/capture_shenmue2_head_callback.py` now traces the natural callback entry,
the exact source-matrix save at `0x8c0e7b5a`, and the final head-output save at
`0x8c1d44f4` through Flycast's GDB stub. It also resolves the compact controller
back to the native actor record. Run it through the isolated callback wrapper:

```bash
FLYCAST_S2_VALIDATION_CALLBACK_KIND=head \
FLYCAST_S2_VALIDATION_CAPTURE_COUNT=20 \
tools/emulator/run_shenmue2_pelvis_callback_capture.sh
```

The displayed-slot-2 save naturally traced actor `13G_`. At callback entry its
blend amount was `0.1`; the captured source matrix, controller-13 aim vector,
torso matrix, and final head output reproduce the native head orientation to
floating-point precision. This proves the decoded direction/up solver and
composition order independently of a post-render fixture. It also proves why
JJ3 remains unresolved: its one retained synchronized frame has the final head
output and later controller values, but not the callback-time source matrix and
blend state needed to determine which native branch produced it.

Disc 2 Fortune's Pier capture adds exact `TB1_ / TB1_L / 0x803b` evidence:
seven synchronized frames pass in both evaluation modes. `TB1_L` was extracted
directly from HUMANS row 681; another SAM-family model was not substituted.
The native-acquisition bridge also produced fourteen synchronized
`04F_ / RRN_L / 0xf07e` frames, promoting the previously missing MEI rest
family. They span two independently allocated native controllers, proving the
fixture is joined by exact actor/model/motion identity rather than a reused
heap address. Those frames prove that the slot-four transition installer bakes each
target descriptor's native affine (`sample * scale + base`) into its endpoint.
Retaining that captured affine allows the independently layered transition to
pass without a fitted offset or threshold change.

The same bridge acquired six synchronized `JUK_ / JUK_L / 0x8036` frames.
They pass with maximum point error `0.000059`, orientation error `0.008`
degrees, and bend error `0.009` degrees in the independent raw-MOT path. More
importantly, the live controller's rest selector and segment lengths proved
that JUK is SAM, providing the counterexample that exposed the old
nearest-dimensions classification as incorrect.

Native residency acquisition for `WON_` produced twelve synchronized
`WON_ / WON_M / 0xe0e3` frames across two isolated runs. The captures also
contained six exact live `MII_ / MII_L / 0xe0e3` frames, resolving the BBY
family whose static scene location had previously been unknown. WON's raw-MOT
path stays within `0.000038` model units and `0.004` degrees; MII stays within
`0.000061` model units, `0.008` degrees of orientation, and `0.015` degrees of
bend. Both are strict exact-model fixtures, not family substitutions.

The same isolated residency bridge acquired four synchronized
`SYE_ / SYE_M / 0xe101` frames from the exact Disc 1 WT00 scheduler record.
Captured evaluator values reproduce every measured native matrix exactly. The
independent `NPC_TBL.MOT` path remains within `0.000051` model units and
`0.005` degrees, promoting the tenth rest family without a runtime change,
threshold adjustment, or model substitution.

A later pass through the same exact native actor acquired four synchronized
`SYE_ / SYE_M / 0xf060` walking frames. Captured evaluator values reproduce
the native matrices to floating-point precision; independently decoded MOT
values remain within `0.000031` model units and `0.002` degrees. This gives
the SYE body family a native locomotion reference in addition to its earlier
`0xe101` action reference, without forcing a motion into the emulator or
substituting another model.

`npm run refresh:shenmue2-animation-corpus` now performs refreshes in a staging
transaction. It recursively merges accumulated binding-report directories,
adds newly discovered actor/model/motion fixtures while leaving established
fixtures stable, and rebuilds the entire historical set only when passed
`--rebuild-all`. It preserves each fixture's regression limits verbatim and
runs captured, raw-MOT, and family gates before replacing the published corpus.
A failed extraction, fixture build, or family replay leaves
fixtures and generated evidence byte-for-byte unchanged. A second family
check after publication catches stale staging paths and triggers rollback.

## Remaining work

The remaining exact-family capture search is now deterministic. Run:

```bash
npm run analyze:shenmue2-animation-capture-targets
```

This statically decompresses the extracted Xbox scene resources and searches
for exact native four-byte actor codes. The generated
`tools/evidence/shenmue2-animation-capture-targets.json` currently identifies
four direct event/NPC-container targets and one area-resource target for six
profiles that have an available browser model but no strict fixture. HGN has a
direct `NPC_Q300.BIN` target on scene group 3;
SIN, TGY, and YUA also have exact event targets. JOY has exact Disc 1
area-package references but no direct event or area NPC-container reference.

The CHA (`CHA_`) profile remains deliberately marked location-unresolved. Its
exact actor/model record exists in HUMANS, but no area event or area resource
names the actor. Guessing a game location from character identity would
violate the evidence boundary. Likewise, finding an actor code
inside an event package proves a reference, not that loading that area alone
creates the actor: story predicates can still gate it. Only a synchronized
Dreamcast RAM/render capture can promote one of these targets into a strict
pose fixture.

The emulator bridge now supports exact-code unattended acquisition for these
targets. `npm run capture:shenmue2-animation-actor -- RAM.BIN CODE` derives
capture-local candidate records from a synchronized baseline and waits for the
native duplicated actor/controller link at `+0x08/+0x24`. It validates the
five-slot compact controller and rechecks ownership for every requested PVR
frame. This makes a clock- or story-gated actor measurable without blind
periodic captures, while retaining the rule that a source-code occurrence or
loaded model is not evidence that the actor was live. The watcher was
integration-tested against live Worker's Pier actor `07C_`; it resolved actor
record `0x8cc310c8` to controller `0x8c7d44a8` and produced two completed,
synchronized PowerVR captures. Those addresses document that one validation
run only and are never reused as portable data.

The bridge also accepts a generic synchronized-frame request through
`tools/emulator/request_flycast_frame_capture.sh`. This closes an acquisition gap in the
exact watcher workflow: after a save-state load, clock change, or area reload,
the current RAM can be captured first and used to derive the actor's new heap
addresses. A live integration run produced a complete synchronized
PVR/RAM/VRAM frame and then extracted the current controller bindings from that
RAM. A clock-driven AR02 attempt at 19:00 did not instantiate `04F_`; this is
negative acquisition evidence, not permission to assign another actor or model
to the MEI family. Later synchronized RAM proved that its scheduler record was
already live: its `+0x36c` world position advanced while its model and compact
controller pointers remained null. Xbox routine `0x5bba1` independently proves
that the leading `0x0c` selector records compare the active two-byte area code
and choose the WN/WE/WT/WR program indices. AR02 matches none and therefore
uses program zero. Opcode `0x15` merely clears actor flag `0x20`; it is not an
unresolved story gate. The acquisition blocker is native model residency, not
schedule activation.

Program zero references alternating `AR*` and `WS*` navigation-node namespaces.
At observed null-controller frames, 04F moved through approximately
`(472.7, 100, 448.8)`, `(387.9, 104.1, 426.3)`, and
`(455.1, 99.9, 453.0)`. Repeated Ryo placement at authored `ARXA` and `ARZ0`
nodes still did not promote it. This disproves a simple clock or Euclidean
proximity gate. Subsequent Xbox disassembly resolved the missing layer:
`FUN_00060397`/`FUN_0005b457` reject actor flag mask `0x20800028`,
`FUN_00061e20` performs spatial/ground eligibility, `FUN_0005a925` performs an
additional actor-state eligibility check, and `FUN_0005ed73` drives the
asynchronous resource/controller loader. The mixed route-node namespaces are
still not fully classified, but they are no longer treated as the controller
residency selector.

For unattended profile acquisition, the exact watcher can arm every currently
missing actor alias in one isolated emulator run:

```bash
tools/emulator/run_shenmue2_animation_actor_capture.sh \
  captures/pvr/SAVE-DESCRIPTION/ram.bin --missing-profiles
```

The wrapper copies the selected save state and VMU inputs into a disposable
profile, installs the current capture bridge, derives all candidate records
from the supplied state RAM, and exits after every observed identity has been
captured or the native-frame timeout expires. `FLYCAST_S2_ACTOR_STATE_INDEX`
selects the zero-based state slot. This does not change or attach to the normal
interactive Flycast process. Several actor-code strings may be allocated even
when no matching actor is live; only the duplicated native controller binding
promotes a target into synchronized evidence.

Set `FLYCAST_S2_ACTOR_SURVEY_CAPTURES` to retain ordinary synchronized frames
before the watcher starts; `FLYCAST_S2_ACTOR_SURVEY_SPACING` controls their
native-frame spacing. These frames are useful for recovering a state-specific
clock or story predicate, but are not mislabeled as observations of the target
actor.

For a scheduled actor whose route is live but whose render controller is not
resident, `FLYCAST_S2_ACTOR_ACQUISITION_TASK` may name the capture-local Ryo
task. The bridge copies that task's current position into the target actor and sets
only the native loader eligibility inputs proven by Xbox `FUN_00060397`,
`FUN_0005b457`, `FUN_00061e20`, `FUN_0005a925`, and the global loader state machine: it clears rejection bit
`0x00800000`, sets request/capacity flags `0x01/0x08`, sets actor eligibility
`+0x9c` bit `0x10`, and selects the current-map ground query with region
`0x10000`. Native code still resolves the exact actor's resources, constructs
its controller, selects motions, and produces every solver matrix. This is an
emulator-only acquisition aid and does not alter browser animation behavior or
accept a controller from another identity. The task address must be re-derived
for the selected save state rather than treated as a global constant.

The evidence boundary is intentionally narrow: exact scheduled identity is
still mandatory, and the bridge never writes a model, resource pointer,
controller pointer, motion value, curve, or solver output. Native
`FUN_0005ed73` performs resource lookup, invokes the asynchronous loader, and
builds the compact controller. A fully unattended validation acquired
`04F_ / RRN_L`, primary motion `0xf07e`, and independent slot-4 motion
`0x80c4`, then serialized all three requested synchronized frames. The watcher
waits three native frames after the final request before exiting because PVR
and RAM serialization is asynchronous; immediate exit used to drop the final
capture.

```bash
FLYCAST_S2_ACTOR_ACQUISITION_TASK=0x8c44e120 \
FLYCAST_S2_ACTOR_CAPTURE_COUNT=3 \
FLYCAST_S2_ACTOR_CAPTURE_SPACING=6 \
tools/emulator/run_shenmue2_animation_actor_capture.sh BASELINE/ram.bin 04F_
```

When no virtual X server is installed, the launcher discovers GNOME's exact
per-session Xwayland cookie under `XDG_RUNTIME_DIR`. This permits unattended
captures from non-desktop shells without reusing an unrelated Xauthority file;
it changes only presentation initialization, not emulated state.

The address above documents one save-state allocation only and must never be
treated as portable game data.

- Finish strict corpus promotion for the decoded arm `+0x508` attachment
  terminals, including mode 1's separate `+0x548` direction/up structure.
- Generalize the native MDC7-to-controller binding for every humanoid model
  family, including optional clothing, hair, and terminal nodes.
- Capture one exact active representative for each of the six remaining
  available profiles that lacks a strict native fixture.
- Expand strict matrix fixtures to the still-unrepresented transition,
  area-specific, and story motion paths; global, NPC-shared, NPC-table,
  outdoor-locomotion, and independently layered behavior are represented.
- Extend the same evidence chain to doors and other animated MT7 objects where
  their controller format differs from NPC compact motion.

## Relevant files

```text
src/Shenmue2MotLoader.js
src/Mt7Loader.js
play/characters/ScheduledActorMotionRuntime.js
play/characters/Shenmue2ScheduledActorMotionRuntime.js
play/characters/ScheduledActorRuntime.js
tools/actors/extract_shenmue2_runtime_controller_bindings.js
tools/animation/analyze_shenmue2_runtime_pose_series.js
tools/animation/check_shenmue2_animation_conformance.mjs
tools/animation/build_shenmue2_animation_fixture.mjs
tools/animation/build_shenmue2_foundation_fixture.mjs
tools/animation/build_shenmue2_animation_coverage.mjs
tools/animation/build_shenmue2_animation_capture_targets.mjs
tools/lib/Shenmue2AnimationConformance.js
tools/lib/Shenmue2RuntimeActorBinding.js
tools/evidence/shenmue2-motion-format.json
tools/evidence/shenmue2-animation-coverage.json
tools/evidence/shenmue2-animation-capture-targets.json
tools/evidence/shenmue2-xbox-npc-structure.json
docs/guides/emulator-research.md
docs/implementation/shenmue2-animation.md
tests/Shenmue2MotLoader.test.js
tests/Shenmue2Mt7MotionRuntime.test.js
tests/Shenmue2AnimationConformance.test.js
```
