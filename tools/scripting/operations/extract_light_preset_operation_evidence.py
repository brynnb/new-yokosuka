#!/usr/bin/env python3
"""Verify operation 0x010f as the native indexed LGHT preset selector."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/light-preset-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1646F2,
        14,
        "a53e55b48b7b189abd0380ab8a65f84bb9aac68abae8cce9350b84be4d6777c1",
    ),
    "presetSelector": (
        0x0C0EC01E,
        468,
        "b26f3d720a37dec8c4aafe71ae8f58af55adc600120ecad2822d3ab78b1b2fec",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x010F:
                        continue
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                    })
    return calls


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, size)) != digest:
            raise ValueError(f"operation-0x010f {name} changed")
    if u32(executable, 0x0C164820) != 0x0C0EC01E:
        raise ValueError("operation-0x010f preset-selector target changed")
    if u32(executable, 0x0C0EC200) != 0x0C2172FC:
        raise ValueError("native LGHT preset table changed")
    if u32(executable, 0x0C0EC204) != 0x5448474C:
        raise ValueError("native LGHT signature changed")

    calls = operation_calls(event_ir)
    if len(calls) != 317 or any(len(call["arguments"]) != 1 for call in calls):
        raise ValueError("operation-0x010f authored inventory changed")
    kinds = Counter(call["arguments"][0]["kind"] for call in calls)
    if kinds != {"constant": 311, "frame-field": 6}:
        raise ValueError("operation-0x010f argument kinds changed")
    constants = Counter(
        call["arguments"][0]["value"]
        for call in calls
        if call["arguments"][0]["kind"] == "constant"
    )
    if min(constants) != 0 or max(constants) != 16:
        raise ValueError("operation-0x010f constant preset range changed")
    op02_calls = [
        {
            "callFileOffset": call["callFileOffset"],
            "presetIndex": call["arguments"][0]["value"],
        }
        for call in calls
        if call["disc"] == 1 and call["area"] == "OP02"
    ]
    if op02_calls != [
        {"callFileOffset": "0x13ae", "presetIndex": 1},
        {"callFileOffset": "0x21e2", "presetIndex": 0},
        {"callFileOffset": "0x2342", "presetIndex": 0},
    ]:
        raise ValueError("OP02 operation-0x010f route changed")

    return {
        "schema": "new-yokosuka-light-preset-operation-evidence-v1",
        "status": "exact-native-lght-selection-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x010F,
            "operationHex": "0x010f",
            "handlerAddress": "0x0c1646f2",
            "presetSelectorAddress": "0x0c0ec01e",
            "presetTableAddress": "0x0c2172fc",
            "slotCount": 24,
            "resourceSignature": "LGHT",
            "provenBehavior": (
                "Reads the signed argument as one of 24 LGHT resource slots. "
                "A negative, out-of-range, absent, or null slot returns without "
                "mutation; a present LGHT child is applied immediately."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "argumentKinds": dict(sorted(kinds.items())),
            "constantPresetCounts": {
                str(index): count for index, count in sorted(constants.items())
            },
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "op02Calls": op02_calls,
        },
        "evidenceBoundary": [
            "The MAPINFO LGHT child order is the authoritative preset index; no time-of-day label is inferred.",
            "The six frame-field selectors remain runtime-bound and retain the native 0..23 bounds check.",
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
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
