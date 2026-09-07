#!/usr/bin/env python3
"""Verify operation 0x00e6's exact FIXO attachment-record writes."""

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
    PROJECT_ROOT / "tools/evidence/fixo-attachment-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1577FE,
        50,
        "ef4d5a4fc7a93f4c633ead0d8045ede15a2658e9ba5985bea919331cc830a11d",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "attachmentHelper": (
        0x0C0BEB4A,
        144,
        "c8c5d26f349dabe5db2c83f9b51af3423783b3e0d8862a32c8884b5eb4d4188a",
    ),
    "associatedResolver": (
        0x0C0AAD5A,
        50,
        "4c5affee0a1739c5cc4b01e389b4f6af7d2f6147cd09ad667b8e103fb3466c27",
    ),
    "momtExists": (
        0x0C114314,
        28,
        "8c6e31027a4ae437740f04597870e04214c5e395e171244fd410cdf2a9235bf4",
    ),
    "controlLookupWrapper": (
        0x0C1140E6,
        48,
        "cadf3b2d25bff7e6a6c151392c11876afef2358aedf369a64787d8267eddbf5a",
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
                        or action.get("operationId") != 0x00E6
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "callFileOffset": action.get("callFileOffset"),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x00e6 {name} changed")
    literals = {
        "handlerActorResolver": u32(executable, 0x0C157A34),
        "handlerAttachmentHelper": u32(executable, 0x0C157A44),
        "fixoTag": u32(executable, 0x0C0BEE08),
        "attachmentAssociatedResolver": u32(executable, 0x0C0BEE0C),
        "attachmentMomtExists": u32(executable, 0x0C0BEE10),
        "attachmentControlLookup": u32(executable, 0x0C0BEE14),
        "momtTag": u32(executable, 0x0C114198),
        "controlLookupAssociatedResolver": u32(executable, 0x0C11419C),
        "controlLookupSearch": u32(executable, 0x0C1141A0),
    }
    if literals != {
        "handlerActorResolver": 0x0C153956,
        "handlerAttachmentHelper": 0x0C0BEB4A,
        "fixoTag": 0x4F584946,
        "attachmentAssociatedResolver": 0x0C0AAD5A,
        "attachmentMomtExists": 0x0C114314,
        "attachmentControlLookup": 0x0C1140E6,
        "momtTag": 0x4D544F4D,
        "controlLookupAssociatedResolver": 0x0C0AAD5A,
        "controlLookupSearch": 0x0C10C442,
    }:
        raise ValueError("operation-0x00e6 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def argument_kind_counts(calls: list[dict[str, Any]]) -> list[dict[str, int]]:
    return [
        dict(sorted(Counter(
            call["arguments"][index].get("kind", "unresolved")
            for call in calls
        ).items()))
        for index in range(5)
    ]


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    complete_calls = [call for call in calls if len(call["arguments"]) == 5]
    incomplete_calls = [call for call in calls if len(call["arguments"]) != 5]
    dialogue_calls = [
        call for call in complete_calls if call["dialogueRegion"]
    ]
    kinds = argument_kind_counts(complete_calls)
    expected_kinds = [
        {"constant": 463, "frame-field": 46, "runtime": 12, "scene-field": 42},
        {"constant": 492, "frame-field": 52, "runtime": 7, "scene-field": 12},
        {"constant": 547, "frame-field": 16},
        {"frame-field": 13, "runtime": 408, "static-pointer": 142},
        {"frame-field": 13, "runtime": 407, "static-pointer": 143},
    ]
    control_counts = Counter(
        call["arguments"][2]["value"]
        for call in complete_calls
        if call["arguments"][2].get("kind") == "constant"
    )
    if (
        len(calls) != 569
        or len(complete_calls) != 563
        or len(dialogue_calls) != 70
        or len(incomplete_calls) != 6
        or kinds != expected_kinds
        or control_counts != {0: 45, 5: 4, 11: 2, 12: 120, 18: 375, 20: 1}
    ):
        raise ValueError("operation-0x00e6 authored inventory changed")
    return {
        "schema": "new-yokosuka-fixo-attachment-operation-evidence-v1",
        "status": "exact-native-handler-and-complete-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00E6,
            "operationHex": "0x00e6",
            "argumentCount": 5,
            "handlerAddress": "0x0c1577fe",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "fieldWrites": [
                {
                    "offset": "0x00",
                    "width": 12,
                    "sourceArgument": 4,
                },
                {
                    "offset": "0x0c",
                    "width": 12,
                    "sourceArgument": 3,
                },
                {
                    "offset": "0x18",
                    "width": 12,
                    "sourceArgument": 4,
                },
                {
                    "offset": "0x24",
                    "width": 12,
                    "sourceArgument": 3,
                },
                {
                    "offset": "0x30",
                    "width": 2,
                    "value": 1,
                    "when": "target MOMT and requested control both resolve",
                },
                {
                    "offset": "0x30",
                    "width": 2,
                    "value": 3,
                    "when": "target MOMT or requested control does not resolve",
                },
                {
                    "offset": "0x4c",
                    "width": 4,
                    "sourceArgument": 2,
                    "when": "target MOMT and requested control both resolve",
                },
                {
                    "offset": "0x50",
                    "width": 4,
                    "sourceArgument": 1,
                },
            ],
            "provenBehavior": (
                "Resolves arguments zero and one as scene actors, resolves "
                "the source actor's FIXO record, installs two supplied "
                "three-float vectors into four exact duplicated ranges, "
                "binds the target actor, and selects state word one or three "
                "from exact target MOMT/control lookup results."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(complete_calls),
            "incompleteCallCount": len(incomplete_calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "argumentKindCounts": kinds,
            "constantControlIdCounts": {
                str(value): count
                for value, count in sorted(control_counts.items())
            },
            "incompleteCalls": incomplete_calls,
        },
        "evidenceBoundary": [
            "FIXO and MOMT remain exact native record tags.",
            "The numeric control IDs and state words are not assigned pose or attachment names.",
            "The six zero-argument DSLT calls remain unresolved rather than receiving fabricated operands.",
            "Missing source FIXO state, vector data, or target controller evidence remains an explicit runtime stop.",
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
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
