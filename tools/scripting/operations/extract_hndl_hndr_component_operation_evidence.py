#!/usr/bin/env python3
"""Verify operation 0x00eb's HNDL/HNDR component-write contract."""

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
    / "tools/evidence/hndl-hndr-component-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1652FE,
        148,
        "40616b2c86c07f618ab80a0f21280b8c"
        "bb34e68868cc24da458a98b68869f3e1",
    ),
    "recordResolver": (
        0x0C165158,
        56,
        "c18f3f4c8bd977202c2dee2bc6d33d75"
        "d738d7578106870dd74da3b5138e40dd",
    ),
    "pointer10VectorRead": (
        0x0C0DEC26,
        40,
        "38af5b2579955b5e6d54dfe21a8731c0"
        "7e7cdeb81c082e0b402b45112800b823",
    ),
    "pointer10VectorWrite": (
        0x0C0DEC4E,
        14,
        "fc74afe873da2f97396acf6940aaca536"
        "88d3c9c9068a35009ea0d75ada2d671",
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
                        or action.get("operationId") != 0x00EB
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


def counts_by_kind(
    calls: list[dict[str, Any]],
    argument_index: int,
) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][argument_index]["kind"] for call in calls
    ).items()))


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x00eb {name} changed")
    dependencies = {
        "handlerTableEntry": u32(executable, 0x0C29AD8C),
        "objectResolver": u32(executable, 0x0C165238),
        "rightRecordResolver": u32(executable, 0x0C165268),
        "leftRecordResolver": u32(executable, 0x0C16526C),
        "pointer10VectorRead": u32(executable, 0x0C1654E8),
        "pointer10VectorWrite": u32(executable, 0x0C1654EC),
        "leftRecordTag": u32(executable, 0x0C0DE6C4),
        "associatedRecordLookup": u32(executable, 0x0C0DE6C8),
        "rightRecordTag": u32(executable, 0x0C0DE6CC),
    }
    expected = {
        "handlerTableEntry": 0x0C1652FE,
        "objectResolver": 0x0C153956,
        "rightRecordResolver": 0x0C0DE67A,
        "leftRecordResolver": 0x0C0DE672,
        "pointer10VectorRead": 0x0C0DEC26,
        "pointer10VectorWrite": 0x0C0DEC4E,
        "leftRecordTag": 0x4C444E48,
        "associatedRecordLookup": 0x0C0AAD5A,
        "rightRecordTag": 0x52444E48,
    }
    if dependencies != expected:
        raise ValueError("operation-0x00eb dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in dependencies.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    dependencies = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [
        call for call in calls
        if (
            len(call["arguments"]) == 4
            and call["arguments"][2].get("kind") == "constant"
            and call["arguments"][2].get("value") in {0x15, 0x2A}
        )
    ]
    dialogue = [call for call in selected if call["dialogueRegion"]]
    argument_kinds = {
        str(index): counts_by_kind(selected, index)
        for index in range(4)
    }
    if (
        len(calls) != 566
        or len(selected) != 566
        or len(dialogue) != 40
        or Counter(
            call["arguments"][2]["value"] for call in selected
        ) != {0x15: 563, 0x2A: 3}
        or argument_kinds != {
            "0": {"constant": 552, "frame-field": 14},
            "1": {"constant": 533, "frame-field": 30, "runtime": 3},
            "2": {"constant": 566},
            "3": {
                "frame-address": 375,
                "frame-field": 14,
                "static-pointer": 177,
            },
        }
        or Counter(
            call["arguments"][1]["value"]
            for call in dialogue
        ) != {1: 28, 0: 12}
        or any(
            call["arguments"][0].get("ascii") != "AKIR"
            or call["arguments"][2].get("value") != 0x15
            for call in dialogue
        )
    ):
        raise ValueError("operation-0x00eb authored inventory changed")
    return {
        "schema": (
            "new-yokosuka-hndl-hndr-component-operation-evidence-v1"
        ),
        "status": "exact-native-contract-and-all-authored-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00EB,
            "operationHex": "0x00eb",
            "argumentCount": 4,
            "handlerAddress": "0x0c1652fe",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "recordTags": {
                "zeroSideSelector": "HNDL",
                "nonzeroSideSelector": "HNDR",
            },
            "targetPointerOffset": "record+0x10",
            "targetVectorOffsets": [
                "pointer+0x08",
                "pointer+0x0c",
                "pointer+0x10",
            ],
            "componentBits": {
                "0x01": "replace component zero",
                "0x02": "raw-add component zero",
                "0x04": "replace component one",
                "0x08": "raw-add component one",
                "0x10": "replace component two",
                "0x20": "raw-add component two",
            },
            "authoredMasks": {
                "0x00000015": "replace all three components",
                "0x0000002a": "raw-add all three components",
            },
            "dependencies": dependencies,
            "provenBehavior": (
                "Resolves argument zero and selects its literal HNDL record "
                "when argument one is zero or HNDR otherwise. A present "
                "record reads three raw words through its pointer at +0x10. "
                "Argument-two bits 0x01/0x04/0x10 replace corresponding "
                "components from the argument-three vector; bits "
                "0x02/0x08/0x20 add the raw 32-bit words. The result writes "
                "back through the same +0x10 pointer. A missing object or "
                "record is a native no-op, and a null +0x10 pointer receives "
                "no write."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "unresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "dialogueAreaCount": len({
                (call["disc"], call["area"]) for call in dialogue
            }),
            "argumentKindCounts": argument_kinds,
            "maskCounts": {
                "0x00000015": 563,
                "0x0000002a": 3,
            },
        },
        "evidenceBoundary": [
            "HNDL and HNDR remain the executable's literal record tags.",
            "The three target fields retain exact pointer-relative offsets.",
            "The add routes use raw 32-bit integer addition, not float32.",
            "No coordinate-space name or gameplay owner is inferred.",
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
