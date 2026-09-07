#!/usr/bin/env python3
"""Verify operation 0x0187 as the native four-word area-request writer."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/area-request-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16B4B6,
        18,
        "7ecdec47cb8ac045ed35b12ea7770da9caa33089a3089b781195c084538a0226",
    ),
    "recordWriter": (
        0x0C0F0A86,
        64,
        "6212208736951a210d49f003f00699f081228f91c9867f0555bf578b8f18e770",
    ),
}


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
                    if action.get("operationId") != 0x0187:
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
    for name, (address, size, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, size)) != digest:
            raise ValueError(f"operation-0x0187 {name} changed")
    if u32(executable, 0x0C16B6A0) != 0x0C0F0A86:
        raise ValueError("operation-0x0187 record-writer target changed")

    calls = operation_calls(event_ir)
    if len(calls) != 15:
        raise ValueError("operation-0x0187 authored inventory changed")
    if any(
        len(call["arguments"]) != 4
        or any(argument.get("kind") != "constant" for argument in call["arguments"])
        for call in calls
    ):
        raise ValueError("operation-0x0187 argument shapes changed")
    areas = sorted({(call["disc"], call["area"]) for call in calls})
    op02_calls = [
        {
            "callFileOffset": call["callFileOffset"],
            "words": [argument["value"] for argument in call["arguments"]],
        }
        for call in calls
        if call["disc"] == 1 and call["area"] == "OP02"
    ]
    if op02_calls != [
        {"callFileOffset": "0x1a26", "words": [4, 1, 0x3230504F, 49]},
        {"callFileOffset": "0x24c0", "words": [4, 1, 0x3230504F, 0]},
    ]:
        raise ValueError("OP02 operation-0x0187 route changed")

    return {
        "schema": "new-yokosuka-area-request-operation-evidence-v1",
        "status": "exact-native-record-write-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0187,
            "operationHex": "0x0187",
            "handlerAddress": "0x0c16b4b6",
            "recordWriterAddress": "0x0c0f0a86",
            "recordWrites": [
                {"argument": 2, "offset": "0xd0"},
                {"argument": 1, "offset": "0xd4"},
                {"argument": 3, "offset": "0xd8"},
                {"argument": 0, "offset": "0xdc"},
            ],
            "pendingFlag": {"offset": "0xcc", "orMask": "0x00000001"},
            "provenBehavior": (
                "Writes all four arguments unchanged to the current native "
                "area-request record at offsets +0xdc, +0xd4, +0xd0, and "
                "+0xd8 respectively, then sets bit zero at +0xcc."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "areaCount": len(areas),
            "areas": [
                {"disc": disc, "area": area} for disc, area in areas
            ],
            "op02Calls": op02_calls,
        },
        "evidenceBoundary": [
            "The four record words remain named by their executable offsets; their higher-level enum meanings are not guessed.",
            "The operation records a request. A separate presentation owner must decide when and how to consume the pending record.",
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
