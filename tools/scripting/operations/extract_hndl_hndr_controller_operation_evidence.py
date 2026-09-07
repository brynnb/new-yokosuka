#!/usr/bin/env python3
"""Verify operation 0x00df's HNDL/HNDR controller request contract."""

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
    PROJECT_ROOT
    / "tools/evidence/hndl-hndr-controller-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C165190,
        58,
        "3226121016e88bb09989d0151b1f0aa9f9a68a1fa12a320c4f1799079d01997f",
    ),
    "recordResolver": (
        0x0C165158,
        56,
        "c18f3f4c8bd977202c2dee2bc6d33d75d738d7578106870dd74da3b5138e40dd",
    ),
    "requestGate": (
        0x0C0DEBE0,
        70,
        "7c38361e8e0ecc4793b9c3649692452205cc9b9bf2224e632d671fc8c4cbcf30",
    ),
    "primaryControllerClear": (
        0x0C0DEC4E,
        16,
        "20006889e295e9a21e55e6cc4bf415b7aaee9585868247b901a313bc526186a3",
    ),
    "controllerInitializer": (
        0x0C0DEC66,
        328,
        "9c013a3263e7f78a9535a47b7c42a569228b3f3fa40d617b765d62ac07f28b05",
    ),
}


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
                        or action.get("operationId") != 0x00DF
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


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x00df {name} changed")
    dependencies = {
        "requestGate": u32(executable, 0x0C165270),
        "primaryControllerClear": u32(executable, 0x0C165274),
        "controllerRangeList": u32(executable, 0x0C0DED54),
    }
    if dependencies != {
        "requestGate": 0x0C0DEBE0,
        "primaryControllerClear": 0x0C0DEC4E,
        "controllerRangeList": 0x0C216B08,
    }:
        raise ValueError("operation-0x00df dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in dependencies.items()
    }


def kind_counts(
    calls: list[dict[str, Any]],
    argument_index: int,
) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][argument_index]["kind"] for call in calls
    ).items()))


def constant_counts(
    calls: list[dict[str, Any]],
    argument_index: int,
) -> dict[str, int]:
    counts = Counter(
        call["arguments"][argument_index]["value"]
        for call in calls
        if call["arguments"][argument_index]["kind"] == "constant"
    )
    return {
        str(value): count for value, count in sorted(counts.items())
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    dependencies = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if len(call["arguments"]) == 4]
    malformed = [call for call in calls if len(call["arguments"]) != 4]
    dialogue = [call for call in selected if call["dialogueRegion"]]
    all_dialogue = [call for call in calls if call["dialogueRegion"]]
    if (
        len(calls) != 2305
        or len(selected) != 2303
        or len(malformed) != 2
        or len(dialogue) != 228
        or len(all_dialogue) != 229
    ):
        raise ValueError("operation-0x00df authored inventory changed")
    kinds = {
        str(index): kind_counts(selected, index) for index in range(4)
    }
    if kinds != {
        "0": {"constant": 2014, "frame-field": 289},
        "1": {"constant": 2299, "frame-field": 4},
        "2": {"constant": 2303},
        "3": {"constant": 2303},
    }:
        raise ValueError("operation-0x00df argument bindings changed")
    side_counts = constant_counts(selected, 2)
    if side_counts != {"0": 1090, "1": 1213}:
        raise ValueError("operation-0x00df side selectors changed")
    mode_counts = constant_counts(selected, 1)
    if mode_counts != {
        "0": 1046,
        "1": 1003,
        "4294967295": 250,
    }:
        raise ValueError("operation-0x00df modes changed")
    return {
        "schema": "new-yokosuka-hndl-hndr-controller-operation-evidence-v1",
        "status": "exact-native-controller-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00DF,
            "operationHex": "0x00df",
            "handlerAddress": "0x0c165190",
            "recordTags": {
                "zeroSideSelector": "HNDL",
                "nonzeroSideSelector": "HNDR",
            },
            "gate": (
                "The signed low byte of argument one is admitted when the "
                "primary controller exists and the mode is nonnegative, or "
                "when the secondary controller exists and the mode is "
                "nonpositive."
            ),
            "controllerRangeSelector": (
                "argument three's signed low word"
            ),
            "controllerRangeListAddress": "0x0c216b08",
            "modeByteOffset": "record+0x0a68",
            "enabledByteOffset": "record+0x0a69",
            "recordFieldsClearedOnAdmission": [
                "record+0x49 byte",
                "record+0x4a word",
                "record+0x0a4c dword",
            ],
            "selectedConfigurationMapping": {
                "selectedConfigurationPointer": (
                    "stored unchanged in controller state"
                ),
                "selected+0x20 dword": "controller length dword",
                "selected+0x24 low word": (
                    "controller secondary parameter word"
                ),
                "selected+0x28 address": (
                    "controller continuation pointer"
                ),
            },
            "primaryControllerOffsetsCleared": [
                "primary+0x08",
                "primary+0x0c",
                "primary+0x10",
            ],
            "nativeDependencies": dependencies,
            "provenBehavior": (
                "Resolves HNDL or HNDR by argument two, applies the exact "
                "primary/secondary pointer gate, and when admitted initializes "
                "the range-table-selected controller fields from argument "
                "three while writing argument one's low byte and enabled byte "
                "one and clearing the record activity fields. It then clears "
                "three dwords in a present primary controller regardless of "
                "gate admission."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "selectedCallCount": len(selected),
            "malformedCallCount": len(malformed),
            "dialogueRegionCallCount": len(dialogue),
            "totalDialogueRegionCallCount": len(all_dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentKindCounts": kinds,
            "constantModeCounts": mode_counts,
            "constantSideSelectorCounts": side_counts,
            "selectorCounts": constant_counts(selected, 3),
        },
        "evidenceBoundary": [
            "HNDL and HNDR remain literal native record tags.",
            "Each present runtime record must provide exact primary and secondary controller availability.",
            "An admitted selector requires an exact range-resolution result, including an explicit no-match result.",
            "Range-selected record fields remain neutral dword and word values.",
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
