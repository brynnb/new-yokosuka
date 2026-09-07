# Animation and placement tools

Commands below run from the repository root unless noted otherwise.
Raw disc inputs and captures are local, ignored prerequisites; a clean clone
does not contain them. See [runtime asset setup](../runtime-assets.md) for
the separate published-asset restore workflow.

## Animation Analysis

### Runtime skeleton probe

The instrumented Flycast build can save `ram.bin` alongside each exact-frame
PowerVR capture. `ryo_hallway_probe.lua` performs a short deterministic
idle/forward-input/released sequence aligned to VBlank, while
`find_runtime_bone_matrices.js` scans the five synchronized RAM images for
consecutive affine transform arrays.

- `tools/emulator/run_flycast_pvr_capture.sh` installs the passive probe into its
  dedicated Flycast profile. It does nothing until explicitly requested.
- With Flycast open at a state where Ryo has clear space ahead, run
  `tools/emulator/request_ryo_hallway_probe.sh` for the five full-RAM snapshots.
- Run `tools/emulator/request_ryo_matrix_recording.sh` for a 270-frame, exact-word CSV
  recording of both the 37 final matrices and the synchronized 37 animation
  control records: 90 idle frames, 90 D-pad Up frames, then 90 released
  frames. In the current yard save, this captured a one-step transition; it
  is not evidence of a turn or a complete repeating walk cycle.
- Analyze the five resulting `ram.bin` files:
  `node tools/animation/find_runtime_bone_matrices.js idle/ram.bin walk-start/ram.bin walk-mid/ram.bin walk-late/ram.bin stopped/ram.bin`
- Validate a matrix CSV and compare its invariant joint separations with the
  extracted 37-node MT5 skeleton:
  `node tools/animation/analyze_ryo_runtime_matrices.js captures/skeleton/ryo-matrices-TIMESTAMP.csv .disc-work/scene01-models/YKB_M.MT5`

The corrected Shenmue Disc 1 experiment uses Dreamcast D-pad input, not the
analog camera controls. It found Ryo's 37-entry, `0x40`-stride
row-affine matrix block at SH-4 address `0x8CC06E80`: its matrices translated
about `0.856` world units during controlled forward input. The earlier
`0x40`-stride scan also surfaced `0x8CBFE7A0`; later structure inspection
identified that area as another `0x48`-stride animation-control array, not a
second final-matrix array. The final-matrix address remained stable after
loading a later yard save. Ryo's extracted YKB/YKC MT5 models also contain
exactly 37 nodes.

The yard per-frame recording gives an independent structural check: all 270
frames are contiguous and finite, all matrices obey the affine layout, D-pad
Up moves the root about `2.238` world units, and invariant runtime joint
separations reproduce MT5 parent/child lengths such as `0.261257`, `0.242525`,
`0.392729`, and `0.444608` to near float precision. Zero-offset/helper joints
produce duplicate positions, so length matches alone do not prove a unique
node permutation. The analyzer also reports each proposed child's offset in
the proposed parent's rotating coordinate system to support that next step.

`analyze_ryo_runtime_controls.js` decodes the synchronized 72-byte control
records and checks their embedded hierarchy and final-matrix pointers. The
runtime rig is distinct from MT5 depth-first node order: MOTN bone IDs address
the control records at `0x8CC05820`, while each record points to the
same-index final `0x40`-byte matrix at `0x8CC06E80`. Ordinary final local
translations reproduce control translations to float precision. Solver class
`4` marks absolute IK targets (hands, feet, torso, and head), and the
upstream solver-derived joints are the remaining retargeting work.

The subtype-`2` arm/leg path is now reproduced numerically as a conventional
two-bone solve with Shenmue's specific pole rule. It projects the parent
matrix's Z axis onto the plane perpendicular to the root-to-target direction;
the lower class-`3` record's subtype selects the bend sign. Across the
unblended frames in the yard recording, this predicts all four elbow/knee
positions with median error below `2.1e-7` and maximum error below `8.4e-7`.
An SH-4 write trace also shows a later gameplay procedure at `0x0C11089C`
rewriting the two upper-arm matrices. That pass is now reproduced as the
game's relative shoulder/hand twist followed by its signed-int16, 2%-per-tick
roll filter.

