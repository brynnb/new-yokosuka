#!/usr/bin/env python3
"""Verify operation 0x000a's exact object XZ-bounds query."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/spatial-bounds-query-evidence.json"
LIVE_EMULATOR_EVIDENCE = (
    ROOT / "tools/evidence/live-spatial-bounds-emulator-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C155878,
        224,
        "5e38c2c7b3e6f54365bbe5b69fd124e9c08141ad0d319f99f5f4fa99e0e6da9d",
    ),
    "objectPositionReader": (
        0x0C0AAF10,
        34,
        "22d8140a65dbecc460bbb085d7f76322fdc8afdbe5de5c7402f8836eb976433f",
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
                        or action.get("operationId") != 0x000A
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
            raise ValueError(f"operation-0x000a {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AA08),
        "zeroTranslationVector": u32(data, 0x0C155A14),
        "objectResolver": u32(data, 0x0C155A18),
        "objectPositionReader": u32(data, 0x0C155A1C),
        "resultWriter": u32(data, 0x0C155A20),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C155878,
        "zeroTranslationVector": 0x0C2789A0,
        "objectResolver": 0x0C153956,
        "objectPositionReader": 0x0C0AAF10,
        "resultWriter": 0x0C0BB358,
    }:
        raise ValueError("operation-0x000a dependencies changed")
    if runtime_slice(data, 0x0C2789A0, 12) != bytes(12):
        raise ValueError("operation-0x000a zero translation changed")
    return {
        name: f"0x{address:08x}"
        for name, address in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    dialogue = [call for call in authored if call["dialogue"]]
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in authored
        ).items()))
        for index in range(4)
    }
    translation_values = Counter(
        call["arguments"][3].get("value") for call in authored
    )
    if (
        len(authored) != 213
        or len(dialogue) != 27
        or any(len(call["arguments"]) != 4 for call in authored)
        or argument_kinds != {
            "0": {"constant": 212, "frame-field": 1},
            "1": {
                "frame-field": 2,
                "runtime": 112,
                "static-pointer": 99,
            },
            "2": {
                "frame-field": 2,
                "runtime": 112,
                "static-pointer": 99,
            },
            "3": {"constant": 213},
        }
        or translation_values != {
            0: 207,
            0x324B4F50: 3,
            0x4F4B4148: 3,
        }
        or sum(
            call["resultComparison"] is not None for call in authored
        ) != 92
        or sum(
            call["resultComparison"] is not None for call in dialogue
        ) != 10
        or any(call["resultTarget"] is not None for call in authored)
        or len({
            (call["disc"], call["area"]) for call in authored
        }) != 39
    ):
        raise ValueError("operation-0x000a authored inventory changed")

    return {
        "schema": "new-yokosuka-spatial-bounds-query-evidence-v1",
        "status": "exact-xz-query-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
            "liveEmulatorEvidence": (
                "tools/evidence/live-spatial-bounds-emulator-evidence.json"
            ),
        },
        "operation": {
            "operationId": 0x000A,
            "operationHex": "0x000a",
            "handlerAddress": "0x0c155878",
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
                "Resolve argument zero and read its three-float position. "
                "Read the X/Z components of vectors addressed by arguments "
                "one and two, add the resolved argument-three position when "
                "argument three is nonzero, normalize both axes, and return "
                "one for inclusive containment or zero otherwise."
            ),
            "missingObjectBehavior": (
                "A missing argument-zero or argument-three object contributes "
                "the native zero vector."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(authored),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": 39,
            "argumentKindCounts": argument_kinds,
            "translationObjectCounts": {
                "zero": 207,
                "POK2": 3,
                "HAKO": 3,
            },
            "resultComparisonCount": 92,
            "dialogueResultComparisonCount": 10,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "All 213 authored calls have the exact four-argument handler shape.",
            "Only X and Z participate; both rectangle edges are inclusive.",
            "Native float32 addition and comparison order are preserved.",
            "Unavailable vector-pointer data stops explicitly rather than becoming a guessed vector.",
            "No trigger, region, or gameplay-domain name is inferred.",
            (
                "Naturally executed Flycast observations independently cover "
                "zero-translation false and true results and the result-slot "
                "representations; see source.liveEmulatorEvidence."
            ),
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
