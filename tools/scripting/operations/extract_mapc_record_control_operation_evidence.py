#!/usr/bin/env python3
"""Verify operation 0x015f's exact resolved-object MAPC bit control."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/mapc-record-control-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1584D4,
        26,
        "2d640b3f97575c3f92f220d2ecdf6f9dafe32f84b22b619513ef6597ab6e0b74",
    ),
    "objectResolverSample": (
        0x0C153956,
        64,
        "46e00fc5aa0eb86845d366f0eac4ad78ef1124d2aff4f210e8728b7f1d79e3cd",
    ),
    "controlHelper": (
        0x0C0F5504,
        66,
        "3d10c587aba7742bac241978c6ecbfd36bcfbfbdb4405914b37399a0b499c073",
    ),
    "mapcBitQuery": (
        0x0C0AADF6,
        56,
        "abfb847f5583e2d2b2aa8f5122bb785866a325643bbb86a30ac2dc632c26e80c",
    ),
    "mapcBitWrite": (
        0x0C0AADAC,
        74,
        "288e6108df95c513bd7124e70d4e3418036397e249445fbfa38413e5b58323d0",
    ),
}
PROVEN_OBJECT_KINDS = ("constant", "frame-field", "scene-field")


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
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x015F
                    ):
                        result.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return result


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x015f {name} changed")
    dependencies = {
        "objectResolver": u32(data, 0x0C1585BC),
        "controlHelper": u32(data, 0x0C1585E0),
        "recordTag": u32(data, 0x0C0F56C8),
        "mapcBitQuery": u32(data, 0x0C0F56D0),
        "mapcBitWrite": u32(data, 0x0C0F56D4),
    }
    if dependencies != {
        "objectResolver": 0x0C153956,
        "controlHelper": 0x0C0F5504,
        "recordTag": 0x4D415043,
        "mapcBitQuery": 0x0C0AADF6,
        "mapcBitWrite": 0x0C0AADAC,
    }:
        raise ValueError("operation-0x015f dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [
        call for call in authored
        if len(call["arguments"]) == 2
        and call["arguments"][0].get("kind") in PROVEN_OBJECT_KINDS
        and call["arguments"][1].get("kind") == "constant"
        and call["arguments"][1].get("value") in (0, 1)
    ]
    dialogue = [call for call in proven if call["dialogue"]]
    object_kinds = Counter(
        call["arguments"][0].get("kind") for call in authored
    )
    values = Counter(
        call["arguments"][1].get("value") for call in authored
    )
    if (
        len(authored) != 641
        or len(proven) != 639
        or len(dialogue) != 45
        or Counter(len(call["arguments"]) for call in authored) != {2: 641}
        or object_kinds != {
            "constant": 405,
            "frame-field": 217,
            "scene-field": 17,
            "runtime": 2,
        }
        or values != {0: 383, 1: 258}
        or any(
            call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x015f authored inventory changed")
    return {
        "schema": "new-yokosuka-mapc-record-control-operation-evidence-v1",
        "status": "exact-native-control-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x015F,
            "operationHex": "0x015f",
            "handlerAddress": "0x0c1584d4",
            "recordTag": "MAPC",
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
                "Resolves argument zero as an object, resolves its literal "
                "MAPC associated record, and sets record dword +0x10 bit zero "
                "for nonzero argument one or clears it for zero. A zero value "
                "also writes float32 1.0 to resolved-object dword +0x48 even "
                "when MAPC is absent. A missing object is a native no-op."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "unresolvedDynamicObjectCallCount": len(authored) - len(proven),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in proven}),
            "objectArgumentKindCounts": dict(sorted(object_kinds.items())),
            "controlValueCounts": {
                str(value): count for value, count in sorted(values.items())
            },
        },
        "evidenceBoundary": [
            "The literal associated-record tag remains MAPC; no expanded gameplay name is inferred.",
            "Only control bit zero and resolved-object float dword +0x48 are mutated.",
            "The pre-write bit query is retained as prior state but no caller consumes the helper result.",
            "The two dynamically sourced object arguments remain unresolved.",
            "All 45 dialogue-region calls have exact object operands and are promoted.",
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
