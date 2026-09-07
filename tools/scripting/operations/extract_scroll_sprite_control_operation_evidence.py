#!/usr/bin/env python3
"""Verify operation 0x00b4 SCRL allocation and control semantics."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/scroll-sprite-control-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C16B016, 140, "d70780ab47308d9092da2d602643824e8765347fd7f531bd0f83ddf2bf94a5df"),
    "mode0": (0x0C099E42, 216, "9c1f0e75e3d4bc71a7cce5b037d3916376ab7b391405b4d319f1a7e641b754df"),
    "mode1": (0x0C099F1A, 114, "fad7297ff3c6d89eeba135ea5f44c4d3be5bb66360a1d8033e8036e0dcae2eaa"),
    "mode2": (0x0C099FD0, 142, "0b2e73b94d44b2c1cfb78f96cf3e6e52e8318fb4c2eda9107727ee0e0a5ce8a8"),
    "mode3": (0x0C09B54A, 162, "28ec13c1e723e0a0fc944bd363c97e97685b0920ec32c58f64dda2bf6837b769"),
    "mode4": (0x0C09B40E, 8, "43a005c5f5ede143df990375563b928213cf4ad82fd834851ffb8a3570385f3d"),
    "mode5": (0x0C09B41C, 8, "c3a994e2e000db090ee46c3bcc77cd2238ebb0aea93776930c7c913f3ddce79f"),
    "cameraRegisteredHorizontalProjection": (0x0C09A374, 88, "c7a0ad28e52892c1af322208e22663899e7adeeba7eaf72c4078b5a6e799fa9b"),
    "cameraRegisteredVerticalProjection": (0x0C09A4FC, 104, "d429c086ec78fce541613f0d74f6ef48a6a318b055dc9c3d1d6d035f01c2bf69"),
}
LITERALS = {
    0x0C29ACB0: 0x0C16B016,
    0x0C16B0FC: 0x0C099FD0,
    0x0C16B0F4: 0x0C099E42,
    0x0C16B0F8: 0x0C099F1A,
    0x0C16B100: 0x0C09B54A,
    0x0C16B104: 0x0C09B40E,
    0x0C16B108: 0x0C09B41C,
    0x0C09B5F0: 0x0C1F7158,
    0x0C09B5F4: 0x0C1F715C,
    0x0C09A49C: 0x0C1F7110,
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def verify_native_contract(executable: bytes) -> None:
    if hashlib.sha256(executable).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if hashlib.sha256(runtime_slice(executable, address, size)).hexdigest() != expected:
            raise ValueError(f"operation-0x00b4 {name} changed")
    for address, expected in LITERALS.items():
        if struct.unpack("<I", runtime_slice(executable, address, 4))[0] != expected:
            raise ValueError(f"operation-0x00b4 literal 0x{address:08x} changed")


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"disc": item["disc"], "area": item["area"], "arguments": action["arguments"]}
        for item in event_ir["maps"]
        for function in item["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("kind") == "engineOperation"
        and action.get("operationId") == 0x00B4
    ]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_native_contract(executable)
    calls = operation_calls(event_ir)
    modes = Counter(call["arguments"][0].get("value") for call in calls)
    if (
        len(calls) != 103
        or modes != Counter({0: 77, 1: 2, 2: 5, 3: 3, 4: 7, 5: 9})
        or any(argument.get("kind") != "constant" for call in calls if call["arguments"][0]["value"] >= 2 for argument in call["arguments"])
        or any(
            len(call["arguments"]) != (3 if call["arguments"][0]["value"] == 0 else 4)
            or call["arguments"][1].get("kind") != "static-pointer"
            or call["arguments"][2].get("kind") != "static-pointer"
            or (
                call["arguments"][0]["value"] == 1
                and call["arguments"][3].get("value") not in (1, 2)
            )
            for call in calls
            if call["arguments"][0]["value"] in (0, 1)
        )
    ):
        raise ValueError("operation-0x00b4 authored inventory changed")
    return {
        "schema": "new-yokosuka-scroll-sprite-control-operation-evidence-v2",
        "status": "exact-native-all-modes-and-complete-authored-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00B4,
            "operationHex": "0x00b4",
            "handlerAddress": "0x0c16b016",
            "resourceTag": "SCRL",
            "provenModes": {
                "0": "Resolves two static strings, loads their SCRL resource, and installs it in fixed native slot zero.",
                "1": "Resolves two static strings, loads their SCRL resource, and replaces the explicit slot-zero-through-two argument.",
                "2": "For slot indices below three, releases an active SCRL slot; inactive slots are native no-ops.",
                "3": "For slot indices below three, requests its timed SCRL transition when the slot is active and the global transition lock is clear.",
                "4": "Sign-extends argument one from 16 bits and writes global dword 0x0c1f7158.",
            "5": "Sign-extends argument one from 16 bits and writes global dword 0x0c1f715c.",
        },
        "renderer": {
            "address": "0x0c09a358",
            "behavior": "Reads the live camera orientation, adds SCRL +0x48/+0x4c (globals 0x0c1f7158/0x0c1f715c), and rebuilds the projected backdrop vertices every rendered frame.",
        },
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "modeCounts": {str(mode): count for mode, count in sorted(modes.items())},
            "provenModeCallCount": len(calls),
        },
        "evidenceBoundary": [
            "All six authored modes are executable-proven across the complete three-disc inventory.",
            "Mode zero's slot is fixed by the helper's literal zero; mode one rejects explicit slots at or above three.",
            "The native renderer consumes both signed fields with the live camera orientation before rebuilding backdrop geometry; they are camera-registration angles, not inert scene state.",
            "The exact native curved-vertex tessellation is represented by equivalent perspective-aware screen-backdrop registration; no terrain-attached OP02 special case is used.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: {report['allDiscInventory']['provenModeCallCount']} proven calls")


if __name__ == "__main__":
    main()
