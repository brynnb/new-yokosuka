# Asset extraction tools

Commands below run from the repository root unless noted otherwise.
Raw disc inputs and captures are local, ignored prerequisites; a clean clone
does not contain them. See [runtime asset setup](../runtime-assets.md) for
the separate published-asset restore workflow.

## Legacy Shenmue I extraction pipeline

`extract_all.py` coordinates the older Disc 1/2 pipeline. Its model-sync step
deletes and rebuilds `public/models/`; use it only with complete source roots
and a disposable output directory. It is not an all-disc rebuild command or
the setup path for a clean application clone. For additive Disc 3 processing,
use [isolated extraction](../shenmue1-extraction.md).

The legacy command is:
```bash
python3 -m tools.assets.extract_all
```

This single script runs all the steps below in order:

```
gamedata/disc1/*.gdi + gamedata/disc2/*.gdi
    │
    ├─ [Step 1] gditools3.py ──→ extracted_files/ + extracted_disc2_v2/
    │
    ├─ [Step 2] sync_models.py ──→ public/models/*.MT5 + *_textures.bin + models.json
    │
    ├─ [Step 3] convert_sky_textures.py ──→ public/textures/sky/*.png
    │
    └─ [Optional] upload_to_r2.js ──→ push to Cloudflare R2
```

### extract_all.py
Runs the full extraction pipeline: GDI extraction → model processing → sky texture conversion.
- **Usage**: `python3 -m tools.assets.extract_all`
- **Usage**: `python3 -m tools.assets.extract_all --skip-extract` (skip GDI extraction)
- **Usage**: `python3 -m tools.assets.extract_all --extract-only` (only extract GDI)

## Web Viewer Sync

### sync_models.py
The core bridge between extracted files and the web viewer. Processes raw extracted folders, identifies models and textures, and packs them into the compressed `.bin` files and `models.json` catalog used by the renderer.
- **Usage**: `python3 -m tools.assets.sync_models [extracted_base_dir]`

### export_viewer_textures.mjs

Exports the Shenmue I textures consumed by the viewer to ordinary image files.
It reads the processed texture packs and MT5 embedded textures, uses the same
PVR decoder as the renderer, preserves source alpha, and organizes output by
area, time-of-day variant, and embedded model. The export also includes JSON
and CSV manifests, duplicate hashes, and paginated contact sheets.

The default `S3` namespace is the current consolidated Shenmue I viewer corpus.
UI, sky, and other resources outside that corpus are intentionally excluded.
Individual textures are lossless PNGs whenever they fit the default 10 MiB
limit. An oversized image first tries lossless WebP, then an alpha-preserving
WebP quality fallback. Contact sheets use WebP.

- **Export everything**: `npm run export:textures`
- **Export Dobuita only**: `npm run export:textures -- --area D000`
- **Choose an output directory**:
  `npm run export:textures -- --output /path/to/shenmue-textures`
- **Replace an existing export**: add `--force`
- **Change the per-image limit**: add `--max-mb 10`

### generate_mt5_overlay_manifest.js
Offline geometry analysis for MT5 facade details that were authored almost
coplanar with a larger backing surface, such as windows, shutters, flat doors,
and signs. The analyzer works from geometry rather than filenames or texture
names: it finds small, parallel faces that are almost fully contained by a
larger face, assigns a stable overlay rank, and writes the original MT5 node,
texture, and face IDs to `play/data/mt5-overlay-manifest.json`.

At runtime `Mt5Loader` only splits the listed faces and gives the resulting
material a Babylon `zOffset`/`zOffsetUnits` bias. It does not rewrite the MT5
binary, move vertices, or make the browser analyze every mesh.

- **Usage**: `npm run build:mt5-overlays`
- **Limit to one family while developing**:
  `node tools/assets/generate_mt5_overlay_manifest.js --match 'S2_MFSY_MAP11'`
- **Add another extracted-model search root**:
  `node tools/assets/generate_mt5_overlay_manifest.js --root /path/to/models`

Regenerate the manifest after replacing map MT5 binaries. Definitions carry
the source byte length and are ignored at runtime when it does not match, so a
stale entry cannot silently be applied to a differently sized model.

