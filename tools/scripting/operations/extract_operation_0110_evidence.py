#!/usr/bin/env python3
"""Verify operation 0x0110's FIGP byte-pair write and full corpus."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0110-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C09C2C4,
        24,
        "cbae3105aca4070c56ee2a90cca2b15272a4910f4d45eac805fa46d9cf26934b",
    ),
    "bytePairHelper": (
        0x0C09BC7C,
        44,
        "741731dd897d74ceaf046b1a76af98cdb32757ce53eba3a4d1fe14a767fd4ce8",
    ),
    "recordLookup": (
        0x0C0AAD5A,
        52,
        "14abed9a9089fed352b450240afd7cf7dd112eca734db9e98d97a45a47aa05eb",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def at(data: bytes, address: int, size: int) -> bytes:
    offset = address - BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", at(data, address, 4))[0]


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    found = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0110
                    ):
                        continue
                    found.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return found


def argument_shape(call: dict[str, Any]) -> tuple[str, ...]:
    return tuple(argument["kind"] for argument in call["arguments"])


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(at(executable, address, size)) != expected:
            raise ValueError(f"operation-0x0110 {name} changed")
    dependencies = {
        "operationTableHandler": u32(executable, 0x0C29AE20),
        "objectResolver": u32(executable, 0x0C09C30C),
        "recordTagWord": u32(executable, 0x0C09BD3C),
        "recordLookupHelper": u32(executable, 0x0C09BD40),
    }
    if dependencies != {
        "operationTableHandler": 0x0C09C2C4,
        "objectResolver": 0x0C153956,
        "recordTagWord": 0x50474946,
        "recordLookupHelper": 0x0C0AAD5A,
    }:
        raise ValueError("operation-0x0110 native dependencies changed")

    authored = calls(event_ir)
    shapes = Counter(argument_shape(call) for call in authored)
    expected_shapes = {
        ("constant", "constant", "constant"): 21,
        ("frame-field", "constant", "constant"): 29,
        ("frame-field", "frame-field", "constant"): 9,
        ("frame-field", "frame-field", "frame-field"): 2,
        ("scene-field", "constant", "constant"): 3,
    }
    if (
        len(authored) != 64
        or shapes != expected_shapes
        or any(
            call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x0110 authored inventory changed")
    op00 = [call for call in authored if call["disc"] == 1 and call["area"] == "OP00"]
    if [call["callFileOffset"] for call in op00] != ["0x604", "0x676", "0x1592c"]:
        raise ValueError("operation-0x0110 OP00 inventory changed")

    return {
        "schema": "new-yokosuka-operation-0110-evidence-v1",
        "status": "exact-figp-byte-pair-write-and-full-corpus",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0110,
            "operationHex": "0x0110",
            "handlerAddress": "0x0c09c2c4",
            "recordTag": "FIGP",
            "fieldOffsets": ["0x11", "0x12"],
            "nativeContract": {
                key: ("FIGP" if key == "recordTagWord" else f"0x{value:08x}")
                for key, value in dependencies.items()
            },
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "provenBehavior": (
                "Resolves argument zero through the shared object resolver, "
                "looks up its literal FIGP associated record, and writes the "
                "low byte of argument one to record +0x11 and the low byte of "
                "argument two to record +0x12. A missing object or FIGP record "
                "is an exact native no-op."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "dialogueRegionCallCount": sum(call["dialogueRegion"] for call in authored),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "argumentShapes": {
                ",".join(shape): count for shape, count in sorted(shapes.items())
            },
            "argumentKindCounts": {
                str(index): dict(sorted(Counter(
                    call["arguments"][index]["kind"] for call in authored
                ).items()))
                for index in range(3)
            },
            "op00CallFileOffsets": [call["callFileOffset"] for call in op00],
        },
        "evidenceBoundary": [
            "FIGP is retained as the executable's exact four-byte record tag.",
            "The two byte fields remain offset-derived because their visual or gameplay meaning is not proved.",
            "All 64 exact three-argument authored shapes receive the semantic; no argument values are narrowed beyond low-byte storage.",
            "No legacy playlist metadata contributes to this evidence.",
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
