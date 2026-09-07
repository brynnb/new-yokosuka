#!/usr/bin/env python3
"""Verify the native 0x00e7/0x00e9 HNDL/HNDR motion contract."""

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
    PROJECT_ROOT / "tools/evidence/hndl-hndr-motion-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "requestHandler": (
        0x0C1651CA,
        58,
        "1c887f2ea7b4f7e10bbd0e82bd88a5faa0a35f36d6a70f0fe41095445de51139",
    ),
    "controlHandler": (
        0x0C165280,
        84,
        "35f4e55ca786df5f6a791940737cf3cdd2890972e722235e4e20be19e5a1bc19",
    ),
    "recordResolver": (
        0x0C165158,
        56,
        "c18f3f4c8bd977202c2dee2bc6d33d75d738d7578106870dd74da3b5138e40dd",
    ),
    "controllerInitializer": (
        0x0C0DEC66,
        328,
        "9c013a3263e7f78a9535a47b7c42a569228b3f3fa40d617b765d62ac07f28b05",
    ),
    "flagController": (
        0x0C0DEDC0,
        138,
        "409e3b860c73f18e7720f30385222a9bd736c44567e489d23a8d9e441576f83d",
    ),
    "stepController": (
        0x0C0DEE4A,
        12,
        "05d3f856fb9003a5b7d395159dd8a4e37867706b62641348bcc3f3e7c3bb3118",
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


def operation_calls(event_ir: dict[str, Any], operation_id: int) -> list[dict]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def kind_counts(calls: list[dict], index: int) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index]["kind"]
        for call in calls
        if index < len(call["arguments"])
    ).items()))


