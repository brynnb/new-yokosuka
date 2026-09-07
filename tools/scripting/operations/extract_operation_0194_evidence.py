#!/usr/bin/env python3
"""Verify operation 0x0194's exact three-route native control boundary."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0194-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16383E,
        74,
        "eed294b73945c38ed1f683619787ed8e471f09dd3e71a6618ed00119deb1d8f2",
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
                        or action.get("operationId") != 0x0194
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


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0194 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29B030),
        "modeZeroHelper": u32(data, 0x0C163920),
        "modeOneHelper": u32(data, 0x0C163924),
        "modeTwoHelper": u32(data, 0x0C163928),
        "resultWriter": u32(data, 0x0C16392C),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C16383E,
        "modeZeroHelper": 0x0C0F2DC0,
        "modeOneHelper": 0x0C0F2DE4,
        "modeTwoHelper": 0x0C0F2E30,
        "resultWriter": 0x0C0BB342,
    }:
        raise ValueError("operation-0x0194 native dependencies changed")
    return {
        name: f"0x{address:08x}"
        for name, address in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [
        call for call in authored
        if len(call["arguments"]) == 2
        and constant(call["arguments"][0]) in (0, 1, 2)
        and constant(call["arguments"][1]) == 0
    ]
    dialogue = [call for call in proven if call["dialogue"]]
    modes = Counter(constant(call["arguments"][0]) for call in proven)
    dialogue_modes = Counter(
        constant(call["arguments"][0]) for call in dialogue
    )
    result_comparison_modes = Counter(
        constant(call["arguments"][0])
        for call in proven
        if call["resultComparison"] is not None
    )
    if (
        len(authored) != 112
        or len(proven) != 112
        or len(dialogue) != 28
        or modes != {0: 20, 1: 22, 2: 70}
        or dialogue_modes != {0: 3, 1: 11, 2: 14}
        or len({
            (call["disc"], call["area"]) for call in proven
        }) != 14
        or result_comparison_modes != {2: 20}
        or any(call["resultTarget"] is not None for call in proven)
    ):
        raise ValueError("operation-0x0194 authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-0194-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0194,
            "operationHex": "0x0194",
            "handlerAddress": "0x0c16383e",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": dependencies,
            "routes": [
                {
                    "mode": 0,
                    "argumentCount": 2,
                    "forwardedArguments": [1],
                    "behavior": "Pass argument one to helper 0x0c0f2dc0.",
                },
                {
                    "mode": 1,
                    "argumentCount": 2,
                    "forwardedArguments": [],
                    "behavior": (
                        "Call helper 0x0c0f2de4; argument one is ignored."
                    ),
                },
                {
                    "mode": 2,
                    "argumentCount": 2,
                    "forwardedArguments": [],
                    "behavior": (
                        "Call helper 0x0c0f2e30 and return its low byte; "
                        "argument one is ignored."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": 14,
            "modeCounts": {
                str(mode): count for mode, count in sorted(modes.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
            "argumentKindCounts": {
                "0": {"constant": 112},
                "1": {"constant": 112},
            },
            "argumentOneValueCounts": {"0": 112},
            "resultComparisonCountsByMode": {
                str(mode): count
                for mode, count in sorted(result_comparison_modes.items())
            },
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only exact two-argument calls with constant modes zero, one, or two and constant-zero argument one receive this semantic.",
            "The three helper calls and the mode-two low-byte result are executable-proven.",
            "The helpers' gameplay-domain meaning remains unknown and each remains a mandatory injected adapter.",
            "No semantics are assigned to unobserved mode values.",
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
