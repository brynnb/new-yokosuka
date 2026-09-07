#!/usr/bin/env python3
"""Verify operation 0x0174's exact native write and authored inventory."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0174-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1724BC,
        62,
        "8c8cf0c9500e3db1dee2de0fbd6d4e66353e9fd78c2e1a73dea807cbb718e194",
    ),
    "writeHelper": (
        0x0C1BA8EE,
        6,
        "ba7666dec85872c2fa8918cd148e2e79b17da9845cbd0d1c281efac5fe0a1796",
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x0174
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


def constant(call: dict[str, Any], index: int) -> int | None:
    if len(call["arguments"]) <= index:
        return None
    argument = call["arguments"][index]
    return argument.get("value") if argument.get("kind") == "constant" else None


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0174 {name} changed")
    dependencies = {
        "operationTableHandler": u32(data, 0x0C29AFB0),
        "writeHelper": u32(data, 0x0C1724FC),
        "globalDword": u32(data, 0x0C1BA9AC),
    }
    if dependencies != {
        "operationTableHandler": 0x0C1724BC,
        "writeHelper": 0x0C1BA8EE,
        "globalDword": 0x0C2262A8,
    }:
        raise ValueError("operation-0x0174 dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    routes = Counter(
        (constant(call, 0), constant(call, 1), len(call["arguments"]))
        for call in authored
    )
    if (
        len(authored) != 136
        or routes != {(1, 0, 2): 12, (1, 1, 2): 124}
        or any(
            any(argument.get("kind") != "constant" for argument in call["arguments"])
            or call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x0174 authored inventory changed")
    dialogue = [call for call in authored if call["dialogue"]]
    return {
        "schema": "new-yokosuka-operation-0174-evidence-v1",
        "status": "exact-native-write-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0174,
            "operationHex": "0x0174",
            "handlerAddress": "0x0c1724bc",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": dependencies,
            "provenBehavior": (
                "Mode one forwards argument one unchanged to helper 0x0c1ba8ee, "
                "which replaces the dword at 0x0c2262a8. Every authored call "
                "uses mode one and writes exactly zero or one."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "valueCounts": {
                str(value): sum(count for (mode, route_value, argc), count in routes.items()
                                if mode == 1 and route_value == value and argc == 2)
                for value in (0, 1)
            },
        },
        "evidenceBoundary": [
            "The global dword retains its native address-derived name because its gameplay-domain meaning is not yet proved.",
            "The runtime owns the complete proven state transition and requires no external adapter.",
            "No behavior is inferred for unauthored modes or values outside zero and one.",
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
