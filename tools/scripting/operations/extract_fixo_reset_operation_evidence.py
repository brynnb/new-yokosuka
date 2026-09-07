#!/usr/bin/env python3
"""Verify operation 0x001b's exact FIXO record reset contract."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/fixo-reset-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C157830,
        22,
        "8235134b6a9d88823c209a50b641e22140fe662fc5b6a601f2fe1d2dd90a2859",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "associatedRecordResolver": (
        0x0C0AAD5A,
        50,
        "4c5affee0a1739c5cc4b01e389b4f6af7d2f6147cd09ad667b8e103fb3466c27",
    ),
    "fixoReset": (
        0x0C0BEBDA,
        50,
        "b61a134da47ef324597257aa9050c576452358e510a61b98af133d407c533694",
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
                        or action.get("operationId") != 0x001B
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


def kind_counts(calls: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][0]["kind"] for call in calls
    ).items()))


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x001b {name} changed")
    literals = {
        "actorResolver": u32(executable, 0x0C157A34),
        "fixoReset": u32(executable, 0x0C157A48),
        "recordTag": u32(executable, 0x0C0BEE08),
        "associatedRecordResolver": u32(executable, 0x0C0BEE0C),
    }
    if literals != {
        "actorResolver": 0x0C153956,
        "fixoReset": 0x0C0BEBDA,
        "recordTag": 0x4F584946,
        "associatedRecordResolver": 0x0C0AAD5A,
    }:
        raise ValueError("operation-0x001b dependencies changed")
    return {
        name: (
            "FIXO" if name == "recordTag"
            else f"0x{value:08x}"
        )
        for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    if len(calls) != 470 or any(len(call["arguments"]) != 1 for call in calls):
        raise ValueError("operation-0x001b authored inventory changed")
    bindings = kind_counts(calls)
    if bindings != {
        "constant": 409,
        "frame-field": 24,
        "runtime": 7,
        "scene-field": 30,
    }:
        raise ValueError("operation-0x001b actor bindings changed")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    dialogue_bindings = kind_counts(dialogue_calls)
    if dialogue_bindings != {"constant": 76, "scene-field": 1}:
        raise ValueError("operation-0x001b dialogue bindings changed")
    return {
        "schema": "new-yokosuka-fixo-reset-operation-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x001B,
            "operationHex": "0x001b",
            "handlerAddress": "0x0c157830",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "recordTag": "FIXO",
            "zeroFields": {
                "floatWords": ["0x18", "0x1c", "0x20"],
                "dwords": ["0x24", "0x28", "0x2c"],
                "words": ["0x30", "0x32"],
            },
            "provenBehavior": (
                "Resolves argument zero as an actor, resolves its exact FIXO "
                "associated record, then zeros float-word offsets +0x18, "
                "+0x1c, and +0x20, dwords +0x24, +0x28, and +0x2c, and "
                "words +0x30 and +0x32."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "actorArgumentKindCounts": bindings,
            "dialogueActorArgumentKindCounts": dialogue_bindings,
        },
        "evidenceBoundary": [
            "FIXO remains the exact native four-byte tag; no expanded record meaning is assigned.",
            "The reset routine dereferences the associated-record result without a null guard, so missing actor or FIXO state is an explicit runtime prerequisite.",
            "Runtime, frame-field, and scene-field actor bindings remain unresolved until supplied by their exact execution context.",
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
