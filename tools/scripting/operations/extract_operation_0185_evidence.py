#!/usr/bin/env python3
"""Verify operation 0x0185's current-scene-owner flag-bit routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0185-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "operationWrapper": (
        0x0C16B7B0, 12,
        "a74b959ec1d14abc61c8c9c9e60562dc8b2ccdfbe7844ac46a2dbd4548f188e0",
    ),
    "flagBitWriter": (
        0x0C0F0AC6, 54,
        "768352be581f3f00a9315da11f324f319e55f79177e0ab3dc85004f994e3542d",
    ),
    "sceneOwnerResolver": (
        0x0C09766A, 14,
        "e6e92c85994bb269cabbf26002f45ecd445e15b46406c59a49ef9481d1a7e57f",
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
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x0185
                    ):
                        calls.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    return calls


def verify_executable(data: bytes) -> None:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        actual = hashlib.sha256(runtime_slice(data, address, size)).hexdigest()
        if actual != expected:
            raise ValueError(f"operation-0x0185 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AFF4),
        "wrapperTarget": u32(data, 0x0C16B800),
        "currentSceneOwner": u32(data, 0x0C0F0B30),
        "sceneOwnerResolver": u32(data, 0x0C0F0B38),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C16B7B0,
        "wrapperTarget": 0x0C0F0AC6,
        "currentSceneOwner": 0x0C217488,
        "sceneOwnerResolver": 0x0C09766A,
    }:
        raise ValueError("operation-0x0185 dependencies changed")


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(data)
    calls = operation_calls(event_ir)
    routes = Counter(tuple(
        argument.get("value") for argument in call["arguments"]
    ) for call in calls)
    if (
        len(calls) != 73
        or len({(call["disc"], call["area"]) for call in calls}) != 65
        or routes != {(0, 0): 45, (0, 1): 28}
        or any(call["dialogue"] for call in calls)
        or any(len(call["arguments"]) != 2 for call in calls)
        or any(
            argument.get("kind") != "constant"
            for call in calls for argument in call["arguments"]
        )
        or any(call["resultTarget"] is not None for call in calls)
        or any(call["resultComparison"] is not None for call in calls)
    ):
        raise ValueError("operation-0x0185 authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-0185-evidence-v1",
        "status": "exact-scene-owner-flag-bit-control-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0185,
            "operationHex": "0x0185",
            "handlerAddress": "0x0c16b7b0",
            "flagBitWriterAddress": "0x0c0f0ac6",
            "currentSceneOwnerAddress": "0x0c217488",
            "sceneOwnerResolver": "0x0c09766a",
            "ownerFlagsOffset": "0x00e0",
            "authoredBitIndices": [0],
            "authoredValues": [0, 1],
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "provenBehavior": (
                "Resolves the current scene owner's target through owner +0x3c, "
                "forms mask 1 << argument zero, and sets that mask in the target "
                "dword at +0xe0 when argument one is nonzero or clears it when zero."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": 65,
            "routeCounts": {"bit-0-clear": 45, "bit-0-set": 28},
            "dialogueRegionCallCount": 0,
            "resultConsumerCount": 0,
        },
        "evidenceBoundary": [
            "Only authored bit index zero with values zero and one is promoted.",
            "The target ownership chain, field offset, bit mask, and set/clear branches are executable-proven.",
            "The gameplay-domain meaning of scene-owner flag bit zero remains numeric.",
            "No unsupported bit index or dynamic call shape is treated as a no-op.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} proven calls")


if __name__ == "__main__":
    main()
