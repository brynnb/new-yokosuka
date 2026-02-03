# Shenmue Technical Documentation

This document describes the binary file formats, scene structures, and reverse engineering findings for Shenmue (most for Dreamcast but overlap with PC HD Remaster). The emphasis of this project is working on the files for the original Dreamcast game, however analyzine the PC port of 1 & 2 helps in this process.

---

## Table of Contents

1. [Archive Formats](#archive-formats)
   - [PAKS/PAKF](#pakspakf)
   - [IPAC](#ipac)
   - [AFS](#afs)
2. [Model Formats](#model-formats)
   - [MT5 / HRCM](#mt5--hrcm)
   - [MAPM / CHRM](#mapm--chrm)
3. [Texture Formats](#texture-formats)
   - [PVR / PVRT](#pvr--pvrt)
   - [GBIX](#gbix)
   - [TEXN](#texn)
   - [TEXD / NAME](#texd--name)
4. [Scene Formats](#scene-formats)
   - [MAPINFO.BIN](#mapinfobin)
   - [Tokens](#tokens)
   - [SCN3 Bytecode Opcodes](#scn3-bytecode-opcodes)
5. [Manifest Files](#manifest-files)
   - [MPK00.TXT](#mpk00txt)
   - [MPK00.chr](#mpk00chr)
6. [Directory Structure](#directory-structure)
7. [Time-of-Day Variants](#time-of-day-variants)
8. [Tools Reference](#tools-reference)

---

## Archive Formats

### PAKS/PAKF

Primary archive format for Shenmue assets. PKS typically contains models, PKF contains textures.

```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "PAKS" or "PAKF"
0x04    4     Offset to IPAC data (little-endian)
0x08    4     Unknown/Flags
0x0C    4     File count or version
```

The archive header points to an embedded IPAC structure containing the actual file dictionary.

**Notes:**
- Files are often gzip-compressed (magic bytes `1F 8B`)
- PKS = models, PKF = textures (typically, but not always)
- Both MAP*.PKS and MAP*.PKF exist for each time-of-day variant

### IPAC

Internal Package format, embedded within PAKS/PAKF files.

```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "IPAC"
0x04    4     Dictionary offset (from IPAC start)
0x08    4     File count
0x0C    4     Total content size

Dictionary Entry (20 bytes each):
0x00    8     Filename (null-padded)
0x08    4     Extension (null-padded, e.g., "MT5\0")
0x0C    4     Offset (from IPAC start)
0x10    4     Size
```

**Example extraction:**
```python
sig, dict_off, count, size = struct.unpack('<IIII', ipac_data[:16])
for i in range(count):
    entry_pos = dict_off + (i * 20)
    name, ext, offset, size = struct.unpack('<8s4sII', ipac_data[entry_pos:entry_pos+20])
    file_data = ipac_data[offset:offset+size]
```

### AFS

Audio/Video archive format (used for FMV and audio streams).

```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "AFS\0"
0x04    4     File count
0x08    8*N   File table (offset, size pairs)
```

---

## Model Formats

### MT5 / HRCM

The primary 3D model format. Files with `.MT5` extension contain HRCM data.

```
HRCM Header:
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "HRCM"
0x04    4     Total size
0x08    4     Texture data offset (TEXD)
0x0C    4     Model data offset
0x10    2     Flags
0x12    2     Unknown
0x14-   ...   Variable header data
```

**Node Structure (64 bytes):**
```
Offset  Size  Description
------  ----  -----------
0x00    4     Flags
0x04    4     Model data address
0x08    4     Rotation X (fixed-point: value / 65536 * 2π)
0x0C    4     Rotation Y
0x10    4     Rotation Z
0x14    4     Scale X (float)
0x18    4     Scale Y (float)
0x1C    4     Scale Z (float)
0x20    4     Position X (float)
0x24    4     Position Y (float)
0x28    4     Position Z (float)
0x2C    4     Child node address
0x30    4     Sibling node address
0x34    4     Parent node address
0x38    4     Unknown 1
0x3C    4     Unknown 2
```

**Model Data:**
```
Offset  Size  Description
------  ----  -----------
0x00    4     Flags
0x04    4     Unknown
0x08    4     Vertex count
0x0C    4     Submesh count
0x10    4     Vertex data address
0x14    4     Polygon data address
0x18    4     Unknown
0x1C    float Bounding radius
0x20    float Center X
0x24    float Center Y
0x28    float Center Z
```

**Vertex Format (24 bytes):**
```
Offset  Size  Description
------  ----  -----------
0x00    4     Position X (float)
0x04    4     Position Y (float)
0x08    4     Position Z (float)
0x0C    4     Normal X (float)
0x10    4     Normal Y (float)
0x14    4     Normal Z (float)
```

**Polygon Commands:**
| Type | Description |
|------|-------------|
| 0x0000 | Null/skip |
| 0x0002-0x0007 | Strip attributes (UV precision, mirroring) |
| 0x0008-0x000A | Unknown 4-byte blocks |
| 0x0009 | Texture selection (next 2 bytes = texture ID) |
| 0x000B | UV size override |
| 0x000E-0x000F | Unknown 12-byte blocks |
| 0x10-0x1F | Triangle strip data |
| 0x8000 | End of polygon data |

**Strip Types (0x10-0x1F):**
- Bit 0: Has UV coordinates
- Bit 1: Has vertex colors
- Bit 3: Has extra data

### MAPM / CHRM

Variations of the MT5 format:
- **MAPM**: Map models (same structure as MT5)
- **CHRM**: Character models (same structure as MT5)

---

## Texture Formats

### PVR / PVRT

PowerVR texture format native to Dreamcast.

```
PVRT Header:
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "PVRT"
0x04    4     Data size (excluding 8-byte header)
0x08    1     Pixel format
0x09    1     Data format
0x0A    2     Unknown/Padding
0x0C    2     Width
0x0E    2     Height
0x10    ...   Pixel data
```

**Pixel Formats:**
| Value | Format | Description |
|-------|--------|-------------|
| 0x00 | ARGB1555 | 1-bit alpha, 5-bit RGB |
| 0x01 | RGB565 | No alpha, 5-6-5 RGB |
| 0x02 | ARGB4444 | 4-bit alpha, 4-bit RGB |
| 0x03 | YUV422 | Video format |
| 0x04 | BUMP | Normal map |
| 0x05 | RGB555 | No alpha, 5-bit RGB |
| 0x06 | ARGB8888 | 8-bit alpha, 8-bit RGB |

**Data Formats:**
| Value | Format | Description |
|-------|--------|-------------|
| 0x01 | TWIDDLED | Morton-order encoding |
| 0x02 | TWIDDLED_MM | Twiddled with mipmaps |
| 0x03 | VQ | Vector quantized |
| 0x04 | VQ_MM | VQ with mipmaps |
| 0x05 | PALETTIZE4 | 4-bit palette |
| 0x06 | PALETTIZE4_MM | 4-bit palette with mipmaps |
| 0x07 | PALETTIZE8 | 8-bit palette |
| 0x08 | PALETTIZE8_MM | 8-bit palette with mipmaps |
| 0x09 | RECTANGLE | Non-twiddled |
| 0x0B | STRIDE | Stride format |
| 0x0D | TWIDDLED_RECT | Twiddled rectangle |

### GBIX

Global Index wrapper for PVR textures.

```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "GBIX"
0x04    4     Size of global index data
0x08    N     Global index (typically 4 or 8 bytes)
...     ...   PVRT data follows
```

### TEXN

Texture Node format - wraps a texture with an 8-byte identifier.

```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "TEXN"
0x04    4     Total size
0x08    8     Texture ID (used for lookup)
0x10    ...   GBIX + PVRT data
```

### TEXD / NAME

Texture dictionary in MT5 files.

**TEXD Header:**
```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "TEXD"
0x04    4     Header size
0x08    4     Texture count
```

**Child Nodes (after header):**
- **TEXN**: Embedded texture (contains PVRT data)
- **NAME**: External texture references (8-byte IDs pointing to PKF textures)

**NAME Block:**
```
Offset  Size  Description
------  ----  -----------
0x00    4     Signature: "NAME"
0x04    4     Block size
0x08    8*N   Texture IDs (8 bytes each)
```

---

## Scene Formats

### MAPINFO.BIN

The main scene definition file containing lighting, objects, characters, and placement data.

Uses a token-based structure where each token has:
```
Offset  Size  Description
------  ----  -----------
0x00    4     Token signature (4 ASCII characters)
0x04    4     Token size (including 8-byte header)
0x08    ...   Token-specific data
```

### Tokens

| Token | Description |
|-------|-------------|
| ATTR | File attributes (always first, 8 bytes) |
| SCN3 | Scene graph data - contains object placements (largest section) |
| CHRD | Character definitions container |
| CHRS | Single character instance (position, rotation, model) |
| COLS | Collision data (Shenmue I) |
| FLDD | Collision data (Shenmue II) |
| DOOR | Door portal definitions |
| DORG | Door origin/placement |
| MAPR | Map references |
| MAPT | Map transforms |
| LGHT | Lighting configuration |
| CMPS | Compressed data |
| DIRT | Unknown (typically empty) |
| ECAM | External camera definitions |
| FOG | Fog settings |
| FREE | Free/unused space marker |
| GMCT | Game center data |
| LSCN | Light scene |
| REGD | Region data |
| SCRL | Scrolling settings |
| SCOF | Scene offset |
| SNDD | Sound data |
| STRG | String table |
| END | End marker |

### SCN3 - Scene Graph (Detailed)

The SCN3 token is the largest and most complex, containing the entire scene hierarchy including object placements. It uses a scripting-like bytecode format.

**Header:**
```
Offset  Size  Description
------  ----  -----------
0x00    4     "SCN3"
0x04    4     Total size
0x08    4     Flags/Version
0x0C    4     First data offset
0x10    4     Second data offset
0x14    4     Content size
0x18    4     Unknown
0x1C    4     Root node offset
```

**Model References in SCN3:**

Models are referenced by filename with a `$` prefix:
```
$MODELNAME.MT5
```

Example byte pattern:
```
24 54 54 4D 53 32 34 36 47 2E 4D 54 35 00    = $TTMS246G.MT5\0
```

**Position Data:**

Position data typically appears as 3 consecutive floats (12 bytes) before the model reference:
```
Offset  Size  Description
------  ----  -----------
-12     4     X position (float)
-8      4     Y position (float)  
-4      4     Z position (float)
0       N     Model filename with $ prefix
```

**Example from JOMO MAPINFO.BIN:**
```
Offset 0x99AC8: 00 00 00 3F (0.5)
Offset 0x99ACC: 00 00 00 3F (0.5)  
Offset 0x99AD0: CD CC 6C 41 (14.8)
Offset 0x99AD4: 00 00 00 00 (0.0)
Offset 0x99AD8: 9A 99 19 40 (2.4)
Offset 0x99ADC: $TTMS246G.MT5
```

**Object Hierarchy:**

Child objects (like drawers inside a desk) have positions **relative to their parent**. The hierarchy is defined through:

1. **Nested token structure** - Children appear after parent definitions
2. **Reference IDs** - Objects may reference parent object IDs
3. **Transform accumulation** - Final position = parent.pos + child.pos

**Known Object Type Prefixes:**
| Prefix | Type | Example |
|--------|------|---------|
| THK, SHK, BHK | Furniture parts (drawers, shelves) | THKK3R1G.MT5 |
| MAL | Small objects | MALS501G.MT5 |
| TIR | Decorative items | TIRS701G.MT5 |
| TUB | Containers | TUB0210G.MT5 |
| SRP | Props | SRP3H01G.MT5 |

### CHRS - Character/Object Instance

Defines placement of a character or object in the scene.

```
Offset  Size  Description
------  ----  -----------
0x00    4     "CHRS"
0x04    4     Size (including header)
0x08    4     Instance ID
0x0C    4     Type flags
0x10    4     Unknown
0x14    4     Unknown
0x18    4     Unknown
0x1C    4     Unknown
0x20    4     Unknown
0x24    4     Unknown
0x28    4     Unknown
0x2C    4     Unknown
0x30    4     Character code (e.g., "AKIR", "FUKU")
0x34    4     Unknown
0x38    12    Position (3 floats: X, Y, Z)
0x44    4     Flags
...     ...   Additional instance-specific data
```

**Known Character Codes:**
| Code | Character |
|------|-----------|
| AKIR | Ryo Hazuki (Akira) |
| FUKU | Fuku-san |
| INE | Ine-san |
| RYOZ | Ryo (alternate) |

### Extracting Object Placements

**Current Understanding:**

The SCN3 format stores object placement data in a complex bytecode structure:

1. **String Table**: Model filenames (`$NAME.MT5`) are stored in a contiguous string table
   - Located approximately at offsets 0x99ADC to 0x9C9D7 in JOMO's MAPINFO.BIN
   - 47+ drawer/furniture models listed consecutively without position data
   
2. **Position Data**: Only some objects have position floats directly before their names
   - Room-level objects (furniture bases) may have embedded positions
   - Child objects (drawers, shelves) reference parents and use relative positioning

3. **Bytecode Execution**: SCN3 appears to be extended SH-4 assembly
   - Uses stack-based operations
   - Conditional execution for time-of-day variants
   - References to game functions in main executable

**Simple Extraction (Objects with Embedded Positions):**

```python
import struct
import re

def extract_placements(mapinfo_path):
    with open(mapinfo_path, 'rb') as f:
        data = f.read()
    
    placements = []
    model_pattern = rb'\$([A-Z0-9_]+\.MT5)'
    
    for match in re.finditer(model_pattern, data):
        offset = match.start()
        name = match.group(1).decode('ascii')
        
        # Check for concatenated models (skip)
        prev = data[max(0, offset-16):offset]
        if b'.MT5' in prev:
            continue
        
        # Try to extract position from -12 to offset
        if offset >= 12:
            try:
                x, y, z = struct.unpack('<fff', data[offset-12:offset])
                
                # Validate position values
                valid = all(-500 < v < 500 for v in [x, y, z])
                meaningful = any(abs(v) > 0.5 for v in [x, y, z])
                
                if valid and meaningful:
                    placements.append({
                        'model': name,
                        'pos': [x, y, z]
                    })
            except:
                pass
    
    return placements
```

**Known Limitations:**

- Child objects (drawers, shelves) cannot be positioned with this method
- Full hierarchy requires parsing SCN3 bytecode
- Parent-child relationships stored in game logic, not explicit in file

### Slot Identifiers (R##_###)

The SCN3 section uses **slot identifiers** to reference spawn points:

| Format | Description | Example |
|--------|-------------|---------|
| `R##_###` | Room slot | `R01_016`, `R15_028` |
| `DR##_###` | Door slot | `DR23_000` |

These appear to be runtime spawn point IDs that the game engine uses to:
1. Link transforms to specific room locations
2. Enable/disable objects based on game state
3. Handle parent-child object relationships

### Transform Blocks

Transforms are stored as 24-byte blocks:

```
Offset  Size  Description
------  ----  -----------
0x00    4     Scale X (float, typically 1.0)
0x04    4     Scale Y (float)
0x08    4     Scale Z (float)
0x0C    4     Position X (float, in meters)
0x10    4     Position Y (float)
0x14    4     Position Z (float)
```

**Analysis Results (JOMO zone):**
- 1,888 transform blocks found
- 1,248 unique positions
- 58 model references
- 7 slot identifiers

### Analysis Tools

Use `scn3_extractor.py` to extract placement data:

```bash
python3 scn3_extractor.py extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN -v
```

Use `scn3_decoder.py` to disassemble bytecode:

```bash
python3 scn3_decoder.py extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN -v
```

Output includes:
- Transform count and positions
- Model reference list
- Slot identifier list
- JSON file with unique positions

### SCN3 Bytecode Opcodes

Based on documentation from [wulinshu.com](https://wulinshu.com/wiki/index.php/SCN3):

#### Header Structure (48 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00 | 4 | version | Version/flags (typically 0x00020000) |
| 0x04 | 4 | code_offset | Relative offset to code section |
| 0x08 | 4 | data_offset | Relative offset to data section |
| 0x0C | 4 | total_size | Total SCN3 section size |
| 0x10 | 4 | code_size | Code section size |
| 0x18 | 4 | header_size | Header size (48/0x30) |

#### Opcode Ranges

Each opcode is 1 byte. Operand sizes are encoded in the high bits.

**0x00-0x3F: Control Flow & Function Calls**

Format: `00xx nnnn` where `xx` = operand size (1=1byte, 2=2bytes, 3=4bytes)

| Command | Opcodes | Mnemonic | Description |
|---------|---------|----------|-------------|
| 0x0 | 0x10/20/30 | MOBJ_SEL | Select MOBJ slot |
| 0x1 | 0x11/21/31 | MOBJ_REF | MOBJ reference |
| 0x2 | 0x12/22/32 | MOBJ_OP | MOBJ operation |
| 0x3 | 0x13/23/33 | SP_ADD | Move stack pointer by n bytes |
| 0x5 | 0x15/25/35 | JMP | Unconditional jump |
| 0x6 | 0x16/26/36 | JZ | Jump if R14 == 0 |
| 0x8 | 0x18/28/38 | CALL_SET6 | Call function in set 6 (SCNF) |
| 0xB | 0x1B/2B/3B | CALL_SET3 | Call function in set 3 (Shenmue) |

**0x40-0x7F: Immediate Value Loading**

| Range | Mnemonic | Description |
|-------|----------|-------------|
| 0x40-0x4F | PUSH_LAST | Push cached value (index in low nibble) |
| 0x50-0x5F | PUSH_I8 | Push 1-byte immediate to stack |
| 0x60-0x6F | PUSH_I16 | Push 2-byte immediate to stack |
| 0x70-0x7F | PUSH_I32/F32 | Push 4-byte immediate (int or float) |

**0x80-0xBF: Operators (No Operands)**

| Opcode | Mnemonic | Description |
|--------|----------|-------------|
| 0x80 | STK_TO_R14 | Write stack top to R14 |
| 0x82-0x87 | MOBJ_RD/WR | MOBJ read/write operations |
| 0x88-0x8D | EQ/NE/GE/GT/LE/LT | Comparison operators |
| 0x92-0x98 | ADD_EQ/SUB_EQ/etc | Compound assignment operators |
| 0x9D-0xA6 | F_CAST/F_ADD/etc | Float operations |

**0xC0-0xFF: Invalid**

#### Function Sets

| Set | Count | Description |
|-----|-------|-------------|
| SET1 | 1 | Removed function |
| SET2 | 5 | Memory functions (memset, memcpy, etc) |
| SET3 | 466 | General Shenmue functions |
| SET6 | 47 | SCNF stuff |
| SET7 | 8 | Unknown |

### Current Status

**What we CAN extract:**
- All transform positions from SCN3 data section
- All model filenames referenced
- Slot identifiers
- Bytecode disassembly

**What we CANNOT yet do:**
- Match specific transforms to specific models (requires full bytecode execution)
- Parse parent-child hierarchy
- Determine which models get which positions at runtime

**Community Resources:**
- Shenmue Reverse Engineering Discord had a "barebones SCN3 decompiler" (this discord no longer exists)
- SCN3 is essentially extended SH-4 assembly (Dreamcast CPU)
- d3t remasters converted scripts to a simplified format
- https://wulinshu.com/wiki/index.php

---

## Manifest Files

### MPK00.TXT

Text-based manifest listing assets by category.

```
@ map
MAP.MT5
MAP01.MT5
MAP02.MT5

@ character
AKIR_ALL.MT5
FUKU_ALL.MT5

@ door
DOOR01.MT5
```

### MPK00.chr

Binary manifest for character models.

```
DefImage {
    Name = "CHARACTER_NAME"
    File = "MODEL.MT5"
    ...
}
```

---

## Directory Structure

```
SCENE/
├── 01/                         # Scenario 1 (Disc 1)
│   ├── D000/                   # Zone: Dobuita
│   │   ├── MAP0.PKS           # Daytime models
│   │   ├── MAP0.PKF           # Daytime textures
│   │   ├── MAP1.PKS           # Morning models
│   │   ├── MAP1.PKF           # Morning textures
│   │   ├── MAP2.PKS           # Sunset models
│   │   ├── MAP2.PKF           # Sunset textures
│   │   ├── MAP3.PKS           # Night models
│   │   ├── MAP3.PKF           # Night textures
│   │   ├── MPK00.PKS          # Props/doors/interactive objects
│   │   ├── MPK00.PKF          # Props textures
│   │   ├── MAPINFO.BIN        # Scene definition
│   │   └── MPK00.TXT          # Asset manifest
│   │
│   ├── JOMO/                   # Zone: Hazuki Residence Interior
│   │   ├── BEBF.PKS           # Building geometry
│   │   ├── BEBF.PKF           # Building textures
│   │   ├── COMMON01.PKS       # Common assets
│   │   ├── MPK00.PKS          # Props
│   │   ├── *.MT5              # Loose furniture models
│   │   └── MAPINFO.BIN
│   │
│   └── BETD/                   # Zone: Hazuki Residence Exterior (Day)
│       ├── MAP.MT5            # Main geometry (embedded textures)
│       ├── MAP01.MT5-MAP11.MT5
│       └── MAPINFO.BIN
│
├── 02/                         # Scenario 2 (Disc 2/3)
│   └── ...
│
MODEL/
├── CHARA/                      # Character models
│   └── *.MT5
├── OBJECT/                     # Object models
│   └── *.MT5
└── ITEM/                       # Item models
    └── *.MT5

MISC/
└── TEXTURES.PKS/PKF           # Global shared textures
```

---

## Time-of-Day System

Shenmue uses a time-of-day system that affects lighting and textures:

### Archive Structure

Each zone has multiple texture archives for different times:

| Archive | Time Period | Associated Sky |
|---------|-------------|----------------|
| MAP0.PKF | Day | air00-air05 |
| MAP1.PKF | Morning | air06-air13 |
| MAP2.PKF | Sunset/Evening | air18-air32 |
| MAP3.PKF | Night | air53+ |

### How It Works

1. **Model Geometry is Shared**: The same MAP.MT5, MAP01.MT5, etc. files are used for all times
2. **Textures Vary by Time**: Different PKF archives contain time-variant textures
3. **Lighting is Baked**: Vertex colors in the models contain baked lighting appropriate for each time
4. **Runtime Selection**: The game loads textures from the appropriate MAPn.PKF based on in-game time

### Important Clarification

The numbered MAP files (MAP01.MT5, MAP02.MT5, ... MAP26.MT5) are **building sections**, NOT time variants:
- `MAP.MT5` - Base/main geometry
- `MAP01.MT5` to `MAP26.MT5` - Individual building pieces (always visible)
- Time variants are in the **texture archives** (MAP0.PKF through MAP3.PKF)

### Interior Zones

Interior zones (JOMO, DCBN, DGCT, etc.) typically have only one set of textures and no exterior sky.

---

## Texture Pack Binary Format

The web viewer uses a custom texture pack format for efficient loading:

```
[Entry 1]
  0x00  8    Texture ID
  0x08  4    PVRT data length (little-endian)
  0x0C  N    PVRT data

[Entry 2]
  ...

[Entry N]
  ...
```

This format allows the viewer to quickly match NAME references from MT5 files to their corresponding texture data.

---

## Object Placement (SCN3)

Scene object placement in Shenmue is controlled by the `SCN3` section within `MAPINFO.BIN`. This section contains both executable bytecode for logic and data tables for positioning.

### 1. Room Transforms (Absolute)

The data section of SCN3 contains "Room Transforms" (or slots) that define the absolute world-space origin for objects. These typically have an `ID=2` marker.

**Structure (36 bytes):**
- **0x00 (4)**: Entry ID (always `2` for absolute transforms)
- **0x04 (4)**: Flags/Room Index
- **0x08 (12)**: Scale (X, Y, Z) - usually `1.0, 1.0, 1.0`
- **0x14 (12)**: Position (X, Y, Z) - Absolute world/room coordinates
- **0x20 (4)**: Extra flags or rotation data

### 2. Furniture & Child Objects (Relative)

Interactive objects like drawers, sliding doors, and cabinets are positioned relative to their parent transform. These definitions are found in a separate table, often located immediately before the model string table.

**Structure (64 bytes):**
- **0x18 (4)**: Model Index (matches the index in the string table)
- **0x1C (4)**: Relative X Offset
- **0x20 (4)**: Relative Y Offset
- **0x24 (4)**: Relative Z Offset
- **0x34 (4)**: Terminator/Marker (`0xFFFFFFFF`)

### 3. Character Spawns (CHRS)

Character and actor starting positions are defined in the `CHRS` token within `MAPINFO.BIN`.

- **Format**: Floating point $(x, y, z)$ coordinates.
- **Ryo's Spawn**: In JOMO (Hazuki House), Ryo's default back-room spawn is at `(14.90, -0.22, 5.55)`.
- **NPCs**: Similar coordinate blocks exist for all inhabitants (Ine-san, Fuk-san, etc.).

### 4. Bytecode & Execution

The SCN3 bytecode contains opcodes for instantiating these objects:
- `MOBJ_SEL [idx]`: Selects an object or transform from the table.
- `MOBJ_REF`: References a model index for the selected object.
- `CALL_SET3`: General engine calls for object initialization.

---

## Coordinate System

- **Units**: Approximately 1 unit = 1 centimeter
- **Orientation**: 
  - +X = Right (flipped in viewer for proper display)
  - +Y = Up
  - +Z = Forward
- **Rotation**: Fixed-point format, value / 65536 * 2π radians

---

## Trigger Volumes & Collision Geometry

### Invisible Interaction Triggers

Many MT5 models contain invisible cylinder/box primitives used for:
- **Player interaction zones** (e.g., "Press A to examine")
- **Collision boundaries**
- **Camera trigger volumes**
- **Zone transition areas**
- **NPC spawn boundaries**

### Identification

These invisible primitives can be identified by:

1. **Texture ID**: `-1` or `65535` (0xFFFF)
2. **Vertex Colors**: All white (RGB ≈ 1.0, 1.0, 1.0)
3. **Geometry**: Usually simple primitives (cylinders, boxes)

### Filtering Logic

```javascript
// Skip rendering trigger/collision volumes
if (texId === -1 || texId === 65535) {
    const isAllWhite = colors.every(c => c > 0.98);
    if (isAllWhite) {
        // This is a trigger/collision primitive - skip rendering
        continue;
    }
}
```

### Why They Exist

The game engine uses these volumes at runtime for:
- Hit detection with raycast checks
- Determining when player enters interaction range
- Camera zone switching
- Loading zone triggers (streaming adjacent areas)

---

## Vertex Colors

### Purpose

Shenmue uses vertex colors extensively for:
- **Baked lighting** (ambient occlusion, shadows)
- **Time-of-day tinting** (warm sunset, cool night)
- **Material hints** (metal reflections, cloth softness)

### Format

Vertex colors in polygon strips are typically:
- **ARGB format** (4 bytes per vertex)
- Values 0-255 normalized to 0.0-1.0

### Usage in Rendering

```javascript
// Vertex colors should be multiplied with texture, not replaced
material.useVertexColors = true;
material.diffuseColor = new Color3(1, 1, 1); // White base
```

---

## Transparency & Alpha Handling

### Texture Formats with Alpha

| Format | Alpha Type | Use Case |
|--------|------------|----------|
| ARGB1555 | 1-bit punch-through | Fences, foliage, grates |
| ARGB4444 | 4-bit gradient | Frosted glass, smoke |
| ARGB8888 | 8-bit full | High-quality transparency |
| RGB565 | None | Opaque surfaces only |

### Rendering Considerations

**1-bit Alpha (ARGB1555):**
```javascript
material.transparencyMode = MATERIAL_ALPHATEST;
material.alphaTestValue = 0.5;
```

**Gradient Alpha (ARGB4444):**
```javascript
material.transparencyMode = MATERIAL_ALPHABLEND;
material.needDepthPrePass = true;  // Prevents z-fighting
```

### Double-Sided Rendering

Glass and transparent surfaces often need to be visible from both sides:
```javascript
material.backFaceCulling = false;
material.twoSidedLighting = true;
```

---

## Model Flags & Node Types

### Common Node Flags

| Flag | Meaning |
|------|---------|
| 0x00 | Standard visible geometry |
| 0x01 | Has children |
| 0x02 | Has siblings |
| 0x04 | Animated/Dynamic |
| 0x08 | Shadow caster |
| 0x10 | Collision enabled |
| 0x20 | Trigger volume |

### Model Categories

Based on filename patterns:

| Pattern | Category | Example |
|---------|----------|---------|
| `MAP*.MT5` | Main geometry | `MAP.MT5`, `MAP01.MT5` |
| `DR*.MT5` | Doors | `DOOR01.MT5` |
| `*G.MT5` | Gimmicks/Props | `KAKS505G.MT5` |
| `*_ALL.MT5` | Character (all parts) | `AKIR_ALL.MT5` |
| `BIK*.MT5` | Bicycles | `BIKK3P0G.MT5` |
| `GAC*.MT5` | Game center items | `GACH5JKG.MT5` (jukebox) |

---

## UV Coordinate Handling

### Precision Modes

The polygon strip attributes (types 0x02-0x07) contain UV precision flags:

| Bit | Value | Description |
|-----|-------|-------------|
| Bit 0 | 0 | Normal UV (0-255 range) |
| Bit 0 | 1 | High-res UV (0-1023 range) |

### UV Mirroring

Attributes may specify mirroring:
```
Byte 10, Bit 2: U-axis mirror
Byte 10, Bit 1: V-axis mirror
```

### Size Override

Command 0x000B specifies UV divisor:
```javascript
if (type === 0x000B) {
    uvSize = reader.readUShort(); // Usually 256 or 1024
}
```

---

## Twiddling (Morton Order)

### What is Twiddling?

Dreamcast textures use Morton-order (Z-order) encoding for cache-efficient access during rendering. Pixels aren't stored row-by-row but in a recursive Z-pattern.

### De-twiddling Algorithm

```javascript
function untwiddle(x, y, width) {
    let offset = 0;
    for (let i = 0; i < Math.log2(width); i++) {
        offset |= ((x >> i) & 1) << (2 * i);
        offset |= ((y >> i) & 1) << (2 * i + 1);
    }
    return offset;
}
```

### Which Formats Use Twiddling?

| Data Format | Twiddled? |
|-------------|-----------|
| TWIDDLED (0x01) | Yes |
| TWIDDLED_MM (0x02) | Yes |
| VQ (0x03) | Special |
| RECTANGLE (0x09) | No |
| STRIDE (0x0B) | No |

---

## Common Issues & Gotchas

### 1. Models Appearing All White

**Cause**: Texture lookup failure (NAME references not matching PKF entries)

**Solution**: Ensure texture pack contains all referenced IDs with padded 8-byte keys

### 2. Geometry at Wrong Position

**Cause**: Node hierarchy not properly applied

**Solution**: Apply transforms in correct order: parent → child, and accumulate transforms

### 3. Inside-Out Models

**Cause**: Wrong winding order for triangles

**Solution**: Flip triangle indices on odd strips:
```javascript
if (i % 2 === 0) indices.push(a, b, c);
else indices.push(a, c, b);
```

### 4. Black Triangles

**Cause**: Normals pointing wrong direction

**Solution**: Flip normals along with X coordinate when correcting coordinate system

### 5. Missing Interior Geometry

**Cause**: Back-face culling hiding interiors

**Solution**: Disable back-face culling or duplicate triangles with reversed winding

---

## File Naming Conventions

### Zone Codes

| Code | Location |
|------|----------|
| D000 | Dobuita (main street) |
| JOMO | Hazuki Residence Interior |
| BETD | Hazuki Residence Exterior (Day) |
| DCBN | Convenience Store |
| DGCT | Game Center |
| DAZA | Abe Store |
| JD00 | Ryo's Bedroom |
| JHD0 | Hazuki Dojo |

### Prefix Conventions

| Prefix | Meaning |
|--------|---------|
| S1_ | Scenario 1 (Disc 1) |
| S2_ | Scenario 2 (Disc 2/3) |
| G_ | Global assets |
| G_CHARA_ | Character models |
| G_OBJ_ | Object models |
| G_ITEM_ | Item models |

---

## Viewer Implementation Notes

### Recommended Render Settings

```javascript
// Camera
camera.minZ = 0.1;
camera.maxZ = 100000;

// Lighting (baked, so minimal dynamic)
ambientLight.intensity = 0.5;
directionalLight.intensity = 1.0;

// Materials
material.backFaceCulling = false;  // Many interiors need this
material.useVertexColors = true;
material.specularColor = Color3.Black();  // Disable specular
```

### Performance Optimization

1. **Batch by texture**: Group polygons with same texture into single draw call
2. **Cache texture packs**: Load zone textures once, reuse across models
3. **Level of detail**: Large zones can have 60+ models; consider culling distant ones

---

## Differences: Original vs HD Remaster

| Aspect | Original (DC) | HD Remaster |
|--------|---------------|-------------|
| Texture Resolution | 64x64 to 256x256 | Up to 2048x2048 |
| Format | PVR (twiddled) | Standard DDS/PNG |
| Vertex Colors | 8-bit per channel | Same |
| Model Geometry | Identical | Identical |
| Archive Format | PAKS/PAKF | Modified PAKS |

---

## Tools Reference

### Python Scripts

| Script | Purpose |
|--------|---------|
| `scn3_extractor.py` | Extract object, character, and furniture placements from MAPINFO.BIN. Supports absolute room transforms and relative offsets. |
| `scn3_decoder.py` | Disassemble SCN3 bytecode opcodes for scene logic analysis. |
| `furniture_extractor.py`| Specific tool for analyzing furniture parent-child hierarchies. |
| `extract_textures.py` | Extract textures from PKF archives |
| `extract_models.py` | Extract models from PKS archives |
| `pack_textures.py` | Create texture pack bundles for web viewer |

### Web Viewer

The web viewer (`web-viewer/`) provides 3D visualization of Shenmue assets:

```bash
cd web-viewer && npm run dev
```

**Features:**
- MT5/HRCM model loading with texture support
- Time-of-day presets (Day, Sunset, Evening, Night)
- Interior scene detection (disables exterior sky)
- Model hierarchy browser

**Interior Scenes:** JOMO, JD00, JHD0, DCBN, DGCT, DAZA, DMAJ, DSLT, DPIZ, DBYO, etc.

---

## References

- [wulinshu.com SCN3 Documentation](https://wulinshu.com/wiki/index.php/SCN3) - Bytecode format documentation
- [ShenmueDKSharp](https://github.com/LemonHaze420/wudecon) - C# parsing library
- [Shenmue HD Modding](https://github.com/derplayer/ShenmueHDTools) - HD remaster tools
- [GDITools](https://github.com/yazgoo/gditools) - Dreamcast GDI extraction

---

*Document generated from reverse engineering efforts. Some structures may be incomplete or contain inaccuracies.*
