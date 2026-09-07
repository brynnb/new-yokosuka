#!/usr/bin/env python3
"""Prove operation 0x0166 mode 30's typed-record state query."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0166-mode30-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "recordResolver": (0x0C11A474, 42, "cd3620fb9ec33aafb3611fe83e682d706a7f26477236fdf8a80e9f09ba810983"),
    "queryHelper": (0x0C11A4C0, 38, "e45e6d596b931e8f82bae1bf63ef335846d439aad138a2e2ab6c572dbf920d04"),
    "modeRoute": (0x0C167DCE, 8, "bcd9d9d1f11798a1833f7ac13eb0fe02f537ef30c910a7487e01cf2af4ed2310"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x0166 mode-30 range is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0166 mode-30 {name} changed")
    dependencies = {
        "recordRoot": u32(data, 0x0C11A534),
        "recordCount": u32(data, 0x0C11A538),
        "doorTag": u32(data, 0x0C11A53C),
    }
    if dependencies != {
        "recordRoot": 0x0C21BCB4,
        "recordCount": 0x0C21BCBC,
        "doorTag": 0x524F4F44,
    }:
        raise ValueError("operation-0x0166 mode-30 dependencies changed")

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            actions = [action for block in function["blocks"] for action in block["actions"]]
            by_offset = {action.get("callFileOffset"): action for action in actions}
            for action in actions:
                arguments = action.get("arguments", [])
                if not (
                    action.get("operationHex") == "0x0166"
                    and arguments
                    and arguments[0].get("kind") == "constant"
                    and arguments[0].get("value") == 30
                ):
                    continue
                source = by_offset.get(arguments[1].get("callFileOffset"))
                comparison = action.get("resultComparison") or {}
                calls.append({
                    "disc": source_map["disc"],
                    "area": source_map["area"],
                    "argumentCount": len(arguments),
                    "argumentOneKind": arguments[1].get("kind"),
                    "sourceOperation": source.get("operationHex") if source else None,
                    "sourceSemantic": source.get("semanticId") if source else None,
                    "comparison": comparison.get("comparison"),
                    "comparisonConstant": comparison.get("constant"),
                })
    shapes = Counter((
        item["argumentCount"], item["argumentOneKind"],
        item["sourceOperation"], item["sourceSemantic"],
        item["comparison"], item["comparisonConstant"],
    ) for item in calls)
    expected_shape = (2, "operation-result", "0x009a", "typed-indexed-table-access", "equal", 1)
    if len(calls) != 96 or shapes != {expected_shape: 96}:
        raise ValueError("operation-0x0166 mode-30 authored inventory changed")
    areas = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-operation-0166-mode30-evidence-v1",
        "status": "exact-native-route-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0166,
            "operationHex": "0x0166",
            "mode": 30,
            "argumentCount": 2,
            "helperAddress": "0x0c11a4c0",
            "recordRootAddress": "0x0c21bcb4",
            "recordCountAddress": "0x0c21bcbc",
            "recordStride": 0x1f0,
            "recordKeyOffset": 4,
            "recordStateOffset": 20,
            "matchedState": 2,
            "unconditionalMatchKey": "DOOR",
            "unconditionalMatchWord": 0x524f4f44,
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len(areas),
            "callsByDiscArea": {
                f"{disc}:{area}": count
                for (disc, area), count in sorted(areas.items())
            },
            "typedTableResultOperandCount": 96,
            "comparisonWithOneCount": 96,
        },
        "evidenceBoundary": [
            "Only operation 0x0166 with exact constant mode 30 and two arguments receives this semantic.",
            "All authored argument-one values are exact results of operation 0x009a typed-indexed-table access and are not replaced with guessed tags.",
            "The raw word for DOOR returns one without record lookup; otherwise the fixed record array returns one only when the matching record's dword +0x14 equals two.",
            "The fixed record array's population remains a mandatory runtime dependency for non-DOOR values.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
