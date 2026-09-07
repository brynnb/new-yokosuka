#!/usr/bin/env python3
"""Verify operation 0x0020's persistent native-save bitfield write."""

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
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/persistent-script-bit-operation-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operationHandler": (
        0x0C15860C,
        16,
        "32c10f87e42b30925a0a03fb649294bbe618e761bddcd318c4386348663d976e",
    ),
    "bitWriter": (
        0x0C0F0B5E,
        100,
        "9463956839c415863ea632e4813fcd2a1829bc20d9082042d344b6a10655bc0d",
    ),
    "companionReader": (
        0x0C0F0BC2,
        76,
        "e25545aac8af2b34780aad2a71a5a45ddfe1dccf055ed504125e10b83d3eeb2d",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", runtime_slice(data, address, 2))[0]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def authored_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0020
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(executable, address, size)) != expected:
            raise ValueError(f"persistent script-bit {name} changed")
    dependencies = {
        "handlerTableEntry": u32(executable, 0x0C29AA60),
        "writerPointer": u32(executable, 0x0C15879C),
        "saveOffsetLiteral": u16(executable, 0x0C0F0C5A),
        "capacityLiteral": u16(executable, 0x0C0F0C5C),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C15860C,
        "writerPointer": 0x0C0F0B5E,
        "saveOffsetLiteral": 0x059C,
        "capacityLiteral": 0x0100,
    }:
        raise ValueError("persistent script-bit dependencies changed")

    calls = authored_calls(event_ir)
    if len(calls) != 2080:
        raise ValueError(f"operation 0x0020 call count changed: {len(calls)}")
    argument_kinds = [Counter() for _ in range(3)]
    value_counts = [Counter() for _ in range(3)]
    for call in calls:
        arguments = call["arguments"]
        if len(arguments) != 3:
            raise ValueError("operation 0x0020 argument count changed")
        for index, argument in enumerate(arguments):
            argument_kinds[index][argument.get("kind")] += 1
            if argument.get("kind") == "constant":
                value_counts[index][argument.get("value")] += 1
    if argument_kinds != [
        Counter({"constant": 2080}),
        Counter({"frame-field": 2016, "constant": 64}),
        Counter({"constant": 1888, "frame-field": 192}),
    ]:
        raise ValueError(f"operation 0x0020 argument kinds changed: {argument_kinds}")
    if value_counts[0] != {0: 2080} or value_counts[2] != {0: 425, 1: 1463}:
        raise ValueError(f"operation 0x0020 constant values changed: {value_counts}")

    return {
        "schema": "new-yokosuka-persistent-script-bit-evidence-v1",
        "status": "exact-native-handler-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0020,
            "operationHex": "0x0020",
            "handlerAddress": "0x0c15860c",
            "bitWriterAddress": "0x0c0f0b5e",
            "companionReaderAddress": "0x0c0f0bc2",
            "nativeSaveByteOffset": "0x059c",
            "capacityBits": 256,
            "ownerSelector": 0,
            "provenBehavior": (
                "The handler forwards argument one as a bit index and argument "
                "two as a Boolean to the shared native-save bit writer. Nonzero "
                "sets the indexed bit and zero clears it while preserving every "
                "other bit. The writer rejects indices outside 0..255."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "indexArgumentKinds": dict(sorted(argument_kinds[1].items())),
            "valueArgumentKinds": dict(sorted(argument_kinds[2].items())),
            "valueCounts": {
                str(value): count for value, count in sorted(value_counts[2].items())
            },
        },
        "evidenceBoundary": [
            "The save offset, capacity, index/value ABI, and set/clear polarity are exact.",
            "A frame-sourced value remains constrained at runtime to the native Boolean domain zero or one.",
            "All authored bit indices now have exact constant or coroutine-frame provenance.",
            "The player-facing meaning of each bit index remains deliberately unassigned.",
            "The persistent owner is transported as bounded snapshot metadata; it is not room state.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['callCount']} calls")


if __name__ == "__main__":
    main()
