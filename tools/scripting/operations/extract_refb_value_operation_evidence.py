#!/usr/bin/env python3
"""Verify operation 0x016b's exact REFB-record value writes."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/refb-value-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1600AA,
        26,
        "0ef5bd8de656cabd232ff6f130df6370f61e2fa917413900a6290541337a365e",
    ),
    "recordWriter": (
        0x0C1444AC,
        50,
        "3139f5142c7487954a9018592502cbace1852b49ed28b4afca8af1309cc73fcc",
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
                        or action.get("operationId") != 0x016B
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
            raise ValueError(f"operation-0x016b {name} changed")
    literals = {
        "objectResolver": u32(executable, 0x0C1602A0),
        "recordWriter": u32(executable, 0x0C1602A4),
        "recordTag": u32(executable, 0x0C1446D8),
        "recordLookup": u32(executable, 0x0C1446DC),
    }
    if literals != {
        "objectResolver": 0x0C153956,
        "recordWriter": 0x0C1444AC,
        "recordTag": 0x42464552,
        "recordLookup": 0x0C0AAD5A,
    }:
        raise ValueError("operation-0x016b dependencies changed")
    return {
        name: ("REFB" if name == "recordTag" else f"0x{value:08x}")
        for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if len(call["arguments"]) == 2]
    rejected = [call for call in calls if len(call["arguments"]) != 2]
    if len(calls) != 1326 or len(selected) != 1324 or len(rejected) != 2:
        raise ValueError("operation-0x016b authored inventory changed")
    argument_count_counts = Counter(len(call["arguments"]) for call in calls)
    value_kind_counts = Counter(
        call["arguments"][1]["kind"] for call in selected
    )
    constant_value_counts = Counter(
        call["arguments"][1]["value"]
        for call in selected
        if call["arguments"][1]["kind"] == "constant"
    )
    dialogue_constant_value_counts = Counter(
        call["arguments"][1]["value"]
        for call in selected
        if (
            call["dialogueRegion"]
            and call["arguments"][1]["kind"] == "constant"
        )
    )
    if argument_count_counts != {0: 2, 2: 1324}:
        raise ValueError("operation-0x016b argument counts changed")
    if value_kind_counts != {"constant": 1323, "frame-field": 1}:
        raise ValueError("operation-0x016b value kinds changed")
    if constant_value_counts != {0: 158, 1: 736, 2: 427, 3: 2}:
        raise ValueError("operation-0x016b constant values changed")
    if dialogue_constant_value_counts != {0: 21, 1: 68, 2: 49}:
        raise ValueError("operation-0x016b dialogue values changed")
    if any(call["dialogueRegion"] for call in rejected):
        raise ValueError("operation-0x016b malformed dialogue inventory changed")
    return {
        "schema": "new-yokosuka-refb-value-operation-evidence-v1",
        "status": "exact-native-record-write-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x016B,
            "operationHex": "0x016b",
            "handlerAddress": "0x0c1600aa",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "recordTag": "REFB",
            "valueDwordOffset": "record+0x14",
            "zeroClearDwordOffset": "record+0x18",
            "stateDwordOffset": "record+0x24",
            "stateDwordValue": 1,
            "provenBehavior": (
                "Resolves argument zero, obtains its associated REFB record, "
                "writes argument one unchanged to dword +0x14, and writes one "
                "to dword +0x24. When argument one is zero, it also writes "
                "zero to dword +0x18."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "unresolvedMalformedCallCount": len(rejected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentCountCounts": {
                str(count): amount
                for count, amount in sorted(argument_count_counts.items())
            },
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"] for call in selected
            ).items())),
            "valueArgumentKindCounts": dict(sorted(value_kind_counts.items())),
            "constantValueCounts": {
                str(value): count
                for value, count in sorted(constant_value_counts.items())
            },
            "dialogueRegionConstantValueCounts": {
                str(value): count
                for value, count in sorted(
                    dialogue_constant_value_counts.items()
                )
            },
        },
        "evidenceBoundary": [
            "REFB is retained only as the executable's exact associated-record tag.",
            "The gameplay meanings of the three numeric record fields remain unnamed.",
            "The two authored zero-argument calls are malformed for this handler and remain unresolved.",
            "A missing object or REFB record is a native no-op, not an inferred error.",
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
