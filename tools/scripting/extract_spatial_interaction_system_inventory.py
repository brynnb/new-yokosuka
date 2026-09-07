#!/usr/bin/env python3
"""Inventory the native operation-0x0181 interaction system across all discs.

This deliberately stops at an exact architectural boundary. It identifies
rooms that install the common spatial-interaction subsystem, links each
mode-zero selector call to its operation-0x0002 child-coroutine launch, and
decodes the sentinel-terminated serialized records supplied by that launch.
It does not assign higher-level story labels.
"""

from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import shutil
import struct
import sys
from collections import Counter
from pathlib import Path
from typing import Any


from tools.scripting.extract_dialogue_call_graph import (
    containing_function,
    coroutine_launches,
    function_starts,
)
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.lib.portable_paths import portable_project_path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/spatial-interaction-system-inventory.json"
)
OP_SPATIAL_SELECTOR = 0x0181
SPATIAL_RECORD_SIZE = 24
SPATIAL_TERMINATOR = 0x47C35000
CUSTOM_HALF_WIDTH_FLAG = 0x100
WIDTH_ENTRY_SIZE = 12
WIDTH_ENTRY_TYPE = 0
WIDTH_TERMINATOR_TYPE = 3


def hx(value: int) -> str:
    return f"0x{value:x}"


def source_label(path: Path, roots: list[tuple[int, Path]]) -> tuple[int, str]:
    resolved = path.resolve()
    for disc, root in roots:
        try:
            relative = resolved.relative_to(root.resolve())
        except ValueError:
            continue
        return disc, relative.parts[0]
    raise ValueError(f"{path} is outside configured disc roots")


def decode_serialized_source(
    data: bytes,
    offset: int,
) -> dict[str, Any]:
    records = []
    cursor = offset
    while True:
        if cursor + 4 > len(data):
            raise ValueError(
                f"Spatial source at {offset:#x} has no terminator"
            )
        first_word = struct.unpack_from("<I", data, cursor)[0]
        if first_word == SPATIAL_TERMINATOR:
            terminator_offset = cursor
            cursor += 4
            break
        if cursor + SPATIAL_RECORD_SIZE > len(data):
            raise ValueError(
                f"Spatial record at {cursor:#x} extends beyond MAPINFO"
            )
        raw = data[cursor:cursor + SPATIAL_RECORD_SIZE]
        x, y, z = struct.unpack_from("<3f", raw)
        facing, flags, auxiliary = struct.unpack_from("<3I", raw, 12)
        records.append({
            "index": len(records),
            "fileOffset": hx(cursor),
            "position": [x, y, z],
            "requiredFacingRaw": facing,
            "selectorFlags": flags,
            "auxiliaryWord": auxiliary,
            "usesCustomHalfWidth": bool(flags & CUSTOM_HALF_WIDTH_FLAG),
            "rawHex": raw.hex(),
        })
        cursor += SPATIAL_RECORD_SIZE

    width_entries = []
    width_terminator_offset = None
    if any(record["usesCustomHalfWidth"] for record in records):
        for _index in range(256):
            if cursor + WIDTH_ENTRY_SIZE > len(data):
                raise ValueError(
                    f"Width table after {offset:#x} has no terminator"
                )
            entry_type, record_index, raw_value = struct.unpack_from(
                "<III", data, cursor
            )
            if entry_type == WIDTH_TERMINATOR_TYPE:
                width_terminator_offset = cursor
                break
            entry = {
                "type": entry_type,
                "recordIndex": record_index,
                "rawValue": raw_value,
                "fileOffset": hx(cursor),
            }
            if entry_type == WIDTH_ENTRY_TYPE:
                entry["lateralHalfWidth"] = struct.unpack_from(
                    "<f", data, cursor + 8
                )[0]
            width_entries.append(entry)
            cursor += WIDTH_ENTRY_SIZE
        if width_terminator_offset is None:
            raise ValueError(
                f"Width table after {offset:#x} exceeds 256 entries"
            )

    width_by_record = {
        entry["recordIndex"]: entry["lateralHalfWidth"]
        for entry in width_entries
        if entry["type"] == WIDTH_ENTRY_TYPE
    }
    for record in records:
        if record["usesCustomHalfWidth"]:
            if record["index"] not in width_by_record:
                raise ValueError(
                    f"Spatial record {record['index']} at {offset:#x} "
                    "requests a missing custom half-width"
                )
            record["lateralHalfWidth"] = width_by_record[record["index"]]

    return {
        "fileOffset": hx(offset),
        "recordStrideBytes": SPATIAL_RECORD_SIZE,
        "recordCount": len(records),
        "records": records,
        "terminator": {
            "fileOffset": hx(terminator_offset),
            "raw": hx(SPATIAL_TERMINATOR),
        },
        "customHalfWidthTable": {
            "startsImmediatelyAfterRecordTerminator": True,
            "entryStrideBytes": WIDTH_ENTRY_SIZE,
            "entries": width_entries,
            "terminatorFileOffset": (
                hx(width_terminator_offset)
                if width_terminator_offset is not None
                else None
            ),
        },
    }


