# Shenmue I file formats

Native archive, model, texture, and scene-format findings. Some early
interpretations remain hypotheses; the source evidence and current parsers take
precedence. This is not the application architecture guide.

For current rendering policy, use [shared scene rendering](../../implementation/asset-browser.md),
[alpha handling](../../implementation/alpha-texture-antialiasing.md), and
[character surfaces](../../implementation/shenmue1-character-rendering.md).
The older illustrative snippets below are not global loader defaults. In
particular, native trigger identity and one-/two-sided surfaces require their
actual records; white geometry or a filename alone is not proof of purpose.

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

**Node transforms:**

MT5 rotations are fixed-turn Euler angles applied in explicit X, then Y, then
Z order. Using row-vector notation, a node's local source transform is:

```text
local = Scale × RotationX × RotationY × RotationZ × Translation
world = local × parentWorld
```

Do not assign the three angles directly to Babylon's Euler `rotation`
property. Babylon evaluates Euler angles in a different order; yaw-only nodes
remain correct, but multi-axis nodes can be severely misoriented. The uphill
guardrails in JU00 are a reproducible example: their authored rotations produce
an approximately 12-degree slope in source order but appeared tilted by as much
as 73 degrees under Babylon's default Euler composition.

The browser reflects source X into browser space. For the reflection matrix
`F = Scale(-1, 1, 1)`, convert the complete local transform as:

```text
browserLocal = F × local × F
```

Decompose `browserLocal` into position, scale, and a quaternion before assigning
it to a Babylon node. Conjugating the complete matrix preserves hierarchy and
is equivalent to negating position X and the Y/Z rotation signs only when the
angles are still composed in MT5's X-Y-Z order.

Interactive animation must retain this representation. While a Babylon
`rotationQuaternion` is active, writes to `rotation.x/y/z` have no effect.
Door, drawer-handle, clock, and ambient-node animations therefore update the
appropriate authored browser-space angle and rebuild the source-order
quaternion for each pose.

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

The main scene definition file containing scene scripts and tables for lighting,
objects, characters, doors, collisions, and transitions. It contains important
placement inputs, but it is not a flat list of every object and transform:
scripts instantiate many objects conditionally, and scheduled actors are managed
by a separate runtime system.

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
| SCN3 | Scene scripts and data tables used to instantiate and control objects (largest section) |
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

The SCN3 token is the largest and most complex. It contains a custom
scripting/bytecode program plus data tables used to build and control the scene;
it is not itself a serialized copy of the final runtime hierarchy.

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

**Placement Data:**

Do not assume the 12 bytes immediately before a `$MODEL.MT5` string are its
position. Model names commonly live in tables and are selected indirectly by
SCN3/JOMO script operations. Some static transform records can be decoded
offline, but active objects are most reliably associated by following their
relocated HRCM, HMDL, TASK, and render-node pointers in a RAM snapshot.

Parent/child placement is likewise not recoverable merely from string order.
For instantiated objects, the runtime HMDL hierarchy supplies local node
transforms and the owning TASK supplies the world transform. Static door records
form a second useful source that can be extracted from MAPINFO without running
the game.

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

MAPINFO stores the inputs and programs used to create a scene rather than one
complete, unconditional placement manifest:

1. **String Table**: Model filenames (`$NAME.MT5`) are stored in a contiguous string table
   - Located approximately at offsets 0x99ADC to 0x9C9D7 in JOMO's MAPINFO.BIN
   - 47+ drawer/furniture models listed consecutively without position data

2. **Static Records**: Some classes, notably doors, have decodable model,
   transform, and slot records that can be extracted offline

3. **Bytecode Execution**: SCN3 is a custom VM whose handlers are implemented
   in SH-4 game code
   - Uses stack-based operations
   - Conditional execution for time-of-day variants
   - References to game functions in main executable

4. **Runtime Instances**: A Flycast RAM snapshot resolves conditional execution
   and lets the extractor associate active models with exact TASK transforms

