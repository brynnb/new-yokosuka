#!/usr/bin/env python3
"""Verify operation 0x0195 as a raw global-word bit-5 set/clear."""

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
    / "tools/evidence/global-runtime-word-bit-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C173980
HANDLER_LENGTH = 18
HANDLER_SHA256 = (
    "7c1eea85564dca82b12a11a2fcd53629a0c39f04a41df67578badc14c9c3f33d"
)
SET_ADDRESS = 0x0C13A076
SET_LENGTH = 10
SET_SHA256 = (
    "dc5e60823035d26eeed5892d418e8542ce390c9c148a45c3d9ec935496738dab"
)
CLEAR_ADDRESS = 0x0C13A080
CLEAR_LENGTH = 12
CLEAR_SHA256 = (
    "b0af3725ac7de15a74569b134464a83c2ae21a2116e43ea2d0009ef2806fce1e"
)
WORD_ADDRESS = 0x0C20C3D4
MASK = 0x20


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


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
                        or action.get("operationId") != 0x0195
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    mode = (
                        arguments[0].get("value")
                        if (
                            len(arguments) == 1
                            and arguments[0].get("kind") == "constant"
                        )
                        else None
                    )
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "mode": mode,
                    })
    return calls


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    ranges = {
        "handler": (
            HANDLER_ADDRESS,
            HANDLER_LENGTH,
            HANDLER_SHA256,
        ),
        "set": (SET_ADDRESS, SET_LENGTH, SET_SHA256),
        "clear": (CLEAR_ADDRESS, CLEAR_LENGTH, CLEAR_SHA256),
    }
    for name, (address, length, digest) in ranges.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0195 {name} range changed")
    if (
        u32(executable, 0x0C1739E0) != CLEAR_ADDRESS
        or u32(executable, 0x0C1739E4) != SET_ADDRESS
        or u32(executable, 0x0C13A164) != WORD_ADDRESS
    ):
        raise ValueError("operation-0x0195 dependencies changed")

    calls = authored_calls(event_ir)
    mode_counts = Counter(call["mode"] for call in calls)
    if mode_counts != {0: 576, 1: 570}:
        raise ValueError(f"operation-0x0195 authored modes changed: {mode_counts}")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue_calls) != 261:
        raise ValueError("operation-0x0195 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-global-runtime-word-bit-evidence-v1",
        "status": "exact-native-handler-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0195,
            "operationHex": "0x0195",
            "handlerAddress": "0x0c173980",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "wordAddress": "0x0c20c3d4",
            "mask": "0x00000020",
            "modes": [
                {
                    "mode": 0,
                    "targetAddress": "0x0c13a076",
                    "behavior": "sets mask 0x20",
                },
                {
                    "mode": 1,
                    "targetAddress": "0x0c13a080",
                    "behavior": "clears mask 0x20",
                },
            ],
            "provenBehavior": (
                "Mode zero sets bit 5 in the 32-bit global word at "
                "0x0c20c3d4. Every nonzero value would select the clear "
                "path; the authored corpus contains only exact mode one, "
                "which clears bit 5 while preserving every other bit."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(mode_counts.items())
            },
        },
        "evidenceBoundary": [
            "The address, width, mask, set/clear polarity, and authored modes are exact.",
            "The higher-level story or subsystem meaning of global bit 5 remains deliberately unassigned.",
            "No browser, emulator, runtime capture, or object-tag inference is used.",
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
