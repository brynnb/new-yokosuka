#!/usr/bin/env python3
"""Verify operation 0x0031's exact current-event field query routes."""

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
    PROJECT_ROOT / "tools/evidence/event-control-field-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16B4C8,
        116,
        "1ddbebdd28dd692901eec7c36481474ddff805cab434b5bb57900fcd7169b70b",
    ),
    "currentEventGetter": (
        0x0C0F0B3C,
        16,
        "b46f03ecc43c1ed7588c00988091d45a9a203e31f9e0d59e41cbebb81f713b2a",
    ),
    "recordOffsetter": (
        0x0C137482,
        6,
        "2585c946be341be916e34af22c6113915cea75216ba43d68f51405e4b33caf70",
    ),
}
FIELD_ROUTES = [
    {"selector": 0, "offset": 0x04, "width": 2},
    {"selector": 1, "offset": 0x08, "width": 2},
    {"selector": 2, "offset": 0x0A, "width": 2},
    {"selector": 3, "offset": 0x0C, "width": 1},
    {"selector": 4, "offset": 0x0D, "width": 1},
    {"selector": 5, "offset": 0x0E, "width": 1},
    {"selector": 6, "offset": 0x0F, "width": 1},
    {"selector": 7, "offset": 0x12, "width": 2},
]


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
                        or action.get("operationId") != 0x0031
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


def selector(call: dict[str, Any]) -> int | None:
    if len(call["arguments"]) != 1:
        return None
    argument = call["arguments"][0]
    return (
        argument.get("value")
        if argument.get("kind") == "constant"
        else None
    )


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0031 {name} changed")
    literals = {
        "currentEventGetter": u32(executable, 0x0C16B6A4),
        "recordOffsetter": u32(executable, 0x0C16B6A8),
        "resultWriter": u32(executable, 0x0C16B6AC),
        "currentSceneOwner": u32(executable, 0x0C0F0C60),
        "ownerResolver": u32(executable, 0x0C0F0C64),
    }
    if literals != {
        "currentEventGetter": 0x0C0F0B3C,
        "recordOffsetter": 0x0C137482,
        "resultWriter": 0x0C0BB342,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
    }:
        raise ValueError("operation-0x0031 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selector_counts = Counter(selector(call) for call in calls)
    if len(calls) != 727 or selector_counts != {
        0: 238,
        1: 466,
        2: 6,
        3: 4,
        4: 4,
        5: 3,
        7: 6,
    }:
        raise ValueError("operation-0x0031 authored inventory changed")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    dialogue_counts = Counter(selector(call) for call in dialogue_calls)
    if dialogue_counts != {0: 38, 1: 33}:
        raise ValueError("operation-0x0031 dialogue selectors changed")
    return {
        "schema": "new-yokosuka-event-control-field-operation-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
            "priorFieldEvidence": (
                "tools/evidence/d000-door-dispatch-input-evidence.json"
            ),
        },
        "operation": {
            "operationId": 0x0031,
            "operationHex": "0x0031",
            "handlerAddress": "0x0c16b4c8",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "fieldRoutes": [
                {
                    "selector": route["selector"],
                    "offset": f"0x{route['offset']:02x}",
                    "width": route["width"],
                    "unsignedResult": True,
                }
                for route in FIELD_ROUTES
            ],
            "provenBehavior": (
                "Resolves the current event record from the current scene "
                "owner, adds four bytes to its base, and returns one of eight "
                "exact unsigned byte/word fields selected by argument zero."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(selector_counts.items())
            },
            "dialogueSelectorCounts": {
                str(value): count
                for value, count in sorted(dialogue_counts.items())
            },
        },
        "evidenceBoundary": [
            "The fields remain numeric current-event control fields.",
            "Operation 0x0031 selector one is not the D000 logical door selector.",
            "Selector six is proven by the handler but has no authored calls in the all-disc event corpus.",
            "Unavailable current-event state is a hard runtime prerequisite and remains an explicit interpreter stop.",
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
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