The older proximity-to-string Python example below is useful only as a heuristic
for finding candidate float data. Its output must not be treated as authoritative
object placement.

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
- Nearby floats and strings do not prove a parent-child relationship
- Use the runtime HMDL/TASK traversal or a proven class-specific static record
  extractor for authoritative placement

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

### Script representation and extraction limits

The older community bytecode tables are maintained separately in the
[scene-script format reference](../scene-script-bytecode.md), with their
[external instruction source](../../reference/external/scene-script-instructions.md).
They must not be applied indiscriminately to Dreamcast SCN3 executable regions.
The current [native script recovery](../../guides/native-script-recovery.md)
pipeline retains SH-4 control flow, relocation, exact calls, and unresolved
boundaries rather than treating every room program as byte-sized VM opcodes.

Static model/transform records, instantiated RAM objects, and schedule-controlled
actors are separate sources. A discovered model string does not prove an active
instance; a single capture does not prove its lifetime or every possible state.
Use the [placement research](runtime-object-placement.md),
[schedule research](scheduled-actors.md), and generated inventories for those
contracts. The earlier extraction checklist is not current application status.

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
│   └── BETD/                   # Bad-ending exterior/Yamanose variant, not the normal grounds
│       ├── MAP.MT5            # Main geometry (embedded textures)
│       ├── MAP01.MT5-MAP11.MT5
│       └── MAPINFO.BIN
│
├── 02/                         # Scenario 2 files from Disc 2
│   └── ...
├── 03/                         # Disc 3 scene namespace
│   ├── MA00/                   # Forklift job and race
│   ├── MFSY/                   # Disc 3 harbor variants
│   ├── NBIK/                   # Motorcycle sequence
│   ├── MFBT/                   # 70-person battle
│   └── MEND/                   # Ending
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

## Coordinate System

- **Units**: Runtime/browser world coordinates are approximately meters
- **Orientation**:
  - Dreamcast X is negated for the browser (`browser = [-x, y, z]`)
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

### Coplanar facade overlays

Some Dreamcast maps deliberately place detail polygons—windows, shutters,
flat doors, and signs—only a few millimetres in front of a larger wall. With a
large browser-camera clip range, those two depths can quantize to the same
value at a distance and flicker even though they are stable close up.

`tools/assets/mt5_overlay_analyzer.js` solves this without guessing from asset names.
It projects nearly parallel MT5 triangles into the plane, measures overlap,
and classifies a face as a detail only when it is substantially smaller and
almost fully covered by a backing face. The offline generator scans available
catalog maps:

```bash
npm run build:mt5-overlays
```

It writes stable `(filename, node address, texture ID, original face ID)`
records to `play/data/mt5-overlay-manifest.json`. During `/play` loading,
`Mt5Loader` separates only those recorded faces and applies Babylon material
depth bias with both `zOffset` and `zOffsetUnits`. Full meshes do not need to
be converted or rewritten. The separated render faces are excluded from
player, terrain, and camera collision, while the triangle debug picker maps
them back to their original MT5 face IDs.

The player camera also uses a bounded `0.25`–`10,000` clip interval instead of
the former `0.1`–`100,000` interval. This preserves more depth precision while
still containing the camera-following sky dome and global water.

### Double-Sided Rendering

Some authored surfaces are two-sided, but transparency alone does not establish
that property. The shared loader's material and winding rules own this choice;
do not globally disable culling to compensate for an incorrectly decoded mesh.

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

| Data Format | Twiddled? | Notes |
|-------------|-----------|-------|
| TWIDDLED (0x01) | Yes | Square textures only |
| TWIDDLED_MM (0x02) | Yes | With mipmaps |
| VQ (0x03) | Special | Codebook indices are twiddled |
| RECTANGLE (0x09) | No | Linear pixel data |
| STRIDE (0x0B) | No | Linear with stride |
| TWIDDLED_RECT (0x0D) | Yes (tiled) | Non-square: split into N square tiles, each twiddled |

### TWIDDLED_RECTANGLE (0x0D)

