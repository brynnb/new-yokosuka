# SCN3 (Shenmue Script v3) & SEQ (Cinematic Sequence) Research

## VM Overview
The game logic in Shenmue is divided into two primary systems that share the same engine vocabulary:

1.  **SCN3 (MAPINFO.BIN)**: The "Interactive Brain." A stack-based VM for persistent scene logic (if player has X, then do Y).
2.  **SEQ (SEQDATA.AUTH)**: The "Cinematic Script." A timeline-based format for cutscenes, using the same underlying APIs (Set 6, Set 7, etc.) but controlled by a frame-based sequencer.

---

## Core Architecture

### Key Registers
*   **R14 (Status/Return Register):** Stores the result of the last operation or function call. Frequently used for conditional branching (`JZ`).
*   **MOBJ (Model Object Register):** Stores a reference to the currently selected 3D model (usually an index into the MT5 list).
*   **SP (Stack Pointer):** Standard stack pointer for push/pop operations.
*   **PC (Program Counter):** Current instruction address.

### Instruction Categories (Encoding)
Opcodes are 1 byte, divided into categories:

| Category Bits (7-6) | Type | Range | Description |
| :--- | :--- | :--- | :--- |
| `00` | Control Flow | `0x00-0x3F` | Jumps, calls, register math. |
| `01` | Push Immediate | `0x40-0x7F` | Pushing values (0-15, i8, i16, i32) to stack. |
| `10` | Operator | `0x80-0xBF` | Math, logic, stack manipulation. |
| `11` | Ctrl (Flagged) | `0xC0-0xFF` | Same as `00` but likely with a "Wait" or "Interrupt" bit set. |

---

## The "Rosetta Stone" API Resolution
By studying the leaked developer tool `SEQCONV.C` and source code `0154_1.C`, we have resolved the meaning of the persistent engine function sets used in both SCN3 and SEQ.

### Function Sets (CALL_SET)
Functions are dispatched via 8 primary handlers (Set 0-7). In many sets, the first argument is a 16-bit **Operation Code**.

| Set | Developer Label | Frequency | Resolved Meaning |
| :--- | :--- | :--- | :--- |
| **Set1** | `stVOICE` / `voice()` | High | Plays dialogue via AreaID/LineID or direct AIFF file path. |
| **Set3** | `sm_` / `Shenmue_API` | Mixed | High-level game state (Inventory, Flags, Event Scheduling). |
| **Set4** | `ext_` / `Extension` | Mixed | MT5 Model loading (`0x35`) and world placement (`0x36`). |
| **Set6** | `SCNF` / `Scene_Ctl` | High | Camera control (`0x0`), tracking, and scene-level transitions. |
| **Set7** | `entity_` / `Object` | Very High | Direct manipulation of entities (Position, Rotation, Scale). |

### Entity Operation Codes (Set 7)
The first argument of a Set 7 call is a sub-command.
*   **`0x2D56` (entity_setup)**: The most used function. Configures an object's properties.
*   **`0xD44A` (set_position)**: Move entity to X,Y,Z.
*   **`0xD50A` (set_facing)**: Rotate entity to face a specific direction.
*   **`0x2D46` (entity_set_anim)**: Assign an animation chain to the entity.

### The Entity Lifecycle Pattern
Entities follow a strict C++ object lifecycle reflected in the bytecode:
1.  **`entity_init` (0xE400)**: Allocates a slot and prepares resources.
2.  **`entity_activate` (0xE500)**: Spawns the entity into the scene.
3.  **`entity_setup` (0x2D56)**: Configures movement types and properties.

---

## Data Structures

### Character IDs (MAKE_ID)
Identity is handled via 4-character ASCII tags stored as little-endian 32-bit integers.
*   `0x52494B41`: `AKIR` (Internal label for Akira Yuki, used for **Ryo Hazuki**).
*   `0x41524153`: `SARA` (Sara).
*   `0x3B5E5E28`: `ID_CAMERA` (The `(^^;` emoticon).

### FCVKEYt (Spline Channels)
Complex movement and camera paths are stored as **Splines**. Each channel (X pos, Y rot, etc.) uses this layout:
```c
typedef struct {
    float time;         // Frame / 30.0
    float left_slope;   // Cubic spline incoming tangent
    float right_slope;  // Cubic spline outgoing tangent
    float value;        // The actual value (coordinate/angle)
} FCVKEYt;
```
*   **Interleaved Storage**: The binary stores all `times`, then all `values`, then all `slopes` sequentially for efficient streaming into the Cubic Spline interpolator.

