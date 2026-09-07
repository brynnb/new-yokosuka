#!/usr/bin/env python3
"""Verify operation 0x0043's exact object link-field rewrite."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/object-link-field-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C157C88,
        136,
        "6a1745bff3217bf8543afa4de9ddeec4f78ba7a174e6050285ae8af79f818c9e",
    ),
    "objectResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "objectPlusFour": (
        0x0C0AB0E2,
        14,
        "c42ec668a2df1d45e8dbe66ca8a43fe96dad8b10d07483673311df9a3fdcc643",
    ),
    "captureStateA": (
        0x0C0AB02E,
        36,
        "3caf4ca7e9d78567162bd0368d2f6f97e1cc1b49ffe4a36fa573c82eddfbee9c",
    ),
    "reconcileStateA": (
        0x0C0AB052,
        24,
        "6a41a74aa7edc0d49a52ae852b7d328056cd97cac0286bacde00eeab010551b9",
    ),
    "captureStateB": (
        0x0C0AB06A,
        32,
        "42bfcbb9dc106fa7bba23af1ad229d782d03912d8ed2d02460cfbfe519ab69df",
    ),
    "reconcileStateB": (
        0x0C0AB08A,
        24,
        "dcd6c1b3e2e622b0e9292f46c5ec4799644af6f5bac78ce7019dc0e99d918880",
    ),
    "indexedSlotResolver": (
        0x0C0F0C7A,
        40,
        "488e6563a0689b82eb54bc0f03f6d6f5ecad11a2fbbc348f84a991c34ffb31a8",
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
                        or action.get("operationId") != 0x0043
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
            raise ValueError(f"operation-0x0043 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AAEC),
        "objectResolver": u32(data, 0x0C157E5C),
        "objectPlusFour": u32(data, 0x0C157E7C),
        "captureStateA": u32(data, 0x0C157E80),
        "captureStateB": u32(data, 0x0C157E70),
        "indexedSlotResolver": u32(data, 0x0C157E84),
        "reconcileStateA": u32(data, 0x0C157E88),
        "reconcileStateB": u32(data, 0x0C157E8C),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C157C88,
        "objectResolver": 0x0C153956,
        "objectPlusFour": 0x0C0AB0E2,
        "captureStateA": 0x0C0AB02E,
        "captureStateB": 0x0C0AB06A,
        "indexedSlotResolver": 0x0C0F0C7A,
        "reconcileStateA": 0x0C0AB052,
        "reconcileStateB": 0x0C0AB08A,
    }:
        raise ValueError("operation-0x0043 dependencies changed")
    return {
        name: f"0x{address:08x}"
        for name, address in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [call for call in authored if len(call["arguments"]) == 2]
    malformed = [call for call in authored if len(call["arguments"]) != 2]
    dialogue = [call for call in proven if call["dialogue"]]
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in proven
        ).items()))
        for index in range(2)
    }
    targets = Counter()
    slot_values = Counter()
    for call in proven:
        argument = call["arguments"][1]
        if argument["kind"] != "constant":
            targets["runtime"] += 1
            continue
        value = argument["value"] & 0xFFFFFFFF
        signed = value if value < 0x80000000 else value - 0x100000000
        if signed == -1:
            targets["null"] += 1
        elif 0 <= signed < 32:
            targets["indexedSlot"] += 1
            slot_values[signed] += 1
        else:
            targets["resolvedObject"] += 1
    if (
        len(authored) != 887
        or len(proven) != 880
        or len(malformed) != 7
        or len(dialogue) != 27
        or any(call["dialogue"] for call in malformed)
        or argument_kinds != {
            "0": {
                "constant": 593,
                "frame-field": 244,
                "runtime": 39,
                "scene-field": 4,
            },
            "1": {
                "constant": 593,
                "frame-field": 210,
                "runtime": 26,
                "scene-field": 51,
            },
        }
        or targets != {
            "null": 297,
            "indexedSlot": 19,
            "resolvedObject": 277,
            "runtime": 287,
        }
        or slot_values != {0: 3, 31: 16}
        or any(call["resultComparison"] is not None for call in authored)
        or any(call["resultTarget"] is not None for call in authored)
        or len({(call["disc"], call["area"]) for call in proven}) != 43
    ):
        raise ValueError("operation-0x0043 authored inventory changed")

    return {
        "schema": "new-yokosuka-object-link-field-evidence-v1",
        "status": "exact-link-write-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0043,
            "operationHex": "0x0043",
            "handlerAddress": "0x0c157c88",
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
                "Resolve argument zero, capture two distinct three-word "
                "states, resolve argument one as null for -1, an indexed "
                "slot for signed values 0 through 31, or another object "
                "otherwise, write that target into field zero of the source "
                "object-plus-four structure, then reconcile both captured "
                "states in their original order."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "malformedCallCount": len(malformed),
            "dialogueRegionCallCount": len(dialogue),
            "malformedDialogueRegionCallCount": 0,
            "areaCount": 43,
            "argumentKindCounts": argument_kinds,
            "targetRouteCounts": dict(targets),
            "observedConstantSlotCounts": {
                str(index): count
                for index, count in sorted(slot_values.items())
            },
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the 880 exact two-argument calls are promoted.",
            "Seven zero-argument scanner detections remain unresolved.",
            "The two capture/reconcile algorithms remain mandatory low-level adapters.",
            "The field's ownership and higher-level parent, attachment, or targeting meaning are not inferred.",
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
