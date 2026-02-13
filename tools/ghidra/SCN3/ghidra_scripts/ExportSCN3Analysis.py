# SCN3 Analysis Export Script for Ghidra (Python/Jython)
#
# Exports decompiled pseudo-C, model references, slot IDs, float constants,
# and disassembly from an analyzed SCN3 binary to JSON.
#
# Usage (headless):
#   analyzeHeadless /path/to/project ProjectName \
#     -import MAPINFO.BIN -processor SCN3:LE:32:default \
#     -preScript SCN3Loader.py \
#     -postScript ExportSCN3Analysis.py /path/to/output.json
#
# @category Shenmue
# @author new-yokosuka

import json
import struct
import jarray
import re
from ghidra.app.decompiler import DecompInterface


def _byte_val(b):
    """Get integer value from a byte (handles Jython 2.7 str vs Python 3 int)."""
    return ord(b) if isinstance(b, str) else b


def get_output_path():
    """Get output path from script arguments or use default."""
    args = getScriptArgs()
    if args and len(args) > 0:
        return args[0]
    return "scn3_analysis.json"


def read_block_bytes(block):
    """Read all bytes from a memory block as a Python bytes object."""
    size = block.getSize()
    buf = jarray.zeros(size, 'b')
    block.getBytes(block.getStart(), buf)
    result = bytearray()
    for b in buf:
        result.append(b & 0xFF)
    return bytes(result)


def extract_strings(mem):
    """Extract all printable strings (length >= 4) from DATA blocks only."""
    results = []
    for block in mem.getBlocks():
        if not block.isInitialized():
            continue
        # Skip executable blocks (CODE) -- bytecode looks like garbage strings
        if block.isExecute():
            continue
        data = read_block_bytes(block)
        base = block.getStart().getOffset()

        start = -1
        for i in range(len(data)):
            bv = _byte_val(data[i])
            if 0x20 <= bv < 0x7F:
                if start < 0:
                    start = i
            elif bv == 0 and start >= 0:
                length = i - start
                if length >= 4:
                    # Build string from byte values
                    chars = [chr(_byte_val(data[j])) for j in range(start, i)]
                    s = ''.join(chars)
                    results.append("0x%X: %s" % (base + start, s))
                start = -1
            else:
                start = -1
    return results


def extract_model_refs(mem):
    """Find all $NAME.MT5 references."""
    results = []
    for block in mem.getBlocks():
        if not block.isInitialized():
            continue
        data = read_block_bytes(block)
        base = block.getStart().getOffset()

        i = 0
        while i < len(data) - 5:
            bv = _byte_val(data[i])
            if bv == 0x24:  # '$'
                end = i + 1
                while end < len(data) and 0x20 <= _byte_val(data[end]) < 0x7F:
                    end += 1
                chars = [chr(_byte_val(data[j])) for j in range(i, end)]
                s = ''.join(chars)
                if s.upper().endswith('.MT5'):
                    results.append({
                        "offset": "0x%X" % (base + i),
                        "name": s[1:]  # Remove $
                    })
                    i = end
                    continue
            i += 1
    return results


def extract_slot_refs(mem):
    """Find all slot references (R##_###, DR##_###)."""
    results = []
    for block in mem.getBlocks():
        if not block.isInitialized():
            continue
        data = read_block_bytes(block)
        base = block.getStart().getOffset()
        # Build text string safely for both Jython 2.7 and Python 3
        chars = []
        for i in range(len(data)):
            bv = _byte_val(data[i])
            chars.append(chr(bv) if 0x20 <= bv < 0x7F else '.')
        text = ''.join(chars)

        for m in re.finditer(r'DR?\d{2}_\d{3}', text):
            results.append({
                "offset": "0x%X" % (base + m.start()),
                "name": m.group(0)
            })
    return results


def _read_block_raw(block):
    """Read block bytes as a raw byte string suitable for struct.unpack.
    Returns a bytearray that struct can work with."""
    size = block.getSize()
    buf = jarray.zeros(size, 'b')
    block.getBytes(block.getStart(), buf)
    result = bytearray()
    for b in buf:
        result.append(b & 0xFF)
    return bytes(result)


