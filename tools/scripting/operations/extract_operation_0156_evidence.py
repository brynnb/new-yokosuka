#!/usr/bin/env python3
"""Recover operation 0x0156's exact FENS envelope contract and corpus use."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0156-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER_ADDRESS = 0x0C163656
HANDLER_LENGTH = 52
HANDLER_SHA256 = "6b5b746331064a7d4390e8fe7ba167eaeb2f06f4b3a2b6317cf3f51548827338"
TABLE_ENTRY_ADDRESS = 0x0C29AF38
MODE_ZERO_HELPER = (0x0C17ED38, 138, "89faf09fb1f9b54fa5b39a04598949bf28728e08c68560647481d832d3581227")
MODE_ONE_HELPER = (0x0C17EDC2, 42, "0461e42cc2c3644ddd0d9c1ef64e7c30aef86d830f1313453fd10a0b6ac92fcc")
POINTERS = {
    "modeZeroHelper": (0x0C1637B4, MODE_ZERO_HELPER[0]),
    "modeOneHelper": (0x0C1637B8, MODE_ONE_HELPER[0]),
    "singleton": (0x0C17EDF8, 0x0C224CD0),
    "selectorByte": (0x0C17EE28, 0x0C224D20),
    "stepWord": (0x0C17EE2C, 0x0C224D1E),
    "divisionHelper": (0x0C17EE30, 0x0C1DC294),
    "levelWord": (0x0C17EE34, 0x0C224D1C),
    "directionByte": (0x0C17EE38, 0x0C224D21),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def calls_for(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x0156:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(data, TABLE_ENTRY_ADDRESS) != HANDLER_ADDRESS:
        raise ValueError("operation 0x0156 dispatch table entry changed")
    if digest(runtime_slice(data, HANDLER_ADDRESS, HANDLER_LENGTH)) != HANDLER_SHA256:
        raise ValueError("operation 0x0156 handler changed")
    for label, (address, length, expected) in {
        "mode-zero": MODE_ZERO_HELPER,
        "mode-one": MODE_ONE_HELPER,
    }.items():
        if digest(runtime_slice(data, address, length)) != expected:
            raise ValueError(f"operation 0x0156 {label} helper changed")
    for label, (address, expected) in POINTERS.items():
        if u32(data, address) != expected:
            raise ValueError(f"operation 0x0156 {label} dependency changed")
    return {
        "operationId": 0x0156,
        "operationHex": "0x0156",
        "tableEntryAddress": f"0x{TABLE_ENTRY_ADDRESS:08x}",
        "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
        "handlerLength": HANDLER_LENGTH,
        "handlerSha256": HANDLER_SHA256,
        "modeHelpers": {
            "0": f"0x{MODE_ZERO_HELPER[0]:08x}",
            "1": f"0x{MODE_ONE_HELPER[0]:08x}",
        },
        "nativeState": {
            label: f"0x{expected:08x}"
            for label, (_, expected) in POINTERS.items()
            if label not in {"modeZeroHelper", "modeOneHelper", "divisionHelper"}
        },
        "divisionHelper": f"0x{POINTERS['divisionHelper'][1]:08x}",
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    operation = verify_executable(data)
    calls = calls_for(event_ir)
    if len(calls) != 16:
        raise ValueError("operation 0x0156 authored inventory changed")
    if any(
        len(call["arguments"]) != 3
        or any(argument.get("kind") != "constant" for argument in call["arguments"])
        or call["resultComparison"] is not None
        or call["resultTarget"] is not None
        for call in calls
    ):
        raise ValueError("operation 0x0156 authored ABI changed")
    route_counts = Counter(tuple(constant(argument) for argument in call["arguments"]) for call in calls)
    expected = {
        (0, 5, 60): 4,
        (0, 5, 80): 2,
        (0, 9, 1): 1,
        (1, 0, 1): 4,
        (1, 0, 50): 1,
        (1, 0, 60): 4,
    }
    if route_counts != expected:
        raise ValueError("operation 0x0156 authored routes changed")
    return {
        "schema": "new-yokosuka-native-operation-0156-evidence-v1",
        "status": "exact-native-fens-envelope-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": operation,
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "routeCounts": {
                ",".join(map(str, route)): count
                for route, count in sorted(route_counts.items())
            },
            "calls": calls,
        },
        "evidenceBoundary": [
            "The operation has an exact three-word ABI: mode, selector, and duration.",
            "Mode zero creates the FENS singleton only when absent, stores the selector byte, computes floor(256 / duration), starts at level zero, and selects the rising route.",
            "Mode one recomputes floor(256 / duration), starts at level 255, and selects the falling route; its selector operand is not consumed by the native helper.",
            "The engine-owned FENS update advances or reduces the level by the computed step and clamps it to the native 0..255 range.",
            "No authored call reads an operation result.",
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
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
