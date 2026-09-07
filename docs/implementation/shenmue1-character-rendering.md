# Shenmue I character rendering

Body surfaces, attached FACE resources, and the native MOTN rig have distinct
ownership. Source and validation details are retained alongside these contracts.

## Character Rendering and Ryo's Head

### Ryo Head Atlas

Ryo's head was the exceptional character-texture case because it uses a combined
face/side-head atlas and participates in the game's FACE/mouth system. Generic
projection and atlas-half experiments could produce plausible-looking but
incorrect results.

The implemented fix uses the raw MT5 UVs as the source of truth
(`ryoHeadAtlasFix` with the raw/object atlas mode). This was not accepted solely
by visual trial and error:

- raw coordinates agree with independent wudecon/ShenmueDKSharp OBJ output
  within tolerance;
- the atlas-half assignment is more consistent than projected alternatives;
- physical UV distortion and cross-strip seam discontinuity are lower; and
- the result was finally checked against a Flycast GPU capture.

The repeatable audit is `tools/animation/analyze_ryo_head_uv_mapping.js`. Additional model
state and independent-export comparisons are described in `tools/README.md`.

### Character Mesh Corrections

The runtime also accounts for character-specific MT5 behavior that a naive
one-material/one-mesh import misses:

- native TWIDDLED_RECT UV interpretation for character textures;
- detached alternate mouth roots that must not render as ordinary body geometry;
- selective suppression of duplicate coplanar clothing shells that otherwise
  z-fight;
- winding/culling corrections without globally disabling culling; and
- cross-node seam welding at skinned body joints.

Character switching and motion retargeting use the shared body rig. Cloth and
other secondary motion are separate systems, now documented in
[native cloth](native-cloth-runtime.md) and
[native secondary motion](native-secondary-motion.md). Support is constrained
by each system's proven model/controller profiles; body animation alone does
not establish garment fidelity.

### Shenmue I FACE animation

The separate `SCENE/01/MODEL/FACE/*_F.MT5` files are native attached face
resources. A face model has a deformable render-key-`3` primary node and eye
children `77`/`78`. It replaces geometrically coincident surfaces in the active
body’s signed `-67` FACE subtree even when native tessellation or atlas UVs
differ; non-overlapping neck/head surfaces remain visible.
Coincident body/FACE triangles must also share the native surface-kind suffix
from their texture IDs. This prevents a nearby solid head shell from consuming
separate overlays such as Ryo's `KAM` rear hair cards, while still matching
palette-prefixed variants of the same authored face surface.
The paired `*_FTBL.BIN` starts with 25 control records. Its header offsets at
`0x24`, `0x28`, and `0x2c` delimit per-primary-vertex contribution counts,
flat control indices, and parallel float weights. Section padding means the
primary MT5 node's vertex count is required to parse the table correctly.

OP00 now packages the exact pairs for Ryo (`YKC`), Ine, Fuku-san, Iwao, and
Lan Di (`KOK`). The cutscene presenter routes each replacement face from the
live body attachment matrix. FTBL weights feed exact control deltas generated
by calling the original 75-channel `TALK_*` evaluator at `0x0c090188` for each
pinned table. SRF voice records supply six authored mouth shapes and 60 Hz
durations; the recovered controller converts them to its 30 Hz face clock,
including odd-tick carry and four-frame lookahead. Full upper-face TALK poses
drive blinks at the native 60/70/80/90-frame intervals. Guessed eyelid groups
and procedural voice-duration jaw motion remain explicitly excluded. A0114
supplies no AUTH lip index; its SRF association is authoritative. The parser and attachment
presenter are reusable outside cutscenes, so ordinary dialogue should adopt
this same path rather than adding a second face system.

One-sided FACE rendering first aligns every emitted triangle with its authored
vertex normals. This cannot be implemented as one global signed-strip rule:
YKC's convention is opposite to the other four pinned OP00 FACE resources.
Babylon then compensates the mirrored character root when applying clockwise
back-face culling.

---

## MOTN Animation Runtime

The `/play` runtime plays animation data extracted from `MOTION.BIN`; it does
not replay captured emulator vertices or matrices. Emulator recordings were
used as a numeric oracle to determine how the game evaluates and applies that
data.

