#!/usr/bin/env python3
"""
SCN3 Bytecode Decoder for Shenmue MAPINFO.BIN files

This is a complete bytecode decoder based in part on wulinshu.com documentation.

OPCODE STRUCTURE:
-----------------
0x00-0x3F: Control-flow, function calling
  - Format: 00xx nnnn (x=size: 1=1byte, 2=2byte, 3=4byte; n=command)
  - 0x10-0x12: MOBJ related
  - 0x13: Stack pointer movement
  - 0x14-0x16: Jump operations
  - 0x17: Register write
  - 0x18-0x1D: Function set calls (sets 1-7)

0x40-0x7F: Immediate value loading to stack
  - Format: 01xx ddnn (x=size, d=command, n=subcommand)
  - 0x40-0x4F: Push last value
  - 0x50-0x5F: Push 1-byte immediate
  - 0x60-0x6F: Push 2-byte immediate
  - 0x70-0x7F: Push 4-byte immediate (can be float!)

0x80-0xBF: Operators (no operands)
  - 0x80-0x81: R14 register operations
  - 0x82-0x87: MOBJ read/write operations
  - 0x88-0x98: Integer comparisons and arithmetic
  - 0x9D-0xA6: Float operations

0xC0-0xFF: Invalid

"""

import struct
import re
import json
import os
import sys
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum

class OpcodeType(Enum):
    CONTROL = "control"
    PUSH = "push"
    OPERATOR = "operator"
    MOBJ = "mobj"
    JUMP = "jump"
    CALL = "call"
    INVALID = "invalid"

@dataclass
class Instruction:
    """A decoded instruction."""
    offset: int
    opcode: int
    mnemonic: str
    operands: List[Any] = field(default_factory=list)
    size: int = 1
    type: OpcodeType = OpcodeType.CONTROL
    comment: str = ""
    
    def __str__(self):
        ops = ", ".join(f"{o}" if isinstance(o, (int, float)) else str(o) for o in self.operands)
        base = f"0x{self.offset:06X}: {self.mnemonic:16s}"
        if ops:
            base += f" {ops}"
        if self.comment:
            base += f"  ; {self.comment}"
        return base


