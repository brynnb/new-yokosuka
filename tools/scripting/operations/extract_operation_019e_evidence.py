#!/usr/bin/env python3
"""Verify all authored operation 0x019e controller routes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-019e-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (
        0x0C16AC0E,
        70,
        "ef40cbf453cad3f2405c117d865ba198da6f899f7e8edead9498ae7fe34de7e7",
    ),
    "recordAllocator": (
        0x0C16A9B8,
        258,
        "d63bf437f6ca2f0ec0bcfc2e3f7fba7b8c1d741b9ecf100ae60a34ee4bd94448",
    ),
    "recordComparator": (
        0x0C16AB64,
        170,
        "91e9f2769c93e6ce5bb544920808ea81904f0a000cc9cd1c3718cd157857756e",
    ),
    "recordPruner": (
        0x0C16A932,
        134,
        "7bb133b0171afe4e218c7423171de06c45814d9824168b4ce88a2a2c1f3e55d1",
    ),
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "disc": item["disc"],
            "area": item["area"],
            "arguments": action["arguments"],
            "adapterStatus": action.get("adapterStatus"),
            "resultTarget": action.get("resultTarget"),
            "resultComparison": action.get("resultComparison"),
        }
        for item in event_ir["maps"]
        for function in item["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if (
            action.get("kind") == "engineOperation"
            and action.get("operationId") == 0x019E
        )
    ]


def verify_executable(data: bytes) -> None:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        actual = hashlib.sha256(runtime_slice(data, address, size)).hexdigest()
        if actual != expected:
            raise ValueError(f"operation-0x019e {name} changed")
    if {
        "handlerTableEntry": u32(data, 0x0C29B058),
        "enabledByte": u32(data, 0x0C16AC60),
        "resultWriter": u32(data, 0x0C16AC64),
    } != {
        "handlerTableEntry": 0x0C16AC0E,
        "enabledByte": 0x0C224430,
        "resultWriter": 0x0C0BB342,
    }:
        raise ValueError("operation-0x019e dependencies changed")


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(data)
    calls = operation_calls(event_ir)
    modes = Counter(
        call["arguments"][0].get("value")
        for call in calls
    )
    argument_counts = Counter(len(call["arguments"]) for call in calls)
    mode_two_values = Counter(
        call["arguments"][1].get("value")
        for call in calls
        if len(call["arguments"]) == 2
    )
    mode_four_scene_sources = Counter(
        call["arguments"][1].get("kind")
        for call in calls
        if len(call["arguments"]) == 7
    )
    if (
        len(calls) != 569
        or len({(call["disc"], call["area"]) for call in calls}) != 98
        or modes != {4: 554, 2: 15}
        or argument_counts != {7: 554, 2: 15}
        or mode_two_values != {1: 10, 0: 5}
        or mode_four_scene_sources
        != {"constant": 495, "operation-result": 56, "scene-field": 3}
        or any(call["adapterStatus"] != "proven" for call in calls)
        or any(
            call["resultTarget"] is not None
            or call["resultComparison"] is not None
            for call in calls
        )
    ):
        raise ValueError("operation-0x019e authored inventory changed")
    mode_four = [call for call in calls if len(call["arguments"]) == 7]
    static_schedules = [
        call["arguments"][4]["staticWords"]
        for call in mode_four
        if call["arguments"][4].get("kind") == "static-pointer"
    ]
    if (
        len(static_schedules) != 490
        or any(len(words) > 8 or words[-1] != 0xffffffff for words in static_schedules)
        or Counter(
            call["arguments"][4].get("kind") for call in mode_four
        ) != {"static-pointer": 490, "constant": 64}
        or any(
            call["arguments"][4].get("value") != 0xffffffff
            for call in mode_four
            if call["arguments"][4].get("kind") == "constant"
        )
    ):
        raise ValueError("operation-0x019e schedule inventory changed")
    return {
        "schema": "new-yokosuka-operation-019e-evidence-v1",
        "status": "exact-native-all-authored-routes",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x019E,
            "operationHex": "0x019e",
            "handlerAddress": "0x0c16ac0e",
            "maximumRecordCount": 8,
            "recordStride": 36,
            "routes": {
                "2": "Writes and returns the Boolean global control byte.",
                "4": (
                    "Builds one controller record from scene index, area tag, "
                    "kind, sentinel-terminated schedule, time word, and flags; "
                    "returns its table index or -1 for duplicate/full."
                ),
            },
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": 98,
            "modeCounts": {"2": 15, "4": 554},
            "modeTwoValueCounts": {"0": 5, "1": 10},
            "modeFourSceneSourceCounts": dict(mode_four_scene_sources),
            "interleaved019cResultCallCount": 56,
            "staticScheduleCount": len(static_schedules),
            "sentinelScheduleCount": len(static_schedules),
            "resultConsumerCount": 0,
        },
        "evidenceBoundary": [
            "Only authored modes two and four are promoted; executable mode three remains unregistered because no authored call uses it.",
            "The 56 mode-four calls that interleave a zero-argument 0x019c query retain the exact seven-word native record through instruction-shape dataflow recovery.",
            "Record capacity, field layout, duplicate comparison fields, sentinel bound, control-byte behavior, and return values are executable-proven.",
            "The higher-level gameplay meaning of each controller record remains numeric.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['authoredCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
