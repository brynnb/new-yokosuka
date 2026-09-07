#!/usr/bin/env python3
"""Prove operation 0x0166 mode 28's fixed global clear route."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0166-mode28-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER = (0x0C167AB4, 900, "35e2555cd8d69878dc2601a667ce37dfae6f8e68d9d4bdf60bf964f6883587ae")
MODE_ROUTE = (0x0C167DC0, 6, "a72b4bae6075d43bf908cd3464933302c64f5f73be21e3d50be74eb23b6359c4")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x0166 evidence range is unavailable")
    return data[start:start + size]


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in {
        "handler": HANDLER,
        "mode28Route": MODE_ROUTE,
    }.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0166 {name} changed")
    literal = struct.unpack(
        "<I", runtime_slice(data, 0x0C167ECC, 4)
    )[0]
    if literal != 0x0C224428:
        raise ValueError("operation-0x0166 mode-28 global changed")

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if (
                        action.get("operationHex") == "0x0166"
                        and arguments
                        and arguments[0].get("kind") == "constant"
                        and arguments[0].get("value") == 28
                    ):
                        calls.append({
                            "disc": source_map["disc"],
                            "area": source_map["area"],
                            "argumentCount": len(arguments),
                            "resultTarget": action.get("resultTarget") is not None,
                            "resultComparison": action.get("resultComparison") is not None,
                        })
    if (
        len(calls) != 85
        or Counter(item["argumentCount"] for item in calls) != {1: 85}
        or any(item["resultTarget"] or item["resultComparison"] for item in calls)
    ):
        raise ValueError("operation-0x0166 mode-28 authored inventory changed")

    area_counts = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-operation-0166-mode28-evidence-v1",
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
            "mode": 28,
            "argumentCount": 1,
            "handlerAddress": "0x0c167ab4",
            "routeAddress": "0x0c167dc0",
            "globalAddress": "0x0c224428",
            "writtenValue": 0,
            "returnValue": 0,
            "routeBytes": runtime_slice(data, MODE_ROUTE[0], MODE_ROUTE[1]).hex(),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len(area_counts),
            "callsByDiscArea": {
                f"{disc}:{area}": count
                for (disc, area), count in sorted(area_counts.items())
            },
            "resultTargetCount": 0,
            "resultComparisonCount": 0,
        },
        "evidenceBoundary": [
            "Only operation 0x0166 with exact constant mode 28 and one argument receives this semantic.",
            "The mode path writes the handler's already-zero r4 to fixed dword 0x0c224428 in the branch delay slot and returns the unchanged zero result.",
            "The gameplay meaning and producer of the fixed dword remain unnamed.",
            "All other operation-0x0166 modes remain governed by their own evidence boundaries.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
