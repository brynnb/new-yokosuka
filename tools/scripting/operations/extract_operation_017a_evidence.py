#!/usr/bin/env python3
"""Verify operation 0x017a's exact three-route native control boundary."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-017a-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1636F6,
        64,
        "f26e3e4c9a98f08e03952464c156b7cb9b0b0b873b9a8f731ffbab3e0867a62a",
    ),
    "modeZeroHelper": (
        0x0C12E502,
        348,
        "0a805013964b29f8c37b4962962c77dce0c9888b2d80338f5657224501b376d7",
    ),
    "modeOneHelper": (
        0x0C12E65E,
        28,
        "a828464a8a518157344f821d4d67b81d0237ff2f2f3e81a4d38802037a96a337",
    ),
    "modeTwoHelper": (
        0x0C12E67A,
        100,
        "c77eef6625064648ed2f4355287748050505ec3db066e4fe13e10632be79b2ad",
    ),
    "stateReader": (
        0x0C12E6DE,
        92,
        "5255b320d4c8c32fe9ee0721b37a94ab1943c15187256ab2a83a806beac76075",
    ),
    "stateWriter": (
        0x0C12E73A,
        92,
        "d6b76b6f7dea312f087f85c6c740fd0198bbdd9872de283f4bb6c7e469e8d0fb",
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
                        and action.get("operationId") == 0x017A
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


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x017a {name} changed")
    dependencies = {
        "modeZeroHelper": u32(data, 0x0C1637D0),
        "modeOneHelper": u32(data, 0x0C1637D4),
        "modeTwoHelper": u32(data, 0x0C1637D8),
    }
    if dependencies != {
        "modeZeroHelper": 0x0C12E502,
        "modeOneHelper": 0x0C12E65E,
        "modeTwoHelper": 0x0C12E67A,
    }:
        raise ValueError("operation-0x017a dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [
        call for call in authored
        if len(call["arguments"]) == 3
        and constant(call["arguments"][0]) in (0, 1, 2)
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
        for index in range(3)
    }
    if (
        len(authored) != 916
        or len(proven) != 915
        or len(dialogue) != 49
        or modes != {0: 338, 1: 376, 2: 201}
        or dialogue_modes != {0: 29, 1: 1, 2: 19}
        or argument_kinds != {
            "0": {"constant": 915},
            "1": {"constant": 913, "frame-field": 2},
            "2": {"constant": 915},
        }
        or Counter(len(call["arguments"]) for call in authored) != {0: 1, 3: 915}
        or any(
            call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x017a authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-017a-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x017A,
            "operationHex": "0x017a",
            "handlerAddress": "0x0c1636f6",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": dependencies,
            "routes": [
                {
                    "mode": 0,
                    "argumentCount": 3,
                    "forwardedArguments": [1, 2],
                    "behavior": (
                        "Pass argument one and argument two to helper "
                        "0x0c12e502."
                    ),
                },
                {
                    "mode": 1,
                    "argumentCount": 3,
                    "forwardedArguments": [],
                    "behavior": (
                        "Call helper 0x0c12e65e; authored arguments one "
                        "and two are ignored."
                    ),
                },
                {
                    "mode": 2,
                    "argumentCount": 3,
                    "forwardedArguments": [1],
                    "behavior": (
                        "Pass argument one to helper 0x0c12e67a; authored "
                        "argument two is ignored."
                    ),
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
        },
        "evidenceBoundary": [
            "The shared helper subsystem remains one mandatory injected adapter.",
            "No gameplay-domain name is assigned to its opaque native state.",
            "No fixed globals are assigned to browser persistence without ownership evidence.",
            "Mode-one padding and mode-two argument two are not forwarded because the native handler ignores them.",
            "Only the 915 exact three-argument calls with constant mode zero, one, or two are promoted.",
            "The single zero-argument call remains unresolved.",
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
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
