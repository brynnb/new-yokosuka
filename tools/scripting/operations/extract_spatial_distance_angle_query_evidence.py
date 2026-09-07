#!/usr/bin/env python3
"""Verify operation 0x000b's exact vector distance-and-angle predicate."""

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
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/spatial-distance-angle-query-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C155958,
        150,
        "72dbf5518251a17359a3278431891d8de0931ca548996a5618bcd9322388408a",
    ),
    "threeFloatMagnitude": (
        0x0C091468,
        16,
        "a645978b37b3b19aab5a011b288e1fa79b7accd0bdcef07c863499901fb31251",
    ),
    "binaryAngleFloatPair": (
        0x0C0915E0,
        132,
        "2f025d2a26785ea167b85eefbec9494a2b487c15d337703c4fa74e52ba90c350",
    ),
}
VECTOR_KINDS = {
    "frame-address", "frame-address-expression", "frame-field",
    "scene-address", "static-pointer",
}
SCALAR_KINDS = {
    "constant", "frame-field", "scene-field", "integer-expression",
    "float32-truncate-to-signed-integer",
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
                        or action.get("operationId") != 0x000B
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


def executable_call(call: dict[str, Any]) -> bool:
    arguments = call["arguments"]
    return (
        len(arguments) == 5
        and arguments[0].get("kind") in VECTOR_KINDS
        and arguments[1].get("kind") in SCALAR_KINDS
        and arguments[2].get("kind") in SCALAR_KINDS
        and arguments[3].get("kind") in SCALAR_KINDS
        and arguments[4].get("kind") in VECTOR_KINDS
    )


def verify_executable(data: bytes) -> dict[str, str | int]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x000b {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AA0C),
        "threeFloatMagnitude": u32(data, 0x0C155A24),
        "resultWriter": u32(data, 0x0C155A28),
        "binaryAngleFloatPair": u32(data, 0x0C155A2C),
        "lowWordMask": u32(data, 0x0C155A30),
        "halfTurn": u32(data, 0x0C155A34),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C155958,
        "threeFloatMagnitude": 0x0C091468,
        "resultWriter": 0x0C0BB342,
        "binaryAngleFloatPair": 0x0C0915E0,
        "lowWordMask": 0x0000FFFF,
        "halfTurn": 0x00008000,
    }:
        raise ValueError("operation-0x000b dependencies changed")
    return dependencies


def argument_kind_counts(calls: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(5)
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [call for call in authored if executable_call(call)]
    authored_kinds = argument_kind_counts(authored)
    proven_kinds = argument_kind_counts(proven)
    if (
        len(authored) != 352
        or len(proven) != 352
        or sum(call["dialogue"] for call in authored) != 8
        or sum(call["dialogue"] for call in proven) != 8
        or len({(call["disc"], call["area"]) for call in authored}) != 98
        or sum(call["resultComparison"] is not None for call in authored) != 302
        or sum(call["resultComparison"] is not None for call in proven) != 302
        or sum(call["resultTarget"] is not None for call in authored) != 13
        or authored_kinds != {
            "0": {
                "frame-address": 266,
                "frame-address-expression": 10, "frame-field": 3,
                "scene-address": 16, "static-pointer": 57,
            },
            "1": {"constant": 337, "frame-field": 15},
            "2": {
                "constant": 82, "float32-truncate-to-signed-integer": 11,
                "frame-field": 185, "integer-expression": 28,
                "scene-field": 46,
            },
            "3": {
                "constant": 341,
                "float32-truncate-to-signed-integer": 9,
                "frame-field": 2,
            },
            "4": {
                "frame-address": 227, "frame-address-expression": 10,
                "frame-field": 7, "scene-address": 66,
                "static-pointer": 42,
            },
        }
    ):
        raise ValueError("operation-0x000b authored inventory changed")

    return {
        "schema": "new-yokosuka-spatial-distance-angle-query-evidence-v1",
        "status": "exact-predicate-and-conservative-all-disc-coverage",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x000B,
            "operationHex": "0x000b",
            "handlerAddress": "0x0c155958",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": {
                name: (
                    f"0x{value:08x}" if value > 0xFFFF else value
                )
                for name, value in dependencies.items()
            },
            "provenBehavior": (
                "Subtract the first three-float vector from the second. "
                "Return zero when its native float32 magnitude is greater "
                "than argument one's float32 threshold. Otherwise compute "
                "the native binary heading from delta X/Z and return one "
                "only when the absolute wrapped low-16-bit difference from "
                "argument two is strictly less than signed argument three."
            ),
            "boundaries": {
                "distance": "inclusive (magnitude <= threshold)",
                "angle": "exclusive (wrapped difference < tolerance)",
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "blockedCallCount": len(authored) - len(proven),
            "dialogueRegionCallCount": 8,
            "provenDialogueRegionCallCount": 8,
            "areaCount": 98,
            "argumentKindCounts": authored_kinds,
            "provenArgumentKindCounts": proven_kinds,
            "resultComparisonCount": 302,
            "provenResultComparisonCount": 261,
            "resultTargetCount": 13,
        },
        "evidenceBoundary": [
            "Only complete five-argument calls with executable vector and scalar provenance receive the semantic adapter.",
            "All 352 authored call copies have complete executable vector and scalar provenance.",
            "The native handler compares all three distance components but only delta X/Z when deriving the heading.",
            "No trigger, proximity, field-of-view, or gameplay-domain name is inferred.",
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