- **Usage**: `node tools/animation/analyze_ryo_runtime_controls.js captures/skeleton/ryo-controls-TIMESTAMP.csv captures/skeleton/ryo-matrices-TIMESTAMP.csv`

### compare_ryo_runtime_evaluator.js

Runs the reconstructed 37-control hierarchy, fixed and aimed one-bone paths,
four two-bone solvers, and stateful shoulder-roll correction against a
synchronized emulator control/matrix recording. It rejects VBlank rows where
the live controls and final matrices came from different 30 Hz game ticks,
then reports position, rotation, and raw matrix-element error for every
control and for the 13 matrices actually routed into Ryo's MT5 model.

- **Usage**: `node tools/animation/compare_ryo_runtime_evaluator.js captures/skeleton/ryo-controls-TIMESTAMP.csv captures/skeleton/ryo-matrices-TIMESTAMP.csv`

### analyze_ryo_render_routing.js

Recovers the game's own mapping from animation-control matrices to MT5 render
nodes from an interpreter FPU-read trace. At `0x0C1D1A42`, Shenmue copies a
selected 4x4 control matrix into its render rig; the caller at `0x0C12D736`
supplies the signed low-16 MT5 render key in `r1`. In the yard trace, 13 stable
key-to-matrix routes each repeat 428 times with no conflicts or unresolved
keys. This is the deterministic bridge between the 37-record control rig and
Ryo's differently ordered MT5 hierarchy; MT5 depth-first indices and flag low
bytes must not be treated as MOTN/control indices.

- **Usage**: `node tools/animation/analyze_ryo_render_routing.js captures/analysis/sh4-motion-matrix-fpu-read-trace.csv .disc-work/scene01-models/YKB_M.MT5`

### extract_runtime_placements.js

Recovers placed scene-object instances from an emulator `ram.bin` capture. It
finds the relocated runtime copy of each requested MT5, follows its mesh
pointers into live `HMDL` instances, and resolves the renderer's direct
`TASK + 0x60` HMDL-node pointer before decoding position, signed-angle
rotation, and scale. This direct pointer matters because the HMDL immediately
preceding a TASK may be an interaction/collision proxy for a different model.
Bare model names are fetched from the public asset bucket; local MT5 paths are
also accepted. Static MAP geometry normally reports a runtime model copy but
no instance because its vertices are already authored in map/world coordinates.

- **Usage**: `node tools/worlds/extract_runtime_placements.js captures/pvr/TIMESTAMP-frame-N S1_JOMO_TANM4W3G.MT5 S1_JOMO_TANM4W4G.MT5`
- **Machine-readable**: add `--json`
- **Whole catalog prefix**: `node tools/worlds/extract_runtime_placements.js captures/pvr/TIMESTAMP-frame-N --catalog-prefix S1_JOMO_ --json --out .disc-work/jomo-runtime-placements.json`

### build_runtime_placement_manifest.js

Converts a machine-readable runtime placement report into browser coordinates,
filters objects deliberately parked far outside the active scene, preserves
RAM provenance addresses, reconciles JOMO's complete static door table, and
writes the manifest consumed by `/play`.

- **Usage**: `node tools/worlds/build_runtime_placement_manifest.js .disc-work/jomo-runtime-placements.json play/data/jomo-runtime-placements.json --mapinfo .disc-work/exact/jomo/MAPINFO.BIN`

### MAPINFO CHRS object placement extractor

`extract_mapinfo_character_placements.js` decodes serialized `CHRD/CHRS`
object records. It resolves a model from the record's actual preceding
`Character` expression, then reads the named `Position`, `Angle`, and `Image`
properties. This avoids ambiguous filename/tag matching. BETD uses this
format for its six separately placed exterior objects.

