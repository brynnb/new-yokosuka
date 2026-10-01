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

### Playable GPU body animation

Body and cloth meshes share `mt5AuthoredSideOrientation` in
`src/Mt5NormalPolicy.js`. It selects the front side by comparing triangle
winding with authored normals in bind space; Babylon separately handles the
mirrored character root at draw time. It does not rewrite normals, UVs or
triangle order. This keeps two-sided body lighting from flipping the same
attachment normals that one-sided cloth lighting leaves intact. Exterior and
opposite-winding lining remain separate, one-sided surfaces.

Explicit material conventions and signed detailed FACE resources retain their
own orientation. GPU character batches group by both material and mesh side
orientation, so shared atlases cannot erase that distinction. The focused
normal-policy and GPU-rig tests cover mirroring, handedness and geometry parity;
`tests/e2e/player-jacket-lighting.spec.js` checks actual GPU pixels for equal
body/cloth lighting and culled lining, with rendered standing/walking Ryo
comparisons. The fixture requires locally extracted assets and does not load
an account or a world.

`CharacterRuntime` uses the shared MT5 GPU rig for playable characters, remote
avatars and account previews. Poses update bone matrices rather than replacing
position/normal buffers every frame. Authored node identities stay intact for
footwear, FACE and interaction attachments; playable meshes are not merged.
Cross-node seam influences reproduce the CPU path's welded positions.

Normal humanoid player animation preserves all 37 controllers through frame
and clip blending, not just the render routes. `applyHumanoidAnimationPose`
transfers the displayed/retargeted pose to the shared native cloth presenter.
The body stays GPU-skinned; only acquired cloth output buffers are CPU-solved,
using the authored collision profile. Coincident garment panels sharing an
attachment owner use the shared position-welding primitive after solving,
without averaging the lining's opposed normals. No player-specific solver or
hem offset is introduced. Remote avatars (including emote blends), account
previews, and combat actors retain complete controller poses and use the same
post-pose secondary-motion/cloth stage. Previews and native animal locomotion
reuse the canonical loaded model rather than maintaining a separate pose owner.
Scheduled NPCs call that shared stage after placement and grounding; their
existing visibility culling still controls whether simulation advances.

Footwear visibility changes invalidate cached rig bounds. Grounding and preview
framing explicitly measure skeleton/morph-deformed positions, since the stored
vertex buffers contain the bind pose. The gameplay cloth update waits for its
required controller inputs before detaching a garment from GPU skinning; an
actor with render matrices alone keeps its garment on the ordinary body rig.

`tests/PlayerGpuRig.test.js` checks posed grounding, footwear/disposal and
CPU/GPU position parity without per-pose vertex-buffer creation. Its real Ryo
model comparisons require locally extracted assets. Numerical tests complement,
but do not replace, rendered checks of poses and attachments.

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
- preserve the native signed-strip winding independently of material opacity;
- mount the entire FACE resource, including ancestors of its animated node.

Do not orient FACE triangles individually against their smoothed lighting
normals. Ine-san's borrowed collar normals caused that heuristic to reverse
neck triangles: the geometry existed but disappeared with ordinary culling.
The native strip sign and alternating order define the front side. Signed
parent binding changes vertex positions, not that authored topology.

If a picker or debug overlay changes how a character is culled, verify that it
preserves both `backFaceCulling` and `sideOrientation`. A debug mode must not
silently change the geometry being investigated. The selected-triangle overlay
itself may be double-sided so it remains visible during inspection.

## Surface ownership

The body and detailed attachment overlap by design. Keeping both complete
shells causes z-fighting, duplicate eyes or hands, and internal geometry
showing through. Removing the entire body head creates neck, hair, or collar
holes. The reusable solution is authored attachment ownership, with geometric
coverage for surfaces that have no explicit replacement boundary.

The implementation lives primarily in:

- `src/NativeSurfaceOwnership.js`
- `src/FaceSurfaceIntegration.js`

The current FACE integration uses:

- attachment-local geometry rather than actor- or world-space thresholds;
- a full affine inverse for attachment-space conversion, preserving authored
  scaled roots as well as ordinary rigid character hierarchies;
- full matching-surface replacement on the body FACE node and attached native
  `-68` mouth patch when signed parent references close the detailed seam;
- a `0.003 m` separation tolerance for other surfaces;
- compatible texture-family checks;
- coverage of all three body-triangle corners for geometric replacement;
- priority coverage for eye surfaces;
- MT5 `parentAddr` ancestry to identify the authored replacement subtree;
- reversible patches to original index buffers;
- preservation of hair and other authored overlay subtrees.

