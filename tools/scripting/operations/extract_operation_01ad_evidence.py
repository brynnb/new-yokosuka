#!/usr/bin/env python3
"""Verify the exact native operation-0x01ad fixed-stride table write."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER = (0x0C164B72, 16, "9ec2000e95c47542fc38d3022f31168aaff53ec3624d8cf76e7a22cba882900d")
WRITE_HELPER = (0x0C13099A, 20, "1fedc13366051cc1d2d04faa3b946035dc9699f87b2f294b6a0bfbb37a92504a")
TABLE_ENTRY = 0x0C29B094
HELPER_POINTER = 0x0C164C88
TABLE_BASE_POINTER = 0x0C130B1C
TABLE_BASE = 0x0C21C7C4
RECORD_STRIDE = 96


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(executable: bytes, event_ir: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for address, length, expected in (HANDLER, WRITE_HELPER):
        if digest(runtime_slice(executable, address, length)) != expected:
            raise ValueError(f"operation 0x01ad code at 0x{address:08x} changed")
    if u32(executable, TABLE_ENTRY) != HANDLER[0]:
        raise ValueError("operation 0x01ad table entry changed")
    if u32(executable, HELPER_POINTER) != WRITE_HELPER[0]:
        raise ValueError("operation 0x01ad helper pointer changed")
    if u32(executable, TABLE_BASE_POINTER) != TABLE_BASE:
        raise ValueError("operation 0x01ad table base changed")

    calls = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") == 0x01AD:
                        calls.append({
                            "disc": native_map["disc"],
                            "area": native_map["area"],
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    if len(calls) != 267 or any(len(call["arguments"]) != 2 for call in calls):
        raise ValueError("operation 0x01ad authored inventory changed")
    if any(argument.get("kind") != "constant" for call in calls for argument in call["arguments"]):
        raise ValueError("operation 0x01ad has a non-constant authored argument")
    indices = Counter(call["arguments"][0]["value"] for call in calls)
    values = Counter(call["arguments"][1]["value"] for call in calls)
    if set(indices) != set(range(17)) or values != {0: 70, 1: 197}:
        raise ValueError("operation 0x01ad authored values changed")
    if any(call["resultTarget"] is not None or call["resultComparison"] is not None for call in calls):
        raise ValueError("operation 0x01ad unexpectedly consumes a result")

    return {
        "schema": "new-yokosuka-operation-01ad-evidence-v1",
        "generatedBy": "tools/scripting/operations/extract_operation_01ad_evidence.py",
        "sources": {
            "executable": {"path": ".disc-work/exact/1ST_READ.BIN", "sha256": EXECUTABLE_SHA256},
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x01AD,
            "operationHex": "0x01ad",
            "handlerAddress": f"0x{HANDLER[0]:08x}",
            "handlerLength": HANDLER[1],
            "handlerSha256": HANDLER[2],
            "writeHelperAddress": f"0x{WRITE_HELPER[0]:08x}",
            "writeHelperLength": WRITE_HELPER[1],
            "writeHelperSha256": WRITE_HELPER[2],
            "tableBaseAddress": f"0x{TABLE_BASE:08x}",
            "recordStrideBytes": RECORD_STRIDE,
            "provenBehavior": (
                "Forwards argument one as an unchanged dword and argument zero as the "
                "record index. The helper writes the dword at table base + index * 96."
            ),
        },
        "inventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "indexCounts": {str(key): indices[key] for key in sorted(indices)},
            "valueCounts": {str(key): values[key] for key in sorted(values)},
            "resultTargetCount": 0,
            "resultComparisonCount": 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--event-ir", type=Path, default=ROOT / ".disc-work/dialogue/native-event-ir.json")
    parser.add_argument("--output", type=Path, default=ROOT / "tools/evidence/operation-01ad-evidence.json")
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    try:
        label = args.output.relative_to(ROOT)
    except ValueError:
        label = args.output
    print(f"Wrote {label}")


if __name__ == "__main__":
    main()