- **Usage**: `node tools/worlds/extract_mapinfo_character_placements.js .disc-work/exact/betd/MAPINFO.BIN --prefix S1_BETD_ --out tools/evidence/betd-mapinfo-placements.json`
- **Evidence and decoded records**:
  [BETD Exterior Object Placement](../../research/shenmue1/betd-object-placement.md)

### MAPINFO static-door placement extractor

`extract_mapinfo_static_doors.js` finds a map's contiguous `DRxx_xxx`
resource-name table, skips its 16-byte resource descriptors, and decodes every
following 36-byte placement record. Both record types `1` and `2` are
preserved. It recovers all 18 JOMO doors and all 120 D000/Dobuita doors.

- **JOMO**: `node tools/worlds/extract_mapinfo_static_doors.js .disc-work/exact/jomo/MAPINFO.BIN --prefix S1_JOMO_`
- **Dobuita**: `node tools/worlds/extract_mapinfo_static_doors.js .disc-work/exact/d000/MAPINFO.BIN --prefix S1_D000_ --out tools/evidence/d000-static-door-placements.json`

### `extract_tagged_runtime_objects.js`

Joins tagged Dreamcast `TASK` transforms to their exact relocated HRCM model
through `TASK + 0x60`, the HMDL render node, and its mesh pointer. This is used
for D000 archive models that the old public model catalog omitted.

- **Usage**: `node tools/worlds/extract_tagged_runtime_objects.js captures/pvr/TIMESTAMP-frame-N .disc-work/exact/d000/unpacked --out .disc-work/d000-tagged-objects.json`

### `build_d000_placement_manifest.js`

Combines D000 tagged-runtime props, the statically recovered five-position
vending-machine branch table, parent-local capsule objects, captured traffic
actors, and all 120 static door records into the browser manifest.

- **Usage**: `node tools/worlds/build_d000_placement_manifest.js .disc-work/d000-entry2-tagged-objects.json tools/evidence/d000-static-door-placements.json play/data/d000-runtime-placements.json tools/evidence/d000-door-logic.json`
- **Method and evidence**: [Dobuita Object Placement](../../research/shenmue1/d000-object-placement.md)

### Runtime object animation probe

`request_drawer_recording.sh` asks the running instrumented Flycast Lua probe
to reload slot 1 and record the focused wardrobe drawer's open/close
interaction at exact VBlank boundaries. The recovered TASK translation,
handle-node rotation, 30 Hz samples, and browser implementation are documented
in [Runtime Object Animation from Dreamcast RAM](../../research/shenmue1/runtime-object-animation.md).

- **Usage**: `tools/emulator/request_drawer_recording.sh`

### Static SH-4 object-transform scanner

`extract_sh4_object_transforms.py` disassembles the native SH-4 routines
embedded in a Dreamcast `MAPINFO.BIN` and extracts direct engine operation
`0x00c9` descriptors. It resolves four-character object tags, HMDL node keys,
position/rotation pointers, set/add/read modes, and initial static-data words.
Runtime-local arguments remain explicitly unresolved. SCN3 may appear at any
MAPINFO file offset; the scanner resolves the token-relative static-data base
instead of assuming that SCN3 follows ATTR immediately.

- **Usage**:
  `tools/scripting/extract_sh4_object_transforms.py MAPINFO.BIN --object TOKE --json`
- **Evidence and ABI**:
  [Runtime Object Animation from Dreamcast RAM](../../research/shenmue1/runtime-object-animation.md)
- **One-way interactions**: `tools/emulator/request_object_once_recording.sh [RAM-base] [byte-count]`

### Complete JOMO object-operation trace

