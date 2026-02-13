# SCN3 Ghidra Processor Module

A custom Ghidra processor module for decompiling Shenmue's SCN3 bytecode — the scripting VM used in `MAPINFO.BIN` files to control object placement, game logic, and scene setup.

**Everything is Python** — no Java compilation or Gradle builds needed.

## What This Does

- **Disassembles** SCN3 bytecode into readable mnemonics (PUSH_F32, CALL_SET3, JZ, MOBJ_SEL, etc.)
- **Decompiles** bytecode into pseudo-C with full control flow recovery (if/else, loops, function calls)
- **Maps** code and data sections from MAPINFO.BIN into Ghidra's address space
- **Exports** analysis results (models, slots, coordinates, transforms, decompiled code) to JSON

## Why This Matters

SCN3 scripts control where every object in the game is placed — furniture, drawers, doors, props. The bytecode pushes position floats onto a stack and calls engine functions (SET3) to instantiate models at those positions. A decompiler lets us:

1. **See which positions belong to which models** (the key missing piece for object placement)
2. **Understand parent-child hierarchies** (drawers inside desks, shelves inside cabinets)
3. **Extract all game logic** (time-of-day branching, conditional object spawning)

## Prerequisites

- **Ghidra 11.0+** — Download from [ghidra-sre.org](https://ghidra-sre.org/)
- **Java 17+** (bundled with Ghidra)
- That's it. No Gradle, no compilation.

## Setup

### 1. Set Environment Variable

```bash
export GHIDRA_INSTALL_DIR=/path/to/ghidra_11.x
```

### 2. Install the SCN3 Processor

```bash
cd tools/ghidra/SCN3
./install.sh
```

This copies the SLEIGH language files into Ghidra's processor directory. No build step needed.

## Usage (Headless CLI)

### Quick Analysis

```bash
./analyze.sh path/to/MAPINFO.BIN [output.json]
```

Examples:
```bash
# Analyze Hazuki Residence Interior
./analyze.sh extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN jomo_analysis.json

# Analyze Dobuita
./analyze.sh extracted_files/data/SCENE/01/D000/MAPINFO.BIN dobuita_analysis.json
```

### Manual Headless Analysis

```bash
$GHIDRA_INSTALL_DIR/support/analyzeHeadless /tmp/project SCN3Project \
    -import MAPINFO.BIN \
    -processor "SCN3:LE:32:default" \
    -scriptPath tools/ghidra/SCN3/ghidra_scripts \
    -preScript SCN3Loader.py \
    -postScript ExportSCN3Analysis.py output.json
```

### What the Scripts Do

1. **`SCN3Loader.py`** (pre-script) — Finds the SCN3 section in the imported MAPINFO.BIN, parses its header, and remaps the code and data sections into proper Ghidra memory blocks with correct permissions.

2. **`ExportSCN3Analysis.py`** (post-script) — After Ghidra's auto-analysis runs, this extracts all useful data and decompiles all functions to JSON.

## Output Format

```json
{
  "strings": ["0xABC: $TTMS246G.MT5", ...],
  "models": [{"offset": "0x1234", "name": "TTMS246G.MT5"}, ...],
  "slots": [{"offset": "0x5678", "name": "R01_016"}, ...],
  "floats": [{"offset": "0x9ABC", "value": "14.9000"}, ...],
  "transforms": [{
    "offset": "0xDEF0",
    "scale": [1.0, 1.0, 1.0],
    "position": [14.9, -0.22, 5.55]
  }, ...],
  "functions": [{
    "name": "scn3_main",
    "address": "0x30",
    "code": "void scn3_main(void) {\n  MOBJ_SEL(5);\n  PUSH_F32(14.9);\n  ...\n}"
  }],
  "disassembly": ["0x30: PUSH_I8 0x05", "0x32: MOBJ_SEL 0x05", ...]
}
```

## SCN3 Architecture Overview

The SCN3 VM is a **stack-based bytecode interpreter**:

| Component | Description |
|-----------|-------------|
| **Stack** | Main data stack for operands and results |
| **R14** | General-purpose register (return values, conditional jumps) |
| **MOBJ** | Object subsystem — select slots, read/write object properties |
| **Function Sets** | External engine calls (SET3 = 466 Shenmue functions) |

### Opcode Ranges

| Range | Type | Example |
|-------|------|---------|
| `0x00-0x3F` | Control flow, calls | `JMP`, `JZ`, `CALL_SET3`, `MOBJ_SEL` |
| `0x40-0x7F` | Push immediates | `PUSH_I8`, `PUSH_I16`, `PUSH_I32` (float or int) |
| `0x80-0xBF` | Operators | `F_ADD`, `EQ`, `MOBJ_RD32`, `STK_TO_R14` |
| `0xC0-0xFF` | Invalid | — |

### Semantic Transpilation (The "Rosetta Stone" Layer)

After Ghidra exports the raw bytecode to JSON, we use a semantic transpiler to reconstruct human-readable source code. This process has been calibrated against leaked developer source code (`0154_1.C` and `SEQCONV.C`) to achieve near-perfect reconstruction.

### 1. SCN3 to Python (`scn3_to_python.py`)
Converts `MAPINFO.BIN` logic into Python scripts.
- **Resolves Function Sets**: Maps `CALL_SET` indices to actual engine labels (`entity_setup`, `scnf_camera`). Phase 5 expanded the verb dictionaries to cover 100+ Set 7 ops, 19 Set 6 ops, and 25 Set 4 ops.
- **Recovers Data Types**: Automatically detects IEEE 754 floats, 4-char character IDs (`ID_Ryo`), and `0xAA3DXXXX` dialogue IDs.
- **Identifies Patterns**: Detects the "Entity Lifecycle" (`init` -> `activate` -> `setup`).

```bash
python3 scn3_to_python.py output.json decompiled.py
```

### 2. Cinematic SEQ Decompiler (`seq_decompiler.py`)
Decompiles `SEQDATA.AUTH` files back into reconstructured C source code.
- **Header Parsing**: Decodes `TRCK` and `ASEQ` container structures.
- **Spline Recovery**: Reconstructs `FCVKEYt` cubic spline arrays for camera and movement paths.
- **String Table Mapping**: Reassociates voice and sound effect paths with their numeric IDs.

```bash
python3 seq_decompiler.py SEQDATA1.AUTH reconstructed.c
```

### 3. Entity ID Database (`entity_id_database.py`)
Scans all `MAPINFO.BIN` files to build a comprehensive registry of 4-character `MAKE_ID` tags.
- **Binary Scanning**: Detects 32-bit little-endian ASCII identifiers at 4-byte alignment.
- **Context Filtering**: Rejects tags embedded in longer ASCII strings to reduce false positives.
- **Cross-Scene Tracking**: Maps each unique ID to every scene it appears in.

```bash
python3 entity_id_database.py extracted_disc2_v2/data/SCENE entity_ids.json
```

### 4. Asset Placement Extractor (`extract_placements.py`)
Extracts object placement data from SCN3 analysis JSON for Babylon.js import.
- **Code Call Mapping**: Tracks which models receive `set_position`, `set_rotation`, and `entity_setup` calls.
- **Data Transform Extraction**: Recovers scale+position float sextuplets from the DATA section.
- **Model Association**: Correlates transforms with nearby model references by offset proximity.

```bash
python3 extract_placements.py jomo_analysis.json jomo_placements.json
```

### 5. Interactive Spline Extractor (`extract_splines.py`)
Detects and extracts `FCVKEYt` spline data from `MAPINFO.BIN` files.
- **Heuristic Detection**: Finds spline channels by validating monotonic time arrays and reasonable value ranges.
- **Group Classification**: Identifies camera paths (8ch), movement paths (9ch), position paths (3ch), and transform paths (6ch).
- **Path Sampling**: Generates sampled XYZ path points for direct Babylon.js import.

```bash
python3 extract_splines.py extracted_files/data/SCENE/02/JOMO/MAPINFO.BIN jomo_splines.json
```

### 6. Multi-Scene Bulk Analyzer (`bulk_analyze.sh`)
Bulk-processes all primary game scenes through the full pipeline.
- **Ghidra Analysis**: Runs headless analysis on each scene's `MAPINFO.BIN`.
- **Python Post-Processing**: Chains transpilation, placement extraction, and spline extraction.
- **Global Database**: Builds a cross-scene entity ID database and combined manifest.

```bash
./bulk_analyze.sh extracted_disc2_v2/data/SCENE ./analysis_output
./bulk_analyze.sh extracted_disc2_v2/data/SCENE ./analysis_output --all  # All 42 scenes
```

## Function Set Architecture

Through Rosetta Stone analysis of leaked source, we have resolved the primary engine APIs used by the VM:

| Set | API Label | Description |
|-----|-----------|-------------|
| **Set 1** | `stVOICE` | Voice and dialogue playback. |
| **Set 3** | `sm_` | High-level game state (Inventory, Flags, Event Scheduling). |
| **Set 4** | `ext_` | MT5 Model loading and direct scene placement. |
| **Set 6** | `SCNF` | Scene Control (Camera paths, tracking, transitions). |
| **Set 7** | `entity_` | Lower-level entity manipulation (Rotation, Position, Visibility). |

## File Structure

```
SCN3/
├── scn3_to_python.py     # Semantic transpiler for MAPINFO.BIN
├── seq_decompiler.py     # Decompiler for SEQDATA.AUTH cutscenes
├── entity_id_database.py # MAKE_ID registry builder (scans all scenes)
├── extract_placements.py # Asset placement extractor (JSON for Babylon.js)
├── extract_splines.py    # FCVKEYt spline extractor (NPC paths, camera paths)
├── SCN3_RESEARCH.md      # Detailed VM architecture notes
├── SEQ_RESEARCH.md       # Cinematic sequence format notes
├── data/languages/       # Ghidra processor specification (SLEIGH)
├── ghidra_scripts/       # Ghidra automation scripts
├── install.sh            # Setup script
├── analyze.sh            # Single-scene headless analysis wrapper
├── bulk_analyze.sh       # Multi-scene bulk analysis pipeline
└── README.md
```

## References

- [wulinshu.com — Shenmue Script](https://wulinshu.com/wiki/index.php/Shenmue_Script) — Initial opcode documentation
- **Leaked SEQCONV.C / 0154_1.C** — The foundation for our "Rosetta Stone" reconstruction.
- [ShenmueDKSharp](https://github.com/Shenmue-Mods/ShenmueDKSharp) — C# Shenmue file parsing library
- [Ghidra SLEIGH docs](https://ghidra.re/ghidra_docs/languages/html/sleigh.html) — Processor spec language reference
- [Creating a Ghidra processor for V8](https://swarm.ptsecurity.com/creating-a-ghidra-processor-module-in-sleigh-using-v8-bytecode-as-an-example/) — Similar custom VM processor walkthrough
