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

### Key Function Sets

| Set | Call Opcode | Count | Purpose |
|-----|-------------|-------|---------|
| SET3 | `CALL_SET3` | 466 | General Shenmue engine functions (object placement, animation, etc.) |
| SET6 | `CALL_SET6` | 47 | SCNF scene functions |
| SET2 | `CALL_SET2` | 5 | Memory operations (memset, memcpy) |

## File Structure

```
SCN3/
├── data/languages/
│   ├── SCN3.slaspec      # SLEIGH processor spec (instruction definitions)
│   ├── SCN3.pspec        # Processor spec (registers, memory defaults)
│   ├── SCN3.cspec        # Compiler spec (calling conventions, stack)
│   └── SCN3.ldefs        # Language definition (registers processor with Ghidra)
├── ghidra_scripts/
│   ├── SCN3Loader.py     # Pre-script: parse MAPINFO.BIN, map SCN3 sections
│   └── ExportSCN3Analysis.py  # Post-script: decompile & export to JSON
├── install.sh            # Copy language files into Ghidra
├── analyze.sh            # One-command headless analysis wrapper
├── extension.properties  # Ghidra extension metadata
├── Module.manifest       # Ghidra module manifest
└── README.md
```

## Next Steps

Once the basic decompilation works:

1. **Identify SET3 function signatures** — Which function numbers correspond to "place object at position"? Cross-reference with the HD remaster executable.
2. **Map MOBJ slots to models** — Track MOBJ_SEL → model string table index correlation.
3. **Extract parent-child relationships** — Nested MOBJ operations likely define hierarchy.
4. **Generate placement JSON** — Automatically produce position data for the web viewer.

## References

- [wulinshu.com — Shenmue Script](https://wulinshu.com/wiki/index.php/Shenmue_Script) — Opcode documentation
- [ShenmueDKSharp](https://github.com/Shenmue-Mods/ShenmueDKSharp) — C# Shenmue file parsing library
- [Ghidra SLEIGH docs](https://ghidra.re/ghidra_docs/languages/html/sleigh.html) — Processor spec language reference
- [Creating a Ghidra processor for V8](https://swarm.ptsecurity.com/creating-a-ghidra-processor-module-in-sleigh-using-v8-bytecode-as-an-example/) — Similar custom VM processor walkthrough
