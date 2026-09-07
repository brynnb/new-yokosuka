# Shenmue II Animation System

This is the authoritative description of how Shenmue II character animation
works in New Yokosuka, how that implementation was recovered, what evidence is
accepted, and what remains unresolved. The chronological research record and
individual discoveries remain in [animation research](../research/shenmue2/animation.md).
The emulator and debugger setup is documented separately in
[emulator research](../guides/emulator-research.md).

## Status and evidence policy

The browser implementation is a native-structure reconstruction. It is not a
generic retargeter and it must not be corrected by eye.

Use these evidence labels consistently:

- **Proven:** established by game data, Dreamcast SH-4 instructions, exact
  Xbox counterpart code, synchronized native matrices, or two independent
  sources that establish the same operation.
- **Strong inference:** supported by several observations but missing one
  piece of native control flow or a synchronized execution of that branch.
- **Unresolved:** insufficient evidence for a general browser rule.

The implementation rules are:

1. Never add per-character rotations, scales, offsets, reach normalization,
   pose clamps, or visual safety corrections.
2. Never identify a model from a shared motion ID. Bind the live actor to its
   native actor record, HUMANS entry, exact CHRM, and model hash.
3. Never use an incomplete save-state RAM snapshot as a pose fixture. A pose
   fixture requires a completed synchronized PVR frame.
4. A correction is systemic only when native code or a captured structure
   selects it by authored data such as the rest-record family or hierarchy.
5. Preserve failures as discrepancies. Do not widen a threshold or discard a
   frame to make a capture pass.
6. Validate both captured evaluator values and independently decoded MOT
   curves. A correct solver must not conceal a curve-decoder error.

Several visually plausible early corrections made later diagnosis harder:
clip-specific reach scaling, mirrored-arm exceptions, bind-pose shoulder
corrections, inferred leg reach, and IK safety clamps all masked native logic.

## Complete data flow

```text
Native schedule / actor state
          |
          v
model identity + motion request
          |
          +---- CHRM / MT7 hierarchy and render geometry
          |
          +---- compact MOT bank and sequence
          |
          v
69 compact Hermite curves at 30 Hz
          |
          v
five native motion slots (0..4), including independent layers
          |
          v
pelvis/legs -> torso -> head -> arm A -> arm B solvers
          |
          v
19 native renderer matrices, model-specific MDC7 bindings
          |
          v
Babylon controller TransformNodes
          |
          v
GPU skeleton -> welded boundaries -> per-material merged meshes
```

There are three distinct structures:

- Compact MOT has 22 controller triplets. A triplet may be an angle, basis,
  target position, terminal control, or procedural callback input.
- The native solver produces 19 renderer-consumed matrices. There is not a
  one-triplet/one-visible-bone relationship.
- MT7 is a model-specific render hierarchy with optional nodes, repeated IDs,
  clothing, hair, accessories, and terminals. MT7 preorder is not a universal
  controller index.

## Source identity and asset loading

`ScheduledActorRuntime` supplies actor identity, exact model code, texture
pack, schedule state, model-family evidence, and optional scripted motion
layers. S2 characters load through `Mt7Loader`; S1 characters continue through
`Mt5Loader`.

Important S2 inputs are:

- `.CHRM`: MT7 character model and authored hierarchy;
- `NPC.MOT`: shared NPC motions;
- `NPC_TBL.MOT`: logical-character table motions;
- `MOTION.MOT`: shared/global motion bank;
- area and special banks such as `NPC_WT00.MOT`;
- `HUMANS.IDX` and `HUMANS.AFS`: exact actor-to-model resources;
- native schedule/program records: motion requests and independent layers.

The MT7 root's authored family value is mapped through the native selector
table at Dreamcast `0x8c24f05c`. This chooses a native rest-rig record.
Nearest dimensions and actor-code suffixes are diagnostics only.

`scheduledMt7HumanoidMotionNodes()` joins MT7 nodes to native controller
anatomy using hierarchy, ID, parent context, and recovered MDC7 binding order.
It also records non-controller terminal nodes. Reduced render rigs can omit
invisible native arm roots; the browser creates only the two solver roots
directly proven by native output. A hierarchy-specific head alias maps Ryo's
rendered `0x46` node to the native head output when `0xffbd` is absent.

## Compact MOT evaluation

A normal compact sequence contains 69 curves:

```text
3 absolute root-translation curves
+ 22 controller triplets * 3 curves
= 69 curves
```

`Shenmue2MotLoader` parses the 78-byte header, per-curve interior key counts,
alignment, and half-float Hermite records. Playback is 30 Hz. The header is a
frame count, so the implicit final key is `durationFrames - 1`. Tangents are
converted to seconds. The leading sequence half-float is not a multiplier.

