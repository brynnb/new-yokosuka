#!/usr/bin/env python3
"""Verify operation 0x013f's exact object-associated OSAG float write."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/osag-float-parameter-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29AEDC,
        4,
        "487b3af39320fcb385b8d96f79ae711bdae77abae849567643e418f3d507914a",
    ),
    "handler": (
        0x0C131B44,
        50,
        "c7b14c5fb3c7697c4e1bf780b917fdeedd5e9ad68a6d931634752be647d845d5",
    ),
    "objectResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "associatedRecordResolver": (
        0x0C0AAD5A,
        50,
        "4c5affee0a1739c5cc4b01e389b4f6af7d2f6147cd09ad667b8e103fb3466c27",
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
                        or action.get("operationId") != 0x013F
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
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
            raise ValueError(f"operation-0x013f {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AEDC),
        "objectResolver": u32(data, 0x0C131BFC),
        "osagComponentTag": u32(data, 0x0C131C00),
        "associatedRecordResolver": u32(data, 0x0C131C04),
    }
    expected = {
        "handlerTableEntry": 0x0C131B44,
        "objectResolver": 0x0C153956,
        "osagComponentTag": 0x4741534F,
        "associatedRecordResolver": 0x0C0AAD5A,
    }
    if dependencies != expected:
        raise ValueError("operation-0x013f native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    calls = operation_calls(event_ir)
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }
    value_counts = {
        f"0x{word:08x}": count
        for word, count in sorted(Counter(
            call["arguments"][1]["value"] for call in calls
        ).items())
    }
    function_counts = dict(sorted(Counter(
        call["functionFileOffset"] for call in calls
    ).items()))
    call_offsets = [call["callFileOffset"] for call in calls]
    expected_offsets = [
        "0x7996", "0x7a9a", "0x7b32", "0x7ce6", "0x82d6",
        "0x85ae", "0x9b52", "0xa05e", "0xbcd6", "0xbd1e",
        "0xbef2", "0xbffa", "0xc28a", "0xc54a", "0x2000e",
    ]
    if (
        len(calls) != 15
        or Counter(len(call["arguments"]) for call in calls) != {2: 15}
        or argument_kinds != {
            "0": {"constant": 14, "frame-field": 1},
            "1": {"constant": 15},
        }
        or Counter(
            call["arguments"][0].get("ascii")
            for call in calls
            if call["arguments"][0]["kind"] == "constant"
        ) != {"SORY": 14}
        or value_counts != {
            "0x3c23d70a": 1,
            "0x3dcccccd": 2,
            "0x3df5c28f": 1,
            "0x3e0f5c29": 1,
            "0x3f800000": 5,
            "0x3fb33333": 1,
            "0x40400000": 4,
        }
        or {(call["disc"], call["area"]) for call in calls} != {(1, "OP00")}
        or any(call["dialogue"] for call in calls)
        or any(call["resultComparison"] is not None for call in calls)
        or any(call["resultTarget"] is not None for call in calls)
        or call_offsets != expected_offsets
    ):
        raise ValueError("operation-0x013f authored inventory changed")

    return {
        "schema": "new-yokosuka-osag-float-parameter-evidence-v1",
        "status": "exact-native-osag-float-word-write-and-full-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x013F,
            "operationHex": "0x013f",
            "argumentCount": 2,
            "handlerAddress": "0x0c131b44",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "componentTag": "OSAG",
            "floatWordOffset": "0x01e8",
            "provenBehavior": (
                "Resolve argument zero as an object, resolve that object's "
                "associated OSAG record, and copy argument one's exact "
                "32-bit float word to OSAG +0x01e8. A missing object or "
                "associated OSAG record returns without mutation."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCounts": {"1:OP00": 15},
            "dialogueRegionCallCount": 0,
            "functionCounts": function_counts,
            "argumentKindCounts": argument_kinds,
            "constantObjectTagCounts": {"SORY": 14},
            "floatWordCounts": value_counts,
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
            "callFileOffsets": call_offsets,
        },
        "evidenceBoundary": [
            "The value is retained as the exact authored IEEE-754 word.",
            "The executable proves the OSAG field identity and write, but not a presentation-level name such as wind, stiffness, gravity, or damping.",
            "SORY is corpus evidence, not a hard-coded runtime identity.",
            "A missing object or OSAG record is an exact native no-op; unknown browser-side availability remains distinct from that proven no-op.",
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
    print(f"Wrote {args.out}: 15 exact calls")


if __name__ == "__main__":
    main()
