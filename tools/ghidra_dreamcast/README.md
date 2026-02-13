# SCN3 Ghidra Processor Module & Analysis Pipeline (Dreamcast)

A custom Ghidra processor module and Python analysis pipeline for decompiling Shenmue's **SCN3 bytecode** — the stack-based scripting VM embedded in `MAPINFO.BIN` files.

I put a lot of hours into this project as a fun exploration of Ghidra and the Shenmue data, but I felt like I hit a ceiling of what was possible with Ghidra since SCN3 bytecode is a stack-based VM but Ghidra's decompiler is fundamentally designed for register-based architectures (x86, ARM, SH4). From what I can tell, Ghidra is not the right tool for this, but it was neat to try anyway.

## Status: Archived

This toolchain successfully decompiles SCN3 bytecode into pseudo-C and Python, with **98.6% clean functions** (0 `halt_baddata`, 74 `BADSPACEBASE` out of 5,278 functions). The Python pipeline scripts contain extensive **verb dictionaries** mapping hundreds of hex dispatch indices to named engine functions — this is the most valuable artifact for understanding what the bytecode does.

The C output quality is limited by a fundamental mismatch: Ghidra's decompiler targets register-based architectures, not stack VMs. For understanding the native engine (dispatch tables, struct layouts, model loading), decompiling the x86 PC port executable would be more productive.

### Results (JOMO / Hazuki Residence)

| Metric                   | Value                                        |
| ------------------------ | -------------------------------------------- |
| Functions                | 5,278 (2,308 `scn3_*`, 2,970 auto-created) |
| Clean functions          | 5,204 (98.6%)                                |
| `halt_baddata` errors  | 0                                            |
| `BADSPACEBASE` errors  | 74                                           |
| Semantically named       | 1,528                                        |
| Dispatch calls resolved  | 22,510                                       |
| Function call resolution | 88% (23,196 / 26,207 in JOMO)                |
| Entity IDs discovered    | 1,108 unique across 42 scenes                |

## What's Here

```
ghidra_dreamcast/
│
│  ── Ghidra Processor Module ──
├── data/languages/
│   ├── SCN3.slaspec         # SLEIGH instruction definitions (opcodes → p-code)
│   ├── SCN3.cspec           # Compiler spec (calling convention, stack model)
│   ├── SCN3.pspec           # Processor spec (registers, default memory blocks)
│   └── SCN3.ldefs           # Language definition (registers processor with Ghidra)
├── ghidra_scripts/
│   ├── SCN3Loader.py        # Pre-script: parses MAPINFO.BIN, maps CODE/DATA sections
│   └── ExportSCN3Analysis.py # Post-script: decompiles all functions, exports JSON
├── Module.manifest
├── extension.properties
├── install.sh               # Copies language files into Ghidra's processor directory
├── analyze.sh               # Single-scene headless analysis (MAPINFO.BIN → JSON)
├── bulk_analyze.sh          # Multi-scene pipeline (all 42 scenes)
│
│  ── Python Analysis Pipeline ──
├── scn3_to_python.py        # Semantic transpiler — contains all verb dictionaries
├── seq_decompiler.py        # Cutscene decompiler (SEQDATA.AUTH → reconstructed C)
├── entity_id_database.py    # MAKE_ID scanner (finds 4-char entity tags across scenes)
├── extract_placements.py    # Object placement extractor (bytecode + DATA section)
├── extract_splines.py       # FCVKEYt spline extractor (camera/NPC paths)
├── extract_furniture_placements.py  # Furniture record table decoder
│
│  ── Documentation ──
├── SCN3_RESEARCH.md         # VM architecture, API resolution, entity lifecycle
├── SEQ_RESEARCH.md          # Cutscene sequence format (TRCK/ASEQ/FCVKEYt)
└── README.md
```

## Setup

```bash
export GHIDRA_INSTALL_DIR=/path/to/ghidra_11.x
./install.sh
```

## Usage

### Ghidra Analysis (produces JSON)

```bash
./analyze.sh path/to/MAPINFO.BIN [output.json]
```

### Semantic Transpilation (JSON → readable Python)

```bash
python3 scn3_to_python.py output.json decompiled.py
```

### Cutscene Decompilation

```bash
python3 seq_decompiler.py SEQDATA1.AUTH reconstructed.c
```

### Entity ID Database (scan all scenes)

```bash
python3 entity_id_database.py extracted_disc/data/SCENE entity_ids.json
```

### Placement & Spline Extraction

```bash
python3 extract_placements.py analysis.json placements.json
python3 extract_splines.py MAPINFO.BIN splines.json
python3 extract_furniture_placements.py MAPINFO.BIN furniture.json
```

### Bulk Pipeline (all scenes)

```bash
./bulk_analyze.sh extracted_disc/data/SCENE ./output_dir
./bulk_analyze.sh extracted_disc/data/SCENE ./output_dir --all  # All 42 scenes
```

## Verb Dictionaries (the "Rosetta Stone")

The most valuable data in this archive is the **verb dictionaries** inside `scn3_to_python.py`. These map raw hex dispatch indices to named engine functions, built by cross-referencing leaked developer source code (`SEQCONV.C`, `0154_1.C`) with runtime analysis.