def immediate_or_literal(
    row: tuple[int, str, str, int | None],
    destination: str,
) -> int | None:
    _address, mnemonic, operands, literal = row
    if "," not in operands or operands.rsplit(",", 1)[1] != destination:
        return None
    if mnemonic == "mov" and operands.startswith("#"):
        try:
            return int(operands.split(",", 1)[0][1:], 0)
        except ValueError:
            return None
    if mnemonic == "mov.l" and literal is not None:
        return literal
    return None


def recover_selector_result_routing(
    instructions: list[tuple[int, str, str, int | None]],
    starts: list[int],
    static_start: int,
    function: int,
    call_offset: int,
) -> dict[str, Any] | None:
    """Recover the generated ``selector result + 1`` scene-array write."""
    first = bisect.bisect_left(
        [row[0] for row in instructions],
        call_offset,
    )
    next_function = next(
        (start for start in starts if start > function),
        static_start,
    )
    rows = [
        row for row in instructions[first:]
        if row[0] < next_function
    ]
    for index, row in enumerate(rows):
        base_offset = immediate_or_literal(row, "r4")
        if base_offset is None or index + 1 >= len(rows):
            continue
        if rows[index + 1][1:3] != ("add", "r9,r4"):
            continue
        window = rows[index + 2:index + 18]
        player_index_offset = None
        result_local_offset = None
        r0_constant = None
        r6_constant = None
        saw_scaled_player_index = False
        saw_result_increment = False
        for candidate in window:
            value = immediate_or_literal(candidate, "r0")
            if value is not None:
                r0_constant = value
            value = immediate_or_literal(candidate, "r6")
            if value is not None:
                r6_constant = value
            if (
                candidate[1] == "mov.l"
                and candidate[2] == "@(r0,r14),r5"
            ):
                if not saw_scaled_player_index:
                    player_index_offset = r0_constant
                else:
                    result_local_offset = r0_constant
            elif (
                candidate[1] == "shad"
                and candidate[2] == "r6,r5"
                and r6_constant == 2
            ):
                saw_scaled_player_index = True
            elif (
                candidate[1] == "add"
                and candidate[2] == "r6,r5"
                and r6_constant == 1
            ):
                saw_result_increment = True
            elif candidate[1:3] == ("mov.l", "r5,@r4"):
                if (
                    saw_scaled_player_index
                    and saw_result_increment
                    and player_index_offset is not None
                    and result_local_offset is not None
                ):
                    return {
                        "sceneSelectorArrayBaseOffset": hx(base_offset),
                        "playerIndexFrameOffset": hx(player_index_offset),
                        "selectorResultFrameOffset": hx(
                            result_local_offset
                        ),
                        "arrayElementStrideBytes": 4,
                        "storedValue": "operation 0x0181 result + 1",
                        "notSelectedStoredValue": 0,
                        "writeFileOffset": hx(candidate[0]),
                    }
                break
    return None


