#!/usr/bin/env python3
"""Verify operation 0x012c's complete native no-op contract."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-012c-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C1731CA
HANDLER_BYTES = bytes.fromhex("0b000900")
HANDLER_SHA256 = (
    "551572a9f87a0af199dced20f1d78fc9ddb31537c3a7ce5b747bfedb295ab1e9"
)


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
                        and action.get("operationId") == 0x012C
                    ):
                        result.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "argumentCount": len(action.get("arguments", [])),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return result


def verify_executable(data: bytes) -> None:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    handler = runtime_slice(data, HANDLER_ADDRESS, len(HANDLER_BYTES))
    if handler != HANDLER_BYTES or digest(handler) != HANDLER_SHA256:
        raise ValueError("operation-0x012c no-op handler changed")
    if u32(data, 0x0C29AE90) != HANDLER_ADDRESS:
        raise ValueError("operation-0x012c dispatch-table entry changed")


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(data)
    authored = operation_calls(event_ir)
    argument_counts = Counter(call["argumentCount"] for call in authored)
    if (
        len(authored) != 352
        or argument_counts != {1: 1, 2: 351}
        or len({(call["disc"], call["area"]) for call in authored}) != 96
        or any(
            call["dialogue"]
            or call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x012c authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-012c-evidence-v1",
        "status": "exact-complete-native-no-op-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x012C,
            "operationHex": "0x012c",
            "tableEntryAddress": "0x0c29ae90",
            "handlerAddress": "0x0c1731ca",
            "handlerLength": len(HANDLER_BYTES),
            "handlerBytesHex": HANDLER_BYTES.hex(),
            "handlerSha256": HANDLER_SHA256,
            "provenBehavior": (
                "The complete handler is the SH-4 sequence rts; nop. It does "
                "not inspect r4, r5, or memory and has no result or side effect."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "argumentCountRoutes": {
                str(count): frequency
                for count, frequency in sorted(argument_counts.items())
            },
        },
        "evidenceBoundary": [
            "Both authored argument shapes are accepted because the complete native handler cannot observe either operand.",
            "No gameplay-domain meaning is inferred for the unused operation identifier.",
            "The runtime executes the no-op without resolving authored operands.",
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
        f"{report['allDiscInventory']['authoredCallCount']} proven no-op calls"
    )


if __name__ == "__main__":
    main()