`extract_jomo_object_operations.py` scans every native engine-dispatch call in
JOMO, joins literal object arguments to all 160 live TASK identifiers, and
follows proven generated-tag handle tables. Static-group and runtime-local
cases remain explicitly unbound instead of being assigned by name. The
checked-in manifest includes exact operation IDs, arguments, call sites,
static records, parameterized table provenance, non-runtime literal targets,
and all generic `0x00c9` transforms whose object identity is still unknown.

- **Usage**:
  `tools/worlds/extract_jomo_object_operations.py MAPINFO.BIN play/data/jomo-runtime-placements.json --out tools/evidence/jomo-object-operation-trace.json`
- **Method, status meanings, and door finding**:
  [JOMO Object Operation Trace](../../research/shenmue1/jomo-object-operation-trace.md)

### JOMO browser interaction coverage

`build_jomo_interaction_coverage.js` joins the runtime TASK registry, static
operation groups, placement manifest, and browser behavior registry. It
reports every implemented interaction and every statically grouped object
that still lacks one.

- **Usage**: `node tools/worlds/build_jomo_interaction_coverage.js`
- **Coverage method and current families**:
  [JOMO Interaction Coverage](../../research/shenmue1/jomo-interaction-coverage.md)

### JOMO interaction model-route audit

`audit_jomo_interaction_models.js` loads every distinct MT5 assigned an
interaction through the production loader and verifies that its actual node
hierarchy contains the render keys required by that behavior. This prevents a
registry-only coverage result from claiming a door is implemented when
registration would silently fail after loading the model. It also applies
each mechanical endpoint and requires nonzero world-space vertex displacement,
so valid geometry with an ineffective animation route fails the audit.

- **Usage**:
  `node tools/worlds/audit_jomo_interaction_models.js play/data/jomo-runtime-placements.json --out tools/evidence/jomo-interaction-model-audit.json`

### JOMO browser placement coverage

`build_jomo_placement_coverage.js` verifies that every active RAM instance,
all 18 static door records, and all nine static JOMO map models are represented
by the browser loading pipeline. Loaded resources without a world instance
remain explicit and are not automatically placed.

- **Usage**: `node tools/worlds/build_jomo_placement_coverage.js`
- **Coverage method and current invariants**:
  [JOMO Placement Coverage](../../research/shenmue1/jomo-placement-coverage.md)

### Runtime placement instance audit

`audit_runtime_placement_instances.js` loads every manifest placement through
the production `Mt5Loader`, applies its browser transform, and requires a
finite, visible, renderable scene hierarchy. Unlike record-level coverage,
this catches a valid manifest entry whose asset silently produces no browser
root or geometry. The `/play` loader runs the same invariant and exposes its
latest summary as `window.__NEW_YOKOSUKA_PLACEMENT_AUDIT__` in local
development.

- **Hazuki interior**:
  `node tools/worlds/audit_runtime_placement_instances.js play/data/jomo-runtime-placements.json --out tools/evidence/jomo-runtime-instance-audit.json`
- **Hazuki exterior**:
  `node tools/worlds/audit_runtime_placement_instances.js tools/evidence/betd-mapinfo-placements.json --out tools/evidence/betd-runtime-instance-audit.json`

- **Cross-world object completion gate**:
  `node tools/worlds/audit_world_object_completeness.js`
  consolidates source-record coverage, visible model instantiation, static
  map/door coverage, interaction-route verification, unresolved operation
  semantics, and deliberately omitted dynamic tags. It is intentionally red
  while any source-backed object category remains incomplete; this prevents
  an absent asset from disappearing from the audit merely because the browser
  never instantiated it.
- **Dobuita**:
  `node tools/worlds/audit_runtime_placement_instances.js play/data/d000-runtime-placements.json --out tools/evidence/d000-runtime-instance-audit.json`