def analyze_map(
    path: Path,
    roots: list[tuple[int, Path]],
    objdump: str,
) -> dict[str, Any] | None:
    data = path.read_bytes()
    try:
        scn3, code_start, initial, static_start = scn3_ranges(data)
    except ValueError:
        return None
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_start
    ]
    starts = function_starts(data, code_start, static_start)
    _data, _scn3, calls, _targets = mapinfo_dispatch_calls(path, objdump)
    selector_calls = [
        call for call in calls
        if call["operationId"] == OP_SPATIAL_SELECTOR
    ]
    if not selector_calls:
        return None

    launches = coroutine_launches(
        instructions,
        calls,
        starts,
        scn3,
        code_start,
        static_start,
    )
    mode_counts: Counter[int | str] = Counter()
    serialized_sources = []
    calls_out = []
    for call in selector_calls:
        arguments = call.get("arguments", [])
        mode = (
            arguments[0].get("value")
            if arguments and arguments[0].get("kind") == "constant"
            else "runtime"
        )
        mode_counts[mode] += 1
        call_offset = int(call["callFileOffset"], 16)
        function = containing_function(starts, call_offset)
        item: dict[str, Any] = {
            "callFileOffset": call["callFileOffset"],
            "functionFileOffset": hx(function) if function is not None else None,
            "mode": mode,
            "argumentCount": call["argumentCount"],
        }
        if mode == 0 and function is not None:
            item["selectorResultRouting"] = recover_selector_result_routing(
                instructions,
                starts,
                static_start,
                function,
                call_offset,
            )
            roots_for_function = [
                launch for launch in launches
                if launch["target"] == function
            ]
            item["coroutineLaunches"] = [
                {
                    "callFileOffset": hx(launch["call"]),
                    "sourceFunctionFileOffset": hx(launch["source"]),
                    "argumentCount": launch["argumentCount"],
                }
                for launch in roots_for_function
            ]
            launch_calls = {
                int(candidate["callFileOffset"], 16): candidate
                for candidate in calls
                if candidate["operationId"] == 0x0002
            }
            for launch in roots_for_function:
                raw = launch_calls.get(launch["call"])
                if raw is None:
                    continue
                child_arguments = raw.get("arguments", [])[2:]
                static_arguments = [
                    argument for argument in child_arguments
                    if argument.get("kind") == "static-pointer"
                ]
                for argument in static_arguments:
                    offset = argument["value"]
                    decoded = decode_serialized_source(data, offset)
                    serialized_sources.append({
                        "launchCallFileOffset": hx(launch["call"]),
                        **decoded,
                    })
                item["childArguments"] = child_arguments
        calls_out.append(item)

    disc, area = source_label(path, roots)
    return {
        "disc": disc,
        "area": area,
        "source": portable_project_path(path),
        "mapinfoSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": hx(scn3),
        "initialFunctionFileOffset": hx(initial),
        "operation0181CallCount": len(selector_calls),
        "modeCounts": {
            str(key): value
            for key, value in sorted(mode_counts.items(), key=lambda item: str(item[0]))
        },
        "serializedSources": serialized_sources,
        "calls": calls_out,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--disc-root",
        action="append",
        default=[],
        metavar="DISC:PATH",
        help="Disc number and SCENE root; repeat for each disc",
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    roots: list[tuple[int, Path]] = []
    for value in args.disc_root:
        disc_text, separator, path_text = value.partition(":")
        if not separator:
            raise ValueError(f"Invalid --disc-root {value!r}")
        roots.append((int(disc_text), Path(path_text)))
    if not roots:
        raise ValueError("At least one --disc-root is required")

    maps = []
    scanned = 0
    for _disc, root in roots:
        for path in sorted(root.glob("*/MAPINFO.BIN")):
            scanned += 1
            report = analyze_map(path, roots, args.objdump)
            if report is not None:
                maps.append(report)

    mode_counts: Counter[str] = Counter()
    for report in maps:
        mode_counts.update(report["modeCounts"])
    report = {
        "schema": "new-yokosuka-spatial-interaction-system-inventory-v3",
        "status": "exact-operation-launch-record-and-result-routing-inventory",
        "evidenceBoundary": (
            "Operation calls, modes, generated-function ownership, child "
            "coroutine launches, sentinel-terminated 24-byte spatial records, "
            "and custom-width entries are exact. Runtime byte identity is "
            "separately proven for D000. The generated one-based selector "
            "array writes are exact. Higher-level interaction labels and "
            "non-width override entry semantics remain unresolved."
        ),
        "summary": {
            "mapinfoScanned": scanned,
            "mapsWithOperation0181": len(maps),
            "operation0181Calls": sum(
                item["operation0181CallCount"] for item in maps
            ),
            "modeCounts": dict(sorted(mode_counts.items())),
            "modeZeroCallsWithSerializedSource": sum(
                bool(item["serializedSources"]) for item in maps
            ),
            "modeZeroCallsWithoutRecoveredLaunchSource": sum(
                not bool(item["serializedSources"]) for item in maps
            ),
            "modeZeroCallsWithRecoveredResultRouting": sum(
                any(
                    call["mode"] == 0
                    and call.get("selectorResultRouting") is not None
                    for call in item["calls"]
                )
                for item in maps
            ),
            "serializedSpatialRecords": sum(
                source["recordCount"]
                for item in maps
                for source in item["serializedSources"]
            ),
            "customHalfWidthEntries": sum(
                sum(
                    entry["type"] == WIDTH_ENTRY_TYPE
                    for entry in source[
                        "customHalfWidthTable"
                    ]["entries"]
                )
                for item in maps
                for source in item["serializedSources"]
            ),
        },
        "maps": maps,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {len(maps)}/{scanned} maps, "
        f"{report['summary']['operation0181Calls']} operation calls; "
        f"{report['summary']['modeZeroCallsWithSerializedSource']} "
        "serialized sources"
    )


if __name__ == "__main__":
    main()
