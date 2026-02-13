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


def extract_placement_structures(mem):
    """
    Extract the 5 interlinked DATA section structures that define object
    placement in the scene.  Each structure is found by pattern, not by
    hardcoded offset, so this works across scenes.

    Structures:
      1. model_table     - dense block of $NAME.MT5 strings (14-byte stride)
      2. record_table    - 56-byte records preceding the model table; each
                           record has a model index at +24 and child XYZ
                           offset floats at +28/+32/+36
      3. room_transforms - contiguous 0x24-byte records with [id, flags,
                           scale_xyz, position_xyz, extra]
      4. permutation     - array of [uint32 slot, uint32 0xFFFFFFFF] pairs
                           that reorder room transforms into slot indices
      5. entity_records  - 32-byte records with [4-char ID, 4B, 4 floats,
                           uint32 proxy_index, uint16 room_slot, uint16 unk]
      6. entity_blocks   - groups of 4-char entity IDs separated by
                           0xFFFFFFFF sentinels, with 0xXXXX05A9 room refs
    """
    result = {
        "model_table": [],
        "record_table": [],
        "room_transforms": [],
        "permutation": [],
        "entity_records": [],
        "entity_blocks": [],
    }

    for block in mem.getBlocks():
        if "DATA" not in block.getName():
            continue
        if not block.isInitialized():
            continue
        data = _read_block_raw(block)
        base = block.getStart().getOffset()
        dlen = len(data)

        # ---- 1. Model table: dense $NAME.MT5 strings ----
        # Find all '$' + 8-char name + '.MT5' patterns
        mt5_offsets = []
        i = 0
        while i < dlen - 13:
            if _byte_val(data[i]) == 0x24:  # '$'
                ok = True
                for j in range(1, 9):
                    bv = _byte_val(data[i + j])
                    if not (0x20 <= bv < 0x7F):
                        ok = False
                        break
                if ok:
                    tag = bytes(data[i+9:i+13])
                    if tag.upper() == b'.MT5':
                        name_bytes = data[i+1:i+9]
                        name = ''.join(chr(_byte_val(b)) for b in name_bytes).rstrip('\x00').rstrip()
                        mt5_offsets.append((base + i, name))
                        i += 13
                        continue
            i += 1

        # A "dense" model table has many MT5 names within ~14 bytes of each other
        if len(mt5_offsets) >= 3:
            clusters = []
            cur = [mt5_offsets[0]]
            for k in range(1, len(mt5_offsets)):
                gap = mt5_offsets[k][0] - mt5_offsets[k-1][0]
                if gap <= 20:
                    cur.append(mt5_offsets[k])
                else:
                    if len(cur) >= 3:
                        clusters.append(cur)
                    cur = [mt5_offsets[k]]
            if len(cur) >= 3:
                clusters.append(cur)

            # Use the largest cluster as the model table
            if clusters:
                best = max(clusters, key=len)
                for off, name in best:
                    result["model_table"].append({
                        "offset": "0x%X" % off,
                        "name": name,
                    })

        model_table = result["model_table"]
        num_models = len(model_table)
        if num_models == 0:
            continue

        model_table_start = int(model_table[0]["offset"], 16)

        # ---- 2. Record table: 56-byte records before the model table ----
        # Each record has model_index (uint32) at +24 that should be 0..num_models-1
        # and ends with 0xFFFFFFFF at +40
        RECSZ = 56
        # Search backwards from model table for the start of the record table
        search_start = model_table_start - base - (num_models * RECSZ) - 0x200
        if search_start < 0:
            search_start = 0

        rec_table_start = None
        for probe in range(search_start, model_table_start - base - RECSZ + 1, 4):
            # Check if this could be the first record
            if probe + num_models * RECSZ > dlen:
                break
            valid = True
            for ri in range(num_models):
                roff = probe + ri * RECSZ
                if roff + RECSZ > dlen:
                    valid = False
                    break
                midx = struct.unpack_from('<I', data, roff + 24)[0]
                sentinel = struct.unpack_from('<I', data, roff + 52)[0]
                if midx >= num_models or sentinel != 0xFFFFFFFF:
                    valid = False
                    break
            if valid:
                # Verify model indices cover a reasonable range
                indices = set()
                for ri in range(num_models):
                    roff = probe + ri * RECSZ
                    indices.add(struct.unpack_from('<I', data, roff + 24)[0])
                if len(indices) >= min(num_models, 3):
                    rec_table_start = probe
                    break

        if rec_table_start is not None:
            model_names = [m["name"] for m in model_table]
            for ri in range(num_models):
                roff = rec_table_start + ri * RECSZ
                midx = struct.unpack_from('<I', data, roff + 24)[0]
                cx, cy, cz = struct.unpack_from('<fff', data, roff + 28)
                result["record_table"].append({
                    "offset": "0x%X" % (base + roff),
                    "index": ri,
                    "model_index": midx,
                    "model_name": model_names[midx] if midx < len(model_names) else "?",
                    "child_offset": [round(cx, 4), round(cy, 4), round(cz, 4)],
                })

        # ---- 3. Room transforms: 0x24-byte records with scale~1.0 + position ----
        # Pattern: [uint32 id][uint32 flags][float sx~1][float sy~1][float sz~1]
        #          [float px][float py][float pz][uint32 extra]
        RT_SIZE = 0x24
        rt_candidates = []
        for probe in range(0, dlen - RT_SIZE, 4):
            sx = struct.unpack_from('<f', data, probe + 8)[0]
            sy = struct.unpack_from('<f', data, probe + 12)[0]
            sz = struct.unpack_from('<f', data, probe + 16)[0]
            if not (0.9 < sx < 1.1 and 0.9 < sy < 1.1 and 0.9 < sz < 1.1):
                continue
            px = struct.unpack_from('<f', data, probe + 20)[0]
            py = struct.unpack_from('<f', data, probe + 24)[0]
            pz = struct.unpack_from('<f', data, probe + 28)[0]
            if not all(v == v and abs(v) < 100 for v in [px, py, pz]):
                continue
            rt_candidates.append(probe)

        # Find runs of consecutive candidates at RT_SIZE stride
        rt_candidate_set = set(rt_candidates)
        if rt_candidates:
            runs = []
            cur_run = [rt_candidates[0]]
            for k in range(1, len(rt_candidates)):
                if rt_candidates[k] - rt_candidates[k-1] == RT_SIZE:
                    cur_run.append(rt_candidates[k])
                else:
                    if len(cur_run) >= 3:
                        runs.append(cur_run)
                    cur_run = [rt_candidates[k]]
            if len(cur_run) >= 3:
                runs.append(cur_run)

            if runs:
                best_run = max(runs, key=len)
                # Extend the run forward/backward at RT_SIZE stride
                while True:
                    nxt = best_run[-1] + RT_SIZE
                    if nxt in rt_candidate_set:
                        best_run.append(nxt)
                    else:
                        break
                while True:
                    prv = best_run[0] - RT_SIZE
                    if prv >= 0 and prv in rt_candidate_set:
                        best_run.insert(0, prv)
                    else:
                        break
                for probe in best_run:
                    rid = struct.unpack_from('<I', data, probe)[0]
                    flags = struct.unpack_from('<I', data, probe + 4)[0]
                    sx, sy, sz = struct.unpack_from('<fff', data, probe + 8)
                    px, py, pz = struct.unpack_from('<fff', data, probe + 20)
                    extra = struct.unpack_from('<I', data, probe + 32)[0]
                    result["room_transforms"].append({
                        "offset": "0x%X" % (base + probe),
                        "id": rid,
                        "flags": flags,
                        "scale": [round(sx, 4), round(sy, 4), round(sz, 4)],
                        "position": [round(px, 4), round(py, 4), round(pz, 4)],
                    })

        num_rt = len(result["room_transforms"])

        # ---- 4. Permutation table: [uint32 val, uint32 0xFFFFFFFF] x N ----
        # where val is in range [0, num_rt-1] and N == num_rt
        if num_rt >= 3:
            rt_block_start = int(result["room_transforms"][0]["offset"], 16) - base
            # Search backwards from room transforms
            for probe in range(max(0, rt_block_start - 0x200), rt_block_start - 8, 4):
                # Check if this starts a permutation of length num_rt
                ok = True
                vals = []
                for pi in range(num_rt):
                    poff = probe + pi * 8
                    if poff + 8 > dlen:
                        ok = False
                        break
                    v = struct.unpack_from('<I', data, poff)[0]
                    s = struct.unpack_from('<I', data, poff + 4)[0]
                    if s != 0xFFFFFFFF or v >= num_rt:
                        ok = False
                        break
                    vals.append(v)
                if ok and len(set(vals)) == num_rt:
                    for pi in range(num_rt):
                        poff = probe + pi * 8
                        v = struct.unpack_from('<I', data, poff)[0]
                        result["permutation"].append({
                            "slot": pi,
                            "rt_index": v,
                        })
                    break

        # ---- 5 & 6. Entity records and entity blocks ----
        # Entity records: 32-byte records starting with 4 ASCII chars,
        # with proxy_index (uint32) at +24 and room_slot (uint16) at +28
        # Entity blocks: groups separated by 0xFFFFFFFF with 0xXXXX05A9 refs

        # Find entity records: scan for 32-byte aligned records where
        # bytes 0-3 are ASCII and u24 is a valid proxy index
        if rec_table_start is not None and num_rt > 0:
            # Entity records are typically between the room transforms and
            # the record table in the DATA section
            rt_end = 0
            if result["room_transforms"]:
                rt_last = int(result["room_transforms"][-1]["offset"], 16) - base
                rt_end = rt_last + RT_SIZE

            rec_tbl_abs = rec_table_start
            # Scan the region before the record table for entity records
            # They can be spread over a wide area
            er_search_start = max(0, rt_end)
            # Align to absolute 0x20 boundary
            if er_search_start % 0x20 != 0:
                er_search_start = er_search_start + (0x20 - er_search_start % 0x20)
            er_search_end = rec_tbl_abs

            for probe in range(er_search_start, er_search_end - 32 + 1, 0x20):
                chunk = data[probe:probe+4]
                if not all(0x20 <= _byte_val(b) < 0x7F for b in chunk):
                    continue
                eid = ''.join(chr(_byte_val(b)) for b in chunk)
                u24 = struct.unpack_from('<I', data, probe + 24)[0]
                u28 = struct.unpack_from('<H', data, probe + 28)[0]
                u30 = struct.unpack_from('<H', data, probe + 30)[0]
                f8, f12, f16, f20 = struct.unpack_from('<ffff', data, probe + 8)

                # Validate: all floats must be finite
                floats_ok = all(v == v and abs(v) < 1e10 for v in [f8, f12, f16, f20])
                if not floats_ok:
                    continue

                entry = {
                    "offset": "0x%X" % (base + probe),
                    "entity_id": eid,
                    "interaction_offset": [round(f8, 4), round(f12, 4), round(f16, 4), round(f20, 4)],
                    "proxy_index": u24 if u24 < num_models else None,
                    "room_slot": u28 if u28 < num_rt else None,
                    "u30": u30,
                }
                if u24 < num_models and u24 > 0:
                    model_names_list = [m["name"] for m in model_table]
                    entry["proxy_model"] = model_names_list[u24] if u24 < len(model_names_list) else None
                result["entity_records"].append(entry)

            # Entity blocks: scan for 0xFFFFFFFF-delimited groups with
            # 0xXXXX05A9 room slot refs and 4-char entity IDs
            eb_search_start = er_search_end
            eb_search_end = min(dlen, er_search_end + 0x400)
            current_block = None

            for probe in range(eb_search_start, eb_search_end - 4 + 1, 4):
                val = struct.unpack_from('<I', data, probe)[0]

                if val == 0xFFFFFFFF:
                    if current_block and (current_block["entity_ids"] or current_block["room_refs"]):
                        result["entity_blocks"].append(current_block)
                    current_block = {
                        "offset": "0x%X" % (base + probe),
                        "room_refs": [],
                        "entity_ids": [],
                    }
                    continue

                if current_block is None:
                    continue

                # Check for 0xXXXX05A9 room slot reference
                if val & 0xFFFF == 0x05A9:
                    ref = (val >> 16) & 0xFFFF
                    current_block["room_refs"].append(ref)
                    continue

                # Check for 4-char ASCII entity ID
                chunk = data[probe:probe+4]
                if all(0x20 <= _byte_val(b) < 0x7F for b in chunk):
                    eid = ''.join(chr(_byte_val(b)) for b in chunk)
                    current_block["entity_ids"].append(eid)

            if current_block and (current_block["entity_ids"] or current_block["room_refs"]):
                result["entity_blocks"].append(current_block)

    return result