Runtime descriptors can apply a live affine after sampling:

```text
evaluated = sample * descriptorScale + descriptorBase
```

Transitions can replace an ordinary descriptor with a temporary Hermite
segment. The normal whole-body transition lasts eight frames. Independently
installed arm layers use twelve frames, retain half the source curve's outgoing
velocity, and finish at zero velocity. Their endpoint includes the target
curve's native affine.

| Slot | Controllers | Controller offset | Role |
| ---: | --- | ---: | --- |
| 0 | `0..7` | `+0x08` | root, pelvis, and both legs |
| 1 | `8..10` | `+0xe18` | torso |
| 2 | `11..13` | `+0x11a8` | head |
| 3 | `14..17` | `+0x1578` | positive-Z arm |
| 4 | `18..21` | `+0x1af8` | negative-Z arm |

Each slot owns its motion ID, frame, affine state, callback state, and phase.
Slot 4 cannot be assumed to share slot 0's frame. Application order is 0–4.

## Native rest-rig profiles

`FUN_8c1cd380` selects one of 18 native rest records. Current humanoid CHRM
families use records 0–15. These supply pelvis height, torso/head translations,
leg-root placement, four leg lengths, arm-root and shoulder placement, visible
arm lengths, solver arm lengths, and attachment-terminal lengths.

`SHENMUE2_NATIVE_REST_PROFILES` transcribes the 16 records selected by current
humanoid CHRM families; it is not fitted to the browser models. Important arm
fields are:

| Rest-record field | Meaning |
| ---: | --- |
| `+0x50..+0x64` | first arm root/shoulder placement |
| `+0x68/+0x6c` | first arm solver lengths |
| `+0x74` | first rendered attachment-terminal length |
| `+0x78..+0x8c` | second arm root/shoulder placement |
| `+0x90/+0x94` | second arm solver lengths |
| `+0x9c` | second rendered attachment-terminal length |

Terminal lengths are explicit. They must not be inferred as solver reach minus
visible forearm length. LLY proves the difference: native `0.0448` does not
equal the inferred value closely enough for matrix conformance.

## Browser pose execution

`Shenmue2ScheduledActorMotionRuntime.apply()` manages selection, time, and
transitions. `applyShenmue2Mt7MotionPose()` performs one pose:

1. Configure the model's native controller hierarchy once.
2. Evaluate the requested MOT at the slot's native frame.
3. Apply captured affine/callback inputs only in conformance mode. Normal
   `/play` obtains state from its browser transition controller.
4. Apply root translation to the complete render root. Scheduled movement owns
   horizontal travel; compact root supplies vertical animation.
5. Apply established non-procedural controller transforms.
6. Solve pelvis and torso.
7. Solve head.
8. Solve both arms.
9. Solve both legs.
10. Upload final MT7 controller matrices to the Babylon skeleton.

An unknown branch remains in authored pose; it does not receive a plausible
substitute animation.

### Pelvis and legs

Slot 0 uses controllers `0..7`. Controllers 0 and 1 compose the pelvis basis.
Each leg consumes an animated bend basis, position target, and terminal foot
control. The two-bone solve uses explicit native rest-record lengths.

Leg targets are actor-space values. Horizontal components remove compact root
translation because scheduled travel owns it; vertical targets remain absolute
relative to the actor ground anchor. Ryo uses captured terrain-adjusted foot
targets only when the native player structure supplies them. There is no
invented general foot-to-ground alignment system.

The solve preserves unreachable targets like the native/S1 path. It does not
shorten limbs, rescale targets per clip, or apply a knee-angle clamp.

### Torso

Slot 1 uses controller 8 as root rotation, controller 9 as an aim vector, and
controller 10 as terminal rotation. The solver aligns native X to the aim,
advances by the authored segment, and applies the terminal. Treating all three
as visible Euler bones is wrong.

### Head

Slot 2 uses controller 11 root rotation, controller 12 secondary rotation or
current-actor callback, and controller 13 aim. Head placement uses two
rest-record translations with controller 11 between them. A single static
CHRM neck offset is not equivalent.

The current-actor callback publishes a temporary source basis and blend. The
captured branch is implemented, but JJ3 still lacks the callback-time matrix
needed to identify its exact native branch.

### Arms and attachment terminals

Slots 3 and 4 share `FUN_8c1cf0a0`:

| Slot 3 | Slot 4 | Meaning |
| ---: | ---: | --- |
| 14 | 18 | arm root rotation |
| 15 | 19 | animated two-bone basis |
| 16 | 20 | hand target position |
| 17 | 21 | visible-hand and terminal control |

