#!/usr/bin/env python3
"""
Shenmue Furniture Placement Extractor v3
=========================================
Extracts drawer/shelf/handle placements from MAPINFO.BIN using the
decoded object definition table structure.

Record structure (discovered via Ghidra SCN3 analysis):
  - 56-byte (0x38) records in the DATA section
  - Model index at record offset +24
  - XYZ relative transform at +28, +32, +36
  - Records are sequential by model table index
  - Non-zero transforms = child objects needing relative positioning
  - Zero transforms = parent/base objects at furniture origin

Parent-child grouping uses the model naming convention:
  Characters [2:5] = furniture unit code (e.g., KK3, KI2, TM4)
  All models sharing a unit code belong to the same furniture piece.

Room-level absolute positions come from the room transform table
(id=2 records in the DATA section).

Usage:
    python3 extract_furniture_placements.py <MAPINFO.BIN> [output.json]
"""

import struct
import re
import json
import os
import sys
import math
from collections import defaultdict
from dataclasses import dataclass, asdict
from typing import List, Dict, Tuple, Optional


RECORD_SIZE = 0x38  # 56 bytes per object definition record
IDX_OFFSET = 24     # Model index within record
XYZ_OFFSET = 28     # XYZ transform within record


@dataclass
class ObjectRecord:
    """A single object definition from the DATA section."""
    index: int
    model: str
    offset_x: float
    offset_y: float
    offset_z: float
    furniture_code: str  # chars [2:5] of model name
    is_child: bool       # True if has non-zero offset
    record_addr: int     # Address in MAPINFO.BIN


@dataclass
class RoomTransform:
    """Absolute position for a furniture group in world space."""
    position: Tuple[float, float, float]
    scale: Tuple[float, float, float]
    addr: int


@dataclass
class FurnitureGroup:
    """A complete furniture unit with parent + children."""
    code: str
    parent_models: List[str]
    children: List[dict]  # [{model, offset_x, offset_y, offset_z}]
    room_transform: Optional[dict] = None


def find_scn3_data_section(data: bytes) -> Tuple[int, int]:
    """Locate SCN3 section and return (scn3_header_start, data_section_start)."""
    idx = data.find(b'SCN3')
    if idx < 0:
        raise ValueError("No SCN3 section found")
    scn3_start = idx + 8
    data_offset = struct.unpack('<I', data[scn3_start + 8:scn3_start + 12])[0]
    return scn3_start, scn3_start + data_offset


def find_model_table(data: bytes) -> List[Tuple[int, str]]:
    """Find the dense cluster of model names in the DATA section."""
    # Find all .MT5 model name positions
    positions = []
    for m in re.finditer(rb'[A-Z0-9]{8}\.MT5', data):
        positions.append((m.start(), m.group().decode('ascii')))

    if not positions:
        return []

    # Find the largest dense cluster (models within 20 bytes of each other)
    clusters = []
    current = [positions[0]]
    for i in range(1, len(positions)):
        if positions[i][0] - positions[i - 1][0] < 20:
            current.append(positions[i])
        else:
            clusters.append(current)
            current = [positions[i]]
    clusters.append(current)

    # Return the largest cluster
    return max(clusters, key=len)


