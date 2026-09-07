#!/usr/bin/env python3
"""Verify operation 0x0166 mode zero's scene-scheduler bootstrap route."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0166-mode0-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "modeZeroBranch": (
        0x0C167C20, 18,
        "fb5cbd195ee09e28e27f27c5090e4b7dc7994977bdf5ad46df5061892e1fd9cd",
    ),
    "sceneSchedulerBootstrap": (
        0x0C114B6C, 254,
        "6a5a1427c4ae0334cebd1dfcf4c126ed8001459ea13826757ca937ba03572cf4",
    ),
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def cstring(data: bytes, address: int) -> str:
    start = address - BASE
    end = data.index(b"\0", start)
    return data[start:end].decode("ascii")


def mode_zero_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0166
                        or not arguments
                        or arguments[0].get("kind") != "constant"
                        or arguments[0].get("value") != 0
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": arguments,
                        "resultTarget": action.get("resultTarget"),
                        "resultComparison": action.get("resultComparison"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        actual = hashlib.sha256(runtime_slice(data, address, size)).hexdigest()
        if actual != expected:
            raise ValueError(f"operation-0x0166 mode-zero {name} changed")
    dependencies = {
        "ownerTagGlobal": u32(data, 0x0C167CCC),
        "bootstrapHelper": u32(data, 0x0C167CD0),
        "streamDiscNumberGlobal": u32(data, 0x0C114C0C),
        "streamDirectoryTemplate": cstring(data, u32(data, 0x0C114C10)),
        "primaryResourceLoader": u32(data, 0x0C114D40),
        "primaryResourceGlobal": u32(data, 0x0C114D44),
        "schedulerStateInitializer": u32(data, 0x0C114D48),
        "indexName": cstring(data, u32(data, 0x0C114D54)),
        "indexType": u32(data, 0x0C114D50),
        "indexLoader": u32(data, 0x0C114D58),
        "indexResourceGlobal": u32(data, 0x0C114D5C),
    }
    if dependencies != {
        "ownerTagGlobal": 0x0C21BCB0,
        "bootstrapHelper": 0x0C114B6C,
        "streamDiscNumberGlobal": 0x0C20C3D8,
        "streamDirectoryTemplate": "scene/%02d/stream",
        "primaryResourceLoader": 0x0C119142,
        "primaryResourceGlobal": 0x0C21BCBC,
        "schedulerStateInitializer": 0x0C11C65A,
        "indexName": "HUMANS.idx",
        "indexType": 0x4A424F4D,
        "indexLoader": 0x0C0BE5EE,
        "indexResourceGlobal": 0x0C21BC80,
    }:
        raise ValueError("operation-0x0166 mode-zero dependencies changed")
    return dependencies


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_executable(data)
    calls = mode_zero_calls(event_ir)
    argument_kinds = [
        Counter(call["arguments"][index].get("kind") for call in calls)
        for index in range(4)
    ]
    if (
        len(calls) != 126
        or len({(call["disc"], call["area"]) for call in calls}) != 94
        or Counter(call["disc"] for call in calls) != {1: 39, 2: 44, 3: 43}
        or any(call["dialogue"] for call in calls)
        or any(len(call["arguments"]) != 4 for call in calls)
        or argument_kinds != [
            {"constant": 126},
            {"static-pointer": 126},
            {"static-pointer": 126},
            {"constant": 126},
        ]
        or sum(
            call["arguments"][3].get("ascii") == call["area"]
            for call in calls
        ) != 125
        or any(call["resultTarget"] is not None for call in calls)
        or any(call["resultComparison"] is not None for call in calls)
    ):
        raise ValueError("operation-0x0166 mode-zero authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-0166-mode0-evidence-v1",
        "status": "exact-scene-scheduler-bootstrap-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0166,
            "operationHex": "0x0166",
            "handlerAddress": "0x0c167ab4",
            "mode": 0,
            "argumentCount": 4,
            "dependencies": {
                key: f"0x{value:08x}" if isinstance(value, int) else value
                for key, value in dependencies.items()
            },
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "provenBehavior": (
                "Writes argument three to fixed owner-tag global 0x0c21bcb0, "
                "passes argument one's path and argument two's filename to the "
                "native scene scheduler bootstrap, loads HUMANS.idx as MOBJ from "
                "the formatted scene/%02d/stream directory, initializes the fixed "
                "scheduler state and callbacks, and returns one."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": 126,
            "areaCount": 94,
            "discCallCounts": {"1": 39, "2": 44, "3": 43},
            "areaTagMatchesOwningAreaCount": 125,
            "dialogueRegionCallCount": 0,
            "resultConsumerCount": 0,
        },
        "evidenceBoundary": [
            "Only the exact four-argument mode-zero shape with two static resource strings is promoted.",
            "The resource ownership chain, HUMANS.idx/MOBJ load, scheduler initialization, owner-tag write, and constant-one result are executable-proven.",
            "The MA00-authored route deliberately supplies owner tag MFSY; the runtime preserves it rather than replacing it with the owning MAPINFO area.",
            "No other unresolved operation-0x0166 mode is promoted by this evidence.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} proven calls")


if __name__ == "__main__":
    main()