### dump_motn.js
Parses Shenmue MOTN animation tables such as `MISC/MOTION.BIN` or `MOTION/MOTION.BIN`, listing sequence names, offsets, bone IDs, translation/rotation channel descriptors, per-channel frame indices, and half-float value samples decoded from the 2-bit value flag stream. It also recognizes the old `flagHigh=0x8000` 60x32-byte legacy frame records so they are not misread as normal bone-curve data. Dreamcast RAM tracing and SH-4 disassembly establish the sample layouts as `[value]`, `[shared tangent, value]`, and `[incoming tangent, outgoing tangent, value]`. Shenmue's sampler at `0x0C093390` uses the standard cubic Hermite basis and a `1/30` time-scale constant, so playback now reproduces that equation at 30 frames per second. Rotation values and tangents are in turns, consistent with MT5 rotations, and sampled rotation values are converted to radians for Babylon.
- **Usage**: `node tools/animation/dump_motn.js /path/to/motion.bin --filter AKI_AKI_RUN --limit 12`
- **Usage**: `node tools/animation/dump_motn.js /path/to/motion.bin --filter AKIRA --json`
- **Usage**: `node tools/animation/dump_motn.js /path/to/motion.bin --filter AKI_AKI_RUN_LP --json --curves`

### validate_ryo_motions.js
Legacy direct-MT5 coverage diagnostic. It remains useful for parser and value
stream audits, but the emulator trace has since proven that correct playback
must pass descriptor/control IDs through the separate 37-control runtime rig
and its 13 MT5 render routes. Use `validate_ryo_motn_runtime.js` for current
playback validation.
- **Usage**: `node tools/animation/validate_ryo_motions.js --filter 'AKI_AKI_(RUN|WALK)_LP' --samples 5`
- **Usage**: `node tools/animation/validate_ryo_motions.js --filter '^AKI_' --samples 5 --json > .disc-work/analysis/ryo-motion-coverage-aki.json`
- **Review output**: `.disc-work/analysis/ryo-motion-review-needed.json` records the current review-needed, warning-only, and known legacy frame-only sequence lists derived from the coverage JSON.

### validate_ryo_motn_runtime.js

Samples one extracted MOTN sequence in storage units, performs the game's
turns-to-int16 truncation, builds Ryo's 37 runtime controls, evaluates all
solver and shoulder passes, and checks every output matrix for finite affine
and orthonormal invariants. It also reports solver-length deviation and root
cycle displacement without using screenshots as the correctness oracle.

- **Usage**: `node tools/animation/validate_ryo_motn_runtime.js --sequence A_WALK_L_02`
- **Usage**: `node tools/animation/validate_ryo_motn_runtime.js --sequence AKI_AKI_RUN_LP --json`

### compare_ryo_extracted_walk.js

Compares file-extracted MOTN curves with the synchronized emulator oracle
without using screenshots. It detects the exact repeated walk pose in the
runtime control CSV, derives the 28-game-tick period, phase-fits candidate
37-sample MOTN sequences after allowing only a static per-axis bind offset,
and reports root-normalized matrix-element RMS for all 13 MT5 render routes.
The SH-4 sampler proves that a duration is a sample count: its duplicated
terminal key is at `duration - 1`, so `A_WALK_L_02` spans 36 interpolation
frames over 28 game ticks. The recovered runtime also cross-routes paired
limb controls, applies target-specific mirror/offset profiles, and clamps the
two planted-foot targets to Y `0.117`.

The current oracle selects `A_WALK_L_02` over `AKI_AKI_WALK_LP` and reproduces
the captured render matrices at RMS `0.000017` (worst matrix element
`0.000156`) when the capture's two stateful shoulder-filter values are
aligned. The comparator separately reports the settled-loop shoulder result,
because the recording begins while that slow 2% filter is still converging
from its preceding animation.

- **Usage**: `node tools/animation/compare_ryo_extracted_walk.js`
- **Usage**: `node tools/animation/compare_ryo_extracted_walk.js --controls captures/skeleton/ryo-controls-TIMESTAMP.csv --matrices captures/skeleton/ryo-matrices-TIMESTAMP.csv --json`

### audit_ryo_foot_contact.js

