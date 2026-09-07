#!/usr/bin/env python3
"""Verify authored 0x0184 signed-word quotient and remainder queries."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/global-signed-word-divmod-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C163736,
        198,
        "96406693d51f2489944edfaa0c97369d59b493d127ce2f017e2b6499b5cb428d",
    ),
    "wordReader": (
        0x0C142944,
        6,
        "64cb9e075ae324a94271f8e5db386f970a0cadf4718a2128e40acdafba765790",
    ),
    "quotient": (
        0x0C1DC294,
        178,
        "65bbe921fccb7fec493bfe9b2c1bf120b6571abb593784738af827ae8629f774",
    ),
    "remainder": (
        0x0C1DC440,
        198,
        "76dd71db7d1b54a272ad18ea0a917a8b548a21d5f48240c712e11348ac0cdd37",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
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
                        or action.get("operationId") != 0x0184
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def constant_argument(call: dict[str, Any], index: int) -> int | None:
    arguments = call["arguments"]
    if index >= len(arguments) or arguments[index].get("kind") != "constant":
        return None
    return arguments[index].get("value")


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0184 {name} changed")
    literals = {
        "wordReader": u32(executable, 0x0C1637DC),
        "remainderRoutine": u32(executable, 0x0C1637E0),
        "quotientRoutine": u32(executable, 0x0C1637E4),
        "wordAddress": u32(executable, 0x0C142980),
    }
    if literals != {
        "wordReader": 0x0C142944,
        "remainderRoutine": 0x0C1DC440,
        "quotientRoutine": 0x0C1DC294,
        "wordAddress": 0x0C22020C,
    }:
        raise ValueError("operation-0x0184 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [
        call for call in calls
        if (
            len(call["arguments"]) == 2
            and constant_argument(call, 0) in {0, 1}
            and constant_argument(call, 1) == 0
        )
    ]
    if len(calls) != 528 or len(selected) != 528:
        raise ValueError("operation-0x0184 authored inventory changed")
    mode_counts = Counter(constant_argument(call, 0) for call in selected)
    dialogue_mode_counts = Counter(
        constant_argument(call, 0)
        for call in selected
        if call["dialogueRegion"]
    )
    if mode_counts != {0: 201, 1: 327}:
        raise ValueError("operation-0x0184 mode inventory changed")
    if dialogue_mode_counts != {0: 51, 1: 93}:
        raise ValueError("operation-0x0184 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-global-signed-word-divmod-operation-evidence-v1",
        "status": "exact-native-divmod-routines-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0184,
            "operationHex": "0x0184",
            "handlerAddress": "0x0c163736",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "sourceWord": {
                "address": "0x0c22020c",
                "width": 2,
                "signed": True,
            },
            "authoredModes": [
                {
                    "mode": 0,
                    "semantic": "signed remainder after division by 10",
                },
                {
                    "mode": 1,
                    "semantic": (
                        "signed quotient after division by 10, truncated "
                        "toward zero"
                    ),
                },
            ],
            "ignoredAuthoredArgument": {
                "index": 1,
                "value": 0,
            },
            "provenBehavior": (
                "Reads the signed 16-bit global word at 0x0c22020c. Authored "
                "mode zero returns its signed remainder after division by "
                "ten; authored mode one returns its signed quotient truncated "
                "toward zero."
            ),
        },
        "allDiscInventory": {
            "callCount": len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "modeCounts": {
                str(mode): count for mode, count in sorted(mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_mode_counts.items())
            },
        },
        "evidenceBoundary": [
            "Only the two exact authored mode forms receive semantics; the executable's unauthored mode two is not promoted.",
            "The global word's owning gameplay subsystem remains unnamed.",
            "Signed quotient and remainder behavior comes from the exact SH-4 division routines, not a decimal-display guess.",
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
        json.loads(args.event_ir.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['callCount']} calls"
    )


if __name__ == "__main__":
    main()