### upload_to_r2.js
Shared publisher for the Shenmue I and Shenmue II model libraries. Shenmue I
keeps the runtime's flat `shenmue/` object layout; Shenmue II uses
`shenmue/shenmue2/models/`, `shenmue/shenmue2/textures/`, and a deployment
catalog at `shenmue/shenmue2/models.json`. Content is uploaded before catalogs,
uploads are skipped only when their recorded SHA-256 matches, and the command
never deletes remote objects.

- **Dry-run Shenmue I**: `npm run upload:assets -- --game s1 --dry-run`
- **Dry-run Shenmue II**:
  `npm run upload:assets -- --game s2 --s2-root /path/to/shenmue2-disc1-models --dry-run`
- **Publish both**:
  `npm run upload:assets -- --game all --s2-root /path/to/shenmue2-disc1-models`
- **Credentials**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`,
  and `R2_BUCKET_NAME` in the environment or root `.env`
- **Authenticated Wrangler fallback**: start the localhost-only bridge with
  `npx wrangler dev --config tools/r2-asset-upload-worker/wrangler.jsonc --ip 127.0.0.1 --port 8798`,
  then add `--worker-url http://127.0.0.1:8798` to the same upload command

## Archive & Texture Utilities

### extract_pc_tac.js
Lists and extracts files from the PC HD release `.tad/.tac` archive pairs using native Node.js only. It can map TAC hashes through Shenmunity `Names.txt`, optionally decompress gzip entries, and records offsets, lengths, SHA-1 hashes, source paths, and output paths in JSON. This is the repeatable PC-archive path; it does not run Wine or Windows binaries.
- **Usage**: `node tools/assets/extract_pc_tac.js --names /path/to/Shenmunity_plugin/Names.txt --archive disk --filter 'YKB_M|YKC_M|MOTION'`
- **Usage**: `node tools/assets/extract_pc_tac.js --names /path/to/Shenmunity_plugin/Names.txt --archive disk --hash 0A654E09 --extract --out .disc-work/analysis/pc-sm1-ryo --json`

### extract_afs.js
Lists and extracts child packages from Shenmue `AFS` archives, including nested `PAKF`/`PAKS` IPAC children. This is useful for inspecting `HUMANS.AFS` character packages such as the paired texture/CHRT and model/SCNF records.
- **Usage**: `node tools/assets/extract_afs.js .disc-work/analysis/pc-sm1-ryo/SCENE/01/STREAM/HUMANS.AFS --entry 696 --entry 697`
- **Usage**: `node tools/assets/extract_afs.js .disc-work/analysis/pc-sm1-ryo/SCENE/01/STREAM/HUMANS.AFS --entry 696 --entry 697 --extract --out .disc-work/analysis/pc-sm1-ryo/HUMANS-YKDM --json`

### extract_dialogue_progress_state.py
Verifies the native 325-record free-conversation progress table and the
two-stage resume rules needed to decode yielded actor dialogue bytecode
without false linear fallthrough.
- **Usage**: `npm run extract:dialogue-progress-state`

### extract_dialogue_actor_body_routes.py
Decodes selector-returned actor conversation bodies with the resumable outer
interpreter and separate nested message-construction interpreter, preserving
shared routines and explicit dynamic continuations. Class-`0xC0` manager and
person runtime-field writes retain the exact native target, width, signedness,
value, and corpus frequency.
- **Usage**: `npm run extract:dialogue-actor-body-routes`

### extract_dialogue_predicate_values.py
Verifies the native state-bank, runtime-component, actor-value, spatial-value,
and ordered-comparison sources used by actor conversation predicate programs,
including the exact year/month/day/weekday/hour/minute calendar layout and
the thirteen executable-resident D000/MFSY spatial predicate circles.
- **Usage**: `npm run extract:dialogue-predicate-values`

### extract_tmnm_parameter_operation_evidence.py
Verifies native operation `0x00ec` against the exact executable handler and
all-disc authored-call inventory. It retains literal record tag `TMNM`, raw
record offsets and float32 comparison gates, the optional resource boundary,
and the single malformed unresolved call without assigning guessed gameplay
names.
- **Usage**: `npm run extract:tmnm-parameters`

### extract_hndl_hndr_component_operation_evidence.py
Verifies operation `0x00eb` against its exact executable handler, literal
`HNDL`/`HNDR` record resolvers, pointer-`+0x10` vector helpers, component masks,
and all 566 authored calls. Raw addition remains distinct from float32
arithmetic and no coordinate-space name is inferred.
- **Usage**: `npm run extract:hndl-hndr-components`