def extract_floats(mem):
    """Extract float values from DATA section that look like coordinates."""
    results = []
    for block in mem.getBlocks():
        if "DATA" not in block.getName():
            continue
        if not block.isInitialized():
            continue
        data = _read_block_raw(block)
        base = block.getStart().getOffset()

        for i in range(0, len(data) - 3, 4):
            f = struct.unpack_from('<f', data, i)[0]
            if f != f:  # NaN check
                continue
            if abs(f) > 0.001 and abs(f) < 10000:
                results.append({
                    "offset": "0x%X" % (base + i),
                    "value": "%.4f" % f
                })
    return results


def extract_transform_groups(mem):
    """
    Extract groups of 6 consecutive floats (scale XYZ + position XYZ)
    from the DATA section that look like object transforms.
    Stride by 24 bytes (one full transform) to avoid sliding window artifacts.
    """
    results = []
    for block in mem.getBlocks():
        if "DATA" not in block.getName():
            continue
        if not block.isInitialized():
            continue
        data = _read_block_raw(block)
        base = block.getStart().getOffset()

        i = 0
        while i <= len(data) - 24:
            floats = struct.unpack_from('<6f', data, i)
            sx, sy, sz, px, py, pz = floats

            # Check for NaN/Inf
            no_nan = all(v == v and abs(v) < 1e30 for v in floats)
            if not no_nan:
                i += 24
                continue

            # Validate scale (should be near 1.0 for most objects)
            scales_ok = all(0.01 < abs(v) < 100 for v in [sx, sy, sz])
            # Validate position (reasonable range for Shenmue coordinates)
            pos_ok = all(abs(v) < 500 for v in [px, py, pz])
            # Skip trivial all-zero or all-one blocks
            nontrivial = not all(abs(v) < 0.001 for v in floats)

            if scales_ok and pos_ok and nontrivial:
                results.append({
                    "offset": "0x%X" % (base + i),
                    "scale": [round(sx, 4), round(sy, 4), round(sz, 4)],
                    "position": [round(px, 4), round(py, 4), round(pz, 4)]
                })
                i += 24  # Skip past this transform
            else:
                i += 4   # Not a valid transform, try next alignment
    return results


def ensure_disassembly():
    """Ensure the CODE block is disassembled and has functions.
    Ghidra's auto-analysis may miss it if blocks were remapped by the pre-script."""
    from ghidra.app.cmd.disassemble import DisassembleCommand
    from ghidra.program.model.address import AddressSet
    from ghidra.program.model.symbol import SourceType
    from ghidra.app.cmd.function import CreateFunctionCmd

    mem = currentProgram.getMemory()
    listing = currentProgram.getListing()
    func_mgr = currentProgram.getFunctionManager()
    sym_table = currentProgram.getSymbolTable()

    for block in mem.getBlocks():
        if not block.isExecute():
            continue

        start = block.getStart()
        end = block.getEnd()
        println("  CODE block: %s - %s (%d bytes)" % (start, end, block.getSize()))

        # Disassemble the entire code block if not already done
        existing = listing.getInstructions(start, True)
        if existing.hasNext():
            println("  Already has instructions")
        else:
            addr_set = AddressSet(start, end)
            cmd = DisassembleCommand(addr_set, addr_set, True)
            cmd.applyTo(currentProgram, monitor)
            # Count how many instructions we got
            count = 0
            it = listing.getInstructions(start, True)
            while it.hasNext():
                it.next()
                count += 1
            println("  Disassembled: %d instructions" % count)

        # Create function at each external entry point that falls within this block
        entry_iter = sym_table.getExternalEntryPointIterator()
        while entry_iter.hasNext():
            entry_addr = entry_iter.next()
            if not block.contains(entry_addr):
                continue
            func = func_mgr.getFunctionAt(entry_addr)
            if func is None:
                try:
                    func = func_mgr.createFunction(
                        "scn3_entry", entry_addr,
                        AddressSet(entry_addr, entry_addr),
                        SourceType.IMPORTED)
                    println("  Created function at %s" % entry_addr)
                except Exception as e:
                    println("  Warning creating function at %s: %s" % (entry_addr, str(e)))
            else:
                println("  Function already exists at %s: %s" % (entry_addr, func.getName()))