After the corrected binding, fixture observations were:

| Character | Body triangles removed | Body triangles retained |
| --- | ---: | ---: |
| AKIR (Ryo) | 536 | 148 |
| FUKU | 392 | 0 |
| INE | 526 | 0 |
| IWAO | 570 | 144 |
| SORY (Lan Di) | 914 | 172 |

OP02's Shenhua model proved why attachment conversion must be affine. The
`MGR_M.CHRM` hierarchy places render key `-67` below an authored uniform scale
of 10. A rigid transpose is not the inverse of that matrix and previously
squared the scale, falsely reporting that exact `MGR_F.CHRM` surfaces did not
overlap. Its detailed resource also has four geometry-bearing ancestors of
render key `3`, all with key `-1` (44, 44, 46 and 52 source vertices). These
are neck sections, not empty transform helpers. Routing only `3`, `77` and
`78` left those sections at the model origin, while surface ownership removed
the corresponding body skin. Zero external seam bindings did not mean that
the resource lacked its own neck.

FACE presentation now mounts unrouted roots with
`inverse(primary attachment bind) * body head matrix`; explicit face and eye
routes remain absolute. Ancestors and siblings therefore follow the same
attachment-space conversion used by surface ownership. The previous two-ring
body-neck retention workaround is removed. OP02 transfers 3,593 body triangles
and retains 2,397, including 43 uncovered skin triangles on the actual `-67`
node. The separate 66-triangle collar mesh was never that node's neck band.

These counts are regression observations, not a statement that every zero-
retained result is inherently correct. A count must be interpreted alongside
screenshots, attachment hierarchy, material identity, and native evidence.

### Coarse-body FACE replacement (September 2026)

Yamagishi exposed a limitation in proximity-only replacement: `YMG_L.CHRM`
has a 155-triangle `-67` face and a 59-triangle attached `-68` mouth. The
detailed `YMG_F.MT5` has different tessellation, so the 3mm/normal classifier
removed only 67 of those 214 triangles. The remaining skin drew through the
detailed face. The defect appeared with both GPU and baked body rigs. Hiding
the authored old-head subtree in a browser diagnostic removed the patches
without changing normals.

The shared rule now uses the bound signed-parent seam to replace matching
materials on the authored face/mouth nodes completely. It leaves the parent
neck unchanged, and does **not** blindly replace arbitrary descendants, even
if their atlas matches: Ryo has skin-atlas hair overlays; Lan Di and Shenhua
have articulated descendants. The generic `-68` mouth identity is also used
by `GenericFaceMorph.js`. This is a source-structure-based presentation rule,
not a claim that the original renderer used our triangle classifier.

Yamagishi transfers all 214 old face/mouth triangles while preserving all 112
hair triangles. Models without a bound signed seam (notably OP02 Shenhua) use
geometric coverage of the fully mounted detailed resource. No normals,
distance tolerance, or actor-specific rendering override is required.

Retained local audit (prints source hashes and per-node/material counts):

```sh
node tools/animation/audit_face_surface_ownership.mjs
node tools/animation/audit_face_surface_ownership.mjs YAMA
```

The audit covers 13 configured body/FACE pairs, including OP02 and young Ryo;
it requires the local source assets and is not a visual test. The focused
tests cover exact unrelated-geometry preservation, signed seam positions,
restoration, both body rig modes, authored FACE winding, and OP02 neck-node
matrices across head poses. `tests/e2e/cutscene-seams.spec.js` captures the
actual OP02 close-ups and OP00's Ine-san/car shots on the GPU. Set
`NY_SEAM_DIAGNOSTIC=true` to also capture reversible body-only, unmasked,
double-sided and neutral-face comparisons; those modes are diagnostics only.
Rendered Yamagishi evidence is in
`tests/reports/cutscene-yama-face-fixed-sept22/`: full playback and same-page
replay/cancel pass, and the reviewed early close-up has no face patches.

## Blended triangle ordering

`src/rendering/TransparentTriangleSort.js` orders triangles within each blended
character mesh using the current camera and Babylon's current skinned/morphed
positions. Its reusable workspace computes each referenced vertex's depth once
per draw, keeps an already-correct order, and repairs small changes before
falling back to a full sort. Equal depths retain the authored triangle-ID order.
There is no cross-frame pose cache: bones, morphs, camera changes, and geometry
edits remain live. Only GPU indices are reordered; CPU topology remains in
authored order for picking and FACE surface ownership.