Measures Ryo's shoe contact without judging screenshots. It finds the physical
sole vertices from the lowest source-space band of MT5 shoe nodes `28/29` and
`32/33`, fits a plane through those vertices, and evaluates the same points
through both the captured emulator matrices and the extracted MOTN runtime.
The comparison is root-local, so actor position and heading do not hide pose
errors.

For the captured `A_WALK_L_02` cycle, extracted and captured sole points agree
at about `0.0000082` RMS with a worst point below `0.000021`. The captured
game is not applying a separate flat-foot pass: its planted sole planes range
from about `0.5` to `5.7` degrees and their lowest points range from roughly
`0.001` above to `0.015` below the nominal Y=0 ground plane. This agrees with
the independent render-routing trace. Lower-leg MT5 nodes `27` and `31`
receive runtime matrices `7` and `14`, while their shoe descendants receive
no independent matrix among the 13 observed routes. The feet therefore
inherit lower-leg orientation after the position-only two-bone IK target is
clamped to Y `0.117`; forcing the soles flat in the browser would diverge from
the original game.

- **Usage**: `node tools/animation/audit_ryo_foot_contact.js`
- **Sensitivity check**: `node tools/animation/audit_ryo_foot_contact.js --sole-band 0.001`
- **MT5 hierarchy**: `node tools/animation/audit_ryo_foot_contact.js --describe`
- **Machine-readable output**: `node tools/animation/audit_ryo_foot_contact.js --json`

## MT5 Character Diagnostics

### dump_mt5_atlas.js
Dumps per-strip evidence for a specific MT5 texture/material, including node offset, texture ID, signed strip length/winding hint, PC HRCM strip-group length/padding checks, raw and converted UV ranges, UVH/mirror flags, fixed-size `0x0008`/`0x000a` state values, source/render position and normal stats, and the current deterministic Ryo face-vs-side atlas classification. Use `--vertices` when raw per-vertex UV/position records are needed for evidence artifacts.
- **Usage**: `node tools/assets/dump_mt5_atlas.js public/models/S2_YDB1_YKC_M.MT5 --limit 20`
- **Usage**: `node tools/assets/dump_mt5_atlas.js public/models/S2_YDB1_YKC_M.MT5 --json --vertices > .disc-work/analysis/ryo-head-atlas-strip-vertices.json`
- **Usage**: `node tools/assets/dump_mt5_atlas.js public/models/S2_YDB1_FUK_M.MT5 --texture 0 --limit 12`
- **PC length evidence**: static Ghidra decompilation of the PC executable's HRCM texture-ID walker shows opcode `0x0009` selects textures and strip groups use a length-prefixed payload. The dump reports `entryLengthBytes`, `entryPaddingBytes`, `entryOverrunBytes`, and `entryLengthMatchesPcSkip` to catch parser desync without running Wine or any `.exe`.

### audit_mt5_model_state.js
Scans every mesh opcode stream in an MT5/HRCM model and summarizes texture state across all materials. This is the broad audit for UVH, mirror flags, UV size, fixed-size state records, strip types, PC length/padding checks, FACE marker roles, and wudecon/ShenmueDKSharp compatibility. It is useful before assuming a texture problem is a UV atlas problem.
- **Usage**: `node tools/assets/audit_mt5_model_state.js public/models/S2_YDB1_YKC_M.MT5`
- **Usage**: `node tools/assets/audit_mt5_model_state.js public/models/S2_YDB1_YKC_M.MT5 --json > .disc-work/analysis/ryo-mt5-state-audit.json`
- **Ryo evidence**: texture `6:a64b425f4b414a5f` has no mirror flags and uniform `s8=0x0`/`sA=none` fixed state, while texture `8:a64b425f4b414d5f` has `mirrorU`, matching wudecon's mirrored hair-card behavior.
- **FACE marker evidence**: the audit reports signed low-16 HRCM markers. Ryo `S2_YDB1_YKC_M.MT5` has one `-0x43` FACE head hook selecting children `0xd688`/`0xd6c8`, but no `-0x44` FACE patch destination. Fuku-san `S2_YDB1_FUK_M.MT5` exposes raw `-0x44` children under its FACE head hooks, matching the PC FACE patch path.

