#!/usr/bin/env python3
"""Verify operation 0x0099's native FACE-record request writes."""

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
    PROJECT_ROOT / "tools/evidence/face-record-control-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C1650C4
HANDLER_LENGTH = 100
HANDLER_SHA256 = (
    "7eb85f39d6684d00c233f62d7579f5c7c6aefc943b52acad1d2f2da893b603d0"
)
WRITER_ADDRESS = 0x0C0BC784
WRITER_LENGTH = 160
WRITER_SHA256 = (
    "15d8708b777292a84b3fd7d8559908e5db59f5f94188066690c7bcb8338f495a"
)


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
                        or action.get("operationId") != 0x0099
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def constant_argument(call: dict[str, Any], index: int) -> int | None:
    arguments = call["arguments"]
    if index >= len(arguments) or arguments[index].get("kind") != "constant":
        return None
    return arguments[index].get("value")


def call_mode(call: dict[str, Any]) -> int | None:
    mode = constant_argument(call, 1)
    expected_arguments = {0: 2, 1: 3, 2: 4}
    if mode not in expected_arguments:
        return None
    if len(call["arguments"]) != expected_arguments[mode]:
        return None
    return mode


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(runtime_slice(
        executable,
        HANDLER_ADDRESS,
        HANDLER_LENGTH,
    )) != HANDLER_SHA256:
        raise ValueError("operation-0x0099 handler changed")
    if sha256(runtime_slice(
        executable,
        WRITER_ADDRESS,
        WRITER_LENGTH,
    )) != WRITER_SHA256:
        raise ValueError("FACE-record writer changed")
    literals = {
        "objectResolver": u32(executable, 0x0C165238),
        "recordWriter": u32(executable, 0x0C16525C),
        "recordTag": u32(executable, 0x0C0BC81C),
        "associatedRecordLookup": u32(executable, 0x0C0BC820),
    }
    if literals != {
        "objectResolver": 0x0C153956,
        "recordWriter": WRITER_ADDRESS,
        "recordTag": 0x45434146,
        "associatedRecordLookup": 0x0C0AAD5A,
    }:
        raise ValueError("operation-0x0099 dependencies changed")
    return {
        name: (
            "FACE"
            if name == "recordTag"
            else f"0x{value:08x}"
        )
        for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if call_mode(call) is not None]
    if len(calls) != 914 or len(selected) != 914:
        raise ValueError("operation-0x0099 authored inventory changed")
    mode_counts = Counter(call_mode(call) for call in selected)
    dialogue_mode_counts = Counter(
        call_mode(call) for call in selected if call["dialogueRegion"]
    )
    if mode_counts != {0: 507, 1: 2, 2: 405}:
        raise ValueError("operation-0x0099 mode inventory changed")
    if dialogue_mode_counts != {0: 76, 2: 103}:
        raise ValueError("operation-0x0099 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-face-record-control-operation-evidence-v1",
        "status": "exact-native-handler-record-writes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0099,
            "operationHex": "0x0099",
            "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "writerAddress": f"0x{WRITER_ADDRESS:08x}",
            "writerLength": WRITER_LENGTH,
            "writerSha256": WRITER_SHA256,
            "nativeContract": native_contract,
            "recordTag": "FACE",
            "recordWrites": {
                "modeByteOffset": "record+0x52",
                "modeByteValue": "0x80 | mode",
                "controlWordOffset": "record+0xc8",
                "secondaryWordOffset": "record+0xca",
                "secondaryWordValue": 0,
                "vectorWordOffsets": [
                    "record+0x54",
                    "record+0x58",
                    "record+0x5c",
                ],
                "modeZeroResetDwordOffsets": [
                    "record+0x84",
                    "record+0x88",
                    "record+0x90",
                    "record+0x94",
                ],
            },
            "modes": [
                {
                    "mode": 0,
                    "argumentCount": 2,
                    "controlWord": 16,
                    "vector": ["0x00000000"] * 3,
                    "clearsResetDwords": True,
                },
                {
                    "mode": 1,
                    "argumentCount": 3,
                    "controlWordArgumentIndex": 2,
                    "vector": ["0x00000000"] * 3,
                    "clearsResetDwords": False,
                },
                {
                    "mode": 2,
                    "argumentCount": 4,
                    "vectorPointerArgumentIndex": 2,
                    "controlWordArgumentIndex": 3,
                    "clearsResetDwords": False,
                },
            ],
            "provenBehavior": (
                "Resolves argument zero as an object, obtains its associated "
                "record tagged FACE, and writes the exact mode byte, control "
                "word, zero secondary word, and three-float request vector. "
                "Mode zero supplies control 16 and a zero vector and clears "
                "four additional record dwords; mode one supplies its control "
                "from argument two and a zero vector; mode two supplies a "
                "vector pointer and control through arguments two and three."
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
            "modeCounts": {
                str(mode): count for mode, count in sorted(mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_mode_counts.items())
            },
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"] for call in selected
            ).items())),
            "modeTwoVectorArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][2]["kind"]
                for call in selected
                if call_mode(call) == 2
            ).items())),
        },
        "evidenceBoundary": [
            "FACE is retained only as the executable's exact four-byte associated-record tag; no expanded gameplay name is inferred.",
            "All 914 authored calls use a statically recovered mode and the exact mode-specific argument count.",
            "The request writer tail-enters the larger FACE-record update routine at 0x0c0bc824; this evidence proves the synchronous request writes, not every downstream controller effect.",
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
    inventory = report["allDiscInventory"]
    print(
        f"Wrote {args.out}: {inventory['callCount']} calls, "
        f"{inventory['dialogueRegionCallCount']} dialogue-region calls"
    )


if __name__ == "__main__":
    main()
