#!/usr/bin/env python3
"""Verify operation 0x0000's native variadic debug-format boundary."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/native-debug-format-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (0x0C173196, 52, "960e5a04127380ca11ee6edeb40ac3ffbdf1b20ac20ec2e5bc8458fb5c9bb8a4"),
    "formatWrapper": (0x0C1DCB74, 34, "29c91668186243b962a0d7d537316b2914a04bdf3fd248e184866af505e55923"),
    "formatCoreSample": (0x0C1DCB98, 128, "6f0035af926676f740a0517478a66d777e854b8790d535ad34e1f05100b9e5e3"),
    "encodingConversion": (0x0C1C5100, 74, "8e45df02e0cf5e917e64e2c3b7795cfc2f20d54d0e2ddc241f8b296a2bdd27ce"),
    "resultWriter": (0x0C0BB342, 6, "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2"),
}
ARGUMENT_COUNTS = (1, 2, 3, 4, 5, 17)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0
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


def shape_counts(items: list[dict[str, Any]]) -> dict[str, int]:
    return {
        str(key): value
        for key, value in sorted(Counter(
            len(item["arguments"]) for item in items
        ).items())
    }


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0000 {name} changed")
    dependencies = {
        "formatWrapper": u32(data, 0x0C1731F8),
        "encodingConversion": u32(data, 0x0C1731FC),
        "resultWriter": u32(data, 0x0C173200),
    }
    if dependencies != {
        "formatWrapper": 0x0C1DCB74,
        "encodingConversion": 0x0C1C5100,
        "resultWriter": 0x0C0BB342,
    }:
        raise ValueError("operation-0x0000 dependencies changed")
    return {key: f"0x{value:08x}" for key, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = calls(event_ir)
    selected = [
        item for item in authored
        if item["arguments"]
        and item["arguments"][0].get("kind") == "static-pointer"
        and len(item["arguments"]) in ARGUMENT_COUNTS
    ]
    dialogue = [item for item in selected if item["dialogue"]]
    if (
        len(authored) != 1403
        or len(selected) != 1400
        or len(dialogue) != 51
        or shape_counts(selected) != {
            "1": 951, "2": 386, "3": 40, "4": 11, "5": 6, "17": 6,
        }
        or shape_counts(dialogue) != {"1": 16, "2": 35}
        or any(
            item["resultComparison"] is not None
            or item["resultTarget"] is not None
            for item in authored
        )
    ):
        raise ValueError("operation-0x0000 authored inventory changed")
    return {
        "schema": "new-yokosuka-native-debug-format-operation-evidence-v1",
        "status": "exact-native-format-boundary-and-static-pointer-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0,
            "operationHex": "0x0000",
            "handlerAddress": "0x0c173196",
            "provenArgumentCounts": list(ARGUMENT_COUNTS),
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
                "Passes argument zero as a format-string pointer and all "
                "remaining raw words as a variadic argument list to the "
                "native formatter, converts the formatted buffer through the "
                "exact character-encoding routine, and writes the formatter "
                "result to the current VM result slot."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(selected),
            "unresolvedDynamicFormatPointerCallCount": len(authored) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "argumentCountHistogram": shape_counts(selected),
            "dialogueArgumentCountHistogram": shape_counts(dialogue),
            "areaCount": len({(item["disc"], item["area"]) for item in selected}),
        },
        "evidenceBoundary": [
            "The platform formatter and encoding conversion remain one mandatory adapter.",
            "Raw variadic words are forwarded without JavaScript format emulation.",
            "Only calls with a statically recovered format pointer are promoted.",
            "The three dynamic-format-pointer calls remain unresolved.",
            "No recovered operation result feeds a branch or stored result target.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['provenCallCount']} proven calls")


if __name__ == "__main__":
    main()
