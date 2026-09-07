#!/usr/bin/env python3
"""Verify operation 0x00d8's native camera-shake envelope contract."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/camera-shake-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29AD40, 4,
        "f92467804cedc6ca5ba26f822770e37623de71d9c6ea72d4ccf020fb97934034",
    ),
    "handler": (
        0x0C1570CA, 20,
        "ac3fd476fabec85d353cc065b20fa7accf8f0c4d6102c4e90e2544dea7cadd3b",
    ),
    "envelopeWriter": (
        0x0C09F540, 66,
        "1f608a84a2e0e3a59bfb0bd7304a345a9a92bc442b3d5bdecb6b6f0a39a12490",
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


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") != "engineOperation" or action.get(
                        "operationId"
                    ) != 0x00D8:
                        continue
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultTarget": action.get("resultTarget"),
                    })
    return result


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x00d8 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AD40),
        "envelopeWriter": u32(data, 0x0C1572D4),
        "horizontalAmplitudeGlobal": u32(data, 0x0C09F56C),
        "verticalAmplitudeGlobal": u32(data, 0x0C09F570),
        "retentionGlobal": u32(data, 0x0C09F574),
    }
    expected = {
        "handlerTableEntry": 0x0C1570CA,
        "envelopeWriter": 0x0C09F540,
        "horizontalAmplitudeGlobal": 0x0C201B48,
        "verticalAmplitudeGlobal": 0x0C201B4C,
        "retentionGlobal": 0x0C201B50,
    }
    if dependencies != expected:
        raise ValueError("operation-0x00d8 native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    inventory = calls(event_ir)
    shapes = Counter(tuple(arg.get("kind") for arg in call["arguments"])
                     for call in inventory)
    expected_shapes = Counter({
        ("constant", "constant", "constant"): 18,
        ("frame-field", "frame-field", "frame-field"): 11,
        ("frame-field", "frame-field", "runtime"): 1,
    })
    op00 = [call for call in inventory
            if call["disc"] == 1 and call["area"] == "OP00"]
    if (
        len(inventory) != 30
        or shapes != expected_shapes
        or sum(call["dialogue"] for call in inventory) != 6
        or any(call["resultTarget"] is not None for call in inventory)
        or len(op00) != 1
        or op00[0]["functionFileOffset"] != "0xfadc"
        or op00[0]["callFileOffset"] != "0xfc74"
        or [arg.get("kind") for arg in op00[0]["arguments"]]
        != ["frame-field", "frame-field", "runtime"]
        or [arg.get("offset") for arg in op00[0]["arguments"][:2]] != [4, 0]
    ):
        raise ValueError("operation-0x00d8 authored inventory changed")
    return {
        "schema": "new-yokosuka-camera-shake-operation-evidence-v1",
        "status": "exact-native-envelope-contract-and-full-ir-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00D8,
            "operationHex": "0x00d8",
            "argumentCount": 3,
            "handlerAddress": "0x0c1570ca",
            "verifiedRanges": {
                name: {"address": f"0x{address:08x}", "length": size,
                       "sha256": expected}
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "provenBehavior": (
                "Interpret all three arguments as float32 words. When the "
                "third float is greater than zero, copy the arguments to the "
                "horizontal-amplitude, vertical-amplitude, and retention "
                "globals. Otherwise write +0.0, +0.0, and +1.0. The adjacent "
                "native update consumes these globals as a decaying random "
                "translation applied through the current transform matrix."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(inventory),
            "argumentShapes": [
                {"kinds": list(shape), "count": count}
                for shape, count in sorted(shapes.items())
            ],
            "dialogueRegionCallCount": sum(call["dialogue"] for call in inventory),
            "op00": op00,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
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


if __name__ == "__main__":
    main()