def decompile_functions():
    """Decompile all functions using Ghidra's decompiler."""
    results = []
    decomp = DecompInterface()
    decomp.openProgram(currentProgram)

    func_mgr = currentProgram.getFunctionManager()
    # Count functions first
    count = func_mgr.getFunctionCount()
    println("  Function manager reports %d functions" % count)

    func_iter = func_mgr.getFunctions(True)
    while func_iter.hasNext():
        func = func_iter.next()
        addr = func.getEntryPoint()
        # Skip external stub functions (CALL_SET targets)
        if addr.getOffset() >= 0xFFFF0000:
            continue
        println("  Decompiling %s at %s" % (func.getName(), addr))
        try:
            res = decomp.decompileFunction(func, 60, monitor)
            decomp_func = res.getDecompiledFunction()
            code = decomp_func.getC() if decomp_func else "// decompilation failed"
        except Exception as e:
            code = "// error: %s" % str(e)

        results.append({
            "name": func.getName(),
            "address": str(func.getEntryPoint()),
            "code": code
        })

    decomp.dispose()
    return results


def get_disassembly(max_lines=10000):
    """Get disassembly listing starting from the entry point."""
    results = []
    listing = currentProgram.getListing()
    sym_table = currentProgram.getSymbolTable()

    # Find the entry point to start disassembly from
    start_addr = None
    entry_iter = sym_table.getExternalEntryPointIterator()
    while entry_iter.hasNext():
        addr = entry_iter.next()
        # Pick the entry point inside the code block (not stubs)
        if addr.getOffset() < 0xFFFF0000:
            start_addr = addr
            break

    if start_addr is None:
        # Fall back to first instruction
        instr_iter = listing.getInstructions(True)
    else:
        instr_iter = listing.getInstructions(start_addr, True)

    count = 0
    while instr_iter.hasNext() and count < max_lines:
        instr = instr_iter.next()
        mnemonic = instr.getMnemonicString()
        num_ops = instr.getNumOperands()
        ops = []
        for i in range(num_ops):
            rep = instr.getDefaultOperandRepresentation(i)
            if rep:
                ops.append(rep)
        op_str = ", ".join(ops)

        results.append("0x%s: %s %s" % (instr.getAddress(), mnemonic, op_str))
        count += 1

    return results


def run():
    output_path = get_output_path()
    println("=== SCN3 Analysis Export ===")
    println("Output: %s" % output_path)

    mem = currentProgram.getMemory()

    # Ensure code is disassembled (may have been missed by auto-analysis)
    println("Ensuring disassembly...")
    ensure_disassembly()

    # Extract all data
    println("Extracting strings...")
    strings = extract_strings(mem)
    println("  Found %d strings" % len(strings))

    println("Extracting model references...")
    models = extract_model_refs(mem)
    println("  Found %d models" % len(models))

    println("Extracting slot references...")
    slots = extract_slot_refs(mem)
    println("  Found %d slots" % len(slots))

    println("Extracting float constants...")
    floats = extract_floats(mem)
    println("  Found %d floats" % len(floats))

    println("Extracting transform groups...")
    transforms = extract_transform_groups(mem)
    println("  Found %d transforms" % len(transforms))

    println("Decompiling functions...")
    functions = decompile_functions()
    println("  Decompiled %d functions" % len(functions))

    println("Getting disassembly...")
    disasm = get_disassembly()
    println("  Got %d instructions" % len(disasm))

    # Build output
    output = {
        "strings": strings,
        "models": models,
        "slots": slots,
        "floats": floats,
        "transforms": transforms,
        "functions": functions,
        "disassembly": disasm
    }

    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    println("")
    println("=== Export Complete ===")
    println("  Models:     %d" % len(models))
    println("  Slots:      %d" % len(slots))
    println("  Floats:     %d" % len(floats))
    println("  Transforms: %d" % len(transforms))
    println("  Functions:  %d" % len(functions))
    println("  Disasm:     %d instructions" % len(disasm))
    println("  Saved to:   %s" % output_path)


run()