class SCN3BytecodeDecoder:
    """
    Full bytecode decoder for SCN3 section.
    """
    
    # Function set descriptions from wiki
    FUNCTION_SETS = {
        0x18: ("SET6", "SCNF stuff", 47),
        0x19: ("SET1", "Removed function", 1),
        0x1A: ("SET2", "Memory functions (memset, memcpy, etc)", 5),
        0x1B: ("SET3", "General Shenmue stuff", 466),
        0x1C: ("SET4", "Unknown", 1),
        0x1D: ("SET7", "Unknown", 8),
    }
    
    def __init__(self, data: bytes, base_offset: int = 0):
        self.data = data
        self.base_offset = base_offset
        self.instructions: List[Instruction] = []
        self.labels: Dict[int, str] = {}
        self.float_pushes: List[Tuple[int, float]] = []
        self.int_pushes: List[Tuple[int, int]] = []
        self.mobj_ops: List[Dict] = []
        self.function_calls: List[Dict] = []
        
    def read_bytes(self, offset: int, count: int) -> bytes:
        return self.data[offset:offset+count]
    
    def read_u8(self, offset: int) -> int:
        return self.data[offset] if offset < len(self.data) else 0
    
    def read_i8(self, offset: int) -> int:
        return struct.unpack('<b', self.data[offset:offset+1])[0]
    
    def read_u16(self, offset: int) -> int:
        return struct.unpack('<H', self.data[offset:offset+2])[0]
    
    def read_i16(self, offset: int) -> int:
        return struct.unpack('<h', self.data[offset:offset+2])[0]
    
    def read_u32(self, offset: int) -> int:
        return struct.unpack('<I', self.data[offset:offset+4])[0]
    
    def read_i32(self, offset: int) -> int:
        return struct.unpack('<i', self.data[offset:offset+4])[0]
    
    def read_f32(self, offset: int) -> float:
        return struct.unpack('<f', self.data[offset:offset+4])[0]
    
    def read_operand(self, offset: int, size_bits: int) -> Tuple[Any, int]:
        """
        Read an operand based on size encoding.
        size_bits: 1 = 1 byte, 2 = 2 bytes, 3 = 4 bytes
        Returns (value, bytes_consumed)
        """
        if size_bits == 1:
            return self.read_u8(offset), 1
        elif size_bits == 2:
            return self.read_u16(offset), 2
        elif size_bits == 3:
            # Could be int or float - check
            u32 = self.read_u32(offset)
            f32 = self.read_f32(offset)
            import math
            if not math.isnan(f32) and not math.isinf(f32) and abs(f32) < 100000:
                return f32, 4
            return u32, 4
        return 0, 0
    
    def decode_0x00_0x3F(self, offset: int, opcode: int) -> Optional[Instruction]:
        """Decode control-flow and function call opcodes."""
        
        # Get size encoding (bits 4-5)
        size_bits = (opcode >> 4) & 0x3
        command = opcode & 0x0F
        
        if size_bits == 0:
            # Special cases with no operand
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic=f"OP_{opcode:02X}",
                size=1,
                type=OpcodeType.CONTROL,
                comment="Unknown control opcode"
            )
        
        operand, op_size = self.read_operand(offset + 1, size_bits)
        
        # Determine mnemonic based on command
        if command == 0:  # MOBJ related
            self.mobj_ops.append({'offset': offset, 'opcode': opcode, 'value': operand, 'type': 0})
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="MOBJ_SEL",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.MOBJ,
                comment="Select MOBJ slot"
            )
        elif command == 1:  # MOBJ related
            self.mobj_ops.append({'offset': offset, 'opcode': opcode, 'value': operand, 'type': 1})
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="MOBJ_REF",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.MOBJ,
                comment="MOBJ reference"
            )
        elif command == 2:  # MOBJ related
            self.mobj_ops.append({'offset': offset, 'opcode': opcode, 'value': operand, 'type': 2})
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="MOBJ_OP",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.MOBJ,
                comment="MOBJ operation"
            )
        elif command == 3:  # Stack pointer
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="SP_ADD",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.CONTROL,
                comment=f"Move SP by {operand} bytes"
            )
        elif command == 4:  # Jump + unknown
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="JMPX",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.JUMP,
                comment=f"Jump by {operand} + ?"
            )
        elif command == 5:  # Unconditional jump
            operand_int = int(operand) if isinstance(operand, float) else operand
            target = offset + 1 + op_size + operand_int
            self.labels[target] = f"L_{target:04X}"
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="JMP",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.JUMP,
                comment=f"Jump to 0x{target:X}"
            )
        elif command == 6:  # Jump if R14 zero
            operand_int = int(operand) if isinstance(operand, float) else operand
            target = offset + 1 + op_size + operand_int
            self.labels[target] = f"L_{target:04X}"
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="JZ",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.JUMP,
                comment=f"Jump to 0x{target:X} if R14==0"
            )
        elif command == 7:  # Register write
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="MOV_REG",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.CONTROL,
                comment=f"Write {operand} to register"
            )
        elif command >= 8 and command <= 0xD:  # Function set calls
            set_info = self.FUNCTION_SETS.get(command + 0x10)
            set_name = set_info[0] if set_info else f"SET{command-7}"
            set_desc = set_info[1] if set_info else ""
            
            self.function_calls.append({
                'offset': offset,
                'set': set_name,
                'function': operand
            })
            
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic=f"CALL_{set_name}",
                operands=[operand],
                size=1 + op_size,
                type=OpcodeType.CALL,
                comment=set_desc
            )
        
        return Instruction(
            offset=offset + self.base_offset,
            opcode=opcode,
            mnemonic=f"CTL_{opcode:02X}",
            operands=[operand],
            size=1 + op_size,
            type=OpcodeType.CONTROL
        )
    
    def decode_0x40_0x7F(self, offset: int, opcode: int) -> Instruction:
        """Decode immediate value push opcodes."""
        
        high = (opcode >> 4) & 0xF
        low = opcode & 0xF
        
        if high == 4:  # 0x40-0x4F: Push last value
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="PUSH_LAST",
                operands=[low],
                size=1,
                type=OpcodeType.PUSH,
                comment=f"Push cached value {low}"
            )
        elif high == 5:  # 0x50-0x5F: Push 1-byte
            val = self.read_u8(offset + 1)
            self.int_pushes.append((offset, val))
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="PUSH_I8",
                operands=[val],
                size=2,
                type=OpcodeType.PUSH,
                comment=f"Push byte {val} (0x{val:02X})"
            )
        elif high == 6:  # 0x60-0x6F: Push 2-bytes
            val = self.read_u16(offset + 1)
            self.int_pushes.append((offset, val))
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="PUSH_I16",
                operands=[val],
                size=3,
                type=OpcodeType.PUSH,
                comment=f"Push short {val} (0x{val:04X})"
            )
        elif high == 7:  # 0x70-0x7F: Push 4-bytes (int or float)
            u32 = self.read_u32(offset + 1)
            f32 = self.read_f32(offset + 1)
            
            import math
            if not math.isnan(f32) and not math.isinf(f32) and 0.001 < abs(f32) < 10000:
                self.float_pushes.append((offset, f32))
                return Instruction(
                    offset=offset + self.base_offset,
                    opcode=opcode,
                    mnemonic="PUSH_F32",
                    operands=[f32],
                    size=5,
                    type=OpcodeType.PUSH,
                    comment=f"Push float {f32:.4f}"
                )
            else:
                self.int_pushes.append((offset, u32))
                return Instruction(
                    offset=offset + self.base_offset,
                    opcode=opcode,
                    mnemonic="PUSH_I32",
                    operands=[u32],
                    size=5,
                    type=OpcodeType.PUSH,
                    comment=f"Push int 0x{u32:08X}"
                )
        
        return Instruction(
            offset=offset + self.base_offset,
            opcode=opcode,
            mnemonic=f"PUSH_{opcode:02X}",
            size=1,
            type=OpcodeType.PUSH
        )
    
    def decode_0x80_0xBF(self, offset: int, opcode: int) -> Instruction:
        """Decode operator opcodes (no operands)."""
        
        OPERATORS = {
            0x80: ("STK_TO_R14", "Write stack value to R14"),
            0x81: ("R14_TO_STK", "Read R14 value to stack"),
            0x82: ("MOBJ_RD8", "[MOBJ] Read 8-bit from cycle ptr"),
            0x83: ("MOBJ_RD16", "[MOBJ] Read 16-bit from cycle ptr"),
            0x84: ("MOBJ_RD32", "[MOBJ] Read 32-bit from cycle ptr"),
            0x85: ("MOBJ_WR8", "[MOBJ] Write 8-bit to cycle ptr"),
            0x86: ("MOBJ_WR16", "[MOBJ] Write 16-bit to cycle ptr"),
            0x87: ("MOBJ_WR32", "[MOBJ] Write 32-bit to cycle ptr"),
            0x88: ("EQ", "Compare =="),
            0x89: ("NE", "Compare !="),
            0x8A: ("GE", "Compare >="),
            0x8B: ("GT", "Compare >"),
            0x8C: ("LE", "Compare <="),
            0x8D: ("LT", "Compare <"),
            0x8E: ("NOT", "Bitwise NOT (~)"),
            0x8F: ("AND_EQ", "Compound &="),
            0x90: ("OR_EQ", "Compound |="),
            0x91: ("XOR_EQ", "Compound ^="),
            0x92: ("ADD_EQ", "Compound +="),
            0x93: ("SUB_EQ", "Compound -="),
            0x94: ("MUL_EQ", "Compound *="),
            0x95: ("DIV_EQ", "Compound /="),
            0x96: ("MOD_EQ", "Compound %="),
            0x97: ("SHL_EQ", "Compound <<="),
            0x98: ("SHR_EQ", "Compound >>="),
            0x9D: ("F_CAST", "Cast to float"),
            0x9E: ("I_CAST", "Cast to signed int"),
            0x9F: ("F_LE", "Float <="),
            0xA0: ("F_LT", "Float <"),
            0xA1: ("F_GE", "Float >="),
            0xA2: ("F_GT", "Float >"),
            0xA3: ("F_ADD", "Float +"),
            0xA4: ("F_SUB", "Float -"),
            0xA5: ("F_MUL", "Float *"),
            0xA6: ("F_DIV", "Float /"),
        }
        
        if opcode in OPERATORS:
            mnemonic, comment = OPERATORS[opcode]
            op_type = OpcodeType.MOBJ if opcode >= 0x82 and opcode <= 0x87 else OpcodeType.OPERATOR
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic=mnemonic,
                size=1,
                type=op_type,
                comment=comment
            )
        
        return Instruction(
            offset=offset + self.base_offset,
            opcode=opcode,
            mnemonic=f"OP_{opcode:02X}",
            size=1,
            type=OpcodeType.OPERATOR,
            comment="Unknown operator"
        )
    
    def decode_instruction(self, offset: int) -> Optional[Instruction]:
        """Decode a single instruction at offset."""
        if offset >= len(self.data):
            return None
        
        opcode = self.read_u8(offset)
        
        if opcode >= 0xC0:
            return Instruction(
                offset=offset + self.base_offset,
                opcode=opcode,
                mnemonic="INVALID",
                size=1,
                type=OpcodeType.INVALID,
                comment=f"Invalid opcode 0x{opcode:02X}"
            )
        
        if opcode >= 0x80:
            return self.decode_0x80_0xBF(offset, opcode)
        elif opcode >= 0x40:
            return self.decode_0x40_0x7F(offset, opcode)
        else:
            return self.decode_0x00_0x3F(offset, opcode)
    
    def decode_range(self, start: int, length: int) -> List[Instruction]:
        """Decode all instructions in range."""
        self.instructions = []
        offset = start
        end = start + length
        
        while offset < end and offset < len(self.data):
            instr = self.decode_instruction(offset)
            if instr is None:
                break
            self.instructions.append(instr)
            offset += instr.size
        
        return self.instructions
    
    def print_disassembly(self, max_lines: int = -1):
        """Print formatted disassembly."""
        for i, instr in enumerate(self.instructions):
            if max_lines > 0 and i >= max_lines:
                print(f"... ({len(self.instructions) - i} more)")
                break
            # Check if this is a jump target
            rel_off = instr.offset - self.base_offset
            if rel_off in self.labels:
                print(f"\n{self.labels[rel_off]}:")
            print(f"  {instr}")
    
    def get_statistics(self) -> Dict:
        """Get decoding statistics."""
        type_counts = {}
        for instr in self.instructions:
            t = instr.type.value
            type_counts[t] = type_counts.get(t, 0) + 1
        
        return {
            'total_instructions': len(self.instructions),
            'float_pushes': len(self.float_pushes),
            'int_pushes': len(self.int_pushes),
            'mobj_operations': len(self.mobj_ops),
            'function_calls': len(self.function_calls),
            'type_counts': type_counts
        }


