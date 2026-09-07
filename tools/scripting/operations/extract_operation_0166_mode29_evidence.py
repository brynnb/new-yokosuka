#!/usr/bin/env python3
"""Prove operation 0x0166 mode 29's bounded readiness poll."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0166-mode29-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HELPER = (0x0C167A6E, 42, "bdb0a2938cc6394bd4ed7e8b112b0043880e34d3545b480d1cacbfa43c2abfd4")
ROUTE = (0x0C167DC6, 8, "9a1ba9d6a606b1c9f061055d891badb6b13861ecb2ab27ce9439e3ca45d3f0da")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x0166 mode-29 range is unavailable")
    return data[start:start + size]


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in {"helper": HELPER, "route": ROUTE}.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0166 mode-29 {name} changed")
    counter_address = struct.unpack("<I", runtime_slice(data, 0x0C167AB0, 4))[0]
    active_address = struct.unpack("<I", runtime_slice(data, 0x0C167AAC, 4))[0]
    if (counter_address, active_address) != (0x0C224428, 0x0C21BD04):
        raise ValueError("operation-0x0166 mode-29 globals changed")

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
                        and arguments[0].get("value") == 29
                    ):
                        comparison = action.get("resultComparison") or {}
                        calls.append({
                            "disc": source_map["disc"],
                            "area": source_map["area"],
                            "argumentCount": len(arguments),
                            "comparisonConstant": comparison.get("constant"),
                            "resultTarget": action.get("resultTarget") is not None,
                        })
    if (
        len(calls) != 82
        or Counter(item["argumentCount"] for item in calls) != {1: 82}
        or Counter(item["comparisonConstant"] for item in calls) != {0: 82}
        or any(item["resultTarget"] for item in calls)
    ):
        raise ValueError("operation-0x0166 mode-29 authored inventory changed")
    areas = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-operation-0166-mode29-evidence-v1",
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
            "mode": 29,
            "argumentCount": 1,
            "helperAddress": "0x0c167a6e",
            "counterAddress": "0x0c224428",
            "activeDwordAddress": "0x0c21bd04",
            "behavior": {
                "counterMutation": "increment-before-query",
                "minimumBusyCountExclusive": 5,
                "maximumBusyCountExclusive": 60,
                "resultBeforeMinimum": 1,
                "resultWithinWindowWhenActiveDwordNonzero": 1,
                "resultOtherwise": 0,
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len(areas),
            "callsByDiscArea": {
                f"{disc}:{area}": count
                for (disc, area), count in sorted(areas.items())
            },
            "comparisonWithZeroCount": 82,
        },
        "evidenceBoundary": [
            "Only operation 0x0166 with exact constant mode 29 and one argument receives this semantic.",
            "The shared counter at 0x0c224428 is incremented before every result calculation.",
            "The external dword at 0x0c21bd04 is read only once the incremented counter reaches five and remains a mandatory runtime dependency.",
            "The external dword's gameplay meaning and producer remain unnamed; unavailable state fails closed.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(), json.loads(args.event_ir.read_text())
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
