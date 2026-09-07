#!/usr/bin/env python3
"""Verify four independent exact native operation contracts needed by OP00."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-011a-0153-015c-0193-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
CONTRACTS = {
    0x011A: {
        "handler": (0x0C16B2D6, 14, "825921ce031c544b786d1a3fe8a22e62b4f15b12ab0507de89c77ab9f92097fa"),
        "table": 0x0C29AE48,
        "dependencies": {"releaseHelper": (0x0C16B440, 0x0C0B448C)},
    },
    0x0153: {
        "handler": (0x0C1571BA, 14, "efa9a44157643e738bf623ee96bf45c16d8d487183210c03ab48e72c14a585d7"),
        "table": 0x0C29AF2C,
        "dependencies": {
            "signedFlagHelper": (0x0C157310, 0x0C14D1D2),
            "flagGlobal": (0x0C14D284, 0x0C220634),
        },
    },
    0x015C: {
        "handler": (0x0C16B29C, 30, "7b9d13c28207e570d8e6d44ea9b66bbce6d9eb801bf3a19e500a5093e75e9748"),
        "table": 0x0C29AF50,
        "dependencies": {
            "namedAcquireHelper": (0x0C16B434, 0x0C0B41F0),
            "resultWriter": (0x0C16B42C, 0x0C0BB342),
        },
    },
    0x0193: {
        "handler": (0x0C16380A, 52, "2f00efa80bd0f96bb8eed1cf2b7c368f393e59fca04c25665f6f401c47bd612e"),
        "table": 0x0C29B02C,
        "dependencies": {
            "advanceHelper": (0x0C163918, 0x0C180020),
            "initializeHelper": (0x0C16391C, 0x0C17FF9C),
        },
    },
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls_for(event_ir: dict[str, Any], operation_id: int) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") == operation_id:
                        calls.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return calls


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def verify_executable(data: bytes) -> list[dict[str, Any]]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    results = []
    for operation_id, contract in CONTRACTS.items():
        address, length, expected_hash = contract["handler"]
        if digest(runtime_slice(data, address, length)) != expected_hash:
            raise ValueError(f"operation 0x{operation_id:04x} handler changed")
        if u32(data, contract["table"]) != address:
            raise ValueError(f"operation 0x{operation_id:04x} table entry changed")
        for name, (pointer_address, expected) in contract["dependencies"].items():
            if u32(data, pointer_address) != expected:
                raise ValueError(f"operation 0x{operation_id:04x} {name} changed")
        results.append({
            "operationId": operation_id,
            "operationHex": f"0x{operation_id:04x}",
            "handlerAddress": f"0x{address:08x}",
            "handlerLength": length,
            "handlerSha256": expected_hash,
            "dependencies": {
                name: f"0x{expected:08x}"
                for name, (_, expected) in contract["dependencies"].items()
            },
        })
    return results


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    operations = verify_executable(data)
    inventories = {}
    expected_counts = {0x011A: 60, 0x0153: 156, 0x015C: 19, 0x0193: 387}
    for operation_id in CONTRACTS:
        calls = calls_for(event_ir, operation_id)
        if len(calls) != expected_counts[operation_id]:
            raise ValueError(f"operation 0x{operation_id:04x} inventory changed")
        inventories[f"0x{operation_id:04x}"] = {
            "authoredCallCount": len(calls),
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentCountCounts": dict(sorted(Counter(
                len(call["arguments"]) for call in calls
            ).items())),
            "argumentKindCounts": {
                str(index): dict(sorted(Counter(
                    call["arguments"][index]["kind"] for call in calls
                    if len(call["arguments"]) > index
                ).items()))
                for index in range(max(map(lambda call: len(call["arguments"]), calls)))
            },
            "resultComparisonCount": sum(
                call["resultComparison"] is not None for call in calls
            ),
            "resultTargetCount": sum(call["resultTarget"] is not None for call in calls),
        }
    op153 = calls_for(event_ir, 0x0153)
    op193 = calls_for(event_ir, 0x0193)
    if Counter(constant(call["arguments"][0]) for call in op153) != {
        0: 79, 1: 54, 0xFFFFFFFF: 23,
    }:
        raise ValueError("operation 0x0153 authored routes changed")
    if Counter(constant(call["arguments"][0]) for call in op193) != {
        0: 10, 1: 337, 2: 40,
    }:
        raise ValueError("operation 0x0193 authored routes changed")
    op15c = calls_for(event_ir, 0x015C)
    if any(
        len(call["arguments"]) != 2
        or call["arguments"][0].get("kind") != "static-pointer"
        or constant(call["arguments"][1]) != 0
        for call in op15c
    ):
        raise ValueError("operation 0x015c authored shape changed")
    return {
        "schema": "new-yokosuka-native-operation-011a-0153-015c-0193-evidence-v1",
        "status": "exact-independent-native-contracts-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operations": operations,
        "allDiscInventory": inventories,
        "evidenceBoundary": [
            "The four operations are reported together only to share executable and corpus verification; they are independent runtime contracts.",
            "Operation 0x011a forwards one word to the exact object-record release helper.",
            "Operation 0x0153 writes one when its signed argument is negative and zero otherwise.",
            "Operation 0x015c forwards a static name and native constant one to its acquisition helper, then writes the returned word.",
            "Operation 0x0193 has exact mode-zero initialize, mode-one advance, and mode-two tagged-initialize routes.",
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
    print(f"Wrote {args.out}: {len(report['operations'])} contracts")


if __name__ == "__main__":
    main()
