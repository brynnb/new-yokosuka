#!/usr/bin/env python3
"""Verify operation 0x0075's guarded FACE-record parameter writes."""

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
    / "tools/evidence/face-record-parameter-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C164E76,
        66,
        "9410bfc330962cd0e82547d90c62ef01897c0978a988d7cb8c08b798f1f7768f",
    ),
    "momtPrecheck": (
        0x0C114314,
        28,
        "8c6e31027a4ae437740f04597870e04214c5e395e171244fd410cdf2a9235bf4",
    ),
    "faceResolver": (
        0x0C0BC538,
        8,
        "54e0ce59b2e376eca571852b37e52dd7907a57fa1b025514349d496fc49a64c6",
    ),
    "mutator": (
        0x0C0BC614,
        94,
        "30782bf2a269dde47a01703cf71a0d7b98ea0be8e4e2cf49ac58c436db7094c6",
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
                        or action.get("operationId") != 0x0075
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


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0075 {name} changed")
    literals = {
        "objectResolver": u32(executable, 0x0C164F8C),
        "momtPrecheck": u32(executable, 0x0C164F90),
        "faceResolver": u32(executable, 0x0C164F98),
        "mutator": u32(executable, 0x0C164FB8),
        "momtTag": u32(executable, 0x0C114440),
        "momtRecordLookup": u32(executable, 0x0C114444),
        "faceRecordLookup": u32(executable, 0x0C0BC678),
        "faceTag": u32(executable, 0x0C0BC67C),
        "stateTableAddress": u32(executable, 0x0C0BC684),
    }
    if literals != {
        "objectResolver": 0x0C153956,
        "momtPrecheck": 0x0C114314,
        "faceResolver": 0x0C0BC538,
        "mutator": 0x0C0BC614,
        "momtTag": 0x4D544F4D,
        "momtRecordLookup": 0x0C0AAD5A,
        "faceRecordLookup": 0x0C0AAD5A,
        "faceTag": 0x45434146,
        "stateTableAddress": 0x0C2200F8,
    }:
        raise ValueError("operation-0x0075 dependencies changed")
    return {
        name: (
            "MOMT" if name == "momtTag"
            else "FACE" if name == "faceTag"
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
    selected = [call for call in calls if len(call["arguments"]) == 4]
    if len(calls) != 1013 or len(selected) != 1013:
        raise ValueError("operation-0x0075 authored inventory changed")
    if any(
        call["arguments"][index].get("kind") != "constant"
        for call in selected
        for index in (2, 3)
    ):
        raise ValueError("operation-0x0075 numeric operand recovery changed")
    return {
        "schema": "new-yokosuka-face-record-parameter-operation-evidence-v1",
        "status": "exact-native-guarded-writes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0075,
            "operationHex": "0x0075",
            "handlerAddress": "0x0c164e76",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "guards": [
                "the resolved object has an associated MOMT record",
                "the resolved object has an associated FACE record",
                "FACE byte +0x31 is not 8",
                (
                    "FACE dword +0x20 equals the first dword of the 28-byte "
                    "state-table entry selected by unsigned FACE byte +0x31"
                ),
                "FACE dword +0x20 is nonzero",
            ],
            "guardFailureBehavior": (
                "Missing records or state byte 8 return without mutation. A "
                "state-table pointer mismatch first clears FACE dwords +0x20 "
                "and +0x24 and byte +0x30, then the resulting null +0x20 "
                "prevents the parameter writes."
            ),
            "recordWrites": [
                {
                    "offset": "FACE+0x30",
                    "width": "byte",
                    "value": "low byte of argument one",
                },
                {
                    "offset": "FACE+0x2c",
                    "width": "word",
                    "value": "low word of six times argument two",
                },
                {
                    "offset": "FACE+0x2e",
                    "width": "word",
                    "value": (
                        "signed low word of argument three, clamped to a "
                        "minimum of one"
                    ),
                },
                {
                    "offset": "FACE+0x45",
                    "width": "byte",
                    "value": 0,
                },
            ],
            "provenBehavior": (
                "Resolves an object, requires its native MOMT and FACE "
                "associated records, validates the FACE record's active "
                "pointer against the exact state table, and conditionally "
                "writes four numeric FACE fields derived from arguments one "
                "through three."
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
            "argumentKindCounts": {
                str(index): dict(sorted(Counter(
                    call["arguments"][index]["kind"] for call in selected
                ).items()))
                for index in range(4)
            },
        },
        "evidenceBoundary": [
            "MOMT and FACE are retained only as exact executable record tags.",
            "All 1,013 authored calls have exactly four recovered arguments; arguments two and three are constants in every call.",
            "The selected state-table entry is runtime state. Execution must receive that exact pointer state and must not assume the validation guard passes.",
            "The numeric meanings of the four written fields remain deliberately unnamed.",
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
