#!/usr/bin/env python3
"""Verify operation 0x005e's HNDL/HNDR vector-table install contract."""

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
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/hndl-hndr-vector-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C165480,
        44,
        "20af0e80dd3c5e89a58a7da1e539deeda88b06018e33bd0192eb2d812766ce55",
    ),
    "recordResolver": (
        0x0C165158,
        56,
        "c18f3f4c8bd977202c2dee2bc6d33d75d738d7578106870dd74da3b5138e40dd",
    ),
    "vectorInstaller": (
        0x0C0DEE94,
        98,
        "85630f669efc2a1fcfbaf9d9f63099a59e157012d9aeb93631e5625fa5d8c578",
    ),
    "slotIndexTable": (
        0x0C288EC4,
        38,
        "d4a97834e6b3a863805a21d6429a080e66eb749507cf3e5925f064ae55e3f237",
    ),
}
INSTALLED_SLOT_INDICES = [
    31, 30, 29, 35, 34, 33, 32, 39, 38, 37,
    36, 43, 42, 41, 40, 47, 46, 45, 44,
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
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
                        or action.get("operationId") != 0x005E
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x005e {name} changed")
    dependencies = {
        "objectResolver": u32(executable, 0x0C165238),
        "rightRecordResolver": u32(executable, 0x0C165268),
        "leftRecordResolver": u32(executable, 0x0C16526C),
        "vectorInstaller": u32(executable, 0x0C1654FC),
        "leftRecordTag": u32(executable, 0x0C0DE6C4),
        "associatedRecordLookup": u32(executable, 0x0C0DE6C8),
        "rightRecordTag": u32(executable, 0x0C0DE6CC),
        "slotIndexTable": u32(executable, 0x0C0DEFB4),
    }
    expected = {
        "objectResolver": 0x0C153956,
        "rightRecordResolver": 0x0C0DE67A,
        "leftRecordResolver": 0x0C0DE672,
        "vectorInstaller": 0x0C0DEE94,
        "leftRecordTag": 0x4C444E48,
        "associatedRecordLookup": 0x0C0AAD5A,
        "rightRecordTag": 0x52444E48,
        "slotIndexTable": 0x0C288EC4,
    }
    if dependencies != expected:
        raise ValueError("operation-0x005e dependencies changed")
    indices = list(struct.unpack(
        "<19H",
        runtime_slice(executable, RANGES["slotIndexTable"][0], 38),
    ))
    if indices != INSTALLED_SLOT_INDICES:
        raise ValueError("operation-0x005e slot indices changed")
    return {
        "dependencies": {
            name: f"0x{value:08x}"
            for name, value in dependencies.items()
        },
        "installedSlotIndices": indices,
    }


def counts_by_kind(
    calls: list[dict[str, Any]],
    argument_index: int,
) -> dict[str, int]:
    counts = Counter(
        call["arguments"][argument_index]["kind"] for call in calls
    )
    return dict(sorted(counts.items()))


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if len(call["arguments"]) == 4]
    malformed = [call for call in calls if len(call["arguments"]) != 4]
    if len(calls) != 1498 or len(selected) != 1496 or len(malformed) != 2:
        raise ValueError("operation-0x005e authored inventory changed")
    dialogue = [call for call in selected if call["dialogueRegion"]]
    if len(dialogue) != 84:
        raise ValueError("operation-0x005e dialogue inventory changed")
    side_values = Counter(
        call["arguments"][1]["value"]
        for call in selected
        if call["arguments"][1]["kind"] == "constant"
    )
    if side_values != {0: 660, 1: 782}:
        raise ValueError("operation-0x005e side inventory changed")
    argument_kinds = {
        str(index): counts_by_kind(selected, index)
        for index in range(4)
    }
    expected_kinds = {
        "0": {"constant": 1402, "frame-field": 86, "runtime": 8},
        "1": {"constant": 1442, "frame-field": 13, "runtime": 41},
        "2": {"frame-field": 12, "static-pointer": 1484},
        "3": {"constant": 1485, "frame-field": 3, "runtime": 8},
    }
    if argument_kinds != expected_kinds:
        raise ValueError("operation-0x005e argument bindings changed")
    dialogue_duration_values = Counter(
        call["arguments"][3]["value"] for call in dialogue
    )
    if dialogue_duration_values != {0: 60, 5: 6, 10: 18}:
        raise ValueError("operation-0x005e dialogue durations changed")
    return {
        "schema": "new-yokosuka-hndl-hndr-vector-operation-evidence-v1",
        "status": "exact-native-vector-install-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x005E,
            "operationHex": "0x005e",
            "handlerAddress": "0x0c165480",
            "recordTags": {
                "zeroSideSelector": "HNDL",
                "nonzeroSideSelector": "HNDR",
            },
            "vectorSlotCount": 71,
            "sourceVectorCount": 19,
            "activeByteOffset": "record+0x49",
            "durationWordOffset": "record+0x4a",
            "vectorSlotsOffset": "record+0x4c",
            "sourceVectorStride": 12,
            **native,
            "provenBehavior": (
                "Resolves argument zero and selects its HNDL record when "
                "argument one is zero or HNDR otherwise. A present record "
                "sets byte +0x49 to one, clears 71 three-dword vector slots "
                "starting at +0x4c, copies 19 consecutive source vectors "
                "from argument two into the executable-fixed slot indices, "
                "and stores argument three's signed low word clamped to at "
                "least one at +0x4a."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "selectedCallCount": len(selected),
            "malformedCallCount": len(malformed),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentKindCounts": argument_kinds,
            "constantSideSelectorCounts": {
                str(value): count
                for value, count in sorted(side_values.items())
            },
            "dialogueRegionDurationCounts": {
                str(value): count
                for value, count in sorted(
                    dialogue_duration_values.items()
                )
            },
        },
        "evidenceBoundary": [
            "HNDL and HNDR remain literal native record tags; no anatomical or gameplay label is assigned.",
            "The 19 source vectors remain raw three-dword values.",
            "Runtime source pointers require their exact 19-vector table and are never substituted.",
            "Missing objects or HNDL/HNDR records preserve the native no-op.",
            "Two zero-argument scanner detections remain malformed and unresolved.",
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
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['selectedCallCount']} selected calls"
    )


if __name__ == "__main__":
    main()