Slot 3 drives `0x09 -> 0x05 -> 0x06 -> 0x07`; slot 4 drives
`0x04 -> 0x0a -> 0x0b -> 0x0c`. Reversing that native ownership caused the
earlier cross-torso animation.

Targets convert as direct Dreamcast XYZ reflected into Babylon:
`[-rx, +ry, +rz]`. The bend plane comes from the animated basis; both arms use
the same operand order. Bilateral behavior comes from authored placement and
basis data, not a hand-written reversed elbow.

The visible hand is slot `+0x408`. Only controller 17/21's first component
rotates it. The attachment terminal is slot `+0x508`, bound to signed MT7 nodes
`0xffbf` and `0xffbe`; MDC7 preorder and pointers prove those identities.

Terminal position is:

```text
visible hand position + visible-hand local -X * rest-record terminal length
```

For the ordinary branch, reflected Babylon terminal orientation is:

```text
Y(-rz) * Z(-ry) * X(rx), relative to the lower-arm matrix
```

An exhaustive six-permutation comparison across retained frames selected YZX
with about `0.0000054` degrees maximum residual; alternatives miss by 6–17
degrees. SH-4 helper order supports the same composition. Mode 1 uses the
separate direction/up structure at slot `+0x548`. Terminal metrics are now in
browser conformance; their complete strict corpus refresh remains active work.

## Render rig, seam welding, and batching

MT7 characters contain many rigid pieces. Parenting those pieces directly to
solved nodes leaves cracks where adjacent pieces follow different matrices.
Rewriting vertices on the CPU would add main-thread cost.

`Mt7Loader` builds a GPU rig equivalent to S1:

1. Preserve MT7 TransformNodes as the animation/controller tree.
2. Bake each render batch into character-root space.
3. Create one root-level Babylon bone per rendered MT7 node, using the authored
   world matrix as its bind matrix.
4. Give ordinary vertices one rigid influence.
5. Find duplicate boundary vertices across different nodes within `1e-5`.
6. Give every boundary copy the same equal neighboring bone influences.
7. After each pose, update bones from MT7 TransformNodes and dirty the skeleton
   once.

Seam discovery uses a spatial hash. Shared GPU influences weld positions and
normals without changing solver output or rewriting geometry every frame.

Compatible batches then merge per character only when material, vertex
attributes, alpha order, rendering group, and vertex-color state agree.
Skeleton indices and weights survive. Representative reductions are:

| Character | Before | After |
| --- | ---: | ---: |
| `JN5_L` | 134 | 6 |
| `CM5_L` | 175 | 5 |
| `SYE_M` | 366 | 6 |

This removes 95–98 percent of their render objects/draw submissions without
reducing animation detail. It addresses crowded-zone main-thread submission
cost and is separate from solver correctness.

## Research method

### 1. Start with exact native identity

Choose a live actor whose code, model, motion, and controller are provable.
Follow its native record and duplicated controller pointers, resolve HUMANS,
hash the CHRM, and retain capture-local addresses only as provenance. Never
start from “this character looks similar.”

### 2. Capture completed native frames

Use instrumented Flycast for synchronized PVR, RAM, and VRAM frames. The PVR
completion boundary matters: save-state RAM can stop between curve evaluation
and renderer writes. Capture several phases, including wrap and transitions.
The emulator observes native behavior; it is not a browser dependency.

### 3. Recover controller/render bindings

`extract_shenmue2_runtime_controller_bindings.js` finds five-slot controllers
and follows MDC7 pointers to matrices inside that controller. Matrix-pointer
ownership is the invariant, not allocation proximity. Record model preorder,
optional records, signed terminals, and all output offsets.

### 4. Trace the writer, disassemble the producer

Address-filtered Flycast traces identify the instruction and return address
writing a matrix. Copy helper `0x8c04f320` exposes the solver call site. Export
that producer from the Shenmue II Ghidra project:

```text
.disc-work/ghidra-s2-sh4/Shenmue2SH4.gpr
```

The project analyzes Dreamcast `1ST_READ.BIN` as little-endian SH-4 at its
runtime address. Cached `0x8c......` and `0x0c......` aliases name the same
physical RAM. Follow literal pools: structure offsets and helper pointers are
often indirect.

Useful retained exports include:

```text
s2-controller-rest-binding.lst
s2-slot0-full.c
s2-torso-solver.c
s2-head-builder.c
s2-arm-solver.c
s2-leg-full.lst
s2-mdc7-render-binding-consumers.c
```

Decompiler output is navigation only. Verify operand order, delay slots,
`FTRC`, `FSCA`, matrix-stack state, and offsets in the instruction listing.

### 5. Decode authored tables directly

