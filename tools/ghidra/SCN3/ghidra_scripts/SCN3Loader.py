# -*- coding: utf-8 -*-
# SCN3 Loader Script for Ghidra (Python/Jython)
#
# This script loads a MAPINFO.BIN file, finds the SCN3 section,
# and maps its code and data sections into Ghidra's address space
# for analysis with the SCN3 SLEIGH processor.
#
# Usage (headless):
#   analyzeHeadless /path/to/project ProjectName \
#     -import MAPINFO.BIN -processor SCN3:LE:32:default \
#     -preScript SCN3Loader.py
#
# @category Shenmue
# @author new-yokosuka

import struct
import jarray
from ghidra.program.model.address import AddressSet
from ghidra.program.model.symbol import SourceType
from java.io import ByteArrayInputStream


def _to_java_bytes(data):
    """Convert a Python bytes/bytearray to a signed Java byte array.
    Handles both Jython 2.7 (indexing returns str) and Python 3 (returns int)."""
    jarr = jarray.zeros(len(data), 'b')
    for i in range(len(data)):
        b = data[i]
        val = ord(b) if isinstance(b, str) else b
        jarr[i] = val if val < 128 else val - 256
    return jarr


def find_scn3(data):
    """Find SCN3 token offset in raw file data."""
    magic = b'SCN3'
    idx = 0
    while idx <= len(data) - 8:
        if data[idx:idx+4] == magic:
            return idx
        idx += 1
    return -1


def read_u32(data, off):
    """Read little-endian uint32."""
    return struct.unpack_from('<I', data, off)[0]


