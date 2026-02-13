"""
Automated Asset Placement Extraction
=====================================
Consumes the ``placement`` structures from ExportSCN3Analysis.py and resolves
every entity to a world-space position using the full chain:

    entity_record.room_slot
      -> permuted room transform (world position)
      + child_offset from record table
      = final world position

Also supports a **standalone mode** that reads MAPINFO.BIN directly (no Ghidra
required) by re-implementing the same pattern-based structure finding.

Usage:
    # From Ghidra analysis JSON:
    python3 extract_placements.py <analysis.json> [output.json]

    # Standalone from raw MAPINFO.BIN:
    python3 extract_placements.py --raw <MAPINFO.BIN> [output.json]
"""

import json
import struct
import sys
import os
from collections import defaultdict


# ================================================================
# Core placement resolver — works on the structured data from Ghidra
# ================================================================

def resolve_placements(placement_data):
    """Resolve entity records to world-space positions.

    Args:
        placement_data: The ``placement`` dict from ExportSCN3Analysis.py,
            containing model_table, record_table, room_transforms,
            permutation, entity_records, and entity_blocks.

    Returns:
        dict with ``placements`` list and ``metadata``.
    """
    model_table = placement_data.get("model_table", [])
    record_table = placement_data.get("record_table", [])
    room_transforms = placement_data.get("room_transforms", [])
    permutation = placement_data.get("permutation", [])
    entity_records = placement_data.get("entity_records", [])
    entity_blocks = placement_data.get("entity_blocks", [])

    num_models = len(model_table)
    num_rt = len(room_transforms)

    if num_models == 0 or num_rt == 0:
        return {
            "metadata": {"note": "no placement structures found"},
            "placements": [],
        }

    # Build slot -> world position map via permutation
    slot_positions = {}
    if permutation:
        for entry in permutation:
            slot = entry["slot"]
            rt_idx = entry["rt_index"]
            if rt_idx < num_rt:
                slot_positions[slot] = room_transforms[rt_idx]["position"]
    else:
        # No permutation — use room transforms directly as slots
        for i, rt in enumerate(room_transforms):
            slot_positions[i] = rt["position"]

    # Build record index -> child offset map
    child_offsets = {}
    record_model_names = {}
    for rec in record_table:
        child_offsets[rec["index"]] = rec["child_offset"]
        record_model_names[rec["index"]] = rec["model_name"]

    # Build entity_id -> room slot refs from entity blocks
    entity_block_rooms = {}
    for block in entity_blocks:
        room_refs = [r for r in block.get("room_refs", []) if r < num_rt]
        for eid in block.get("entity_ids", []):
            entity_block_rooms[eid] = room_refs

    # Resolve each entity record to a world position
    placements = []
    for er in entity_records:
        proxy_idx = er.get("proxy_index")
        room_slot = er.get("room_slot")
        eid = er.get("entity_id", "")

        # Skip records without a valid proxy model reference
        if proxy_idx is None or proxy_idx == 0:
            continue

        # Get child offset from record table
        child_off = child_offsets.get(proxy_idx, [0, 0, 0])

        # Get room position from slot
        if room_slot is not None and room_slot in slot_positions:
            room_pos = slot_positions[room_slot]
        else:
            # Try entity block room refs as fallback
            block_rooms = entity_block_rooms.get(eid, [])
            if block_rooms:
                room_slot = block_rooms[0]
                room_pos = slot_positions.get(room_slot, [0, 0, 0])
            else:
                continue  # No room assignment — skip

        # World position = room position + child offset
        world_pos = [
            round(room_pos[0] + child_off[0], 4),
            round(room_pos[1] + child_off[1], 4),
            round(room_pos[2] + child_off[2], 4),
        ]

        proxy_model = er.get("proxy_model") or record_model_names.get(proxy_idx, "?")

        placements.append({
            "entity_id": eid,
            "proxy_model": proxy_model + ".MT5",
            "proxy_index": proxy_idx,
            "room_slot": room_slot,
            "position": world_pos,
            "room_position": list(room_pos),
            "child_offset": list(child_off),
            "interaction_offset": er.get("interaction_offset", [0, 0, 0, 0]),
        })

    return {
        "metadata": {
            "total_placements": len(placements),
            "unique_models": len(set(p["proxy_model"] for p in placements)),
            "room_slots_used": sorted(set(
                p["room_slot"] for p in placements if p["room_slot"] is not None
            )),
            "model_table_size": num_models,
            "room_transform_count": num_rt,
            "entity_record_count": len(entity_records),
        },
        "slot_positions": {str(k): list(v) for k, v in slot_positions.items()},
        "placements": placements,
    }


