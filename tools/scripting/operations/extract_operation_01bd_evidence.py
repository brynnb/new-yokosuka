#!/usr/bin/env python3
"""Verify operation 0x01bd's exact consume-on-read global contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-01bd-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C162CB2,
        28,
        "4b04b0b494d17cac9d008f1312da6afa5b980e3f5f2286ed9478fc2ba94a41ae",
    ),
    "integerResultWriter": (
        0x0C0BB342,
        58,
        "b67f6a3a7caff1e0a4cdec5de7340a723955e0fe59760afd76854f4317353851",
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
                        and action.get("operationId") == 0x01BD
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
            raise ValueError(f"operation-0x01bd {name} changed")
    dependencies = {
        "operationTableHandler": u32(data, 0x0C29B0D4),
        "globalDword": u32(data, 0x0C162D2C),
        "integerResultWriter": u32(data, 0x0C162D30),
    }
    if dependencies != {
        "operationTableHandler": 0x0C162CB2,
        "globalDword": 0x0C2242C8,
        "integerResultWriter": 0x0C0BB342,
    }:
        raise ValueError("operation-0x01bd dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    if (
        len(authored) != 84
        or len({(call["disc"], call["area"]) for call in authored}) != 84
        or any(
            len(call["arguments"]) != 2
            or [argument.get("kind") for argument in call["arguments"]]
            != ["runtime", "runtime"]
            or call["dialogue"]
            or call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x01bd authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-01bd-evidence-v1",
        "status": "exact-native-consume-boundary-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x01BD,
            "operationHex": "0x01bd",
            "handlerAddress": "0x0c162cb2",
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
                "The handler ignores its authored operand pointer, writes the "
                "current signed dword at 0x0c2242c8 to the interpreter result "
                "through 0x0c0bb342, then replaces that dword with -1."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "twoIgnoredRuntimeOperandCallCount": len(authored),
        },
        "evidenceBoundary": [
            "The two authored runtime operands are ignored by the native handler and are intentionally not resolved.",
            "The producer and gameplay-domain meaning of 0x0c2242c8 remain unproved.",
            "Runtime execution fails closed until an authoritative producer initializes the dword.",
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
