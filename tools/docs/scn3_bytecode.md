# SCN3 (Scene Script v3) Bytecode Documentation

Based on documentation from [wulinshu.com](https://wulinshu.com/wiki/) and reverse engineering analysis.

## Overview

SCN3 is the scene script format used in Shenmue 1 and 2. It contains:
- **Bytecode** for game logic (converted from original SH-4 assembly)
- **Data tables** with object transforms (scale, position)
- **String tables** with model names and slot references

## File Structure

### MAPINFO.BIN Layout

```
00000000: ATTR token (8 bytes)
00000008: SCN3 token
  +0: 'SCN3' (4 bytes magic)
  +4: size (4 bytes, little-endian)
  +8: SCN3 header (48 bytes)
  +56: Bytecode/data mix
  ...
[other tokens: COLS, FLDD, LGHT, CHRD, etc.]
```

### SCN3 Header (48 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0x00 | 4 | version | Version/flags (typically 0x00020000) |
| 0x04 | 4 | code_offset | Relative offset to code section |
| 0x08 | 4 | data_offset | Relative offset to data section |
| 0x0C | 4 | total_size | Total SCN3 section size |
| 0x10 | 4 | code_size | Code section size |
| 0x14 | 4 | reserved | Reserved/padding |
| 0x18 | 4 | header_size | Header size (48/0x30) |
| 0x1C | 4 | reserved | Reserved/padding |

## Bytecode Opcodes

Each opcode is 1 byte. Operand sizes are encoded in the high bits.

### 0x00-0x3F: Control Flow & Function Calls

Format: `00xx nnnn` where:
- `xx` = operand size (1=1byte, 2=2bytes, 3=4bytes)
- `nnnn` = command

| Command | Opcodes | Mnemonic | Description |
|---------|---------|----------|-------------|
| 0x0 | 0x10/20/30 | MOBJ_SEL | Select MOBJ slot |
| 0x1 | 0x11/21/31 | MOBJ_REF | MOBJ reference |
| 0x2 | 0x12/22/32 | MOBJ_OP | MOBJ operation |
| 0x3 | 0x13/23/33 | SP_ADD | Move stack pointer by n bytes |
| 0x4 | 0x14/24/34 | JMPX | Jump by n bytes + unknown |
| 0x5 | 0x15/25/35 | JMP | Unconditional jump |
| 0x6 | 0x16/26/36 | JZ | Jump if R14 == 0 |
| 0x7 | 0x17/27/37 | MOV_REG | Write n to register |
| 0x8 | 0x18/28/38 | CALL_SET6 | Call function in set 6 (SCNF) |
| 0x9 | 0x19/29/39 | CALL_SET1 | Call function in set 1 |
| 0xA | 0x1A/2A/3A | CALL_SET2 | Call function in set 2 (memory) |
| 0xB | 0x1B/2B/3B | CALL_SET3 | Call function in set 3 (Shenmue) |
| 0xC | 0x1C/2C/3C | CALL_SET4 | Call function in set 4 |
| 0xD | 0x1D/2D/3D | CALL_SET7 | Call function in set 7 |

### 0x40-0x7F: Immediate Value Loading

Format: `01xx ddnn` where:
- `xx` = value size
- `dd` = command
- `nn` = subcommand

| Range | Mnemonic | Description |
|-------|----------|-------------|
| 0x40-0x4F | PUSH_LAST | Push cached value (index in low nibble) |
| 0x50-0x5F | PUSH_I8 | Push 1-byte immediate to stack |
| 0x60-0x6F | PUSH_I16 | Push 2-byte immediate to stack |
| 0x70-0x7F | PUSH_I32/F32 | Push 4-byte immediate (int or float) |

### 0x80-0xBF: Operators (No Operands)

| Opcode | Mnemonic | Description |
|--------|----------|-------------|
| 0x80 | STK_TO_R14 | Write stack top to R14 |
| 0x81 | R14_TO_STK | Push R14 to stack |
| 0x82 | MOBJ_RD8 | Read 8-bit from MOBJ cycle pointer |
| 0x83 | MOBJ_RD16 | Read 16-bit from MOBJ cycle pointer |
| 0x84 | MOBJ_RD32 | Read 32-bit from MOBJ cycle pointer |
| 0x85 | MOBJ_WR8 | Write 8-bit to MOBJ cycle pointer |
| 0x86 | MOBJ_WR16 | Write 16-bit to MOBJ cycle pointer |
| 0x87 | MOBJ_WR32 | Write 32-bit to MOBJ cycle pointer |
| 0x88 | EQ | Compare == |
| 0x89 | NE | Compare != |
| 0x8A | GE | Compare >= |
| 0x8B | GT | Compare > |
| 0x8C | LE | Compare <= |
| 0x8D | LT | Compare < |
| 0x8E | NOT | Bitwise NOT (~) |
| 0x8F | AND_EQ | Compound &= |
| 0x90 | OR_EQ | Compound \|= |
| 0x91 | XOR_EQ | Compound ^= |
| 0x92 | ADD_EQ | Compound += |
| 0x93 | SUB_EQ | Compound -= |
| 0x94 | MUL_EQ | Compound *= |
| 0x95 | DIV_EQ | Compound /= |
| 0x96 | MOD_EQ | Compound %= |
| 0x97 | SHL_EQ | Compound <<= |
| 0x98 | SHR_EQ | Compound >>= |
| 0x9D | F_CAST | Cast to float |
| 0x9E | I_CAST | Cast to signed int |
| 0x9F | F_LE | Float <= |
| 0xA0 | F_LT | Float < |
| 0xA1 | F_GE | Float >= |
| 0xA2 | F_GT | Float > |
| 0xA3 | F_ADD | Float + |
| 0xA4 | F_SUB | Float - |
| 0xA5 | F_MUL | Float * |
| 0xA6 | F_DIV | Float / |

### 0xC0-0xFF: Invalid

These opcodes are not used.

## Function Sets

| Address | Set | Count | Description |
|---------|-----|-------|-------------|
| 140559C98 | 1 | 1 | Removed function |
| 140559CA0 | 2 | 5 | Memory functions (memset, memcpy, etc) |
| 140559CD0 | 3 | 466 | General Shenmue functions |
| 140A4F1E0 | 4 | 1 | Unknown |
| 140A4F1E8 | 5 | 1 | Unknown |
| 140A4F1F0 | 6 | 47 | SCNF stuff |
| 140554210 | 7 | 8 | Unknown |

## Data Section

The data section (at `data_offset` from header) contains:

### Transform Data

Object transforms are stored as 24-byte blocks:
```
[scale_x: f32][scale_y: f32][scale_z: f32]
[pos_x: f32][pos_y: f32][pos_z: f32]
```

### Slot References

Slot strings identify spawn points:
- `R##_###` - Room slot (e.g., R01_016, R15_026)
- `DR##_###` - Door slot (e.g., DR01_016, DR23_000)

These are referenced by pointers in the bytecode.

### Model References

Model names are stored as null-terminated strings:
- Format: `$NAME.MT5` (e.g., `$TTMS246G.MT5`)

## Example: JOMO (Hazuki Residence)

JOMO has 20 object placements at floor level (Y ≈ 0):
- Entrance area: (-0.32, 0, -1.82), (-0.09, 0, 1.85)
- Main room: (15-21, 0, -5 to 6) range
- 58 model references
- 7 slot references (DR01_015, DR15_016, etc.)

## Tools

- `scn3_decoder.py` - Full bytecode disassembler
- `scn3_extractor.py` - Extract placement data to JSON

## References

- [wulinshu.com SCN3 Documentation](https://wulinshu.com/wiki/index.php/SCN3)
- [wulinshu.com Shenmue Scripts](https://wulinshu.com/wiki/)