def run():
    mem = currentProgram.getMemory()
    addr_factory = currentProgram.getAddressFactory()
    addr_space = addr_factory.getDefaultAddressSpace()

    # Read the entire imported binary using FileBytes API
    file_bytes_list = currentProgram.getMemory().getAllFileBytes()
    if not file_bytes_list:
        println("ERROR: No FileBytes found")
        return
    
    fb = file_bytes_list[0]
    size = fb.getSize()
    buf = jarray.zeros(size, 'b')
    fb.getOriginalBytes(0, buf)
    
    # Convert signed Java bytes to unsigned
    all_data = bytearray()
    for b in buf:
        all_data.append(b & 0xFF)

    data = bytes(all_data)
    println("Loaded %d bytes from FileBytes" % len(data))

    # Find SCN3 token
    scn3_token_off = find_scn3(data)
    if scn3_token_off < 0:
        println("ERROR: SCN3 token not found in file")
        return

    token_size = read_u32(data, scn3_token_off + 4)
    scn3_start = scn3_token_off + 8  # After 'SCN3' + size field

    # Parse SCN3 header (48 bytes)
    version     = read_u32(data, scn3_start + 0x00)
    code_offset = read_u32(data, scn3_start + 0x04)
    data_offset = read_u32(data, scn3_start + 0x08)
    total_size  = read_u32(data, scn3_start + 0x0C)
    code_size   = read_u32(data, scn3_start + 0x10)
    # If code_size is 0, assume it spans until the data_offset
    if code_size == 0 and data_offset > code_offset:
        code_size = data_offset - code_offset
    
    header_size = read_u32(data, scn3_start + 0x18)

    # The full code region spans from header_size to data_offset.
    # code_offset is the ENTRY POINT within that region, not the start of code.
    # code_size is just one function's size, not the total code size.
    full_code_start = header_size
    full_code_size = data_offset - header_size if data_offset > header_size else 0

    println("SCN3 found at file offset 0x%X" % scn3_token_off)
    println("  Version:      0x%X" % version)
    println("  Entry point:  0x%X (func size: 0x%X)" % (code_offset, code_size))
    println("  Data offset:  0x%X" % data_offset)
    println("  Total size:   0x%X" % total_size)
    println("  Header size:  0x%X" % header_size)
    println("  Full code:    0x%X - 0x%X (%d bytes)" %
            (full_code_start, full_code_start + full_code_size, full_code_size))

    # Remove existing blocks (the raw import) so we can remap properly
    for block in mem.getBlocks():
        mem.removeBlock(block, monitor)

    # Map SCN3 header
    if header_size > 0:
        header_data = data[scn3_start:scn3_start + header_size]
        header_addr = addr_space.getAddress(0)
        jarr = _to_java_bytes(header_data)
        stream = ByteArrayInputStream(jarr)
        block = mem.createInitializedBlock("SCN3_HEADER", header_addr, stream,
                                           len(header_data), monitor, False)
        block.setRead(True)
        block.setWrite(False)
        block.setExecute(False)
        println("  Mapped HEADER: 0x0 - 0x%X (%d bytes)" % (header_size, header_size))

    # Map full code section (header_size .. data_offset)
    if full_code_size > 0:
        code_file_off = scn3_start + full_code_start
        actual_code_size = min(full_code_size, len(data) - code_file_off)

        if actual_code_size > 0:
            code_data = data[code_file_off:code_file_off + actual_code_size]
            code_addr = addr_space.getAddress(full_code_start)
            jarr = _to_java_bytes(code_data)
            stream = ByteArrayInputStream(jarr)
            block = mem.createInitializedBlock("SCN3_CODE", code_addr, stream,
                                               len(code_data), monitor, False)
            block.setRead(True)
            block.setWrite(False)
            block.setExecute(True)
            println("  Mapped CODE: 0x%X - 0x%X (%d bytes)" %
                    (full_code_start, full_code_start + actual_code_size, actual_code_size))

            # Set entry point at code_offset (the main entry within the code region)
            entry_addr = addr_space.getAddress(code_offset)
            sym_table = currentProgram.getSymbolTable()
            sym_table.addExternalEntryPoint(entry_addr)
            println("  Set entry point at 0x%X" % code_offset)

            # ---- Function boundary discovery ----
            # SCN3 bytecode is one monolithic program, NOT a collection of
            # separate functions. Jumps (JMP/JMPX/JZ) are all intra-program
            # control flow (if/else/while/switch). Creating a function at
            # every jump target produces 22K+ tiny fragments -- wrong.
            #
            # Real function boundaries are:
            #   1. MOBJ_SEL instructions that follow an unconditional jump
            #      (new entity handler block after previous block ends)
            #   2. Code after end-sentinel CALL_SET7 ops (0xFFF8/0xFFFB/0xFFFF)
            #   3. The main entry point (already set above)
            code_bytes = data[code_file_off:code_file_off + actual_code_size]
            func_boundaries = set()

            def _byte(offset):
                b = code_bytes[offset]
                return ord(b) if isinstance(b, str) else b

            prev_was_uncond_jump = False
            prev_was_end_sentinel = False
            pc = 0
            while pc < actual_code_size:
                op = _byte(pc)
                cat = (op >> 6) & 3
                sz = (op >> 4) & 3
                cmd = op & 0xF
                addr = full_code_start + pc

                if cat == 1:
                    # Push immediate
                    operand_sizes = {0: 0, 1: 1, 2: 2, 3: 4}
                    prev_was_uncond_jump = False
                    prev_was_end_sentinel = False
                    pc += 1 + operand_sizes.get(sz, 0)
                    continue

                if cat == 2:
                    # Operator (single byte)
                    prev_was_uncond_jump = False
                    prev_was_end_sentinel = False
                    pc += 1
                    continue

                # cat 0 or 3: control flow
                if sz == 0:
                    # No-operand control opcode
                    prev_was_uncond_jump = False
                    prev_was_end_sentinel = False
                    pc += 1
                    continue

                operand_sizes = {1: 1, 2: 2, 3: 4}
                op_sz = operand_sizes.get(sz, 0)
                if pc + 1 + op_sz > actual_code_size:
                    break

                # Check if this is a MOBJ_SEL after an unconditional jump
                if cmd == 0x0 and (prev_was_uncond_jump or prev_was_end_sentinel):
                    func_boundaries.add(addr)

                # Check if this is a CALL_SET7 with end sentinel operand
                is_end_sentinel = False
                if cmd == 0xD:  # CALL_SET7
                    if op_sz == 1:
                        val = _byte(pc + 1)
                    elif op_sz == 2:
                        val = struct.unpack_from('<H', code_bytes, pc + 1)[0]
                    elif op_sz == 4:
                        val = struct.unpack_from('<I', code_bytes, pc + 1)[0]
                    else:
                        val = 0
                    if val in (0xFFF8, 0xFFFB, 0xFFFF, 0xFFFD, 0xFFFE):
                        is_end_sentinel = True

                # Track state for next iteration
                prev_was_uncond_jump = cmd in (0x4, 0x5)  # JMPX or JMP
                prev_was_end_sentinel = is_end_sentinel

                # If this was an end sentinel, the NEXT instruction is a boundary
                if is_end_sentinel:
                    next_addr = full_code_start + pc + 1 + op_sz
                    if next_addr < full_code_start + actual_code_size:
                        func_boundaries.add(next_addr)

                pc += 1 + op_sz

            # Don't duplicate the main entry point
            func_boundaries.discard(code_offset)

            func_count = 0
            for target in sorted(func_boundaries):
                target_addr = addr_space.getAddress(target)
                sym_table.addExternalEntryPoint(target_addr)
                func_count += 1

            println("  Found %d natural function boundaries (MOBJ_SEL-after-jump + end-sentinels)" % func_count)

    # Map data section
    if data_offset > 0 and data_offset < total_size:
        data_file_off = scn3_start + data_offset
        data_size = total_size - data_offset
        actual_data_size = min(data_size, len(data) - data_file_off)

        if actual_data_size > 0:
            data_section = data[data_file_off:data_file_off + actual_data_size]
            data_addr = addr_space.getAddress(data_offset)
            jarr = _to_java_bytes(data_section)
            stream = ByteArrayInputStream(jarr)
            block = mem.createInitializedBlock("SCN3_DATA", data_addr, stream,
                                               len(data_section), monitor, False)
            block.setRead(True)
            block.setWrite(True)
            block.setExecute(False)
            println("  Mapped DATA: 0x%X - 0x%X (%d bytes)" %
                    (data_offset, data_offset + actual_data_size, actual_data_size))

    println("SCN3 loading complete")


run()
