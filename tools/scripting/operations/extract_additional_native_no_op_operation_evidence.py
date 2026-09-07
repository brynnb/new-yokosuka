#!/usr/bin/env python3
"""Verify additional complete four-byte native no-op operation handlers."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/additional-native-no-op-operation-evidence.json"
BASE = 0x0C010000
TABLE = 0x0C29A9E0
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER_BYTES = bytes.fromhex("0b000900")
HANDLER_SHA256 = "551572a9f87a0af199dced20f1d78fc9ddb31537c3a7ce5b747bfedb295ab1e9"
OPERATIONS = {
    0x00CD: {"handler": 0x0C155D66, "calls": 8, "areas": 4, "argc": {2: 8}},
    0x0141: {"handler": 0x0C165800, "calls": 6, "areas": 3, "argc": {2: 6}},
    0x0182: {"handler": 0x0C173188, "calls": 8, "areas": 3, "argc": {3: 8}},
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def calls_by_operation(event_ir: dict[str, Any]) -> dict[int, list[dict[str, Any]]]:
    result = {operation: [] for operation in OPERATIONS}
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    operation = action.get("operationId")
                    if action.get("kind") == "engineOperation" and operation in result:
                        result[operation].append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "argc": len(action.get("arguments", [])),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return result


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    authored = calls_by_operation(event_ir)
    inventory = []
    for operation, expected in OPERATIONS.items():
        handler = runtime_slice(data, expected["handler"], 4)
        table_handler = struct.unpack("<I", runtime_slice(data, TABLE + operation * 4, 4))[0]
        calls = authored[operation]
        if (
            handler != HANDLER_BYTES
            or hashlib.sha256(handler).hexdigest() != HANDLER_SHA256
            or table_handler != expected["handler"]
            or len(calls) != expected["calls"]
            or len({(call["disc"], call["area"]) for call in calls}) != expected["areas"]
            or Counter(call["argc"] for call in calls) != expected["argc"]
            or any(call["dialogue"] or call["resultComparison"] is not None
                   or call["resultTarget"] is not None for call in calls)
        ):
            raise ValueError(f"operation-0x{operation:04x} no-op evidence changed")
        inventory.append({
            "operationId": operation,
            "operationHex": f"0x{operation:04x}",
            "tableEntryAddress": f"0x{TABLE + operation * 4:08x}",
            "handlerAddress": f"0x{expected['handler']:08x}",
            "handlerBytesHex": HANDLER_BYTES.hex(),
            "handlerSha256": HANDLER_SHA256,
            "authoredCallCount": len(calls),
            "areaCount": expected["areas"],
            "argumentCountRoutes": {str(k): v for k, v in expected["argc"].items()},
        })
    return {
        "schema": "new-yokosuka-additional-native-no-op-operation-evidence-v1",
        "status": "exact-complete-native-no-ops-and-all-disc-inventory",
        "source": {"executable": "1ST_READ.BIN", "executableSha256": EXECUTABLE_SHA256,
                   "eventIr": ".disc-work/dialogue/native-event-ir.json"},
        "provenBehavior": "Each complete handler is exactly the SH-4 sequence rts; nop and cannot inspect operands, mutate state, or produce a result.",
        "operations": inventory,
        "evidenceBoundary": [
            "Only dispatch entries whose complete handlers are the exact four-byte return sequence are included.",
            "Authored operands are intentionally not resolved because native code cannot observe them.",
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
    print(f"Wrote {args.out}: {len(report['operations'])} exact no-op operations")


if __name__ == "__main__":
    main()
