#!/usr/bin/env python3
"""Recover operation 0x014b's exact two-byte global-state contract."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-014b-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
TABLE_ENTRY_ADDRESS = 0x0C29AF0C
HANDLER_ADDRESS = 0x0C16360A
HANDLER_LENGTH = 14
HANDLER_SHA256 = "c28a3c9cd7ccb8c0b31f1f968c4b22f565288c1039e06dfb4fa4f3153a5bd7c6"
HELPER_ADDRESS = 0x0C17F6A2
HELPER_LENGTH = 32
HELPER_SHA256 = "f39519a3a1a904aea8147231d84bece1ca26b33f7e5f60f7a719f9ecb54e7c81"
MODE_ADDRESS = 0x0C224DD2
DEPENDENT_ADDRESS = 0x0C224DD3


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls_for(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x014B:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(data, TABLE_ENTRY_ADDRESS) != HANDLER_ADDRESS:
        raise ValueError("operation 0x014b dispatch table entry changed")
    if digest(runtime_slice(data, HANDLER_ADDRESS, HANDLER_LENGTH)) != HANDLER_SHA256:
        raise ValueError("operation 0x014b handler changed")
    if digest(runtime_slice(data, HELPER_ADDRESS, HELPER_LENGTH)) != HELPER_SHA256:
        raise ValueError("operation 0x014b helper changed")
    if u32(data, 0x0C1637A0) != HELPER_ADDRESS:
        raise ValueError("operation 0x014b helper pointer changed")
    if u32(data, 0x0C17F6E8) != MODE_ADDRESS:
        raise ValueError("operation 0x014b mode pointer changed")
    if u32(data, 0x0C17F6C8) != DEPENDENT_ADDRESS:
        raise ValueError("operation 0x014b dependent pointer changed")

    calls = calls_for(event_ir)
    routes = Counter()
    for call in calls:
        arguments = call["arguments"]
        if (
            len(arguments) != 1
            or arguments[0].get("kind") != "constant"
            or call["resultComparison"] is not None
            or call["resultTarget"] is not None
        ):
            raise ValueError("operation 0x014b authored ABI changed")
        routes[arguments[0]["value"]] += 1
    if routes != Counter({1: 3, 2: 2, 6: 3, 7: 6, 8: 2}):
        raise ValueError("operation 0x014b authored routes changed")

    return {
        "schema": "new-yokosuka-native-operation-014b-evidence-v1",
        "status": "exact-native-two-byte-global-control-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x014B,
            "operationHex": "0x014b",
            "tableEntryAddress": f"0x{TABLE_ENTRY_ADDRESS:08x}",
            "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "helperAddress": f"0x{HELPER_ADDRESS:08x}",
            "helperLength": HELPER_LENGTH,
            "helperSha256": HELPER_SHA256,
            "modeAddress": f"0x{MODE_ADDRESS:08x}",
            "dependentAddress": f"0x{DEPENDENT_ADDRESS:08x}",
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "routeCounts": {str(route): count for route, count in sorted(routes.items())},
            "calls": calls,
        },
        "evidenceBoundary": [
            "The handler forwards the low byte of its sole argument to the exact native helper.",
            "The helper writes the requested byte only when the current mode is not four.",
            "After that ownership check, current modes four and five clear the adjacent dependent byte.",
            "All sixteen authored calls use one constant argument and consume no result.",
            "The gameplay meaning of either byte is not inferred from this state mutation.",
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
