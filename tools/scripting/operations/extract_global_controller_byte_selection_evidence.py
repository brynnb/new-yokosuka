#!/usr/bin/env python3
"""Verify operation 0x0143 selector zero's exact global field writes."""

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
    / "tools/evidence/global-controller-byte-selection-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1635C2,
        72,
        "3257f506f636a415f5ad2162b9f80ec851b9dd7632e3ce6064c19b8add973938",
    ),
    "selector0Writer": (
        0x0C0E0388,
        30,
        "5275997b39e2651ee598bdf41692e234856cc35d7315b2f3e0e689a9bf477cb5",
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
                        or action.get("operationId") != 0x0143
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


def constant(call: dict[str, Any], index: int) -> int | None:
    argument = call["arguments"][index]
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
            raise ValueError(f"operation-0x0143 {name} changed")
    literals = {
        "selector0Writer": u32(executable, 0x0C163794),
        "selector1Handler": u32(executable, 0x0C163798),
        "otherSelectorHandler": u32(executable, 0x0C16379C),
        "selectedByteA": u32(executable, 0x0C0E044C),
        "selectedByteB": u32(executable, 0x0C0E0450),
        "secondaryByte": u32(executable, 0x0C0E0454),
        "selectionWord": u32(executable, 0x0C0E0458),
    }
    if literals != {
        "selector0Writer": 0x0C0E0388,
        "selector1Handler": 0x0C0E0284,
        "otherSelectorHandler": 0x0C0E0402,
        "selectedByteA": 0x0C216CF4,
        "selectedByteB": 0x0C216CF3,
        "secondaryByte": 0x0C216CF6,
        "selectionWord": 0x0C216D24,
    }:
        raise ValueError("operation-0x0143 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    if len(calls) != 482 or any(len(call["arguments"]) != 3 for call in calls):
        raise ValueError("operation-0x0143 authored inventory changed")
    selector_counts = Counter(constant(call, 0) for call in calls)
    if selector_counts != {0: 476, 1: 1, 5: 2, 7: 3}:
        raise ValueError("operation-0x0143 selector inventory changed")
    selected = [call for call in calls if constant(call, 0) == 0]
    if any(
        argument.get("kind") != "constant"
        for call in selected
        for argument in call["arguments"]
    ):
        raise ValueError("operation-0x0143 selector-zero binding changed")
    primary_counts = Counter(constant(call, 1) for call in selected)
    secondary_counts = Counter(constant(call, 2) for call in selected)
    if max(primary_counts) != 63 or min(primary_counts) != 0:
        raise ValueError("operation-0x0143 primary domain changed")
    if secondary_counts != {0: 476}:
        raise ValueError("operation-0x0143 secondary domain changed")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue_calls) != 75 or any(
        constant(call, 0) != 0 for call in dialogue_calls
    ):
        raise ValueError("operation-0x0143 dialogue selectors changed")
    return {
        "schema": "new-yokosuka-global-controller-byte-selection-evidence-v1",
        "status": "exact-native-selector-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0143,
            "operationHex": "0x0143",
            "handlerAddress": "0x0c1635c2",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "selector": 0,
            "provenBehavior": (
                "Sign-extends argument one's low byte and replaces values "
                "at least 65 with zero, writes the resulting low byte to "
                "0x0c216cf4 and 0x0c216cf3, writes argument two's low byte "
                "to 0x0c216cf6, and clears word 0x0c216d24."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "remainingUnresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(selector_counts.items())
            },
            "primaryValueCounts": {
                str(value): count
                for value, count in sorted(primary_counts.items())
            },
            "secondaryValueCounts": {
                str(value): count
                for value, count in sorted(secondary_counts.items())
            },
        },
        "evidenceBoundary": [
            "The owning subsystem and individual byte meanings remain unnamed.",
            "The authored selector-zero primary values are all 0 through 63, so none trigger the native >=65 clamp.",
            "Selector one and selectors five/seven enter separate complex handlers and remain unresolved.",
            "The same selector-zero writer is called conditionally by operation 0x0116 selector two and is shared by that runtime implementation.",
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