### extract_operation_016d_evidence.py
Verifies operation `0x016d` against its exact executable dispatch, four helper
boundaries, signed fixed-global query, native no-op route, and all-disc call
inventory. Opaque helpers remain mandatory raw adapters and the `SNDT` literal
does not supply a guessed gameplay-domain name.
- **Usage**: `npm run extract:operation-016d`

### extract_operation_0002_evidence.py
Pins operation `0x0002` and its `SCNT` constructor, then audits every
reachable child-coroutine call across the 136 Disc 1–3 MAPINFO programs. It
records exact SCN3-relative fixed targets, stack cleanup across nested engine
calls, and the 18 launches that copy one live frame word beyond their explicit
operands. It also preserves 288 runtime-selected operation-`0x009a` mode-8
launches as their exact ordered 38-entry tables and 13 legal child targets;
21 compiler-registered mode-4 selectors as bounded four-entry choices; and 10
function pointers propagated through exact incoming coroutine payloads. Ten
tail calls recover their argument count only by following an unconditional
branch to a shared `r13` cleanup. The resulting inventory contains 7,701 exact
reachable launches across 119 maps and no unresolved reachable `0x0002` call.
- **Usage**: `npm run extract:operation-0002`

### extract_operation_0166_control_evidence.py
Verifies operation `0x0166` modes 2, 3, 8, 13, and 18 against the complete
native handler, exact subordinate helper hashes and fixed dependencies, and
all-disc mode/argument-shape inventory. Opaque record/list cleanup remains at
mandatory low-level adapter boundaries.
- **Usage**: `npm run extract:operation-0166-control`

### extract_operation_0120_evidence.py
Verifies all three operation `0x0120` routes against the native handler,
fixed-table helper hashes and literal addresses, exact 32-record layouts, and
all 220 authored calls. It also pins the `CLIP` loader, exact native MAP-layer
index route, record-presence setter, and consumer gate. Modes zero and one
control CLIP processing for those numbered layers; mode two's separate
96-byte-record field remains explicitly unnamed and has no browser adapter.
- **Usage**: `npm run extract:operation-0120`

### extract_operation_001c_evidence.py
Verifies operation `0x001c` against its complete handler, four exact flag
routes, direct/associated output helpers, low16 postprocessing, deeper
`MOMT`-dependent query boundaries, and all 1,001 authored calls.
- **Usage**: `npm run extract:operation-001c`

### extract_operation_008f_evidence.py
Verifies operation `0x008f` against its complete handler, exact zero and
nonzero argument-one orchestration, all ten literal subordinate dependencies,
and all 413 authored detections. The 410 well-formed calls are proven while
the three malformed zero-argument dialogue detections remain unresolved.
- **Usage**: `npm run extract:operation-008f`

### extract_operation_019f_evidence.py
Verifies all 74 operation `0x019f` calls against the complete native handler,
literal `MOMT` controller accessor, raw record dword `+0x18`, exact bit-24
mask, and missing-actor/controller boundaries. The bit's consumer meaning
remains explicitly unknown.
- **Usage**: `npm run extract:operation-019f`

### extract_operation_018e_evidence.py
Verifies all 124 operation `0x018e` calls against the complete handler, exact
byte-writer helper, and absolute byte address `0x0c201fe0`. Only the authored
values zero and one are promoted; the byte's meaning remains unknown.
- **Usage**: `npm run extract:operation-018e`

### extract_operation_0194_evidence.py
Verifies all 112 operation `0x0194` calls against the complete handler, three
exact helper routes, low-byte query result, and all-disc mode and argument
inventory. The helper subsystem remains behind three mandatory neutral
adapters and receives no inferred gameplay-domain meaning.
- **Usage**: `npm run extract:operation-0194`

### extract_game_state_byte_control_evidence.py
Verifies ten exact operation-`0x01af` byte-state selectors against the complete
dispatcher, pair-record resolver, fixed and indexed native offsets, result
writer, and all-disc authored inventory. The pair allocator and every field's
domain meaning and persistence owner remain unknown.
- **Usage**: `npm run extract:game-state-byte-control`

