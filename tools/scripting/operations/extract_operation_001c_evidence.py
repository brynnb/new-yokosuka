#!/usr/bin/env python3
"""Verify operation 0x001c's four exact packed-word output routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-001c-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C157BDC,
        172,
        "e2da069c0c0a90cf873078411034d76e0da4d61e77247c57f72eaee7ef58877b",
    ),
    "directNormalHelper": (
        0x0C0AAF80,
        20,
        "d652081dec5df7f6feec12e7e2c99317606041449350cd17096c5a67e674a006",
    ),
    "associatedNormalHelper": (
        0x0C0AB06A,
        32,
        "42bfcbb9dc106fa7bba23af1ad229d782d03912d8ed2d02460cfbfe519ab69df",
    ),
    "associatedSpecialHelper": (
        0x0C11423C,
        42,
        "091c5cc0d738143b9d90f880c16196c552f8fd398f22bc8f9f7ebca5914077be",
    ),
    "directSpecialHelper": (
        0x0C11426C,
        70,
        "75b67588156d77c85cfd3b88e4838464e3a37a49a9d47f1d0e1e292911319230",
    ),
}
PROVEN_FLAGS = (0, 0x02000000, 0x40000000, 0x42000000)


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
                        or action.get("operationId") != 0x001C
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
            raise ValueError(f"operation-0x001c {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AA50),
        "objectResolver": u32(data, 0x0C157E5C),
        "specialFlag": u32(data, 0x0C157E60),
        "lowWordMask": u32(data, 0x0C157E64),
        "associatedFlag": u32(data, 0x0C157E68),
        "associatedSpecialHelper": u32(data, 0x0C157E6C),
        "associatedNormalHelper": u32(data, 0x0C157E70),
        "directSpecialHelper": u32(data, 0x0C157E74),
        "directNormalHelper": u32(data, 0x0C157E78),
    }
    expected = {
        "handlerTableEntry": 0x0C157BDC,
        "objectResolver": 0x0C153956,
        "specialFlag": 0x02000000,
        "lowWordMask": 0x0000FFFF,
        "associatedFlag": 0x40000000,
        "associatedSpecialHelper": 0x0C11423C,
        "associatedNormalHelper": 0x0C0AB06A,
        "directSpecialHelper": 0x0C11426C,
        "directNormalHelper": 0x0C0AAF80,
    }
    if dependencies != expected:
        raise ValueError("operation-0x001c native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    selected = [
        call for call in authored
        if (
            len(call["arguments"]) == 3
            and call["arguments"][2].get("kind") == "constant"
            and call["arguments"][2].get("value") in PROVEN_FLAGS
        )
    ]
    dialogue = [call for call in selected if call["dialogue"]]
    flags = Counter(call["arguments"][2]["value"] for call in selected)
    dialogue_flags = Counter(
        call["arguments"][2]["value"] for call in dialogue
    )
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in selected
        ).items()))
        for index in range(3)
    }
    if (
        len(authored) != 1361
        or Counter(len(call["arguments"]) for call in authored) != {3: 1361}
        or len(selected) != 1360
        or len(dialogue) != 37
        or flags != {
            0: 911,
            0x02000000: 60,
            0x40000000: 152,
            0x42000000: 237,
        }
        or dialogue_flags != {0: 20, 0x42000000: 17}
        or argument_kinds != {
            "0": {
                "constant": 384,
                "frame-field": 252,
                "runtime": 583,
                "scene-field": 141,
            },
            "1": {
                "constant": 1,
                "frame-address": 1234,
                "frame-field": 8,
                "runtime": 10,
                "scene-address": 106,
                "static-pointer": 1,
            },
            "2": {"constant": 1360},
        }
        or any(call["resultComparison"] is not None for call in selected)
        or any(call["resultTarget"] is not None for call in selected)
    ):
        raise ValueError("operation-0x001c authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-001c-evidence-v1",
        "status": "exact-native-packed-word-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x001C,
            "operationHex": "0x001c",
            "handlerAddress": "0x0c157bdc",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "routes": [
                {
                    "flags": "0x00000000",
                    "behavior": (
                        "Copy resolved-object dwords +0x14/+0x18/+0x1c to "
                        "the destination, then retain only each low 16 bits. "
                        "A missing object leaves the destination words in "
                        "place before masking."
                    ),
                },
                {
                    "flags": "0x40000000",
                    "behavior": (
                        "Obtain the associated-path three-word output and "
                        "retain only each low 16 bits. A missing object emits "
                        "three zero words."
                    ),
                },
                {
                    "flags": "0x02000000",
                    "behavior": (
                        "Clear destination words zero and two, query helper "
                        "0x0c11426c from destination+4, and store only its "
                        "low 16 bits in destination word one."
                    ),
                },
                {
                    "flags": "0x42000000",
                    "behavior": (
                        "Clear destination words zero and two, query helper "
                        "0x0c11423c from destination+4, and store only its "
                        "low 16 bits in destination word one."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(selected),
            "unresolvedDynamicFlagCount": len(authored) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "flagCounts": {
                f"0x{flag:08x}": count
                for flag, count in sorted(flags.items())
            },
            "dialogueFlagCounts": {
                f"0x{flag:08x}": count
                for flag, count in sorted(dialogue_flags.items())
            },
            "argumentKindCounts": argument_kinds,
            "exactAddressDestinationCount": sum(
                argument_kinds["1"].get(kind, 0)
                for kind in ("frame-address", "scene-address")
            ),
            "resolvedPointerDestinationCount": sum(
                argument_kinds["1"].get(kind, 0)
                for kind in (
                    "constant",
                    "frame-field",
                    "runtime",
                    "static-pointer",
                )
            ),
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the four exact constant flag words receive this semantic; the single runtime flag remains unresolved.",
            "The associated normal helper's configured three-word result remains low-level state rather than a guessed transform.",
            "The two MOMT-dependent special helpers remain mandatory read-only query adapters at their exact destination+4 boundary.",
            "No coordinate-space, rotation, animation, or gameplay-domain field names are assigned.",
            "Frame-address and scene-address destinations retain their native address-space identity; the browser runtime does not coerce them into synthetic numeric pointers.",
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
