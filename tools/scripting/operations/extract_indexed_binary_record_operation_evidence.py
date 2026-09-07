#!/usr/bin/env python3
"""Verify operation 0x0065's indexed binary-record write contract."""

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
    / "tools/evidence/indexed-binary-record-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16448E,
        60,
        "1811c42da5ffea7d6bfeb993a06df91d7a90e8a111cda2e2793d492c41035af2",
    ),
    "indexedWriter": (
        0x0C0EAF8E,
        122,
        "88d9614f5750b974c754c2a9b6261884e703af4705841260e363e3cb31efe640",
    ),
    "lowIndexCallback": (
        0x0C1CFA50,
        110,
        "0959dbad09b83e2ec57f2d094142d5ba248f98ddffc78b1c8fccee1711c9e818",
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
                        or action.get("operationId") != 0x0065
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0065 {name} changed")
    literals = {
        "queryHandler": u32(executable, 0x0C1644D0),
        "resultWriter": u32(executable, 0x0C1644D4),
        "indexedWriter": u32(executable, 0x0C1644D8),
        "primaryTablePointer": u32(executable, 0x0C0EB0CC),
        "mirrorTablePointer": u32(executable, 0x0C0EB0D0),
        "lowIndexCallback": u32(executable, 0x0C0EB0D4),
        "callbackRecordTable": u32(executable, 0x0C1CFB8C),
        "classZeroBits": u32(executable, 0x0C1CFB90),
        "classOneBits": u32(executable, 0x0C1CFB94),
        "combinedBits": u32(executable, 0x0C1CFB98),
    }
    if literals != {
        "queryHandler": 0x0C0EB008,
        "resultWriter": 0x0C0BB342,
        "indexedWriter": 0x0C0EAF8E,
        "primaryTablePointer": 0x0C28AD08,
        "mirrorTablePointer": 0x0C28AD0C,
        "lowIndexCallback": 0x0C1CFA50,
        "callbackRecordTable": 0x0C22DF00,
        "classZeroBits": 0x0C2A1D70,
        "classOneBits": 0x0C2A1D74,
        "combinedBits": 0x0C2A1D78,
    }:
        raise ValueError("operation-0x0065 dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


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
            and call["arguments"][1].get("kind") == "constant"
            and call["arguments"][1].get("value") in {0, 1}
        )
    ]
    if len(calls) != 426 or len(selected) != 426:
        raise ValueError("operation-0x0065 authored inventory changed")
    value_counts = Counter(
        call["arguments"][1]["value"] for call in selected
    )
    dialogue_value_counts = Counter(
        call["arguments"][1]["value"]
        for call in selected
        if call["dialogueRegion"]
    )
    index_kind_counts = Counter(
        call["arguments"][0]["kind"] for call in selected
    )
    dialogue_index_kind_counts = Counter(
        call["arguments"][0]["kind"]
        for call in selected
        if call["dialogueRegion"]
    )
    if value_counts != {0: 237, 1: 189}:
        raise ValueError("operation-0x0065 value inventory changed")
    if dialogue_value_counts != {0: 47, 1: 35}:
        raise ValueError("operation-0x0065 dialogue inventory changed")
    if index_kind_counts != {
        "constant": 360,
        "frame-field": 39,
        "runtime": 27,
    }:
        raise ValueError("operation-0x0065 index bindings changed")
    if dialogue_index_kind_counts != {"constant": 80, "runtime": 2}:
        raise ValueError("operation-0x0065 dialogue bindings changed")
    return {
        "schema": "new-yokosuka-indexed-binary-record-operation-evidence-v1",
        "status": "exact-native-indexed-write-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0065,
            "operationHex": "0x0065",
            "handlerAddress": "0x0c16448e",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "indexLimit": 128,
            "mirrorIndexLimit": 32,
            "tableRecordStride": 68,
            "callbackRecordStride": 176,
            "callbackValueWordOffset": "record+0x00",
            "callbackClassWordOffset": "record+0x02",
            "callbackClassBit": 3,
            "provenBehavior": (
                "For index below 128, writes the binary value to the first "
                "dword of a 68-byte primary-table record. Below index 32 it "
                "also mirrors that dword, writes the value's low word to a "
                "176-byte callback record, clears the index bit in two "
                "global class bitfields, conditionally restores it to the "
                "class selected by callback word +0x02 bit 3 when value is "
                "one, and writes their union to a third bitfield."
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
            "valueCounts": {
                str(value): count
                for value, count in sorted(value_counts.items())
            },
            "dialogueRegionValueCounts": {
                str(value): count
                for value, count in sorted(dialogue_value_counts.items())
            },
            "indexArgumentKindCounts": dict(sorted(index_kind_counts.items())),
            "dialogueRegionIndexArgumentKindCounts": dict(
                sorted(dialogue_index_kind_counts.items())
            ),
        },
        "evidenceBoundary": [
            "The owning subsystem and gameplay meaning of each index remain unnamed.",
            "Runtime indices retain the native below-128 and below-32 bounds checks.",
            "Executing an index below 32 requires the callback record's exact class bit; it is not defaulted.",
            "Only authored binary values zero and one are promoted even though the native writer rejects other values safely.",
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
