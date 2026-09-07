#!/usr/bin/env python3
"""Verify operation 0x0032 as the native controller-record field query."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/controller-input-query-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C16B53C
HANDLER_LENGTH = 186
HANDLER_SHA256 = (
    "ef92e47cebb73fa61d862a40249c6638c429a448f010e68041ed4f8c90aedd99"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x0032:
                        continue
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                    })
    return calls


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(runtime_slice(
        executable, HANDLER_ADDRESS, HANDLER_LENGTH
    )) != HANDLER_SHA256:
        raise ValueError("operation-0x0032 handler changed")
    if u32(executable, 0x0C16B6B0) != 0x0C21D9B8:
        raise ValueError("native controller record table changed")
    if u32(executable, 0x0C16B6AC) != 0x0C0BB342:
        raise ValueError("operation result writer changed")

    calls = operation_calls(event_ir)
    if len(calls) != 35:
        raise ValueError("operation-0x0032 authored inventory changed")
    pairs = Counter()
    for call in calls:
        arguments = call["arguments"]
        if len(arguments) != 2 or any(
            argument.get("kind") != "constant" for argument in arguments
        ):
            raise ValueError("operation-0x0032 argument shapes changed")
        pairs[(arguments[0]["value"], arguments[1]["value"])] += 1
    if any(index not in range(4) or selector not in range(3) for index, selector in pairs):
        raise ValueError("operation-0x0032 authored selector range changed")
    op02_calls = [
        {
            "callFileOffset": call["callFileOffset"],
            "recordIndex": call["arguments"][0]["value"],
            "fieldSelector": call["arguments"][1]["value"],
        }
        for call in calls
        if call["disc"] == 1 and call["area"] == "OP02"
    ]
    if op02_calls != [{
        "callFileOffset": "0x1952",
        "recordIndex": 0,
        "fieldSelector": 0,
    }]:
        raise ValueError("OP02 operation-0x0032 route changed")

    return {
        "schema": "new-yokosuka-controller-input-query-operation-evidence-v1",
        "status": "exact-native-record-query-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0032,
            "operationHex": "0x0032",
            "handlerAddress": "0x0c16b53c",
            "recordTableAddress": "0x0c21d9b8",
            "recordCount": 4,
            "recordStride": 20,
            "selectors": [
                {"selector": 0, "offset": "0x04", "width": 2},
                {"selector": 1, "offset": "0x08", "width": 2},
                {"selector": 2, "offset": "0x0a", "width": 2},
                {"selector": 3, "offset": "0x0c", "width": 1},
                {"selector": 4, "offset": "0x0d", "width": 1},
                {"selector": 5, "offset": "0x0e", "width": 1},
                {"selector": 6, "offset": "0x0f", "width": 1},
                {"selector": 7, "offset": "0x12", "width": 2},
            ],
            "provenBehavior": (
                "Reads one unsigned byte or word from the selected 20-byte "
                "controller record and writes it to the interpreter result."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "pairCounts": {
                f"{index}:{selector}": count
                for (index, selector), count in sorted(pairs.items())
            },
            "op02Calls": op02_calls,
        },
        "evidenceBoundary": [
            "The operation exposes raw controller record fields; button-name mapping belongs to the input adapter.",
            "Only selectors zero through two are authored, while the complete handler proves all eight field layouts.",
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
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
