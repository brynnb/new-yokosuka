#!/usr/bin/env python3
"""Recover the exact actor FIGP byte-write contract for operation 0x00c8."""

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
    PROJECT_ROOT / "tools/evidence/actor-figp-byte-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operationHandler": (
        0x0C09C2AC,
        24,
        "156bfcccca12c27c8b128b3b3e2a97bb6fc33a5f206ccec2d77313ce15bb702e",
    ),
    "figpByteWrite": (
        0x0C09BC5A,
        34,
        "5e406ee9a200c152108759495321675a5dd64d9d1dae92ae81da91657ae20d23",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "associatedRecordResolver": (
        0x0C0AAD5A,
        64,
        "93bed2c74d0db3548d88fd24f81c702cf9531e1ce23107222156fdef0ff0b7eb",
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


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int,
) -> list[dict[str, Any]]:
    result = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
                    ):
                        continue
                    result.append({
                        "disc": native_map["disc"],
                        "area": native_map["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return result


def kind_counts(calls: list[dict[str, Any]], index: int) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index].get("kind") for call in calls
    ).items()))


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"actor FIGP operation {name} changed")
    dependencies = {
        "actorResolver": u32(executable, 0x0C09C30C),
        "associatedRecordTag": u32(executable, 0x0C09BD3C),
        "associatedRecordResolver": u32(executable, 0x0C09BD40),
    }
    if dependencies != {
        "actorResolver": 0x0C153956,
        "associatedRecordTag": 0x50474946,
        "associatedRecordResolver": 0x0C0AAD5A,
    }:
        raise ValueError("actor FIGP operation dependencies changed")

    calls = operation_calls(event_ir, 0x00C8)
    if len(calls) != 132 or any(len(call["arguments"]) != 2 for call in calls):
        raise ValueError("operation-0x00c8 authored inventory changed")
    argument_kinds = {
        "0": kind_counts(calls, 0),
        "1": kind_counts(calls, 1),
    }
    if argument_kinds != {
        "0": {"constant": 54, "frame-field": 72, "scene-field": 6},
        "1": {"constant": 115, "frame-field": 17},
    }:
        raise ValueError("operation-0x00c8 argument bindings changed")
    constant_modes = dict(sorted(Counter(
        call["arguments"][1]["value"]
        for call in calls
        if call["arguments"][1].get("kind") == "constant"
    ).items()))
    if constant_modes != {0: 67, 1: 16, 2: 13, 3: 1, 4: 4, 5: 4, 6: 7, 7: 3}:
        raise ValueError("operation-0x00c8 authored constant modes changed")

    return {
        "schema": "new-yokosuka-actor-figp-byte-operation-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00C8,
            "operationHex": "0x00c8",
            "handlerAddress": "0x0c09c2ac",
            "argumentCount": 2,
            "actorResolverAddress": "0x0c153956",
            "associatedRecordResolverAddress": "0x0c0aad5a",
            "associatedRecordTag": "FIGP",
            "recordByteOffset": "0x10",
            "writeWidth": 1,
            "authoredCallCount": len(calls),
            "dialogueRegionCallCount": sum(call["dialogueRegion"] for call in calls),
            "mapCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKinds": argument_kinds,
            "constantModeCounts": {
                str(mode): count for mode, count in constant_modes.items()
            },
            "provenBehavior": (
                "Resolves argument zero through the exact actor resolver, "
                "resolves that actor's literal FIGP associated record, and "
                "writes the low eight bits of argument one to record byte "
                "+0x10. Missing actors and missing FIGP records are exact "
                "native no-ops."
            ),
        },
        "verifiedRanges": {
            name: {
                "address": f"0x{address:08x}",
                "length": length,
                "sha256": digest,
            }
            for name, (address, length, digest) in RANGES.items()
        },
        "evidenceBoundary": [
            "FIGP is retained as the executable's literal record identity; no gameplay label is inferred.",
            "Authored constant values zero through seven are raw record bytes, not named browser modes.",
            "The runtime contract preserves missing-actor and missing-record no-ops.",
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
    print(f"Wrote {args.out}: {report['operation']['authoredCallCount']} exact calls")


if __name__ == "__main__":
    main()
