#!/usr/bin/env python3
"""Verify exact operation 0x00ec TMNM parameter writes."""

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
    PROJECT_ROOT / "tools/evidence/tmnm-parameter-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C1664E6
HANDLER_LENGTH = 176
HANDLER_SHA256 = (
    "2bede492178aa36e092b19af21a57567cb02effedafbcb878771fe23893d7a72"
)
LITERALS = {
    0x0C1665B8: 0x0C153956,
    0x0C1665BC: 0x0C182C2A,
    0x0C1665C0: 0x0C092F14,
    0x0C1665C4: 0x0C182776,
    0x0C1665C8: 0x46FFFE00,
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
                        or action.get("operationId") != 0x00EC
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


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(7)
    }


def verify_native_contract(executable: bytes) -> None:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(runtime_slice(
        executable,
        HANDLER_ADDRESS,
        HANDLER_LENGTH,
    )) != HANDLER_SHA256:
        raise ValueError("operation-0x00ec handler changed")
    if u32(executable, 0x0C29AD90) != HANDLER_ADDRESS:
        raise ValueError("operation-0x00ec handler table entry changed")
    for address, expected in LITERALS.items():
        if u32(executable, address) != expected:
            raise ValueError(
                f"operation-0x00ec literal 0x{address:08x} changed"
            )


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if len(call["arguments"]) == 7]
    dialogue = [call for call in selected if call["dialogueRegion"]]
    if (
        len(calls) != 178
        or len(selected) != 177
        or len(dialogue) != 41
        or argument_kinds(selected) != {
            "0": {"constant": 171, "frame-field": 6},
            "1": {"constant": 177},
            "2": {"constant": 177},
            "3": {"constant": 177},
            "4": {"constant": 177},
            "5": {"constant": 173, "frame-field": 4},
            "6": {"constant": 177},
        }
        or argument_kinds(dialogue) != {
            str(index): {"constant": 41} for index in range(7)
        }
        or any(
            any((
                call["arguments"][2]["value"] != 0,
                call["arguments"][3]["value"] != 0x46FFFE00,
                call["arguments"][4]["value"] != 0,
                call["arguments"][5]["value"] != 0x3F800000,
                call["arguments"][6]["value"] != 0,
            ))
            for call in dialogue
        )
    ):
        raise ValueError("operation-0x00ec authored inventory changed")
    return {
        "schema": "new-yokosuka-tmnm-parameter-operation-evidence-v1",
        "status": "exact-native-contract-and-all-complete-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00EC,
            "operationHex": "0x00ec",
            "argumentCount": 7,
            "handlerAddress": "0x0c1664e6",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "associatedRecordTag": "TMNM",
            "associatedRecordTagWord": "0x4d4e4d54",
            "resourceResolverAddress": "0x0c092f14",
            "resourceApplyAddress": "0x0c182776",
            "floatUpperBoundWord": "0x46fffe00",
            "provenBehavior": (
                "Resolves argument zero and its literal TMNM associated "
                "record. Nonzero argument one resolves and applies the exact "
                "resource route. Float words two, three, and four write record "
                "offsets +0x14, +0x18, and +0x0c unless zero is greater than "
                "the supplied float. Argument five writes +0x10 only below "
                "native float word 0x46fffe00. Nonnegative argument six clears "
                "the 16-bit +0x1c field for zero or ORs its low bits for "
                "nonzero. A missing resolved object is a native no-op."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "unresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in calls
            ),
            "provenDialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "dialogueAreaCount": len({
                (call["disc"], call["area"]) for call in dialogue
            }),
            "argumentKindCounts": argument_kinds(selected),
            "dialogueArgumentKindCounts": argument_kinds(dialogue),
        },
        "evidenceBoundary": [
            "TMNM is retained as the executable's literal record tag.",
            "The resource route remains a mandatory adapter with raw IDs.",
            "Raw record offsets are not assigned guessed gameplay names.",
            "The one malformed zero-argument call remains unresolved.",
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
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
