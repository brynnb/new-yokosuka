#!/usr/bin/env python3
"""Verify operation 0x00ae fixed-record pose writes from native code and IR."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/fixed-record-pose-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C164A2A, 26, "92ce1340fe278b087847ac7c711686294b2cac3ef7b9ad4e5a3cd432a54dd866"),
    "positionWrite": (0x0C1308E8, 48, "1f4ccb23d4539aa3cccc36b17b88fb0f3be12b5485a093d65214dfa060553c29"),
    "controlWrite": (0x0C13091C, 20, "ca2aafe1236728d4b4648241028f806e9218c545f53f13b159819fa99ed401a7"),
}
LITERALS = {
    0x0C29AC98: 0x0C164A2A,
    0x0C164C44: 0x0C1308E8,
    0x0C164C48: 0x0C13091C,
    0x0C130B0C: 0x0C21C768,
    0x0C130B10: 0x0C21C790,
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def verify_native_contract(executable: bytes) -> None:
    if hashlib.sha256(executable).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        actual = hashlib.sha256(runtime_slice(executable, address, size)).hexdigest()
        if actual != expected:
            raise ValueError(f"operation-0x00ae {name} changed")
    for address, expected in LITERALS.items():
        actual = struct.unpack("<I", runtime_slice(executable, address, 4))[0]
        if actual != expected:
            raise ValueError(f"operation-0x00ae literal 0x{address:08x} changed")


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"disc": item["disc"], "area": item["area"], "arguments": action["arguments"]}
        for item in event_ir["maps"]
        for function in item["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("kind") == "engineOperation"
        and action.get("operationId") == 0x00AE
    ]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_native_contract(executable)
    calls = operation_calls(event_ir)
    kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(3)
    }
    if (
        len(calls) != 47
        or any(len(call["arguments"]) != 3 for call in calls)
        or kinds != {
            "0": {"constant": 47},
            "1": {"frame-address": 18, "static-pointer": 29},
            "2": {"constant": 47},
        }
        or {call["arguments"][0]["value"] for call in calls} != set(range(11))
        or {call["arguments"][2]["value"] for call in calls} != {0, 6553, 22022, 49152}
    ):
        raise ValueError("operation-0x00ae authored inventory changed")
    return {
        "schema": "new-yokosuka-fixed-record-pose-operation-evidence-v1",
        "status": "exact-native-contract-and-complete-authored-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00AE,
            "operationHex": "0x00ae",
            "argumentCount": 3,
            "handlerAddress": "0x0c164a2a",
            "recordBase": "0x0c21c74c",
            "recordCount": 32,
            "recordStride": 96,
            "provenBehavior": (
                "For argument-zero indices below 32, copies the three raw "
                "words addressed by argument one to fixed-record offsets "
                "+0x1c, +0x20, and +0x24, then writes argument two unchanged "
                "at +0x28. The record family is shared with operation 0x0120 "
                "mode two; its higher-level ownership remains unnamed."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": kinds,
            "recordIndices": sorted({call["arguments"][0]["value"] for call in calls}),
            "controlWords": sorted({call["arguments"][2]["value"] for call in calls}),
        },
        "evidenceBoundary": [
            "Record addresses, stride, bounds check, and raw writes are executable-proven.",
            "Static and frame-address vector sources are preserved without coordinate reinterpretation.",
            "The fixed record family has no inferred high-level gameplay name.",
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
        json.loads(args.event_ir.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
