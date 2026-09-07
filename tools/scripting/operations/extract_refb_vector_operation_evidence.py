#!/usr/bin/env python3
"""Verify operation 0x015b's exact resolved-object REFB vector write."""

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
    PROJECT_ROOT / "tools/evidence/refb-vector-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1600D2,
        26,
        "3e9cb2bbeb5f09e6484aae6f69a96375f31d683dfe0d98dc18e33dfe1c8dc94c",
    ),
    "refbVectorWrite": (
        0x0C1444F8,
        50,
        "fc06d1a14fb42e41be373568d9155fc67c27afb9f58a87eb0ddb04e4112351bc",
    ),
    "objectResolverSample": (
        0x0C153956,
        64,
        "46e00fc5aa0eb86845d366f0eac4ad78ef1124d2aff4f210e8728b7f1d79e3cd",
    ),
    "associatedLookupSample": (
        0x0C0AAD5A,
        64,
        "93bed2c74d0db3548d88fd24f81c702cf9531e1ce23107222156fdef0ff0b7eb",
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
                        or action.get("operationId") != 0x015B
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x015b {name} changed")
    literals = {
        "objectResolver": u32(executable, 0x0C1602A0),
        "refbVectorWrite": u32(executable, 0x0C1602AC),
        "recordTag": u32(executable, 0x0C1446D8),
        "associatedLookup": u32(executable, 0x0C1446DC),
    }
    if literals != {
        "objectResolver": 0x0C153956,
        "refbVectorWrite": 0x0C1444F8,
        "recordTag": 0x42464552,
        "associatedLookup": 0x0C0AAD5A,
    }:
        raise ValueError("operation-0x015b dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if (
        len(calls) != 605
        or len(dialogue_calls) != 58
        or any(len(call["arguments"]) != 2 for call in calls)
        or argument_kinds(calls) != {
            "0": {
                "constant": 531,
                "frame-field": 47,
                "runtime": 4,
                "scene-field": 23,
            },
            "1": {"runtime": 116, "static-pointer": 489},
        }
        or argument_kinds(dialogue_calls) != {
            "0": {"constant": 57, "runtime": 1},
            "1": {"runtime": 23, "static-pointer": 35},
        }
    ):
        raise ValueError("operation-0x015b authored inventory changed")
    return {
        "schema": "new-yokosuka-refb-vector-operation-evidence-v1",
        "status": "exact-native-record-write-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x015B,
            "operationHex": "0x015b",
            "argumentCount": 2,
            "handlerAddress": "0x0c1600d2",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": contract,
            "recordTag": "REFB",
            "stateDwordOffset": "record+0x24",
            "stateDwordValue": 1,
            "sourceVectorOffsets": [
                "argument1+0x04",
                "argument1+0x08",
                "argument1+0x0c",
            ],
            "destinationVectorOffsets": [
                "record+0x08",
                "record+0x0c",
                "record+0x10",
            ],
            "provenBehavior": (
                "Resolves argument zero through the exact scene-object "
                "resolver, obtains associated record tag REFB, writes one "
                "to record dword +0x24, and copies three raw float words from "
                "argument-one offsets +0x04/+0x08/+0x0c to record offsets "
                "+0x08/+0x0c/+0x10. A missing object or REFB record is a "
                "native no-op and does not dereference argument one."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
            "argumentKindCounts": argument_kinds(calls),
            "dialogueArgumentKindCounts": argument_kinds(dialogue_calls),
        },
        "evidenceBoundary": [
            "REFB remains the exact native associated-record tag.",
            "The three copied fields remain raw float words without inferred spatial meaning.",
            "The source pointer is dereferenced only after object and REFB resolution.",
            "Runtime operands remain interpreter stops when no exact resolver is supplied.",
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