def find_record_table_start(data: bytes, model_table: List[Tuple[int, str]]) -> int:
    """Find the start of the object definition record table.

    Strategy: the last record (for the last model) ends just before the
    model name table. Work backwards from there.
    """
    num_models = len(model_table)
    model_table_start = model_table[0][0]

    # The record for the last model (index num_models-1) should be
    # somewhere before the model table. Search backwards for it.
    # Each record has the model index at offset +24.
    for candidate in range(model_table_start - RECORD_SIZE, model_table_start - 0x4000, -4):
        idx = struct.unpack('<I', data[candidate + IDX_OFFSET:candidate + IDX_OFFSET + 4])[0]
        if idx == num_models - 1:
            # Verify: the record before this should have index num_models-2
            prev_idx = struct.unpack('<I', data[candidate - RECORD_SIZE + IDX_OFFSET:
                                                candidate - RECORD_SIZE + IDX_OFFSET + 4])[0]
            if prev_idx == num_models - 2:
                # Found it. Compute table start.
                return candidate - (num_models - 1) * RECORD_SIZE

    # Fallback: scan for 4 consecutive sequential indices (0,1,2,3) at stride 0x38
    # This avoids false positives from zero-filled regions
    search_start = max(0, model_table_start - num_models * RECORD_SIZE - 0x5000)
    search_start = (search_start + 3) & ~3  # Align to 4 bytes
    for candidate in range(search_start, model_table_start, 4):
        end_check = candidate + 4 * RECORD_SIZE + IDX_OFFSET + 4
        if end_check > len(data):
            continue
        indices = []
        for k in range(4):
            addr = candidate + k * RECORD_SIZE + IDX_OFFSET
            indices.append(struct.unpack('<I', data[addr:addr + 4])[0])
        if indices == [0, 1, 2, 3]:
            # Extra validation: the last record should have idx = num_models - 1
            last_addr = candidate + (num_models - 1) * RECORD_SIZE + IDX_OFFSET
            if last_addr + 4 <= len(data):
                last_idx = struct.unpack('<I', data[last_addr:last_addr + 4])[0]
                if last_idx == num_models - 1:
                    return candidate

    return None  # No record table found


def extract_object_records(data: bytes, table_start: int,
                           model_names: List[str]) -> List[ObjectRecord]:
    """Extract all object definition records."""
    records = []
    for i in range(len(model_names)):
        rec_addr = table_start + i * RECORD_SIZE
        idx = struct.unpack('<I', data[rec_addr + IDX_OFFSET:rec_addr + IDX_OFFSET + 4])[0]
        x = struct.unpack('<f', data[rec_addr + XYZ_OFFSET:rec_addr + XYZ_OFFSET + 4])[0]
        y = struct.unpack('<f', data[rec_addr + XYZ_OFFSET + 4:rec_addr + XYZ_OFFSET + 8])[0]
        z = struct.unpack('<f', data[rec_addr + XYZ_OFFSET + 8:rec_addr + XYZ_OFFSET + 12])[0]

        model = model_names[idx] if idx < len(model_names) else f"unknown_{idx}"
        # Furniture unit code = chars [2:5] of model name (e.g., KK3, KI2, TM4)
        furniture_code = model[2:5] if len(model) >= 5 else "UNK"
        is_child = any(abs(v) > 0.001 for v in [x, y, z])

        # Sanitize NaN/Inf
        if not all(math.isfinite(v) for v in [x, y, z]):
            x, y, z = 0.0, 0.0, 0.0
            is_child = False

        records.append(ObjectRecord(
            index=idx, model=model,
            offset_x=round(x, 6), offset_y=round(y, 6), offset_z=round(z, 6),
            furniture_code=furniture_code, is_child=is_child,
            record_addr=rec_addr,
        ))

    return records


def extract_room_transforms(data: bytes, scn3_start: int,
                            data_start: int) -> List[RoomTransform]:
    """Extract room-level absolute transforms (id=2 records)."""
    transforms = []
    search_end = min(data_start + 20000, len(data) - 36)

    for offset in range(data_start, search_end, 4):
        entry_id = struct.unpack('<I', data[offset:offset + 4])[0]
        if entry_id != 2:
            continue

        sx = struct.unpack('<f', data[offset + 8:offset + 12])[0]
        sy = struct.unpack('<f', data[offset + 12:offset + 16])[0]
        sz = struct.unpack('<f', data[offset + 16:offset + 20])[0]
        px = struct.unpack('<f', data[offset + 20:offset + 24])[0]
        py = struct.unpack('<f', data[offset + 24:offset + 28])[0]
        pz = struct.unpack('<f', data[offset + 28:offset + 32])[0]

        # Validate: scale near 1.0, position in reasonable range
        if (abs(sx - 1.0) < 0.2 and abs(sy - 1.0) < 0.2 and abs(sz - 1.0) < 0.2
                and all(-100 < v < 100 for v in [px, py, pz])):
            transforms.append(RoomTransform(
                position=(round(px, 4), round(py, 4), round(pz, 4)),
                scale=(round(sx, 4), round(sy, 4), round(sz, 4)),
                addr=offset,
            ))

    return transforms


