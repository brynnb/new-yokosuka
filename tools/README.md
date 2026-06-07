# Shenmue Research & Extraction Tools

This directory contains the complete pipeline used to reverse-engineer and extract assets from the original Dreamcast version of Shenmue, and prepare them for the web viewer. These tools were originally developed across multiple repositories and have been consolidated here.

## Full Extraction Pipeline

The recommended way to run the full pipeline is:
```bash
python3 tools/extract_all.py
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
- **Usage**: `python3 tools/extract_all.py`
- **Usage**: `python3 tools/extract_all.py --skip-extract` (skip GDI extraction)
- **Usage**: `python3 tools/extract_all.py --extract-only` (only extract GDI)

## Web Viewer Sync

### sync_models.py
The core bridge between extracted files and the web viewer. Processes raw extracted folders, identifies models and textures, and packs them into the compressed `.bin` files and `models.json` catalog used by the renderer.
- **Usage**: `python3 sync_models.py [extracted_base_dir]`

### upload_to_r2.js
Node.js script that pushes packed model and texture assets to Cloudflare R2 for CDN delivery.
- **Requires**: `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`, `dotenv` (see project root `package.json`)
- **Usage**: `node upload_to_r2.js`

## Scene & Script Analysis

### scn3_extractor.py
Extracts object placement data (MOBJ), entities, and trigger information from Shenmue `MAPINFO.BIN` (SCN3) files.
- **Usage**: `python3 scn3_extractor.py [PATH_TO_MAPINFO.BIN] -v`

### scn3_decoder.py
A bytecode decoder for the SCN3 scripting language. Disassembles the logic used for object interaction and scene management.
- **Usage**: `python3 scn3_decoder.py [PATH_TO_MAPINFO.BIN] -v`

### full_scn3_decompiler.py
A higher-level decompiler that attempts to reconstruct the logic structure of SCN3 scripts into human-readable pseudo-code.
- **Usage**: `python3 full_scn3_decompiler.py [PATH_TO_MAPINFO.BIN]`

## Placement & Data Extraction

### placement_extractor.py
General utility for parsing and dumping object coordinates and metadata from scenario files.

### furniture_extractor.py
Specialized script for identifying and extracting the database of furniture and prop items found in the game's indoor environments.

### extract_placements.py
Generates `scene.json` for the viewer from MAPINFO.BIN, focusing on model references and associated position data.

### extract_hrcm.py
Extracts HRCM model data from binary archives.

### extract_single.py
Extracts individual TEXN texture entries with their 8-byte IDs from binary data.

## Animation Analysis

### dump_motn.js
Parses Shenmue MOTN animation tables such as `MISC/MOTION.BIN` or `MOTION/MOTION.BIN`, listing sequence names, offsets, bone IDs, translation/rotation channel descriptors, per-channel frame indices, and half-float value samples decoded from the 2-bit value flag stream. It also recognizes the old `flagHigh=0x8000` 60x32-byte legacy frame records so they are not misread as normal bone-curve data. Exact component semantics and spline interpolation are still research work.
- **Usage**: `node tools/dump_motn.js /path/to/motion.bin --filter AKI_AKI_RUN --limit 12`
- **Usage**: `node tools/dump_motn.js /path/to/motion.bin --filter AKIRA --json`
- **Usage**: `node tools/dump_motn.js /path/to/motion.bin --filter AKI_AKI_RUN_LP --json --curves`

### validate_ryo_motions.js
Loads Ryo's MT5 node tree and scores MOTN sequences against the proven `node-index` target mapping with radians-scale rotations. This is the repeatable coverage check for deciding which motions can currently drive Ryo cleanly in the Babylon viewer. It also reports root bone `0` / `tz` cycle displacement for locomotion/root-motion inspection, and splits diagnostics into clean, warning-only, playback-usable, review-needed, and known legacy frame-only buckets.
- **Usage**: `node tools/validate_ryo_motions.js --filter 'AKI_AKI_(RUN|WALK)_LP' --samples 5`
- **Usage**: `node tools/validate_ryo_motions.js --filter '^AKI_' --samples 5 --json > viewer-test/output/ryo-motion-coverage-aki.json`
- **Review output**: `viewer-test/output/ryo-motion-review-needed.json` records the current review-needed, warning-only, and known legacy frame-only sequence lists derived from the coverage JSON.

## MT5 Character Diagnostics

### dump_mt5_atlas.js
Dumps per-strip evidence for a specific MT5 texture/material, including node offset, texture ID, signed strip length/winding hint, PC HRCM strip-group length/padding checks, raw and converted UV ranges, UVH/mirror flags, fixed-size `0x0008`/`0x000a` state values, source/render position and normal stats, and the current deterministic Ryo face-vs-side atlas classification. Use `--vertices` when raw per-vertex UV/position records are needed for evidence artifacts.
- **Usage**: `node tools/dump_mt5_atlas.js public/models/S2_YDB1_YKC_M.MT5 --limit 20`
- **Usage**: `node tools/dump_mt5_atlas.js public/models/S2_YDB1_YKC_M.MT5 --json --vertices > viewer-test/output/ryo-head-atlas-strip-vertices.json`
- **Usage**: `node tools/dump_mt5_atlas.js public/models/S2_YDB1_FUK_M.MT5 --texture 0 --limit 12`
- **PC length evidence**: static Ghidra decompilation of the PC executable's HRCM texture-ID walker shows opcode `0x0009` selects textures and strip groups use a length-prefixed payload. The dump reports `entryLengthBytes`, `entryPaddingBytes`, `entryOverrunBytes`, and `entryLengthMatchesPcSkip` to catch parser desync without running Wine or any `.exe`.

### audit_mt5_model_state.js
Scans every mesh opcode stream in an MT5/HRCM model and summarizes texture state across all materials. This is the broad audit for UVH, mirror flags, UV size, fixed-size state records, strip types, PC length/padding checks, FACE marker roles, and wudecon/ShenmueDKSharp compatibility. It is useful before assuming a texture problem is a UV atlas problem.
- **Usage**: `node tools/audit_mt5_model_state.js public/models/S2_YDB1_YKC_M.MT5`
- **Usage**: `node tools/audit_mt5_model_state.js public/models/S2_YDB1_YKC_M.MT5 --json > viewer-test/output/ryo-mt5-state-audit.json`
- **Ryo evidence**: texture `6:a64b425f4b414a5f` has no mirror flags and uniform `s8=0x0`/`sA=none` fixed state, while texture `8:a64b425f4b414d5f` has `mirrorU`, matching wudecon's mirrored hair-card behavior.
- **FACE marker evidence**: the audit reports signed low-16 HRCM markers. Ryo `S2_YDB1_YKC_M.MT5` has one `-0x43` FACE head hook selecting children `0xd688`/`0xd6c8`, but no `-0x44` FACE patch destination. Fuku-san `S2_YDB1_FUK_M.MT5` exposes raw `-0x44` children under its FACE head hooks, matching the PC FACE patch path.

### find_mt5_texture_refs.js
Scans MT5 files for an exact 8-byte texture ID. This is the fast way to find alternate character, face, or scene resources that reference a known atlas before doing slower per-model audits or renders.
- **Usage**: `node tools/find_mt5_texture_refs.js a64b425f4b414a5f`
- **Usage**: `node tools/find_mt5_texture_refs.js a64b425f4b414a5f extracted_files extracted_disc2_v2 --json > viewer-test/output/ryo-head-atlas-texture-refs.json`
- **Ryo evidence**: Ryo's combined face/side-head atlas appears in raw `MODEL/CHARA/YK*_M.MT5` variants and `MODEL/FACE/YK*_F.MT5` resources, but the cleaner-looking `YKG_M` variant is not a drop-in replacement because it has a different node count and body/head resource layout.

### dump_face_ftbl.js
Dumps Shenmue FACE `*_FTBL.BIN` tables and, when a sibling `*_F.MT5` exists, compares the inferred table layout against the FACE MT5 mesh/node/vertex counts. This is the current static diagnostic for deciding whether FTBL is a direct FACE UV/vertex map or a separate expression/control table. The tool scans headers, fixed-size 36-byte interpretations, opening 48-byte float/control records, dense marker/index clusters, and small 0x100-byte section windows without running Wine or any `.exe`.
- **Usage**: `node tools/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE/YKB_FTBL.BIN --limit 12`
- **Usage**: `node tools/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE/YKB_FTBL.BIN --json --limit 12 > viewer-test/output/ryo-ykb-face-ftbl.json`
- **Usage**: `node tools/dump_face_ftbl.js extracted_files/data/SCENE/01/MODEL/FACE --json --limit 0 > viewer-test/output/face-ftbl-summary.json`
- **Ryo evidence**: `YKB_FTBL.BIN` infers 163 36-byte records while sibling `YKB_F.MT5` has 349 vertices. It also begins with 25 contiguous 48-byte float/control records from `0x30..0x4b0`, followed by dense small-index/weight-looking sections. This argues against treating FTBL as a direct replacement UV table for the base head atlas.
- **PC static cross-check**: Ghidra decompilation of the PC executable as data points at FACE/FTBL/FENV being runtime facial pose/control state: helper code samples weighted sums of 3-float vectors, uses 0x0c and 0x18 strides, and loads FACE resources by table offsets. This is static analysis only, not Wine execution.

### build_ryo_asset_matrix.js
Builds a static body/FACE/FTBL matrix for Ryo-family `YK*` assets across the local Dreamcast and PC extraction folders. It combines MT5 state audits, FACE marker counts, Ryo head-atlas strip counts, file hashes, and FTBL record-vs-FACE-vertex comparisons into a JSON evidence file plus a Markdown table.
- **Usage**: `node tools/build_ryo_asset_matrix.js`
- **Outputs**: `viewer-test/output/ryo-asset-matrix.json` and `.notes/ryo-asset-matrix.md`
- **Ryo evidence**: the current matrix shows all available Ryo-family body meshes have a `-0x43` head hook and no raw `-0x44` FACE patch destination; swapping among YKB/YKC/YKD/YKG body meshes does not remove the remaining cheek/side-head atlas artifact in no-cull renders.

### dump_wudecon_obj_atlas.js
Parses a wudecon/ShenmueDKSharp OBJ + MTL export and dumps the final OBJ UV evidence for a texture/material. This is the comparison tool for checking whether the MT5 loader's Ryo head atlas interpretation agrees with the exported OBJ texture regions. The default texture is Ryo's MT5 atlas ID `a64b425f4b414a5f`, which appears in wudecon as byte-reversed `5f4a414b5f424ba6`.
- **Usage**: `node tools/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --limit 12`
- **Usage**: `node tools/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --json --vertices > viewer-test/output/ryo-wudecon-obj-atlas.json`
- **Usage**: `node tools/dump_wudecon_obj_atlas.js public/wudecon-obj/ryo/S2_YDB1_YKC_M.obj --texture a64b425f4b414a5f --material mat_5f4a414b5f424ba6 --json`

### compare_mt5_wudecon_atlas.js
Compares the MT5 strip dump against the wudecon OBJ dump at face level. It reconstructs MT5 triangle-strip faces, matches them to OBJ faces by position, and reports UV error for raw OBJ UVs, the current `project-cw` viewer mapping, and hybrid diagnostic modes.
- **Usage**: `node tools/compare_mt5_wudecon_atlas.js viewer-test/output/ryo-head-atlas-strip-vertices.json viewer-test/output/ryo-wudecon-obj-atlas.json`
- **Usage**: `node tools/compare_mt5_wudecon_atlas.js viewer-test/output/ryo-head-atlas-strip-vertices.json viewer-test/output/ryo-wudecon-obj-atlas.json --json --samples 20 > viewer-test/output/ryo-mt5-vs-wudecon-atlas-compare.json`

## Analysis & Debug Scripts

### analyze_mapinfo.py
Extracts placement transforms from MAPINFO.BIN SCN3 data, finding transform blocks and correlating them with model references.

### analyze_chrs.py / debug_chrs.py / scan_entities.py
Debug and analysis scripts for examining character data and entity structures in MAPINFO.BIN. These use hardcoded paths and are intended for interactive research.

## Archive & Texture Utilities

### extract_pc_tac.js
Lists and extracts files from the PC HD release `.tad/.tac` archive pairs using native Node.js only. It can map TAC hashes through Shenmunity `Names.txt`, optionally decompress gzip entries, and records offsets, lengths, SHA-1 hashes, source paths, and output paths in JSON. This is the repeatable PC-archive path; it does not run Wine or Windows binaries.
- **Usage**: `node tools/extract_pc_tac.js --names /Users/brynnbateman/Code/Shenmunity_plugin/Names.txt --archive disk --filter 'YKB_M|YKC_M|MOTION'`
- **Usage**: `node tools/extract_pc_tac.js --names /Users/brynnbateman/Code/Shenmunity_plugin/Names.txt --archive disk --hash 0A654E09 --extract --out viewer-test/output/pc-sm1-ryo --json`

### extract_afs.js
Lists and extracts child packages from Shenmue `AFS` archives, including nested `PAKF`/`PAKS` IPAC children. This is useful for inspecting `HUMANS.AFS` character packages such as the paired texture/CHRT and model/SCNF records.
- **Usage**: `node tools/extract_afs.js viewer-test/output/pc-sm1-ryo/SCENE/01/STREAM/HUMANS.AFS --entry 696 --entry 697`
- **Usage**: `node tools/extract_afs.js viewer-test/output/pc-sm1-ryo/SCENE/01/STREAM/HUMANS.AFS --entry 696 --entry 697 --extract --out viewer-test/output/pc-sm1-ryo/HUMANS-YKDM --json`

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

### gditools3.py & iso9660.py
Third-party utility (GPL v3) for extracting the file structure from raw Dreamcast `.GDI` disc images.

## Data Files

### extracted_tex/
Original Dreamcast PVR sky texture files extracted from the game disc. Used by `convert_sky_textures.py` to generate the PNG sky textures in `public/textures/sky/`.

### docs/
Research documentation including:
- `mapids-sm1.md` / `mapids-sm2.md` — Complete map ID tables for both games
- `Memory Addresses (SM1).md` / `(SM2).md` — Game memory address maps
- `Function Memory Addresses (SM1).md` / `(SM2).md` — Function address tables
- `scn3_bytecode.md` — SCN3 bytecode reference
- `shenmuescripts.md` — Script system documentation
- `sourceexample.md` — Decompiled source examples

## Required Game Data

The full extraction pipeline requires **Shenmue (Dreamcast) GDI disc images** for both discs:
- **Disc 1**: Contains Scenario 1 zones (Dobuita, Hazuki Residence, etc.)
- **Disc 3**: Contains Scenario 2 zones (Harbor, warehouses, etc.)

These are Dreamcast GD-ROM dumps (`.gdi` + `.bin`/`.raw` track files). Use `gditools3.py` to extract the filesystem, then the various `extract_*.py` and `unpack_ipac.py` scripts to process archives into individual assets.

**Note**: Game disc images are copyrighted material and are not distributed with this project. You must provide your own legally obtained copies.

## Origin

These tools were originally developed in a fork of [Shenmue-Export-Tools](https://github.com/seiche/Shenmue-Export-Tools) (by seiche/Benjamin Collins, 2018). The original repo provided the PythonPVR library, Blender importer, and Noesis plugins. All extraction scripts, documentation, the web viewer, and the R2 upload pipeline were developed by brynnb and have been consolidated into this repository.

---
*Note: Most tools require Python 3 and Pillow (`pip install Pillow`). Some scripts may have additional dependencies like `bitstring`. The R2 upload script requires Node.js. Use `-h` on most scripts for more detailed options.*
