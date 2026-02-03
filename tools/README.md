# Shenmue Research & Extraction Tools

This directory contains the Python-based pipeline used to reverse-engineer and extract the assets for the Shenmue 1 Asset Viewer. These tools are provided for other researchers and developers looking to explore the game's proprietary Dreamcast formats.

## Web Viewer Sync

### sync_models.py
The core bridge between extracted files and the web viewer. It processes raw extracted folders, identifies models and textures, and packs them into the compressed `.bin` files and `models.json` catalog used by the renderer.
- **Usage**: `python3 sync_models.py [extracted_base_dir]`

## Scene & Script Analysis

### scn3_extractor.py
Extracts object placement data (MOBJ), entities, and trigger information from Shenmue `MAPINFO.BIN` (SCN3) files.
- **Usage**: `python3 scn3_extractor.py [PATH_TO_MAPINFO.BIN] -v`

### scn3_decoder.py
A bytecode decoder for the SCN3 scripting language. It disassembles the logic used for object interaction and scene management.
- **Usage**: `python3 scn3_decoder.py [PATH_TO_MAPINFO.BIN] -v`

### full_scn3_decompiler.py
A higher-level decompiler that attempts to reconstruct the logic structure of SCN3 scripts into human-readable pseudo-code.
- **Usage**: `python3 full_scn3_decompiler.py [PATH_TO_MAPINFO.BIN]`

## Placement & Data Extraction

### placement_extractor.py
General utility for parsing and dumping object coordinates and metadata from scenario files.

### furniture_extractor.py
A specialized script for identifying and extracting the massive database of furniture and prop items found in the game's indoor environments.

## Archive & Texture Utilities

### unpack_ipac.py
Unpacks the game's standard archive format (IPAC), typically found in files with `.PKF` and `.PKS` extensions.
- **Usage**: `python3 unpack_ipac.py [FILE.PKF]`

### pvr_to_png.py
Converts Dreamcast PVR/PVRT textures into standard PNG images. It supports both raw PVR and those embedded in archives.

### gditools3.py & iso9660.py
A third-party utility group used to extract the initial file structure from raw Dreamcast `.GDI` disc images.

---
*Note: Most of these tools require basic Python 3. Some scripts may have additional dependencies like `bitstring`. Use `-h` on most scripts for more detailed options.*