### SET7_VERBS (~350 entries) — Entity manipulation

```
0x2D56 → entity_setup          (most common — 3,397 calls in JOMO)
0xD44A → set_position         
0xD50A → set_facing           
0x2D46 → entity_set_anim      
0xE400 → entity_init          
0xE500 → entity_activate      
0xD516 → set_rotation         
...
```

### SET6_VERBS (37 entries) — Scene control (SCNF)

```
0x00 → camera_set
0x06 → scene_transition
0x0A → fade_out
0x0B → fade_in
...
```

### SET4_VERBS (35 entries) — Model loading

```
0x34 → load_model
0x35 → place_model
0x36 → set_material
...
```

### SET3_VERBS (25 entries) — General Shenmue API

### SET2 mem_verbs (17 entries) — Memory operations

### AREA_NAMES, MAP_ID_NAMES, KNOWN_MEMORY_OFFSETS — Cross-reference tables

## Key Design Decisions

### Fixes that eliminated decompiler errors

1. **`CALL_SET` → `callother` pcodeops**: Dispatch calls use Ghidra's `callother` user-ops instead of real calls, preventing the decompiler from following non-existent dispatch stubs.
2. **4-byte operand variants disabled**: `sz=3` (32-bit operand) variants of jumps and CALL_SET opcodes are treated as inert data. 99% of 4-byte operands produce garbage — real SCN3 uses only 1-byte and 2-byte operands for control flow.
3. **Stack params removed from cspec**: The calling convention uses only R14 for input/output, with SP marked as unaffected. This eliminated most `BADSPACEBASE` errors.
4. **Smart function boundaries**: Functions created only at natural block boundaries — `MOBJ_SEL` after unconditional jumps and code following end-sentinel `CALL_SET7` ops. Reduced from 22K (Ghidra auto-split) to ~885 natural boundaries.

## SCN3 Architecture

The SCN3 VM is a stack-based bytecode interpreter with 4 registers:

| Register       | Purpose                                                   |
| -------------- | --------------------------------------------------------- |
| **R14**  | Return value / conditional test register (used by `JZ`) |
| **SP**   | Stack pointer (grows downward)                            |
| **MOBJ** | Currently selected model object slot                      |
| **PC**   | Program counter                                           |

### Opcode Encoding (1 byte)

| Bits 7-6 | Category               | Range          |
| -------- | ---------------------- | -------------- |
| `00`   | Control flow & calls   | `0x00–0x3F` |
| `01`   | Push immediates        | `0x40–0x7F` |
| `10`   | Operators              | `0x80–0xBF` |
| `11`   | Control flow (flagged) | `0xC0–0xFF` |

### Function Sets

| Set | Label        | Count (PC port) | Description                                           |
| --- | ------------ | --------------- | ----------------------------------------------------- |
| 1   | `stVOICE`  | 1               | Voice/dialogue playback                               |
| 2   | `mem_*`    | 5               | Memory operations (memset, memcpy, strcpy)            |
| 3   | `sm_*`     | 466             | General Shenmue API —**the main engine table** |
| 4   | `ext_*`    | 1               | Model loading and placement                           |
| 6   | `SCNF`     | 47              | Scene control (camera, transitions)                   |
| 7   | `entity_*` | 8               | Entity manipulation (position, rotation, visibility)  |

**Note:** What `scn3_to_python.py` calls "CALL_SET7" (opcode `0x2D`) is actually Set 3 calls (the 466 general Shenmue functions). The opcode-to-set mapping is: `0x18`=Set6, `0x19`=Set1, `0x1A`=Set2, `0x1B`=Set3, `0x1C`=Set4, `0x1D`=Set7.

### PC Port Dispatch Table Addresses

From `shenmuescripts.md` (Shenmue PC v1.07):

- Set 1: `0x140559C98`
- Set 2: `0x140559CA0`
- Set 3: `0x140559CD0` (466 functions)
- Set 4: `0x140A4F1E0`
- Set 6: `0x140A4F1F0` (47 functions)
- Set 7: `0x140554210`

### Dreamcast Dispatch Table

`shenmue-event-sdk/event_lib/include/event_tbl.h` contains an 850-entry function dispatch table for SM2 Dreamcast, with 73 named functions (e.g., `LoadScene`, `GetPlayerStats`, `EV_SetPlayerControlFlags`).

## References

- [wulinshu.com — Shenmue Script](https://wulinshu.com/wiki/index.php/Shenmue_Script) — Initial opcode docs
- [Ghidra SLEIGH docs](https://ghidra.re/ghidra_docs/languages/html/sleigh.html) — Processor spec language
- Leaked `SEQCONV.C` / `0154_1.C` — Foundation for API resolution
- `shenmue-event-sdk/event_lib/include/event_tbl.h` — 850-entry DC dispatch table
- `tools/docs/shenmuescripts.md` — PC port opcode reference with dispatch table addresses
- `tools/docs/taskqueuesystem.md` — HLib task queue (cooperative multitasking)
