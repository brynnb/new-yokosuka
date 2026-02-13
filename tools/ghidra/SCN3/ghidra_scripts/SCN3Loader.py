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