# ================================================================
# Standalone mode — read MAPINFO.BIN directly without Ghidra
# ================================================================

def _byte_val(b):
    return b if isinstance(b, int) else ord(b)


def extract_placement_structures_raw(mapinfo_path):
    """Re-implement the Ghidra extractor logic on raw MAPINFO.BIN bytes.

    Returns the same dict structure as ExportSCN3Analysis.extract_placement_structures().
    """
    with open(mapinfo_path, 'rb') as f:
        data = f.read()

    dlen = len(data)
    result = {
        "model_table": [],
        "record_table": [],
        "room_transforms": [],
        "permutation": [],
        "entity_records": [],
        "entity_blocks": [],
    }

    # ---- 1. Model table: dense $NAME.MT5 strings ----
    mt5_offsets = []
    i = 0
    while i < dlen - 13:
        if data[i] == 0x24:  # '$'
            ok = True
            for j in range(1, 9):
                bv = data[i + j]
                if not (0x20 <= bv < 0x7F):
                    ok = False
                    break
            if ok and data[i+9:i+13].upper() == b'.MT5':
                name = data[i+1:i+9].decode('ascii').rstrip('\x00').rstrip()
                mt5_offsets.append((i, name))
                i += 13
                continue
        i += 1

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

        if clusters:
            best = max(clusters, key=len)
            for off, name in best:
                result["model_table"].append({"offset": "0x%X" % off, "name": name})

    model_table = result["model_table"]
    num_models = len(model_table)
    if num_models == 0:
        return result

    model_table_start = int(model_table[0]["offset"], 16)

    # ---- 2. Record table: 56-byte records before model table ----
    RECSZ = 56
    search_start = max(0, model_table_start - num_models * RECSZ - 0x200)
    rec_table_start = None

    for probe in range(search_start, model_table_start - RECSZ + 1, 4):
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
                "offset": "0x%X" % roff,
                "index": ri,
                "model_index": midx,
                "model_name": model_names[midx] if midx < len(model_names) else "?",
                "child_offset": [round(cx, 4), round(cy, 4), round(cz, 4)],
            })

    # ---- 3. Room transforms: 0x24-byte records ----
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
                result["room_transforms"].append({
                    "offset": "0x%X" % probe,
                    "id": rid,
                    "flags": flags,
                    "scale": [round(sx, 4), round(sy, 4), round(sz, 4)],
                    "position": [round(px, 4), round(py, 4), round(pz, 4)],
                })

    num_rt = len(result["room_transforms"])

    # ---- 4. Permutation table ----
    if num_rt >= 3:
        rt_block_start = int(result["room_transforms"][0]["offset"], 16)
        for probe in range(max(0, rt_block_start - 0x200), rt_block_start - 8, 4):
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
                    result["permutation"].append({"slot": pi, "rt_index": v})
                break

    # ---- 5 & 6. Entity records and entity blocks ----
    if rec_table_start is not None and num_rt > 0:
        rt_end = 0
        if result["room_transforms"]:
            rt_last = int(result["room_transforms"][-1]["offset"], 16)
            rt_end = rt_last + RT_SIZE

        er_search_start = max(0, rt_end)
        # Align to absolute 0x20 boundary
        if er_search_start % 0x20 != 0:
            er_search_start = er_search_start + (0x20 - er_search_start % 0x20)
        er_search_end = rec_table_start

        for probe in range(er_search_start, er_search_end - 32 + 1, 0x20):
            chunk = data[probe:probe+4]
            if not all(0x20 <= b < 0x7F for b in chunk):
                continue
            eid = chunk.decode('ascii')
            u24 = struct.unpack_from('<I', data, probe + 24)[0]
            u28 = struct.unpack_from('<H', data, probe + 28)[0]
            u30 = struct.unpack_from('<H', data, probe + 30)[0]
            f8, f12, f16, f20 = struct.unpack_from('<ffff', data, probe + 8)

            floats_ok = all(v == v and abs(v) < 1e10 for v in [f8, f12, f16, f20])
            if not floats_ok:
                continue

            entry = {
                "offset": "0x%X" % probe,
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

        # Entity blocks
        eb_search_start = er_search_end
        eb_search_end = min(dlen, er_search_end + 0x400)
        current_block = None

        for probe in range(eb_search_start, eb_search_end - 4 + 1, 4):
            val = struct.unpack_from('<I', data, probe)[0]

            if val == 0xFFFFFFFF:
                if current_block and (current_block["entity_ids"] or current_block["room_refs"]):
                    result["entity_blocks"].append(current_block)
                current_block = {
                    "offset": "0x%X" % probe,
                    "room_refs": [],
                    "entity_ids": [],
                }
                continue

            if current_block is None:
                continue

            if val & 0xFFFF == 0x05A9:
                ref = (val >> 16) & 0xFFFF
                current_block["room_refs"].append(ref)
                continue

            chunk = data[probe:probe+4]
            if all(0x20 <= b < 0x7F for b in chunk):
                eid = chunk.decode('ascii')
                current_block["entity_ids"].append(eid)

        if current_block and (current_block["entity_ids"] or current_block["room_refs"]):
            result["entity_blocks"].append(current_block)

    return result


# ================================================================
# Main entry point
# ================================================================

def extract_placements(json_path, output_path):
    """Extract placements from Ghidra analysis JSON."""
    with open(json_path, 'r') as f:
        data = json.load(f)

    placement_data = data.get("placement")
    if not placement_data:
        print("WARNING: No 'placement' key in analysis JSON.")
        print("  Re-run ExportSCN3Analysis.py to generate placement structures,")
        print("  or use --raw mode to extract directly from MAPINFO.BIN.")
        return

    result = resolve_placements(placement_data)
    result["metadata"]["source"] = os.path.basename(json_path)
    result["metadata"]["tool"] = "extract_placements.py"

    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    _print_summary(result, json_path, output_path)
    return result


def extract_placements_raw(mapinfo_path, output_path):
    """Extract placements directly from raw MAPINFO.BIN."""
    placement_data = extract_placement_structures_raw(mapinfo_path)
    result = resolve_placements(placement_data)
    result["metadata"]["source"] = os.path.basename(mapinfo_path)
    result["metadata"]["tool"] = "extract_placements.py (standalone)"

    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)

    _print_summary(result, mapinfo_path, output_path)
    return result


