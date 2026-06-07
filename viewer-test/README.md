# Viewer Test

Local-only tools for debugging Shenmue character MT5 transforms.

Run the interactive lab:

```sh
npm run lab
```

Open the Vite URL ending in:

```text
/viewer-test/
```

Run the static screenshot harness:

```sh
npm run screenshot:ryu
```

Render the wudecon/ShenmueDKSharp OBJ export headlessly:

```sh
npm run screenshot:obj
```

Render the controllable-world proof scene headlessly:

```sh
npm run screenshot:world
```

The world proof writes:

- `output/ryo-world-run-midstride-proof.png`
- `output/ryo-world-run-midstride-proof.json`

Useful settings to try in the lab:

- `Mode`: coarse presets matching the screenshot harness.
- `Hierarchy`: whether MT5 child nodes inherit parent transforms.
- `Root Rotation`: current character correction defaults to `X = -90`.
- `Model Pivot`: tests whether direct geometry should rotate around `model.center`.
- `Position Signs` and `Rotation`: test coordinate-system assumptions.
- `Debug`: compare Ryo head-atlas modes, test backface culling, test signed-strip winding, select a node, show its local axes, or dim unrelated body parts.

Ryo head-atlas modes:

- `Project CW legacy auto region`: current default. It uses the older broad face-region classifier with auto-computed face projection bounds, which currently gives the most coherent front-face placement for Ryo's texture-6 atlas.
- `Project CW hairline repair`: diagnostic fallback. Face uses the fixed-bounds `Project CW` projection, while upper front-side/scalp strips get a targeted left-half side crop repair.
- `Project CW scalp hair repair`: diagnostic mode that keeps the fixed face projection, then maps upper side/scalp shell points into the dark hair band at the top of the left atlas half.
- `Project CW strip scalp hair repair`: diagnostic mode that maps whole upper side/scalp strips into the dark hair band. This avoids mixing hair and skin texels within one coarse triangle strip.
- `Project CW side/back projection`: diagnostic mode that keeps the fixed face projection, then maps side/back shell points into the single-ear left atlas half by head height and front/back position.
- `Project CW side/back projection flipped`: same side/back projection with the front/back atlas axis reversed before left/right mirroring.
- `Project CW`: diagnostic baseline. Face projects into the atlas right half; side/back stays constrained to the left half.
- `Project CW auto bounds`: diagnostic mode that computes face projection bounds from currently classified face strips. Useful for FACE-resource tests, not the base Ryo default.
- `Project CW by raw region`: diagnostic mode that chooses face/side projection per raw atlas half instead of per strip classifier.
- `OBJ raw UVs`: diagnostic mode that exactly follows the wudecon/ShenmueDKSharp OBJ atlas UVs.
- `OBJ side UVs`: current Ryo head default. It keeps the projected face placement and uses wudecon/ShenmueDKSharp-matching raw UVs for side/back head atlas pieces.

Useful Ryo screenshot environment variables:

- `RYU_BACKFACE_CULLING=true`: force material culling for culling diagnostics.
- `RYU_STRIP_WINDING_SIGN=true`: diagnostic culling toggle for strip winding. Static PC Ghidra evidence says Ryo's default opaque parity already matches the PC triangle expansion path.
- `RYU_EMULATE_MIRROR_RESIZE=false`: disable wudecon-style mirror-resize emulation for mirror-flagged textures.
- `RYU_TEXTURE_ALPHA_MODES=6:opaque,8:alphatest`: override texture alpha handling for render-state diagnostics. Supported modes are `opaque`, `alphatest`, and `blend`; keys may be model texture indices or texture ID hex strings.
- `RYU_TEXTURE_Z_OFFSETS=8:-2`: apply Babylon material z-offset diagnostics per texture index or texture ID. Useful for testing whether Ryo's alpha-tested hair cards fail to cover the side shell because of depth ordering.
- `RYU_TEXTURE_ADDRESS_MODE=repeat`: set the global Babylon texture address mode for diagnostics. Supported modes are `mirror`, `repeat`, and `clamp`.
- `RYU_TEXTURE_ADDRESS_MODES=6:repeat,8:clamp`: override address mode per texture index or texture ID.
- `RYU_TEXTURE_COORDINATE_MODE=pc`: diagnostic global source-UV transform. Supported values include `viewer`, `pc`, `pc-flipu`, `pc-flipv`, `pc-flipuv`, `source-rotate-cw`, `source-rotate-ccw`, and `source-rotate-180`.
- `RYU_HEAD_ATLAS_MODE=project-cw`: switch from the default OBJ-side projection to the older fixed-bounds projection. Use `project-cw-auto-legacy-region`, `project-cw-hairline`, `project-cw-auto-legacy-bounds`, `project-cw-scalp-hair`, `project-cw-scalp-strip-hair`, `project-cw-sideproject`, and `project-cw-sideproject-flipu` for side/back projection diagnostics.
- `RYU_HEAD_ATLAS_DEBUG=strip-index`: draw Ryo's head-atlas strips as deterministic per-strip colors instead of texture, useful with the strip dump.
- `RYU_HIDE_NODES=0xd6c8`: hide comma-separated MT5 node offsets for focused node diagnostics.
- `RYU_HIDE_HEAD_ATLAS_STRIPS=0xd648:32,0xd648:0x8290:33`: hide comma-separated `node:strip` or precise `node:entry:strip` pairs on Ryo's head atlas for focused strip diagnostics.
- `RYU_ONLY_HEAD_ATLAS_STRIPS=0xd648:0x8270:5`: render only comma-separated Ryo head-atlas strips matching the same filter format. This is useful for proving which exact strip creates a visible bad face/side patch.
- `RYU_REMAP_HEAD_ATLAS_STRIPS=0xd688:0xae6c:17`: remap exact Ryo head-atlas strips into the dark left-half hair band without hiding them. This is a targeted diagnostic for skin-colored upper side/scalp strips.
- `node viewer-test/render-ryo-strip-sheet.mjs --region side --count 12 --camera-alphas 0,205`: render a contact sheet of the highest side/back head-atlas strip candidates plus a JSON cell map.

Useful world screenshot environment variables:

- `RYO_WORLD_SEQUENCE=AKI_AKI_WALK_LP`: choose the MOTN sequence to pose in the world proof.
- `RYO_WORLD_FRAME=8.55`: choose the sampled animation frame.
- `RYO_WORLD_TEXTURE_ADDRESS_MODE=repeat`: set the world-proof texture address mode for mirror/repeat/clamp diagnostics.
- `RYO_WORLD_OUT=viewer-test/output/custom.png`: choose the output PNG path.

Useful OBJ screenshot environment variables:

- `OBJ_RENDER_FOCUS=head`: frame only head-related materials.
- `OBJ_CAMERA_ALPHA=180`: front-ish comparison angle matching the MT5 harness.
- `OBJ_TEXTURE_ADDRESS_MODE=repeat`: set the wudecon OBJ texture address mode for mirror/repeat/clamp diagnostics.
- `OBJ_UV_TARGET=atlas`: apply UV transforms only to the Ryo face/side-head atlas.
- `OBJ_UV_TRANSFORMS=rotate-cw`: comma-separated transforms such as `rotate-cw`, `rotate-ccw`, `swap`, `flip-u`, and `flip-v`.