def ensure_disassembly():
    """Ensure the CODE block is fully disassembled with function discovery.
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

        # Always disassemble the entire code block
        addr_set = AddressSet(start, end)
        cmd = DisassembleCommand(addr_set, addr_set, True)
        cmd.applyTo(currentProgram, monitor)
        count = 0
        it = listing.getInstructions(start, True)
        while it.hasNext():
            it.next()
            count += 1
        println("  Disassembled: %d instructions" % count)

        # Create functions at all external entry points (jump targets from loader)
        # This is critical: Ghidra's decompiler recovers if/else/while PER FUNCTION.
        # Without function boundaries, the decompiler sees one giant blob.
        entry_addrs = []
        entry_iter = sym_table.getExternalEntryPointIterator()
        while entry_iter.hasNext():
            entry_addr = entry_iter.next()
            if block.contains(entry_addr):
                entry_addrs.append(entry_addr)

        func_created = 0
        func_existed = 0
        func_failed = 0
        for entry_addr in entry_addrs:
            func = func_mgr.getFunctionAt(entry_addr)
            if func is not None:
                func_existed += 1
                continue
            fname = "scn3_%s" % entry_addr
            try:
                func = func_mgr.createFunction(
                    fname, entry_addr,
                    AddressSet(entry_addr, entry_addr),
                    SourceType.IMPORTED)
                func_created += 1
            except:
                func_failed += 1  # Overlapping function body - skip
        println("  Functions: %d created, %d existed, %d skipped (overlap)" %
                (func_created, func_existed, func_failed))


def rename_functions_semantically():
    """Rename functions based on CALL_SET operations and data references.
    Scans each function's instructions for CALL_SET verbs and string/model refs,
    then renames the function to reflect its purpose."""
    from ghidra.program.model.symbol import SourceType

    # Verb dictionaries (subset of most distinctive verbs from scn3_to_python.py)
    SET7_VERBS = {
        "0x0385": "debug_print", "0x1df2": "task_yield",
        "0x2d46": "set_anim", "0x2d56": "entity_setup", "0x2d66": "set_attrs",
        "0x2d76": "set_state", "0x4d22": "trigger_callback",
        "0x8ae5": "load_resource", "0x8ad5": "load_model",
        "0xd109": "set_waypoint", "0xd10f": "set_path",
        "0xd408": "get_pos_x", "0xd409": "get_pos_y", "0xd40a": "get_pos_z",
        "0xd410": "set_pos_xyz", "0xd419": "snap_ground",
        "0xd504": "get_rot_x", "0xd505": "get_rot_y", "0xd507": "get_heading",
        "0xd50a": "set_facing", "0xd50d": "look_at",
        "0xe400": "entity_init", "0xe402": "entity_init_type",
        "0xe404": "entity_init_model", "0xe464": "entity_init_camera",
        "0xe500": "entity_activate", "0xe509": "set_active",
        "0xe519": "entity_enable", "0xe51b": "entity_disable",
        "0xe51d": "set_lod", "0xe529": "set_physics",
        "0xe54f": "set_parent", "0xe559": "set_trigger",
        "0xe55e": "set_property", "0xe56d": "set_state_machine",
        "0xe575": "set_script", "0xe700": "hierarchy_detach",
        "0xecd4": "set_cutscene_cam", "0xece0": "play_cutscene",
        "0xece4": "load_cutscene",
        "0xfff8": "end_block", "0xfffb": "end_function",
        "0xffff": "end_program",
        "0xd1": "move", "0xd4": "position", "0xd5": "rotation",
        "0xd6": "scale", "0xe4": "init_entity", "0xe5": "config_entity",
        "0xf2": "wait_frames", "0xf9": "scene_transition",
    }
    SET6_VERBS = {
        "0x0": "camera", "0x1": "camera_cut", "0x2": "camera_lerp",
        "0x3": "camera_follow", "0x7d": "scene_trigger",
        "0xe4": "scnf_init_entity", "0xe5": "scnf_activate",
        "0xece4": "scnf_load_cutscene", "0x67e6": "set_lighting",
        "0x8ae5": "scnf_load_resource",
    }
    SET4_VERBS = {
        "0x35": "ext_load_model", "0x36": "ext_place_model",
        "0x7d": "ext_trigger", "0xe4": "ext_init_entity",
        "0x434": "ext_set_property", "0x834": "ext_set_property8",
        "0x1000000": "ext_scene_load", "0xece4": "ext_load_cutscene",
    }
    SET3_VERBS = {
        "0x0": "sm_get_state", "0x1": "sm_set_flag", "0x2": "sm_get_flag",
        "0xd5": "sm_rotation", "0xe4": "sm_init_entity",
        "0x8ae5": "sm_load_resource", "0xece4": "sm_load_cutscene",
    }

    func_mgr = currentProgram.getFunctionManager()
    listing = currentProgram.getListing()
    renamed = 0
    total = 0

    func_iter = func_mgr.getFunctions(True)
    while func_iter.hasNext():
        func = func_iter.next()
        addr = func.getEntryPoint()
        if addr.getOffset() >= 0xFFFF0000:
            continue
        total += 1

        # Scan instructions in this function's body
        body = func.getBody()
        instr_iter = listing.getInstructions(body, True)
        verbs = []
        models = []
        push_val = None  # Track last pushed value for CALL_SET operand

        while instr_iter.hasNext():
            instr = instr_iter.next()
            mn = instr.getMnemonicString()

            # Track pushed immediates (the operand to the next CALL_SET)
            if mn.startswith("PUSH_"):
                try:
                    rep = instr.getDefaultOperandRepresentation(0)
                    if rep:
                        push_val = rep
                except:
                    pass
                continue

            # CALL_SET with operand
            if mn.startswith("CALL_SET"):
                try:
                    rep = instr.getDefaultOperandRepresentation(0)
                    if rep:
                        operand = rep.lower()
                        if not operand.startswith("0x"):
                            operand = "0x" + operand
                        verb_dict = None
                        if "SET7" in mn:
                            verb_dict = SET7_VERBS
                        elif "SET6" in mn:
                            verb_dict = SET6_VERBS
                        elif "SET4" in mn:
                            verb_dict = SET4_VERBS
                        elif "SET3" in mn:
                            verb_dict = SET3_VERBS
                        if verb_dict and operand in verb_dict:
                            verbs.append(verb_dict[operand])
                except:
                    pass
                push_val = None
                continue

            push_val = None

        if not verbs:
            continue

        # Build name from most distinctive verb
        # Priority: cutscene > camera > entity_init > entity ops > movement > generic
        priority_order = [
            "play_cutscene", "load_cutscene", "scene_transition",
            "camera", "camera_cut", "camera_lerp", "camera_follow",
            "set_cutscene_cam", "set_lighting",
            "entity_init", "entity_init_type", "entity_init_model",
            "entity_init_camera", "entity_activate",
            "load_model", "load_resource", "ext_load_model",
            "entity_setup", "set_anim", "set_attrs",
            "set_facing", "look_at", "get_heading", "rotation",
            "set_pos_xyz", "position", "snap_ground",
            "set_trigger", "trigger_callback", "scene_trigger",
            "set_property", "set_state_machine", "set_script",
            "entity_enable", "entity_disable", "set_active",
            "move", "set_waypoint", "task_yield", "wait_frames",
            "debug_print", "end_block", "end_function",
        ]

        best_verb = None
        for pv in priority_order:
            if pv in verbs:
                best_verb = pv
                break
        if not best_verb:
            best_verb = verbs[0]

        # Count how many unique verb types (Jython 2.7 compatible dedupe)
        seen = set()
        unique_verbs = []
        for v in verbs:
            if v not in seen:
                seen.add(v)
                unique_verbs.append(v)
        suffix = ""
        if len(unique_verbs) > 1:
            # Add second verb for context
            others = [v for v in unique_verbs if v != best_verb]
            if others:
                suffix = "_" + others[0]

        new_name = "scn3_%s%s_%s" % (best_verb, suffix, addr)
        try:
            func.setName(new_name, SourceType.ANALYSIS)
            renamed += 1
        except:
            pass  # Name collision - keep original

    println("  Semantic rename: %d/%d functions renamed" % (renamed, total))


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


def get_disassembly():
    """Get FULL disassembly listing from the start of the code section."""
    results = []
    listing = currentProgram.getListing()
    mem = currentProgram.getMemory()

    # Find the code block and start from its beginning
    start_addr = None
    for block in mem.getBlocks():
        if block.isExecute():
            start_addr = block.getStart()
            break

    if start_addr is None:
        return results

    instr_iter = listing.getInstructions(start_addr, True)
    while instr_iter.hasNext():
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

    return results


def extract_bytecode_placements():
    """Walk ALL disassembled instructions tracking MOBJ_SEL -> PUSH -> CALL_SET7
    sequences.  Uses Ghidra's instruction API for correct operand decoding.

    Returns a list of dicts, each recording:
      - mobj: the MOBJ_SEL index (model object being targeted)
      - op: the SET7 verb name (e.g. 'set_position')
      - opcode: the raw SET7 opcode (e.g. 0xd44a)
      - args: list of stack values that were pushed before the call
      - addr: address of the CALL_SET7 instruction
    """
    listing = currentProgram.getListing()
    mem = currentProgram.getMemory()

    # Find code block start
    code_start = None
    for block in mem.getBlocks():
        if block.isExecute():
            code_start = block.getStart()
            break
    if code_start is None:
        return []

    # SET7 opcodes we care about
    TRACKED_OPS = {
        0xd44a: "set_position",
        0xd448: "set_position_ex",
        0xd44c: "set_position_local",
        0xd460: "set_position_offset",
        0xd466: "set_position_snap",
        0xd54a: "set_rotation",
        0xd50a: "set_facing",
        0xd50c: "set_heading",
        0xd64a: "set_scale",
        0xd63e: "set_scale_uniform",
        0x2d56: "entity_setup",
        0xe400: "entity_init",
        0xe404: "entity_init_model",
    }

    results = []
    current_mobj = None
    stack = []  # Track pushed immediate values

    instr_iter = listing.getInstructions(code_start, True)
    while instr_iter.hasNext():
        instr = instr_iter.next()
        mnem = instr.getMnemonicString()
        addr = instr.getAddress()

        if mnem == 'MOBJ_SEL':
            # Operand is the model object index
            try:
                current_mobj = instr.getScalar(0).getUnsignedValue()
            except:
                try:
                    rep = instr.getDefaultOperandRepresentation(0)
                    current_mobj = int(rep, 0)
                except:
                    current_mobj = None
            stack = []

        elif mnem in ('PUSH_I32', 'PUSH_I16', 'PUSH_I8', 'PUSH_LAST'):
            # Push an immediate value onto our tracked stack
            try:
                val = instr.getScalar(0).getUnsignedValue()
            except:
                try:
                    rep = instr.getDefaultOperandRepresentation(0)
                    val = int(rep, 0)
                except:
                    val = None
            if val is not None:
                stack.append(val)
            else:
                stack.append(None)

        elif mnem == 'CALL_SET7':
            # Get the function ID
            try:
                func_id = instr.getScalar(0).getUnsignedValue()
            except:
                try:
                    rep = instr.getDefaultOperandRepresentation(0)
                    func_id = int(rep, 0)
                except:
                    func_id = None

            if func_id is not None and func_id in TRACKED_OPS and current_mobj is not None:
                op_name = TRACKED_OPS[func_id]
                results.append({
                    "mobj": current_mobj,
                    "op": op_name,
                    "opcode": func_id,
                    "args": list(stack),  # All values pushed since last stack-clearing event
                    "addr": "0x%X" % addr.getOffset(),
                })
            # CALL_SET7 consumes stack args
            stack = []

        elif mnem in ('CALL_SET6', 'CALL_SET1', 'CALL_SET2', 'CALL_SET3', 'CALL_SET4'):
            stack = []

        elif mnem == 'SP_ADD':
            # Stack cleanup - pop values
            try:
                val = instr.getScalar(0).getUnsignedValue()
                count = val // 4
                for _ in range(min(count, len(stack))):
                    if stack:
                        stack.pop()
            except:
                stack = []

        elif mnem == 'STK_TO_R14':
            if stack:
                stack.pop()

        elif mnem == 'R14_TO_STK':
            stack.append(None)  # Unknown value from R14

        elif mnem in ('MOBJ_RD8', 'MOBJ_RD16', 'MOBJ_RD32'):
            stack.append(None)  # Unknown value from MOBJ memory

        elif mnem in ('MOBJ_WR8', 'MOBJ_WR16', 'MOBJ_WR32'):
            if stack:
                stack.pop()

        elif mnem in ('EQ', 'NE', 'GE', 'GT', 'LE', 'LT',
                       'F_LE', 'F_LT', 'F_GE', 'F_GT',
                       'F_ADD', 'F_SUB', 'F_MUL', 'F_DIV',
                       'AND_EQ', 'OR_EQ', 'XOR_EQ',
                       'ADD_EQ', 'SUB_EQ', 'MUL_EQ', 'DIV_EQ',
                       'MOD_EQ', 'SHL_EQ', 'SHR_EQ',
                       'OP_ADD', 'OP_SUB', 'OP_MUL', 'OP_DIV', 'OP_MOD',
                       'OP_AND', 'OP_OR', 'OP_XOR', 'OP_SHL', 'OP_SHR',
                       'OP_LAND', 'OP_LOR'):
            # Binary ops: pop 2, push 1
            if len(stack) >= 2:
                stack.pop()
                stack.pop()
            else:
                stack = []
            stack.append(None)

        elif mnem in ('NOT', 'F_CAST', 'I_CAST', 'OP_NEG', 'OP_LNOT'):
            # Unary ops: pop 1, push 1
            if stack:
                stack.pop()
            stack.append(None)

        elif mnem in ('JMP', 'JMPX'):
            stack = []

        elif mnem == 'JZ':
            pass

        elif mnem in ('MOV_REG', 'COMMIT', 'CLEANUP', 'CALL_SETUP',
                       'ARG_SEP', 'FRAME_SETUP', 'NOP'):
            pass  # No stack effect

        elif mnem == 'TEST':
            if stack:
                stack.pop()  # Pops to R14

        elif mnem == 'DISCARD':
            if stack:
                stack.pop()

        elif mnem in ('FRAME_RD', 'FRAME_RD2', 'FRAME_RD3'):
            stack.append(None)  # Reads from MOBJ frame

        elif mnem == 'MOBJ_REF':
            stack.append(None)

        elif mnem == 'MOBJ_OP':
            stack.append(None)

    return results


def run():
    output_path = get_output_path()
    println("=== SCN3 Analysis Export ===")
    println("Output: %s" % output_path)

    mem = currentProgram.getMemory()

    # Ensure code is disassembled (may have been missed by auto-analysis)
    println("Ensuring disassembly...")
    ensure_disassembly()

    # Rename functions based on their CALL_SET operations
    println("Renaming functions semantically...")
    rename_functions_semantically()

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

    println("Extracting placement structures...")
    placement = extract_placement_structures(mem)
    println("  Model table:     %d models" % len(placement["model_table"]))
    println("  Record table:    %d records" % len(placement["record_table"]))
    println("  Room transforms: %d" % len(placement["room_transforms"]))
    println("  Permutation:     %d slots" % len(placement["permutation"]))
    println("  Entity records:  %d" % len(placement["entity_records"]))
    println("  Entity blocks:   %d" % len(placement["entity_blocks"]))

    println("Extracting bytecode placements...")
    bytecode_placements = extract_bytecode_placements()
    println("  Found %d tracked CALL_SET7 calls" % len(bytecode_placements))

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
        "placement": placement,
        "bytecode_placements": bytecode_placements,
        "functions": functions,
        "disassembly": disasm
    }

    # Write JSON
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)

    # Write decompiled C alongside JSON
    c_path = output_path.replace('.json', '.c')
    if c_path == output_path:
        c_path = output_path + '.c'
    has_if = sum(1 for fn in functions if 'if (' in fn.get('code', ''))
    has_while = sum(1 for fn in functions if 'while' in fn.get('code', ''))
    has_goto = sum(1 for fn in functions if 'goto ' in fn.get('code', ''))
    with open(c_path, 'w') as f:
        f.write("// Ghidra Decompiled C Output - SCN3 Bytecode\n")
        f.write("// %d functions: %d with if(), %d with while, %d with goto\n\n"
                % (len(functions), has_if, has_while, has_goto))
        for fn in functions:
            f.write("// --- %s at %s ---\n" % (fn['name'], fn['address']))
            f.write(fn['code'])
            f.write("\n\n")

    println("")
    println("=== Export Complete ===")
    println("  Models:     %d" % len(models))
    println("  Slots:      %d" % len(slots))
    println("  Floats:     %d" % len(floats))
    println("  Transforms: %d" % len(transforms))
    println("  Placement:  %d model_table, %d records, %d rooms, %d entities" % (
        len(placement["model_table"]), len(placement["record_table"]),
        len(placement["room_transforms"]), len(placement["entity_records"])))
    println("  Bytecode:   %d tracked SET7 calls" % len(bytecode_placements))
    println("  Functions:  %d (%d if, %d while, %d goto)" %
            (len(functions), has_if, has_while, has_goto))
    println("  Disasm:     %d instructions" % len(disasm))
    println("  Saved to:   %s" % output_path)
    println("  C output:   %s" % c_path)


run()
