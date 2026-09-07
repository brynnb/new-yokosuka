#!/usr/bin/env python3
"""Verify operation 0x008f's exact two-route native orchestration."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-008f-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C17355C,
        204,
        "4e5a54c4a5859d079251d28259df2e9d05dbc131939934f7517c0917378e4f62",
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
                        or action.get("operationId") != 0x008F
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
            raise ValueError(f"operation-0x008f {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AC1C),
        "objectResolver": u32(data, 0x0C1735A0),
        "zeroStage0": u32(data, 0x0C1735C0),
        "zeroStage1": u32(data, 0x0C1735C4),
        "identityCapture": u32(data, 0x0C173760),
        "descriptorPrepare": u32(data, 0x0C173764),
        "currentOwnerGlobal": u32(data, 0x0C173768),
        "currentOwnerResolver": u32(data, 0x0C17376C),
        "descriptorApply": u32(data, 0x0C173770),
        "gateQuery": u32(data, 0x0C173774),
        "identityReconcile": u32(data, 0x0C173778),
        "finalizeStage0": u32(data, 0x0C17377C),
        "finalizeStage1": u32(data, 0x0C173780),
    }
    expected = {
        "handlerTableEntry": 0x0C17355C,
        "objectResolver": 0x0C153956,
        "zeroStage0": 0x0C0E33EC,
        "zeroStage1": 0x0C0D9C08,
        "identityCapture": 0x0C0E3498,
        "descriptorPrepare": 0x0C0ADDEE,
        "currentOwnerGlobal": 0x0C217488,
        "currentOwnerResolver": 0x0C09766A,
        "descriptorApply": 0x0C0E3402,
        "gateQuery": 0x0C114314,
        "identityReconcile": 0x0C113A96,
        "finalizeStage0": 0x0C0ADCAC,
        "finalizeStage1": 0x0C131806,
    }
    if dependencies != expected:
        raise ValueError("operation-0x008f native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def kind_counts(
    calls: list[dict[str, Any]],
) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(3)
    }


def constant_zero(call: dict[str, Any], index: int) -> bool:
    argument = call["arguments"][index]
    return (
        argument.get("kind") == "constant"
        and argument.get("value") == 0
    )


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    selected = [
        call for call in authored if len(call["arguments"]) == 3
    ]
    dialogue = [call for call in selected if call["dialogue"]]
    malformed_dialogue = [
        call for call in authored
        if call["dialogue"] and len(call["arguments"]) != 3
    ]
    arguments = kind_counts(selected)
    dialogue_arguments = kind_counts(dialogue)
    if (
        len(authored) != 413
        or Counter(len(call["arguments"]) for call in authored)
            != {0: 3, 3: 410}
        or len(selected) != 410
        or len(dialogue) != 34
        or len(malformed_dialogue) != 3
        or arguments != {
            "0": {
                "constant": 224,
                "frame-field": 42,
                "unresolved": 144,
            },
            "1": {
                "constant": 174,
                "frame-field": 54,
                "scene-field": 4,
                "static-pointer": 178,
            },
            "2": {"constant": 266, "operation-result": 144},
        }
        or dialogue_arguments != {
            "0": {"constant": 34},
            "1": {"constant": 10, "static-pointer": 24},
            "2": {"constant": 34},
        }
        or sum(constant_zero(call, 1) for call in selected) != 84
        or sum(constant_zero(call, 1) for call in dialogue) != 10
        or sum(constant_zero(call, 2) for call in selected) != 266
        or any(call["resultComparison"] is not None for call in authored)
        or any(call["resultTarget"] is not None for call in authored)
    ):
        raise ValueError("operation-0x008f authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-008f-evidence-v1",
        "status": "exact-native-orchestration-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x008F,
            "operationHex": "0x008f",
            "handlerAddress": "0x0c17355c",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "routes": [
                {
                    "condition": "argument one is zero",
                    "behavior": (
                        "Resolve argument zero as an object, invoke native "
                        "stage 0x0c0e33ec, then tail-call stage 0x0c0d9c08 "
                        "with that same resolved object."
                    ),
                },
                {
                    "condition": "argument one is nonzero",
                    "behavior": (
                        "Capture identity through 0x0c0e3498, prepare through "
                        "0x0c0addee, resolve the current owner's dword +0x1c, "
                        "and pass the resolved object, owner field, argument "
                        "one, and argument two to 0x0c0e3402. If gate "
                        "0x0c114314 returns nonzero, capture identity again, "
                        "call 0x0c113a96 only when it changed, then invoke "
                        "0x0c0adcac and 0x0c131806 in that order."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(selected),
            "malformedCallCount": len(authored) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "malformedDialogueRegionCallCount": len(malformed_dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentKindCounts": arguments,
            "dialogueArgumentKindCounts": dialogue_arguments,
            "zeroDescriptorCount": sum(
                constant_zero(call, 1) for call in selected
            ),
            "dialogueZeroDescriptorCount": sum(
                constant_zero(call, 1) for call in dialogue
            ),
            "constantZeroValueCount": sum(
                constant_zero(call, 2) for call in selected
            ),
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the 410 exact three-argument calls receive this semantic; the three malformed zero-argument dialogue calls remain unresolved.",
            "All ten subordinate calls retain mandatory low-level adapters and their executable-proven order.",
            "A configured null object is distinct from unavailable object state because the native resolver can return zero and still passes it onward.",
            "Identity values are compared only for exact equality; no object ownership, animation, presentation, or descriptor meaning is inferred.",
            "Argument one is called a descriptor only as a neutral data-flow label, and argument two remains a raw 32-bit word.",
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
