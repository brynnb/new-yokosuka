#!/usr/bin/env python3
"""Verify operation 0x0132's exact OSAG node and actor-flag writes."""

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
    PROJECT_ROOT / "tools/evidence/actor-osag-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C131AB6,
        34,
        "94489d7a618b6c8e02029975ef15c1567871b762e6e93a987db38926e5c65744",
    ),
    "osagHelper": (
        0x0C131AD8,
        58,
        "9cf2c783612b7ac4e487fc7b339147e01f204bc0356948e058fb61b0c8a22460",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "associatedResolver": (
        0x0C0AAD5A,
        50,
        "4c5affee0a1739c5cc4b01e389b4f6af7d2f6147cd09ad667b8e103fb3466c27",
    ),
    "actorFlagHelper": (
        0x0C0ADFDC,
        38,
        "79104229b3cf76a78d9eed11e9cd4d4bab2b2054acb0cc5680c39e9b91ae531d",
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
                        or action.get("operationId") != 0x0132
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


def fourcc(value: int) -> str:
    return "".join(chr((value >> (8 * index)) & 0xff) for index in range(4))


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0132 {name} changed")
    literals = {
        "actorResolver": u32(executable, 0x0C131B30),
        "osagTag": u32(executable, 0x0C131B34),
        "associatedResolver": u32(executable, 0x0C131B38),
        "actorFlagHelper": u32(executable, 0x0C131B40),
    }
    if literals != {
        "actorResolver": 0x0C153956,
        "osagTag": 0x4741534F,
        "associatedResolver": 0x0C0AAD5A,
        "actorFlagHelper": 0x0C0ADFDC,
    }:
        raise ValueError("operation-0x0132 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    kind_counts = Counter(
        call["arguments"][0].get("kind")
        for call in calls
        if len(call["arguments"]) == 1
    )
    tag_counts = Counter(
        fourcc(call["arguments"][0]["value"])
        for call in calls
        if (
            len(call["arguments"]) == 1
            and call["arguments"][0].get("kind") == "constant"
        )
    )
    if (
        len(calls) != 368
        or len(dialogue_calls) != 69
        or any(len(call["arguments"]) != 1 for call in calls)
        or kind_counts != {"constant": 332, "frame-field": 36}
        or tag_counts != {
            "AKIR": 291,
            "KISY": 7,
            "SYZU": 6,
            "SINF": 4,
            "TAIJ": 4,
            "INE_": 3,
            "MEGM": 3,
            "MEYS": 2,
            "TOM_": 2,
            "ENKI": 2,
            "NGSM": 2,
            "FUKU": 2,
            "ISYM": 1,
            "NMNO": 1,
            "YAMA": 1,
            "KAME": 1,
        }
    ):
        raise ValueError("operation-0x0132 authored inventory changed")
    return {
        "schema": "new-yokosuka-actor-osag-operation-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0132,
            "operationHex": "0x0132",
            "argumentCount": 1,
            "handlerAddress": "0x0c131ab6",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "osagNodeRoute": {
                "recordTag": "OSAG",
                "headPointerOffset": "0x01f0",
                "nodeStateByteOffset": "0x0f",
                "nodeStatePreserveMask": "0x0f",
                "nodeStateSetMask": "0x80",
                "nextNodePointerOffset": "0x0104",
            },
            "actorFlagRoute": {
                "actorOwnerPointerOffset": "0x40",
                "ownerFlagPointerOffset": "0x3c",
                "flagMask": "0x10",
                "action": "set",
            },
            "provenBehavior": (
                "Resolves the actor, walks its optional OSAG node list and "
                "rewrites every node byte as (old & 0x0f) | 0x80, then sets "
                "mask 0x10 through the actor's optional nested flag byte."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "argumentKindCounts": dict(sorted(kind_counts.items())),
            "constantActorTagCounts": dict(sorted(tag_counts.items())),
        },
        "evidenceBoundary": [
            "OSAG remains an exact native record tag.",
            "The node-byte and actor-flag meanings remain numeric.",
            "A missing actor, OSAG record, node head, or nested flag pointer follows the native no-op path.",
            "Runtime state that has not established whether those optional structures exist remains an explicit stop.",
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