def analyze_mapinfo(filepath: str, verbose: bool = False):
    """Main analysis function."""
    
    print(f"=== SCN3 Bytecode Decoder v2 ===")
    print(f"Based on wulinshu.com documentation")
    print(f"File: {filepath}")
    
    with open(filepath, 'rb') as f:
        data = f.read()
    print(f"Size: {len(data):,} bytes")
    print()
    
    # Find SCN3
    idx = data.find(b'SCN3')
    if idx < 0:
        print("ERROR: SCN3 token not found")
        return
    
    scn3_size = struct.unpack('<I', data[idx+4:idx+8])[0]
    scn3_start = idx + 8
    print(f"SCN3: offset=0x{scn3_start:X}, size={scn3_size:,} bytes")
    
    # Decode bytecode
    decoder = SCN3BytecodeDecoder(data[scn3_start:], base_offset=scn3_start)
    decoder.decode_range(0, min(scn3_size - 8, 100000))  # Limit for safety
    
    stats = decoder.get_statistics()
    print(f"\nDecoded {stats['total_instructions']} instructions:")
    for t, c in stats['type_counts'].items():
        print(f"  {t}: {c}")
    print(f"\nFloat pushes: {stats['float_pushes']}")
    print(f"MOBJ operations: {stats['mobj_operations']}")
    print(f"Function calls: {stats['function_calls']}")
    
    if verbose:
        print("\n=== Disassembly (first 100) ===")
        decoder.print_disassembly(100)
    
    # Show float values - potential coordinates
    if decoder.float_pushes:
        print("\n=== Float Values Pushed ===")
        for i, (off, val) in enumerate(decoder.float_pushes[:30]):
            print(f"  0x{off:06X}: {val:.4f}")
        if len(decoder.float_pushes) > 30:
            print(f"  ... and {len(decoder.float_pushes) - 30} more")
    
    # Show MOBJ operations
    if decoder.mobj_ops:
        print("\n=== MOBJ Operations ===")
        for op in decoder.mobj_ops[:20]:
            print(f"  0x{op['offset']:06X}: type={op['type']} value={op['value']}")
        if len(decoder.mobj_ops) > 20:
            print(f"  ... and {len(decoder.mobj_ops) - 20} more")
    
    return decoder


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='SCN3 Bytecode Decoder v2')
    parser.add_argument('file', nargs='?',
                        default='extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN')
    parser.add_argument('-v', '--verbose', action='store_true',
                        help='Show disassembly')
    
    args = parser.parse_args()
    
    try:
        analyze_mapinfo(args.file, verbose=args.verbose)
    except FileNotFoundError:
        print(f"Error: File not found: {args.file}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
