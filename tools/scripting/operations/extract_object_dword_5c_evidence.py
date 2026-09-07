#!/usr/bin/env python3
"""Verify operation 0x00f7's exact object dword-0x5c bit-6 control."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/object-dword-5c-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C15836A,
        76,
        "7f39f35fc46993cabc129102ed2e315c079c60792dba330716c09d018fd20e9e",
    ),
    "objectResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "bitQuery": (
        0x0C0AB400,
        22,
        "b34d1f80e5a6678affc05257b8f30f9cac918a7f7ce28211300c900ce3c45caf",
    ),
    "bitWrite": (
        0x0C0AB3E0,
        32,
        "ea2cd01dbea91db3568fa2054caad4f6f9d4f53c414a55f0198b6c314693ef6e",
    ),
    "resultWriter": (
        0x0C0BB358,
        24,
        "1f1cca937e2227515fbd34524641ab98be38beded5d6b7ea5799864bf23a6eda",
    ),
    "lowFlagHandler": (
        0x0C173542,
        26,
        "53faea44af7001c6213a029669c14f42582f15809d6076514cd055dcd0625075",
    ),
    "lowFlagWrite": (
        0x0C0AAC08,
        36,
        "3ec1169546cffa4bbc04bc6d1c0b2c6fbe3b5d92bbd2d54a4e9f8c8b8bb008a8",
    ),
    "invalidationGenerationIncrement": (
        0x0C0F0E16,
        22,
        "9d6cae62d01162abac5567a5efea2ef953b8d1612f0660eda368438880377a09",
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


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int = 0x00F7,
) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
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


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x00f7 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29ADBC),
        "objectResolver": u32(data, 0x0C1583C4),
        "bitQuery": u32(data, 0x0C1583D4),
        "resultWriter": u32(data, 0x0C1583D0),
        "bitWrite": u32(data, 0x0C1583D8),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C15836A,
        "objectResolver": 0x0C153956,
        "bitQuery": 0x0C0AB400,
        "resultWriter": 0x0C0BB358,
        "bitWrite": 0x0C0AB3E0,
    }:
        raise ValueError("operation-0x00f7 dependencies changed")
    return {
        name: f"0x{address:08x}"
        for name, address in dependencies.items()
    }


def verify_low_flag_dependencies(data: bytes) -> dict[str, str]:
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AB14),
        "objectResolver": u32(data, 0x0C1735A0),
        "lowFlagWrite": u32(data, 0x0C1735BC),
        "invalidationGenerationIncrement": u32(data, 0x0C0AAC88),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C173542,
        "objectResolver": 0x0C153956,
        "lowFlagWrite": 0x0C0AAC08,
        "invalidationGenerationIncrement": 0x0C0F0E16,
    }:
        raise ValueError("operation-0x004d dependencies changed")
    return {
        name: f"0x{address:08x}"
        for name, address in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    calls = operation_calls(event_ir)
    low_flag_dependencies = verify_low_flag_dependencies(data)
    low_flag_calls = operation_calls(event_ir, 0x004D)
    dialogue = [call for call in calls if call["dialogue"]]
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }
    constant_commands = Counter(
        call["arguments"][1].get("value")
        for call in calls
        if call["arguments"][1].get("kind") == "constant"
    )
    dialogue_commands = Counter(
        call["arguments"][1].get("value")
        for call in dialogue
    )
    if (
        len(calls) != 332
        or len(dialogue) != 25
        or any(len(call["arguments"]) != 2 for call in calls)
        or argument_kinds != {
            "0": {
                "constant": 222,
                "frame-field": 109,
                "unresolved": 1,
            },
            "1": {"constant": 331, "operation-result": 1},
        }
        or constant_commands != {0: 170, 1: 161}
        or dialogue_commands != {0: 12, 1: 13}
        or any(call["resultComparison"] is not None for call in calls)
        or any(call["resultTarget"] is not None for call in calls)
        or len({(call["disc"], call["area"]) for call in calls}) != 102
    ):
        raise ValueError("operation-0x00f7 authored inventory changed")
    low_flag_dialogue = [call for call in low_flag_calls if call["dialogue"]]
    low_flag_argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in low_flag_calls
        ).items()))
        for index in range(2)
    }
    if (
        len(low_flag_calls) != 142
        or len(low_flag_dialogue) != 1
        or any(len(call["arguments"]) != 2 for call in low_flag_calls)
        or low_flag_argument_kinds != {
            "0": {"constant": 32, "frame-field": 12, "runtime": 98},
            "1": {"constant": 142},
        }
        or any(call["arguments"][1].get("value") != 1 for call in low_flag_calls)
        or any(call["resultComparison"] is not None for call in low_flag_calls)
        or any(call["resultTarget"] is not None for call in low_flag_calls)
        or len({(call["disc"], call["area"]) for call in low_flag_calls}) != 98
    ):
        raise ValueError("operation-0x004d authored inventory changed")
    return {
        "schema": "new-yokosuka-object-dword-5c-evidence-v2",
        "status": "exact-shared-field-writes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00F7,
            "operationHex": "0x00f7",
            "handlerAddress": "0x0c15836a",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": dependencies,
            "provenBehavior": (
                "Resolve argument zero, return the old state of mask "
                "0x00000040 in object dword +0x5c, then clear that mask for "
                "argument one zero, set it for argument one one, or leave "
                "the dword unchanged for every other value."
            ),
            "missingObjectBehavior": (
                "The query returns zero and the write is a no-op."
            ),
        },
        "lowFlagOperation": {
            "operationId": 0x004D,
            "operationHex": "0x004d",
            "handlerAddress": "0x0c173542",
            "nativeContract": low_flag_dependencies,
            "provenBehavior": (
                "Resolve argument zero. A present object clears bit zero of "
                "dword +0x5c, additionally sets bit one when argument one is "
                "zero, and increments the native invalidation generation. "
                "A missing object is a no-op."
            ),
            "allDiscInventory": {
                "authoredCallCount": len(low_flag_calls),
                "provenCallCount": len(low_flag_calls),
                "dialogueRegionCallCount": len(low_flag_dialogue),
                "areaCount": 98,
                "argumentKindCounts": low_flag_argument_kinds,
                "authoredCommandCounts": {"1": 142},
                "resultComparisonCount": 0,
                "resultTargetCount": 0,
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": 102,
            "argumentKindCounts": argument_kinds,
            "constantCommandCounts": {
                str(command): count
                for command, count in sorted(constant_commands.items())
            },
            "dialogueCommandCounts": {
                str(command): count
                for command, count in sorted(dialogue_commands.items())
            },
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "All 332 authored calls have the exact two-argument shape.",
            "The old bit is written to the native result slot before mutation.",
            "Only commands zero and one mutate the field.",
            "The field owner and consumer-side gameplay meaning remain unknown.",
            "The shared invalidation generation is preserved as numeric lifecycle state rather than assigned a gameplay-domain name.",
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
