#!/usr/bin/env python3
"""Join D000's ten live ``dor`` slots to the 120 static door records.

The room script creates the literal handle table ``dor0`` through ``dor9`` at
``context + 0x22c``.  The same slot index addresses a runtime selector table at
``context + 0x18c``.  A live callback-free TASK with its tag at ``TASK+0x168``
supplies the exact world transform, which is sufficient to join it to the
statically extracted MAPINFO door record without relying on a screenshot.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any


RAM_BASE = 0x8C000000
TASK_TAG_OFFSET = 0x168
TASK_POSITION_OFFSET = 0x28
TASK_ROTATION_OFFSET = 0x34
TASK_CALLBACK_OFFSET = 0x64
DOOR_HANDLE_TABLE_OFFSET = 0x22C
DOOR_SELECTOR_TABLE_OFFSET = 0x18C
DOOR_SLOT_COUNT = 10
DOOR_HANDLE_BYTES = b"".join(
    f"dor{slot}".encode("ascii") for slot in range(DOOR_SLOT_COUNT)
)


def signed_angle_degrees(raw: int) -> float:
    low = raw & 0xFFFF
    signed = low - 0x10000 if low >= 0x8000 else low
    return signed * 360.0 / 0x10000


def rounded_vector(values: tuple[float, ...], places: int = 6) -> list[float]:
    return [round(value, places) for value in values]


def find_script_context(ram: bytes) -> int:
    matches = []
    cursor = 0
    while True:
        cursor = ram.find(DOOR_HANDLE_BYTES, cursor)
        if cursor < 0:
            break
        context = cursor - DOOR_HANDLE_TABLE_OFFSET
        if context >= 0:
            matches.append(context)
        cursor += 1
    if len(matches) != 1:
        raise ValueError(
            "expected one D000 dor0..dor9 context table, "
            f"found {len(matches)}"
        )
    return matches[0]


def live_door_tasks(ram: bytes) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for offset in range(0, len(ram) - TASK_TAG_OFFSET - 4, 4):
        if ram[offset : offset + 4] != b"TASK":
            continue
        raw_tag = ram[
            offset + TASK_TAG_OFFSET : offset + TASK_TAG_OFFSET + 4
        ]
        if len(raw_tag) != 4 or raw_tag[:3] != b"dor":
            continue
        slot_byte = raw_tag[3]
        if slot_byte < ord("0") or slot_byte > ord("9"):
            continue
        slot = slot_byte - ord("0")
        callback = struct.unpack_from(
            "<I", ram, offset + TASK_CALLBACK_OFFSET
        )[0]
        if callback != 0:
            continue
        position = struct.unpack_from(
            "<3f", ram, offset + TASK_POSITION_OFFSET
        )
        if (
            not all(math.isfinite(value) and abs(value) < 1000 for value in position)
            or all(abs(value) < 1e-4 for value in position)
        ):
            continue
        rotation_raw = struct.unpack_from(
            "<3I", ram, offset + TASK_ROTATION_OFFSET
        )
        task = {
            "slot": slot,
            "objectTag": raw_tag.decode("ascii"),
            "taskAddress": f"0x{RAM_BASE + offset:08x}",
            "runtimePosition": rounded_vector(position),
            "browserPosition": rounded_vector(
                (-position[0], position[1], position[2])
            ),
            "runtimeRotationDegrees": rounded_vector(
                tuple(signed_angle_degrees(value) for value in rotation_raw)
            ),
        }
        previous = result.get(slot)
        if previous is not None:
            raise ValueError(
                f"multiple live TASKs found for {task['objectTag']}: "
                f"{previous['taskAddress']} and {task['taskAddress']}"
            )
        result[slot] = task
    return result


def squared_distance(left: list[float], right: list[float]) -> float:
    return sum((a - b) ** 2 for a, b in zip(left, right))


def join_static_record(
    task: dict[str, Any],
    static_placements: list[dict[str, Any]],
    epsilon: float,
) -> tuple[dict[str, Any], float]:
    ranked = sorted(
        (
            (squared_distance(task["browserPosition"], placement["position"]), placement)
            for placement in static_placements
        ),
        key=lambda item: item[0],
    )
    distance_squared, placement = ranked[0]
    distance = math.sqrt(distance_squared)
    if distance > epsilon:
        raise ValueError(
            f"{task['objectTag']} at {task['browserPosition']} has no static "
            f"door within {epsilon}; nearest is "
            f"{placement['runtime']['staticDoorIndex']} at distance {distance}"
        )
    return placement, distance


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Join D000 live dor slots to exact static door records.",
    )
    parser.add_argument("static_doors", type=Path)
    parser.add_argument("captures", nargs="+", type=Path)
    parser.add_argument("--epsilon", type=float, default=0.002)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    static_manifest = json.loads(args.static_doors.read_text())
    static_placements = static_manifest["placements"]
    bindings: list[dict[str, Any]] = []

    for capture in args.captures:
        ram_path = capture / "ram.bin" if capture.is_dir() else capture
        ram = ram_path.read_bytes()
        if len(ram) < 0x1000000:
            raise ValueError(f"{ram_path} is not a complete 16 MiB RAM capture")
        context = find_script_context(ram)
        tasks = live_door_tasks(ram)
        for slot, task in sorted(tasks.items()):
            placement, distance = join_static_record(
                task,
                static_placements,
                args.epsilon,
            )
            selector = struct.unpack_from(
                "<I",
                ram,
                context + DOOR_SELECTOR_TABLE_OFFSET + slot * 4,
            )[0]
            bindings.append(
                {
                    "capture": str(capture),
                    "scriptContextAddress": f"0x{RAM_BASE + context:08x}",
                    **task,
                    "runtimeDoorSelector": selector,
                    "staticDoorIndex": placement["runtime"]["staticDoorIndex"],
                    "staticDoorType": placement["runtime"]["staticDoorType"],
                    "model": placement["model"],
                    "joinDistance": round(distance, 9),
                }
            )

    by_static_index: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for binding in bindings:
        by_static_index[binding["staticDoorIndex"]].append(binding)
    conflicts = []
    recovered = []
    for static_index, values in sorted(by_static_index.items()):
        selectors = sorted({value["runtimeDoorSelector"] for value in values})
        if len(selectors) > 1:
            conflicts.append(
                {
                    "staticDoorIndex": static_index,
                    "runtimeDoorSelectors": selectors,
                    "captures": sorted({value["capture"] for value in values}),
                }
            )
        sample = values[0]
        recovered.append(
            {
                "staticDoorIndex": static_index,
                "staticDoorType": sample["staticDoorType"],
                "model": sample["model"],
                "runtimeDoorSelector": selectors[0] if len(selectors) == 1 else None,
                "observationCount": len(values),
            }
        )

    result = {
        "schema": "new-yokosuka-d000-active-door-bindings-v1",
        "source": {
            "staticDoors": str(args.static_doors),
            "captures": [str(capture) for capture in args.captures],
        },
        "method": {
            "handleTable": "context + 0x22c contains dor0 through dor9",
            "selectorTable": "context + 0x18c + slot * 4",
            "taskTag": "TASK + 0x168",
            "join": "exact browser-space XYZ transform against MAPINFO static doors",
            "epsilon": args.epsilon,
        },
        "summary": {
            "captureCount": len(args.captures),
            "bindingObservationCount": len(bindings),
            "recoveredStaticDoorCount": len(recovered),
            "staticDoorCount": len(static_placements),
            "selectorConflictCount": len(conflicts),
        },
        "recoveredDoors": recovered,
        "conflicts": conflicts,
        "bindings": bindings,
    }
    encoded = json.dumps(result, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded)
        print(
            f"Wrote {args.out} "
            f"({len(recovered)} static doors, {len(conflicts)} conflicts)"
        )
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