### find_mt5_texture_refs.js
Scans MT5 files for an exact 8-byte texture ID. This is the fast way to find alternate character, face, or scene resources that reference a known atlas before doing slower per-model audits or renders.
- **Usage**: `node tools/assets/find_mt5_texture_refs.js a64b425f4b414a5f`
- **Usage**: `node tools/assets/find_mt5_texture_refs.js a64b425f4b414a5f extracted_files extracted_disc2_v2 --json > .disc-work/analysis/ryo-head-atlas-texture-refs.json`
- **Ryo evidence**: Ryo's combined face/side-head atlas appears in raw `MODEL/CHARA/YK*_M.MT5` variants and `MODEL/FACE/YK*_F.MT5` resources, but the cleaner-looking `YKG_M` variant is not a drop-in replacement because it has a different node count and body/head resource layout.

### dump_face_ftbl.js
Dumps Shenmue FACE `*_FTBL.BIN` tables and, when a sibling `*_F.MT5` exists, compares the inferred table layout against the FACE MT5 mesh/node/vertex counts. This is the current static diagnostic for deciding whether FTBL is a direct FACE UV/vertex map or a separate expression/control table. The tool scans headers, fixed-size 36-byte interpretations, opening 48-byte float/control records, dense marker/index clusters, and small 0x100-byte section windows without running Wine or any `.exe`.
- **Usage**: `node tools/animation/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE/YKB_FTBL.BIN --limit 12`
- **Usage**: `node tools/animation/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE/YKB_FTBL.BIN --json --limit 12 > .disc-work/analysis/ryo-ykb-face-ftbl.json`
- **Usage**: `node tools/animation/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE --json --limit 0 > .disc-work/analysis/face-ftbl-summary.json`
- **Ryo evidence**: `YKB_FTBL.BIN` begins with 25 contiguous 48-byte controls. Header offsets `0x24`, `0x28`, and `0x2c` delimit the per-primary-vertex counts, flat control indices, and parallel float weights. The primary `YKB_F.MT5` node has 311 vertices and consumes exactly 428 index/weight pairs; its two child nodes contain the remaining 38 eye vertices. This is weighted face-control data, not a UV table.
- **SH-4 static cross-check**: the Dreamcast face update attaches `_F.MT5`/`_FTBL.BIN`, updates weighted face vertices, and schedules blinks at 60, 70, 80, or 90 30 Hz frames. Blink transitions select complete `TALK_*` poses 0/1 over two or four frames; those values are not FTBL control indices. The browser uses the body rig's signed `-67` FACE attachment and the face model's render-key-`3` root.

### extract_native_face_poses.py

Runs the original Shenmue I SH-4 TALK control builder in a disposable Flycast
GDB session and emits exact control-pose metadata for every declared native
face. It verifies the pinned executable and `TALK_N00.BIN`, supplies only each
25-record FTBL control section, evaluates all integer pose times `0..79` on
both native lanes, and checks Ryo mouth pose 1 bit-for-bit against an
independent live trace. This retains every clip family selected by native
operation `0x0113`, rather than only neutral/blink and the first six speech
shapes. It uses no screen automation.

- **Prerequisite**: start Flycast with the pinned slot-3 state auto-loaded,
  interpreter mode, and GDB port 3264, then leave that fresh process paused.
- **Usage**: `python3 -m tools.animation.extract_native_face_poses`
- **Output**: `play/assets/cutscenes/native-faces/native-talk-poses.generated.json`

`generate_native_dialogue_selector_data.py` joins ordinary NPC messages to
their extracted SRF records. Its v3 browser modules store exact cues in the
compact `srf1:` form: repeated unsigned shape bytes and little-endian 16-bit
durations encoded as Base64. The source inventory remains explicit JSON, and
`NativeLipSync` validates and expands the packed form before playback.

