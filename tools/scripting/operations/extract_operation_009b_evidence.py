#!/usr/bin/env python3
"""Verify the exact native operation-0x009b registry-release contract."""

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
HANDLER = (0x0C166020, 14, "5b2d222db7c10c06c680731435a07ebe98513e1b6221dc5829699eb3f5e5c9a1")
RELEASE_HELPER = (0x0C10BB56, 144, "8f3cc5fa07c24904270749334e6a9a07151f88390d09f83ce5a624498b2296b2")
TABLE_ENTRY = 0x0C29AC4C
HELPER_POINTER = 0x0C1660D0


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
    for address, length, expected in (HANDLER, RELEASE_HELPER):
        if digest(runtime_slice(executable, address, length)) != expected:
            raise ValueError(f"operation 0x009b code at 0x{address:08x} changed")
    if u32(executable, TABLE_ENTRY) != HANDLER[0]:
        raise ValueError("operation 0x009b table entry changed")
    if u32(executable, HELPER_POINTER) != RELEASE_HELPER[0]:
        raise ValueError("operation 0x009b release-helper pointer changed")

    calls = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") == 0x009B:
                        calls.append({
                            "disc": native_map["disc"],
                            "area": native_map["area"],
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    if len(calls) != 48 or any(len(call["arguments"]) != 1 for call in calls):
        raise ValueError("operation 0x009b authored call inventory changed")
    kinds = Counter(call["arguments"][0].get("kind") for call in calls)
    if kinds != {"frame-field": 30, "scene-field": 17, "runtime": 1}:
        raise ValueError("operation 0x009b authored argument shapes changed")
    if any(call["resultTarget"] is not None or call["resultComparison"] is not None for call in calls):
        raise ValueError("operation 0x009b unexpectedly consumes its native result")

    return {
        "schema": "new-yokosuka-operation-009b-evidence-v1",
        "generatedBy": "tools/scripting/operations/extract_operation_009b_evidence.py",
        "sources": {
            "executable": {
                "path": ".disc-work/exact/1ST_READ.BIN",
                "sha256": EXECUTABLE_SHA256,
            },
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x009B,
            "operationHex": "0x009b",
            "handlerAddress": f"0x{HANDLER[0]:08x}",
            "handlerLength": HANDLER[1],
            "handlerSha256": HANDLER[2],
            "releaseHelperAddress": f"0x{RELEASE_HELPER[0]:08x}",
            "releaseHelperLength": RELEASE_HELPER[1],
            "releaseHelperSha256": RELEASE_HELPER[2],
            "provenBehavior": (
                "The handler forwards its sole authored word unchanged to the native "
                "registry-release helper. The helper returns zero for a null or absent "
                "record and one after unlinking and releasing a matching record."
            ),
        },
        "inventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": dict(sorted(kinds.items())),
            "resultTargetCount": 0,
            "resultComparisonCount": 0,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--event-ir", type=Path, default=ROOT / ".disc-work/dialogue/native-event-ir.json")
    parser.add_argument("--output", type=Path, default=ROOT / "tools/evidence/operation-009b-evidence.json")
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    try:
        label = args.output.relative_to(ROOT)
    except ValueError:
        label = args.output
    print(f"Wrote {label}")


if __name__ == "__main__":
    main()
