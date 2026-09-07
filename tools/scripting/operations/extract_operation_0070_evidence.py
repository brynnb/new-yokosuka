#!/usr/bin/env python3
"""Verify operation 0x0070's MOMT vector-slot routes and corpus inventory."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0070-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29ABA0, 4,
        "0365e9fd4bbc43c8cd19a7c9393deccf3f895333e2e58b2e03dbd8724992a1ec",
    ),
    "handler": (
        0x0C15761A, 94,
        "5958f97944953226c81c95846b26df046de4b9103fd429ac873f2ab0e7ffe746",
    ),
    "slotSelector": (
        0x0C113ECC, 76,
        "63b3a33b138f62112a07497701e82026ae8b9b7d59e2533658de69bf2eaf227b",
    ),
    "primaryDirectWriter": (
        0x0C113F18, 134,
        "1e9eb0b3695471666b0006fb0e1acd11421d4d8eb9e23c46b6a6dced2735282b",
    ),
    "secondaryDirectWriter": (
        0x0C113F9E, 108,
        "c97c63072ef95a76d10611c934a135c74e54ed464fd26fc13947d3d36525435a",
    ),
    "secondaryObjectTransformWriter": (
        0x0C11400A, 158,
        "4619a5453350e27dd082d8b1a437ace83a263496aaf53ce1dfb9d79ff95c0d51",
    ),
    "objectPlusFourAccessor": (
        0x0C0AB0E2, 14,
        "c42ec668a2df1d45e8dbe66ca8a43fe96dad8b10d07483673311df9a3fdcc643",
    ),
    "affinePointTransform": (
        0x0C08D520, 120,
        "2153c2a6f5f04c037612bec68e4a5702754110b5fe711d409da4f51c5df4c58a",
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
                        or action.get("operationId") != 0x0070
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
            raise ValueError(f"operation-0x0070 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29ABA0),
        "objectResolver": u32(data, 0x0C157764),
        "secondaryFlagMask": u32(data, 0x0C157768),
        "secondaryDirectWriter": u32(data, 0x0C157790),
        "primaryFlagMask": u32(data, 0x0C157794),
        "primaryDirectWriter": u32(data, 0x0C157798),
                "secondaryObjectTransformWriter": u32(data, 0x0C15779C),
        "momtTag": u32(data, 0x0C1140AC),
        "associatedRecordResolver": u32(data, 0x0C1140B0),
        "objectPlusFourAccessor": u32(data, 0x0C1140B4),
        "affinePointTransform": u32(data, 0x0C1140B8),
    }
    expected = {
        "handlerTableEntry": 0x0C15761A,
        "objectResolver": 0x0C153956,
        "secondaryFlagMask": 0x40000000,
        "secondaryDirectWriter": 0x0C113F9E,
        "primaryFlagMask": 0x01000000,
        "primaryDirectWriter": 0x0C113F18,
        "secondaryObjectTransformWriter": 0x0C11400A,
        "momtTag": 0x4D544F4D,
        "associatedRecordResolver": 0x0C0AAD5A,
        "objectPlusFourAccessor": 0x0C0AB0E2,
        "affinePointTransform": 0x0C08D520,
    }
    if dependencies != expected:
        raise ValueError("operation-0x0070 native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    calls = operation_calls(event_ir)
    area_counts = {
        f"{disc}:{area}": count
        for (disc, area), count in sorted(Counter(
            (call["disc"], call["area"]) for call in calls
        ).items())
    }
    tag_counts = dict(sorted(Counter(
        call["arguments"][0].get("ascii")
        for call in calls
        if call["arguments"][0].get("ascii")
    ).items()))
    selector_counts = dict(sorted(Counter(
        str(call["arguments"][1].get("value"))
        for call in calls
    ).items()))
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(4)
    }
    flag_counts = dict(sorted(Counter(
        call["arguments"][3].get("hex") for call in calls
    ).items()))
    expected_areas = {
        "1:D000": 8, "1:JD00": 7, "1:JOMO": 1, "1:OP00": 4,
        "2:D000": 2, "2:DKTY": 1, "2:JD00": 3, "2:JOMO": 1,
        "2:MFSY": 3, "2:MKSG": 6, "2:MKYU": 1, "2:MS08": 2,
        "2:YDB1": 2, "3:D000": 2, "3:JD00": 3, "3:JOMO": 1,
        "3:MFBT": 1, "3:MFSY": 2, "3:MKYU": 1, "3:YDB1": 2,
    }
    expected_tags = {
        "AKIR": 31, "GORO": 1, "HIRI": 3, "KISY": 1,
        "OISI": 1, "SYZU": 6, "TONY": 1,
    }
    expected_selectors = {
        "11": 19, "17": 28, "26": 1, "33": 1, "6": 1, "None": 3,
    }
    expected_argument_kinds = {
        "0": {"constant": 44, "frame-field": 9},
        "1": {"constant": 50, "frame-field": 3},
        "2": {"frame-address": 36, "scene-address": 4, "static-pointer": 13},
        "3": {"constant": 53},
    }
    expected_flags = {
        "0x38000000": 15, "0x39000000": 19, "0x78000000": 19,
    }
    if (
        len(calls) != 53
        or Counter(len(call["arguments"]) for call in calls) != {4: 53}
        or area_counts != expected_areas
        or tag_counts != expected_tags
        or selector_counts != expected_selectors
        or argument_kinds != expected_argument_kinds
        or flag_counts != expected_flags
        or sum(call["dialogue"] for call in calls) != 2
        or any(call["resultComparison"] is not None for call in calls)
        or any(call["resultTarget"] is not None for call in calls)
    ):
        raise ValueError("operation-0x0070 authored inventory changed")
    op00_calls = [
        call["callFileOffset"] for call in calls
        if call["disc"] == 1 and call["area"] == "OP00"
    ]
    if op00_calls != ["0x9d28", "0x9dce", "0xaa9c", "0xab42"]:
        raise ValueError("operation-0x0070 OP00 call slice changed")

    return {
        "schema": "new-yokosuka-operation-0070-evidence-v1",
        "status": "exact-native-momt-vector-slot-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0070,
            "operationHex": "0x0070",
            "handlerAddress": "0x0c15761a",
            "recordTag": "MOMT",
            "slotSelectors": {
                "0": 0, "3": 1, "6": 2, "11": 3,
                "17": 4, "21": 5, "26": 6, "33": 7,
            },
            "vectorStorage": {
                "baseOffset": "0x0368",
                "strideBytes": 12,
                "slotCount": 8,
                "primaryPointerTableOffset": "0x001c",
                "secondaryPointerTableOffset": "0x0044",
            },
            "flagRoutes": [
                {
                    "when": "flags & 0x40000000",
                    "route": "secondary-direct",
                    "pointerTable": "0x0044",
                },
                {
                    "when": "!(flags & 0x40000000) && flags & 0x01000000",
                    "route": "primary-direct",
                    "pointerTable": "0x001c",
                },
                {
                    "when": "neither flag is set",
                    "route": "secondary-object-transformed",
                    "pointerTable": "0x0044",
                },
            ],
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
                "Resolve argument zero and its literal MOMT record, map argument "
                "one through the exact eight-selector table, and copy the three "
                "raw words addressed by argument two into MOMT +0x368 + slot*12. "
                "Flag 0x40000000 takes precedence and selects the +0x44 pointer "
                "table without transforming the vector. Otherwise flag "
                "0x01000000 selects the +0x1c pointer table. With neither flag, "
                "the +0x44 route applies the object's direct affine point "
                "transform when that transform pointer is present. The unselected "
                "pointer-table entry is cleared. An unknown selector returns "
                "zero before reading the vector source."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": 53,
            "dialogueRegionCallCount": 2,
            "areaCounts": expected_areas,
            "constantObjectTagCounts": expected_tags,
            "selectorCounts": expected_selectors,
            "argumentKindCounts": expected_argument_kinds,
            "flagCounts": expected_flags,
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
            "op00CallFileOffsets": op00_calls,
        },
        "evidenceBoundary": [
            "MOMT, selector IDs, field offsets, pointer tables, and flag masks remain low-level executable identities.",
            "The object-transform route is proven as affine point transformation; no high-level navigation, gaze, or animation-target label is inferred.",
            "Missing object or MOMT state is not proven as a native no-op and must fail closed in the browser runtime.",
            "The three authored flag words are corpus observations; runtime routing follows the executable bit tests and their precedence.",
            "Dynamic object tags, selectors, and vector addresses remain supported rather than being reduced to the OP00 constants.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