The workspace adds approximately 12 bytes per vertex and 4 bytes per index
over the previous sorter. CPU skinning still runs; reduced sorting work is not
by itself evidence of improved whole-game FPS.

Run the regression checks sequentially:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/TransparentTriangleSort*.test.js
```

The original asset-dependent tests include `YHI_L` and `DOR_L`; the additional
tests cover camera/pose changes, morphs, mirrored transforms, topology edits,
disposal, and randomized comparisons with the original sorting algorithm.

For a controlled same-session comparison, append `?transparentSortDebug=1` to
the client URL. `__newYokosukaTransparentSort.setMode("legacy")` selects the
original sorting algorithm; `setMode("optimized")` restores the default.
`stats()` reports counters since the last mode change or `reset()`. The `off`
mode is diagnostic only: it leaves the last uploaded triangle order in place
and can render transparency incorrectly. This is an algorithm comparison, not
a substitute for comparing the unchanged application before and after a patch.
Normal gameplay has diagnostics disabled and creates no debug global.

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

## Animated neck seams

Matching source positions and UVs is necessary but does not guarantee that two
surfaces stay joined during animation. The production body loader enables
`characterRigSeamMode: "weld"`; the standalone detailed FACE has its own head
skeleton. Before seam deformation was shared, Fuku-san's body boundary used
`matricesWeights = [0.5, 0.5, 0, 0]` while its detailed counterpart used
`[1, 0, 0, 0]`. At frame 185 of `JHW0/SEQDATA8.AUTH`, the ten matching vertices
separated by 2.7–5.4 mm, exposing clothing behind the neck as a pale band.
These weights describe this renderer's existing welding, not recovered native
Dreamcast skinning weights.

Earlier fixture checks omitted `characterRigSeamMode: "weld"` and therefore
incorrectly ruled out a deformation mismatch. Removing textures also hid the
contrast of the gap without closing it. Texture substitution, filtering, and
culling changes did not resolve it; temporarily aligning the animated boundary
did, with textures and normals unchanged.

`NativeAttachmentSeam`, shared by FACE and detailed HAND presentation, binds
signed references to the exact source vertex IDs on the preserved body
attachment node. `applyBodyAttachmentSeam` evaluates those body
vertices using their actual current skin matrices and weights, then converts
them back through the detailed mesh's world and skin transforms. The regular
FACE morph update writes those positions before its normal GPU upload. Only the
small signed boundary is evaluated on the CPU, not either entire mesh. No new
bones, guessed weights, geometry offsets, or texture/normal changes are needed.
The binding is released with the surface lease and rebuilt for the next body.
Skin matrices are prepared with the frame-ID guard bypassed: multiple native
ticks can install new poses within one Babylon render frame, so an ordinary
cached matrix read can otherwise leave the seam one pose behind.

Detailed hands use the same authored-parent binding at the wrist. Their signed
indices must not be deformed as hand vertex zero. Once the seam is bound, the
detailed shell owns the full low-detail hand surface, including its former
wrist connector; preserving that coarse connector duplicates part of the palm.
The body draw indices are restored when the detailed hand releases ownership.

OP02 uses archive-local `SIN_TL.CHRM`/`SIN_TR.CHRM` (299 vertices per hand)
and `SIN_HM.BIN` on Shenhua's `MGR_M` body, with textures from the OP02 PKF
pack. These are not another actor's generic hands. The owner selects the
detailed right/left poses at AUTH slot 4, frame 300 (`0x005e` calls at
`0x11ae`/`0x11ce`, tables `0x2624`/`0x2540`), followed by the left wrist
rotation at `0x11ee`. Earlier shots retain the authored body hands; the final
shot retains the detailed pose. `build_op02_opening_assets.mjs` follows the
compiled owner's frame gates and uses the shared HAND cue translators, while
`NativeAseqHandPresentation` supports both embedded MT5 textures and an
explicit package texture pack. Merely listing HAND resources in the source
graph does not load them: the generated package must include `handAssets`
and its timed hand cues.

Regression coverage uses the production welded GPU path, mesh batching, actor
transforms, multiple head poses, and repeated leases for Ryo, Fuku-san, Ine-san,
Iwao, and Lan Di. It compares the final skinned world-space boundary positions
and checks that ending the lease restores body topology. Source-space bounds
or a textureless silhouette alone are not sufficient evidence of a closed seam.

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