Non-square twiddled textures are stored as multiple square tiles:
- **Wide (w > h)**: N tiles of h×h pixels placed left to right (e.g., 512×256 = two 256×256 tiles)
- **Tall (h > w)**: N tiles of w×w pixels stacked vertically
- Each tile is independently Morton-order twiddled
- Tiles can be any power-of-two ratio (2:1, 4:1, 8:1, etc.)

### Known Extraction Bug (pvmarchive.py)

The `convert2dArray` method in `Shenmue-Export-Tools/PythonPVR/pvmarchive.py` has a stride bug:
```python
# BUG: uses height instead of width as stride
array[y * self.height + x]  # Wrong for non-square textures
# Should be:
array[y * self.width + x]
```
For square textures (width == height) this is harmless. For non-square textures like the 512×256 sky textures, it produces visible striations and mirrored halves. The `pvr_decoder.py` module and `convert_sky_textures.py` tool in this project provide a correct implementation that re-extracts sky textures directly from the original PVR files.

---

## Common Issues & Gotchas

### 1. Models Appearing All White

**Cause**: Texture lookup failure (NAME references not matching PKF entries)

**Solution**: Ensure texture pack contains all referenced IDs with padded 8-byte keys

### 2. Geometry at Wrong Position

**Cause**: Node hierarchy not properly applied

**Solution**: Apply transforms in correct order: parent → child, and accumulate transforms

### 3. Geometry at Wrong Angle

**Cause**: MT5 X-Y-Z rotations were assigned directly to an engine's generic
Euler-angle property, which uses a different composition order

**Solution**: Build `Scale × RotationX × RotationY × RotationZ × Translation`,
reflect the complete matrix into browser space, then assign its decomposed
quaternion. A yaw-only test is insufficient because rotation-order errors become
visible only on multi-axis nodes.

### 4. Inside-Out Models

**Cause**: Wrong winding order for triangles

**Solution**: Flip triangle indices on odd strips:
```javascript
if (i % 2 === 0) indices.push(a, b, c);
else indices.push(a, c, b);
```

### 5. Black Triangles

**Cause**: Normals pointing wrong direction

**Solution**: Flip normals along with X coordinate when correcting coordinate system

### 6. Missing Interior Geometry

**Cause**: Back-face culling hiding interiors

**Solution**: Disable back-face culling or duplicate triangles with reversed winding

---

## File Naming Conventions

### Zone Codes

| Code | Location |
|------|----------|
| D000 | Dobuita (main street) |
| JOMO | Hazuki Residence Interior |
| JHD0 | Hazuki Residence Grounds / Exterior |
| JU00 | Yamanose |
| JD00 | Sakuragaoka |
| BETD | Bad-ending exterior/Yamanose variant |
| DCBN | Convenience Store |
| DGCT | Game Center |
| DAZA | Abe Store |

### Prefix Conventions

| Prefix | Meaning |
|--------|---------|
| S1_ | Existing Scenario 1 assets from the Disc 1/2 pipeline |
| S2_ | Existing Scenario 2 assets from the Disc 2 pipeline |
| S3_ | Disc 3 scene assets from `SCENE/03` |
| G_ | Global assets |
| G_CHARA_ | Character models |
| G_OBJ_ | Object models |
| G_ITEM_ | Item models |

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

## References

- [wulinshu.com SCN3 Documentation](https://wulinshu.com/wiki/index.php/SCN3) - Bytecode format documentation
- [ShenmueDKSharp](https://github.com/LemonHaze420/wudecon) - C# parsing library
- [Shenmue HD Modding](https://github.com/derplayer/ShenmueHDTools) - HD remaster tools
- [GDITools](https://github.com/yazgoo/gditools) - Dreamcast GDI extraction
- [Runtime placement documentation](runtime-object-placement.md)
- [Runtime animation documentation](runtime-object-animation.md)
- [JOMO operation trace](jomo-object-operation-trace.md)
- [Map transition trace](map-transition-trace.md)
- [In-world television video surfaces](../../implementation/tv-video-surfaces.md)

---

*Document generated from reverse engineering efforts. Some structures may be incomplete or contain inaccuracies.*
