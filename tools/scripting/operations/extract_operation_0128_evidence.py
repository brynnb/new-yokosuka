#!/usr/bin/env python3
"""Verify operation 0x0128's exact authored environment-preset routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0128-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "operationHandler": (
        0x0C16B0A2, 12,
        "334e73498923c77f05204a0e27e59f403d442205f56388a8b201377e65a89f81",
    ),
    "presetSelector": (
        0x0C16AD1E, 42,
        "65eac061137598a3091e1b0e0d4f214d06679f4c8794c89318f938e50d2de832",
    ),
    "presetApplicator": (
        0x0C16AC8A, 148,
        "d510aebd131734ac30dedf7e8173dc537ddc991e7ef6801f1adebc795ad123f9",
    ),
    "tagResolver": (
        0x0C0F279A, 64,
        "106eed1a6eed4499524a28e44ae6336c3899b82909acf0b5d6bd0aad0edc38fd",
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
                        and action.get("operationId") == 0x0128
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
        if hashlib.sha256(runtime_slice(data, address, size)).hexdigest() != expected:
            raise ValueError(f"operation-0x0128 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AE80),
        "currentMapAccessor": u32(data, 0x0C16AED0),
        "outerTagText": u32(data, 0x0C16AED4),
        "tagResolver": u32(data, 0x0C16AED8),
        "fogTag": u32(data, 0x0C16AEA4),
        "backTag": u32(data, 0x0C16AEA8),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C16B0A2,
        "currentMapAccessor": 0x0C0F0A1C,
        "outerTagText": 0x0C279790,
        "tagResolver": 0x0C0F279A,
        "fogTag": 0x20474F46,
        "backTag": 0x4B434142,
    }:
        raise ValueError("operation-0x0128 dependencies changed")


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(data)
    calls = operation_calls(event_ir)
    modes = Counter(call["arguments"][0].get("value") for call in calls)
    if (
        len(calls) != 82
        or modes != {0: 80, 1: 2}
        or len({(call["disc"], call["area"]) for call in calls}) != 70
        or any(call["dialogue"] for call in calls)
        or any(len(call["arguments"]) != 1 for call in calls)
        or any(call["arguments"][0].get("kind") != "constant" for call in calls)
        or any(call["resultTarget"] is not None for call in calls)
        or any(call["resultComparison"] is not None for call in calls)
    ):
        raise ValueError("operation-0x0128 authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-0128-evidence-v1",
        "status": "exact-environment-preset-selection-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0128,
            "operationHex": "0x0128",
            "handlerAddress": "0x0c16b0a2",
            "authoredPresetIndices": [0, 1],
            "outerContainerTag": "FOG ",
            "recordPayloadOffset": 8,
            "recordStrideBytes": 80,
            "nestedTags": ["FOG ", "BACK"],
            "fogGlobalAddresses": [
                "0x0c20bc44", "0x0c20bc48", "0x0c20bc4c",
                "0x0c20bc50", "0x0c20bc54",
            ],
            "backgroundIndexedWordCount": 4,
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "provenBehavior": (
                "Selects the 80-byte record at outer FOG payload + 8 + "
                "index * 80, resolves its nested FOG and BACK records, "
                "installs the exact five-word fog state and four indexed "
                "background words, then applies the remaining BACK fields."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": 70,
            "presetIndexCounts": {str(key): value for key, value in modes.items()},
            "dialogueRegionCallCount": 0,
            "resultConsumerCount": 0,
        },
        "evidenceBoundary": [
            "Only exact authored indices zero and one are promoted.",
            "Record stride, tag traversal, fog globals, and background call sequence are executable-proven.",
            "The browser retains the preset request as a typed presentation-state mutation until map FOG/BACK payload extraction is connected.",
            "No unsupported index is treated as a no-op or default preset.",
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
