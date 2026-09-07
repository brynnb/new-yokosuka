#!/usr/bin/env python3
"""Verify operation 0x0094 FACE-controller setup from native code and IR."""

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
    PROJECT_ROOT / "tools/evidence/face-controller-setup-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C165080
HANDLER_LENGTH = 68
HANDLER_SHA256 = (
    "ab79486ba9e8726e5cde32a94517d2c8f637ca253d7565bed3702127c98744ea"
)
HELPERS = {
    "momtRecordCheck": {
        "address": 0x0C114314,
        "length": 26,
        "sha256": "b185358b2d1bd714970562f08e58b76207cd19d3e5c845f2e42c5a970d76a730",
    },
    "faceRecordResolve": {
        "address": 0x0C0BC538,
        "length": 8,
        "sha256": "54e0ce59b2e376eca571852b37e52dd7907a57fa1b025514349d496fc49a64c6",
    },
    "controllerSetup": {
        "address": 0x0C0BC71A,
        "length": 88,
        "sha256": "6213637059d2d30c82daef0a8a8a5c3018f5171a7060671b14f5d29ac2bc80e5",
    },
}
LITERALS = {
    0x0C165238: 0x0C153956,
    0x0C165250: 0x0C114314,
    0x0C165254: 0x0C0BC538,
    0x0C165258: 0x0C0BC71A,
    0x0C114440: 0x4D544F4D,
    0x0C0BC67C: 0x45434146,
    0x0C0BC780: 0x0C1CE1F0,
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
    return [
        {
            "disc": native_map["disc"],
            "area": native_map["area"],
            "dialogueRegion": function.get("dialogueRegion") is not None,
            "arguments": action.get("arguments", []),
        }
        for native_map in event_ir["maps"]
        for function in native_map["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("kind") == "engineOperation"
        and action.get("operationId") == 0x0094
    ]


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(4)
    }


def verify_native_contract(executable: bytes) -> None:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(executable, 0x0C29AC30) != HANDLER_ADDRESS:
        raise ValueError("operation-0x0094 handler table entry changed")
    if sha256(runtime_slice(
        executable, HANDLER_ADDRESS, HANDLER_LENGTH,
    )) != HANDLER_SHA256:
        raise ValueError("operation-0x0094 handler changed")
    for helper in HELPERS.values():
        if sha256(runtime_slice(
            executable, helper["address"], helper["length"],
        )) != helper["sha256"]:
            raise ValueError(
                f"operation-0x0094 helper 0x{helper['address']:08x} changed"
            )
    for address, expected in LITERALS.items():
        if u32(executable, address) != expected:
            raise ValueError(
                f"operation-0x0094 literal 0x{address:08x} changed"
            )


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_native_contract(executable)
    calls = operation_calls(event_ir)
    if (
        len(calls) != 511
        or any(len(call["arguments"]) != 4 for call in calls)
        or argument_kinds(calls) != {
            "0": {"constant": 355, "frame-field": 156},
            "1": {"constant": 511},
            "2": {"constant": 509, "frame-field": 2},
            "3": {"constant": 511},
        }
        or {call["arguments"][1]["value"] for call in calls} != {0, 1, 2}
        or {call["arguments"][3]["value"] for call in calls} != {0, 1, 4, 6, 8}
    ):
        raise ValueError("operation-0x0094 authored inventory changed")
    return {
        "schema": "new-yokosuka-face-controller-setup-operation-evidence-v1",
        "status": "exact-native-contract-and-complete-authored-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0094,
            "operationHex": "0x0094",
            "argumentCount": 4,
            "handlerAddress": "0x0c165080",
            "associatedRecordChain": ["MOMT", "FACE"],
            "controllerOffset": "FACE +0x44",
            "randomSourceAddress": "0x0c1ce1f0",
            "provenBehavior": (
                "Resolves argument zero, requires its MOMT and FACE records, "
                "then resets the FACE controller at +0x44. Argument one "
                "writes byte +0x00, byte +0x01 becomes one, argument three "
                "writes byte +0x03, word +0x04 clears, and signed argument "
                "two is clamped to at least one at word +0x06. Mode zero "
                "overrides word +0x06 with three. The native RNG low two "
                "bits seed word +0x08 to 60, 70, 80, or 90. Missing objects "
                "or associated records are native no-ops."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in calls
            ),
            "argumentKindCounts": argument_kinds(calls),
        },
        "evidenceBoundary": [
            "The FACE +0x44 field effects and random timer are executable-proven.",
            "The high-level expression or emotion represented by mode values remains unnamed.",
            "Browser presentation consumes this state generically; no scene-specific timing is inferred.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