def _print_summary(result, source, output_path):
    meta = result["metadata"]
    placements = result["placements"]

    print(f"=== Asset Placement Extraction ===")
    print(f"  Source:           {source}")
    print(f"  Total placements: {meta.get('total_placements', 0)}")
    print(f"  Unique models:    {meta.get('unique_models', 0)}")
    print(f"  Room slots used:  {meta.get('room_slots_used', [])}")
    print(f"  Output:           {output_path}")

    if placements:
        # Group by model
        by_model = defaultdict(list)
        for p in placements:
            by_model[p["proxy_model"]].append(p)

        print(f"\n  Placements by model:")
        for model in sorted(by_model):
            entries = by_model[model]
            if len(entries) == 1:
                pos = entries[0]["position"]
                print(f"    {model:16s}  slot {entries[0]['room_slot']:2d}  "
                      f"({pos[0]:8.3f}, {pos[1]:8.3f}, {pos[2]:8.3f})")
            else:
                print(f"    {model:16s}  {len(entries)} instances:")
                for e in entries:
                    pos = e["position"]
                    print(f"      {e['entity_id']:4s} slot {e['room_slot']:2d}  "
                          f"({pos[0]:8.3f}, {pos[1]:8.3f}, {pos[2]:8.3f})")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 extract_placements.py <analysis.json> [output.json]")
        print("  python3 extract_placements.py --raw <MAPINFO.BIN> [output.json]")
        sys.exit(1)

    if sys.argv[1] == '--raw':
        if len(sys.argv) < 3:
            print("Usage: python3 extract_placements.py --raw <MAPINFO.BIN> [output.json]")
            sys.exit(1)
        mapinfo_path = sys.argv[2]
        output_path = sys.argv[3] if len(sys.argv) > 3 else mapinfo_path.replace('.BIN', '_placements.json')
        extract_placements_raw(mapinfo_path, output_path)
    else:
        json_path = sys.argv[1]
        output_path = sys.argv[2] if len(sys.argv) > 2 else json_path.replace('.json', '_placements.json')
        extract_placements(json_path, output_path)
