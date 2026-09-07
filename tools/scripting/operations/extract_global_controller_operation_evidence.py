#!/usr/bin/env python3
"""Verify exact operation 0x0116 controller selectors 0, 2, and 3."""

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
    PROJECT_ROOT / "tools/evidence/global-controller-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C157126,
        92,
        "b044e63f85ad86f03f1249ca0dba6779cc3c9cf3faba3716e10d5abc31f43224",
    ),
    "initializer": (
        0x0C173DF4,
        126,
        "30d5b884aae2f5684b96cd1ad62f609476e846afc60cb5be41f407eaafe0ef41",
    ),
    "sharedSelectorRoutine": (
        0x0C173F44,
        608,
        "31cff9efbf457b089cbec4bf81c870d1972dbcdc8236012a8012ad6f3634d97f",
    ),
    "selector2Branch": (
        0x0C173F44,
        96,
        "2595013d367b84f194348fb97b1df3793b133da4742a5098f4e5b7700a51691b",
    ),
    "selector3Branch": (
        0x0C173FA4,
        46,
        "c6ee3a6c9f7e9382d035856f48aea74449a24c60e2ef158c12beb20fb5607f1a",
    ),
}
SELECTORS = {0, 2, 3}


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
                        or action.get("operationId") != 0x0116
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
    arguments = call["arguments"]
    if not arguments or arguments[0].get("kind") != "constant":
        return None
    return arguments[0].get("value")


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0116 {name} changed")
    literals = {
        "resultWriter": (0x0C1572C4, 0x0C0BB342),
        "selector0Handler": (0x0C1572F0, 0x0C173DF4),
        "selector4Writer": (0x0C1572F4, 0x0C173E72),
        "selector5Writer": (0x0C1572F8, 0x0C173E78),
        "sharedSelectorRoutine": (0x0C1572FC, 0x0C173F44),
        "initializerFlagsBase": (0x0C173EE8, 0x0C224768),
        "initializerConfiguration": (0x0C173EEC, 0x0C224788),
        "initializerPrimaryIndex": (0x0C173EF0, 0x0C22478C),
        "initializerWord770": (0x0C173EF4, 0x0C224770),
        "initializerWord758": (0x0C173EF8, 0x0C224758),
        "initializerFloat75c": (0x0C173F00, 0x0C22475C),
        "initializerFloat760": (0x0C173F04, 0x0C224760),
        "initializerFloat764": (0x0C173F0C, 0x0C224764),
        "initializerWord7cc": (0x0C173F10, 0x0C2247CC),
        "initializerWord7c8": (0x0C173F14, 0x0C2247C8),
        "mode": (0x0C173F18, 0x0C29B130),
        "initializerWordB138": (0x0C173F1C, 0x0C29B138),
        "secondaryIndex": (0x0C173F20, 0x0C29B134),
        "selector5Word": (0x0C173F24, 0x0C22483C),
        "initializerWord840": (0x0C173F28, 0x0C224840),
        "initializerWord844": (0x0C173F2C, 0x0C224844),
        "word848": (0x0C173F30, 0x0C224848),
        "initializerWord84c": (0x0C173F34, 0x0C22484C),
        "initializerWordB13c": (0x0C173F38, 0x0C29B13C),
        "initializerRangeHelper": (0x0C173F3C, 0x0C15AFB6),
        "resetWord7c8": (0x0C1740D4, 0x0C2247C8),
        "resetWord7cc": (0x0C1740D8, 0x0C2247CC),
        "resetMode": (0x0C1740DC, 0x0C29B130),
        "cleanupArgument1": (0x0C1740E0, 0x0C2247D1),
        "cleanupArgument0": (0x0C1740E4, 0x0C2247D0),
        "cleanupHelper": (0x0C1740E8, 0x0C0E0388),
        "resetSecondaryIndex": (0x0C1740EC, 0x0C29B134),
        "resetWord848": (0x0C1740F0, 0x0C224848),
    }
    changed = {
        name: (f"0x{u32(executable, address):08x}", f"0x{expected:08x}")
        for name, (address, expected) in literals.items()
        if u32(executable, address) != expected
    }
    if changed:
        raise ValueError(f"operation-0x0116 dependencies changed: {changed}")
    return {
        name: {
            "literalAddress": f"0x{address:08x}",
            "value": f"0x{expected:08x}",
        }
        for name, (address, expected) in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if selector(call) in SELECTORS]
    selector_counts = Counter(selector(call) for call in calls)
    selected_counts = Counter(selector(call) for call in selected)
    dialogue_counts = Counter(
        selector(call) for call in calls if call["dialogueRegion"]
    )
    signatures = Counter(
        (
            selector(call),
            len(call["arguments"]),
            tuple(argument.get("kind") for argument in call["arguments"]),
        )
        for call in calls
    )
    if len(calls) != 558 or selected_counts != {0: 77, 2: 192, 3: 138}:
        raise ValueError("operation-0x0116 authored inventory changed")
    if selector_counts != {
        0: 77, 1: 32, 2: 192, 3: 138,
        4: 48, 5: 19, 0xffffffff: 52,
    }:
        raise ValueError("operation-0x0116 selector inventory changed")
    if dialogue_counts != {1: 20, 2: 70, 3: 17, 4: 16, 5: 7}:
        raise ValueError("operation-0x0116 dialogue inventory changed")
    expected_signatures = {
        (0, 2, ("constant", "static-pointer")): 77,
        (1, 1, ("constant",)): 32,
        (2, 1, ("constant",)): 192,
        (3, 1, ("constant",)): 138,
        (4, 2, ("constant", "constant")): 41,
        (4, 2, ("constant", "runtime")): 7,
        (5, 2, ("constant", "constant")): 19,
        (0xffffffff, 1, ("constant",)): 52,
    }
    if signatures != expected_signatures:
        raise ValueError("operation-0x0116 argument signatures changed")
    return {
        "schema": "new-yokosuka-global-controller-operation-evidence-v1",
        "status": "exact-native-selector-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0116,
            "operationHex": "0x0116",
            "handlerAddress": "0x0c157126",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "selectors": [
                {
                    "selector": 0,
                    "semanticId": "global-runtime-controller-initialize",
                    "result": -1,
                    "provenBehavior": (
                        "Clears flag-byte bits 0x80, 0x40, and 0x20; "
                        "initializes the exact nineteen global fields; then "
                        "calls 0x0c15afb6 with arguments 15, 7, and 0."
                    ),
                },
                {
                    "selector": 2,
                    "semanticId": "global-runtime-controller-reset",
                    "result": 0,
                    "provenBehavior": (
                        "For current modes 2 through 6, calls 0x0c0e0388 "
                        "with bytes 0x0c2247d0 and 0x0c2247d1; then clears "
                        "the exact five controller fields."
                    ),
                },
                {
                    "selector": 3,
                    "semanticId": "global-runtime-controller-status-query",
                    "provenBehavior": (
                        "Returns a nonnegative secondary index directly. "
                        "For a negative index and mode 2, 3, or 5, returns "
                        "-1 minus the index; otherwise returns -1."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "remainingUnresolvedCallCount": len(calls) - len(selected) - 67,
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(selector_counts.items())
            },
            "dialogueRegionSelectorCounts": {
                str(value): count
                for value, count in sorted(dialogue_counts.items())
            },
        },
        "evidenceBoundary": [
            "The owning subsystem remains unnamed.",
            "Selector zero's pointer is preserved as an uninterpreted native configuration word.",
            "The initializer and active reset helpers remain explicit runtime adapter calls.",
            "Selectors -1 and 1 enter a larger state machine and remain unresolved.",
            "Selectors 4 and 5 are proven separately as fixed global dword writes.",
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