---

## Dialogue & Voice Identity
Dialogue IDs in the bytecode follow a specific pattern that links to external text files:
`0xAA3DXXXX`
*   `AA`: **Area ID** (e.g., `0x12` = Hazuki House, `0x10` = Dojo).
*   `3D`: Standard separator byte.
*   `XXXX`: **Line ID** within that area's database.

Example: `DLG_HOUSE_0x101` maps to the first persistent line in the JOMO script.

---

## Completed Roadmap

### 1. Phase 5 Semantic Pass ✓
Expanded the Set 6, Set 7, and Set 4 verb dictionaries in `scn3_to_python.py`:
*   **Set 7**: 100+ op-codes mapped (was ~30). Added full rotation family (`0xD53c`–`0xD5E4`), position family (`0xD44A`–`0xD466`), movement family (`0xD109`–`0xD158`), and extended entity lifecycle (`0xE400`–`0xE700`).
*   **Set 6**: 19 SCNF ops mapped (was 7). Added camera cut/lerp, fog, shake, fade, weather, and scene triggers.
*   **Set 4**: 25 ext ops mapped (was 12). Added model placement variants, material/texture/alpha, and lighting.
*   **Result**: Unresolved hex calls in JOMO dropped from 147 to 65 (56% reduction).

### 2. Entity ID Database ✓
Built `entity_id_database.py` — scans all 42 `MAPINFO.BIN` files for `MAKE_ID` tags.
*   **Result**: 1,108 unique 4-character IDs discovered across 42 scenes.
*   **Top entities**: `AKIR` (Ryo, 3713 refs/42 scenes), `DOOR` (786/37), `FUKU` (603/5), `SIME` (476/34), `FREE` (299/37), `CAM2` (209/22), `CHAI` (150/4), `LGHT` (142/41).
*   **Filtering**: Context-aware rejection of tags embedded in longer ASCII strings.

### 3. Automated Asset Placement Extraction ✓
Built `extract_placements.py` — two-pass extraction from SCN3 analysis JSON.
*   **Pass 1 (Bytecode)**: Tracks MOBJ_SEL → CALL_SET7 associations. 26 models mapped to position/rotation/scale/init/activate code calls.
*   **Pass 2 (Data Section)**: 182 transform groups (scale+position float sextuplets) extracted and correlated with models by offset proximity. 7 models directly associated.
*   **Output**: Babylon.js-compatible JSON manifest with per-model instance lists.

### 4. Interactive Spline Support ✓
Built `extract_splines.py` — heuristic FCVKEYt spline detection from raw `MAPINFO.BIN`.
*   **Result (JOMO)**: 241 spline groups found — 137 camera paths, 44 transform paths, 20 animation curves, 1 full movement path.
*   **Path Sampling**: Generates XYZ path points using the same cubic interpolation logic as cutscenes.
*   **Hermite Interpolation**: Includes `cubic_interpolate()` matching the game engine's spline evaluation.

### 5. Multi-Scene Scaling ✓
Built `bulk_analyze.sh` — full pipeline orchestrator for all 42 game scenes.
*   **Pipeline**: Ghidra headless analysis → `scn3_to_python.py` → `extract_placements.py` → `extract_splines.py` → `entity_id_database.py`.
*   **Modes**: Primary scenes (8 key locations) or `--all` (42 scenes).
*   **Output**: Per-scene analysis directories + global `entity_id_database.json` + combined `manifest.json`.

---

## Future Work

### Remaining Unresolved Calls
65 hex calls remain in the JOMO decompilation (36 Set 7, 17 Set 6, 12 Set 4). Many are likely misparses from stack desynchronization rather than real op-codes (e.g., `set7_0xf8dceaff`). A full VM simulator would resolve these.

### Entity Name Resolution
The entity ID database contains 1,100 unknown tags. Cross-referencing with the game's text databases and NPC model filenames would map these to human-readable names.

### Full VM Simulation
A complete stack-machine simulator (rather than linear disassembly) would correctly track float values through the stack, enabling direct extraction of position/rotation coordinates from bytecode rather than relying on DATA section heuristics.