### build_ryo_asset_matrix.js
Builds a static body/FACE/FTBL matrix for Ryo-family `YK*` assets across the local Dreamcast and PC extraction folders. It combines MT5 state audits, FACE marker counts, Ryo head-atlas strip counts, file hashes, and FTBL record-vs-FACE-vertex comparisons into a JSON evidence file plus a Markdown table.
- **Usage**: `node tools/animation/build_ryo_asset_matrix.js`
- **Outputs**: `.disc-work/analysis/ryo-asset-matrix.json` and `.notes/ryo-asset-matrix.md`
- **Ryo evidence**: the current matrix shows all available Ryo-family body meshes have a `-0x43` head hook and no raw `-0x44` FACE patch destination; swapping among YKB/YKC/YKD/YKG body meshes does not remove the remaining cheek/side-head atlas artifact in no-cull renders.

### dump_wudecon_obj_atlas.js
Parses a wudecon/ShenmueDKSharp OBJ + MTL export and dumps the final OBJ UV evidence for a texture/material. This is the comparison tool for checking whether the MT5 loader's Ryo head atlas interpretation agrees with the exported OBJ texture regions. The default texture is Ryo's MT5 atlas ID `a64b425f4b414a5f`, which appears in wudecon as byte-reversed `5f4a414b5f424ba6`.
- **Usage**: `node tools/assets/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --limit 12`
- **Usage**: `node tools/assets/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --json --vertices > .disc-work/analysis/ryo-wudecon-obj-atlas.json`
- **Usage**: `node tools/assets/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --texture a64b425f4b414a5f --material mat_5f4a414b5f424ba6 --json`

### compare_mt5_wudecon_atlas.js
Compares the MT5 strip dump against the wudecon OBJ dump at face level. It reconstructs MT5 triangle-strip faces, matches them to OBJ faces by position, and reports UV error for raw OBJ UVs, the current `project-cw` viewer mapping, and hybrid diagnostic modes.
- **Usage**: `node tools/assets/compare_mt5_wudecon_atlas.js .disc-work/analysis/ryo-head-atlas-strip-vertices.json .disc-work/analysis/ryo-wudecon-obj-atlas.json`
- **Usage**: `node tools/assets/compare_mt5_wudecon_atlas.js .disc-work/analysis/ryo-head-atlas-strip-vertices.json .disc-work/analysis/ryo-wudecon-obj-atlas.json --json --samples 20 > .disc-work/analysis/ryo-mt5-vs-wudecon-atlas-compare.json`

### analyze_ryo_head_uv_mapping.js
Runs a nonvisual audit of Ryo's raw head-atlas mapping. It enumerates the finite U/V axis, flip, rotation, address-mode, and strip-repacking hypotheses, then measures atlas-half agreement, shared-edge UV continuity, texture-color error across discontinuities, physical triangle distortion, and PVR `TWIDDLED_RECT` source-index layout. The audit uses the browser's PVR decoder directly and does not treat a screenshot or the wudecon OBJ as visual ground truth.
- **Usage**: `node tools/animation/analyze_ryo_head_uv_mapping.js public/models/S2_YDB1_YKC_M.MT5 public/wudecon-obj/ryo/tex_5f4a414b5f424ba6.pvr`
- **Runtime usage**: `node tools/animation/analyze_ryo_head_uv_mapping.js public/models/S2_YDB1_YKC_M.MT5 public/wudecon-obj/ryo/tex_5f4a414b5f424ba6.pvr --texture-pack public/models/character-textures.bin`
- **Usage**: `node tools/animation/analyze_ryo_head_uv_mapping.js public/models/S2_YDB1_YKC_M.MT5 public/wudecon-obj/ryo/tex_5f4a414b5f424ba6.pvr --json > .disc-work/analysis/ryo-head-uv-mapping-audit.json`
