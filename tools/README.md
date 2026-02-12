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

## Analysis & Debug Scripts

### analyze_mapinfo.py
Extracts placement transforms from MAPINFO.BIN SCN3 data, finding transform blocks and correlating them with model references.

### analyze_chrs.py / debug_chrs.py / scan_entities.py
Debug and analysis scripts for examining character data and entity structures in MAPINFO.BIN. These use hardcoded paths and are intended for interactive research.

## Archive & Texture Utilities

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
