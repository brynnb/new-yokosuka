#!/usr/bin/env python3
"""Verify all authored operation 0x018a controller routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-018a-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C16B150, 142, "bfe92ddb52fa8b2cde4fc6acbb2eac6f63820b084f360e21fb7ef6538f3a2c76"),
    "slotController": (0x0C17B862, 72, "12623ad42c5ab832556087aa3e2885837afeed66387ea236209dfad1b0635406"),
    "primaryInitialize": (0x0C17B8BC, 186, "9e94a0e6cc11a831590d0d9534b24e8c5b83d0a6828aecc8efce9f842b5ea123"),
    "secondaryInitialize": (0x0C17BA50, 44, "f7e664cff9d25d658d130c183cddfb3e311c28081e17947e868c31d24c738816"),
}
LITERALS = {
    0x0C16B224: 0x0C17A91C,
    0x0C16B234: 0x0C17B862,
    0x0C16B238: 0x0C17A920,
    0x0C16B23C: 0x0C17B8BC,
    0x0C16B240: 0x0C17BA50,
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def verify_executable(data: bytes) -> None:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if hashlib.sha256(runtime_slice(data, address, size)).hexdigest() != expected:
            raise ValueError(f"operation-0x018a {name} changed")
    for address, expected in LITERALS.items():
        if struct.unpack("<I", runtime_slice(data, address, 4))[0] != expected:
            raise ValueError(f"operation-0x018a literal 0x{address:08x} changed")


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"disc": item["disc"], "area": item["area"], "arguments": action["arguments"]}
        for item in event_ir["maps"]
        for function in item["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("kind") == "engineOperation" and action.get("operationId") == 0x018A
    ]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(executable)
    authored = calls(event_ir)
    modes = Counter(call["arguments"][0].get("value") for call in authored)
    if len(authored) != 111 or modes != Counter({0: 56, 1: 28, 2: 24, 3: 3}):
        raise ValueError("operation-0x018a authored inventory changed")
    if any(len(call["arguments"]) != 2 for call in authored):
        raise ValueError("operation-0x018a argument count changed")
    if any(
        call["arguments"][1].get("value") != (0x5DA8 if mode == 0 else 0x5EA8)
        for call in authored
        for mode in [call["arguments"][0].get("value")]
        if mode in (0, 1)
    ):
        raise ValueError("operation-0x018a allocation selector changed")
    if any(
        call["arguments"][1].get("kind") not in ("constant", "frame-field")
        for call in authored
        if call["arguments"][0].get("value") in (2, 3)
    ):
        raise ValueError("operation-0x018a slot operand changed")
    return {
        "schema": "new-yokosuka-operation-018a-evidence-v1",
        "status": "exact-native-all-authored-routes",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x018A,
            "operationHex": "0x018a",
            "handlerAddress": "0x0c16b150",
            "routes": {
                "0": "Allocates 0x09a0 bytes with unit count 25, installs selector 0x5da8, initializes sixteen 44-byte slots, and registers controller one for slots one through sixteen.",
                "1": "Allocates 0x09a0 bytes with unit count 50, installs selector 0x5ea8, registers controller three for slots three through one, and sets its initialized marker.",
                "2": "Resets one primary slot to words 0, 0, 127, and -1 and re-registers controller one; selectors above sixteen execute the helper for all sixteen slots in descending order.",
                "3": "Writes one to the selected primary slot's record word only when its resource word at offset +8 is non-null.",
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "modeCounts": {str(mode): count for mode, count in sorted(modes.items())},
        },
        "evidenceBoundary": [
            "Controller IDs, allocation sizes, unit counts, slot count, registration order, and slot mutations are executable-proven.",
            "No rendering or gameplay meaning is assigned to the controller records.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