The reconstructed pipeline:

1. parses MOTN tracks into a 37-control runtime rig;
2. samples curves at the game's 30 Hz tick rate with the cubic Hermite equation
   observed at SH-4 routine `0x0C093390`;
3. solves the character hierarchy and routes the 13 observed output matrices
   into the MT5 skin;
4. separates locomotion travel from local root sway while retaining intentional
   root orientation/offsets for poses such as sleeping; and
5. interpolates browser presentation between exact 30 Hz game ticks, removing
   visible stepping without changing the authoritative tick poses.

For the default `A_WALK_L_02` validation, 37 stored samples produce 36
interpolation intervals across exactly 28 game ticks. With equivalent shoulder
state, the browser/emulator matrix RMS error was `0.000017`. A separate foot
contact audit found no evidence for a hidden "make every foot flat" pass; tested
sole points matched the emulator within `0.000021`, including natural tilt.

Mesh tearing at joints was addressed independently by welding 197 cross-node
seam groups. The tested walk, run, sleep, phone, and door clips then measured
zero seam separation.

See `tools/README.md` for capture and audit commands.

---

## Character triangle and surface integration

This document records the character-triangle investigation undertaken while
bringing native Shenmue cutscenes into the browser: what the files mean, what
was proved, which renderer rules currently exist, which tempting fixes were
disproved, and how to diagnose the next seam or protruding-triangle problem
without adding actor-specific patches.

The central rule is:

> Treat a protruding triangle or open seam as evidence that native attachment,
> deformation, winding, or surface-ownership semantics are wrong. Do not hide
> an authored triangle merely because it looks wrong in one pose.

## Scope and terminology

The affected characters use several overlapping native surfaces:

- a body MT5 containing the torso, a low-detail head, and attachment nodes;
- a detailed `MODEL/FACE/<code>_F.MT5` face/head shell;
- separate detailed eye geometry;
- FTBL/TALK data that deforms authored face vertices;
- detailed hand models attached at the native left- and right-hand nodes.

In this document, **body FACE node** means the attachment in the body MT5,
normally keyed by signed index `-67` (`-0x43`). **Detailed FACE** means the
separate `_F.MT5` model that replaces or overlays the body version during a
native presentation. **Surface ownership** is the process that removes only
the portion of the body surface genuinely replaced by a detailed attachment.

Hands use related attachment machinery at `-65` and `-66`, but they have their
own boundary and ownership rules. Do not assume a FACE conclusion applies to a
hand without verifying its native data.

## The native signed-index rule

MT5 FACE strips can refer to vertices outside the current model using negative
indices. These are not invalid local indices and they must not be clamped to
zero. The native relationship is:

```text
parentLocalIndex = parentModel.nbVertex + signedIndex
```

The selected parent position and normal are then transformed through the
inverse of the child/source attachment transform into the detailed model's
source space.

For a standalone `_F.MT5`, the referenced parent is not present in that file.
The loader must therefore preserve the unresolved relationship as metadata
such as `_mt5ExternalParentVertexOffsets`. It must not fabricate a local
vertex. When the face is attached to a character body, those references are
resolved against the model belonging to the **source parent of the body FACE
node**. Resolving against the `-67` node's own model tail produces distorted
triangles because that node is the replacement attachment, not the source of
the external boundary vertices.

This signed-reference correction fixed the reproducible Ryo and Fuku-san face
spikes. Signed seam vertices are also excluded from FTBL morph deformation:
they anchor the detailed surface to its parent and are not ordinary facial
control vertices.

## Ryo triangle evidence

The most useful Ryo report identified:

```text
source:       YKC_F.MT5
node:         0x3640 / render key 3
mesh:         mt5_tex_2
original ID:  face 27
UVs:          (0.4677734375, 0.1083984375)
              (0.361328125, 0.171875)
              (0.33203125, 0)
```

The containing strip begins:

```text
-19, 272, -16, 248, -18, 240, 237, 265, ...
```

With the wrong parent binding, the selected triangle's maximum edge was about
`0.19209 m`. With the native binding, it is about `0.07106 m`. Neighboring
faces 26, 27, and 28 are authored geometry, not garbage that should be deleted.