### extract_spatial_bounds_query_evidence.py
Verifies all 213 operation-`0x000a` calls against the complete handler, object
resolver, position reader, pointer-backed bound vectors, optional origin
offset, normalized X/Z endpoints, and inclusive containment result. Missing
objects retain the native zero vector; no higher-level region meaning is
inferred.
- **Usage**: `npm run extract:spatial-bounds-query`

### extract_spatial_distance_angle_query_evidence.py
Verifies operation `0x000b` against its complete five-argument handler, exact
three-float magnitude and binary-angle helpers, inclusive distance boundary,
exclusive wrapped-angle boundary, and all-disc authored inventory. It promotes
only calls with complete vector and scalar provenance; no proximity, facing,
or trigger-domain meaning is inferred.
- **Usage**: `npm run extract:spatial-distance-angle-query`

### extract_secondary_operation_0001_runtime_slot_evidence.py
Verifies secondary operation `0x0001` subcommands 6 and 13 against the exact
command dispatcher, free-slot search, allocator, status consumer, sixteen-slot
layout, and all-disc authored inventory. Numeric slot fields remain unnamed,
and missing room-manager state is an explicit runtime stop.
- **Usage**: `npm run extract:secondary-operation-0001-runtime-slots`

### extract_secondary_operation_0001_nearest_descriptor_evidence.py
Verifies secondary operation `0x0001` subcommand 5 against the command
dispatcher, key-two indirect lookup, squared float32 three-vector distance,
strict first-wins comparison, and all twelve JOMO calls across three discs.
- **Usage**: `npm run extract:secondary-operation-0001-nearest-descriptor`

### extract_object_link_field_evidence.py
Verifies operation `0x0043` against the complete handler, object-plus-four
field-zero write, null/indexed-slot/resolved-object target routes, and two
ordered three-word capture/reconciliation pairs. It promotes 880 exact calls
and leaves seven malformed detections unresolved without inferring parent,
attachment, or targeting semantics.
- **Usage**: `npm run extract:object-link-field`

### extract_face_clip_control_operation_evidence.py
Verifies operation `0x0113` against its actor resolver, literal
`MOMT`/`FACE`/`CLIP` prerequisites, exact byte/word record writes, native
signedness and clamping, and all 1,067 authored detections.
- **Usage**: `npm run extract:face-clip-control`

### generate_native_dialogue_predicate_data.py
Generates the compact browser calendar/operator/spatial tables consumed by the
strict native dialogue predicate evaluator. Missing story or actor state stays
unresolved at runtime instead of being replaced by a guessed value.
- **Usage**: `npm run generate:dialogue-predicate-data`

### unpack_ipac.py
Unpacks the game's standard archive format (IPAC), typically found in files with `.PKF` and `.PKS` extensions.
- **Usage**: `python3 unpack_ipac.py [FILE.PKF]`

### pvr_decoder.py
Shared PVR texture decoding library. Handles RECTANGLE, TWIDDLED, and TWIDDLED_RECT data formats with ARGB1555, RGB565, and ARGB4444 color formats. Used by both `pvr_to_png.py` and `convert_sky_textures.py`.

### pvr_to_png.py
Converts individual Dreamcast PVR/PVRT texture files to PNG images.
- **Usage**: `python3 pvr_to_png.py <pvr_file> [png_file]`

### convert_sky_textures.py
Batch converts sky textures from original Dreamcast PVR files to PNG. Source PVR files are in `extracted_tex/` within this directory.
- **Usage**: `python3 convert_sky_textures.py` (converts all `air*.pvr` files)
- **Usage**: `python3 convert_sky_textures.py air00.pvr air05.pvr` (convert specific files)

### build_d000_closed_door_voice_pack.mjs
Rebuilds the reviewed SA1081 and SA1088 D000 storefront voice pack from exact
Disc 1 AFS members. It hash-checks both archives, decodes only the referenced
STR members with vgmstream r2117, and writes a source/member/output manifest.
- **Usage**: `npm run build:d000-closed-door-voices`

### gditools3.py & iso9660.py
Third-party utilities for extracting raw Dreamcast `.GDI` disc images.
`gditools3.py` is GPL v3; `iso9660.py` uses its upstream MIT-style permission
grant with an acknowledgement condition. See [license provenance](../../../tools/licenses/README.md).