def constant_counts(calls: list[dict], index: int) -> dict[str, int]:
    return {
        str(value): count
        for value, count in sorted(Counter(
            call["arguments"][index]["value"]
            for call in calls
            if (
                index < len(call["arguments"])
                and call["arguments"][index]["kind"] == "constant"
            )
        ).items())
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"HNDL/HNDR motion {name} changed")
    dependencies = {
        "requestInitializer": u32(executable, 0x0C165278),
        "flagController": u32(executable, 0x0C1654E0),
        "stepController": u32(executable, 0x0C1654E4),
        "controllerRangeList": u32(executable, 0x0C0DED54),
    }
    if dependencies != {
        "requestInitializer": 0x0C0DEC66,
        "flagController": 0x0C0DEDC0,
        "stepController": 0x0C0DEE4A,
        "controllerRangeList": 0x0C216B08,
    }:
        raise ValueError("HNDL/HNDR motion dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def inventory(calls: list[dict]) -> dict:
    return {
        "callCount": len(calls),
        "dialogueRegionCallCount": sum(call["dialogueRegion"] for call in calls),
        "areaCount": len({(call["disc"], call["area"]) for call in calls}),
        "argumentCountCounts": {
            str(value): count
            for value, count in sorted(Counter(
                len(call["arguments"]) for call in calls
            ).items())
        },
        "argumentKindCounts": {
            str(index): kind_counts(calls, index)
            for index in range(max(len(call["arguments"]) for call in calls))
        },
        "constantSideSelectorCounts": constant_counts(calls, 1),
    }


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dependencies = verify_native_contract(executable)
    requests = operation_calls(event_ir, 0x00E7)
    controls = operation_calls(event_ir, 0x00E9)
    request_inventory = inventory(requests)
    control_inventory = inventory(controls)
    if request_inventory != {
        "callCount": 331,
        "dialogueRegionCallCount": 20,
        "areaCount": 40,
        "argumentCountCounts": {"9": 331},
        "argumentKindCounts": {
            "0": {"constant": 299, "frame-field": 32},
            "1": {"constant": 316, "frame-field": 15},
            "2": {"constant": 316, "frame-field": 15},
            "3": {"constant": 331},
            "4": {"constant": 331},
            "5": {"constant": 331},
            "6": {"constant": 331},
            "7": {"constant": 331},
            "8": {"constant": 331},
        },
        "constantSideSelectorCounts": {"0": 106, "1": 210},
    }:
        raise ValueError("operation-0x00e7 authored inventory changed")
    if control_inventory != {
        "callCount": 57,
        "dialogueRegionCallCount": 0,
        "areaCount": 15,
        "argumentCountCounts": {"4": 7, "5": 50},
        "argumentKindCounts": {
            "0": {"constant": 57},
            "1": {"constant": 57},
            "2": {"constant": 57},
            "3": {"constant": 57},
            "4": {"constant": 50},
        },
        "constantSideSelectorCounts": {"0": 23, "1": 34},
    }:
        raise ValueError("operation-0x00e9 authored inventory changed")
    mode_counts = constant_counts(controls, 2)
    if mode_counts != {"0": 50, "1": 7}:
        raise ValueError("operation-0x00e9 control modes changed")
    op00_requests = [call for call in requests if call["area"] == "OP00"]
    op00_controls = [call for call in controls if call["area"] == "OP00"]
    if len(op00_requests) != 4 or len(op00_controls) != 16:
        raise ValueError("OP00 HNDL/HNDR motion inventory changed")
    return {
        "schema": "new-yokosuka-hndl-hndr-motion-operation-evidence-v1",
        "status": "exact-native-motion-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operations": {
            "request": {
                "operationId": 0x00E7,
                "operationHex": "0x00e7",
                "handlerAddress": "0x0c1651ca",
                "argumentCount": 9,
                "recordSelection": "argument one zero selects HNDL; nonzero selects HNDR",
                "fields": {
                    "motionSelector": "argument two signed low word",
                    "startIndex": "argument three signed low word minus one",
                    "endIndex": "argument four signed low word minus one",
                    "currentIndex": "argument five signed low word minus one",
                    "flagByte": "argument six low byte with bit three cleared",
                    "positiveStepFloatWord": "argument seven raw float word when greater than zero",
                    "transitionDurationWord": "argument eight signed low word",
                },
                "provenBehavior": (
                    "Resolves the selected HNDL/HNDR record, selects the exact "
                    "controller range for argument two, initializes and clamps "
                    "the authored index interval, clears flag bit three, applies "
                    "a positive playback step, and starts the optional native "
                    "transition when argument eight is positive. Missing objects "
                    "or records are native no-ops and a missing range produces "
                    "the native zero-range controller state."
                ),
            },
            "control": {
                "operationId": 0x00E9,
                "operationHex": "0x00e9",
                "handlerAddress": "0x0c165280",
                "recordSelection": "argument one zero selects HNDL; nonzero selects HNDR",
                "modes": {
                    "0": (
                        "argument three's signed-low-word truth value sets or "
                        "clears the argument-four low-byte mask; direction bit "
                        "one transitions clamp the opposite range endpoint to "
                        "the current endpoint exactly as the native controller"
                    ),
                    "1": (
                        "writes argument three's raw float word to the playback "
                        "step only when it is greater than zero"
                    ),
                },
                "provenBehavior": (
                    "Dispatches only control modes zero and one. Other modes and "
                    "missing objects or records are native no-ops."
                ),
            },
            "nativeDependencies": dependencies,
        },
        "allDiscInventory": {
            "request": request_inventory,
            "control": {
                **control_inventory,
                "constantModeCounts": mode_counts,
            },
            "op00RequestCount": len(op00_requests),
            "op00ControlCount": len(op00_controls),
        },
        "evidenceBoundary": [
            "HNDL and HNDR remain literal native associated-record tags.",
            "Raw argument words are retained; only the native signed-word, byte, and float interpretations are applied.",
            "Controller range lookup remains an injected record inventory rather than a guessed animation mapping.",
            "The browser presentation adapter remains separate from this canonical controller-state contract.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
