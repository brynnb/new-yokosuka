# SEQ (Cinematic Sequence) Research

## Overview
SEQ files (`SEQDATA*.AUTH`) are the binary containers for Shenmue's cinematic cutscenes. They were produced by the developer tool `SEQCONV.C` and are interpreted by the game engine's cinematic sequencer.

---

## File Structure (TRCK/ASEQ)
The file uses a chunk-based container format:

### 1. TRCK Header
*   `0x00`: `TRCK` Magic (4 bytes)
*   `0x04`: Total File Size (uint32)

### 2. ASEQ Chunk (Sequence Data)
*   `0x08`: `ASEQ` Magic (4 bytes)
*   `0x0C`: Chunk Size (uint32)
*   `0x10`: Flags (Version=5, Endian=0)
*   `0x14`: Total Frame Count (uint32)

### 3. Command Buffer
An array of frame-indexed commands. Each command block starts with a frame number (int32).
*   **Terminator**: `-1` (0xFFFFFFFF) ends the command buffer.
*   **Command Structure**:
    *   `Type`: u8 (0=END, 1=CAMERA, 2=MOVE, 3=MOTION, 4=EFFECT, 5=VOICE, 6=SE)
    *   `ArgCount`: u8
    *   `Reserved`: u16
    *   `Args`: Array of 32-bit integers of length `ArgCount`.

---

## Spline Data (ACAM / AMOV Chunks)
Complex movement is stored as cubic splines.

### ACAM (Camera Splines)
Stores 8 channels of data:
`POS-X, POS-Y, POS-Z, INT-X, INT-Y, INT-Z, ROLL, PERS` (FOV).

### AMOV (Movement Splines)
Stores 9 channels of data per character:
`TRS-X, TRS-Y, TRS-Z, ROT-X, ROT-Y, ROT-Z, KAO-X, KAO-Y, KAO-Z`.

### Spline Binary Format (`FCVKEYt`)
Each channel stores an interleaved array of keyframes:
1.  **Key Count**: `n` (Total number of generated keys).
2.  **Times**: `float32[n]` array of time values (Frame / 30.0).
3.  **Values**: `float32[n]` array of coordinate/angle values.
4.  **Slopes**: `float32[n]` array of tangents for Hermite/Cubic interpolation.

Note: Developers reorder the camera channels in the binary specifically to put `ROLL` before `PERS` (FOV).

---

## The "Rosetta Stone" Source Match
Through analysis of the `MS08` (Warehouse 8) sequence data, we matched the decompiled binary structures to the leaked `0154_1.C` source code with 100% accuracy.

### Command Type Mapping
| Type | Label | Example Source Format |
| :--- | :--- | :--- |
| **1** | `stCAMERA` | `ID_CAMERA, cam_index` |
| **2** | `stMOVE` | `ID_AKI, move_index` |
| **3** | `stMOTION` | `ID_AKI, motion_id, start_frame, end_frame, flag` |
| **5** | `stVOICE` | `ID_AKI, voice_id, lip_sync_flag, (voice_path)` |
| **6** | `stSE` | `ID_AKI, se_id, (se_path)` |

### Character ID Tags (`MAKE_ID`)
The binary stores character identities as 4-byte ASCII tags:
*   `AKIR` (0x52494B41) -> **ID_AKI** (Ryo Hazuki)
*   `SARA` (0x41524153) -> **ID_SARA** (Sara)
*   `(^^;` (0x3B5E5E28) -> **ID_CAMERA** (The camera sentinel)

---

## Tooling
*   **`seq_decompiler.py`**: Inverse-engineered from `SEQCONV.C`. It parses the TRCK/ASEQ chunks and reconstructions the original FCVKEYt arrays and Scene timelines into C source code formats suitable for diffing against leaked source.