When SH-4 copies a rest value, read that field for all records rather than
deriving it from one mesh. For example, `FUN_8c1cd380` loads a pointer table
through global `0x8c25fa14`; records directly prove terminal fields
`+0x74/+0x9c`. Live RAM resolves relocated pointers; instructions establish
meaning.

### 6. Prove coordinate conversion

Compare every plausible axis/sign/order mapping over several native frames and
both bilateral branches. Use the unique numerical candidate to guide static
analysis, then verify it against SH-4 helper order. One good-looking pose is
not evidence. Geometry reflects across X in Babylon, but solver helpers do not
all share generic MT7 rotation order.

### 7. Add two-path conformance

A fixture retains exact identity, five slot motions/phases, affine/callback
inputs, actor root, and renderer matrices. One path uses captured evaluated
curves to isolate the solver. The other samples repository MOT data and uses
only captured descriptor state. Both must pass, followed by compatible-family
replay.

### 8. Keep negative evidence

Failed captures, nonresident actors, mixed phases, absent callback inputs, and
exact discrepancies prevent repeated mistakes. Runtime addresses are never
portable between loads.

## Emulator, static analysis, and Xbox roles

Use Dreamcast captures for live identity, phase, callback state, matrix output,
writer traces, and final validation. Use Dreamcast SH-4 analysis for portable
operation order, offsets, truncation, table copies, and unexecuted branches.
Use Xbox code as a readable counterpart for high-level selectors, schedules,
resources, and shared control flow. Xbox does not replace Dreamcast solver
evidence and does not need to be run.

Most work no longer requires manual emulator positioning. Once a branch and
its inputs have strict fixtures, browser changes can be checked offline. Use
the emulator again only for an uncaptured callback, family, motion category, or
native state.

## Conformance workflow

```bash
npm run analyze:shenmue2-animation
npm run test:s2-animation
npm run test:s2-animation:family
npm run analyze:shenmue2-animation-coverage
npm run analyze:shenmue2-animation-capture-targets
```

Generated evidence lives under `tools/evidence/`. The strict set currently has
37 native fixtures and covers 114 bundled models through 744 model/fixture
observations across ten rest-profile families. Six families still need exact
native fixtures. JJ3's head callback remains an explicit discrepancy.

The attachment-terminal metrics expose two focused assertions
whose old limits covered 17 outputs. Complete fixture refresh and explicit
terminal gates are required rather than hiding terminals or widening those old
limits.

## Remaining work

1. Complete strict conformance for both `+0x508` terminals, including mode-1
   `+0x548`, and refresh the corpus.
2. Capture exact CHA, HGN, JOY, SIN, TGY, and YUA representatives.
3. Resolve JJ3 controller-12 using a callback-time source matrix.
4. Add fixtures for more area, story, transition, and layered motions.
5. Decode optional MDC7 outputs not yet represented by hierarchy rules.
6. Treat nonhumans and non-NPC MT7 objects as separate controller families
   unless native evidence proves otherwise.

## File map

| File | Responsibility |
| --- | --- |
| `src/Shenmue2MotLoader.js` | compact MOT, banks, encoded IDs, selectors |
| `src/Mt7Parser.js` | MT7 binary hierarchy and geometry |
| `src/Mt7Loader.js` | Babylon model, GPU rig, welding, batching |
| `play/characters/ScheduledActorRuntime.js` | resources, schedules, lifecycle |
| `play/characters/Shenmue2ScheduledActorMotionRuntime.js` | five-slot native solvers |
| `tools/actors/extract_shenmue2_runtime_controller_bindings.js` | RAM/MDC7 bindings |
| `tools/animation/build_shenmue2_animation_fixture.mjs` | fixture construction |
| `tools/animation/check_shenmue2_animation_conformance.mjs` | exact-model checks |
| `tools/animation/build_shenmue2_animation_family_conformance.mjs` | family replay |
| `tools/lib/Shenmue2AnimationConformance.js` | browser/native metrics |
| `tools/lib/Shenmue2RuntimeActorBinding.js` | exact actor ownership |
| `docs/guides/emulator-research.md` | Flycast, traces, GDB, Ghidra |
| `docs/research/shenmue2/animation.md` | detailed chronological evidence |

## Safe extension checklist

- Actor, model, motion, slot, and phase are exact.
- Capture is a completed synchronized PVR frame.
- Source controller fields and final output are known.
- SH-4/Xbox or multiple native frames establish axes and operand order.
- Dreamcast fixed-turn truncation is reproduced where applicable.
- No model correction, clamp, target rescale, or threshold widening exists.
- Captured-value conformance passes.
- Raw-MOT conformance passes.
- Compatible-family replay passes.
- Documentation separates proven behavior from inference.
