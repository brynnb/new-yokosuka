#!/usr/bin/env python3
"""Verify operations 0x0058/0x0059's exact native clock-record transfer."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/native-clock-record-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "writeHandler": (
        0x0C170768,
        14,
        "8b865c9da7a39c3efddfe2e9a5569e8a1b6fba32d5b5e1d41fee70e0c3e8dc5d",
    ),
    "copyHandler": (
        0x0C170776,
        14,
        "cafab67259c8bcc276b106e560ce85ba564af36c2bd077d04d129600d2475b1c",
    ),
    "copyHelper": (
        0x0C1821AE,
        32,
        "47ca833037735cc1fe50e2d26cc57ab91ce2833004eeba5d1ef5e97201c5d717",
    ),
    "clockRefresh": (
        0x0C182164,
        74,
        "c2b774e49b5ac2e2eab48f47afb230a25c7a45094ecfefd2fa5c702cfd0bf19e",
    ),
    "calendarAddNormalize": (
        0x0C181DC4,
        286,
        "8f75c7315c2fb62ec6b3b242709df044424829c21b2a2b441f2a3b7559d7e828",
    ),
    "weekdayRefresh": (
        0x0C1820F8,
        108,
        "237edef93c5619caea90cf01514c1fe45b0933183504ce6bd51cab9080f404d3",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(
    event_ir: dict[str, Any], operation_id: int,
) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == operation_id
                    ):
                        result.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return result


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"native clock operation {name} changed")
    dependencies = {
        "writeHelper": u32(data, 0x0C170800),
        "copyHelper": u32(data, 0x0C170804),
        "clockRecord": u32(data, 0x0C182240),
    }
    if dependencies != {
        "writeHelper": 0x0C182164,
        "copyHelper": 0x0C1821AE,
        "clockRecord": 0x0C225228,
    }:
        raise ValueError("operation-0x0059 dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    write_calls = operation_calls(event_ir, 0x0058)
    copy_calls = operation_calls(event_ir, 0x0059)
    write_dialogue = [call for call in write_calls if call["dialogue"]]
    copy_dialogue = [call for call in copy_calls if call["dialogue"]]

    def kinds(calls: list[dict[str, Any]]) -> Counter:
        return Counter(
        call["arguments"][0].get("kind")
        for call in calls
        if len(call["arguments"]) == 1
    )
    write_kinds = kinds(write_calls)
    copy_kinds = kinds(copy_calls)
    write_dialogue_kinds = kinds(write_dialogue)
    copy_dialogue_kinds = kinds(copy_dialogue)
    if (
        len(write_calls) != 103
        or len(copy_calls) != 568
        or len(write_dialogue) != 10
        or len(copy_dialogue) != 47
        or Counter(len(call["arguments"]) for call in write_calls) != {1: 103}
        or Counter(len(call["arguments"]) for call in copy_calls) != {1: 568}
        or write_kinds != {"frame-address": 76, "scene-address": 27}
        or copy_kinds != {"frame-address": 507, "scene-address": 61}
        or write_dialogue_kinds != {"frame-address": 5, "scene-address": 5}
        or copy_dialogue_kinds != {"frame-address": 43, "scene-address": 4}
        or any(
            call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in [*write_calls, *copy_calls]
        )
    ):
        raise ValueError("native clock operation authored inventory changed")
    record_layout = [
        {"offset": 0, "field": "yearSince1900", "range": [0, 99]},
        {"offset": 1, "field": "month", "range": [1, 12]},
        {"offset": 2, "field": "day", "range": [1, 31]},
        {"offset": 3, "field": "weekdaySundayZero", "range": [0, 6]},
        {"offset": 4, "field": "hour", "range": [0, 23]},
        {"offset": 5, "field": "minute", "range": [0, 59]},
        {"offset": 6, "field": "second", "range": [0, 59]},
    ]
    return {
        "schema": "new-yokosuka-native-clock-record-operation-evidence-v2",
        "status": "exact-native-read-write-and-all-disc-address-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operations": [{
            "operationId": 0x0058,
            "operationHex": "0x0058",
            "semanticId": "native-clock-record-write",
            "handlerAddress": "0x0c170768",
            "recordByteLength": 7,
            "recordLayout": record_layout,
            "provenBehavior": (
                "Dereferences the sole argument as a source pointer, normalizes "
                "its year/month/day/hour/minute/second fields with the native "
                "calendar routine, recomputes weekdaySundayZero, and installs "
                "the seven-byte result at fixed native clock record 0x0c225228."
            ),
        }, {
            "operationId": 0x0059,
            "operationHex": "0x0059",
            "semanticId": "native-clock-record-copy",
            "handlerAddress": "0x0c170776",
            "sourceRecordAddress": "0x0c225228",
            "recordByteLength": 7,
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": dependencies,
            "recordLayout": record_layout,
            "provenBehavior": (
                "Dereferences the sole argument as a destination pointer and "
                "copies bytes zero through six, unchanged and in order, from "
                "fixed native clock record 0x0c225228."
            ),
        }],
        "allDiscInventory": {
            "authoredCallCount": len(write_calls) + len(copy_calls),
            "provenCallCount": len(write_calls) + len(copy_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in [*write_calls, *copy_calls]
            }),
            "byOperation": {
                "0x0058": {
                    "provenCallCount": len(write_calls),
                    "dialogueRegionCallCount": len(write_dialogue),
                    "addressKindCounts": dict(sorted(write_kinds.items())),
                    "dialogueAddressKindCounts": dict(sorted(write_dialogue_kinds.items())),
                },
                "0x0059": {
                    "provenCallCount": len(copy_calls),
                    "dialogueRegionCallCount": len(copy_dialogue),
                    "addressKindCounts": dict(sorted(copy_kinds.items())),
                    "dialogueAddressKindCounts": dict(sorted(copy_dialogue_kinds.items())),
                },
            },
        },
        "evidenceBoundary": [
            "All sources and destinations are exact r14-relative frame addresses or r9-relative scene addresses.",
            "The hash-pinned zero-delta calendar-add routine proves rollover normalization for seconds, minutes, hours, Gregorian month lengths, leap years, months, and two-digit years; the separate weekday routine proves the Sunday-zero weekday byte.",
            "A native clock-record provider must derive from the authoritative game clock; host wall-clock or browser-time substitution is not permitted.",
            "The fixed record's update cadence and persistence ownership remain outside this operation's contract.",
            "Neither recovered operation result feeds a branch or stored result target.",
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
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
