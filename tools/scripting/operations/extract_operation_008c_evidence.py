#!/usr/bin/env python3
"""Verify operation 0x008c's IMGM selection write and full IR inventory."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-008c-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29AC10,
        4,
        "f40e61c23c598fc4bbb66474e102bfb06a592466917a060c1505e336f682fb0b",
    ),
    "handler": (
        0x0C164FFE,
        40,
        "5ca6084a151d71b68d4c226fe76b63f3038cb45bebe18fd183fe3813c282ca69",
    ),
    "imgmSelectionWriter": (
        0x0C0E3434,
        32,
        "69a26a455a6d5e9cc964b480e9a83902ccf9b9eaaf5889ffffe4657becc1391d",
    ),
    "imgmSelectionConsumer": (
        0x0C0E34B6,
        44,
        "cdb578a23076cebba650e5f97dbd726f7985bcb4e51823811705ab60c9adc8b2",
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
                        or action.get("operationId") != 0x008C
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
            raise ValueError(f"operation-0x008c {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AC10),
        "objectResolver": u32(data, 0x0C165238),
        "imgmSelectionWriter": u32(data, 0x0C165240),
        "imgmComponentTag": u32(data, 0x0C0E3544),
        "componentResolver": u32(data, 0x0C0E3548),
    }
    expected = {
        "handlerTableEntry": 0x0C164FFE,
        "objectResolver": 0x0C153956,
        "imgmSelectionWriter": 0x0C0E3434,
        "imgmComponentTag": 0x4D474D49,
        "componentResolver": 0x0C0AAD5A,
    }
    if dependencies != expected:
        raise ValueError("operation-0x008c native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    calls = operation_calls(event_ir)
    area_counts = Counter((call["disc"], call["area"]) for call in calls)
    tag_counts = Counter(
        call["arguments"][0].get("ascii")
        for call in calls
        if len(call["arguments"]) == 2
    )
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }
    expected_areas = {
        "1:JHD0": 4,
        "1:OP00": 4,
        "2:JHD0": 4,
        "2:MFSY": 11,
        "2:YDB1": 5,
        "3:JHD0": 4,
        "3:MSBS": 4,
        "3:YDB1": 5,
    }
    expected_tags = {
        "BIR1": 1,
        "BIR2": 2,
        "BIR3": 1,
        "BIR4": 1,
        "BIR5": 2,
        "BIR6": 2,
        "BIR7": 2,
        "FIR1": 7,
        "FIR2": 7,
        "FIR3": 7,
        "FIR4": 7,
        "FIR5": 2,
    }
    if (
        len(calls) != 41
        or Counter(len(call["arguments"]) for call in calls) != {2: 41}
        or argument_kinds != {
            "0": {"constant": 41},
            "1": {"frame-field": 11, "runtime": 30},
        }
        or {
            f"{disc}:{area}": count
            for (disc, area), count in sorted(area_counts.items())
        } != expected_areas
        or dict(sorted(tag_counts.items())) != expected_tags
        or sum(call["dialogue"] for call in calls) != 10
        or any(call["resultComparison"] is not None for call in calls)
        or any(call["resultTarget"] is not None for call in calls)
    ):
        raise ValueError("operation-0x008c authored inventory changed")

    op00_calls = [
        call["callFileOffset"] for call in calls
        if call["disc"] == 1 and call["area"] == "OP00"
    ]
    if op00_calls != ["0x818", "0x836", "0x854", "0x872"]:
        raise ValueError("operation-0x008c OP00 call slice changed")

    return {
        "schema": "new-yokosuka-operation-008c-evidence-v1",
        "status": "exact-native-imgm-selection-write-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x008C,
            "operationHex": "0x008c",
            "handlerAddress": "0x0c164ffe",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "provenBehavior": (
                "Resolve argument zero as an object. If resolution returns "
                "null, return without mutation. Otherwise resolve that "
                "object's IMGM component and write the low byte of argument "
                "one to component offset +0x09. The adjacent native consumer "
                "reads +0x09 unsigned and uses it as a dword-table index from "
                "IMGM +0x04."
            ),
            "componentTag": "IMGM",
            "selectionByteOffset": 9,
            "argumentValueBehavior": "truncate to low byte",
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "argumentCount": 2,
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "areaCounts": expected_areas,
            "objectTagCounts": expected_tags,
            "argumentKindCounts": argument_kinds,
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
            "op00CallFileOffsets": op00_calls,
        },
        "evidenceBoundary": [
            "The semantic applies only to exact two-argument calls.",
            "A missing resolved object is an exact no-op, not an execution failure.",
            "The write owns an IMGM entry-selection byte; no animation cadence, material identity, or asset-specific frame meaning is inferred.",
            "The operation truncates argument one to its low byte. Signed and unsigned producers therefore share the same byte contract.",
            "FIR* and BIR* are corpus evidence, not hard-coded runtime identities.",
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
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
