#!/usr/bin/env python3
"""Verify operation 0x018e's exact fixed global byte write."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-018e-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1637FC,
        14,
        "27cc8ca68290aa4e5179d68f9a4598e0983749aa0fc3fd4848fde63dffc47475",
    ),
    "byteWriter": (
        0x0C0AD794,
        6,
        "c399938d2e941a046874a5b207323a4ca550744eff8a5ffbf5cc836eea151ce6",
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
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x018E
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x018e {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29B018),
        "byteWriter": u32(data, 0x0C163914),
        "fixedByteAddress": u32(data, 0x0C0AD7A4),
    }
    expected = {
        "handlerTableEntry": 0x0C1637FC,
        "byteWriter": 0x0C0AD794,
        "fixedByteAddress": 0x0C201FE0,
    }
    if dependencies != expected:
        raise ValueError("operation-0x018e native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    dialogue = [call for call in authored if call["dialogue"]]
    values = Counter(call["arguments"][0].get("value") for call in authored)
    dialogue_values = Counter(
        call["arguments"][0].get("value") for call in dialogue
    )
    if (
        len(authored) != 124
        or any(len(call["arguments"]) != 1 for call in authored)
        or any(
            call["arguments"][0].get("kind") != "constant"
            for call in authored
        )
        or len(dialogue) != 30
        or values != {0: 55, 1: 69}
        or dialogue_values != {0: 15, 1: 15}
        or any(call["resultComparison"] is not None for call in authored)
        or any(call["resultTarget"] is not None for call in authored)
    ):
        raise ValueError("operation-0x018e authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-018e-evidence-v1",
        "status": "exact-fixed-byte-write-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x018E,
            "operationHex": "0x018e",
            "handlerAddress": "0x0c1637fc",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "fixedByteAddress": "0x0c201fe0",
            "provenBehavior": (
                "Write argument zero's low byte to fixed global byte "
                "0x0c201fe0. Every authored argument is exactly zero or one."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(authored),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in authored
            }),
            "valueCounts": {
                str(value): count for value, count in sorted(values.items())
            },
            "dialogueValueCounts": {
                str(value): count
                for value, count in sorted(dialogue_values.items())
            },
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the two authored values zero and one receive this semantic.",
            "The absolute address, byte width, and unchanged low-byte write are executable-proven.",
            "The byte's owner and consumer-side meaning remain unknown.",
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
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