Fuku-san's eye-area protrusion was the same class of problem: a signed seam
vertex was being interpreted or morphed as ordinary local facial geometry.

## Emulator and PVR evidence

A native capture was saved at:

```text
captures/pvr/20260810-174005-frame-27377/
```

It establishes several important facts:

- Ryo's head atlas is present byte-for-byte in VRAM at `0x561800` as a
  256-by-128 ARGB1555 texture.
- The raw TA stream contains the exact five-corner UV sequence surrounding the
  reported browser triangle:

  ```text
  (.467773, 0)
  (.467773, .108398)
  (.332031, 0)
  (.361328, .171875)
  (.238281, 0)
  ```

- The relevant texels are opaque. Alpha testing is not the cause of the spike.
- The Dreamcast submits the reported face. Deleting face 27 would discard
  native geometry and conceal the binding error.
- The capture's PVR cull mode is mode 1, which Flycast does not treat as
  conventional front- or back-face culling.

The browser currently keeps detailed FACE materials one-sided so that internal
face and eye sheets do not become visible through the back of a head. The
native/browser culling difference may matter when diagnosing a neck opening,
but it does not justify making every character surface double-sided.

## Coordinate space, mirroring, and winding

Detailed face morphs are written in their unreflected native source space. The
character content root mirrors X exactly once. Applying that reflection twice
puts the visible face on the back of the head while independently attached eyes
and mouths may still appear on the front.

The current detailed FACE presentation therefore follows these invariants:

- perform binding and morph work in source-local space;
- allow the character content root to perform the one intended X reflection;
- use clockwise side orientation for the mirrored detailed surface;
- keep normal presentation one-sided;
- orient generated winding consistently against the bound normals.

If a picker or debug overlay changes how a character is culled, verify that it
preserves both `backFaceCulling` and `sideOrientation`. A debug mode must not
silently change the geometry being investigated. The selected-triangle overlay
itself may be double-sided so it remains visible during inspection.

## Surface ownership

The body and detailed attachment overlap by design. Keeping both complete
shells causes z-fighting, duplicate eyes or hands, and internal geometry
showing through. Removing the entire body head creates neck, hair, or collar
holes. The reusable solution is geometric surface ownership.

The implementation lives primarily in:

- `src/NativeSurfaceOwnership.js`
- `src/FaceSurfaceIntegration.js`

The current FACE integration uses:

- attachment-local geometry rather than actor- or world-space thresholds;
- a full affine inverse for attachment-space conversion, preserving authored
  scaled roots as well as ordinary rigid character hierarchies;
- a `0.003 m` separation tolerance;
- compatible texture-family checks;
- coverage of all three body-triangle corners before removing that triangle;
- priority coverage for eye surfaces;
- MT5 `parentAddr` ancestry to identify the authored replacement subtree;
- reversible patches to original index buffers;
- preservation of hair and other authored overlay subtrees.

After the corrected binding, fixture observations were:

| Character | Body triangles removed | Body triangles retained |
| --- | ---: | ---: |
| AKIR (Ryo) | 532 | 152 |
| FUKU | 392 | 0 |
| INE | 526 | 0 |
| IWAO | 566 | 148 |
| SORY (Lan Di) | 909 | 177 |

OP02's Shenhua model proved why attachment conversion must be affine. The
`MGR_M.CHRM` hierarchy places render key `-67` below an authored uniform scale
of 10. A rigid transpose is not the inverse of that matrix and previously
squared the scale, falsely reporting that exact `MGR_F.CHRM` surfaces did not
overlap. With the affine inverse, the generated OP02 FACE binding transfers
3,593 body triangles and retains 2,397 without a character-specific offset.

These counts are regression observations, not a statement that every zero-
retained result is inherently correct. A count must be interpreted alongside
screenshots, attachment hierarchy, material identity, and native evidence.

## Triangle picker requirements

The triangle picker was extended to make this work diagnosable. It should:

- refresh CPU-skinned invisible pick proxies at click time so animated
  character triangles can be selected;
- exclude collision, controller, occlusion, and other debug proxy meshes;
- preserve the selected material's winding and culling in debug views;
- report original face ID, source filename, hierarchy, vertex indices,
  local/world positions, and UVs;