def build_furniture_groups(records: List[ObjectRecord]) -> Dict[str, FurnitureGroup]:
    """Group objects by furniture unit code and classify parent/child."""
    by_code = defaultdict(list)
    for rec in records:
        by_code[rec.furniture_code].append(rec)

    groups = {}
    for code, recs in sorted(by_code.items()):
        parents = [r.model for r in recs if not r.is_child]
        children = [
            {"model": r.model, "index": r.index,
             "offset": {"x": r.offset_x, "y": r.offset_y, "z": r.offset_z}}
            for r in recs if r.is_child
        ]
        groups[code] = FurnitureGroup(
            code=code,
            parent_models=parents,
            children=children,
        )

    return groups


def extract_furniture(mapinfo_path: str) -> dict:
    """Main extraction pipeline."""
    with open(mapinfo_path, 'rb') as f:
        data = f.read()

    scn3_start, data_start = find_scn3_data_section(data)
    model_table = find_model_table(data)
    model_names = [name for _, name in model_table]

    print(f"SCN3 data section @ 0x{data_start:X}")

    if not model_table:
        print("No furniture model table found (scene may not have interactive furniture)")
        return {"metadata": {"source": os.path.basename(mapinfo_path), "note": "no furniture models"}}

    print(f"Model table: {len(model_names)} models @ 0x{model_table[0][0]:X}")

    # Find and decode the object definition records
    table_start = find_record_table_start(data, model_table)
    records = extract_object_records(data, table_start, model_names)

    children_count = sum(1 for r in records if r.is_child)
    print(f"Object records: {len(records)} total, {children_count} with offsets")
    print(f"Record table @ 0x{table_start:X}")

    # Extract room transforms
    room_transforms = extract_room_transforms(data, scn3_start, data_start)
    print(f"Room transforms: {len(room_transforms)}")

    # Build furniture groups
    groups = build_furniture_groups(records)
    print(f"Furniture groups: {len(groups)}")

    # Build output
    output = {
        "metadata": {
            "source": os.path.basename(mapinfo_path),
            "tool": "extract_furniture_placements.py v3",
            "record_size": RECORD_SIZE,
            "record_table_addr": f"0x{table_start:X}",
            "model_count": len(model_names),
            "child_count": children_count,
            "room_transform_count": len(room_transforms),
            "furniture_group_count": len(groups),
        },
        "model_table": [
            {"index": i, "name": name, "addr": f"0x{addr:X}"}
            for i, (addr, name) in enumerate(model_table)
        ],
        "object_records": [
            {
                "index": r.index, "model": r.model,
                "furniture_code": r.furniture_code,
                "is_child": r.is_child,
                "offset": {"x": r.offset_x, "y": r.offset_y, "z": r.offset_z},
                "record_addr": f"0x{r.record_addr:X}",
            }
            for r in records
        ],
        "room_transforms": [
            {
                "position": {"x": t.position[0], "y": t.position[1], "z": t.position[2]},
                "scale": {"x": t.scale[0], "y": t.scale[1], "z": t.scale[2]},
                "addr": f"0x{t.addr:X}",
            }
            for t in room_transforms
        ],
        "furniture_groups": {
            code: {
                "code": g.code,
                "parent_models": g.parent_models,
                "children": g.children,
            }
            for code, g in groups.items()
        },
    }

    # Print summary
    print(f"\n{'='*60}")
    print("FURNITURE PLACEMENT SUMMARY")
    print(f"{'='*60}")
    for code, g in sorted(groups.items()):
        if g.children:
            print(f"\n  [{code}] {len(g.parent_models)} parents, {len(g.children)} children:")
            for p in g.parent_models:
                print(f"    PARENT: {p}")
            for c in g.children:
                o = c['offset']
                print(f"    CHILD:  {c['model']:16s}  offset=({o['x']:8.4f}, {o['y']:8.4f}, {o['z']:8.4f})")
        else:
            print(f"\n  [{code}] {len(g.parent_models)} models (all at origin)")

    return output


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 extract_furniture_placements.py <MAPINFO.BIN> [output.json]")
        print("  Extracts furniture placements with proper parent-child transforms.")
        sys.exit(1)

    mapinfo_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not output_path:
        zone = os.path.basename(os.path.dirname(mapinfo_path))
        output_path = f"furniture_{zone}.json"

    result = extract_furniture(mapinfo_path)

    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f"\nSaved: {output_path}")
