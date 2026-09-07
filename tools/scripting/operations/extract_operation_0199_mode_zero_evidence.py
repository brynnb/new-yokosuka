#!/usr/bin/env python3
"""Verify operation 0x0199's three exact authored native modes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0199-mode-zero-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1573D6,
        132,
        "c9c23fc7153b4b5a92bbf75aabd418ce88f1387ca4298562aeecd85a9f392534",
    ),
    "modeZeroHelperSample": (
        0x0C0C8B70,
        160,
        "125fb15628ea403aa1b8a1226c42b77622096f252fa5a8d394e8aa42a5661d99",
    ),
    "modeOneHelper": (
        0x0C0C333A,
        6,
        "af6ab9ed54d78a104d7c1d35ed4efcb479fdd5c2e01e8bd4d5071d5bdcc51ded",
    ),
    "modeTwoHelper": (
        0x0C0C8B6A,
        6,
        "300519a0487edd44f0b880973b4da5b7a93273fcc998646f00235397eaf118b7",
    ),
    "objectResolverSample": (
        0x0C153956,
        64,
        "46e00fc5aa0eb86845d366f0eac4ad78ef1124d2aff4f210e8728b7f1d79e3cd",
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
                        and action.get("operationId") == 0x0199
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


def constant(call: dict[str, Any], index: int) -> int | None:
    if len(call["arguments"]) <= index:
        return None
    argument = call["arguments"][index]
    return argument.get("value") if argument.get("kind") == "constant" else None


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0199 {name} changed")
    dependencies = {
        "integerResultWriter": u32(data, 0x0C157500),
        "objectResolver": u32(data, 0x0C15751C),
        "modeZeroHelper": u32(data, 0x0C157520),
        "modeOneHelper": u32(data, 0x0C157524),
        "modeTwoHelper": u32(data, 0x0C157528),
    }
    if dependencies != {
        "integerResultWriter": 0x0C0BB342,
        "objectResolver": 0x0C153956,
        "modeZeroHelper": 0x0C0C8B70,
        "modeOneHelper": 0x0C0C333A,
        "modeTwoHelper": 0x0C0C8B6A,
    }:
        raise ValueError("operation-0x0199 dependencies changed")
    return {name: f"0x{address:08x}" for name, address in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    authored = operation_calls(event_ir)
    selected = [
        call for call in authored
        if len(call["arguments"]) == 6
        and constant(call, 0) == 0
        and all(
            argument.get("kind") == "constant"
            for argument in call["arguments"]
        )
    ]
    dialogue = [call for call in selected if call["dialogue"]]
    routes = Counter(
        (constant(call, 0), len(call["arguments"])) for call in authored
    )
    controls = Counter(constant(call, 1) for call in selected)
    result_comparison_routes = Counter(
        (constant(call, 0), len(call["arguments"]))
        for call in authored
        if call["resultComparison"] is not None
    )
    if (
        len(authored) != 141
        or len(selected) != 42
        or len(dialogue) != 42
        or routes != {(0, 6): 42, (1, 2): 96, (2, 1): 3}
        or controls != {0: 30, 1: 6, 539: 6}
        or result_comparison_routes != {(2, 1): 3}
        or any(
            call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x0199 authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-0199-evidence-v2",
        "status": "exact-native-three-mode-boundary-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0199,
            "operationHex": "0x0199",
            "handlerAddress": "0x0c1573d6",
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
                "For mode zero, resolves arguments two and three as objects "
                "and passes argument one, both resolved object pointers, and "
                "arguments four and five as exact float32 words to native "
                "helper 0x0c0c8b70. Mode one replaces the global dword at "
                "0x0c20bdec with argument one. Mode two reads and sign-extends "
                "the global byte at 0x0c20bf6c into the operation result."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenModeZeroCallCount": len(selected),
            "provenModeOneCallCount": routes[(1, 2)],
            "provenModeTwoCallCount": routes[(2, 1)],
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in selected}),
            "routeCounts": {
                f"mode-{mode}-argc-{argc}": count
                for (mode, argc), count in sorted(routes.items())
            },
            "modeZeroControlWordCounts": {
                str(value): count for value, count in sorted(controls.items())
            },
        },
        "evidenceBoundary": [
            "The mode-zero helper's global subsystem remains one mandatory injected adapter.",
            "Both object arguments retain their literal four-character identities.",
            "The two float32 operands are forwarded as raw words without inferred units.",
            "All 42 mode-zero calls are dialogue-region calls and have fully constant arguments.",
            "The mode-one control word and mode-two status byte retain raw subsystem names.",
            "No gameplay-domain name is assigned to operation 0x0199 or its control word.",
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
        f"{report['allDiscInventory']['authoredCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
