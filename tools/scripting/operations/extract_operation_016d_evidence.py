#!/usr/bin/env python3
"""Verify operation 0x016d's exact five authored native routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-016d-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16B358,
        136,
        "6e0b13a8ff536d33bf023ddac2264d5afb21f81171d907d4a766b76177bd1acb",
    ),
    "modeZeroHelper": (
        0x0C17A24E,
        110,
        "b68ed8e501b15b9cf6e648fa8351d52889b06576a04ea4de0cf98e989049f4b3",
    ),
    "modeOneHelper": (
        0x0C17B210,
        380,
        "3fea4b629bfb79129275faa76177117cb17e59e63f02b60035a6b0d966b2df92",
    ),
    "modeTwoQuery": (
        0x0C17B38E,
        18,
        "536975317f297f70f0e1094434880a1c177d729e4afd420565df119881f252f0",
    ),
    "modeThreeHelper": (
        0x0C17B1B6,
        38,
        "944f89aacb827575f864d766b87c9250921a78fccae8fff13c0f0dc7b51c3696",
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
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x016D
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


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x016d {name} changed")
    contract = {
        "handlerTableEntry": u32(data, 0x0C29AF94),
        "resultWriter": u32(data, 0x0C16B43C),
        "currentOwnerGlobal": u32(data, 0x0C16B454),
        "modeZeroHelper": u32(data, 0x0C16B45C),
        "modeOneHelper": u32(data, 0x0C16B460),
        "modeTwoQuery": u32(data, 0x0C16B464),
        "modeThreeHelper": u32(data, 0x0C16B468),
        "queryGlobal": u32(data, 0x0C17B454),
        "modeOneTag": u32(data, 0x0C17B43C),
    }
    expected = {
        "handlerTableEntry": 0x0C16B358,
        "resultWriter": 0x0C0BB358,
        "currentOwnerGlobal": 0x0C20C3D8,
        "modeZeroHelper": 0x0C17A24E,
        "modeOneHelper": 0x0C17B210,
        "modeTwoQuery": 0x0C17B38E,
        "modeThreeHelper": 0x0C17B1B6,
        "queryGlobal": 0x0C224B20,
        "modeOneTag": 0x54444E53,
    }
    if contract != expected:
        raise ValueError("operation-0x016d native dependencies changed")
    return {
        name: (
            value.to_bytes(4, "little").decode("ascii")
            if name == "modeOneTag"
            else f"0x{value:08x}"
        )
        for name, value in contract.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [
        call for call in authored
        if len(call["arguments"]) == 4
        and constant(call["arguments"][0]) in (0, 1, 2, 3, 4)
    ]
    dialogue = [call for call in proven if call["dialogue"]]
    modes = Counter(constant(call["arguments"][0]) for call in proven)
    dialogue_modes = Counter(
        constant(call["arguments"][0]) for call in dialogue
    )
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in proven
        ).items()))
        for index in range(4)
    }
    result_comparisons = Counter(
        constant(call["arguments"][0])
        for call in proven
        if call["resultComparison"] is not None
    )
    expected_argument_kinds = {
        "0": {"constant": 1256},
        "1": {"constant": 1230, "frame-field": 26},
        "2": {"constant": 200, "frame-field": 28, "static-pointer": 1028},
        "3": {"constant": 1246, "frame-field": 10},
    }
    if (
        len(authored) != 1258
        or len(proven) != 1256
        or len(dialogue) != 40
        or modes != {0: 989, 1: 67, 2: 70, 3: 63, 4: 67}
        or dialogue_modes != {0: 24, 1: 4, 2: 4, 3: 4, 4: 4}
        or argument_kinds != expected_argument_kinds
        or result_comparisons != {0: 2, 2: 70}
        or Counter(len(call["arguments"]) for call in authored)
            != {0: 2, 4: 1256}
        or any(call["resultTarget"] is not None for call in authored)
    ):
        raise ValueError("operation-0x016d authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-016d-evidence-v1",
        "status": "exact-native-routes-query-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x016D,
            "operationHex": "0x016d",
            "handlerAddress": "0x0c16b358",
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
                    "mode": 0,
                    "forwardedArguments": [1, 2],
                    "ignoredArguments": [3],
                    "behavior": (
                        "Pass the current owner global value and arguments one "
                        "and two to helper 0x0c17a24e."
                    ),
                },
                {
                    "mode": 1,
                    "forwardedArguments": [1, 2, 3],
                    "ignoredArguments": [],
                    "behavior": "Pass arguments one through three to 0x0c17b210.",
                },
                {
                    "mode": 2,
                    "forwardedArguments": [],
                    "ignoredArguments": [1, 2, 3],
                    "behavior": (
                        "Return one when signed dword 0x0c224b20 is "
                        "nonnegative, otherwise return zero."
                    ),
                },
                {
                    "mode": 3,
                    "forwardedArguments": [],
                    "ignoredArguments": [1, 2, 3],
                    "behavior": "Call helper 0x0c17b1b6 without arguments.",
                },
                {
                    "mode": 4,
                    "forwardedArguments": [],
                    "ignoredArguments": [1, 2, 3],
                    "behavior": "Return without a helper call or state write.",
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "unresolvedMalformedCallCount": len(authored) - len(proven),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in proven}),
            "modeCounts": {
                str(mode): count for mode, count in sorted(modes.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
            "argumentKindCounts": argument_kinds,
            "resultComparisonModeCounts": {
                str(mode): count
                for mode, count in sorted(result_comparisons.items())
            },
        },
        "evidenceBoundary": [
            "The gameplay-domain ownership of helpers zero, one, and three remains unknown.",
            "Those three helpers remain mandatory injected adapters with their exact raw argument boundaries.",
            "The SNDT literal is retained as evidence and is not used to assign an audio semantic name.",
            "Mode two is implemented as the exact signed query over native dword 0x0c224b20.",
            "Mode four is implemented as the exact native no-op.",
            "Only 1,256 exact four-argument calls with constant modes zero through four are promoted.",
            "The two zero-argument calls remain unresolved.",
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