- keep the selected overlay visible from both sides without changing the
  underlying material.

Picker JSON is evidence, not by itself a deletion list. Save the exact paused
cutscene time and camera alongside it so the pose can be reproduced.

## Neck-gap investigation: unresolved

Work stopped after the report that correcting the protrusions left gaps between
some necks and torsos. No production neck-gap change was made after that report.
The following facts were established before pausing:

- For all five checked characters, the corrected detailed-face bounds agree
  with the body `-67` low-detail bounds.
- For Ryo, both detailed and low-detail FACE world Y bounds are approximately
  `0.35907..0.64464`, while the parent torso reaches approximately `0.42547`.
  There is spatial overlap rather than a simple vertical offset.
- Ryo's detailed FACE and body low-detail FACE each have the same eight exact
  spatial boundary edges shared with the parent torso.
- None of the five checked characters has an `_mt5CharacterRigSeamGroups`
  relationship between `-67` and parent node 1.
- Matching body negative-reference vertices are weighted fully to `-67`; they
  are not native 50/50 torso/head blend vertices.

This disproves the proposed synthetic seam-bone solution. Do not add external
bones or arbitrary 50/50 weights to close the gap.

The remaining plausible categories are:

1. A localized one-sided winding/culling hole at the seam.
2. Surface ownership removing a body triangle that the detailed shell does not
   visibly replace in that pose.
3. A shot- or pose-specific matrix, material, or activity-state discrepancy.

A midpoint/centroid ownership-coverage experiment was attempted while
investigating and then fully reverted. It was not supported by evidence.

## How to resume the neck diagnosis

Use one reproducible cutscene frame and change one variable at a time:

1. Pause on a frame that clearly shows the gap and record the cutscene time,
   actor, shot, screenshot, and picker JSON for both visible boundary sides.
2. Toggle only the affected material's culling in a temporary diagnostic path.
   If the opening disappears, inspect local winding and normals; do not retain
   global double-sided rendering as the fix.
3. Restore culling, then disable only FACE surface-ownership removal for that
   actor in the diagnostic session. If the opening disappears, compare the
   removed original body triangle IDs with detailed-shell coverage.
4. If neither toggle explains it, capture the attachment matrices and the
   corresponding boundary positions before and after animation for that frame.
5. Compare the equivalent emulator/PVR frame when browser evidence still leaves
   more than one interpretation.
6. Implement the smallest data-driven rule that holds across the character
   fixtures, then add a regression test for the geometry relationship—not an
   actor name or shot timestamp.

## Fixes to avoid

The investigation has ruled out or strongly cautions against:

- deleting reported face IDs;
- actor-, shot-, or cutscene-specific triangle lists;
- resolving a negative index to vertex zero;
- resolving FACE seam indices against the `-67` model's own tail;
- substituting the `-66` hand attachment for the FACE parent;
- duplicating seam vertices or applying arbitrary offsets;
- hiding the entire low-detail `-67` subtree;
- rendering all overlapping shells simultaneously;
- enabling global double-sided character materials;
- actor-specific neck-height thresholds;
- synthetic seam bones or guessed blended weights;
- blaming near clip, alpha, or emissive settings for malformed geometry.

Temporary toggles are useful for isolating a cause. They should not become the
shipping fix unless the native data and cross-character fixtures support them.

## Relevant files and checks

The main implementation and regression surfaces are:

```text
src/Mt5Loader.js
src/FaceSurfaceIntegration.js
src/NativeSurfaceOwnership.js
play/events/NativeAseqFacialPresentation.js
play/debug/TrianglePicker.js
tests/NativeAseqFacialPresentation.test.js
tests/TrianglePicker.test.js
```

Before accepting a future triangle fix:

- run the focused facial-presentation and triangle-picker tests;
- run the production build;
- verify at least Ryo, Fuku-san, Ine-san, Iwao, and Lan Di fixtures;
- inspect both the original problem pose and neutral poses;
- confirm that picker/debug mode does not alter culling;
- compare removed/retained ownership counts for unexpected changes;
- use native capture evidence before discarding authored geometry.

The desired end state is one attachment and surface-integration pipeline that
works for other cutscenes from their native data. A result that only makes OP00
look correct at one timestamp is not complete.
