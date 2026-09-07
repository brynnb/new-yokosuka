#!/usr/bin/env python3
"""Verify the unrelated operation-0x01a0 REFB and 0x01b8 slot contracts."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-01a0-01b8-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operation01a0Handler": (0x0C1600EC, 52,
        "2ac56340fd812f800907bd6fdd9573d3c8b81ba9032c9e413b025493b3ebca4e"),
    "refbControlWriter": (0x0C14458E, 80,
        "cd8655b8a1c0a5b0dca3c85be0c53b1e9e91933dd329770f8bf0fc661b49a01e"),
    "operation01b8Handler": (0x0C16B24C, 50,
        "d8df75a2789630b15b2fe67bf3a07b467510e22a34120cd55cad4a08ff527aca"),
    "slotAllocator": (0x0C17AB94, 90,
        "c8bacba87049dbc8c0192014dcea76ba342b5be7797b91443492f987fcfda420"),
    "slotRelease": (0x0C17ABEE, 32,
        "34bc33bf9853e759661c833c1afaf0c00adc0f1b5aa6b0d19b4ebfab324abf75"),
    "operationResultWriter": (0x0C0BB342, 6,
        "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls(event_ir: dict[str, Any], operation_id: int) -> list[dict[str, Any]]:
    found = []
    for area in event_ir["maps"]:
        for function in area["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == operation_id
                    ):
                        found.append({
                            "disc": area["disc"],
                            "area": area["area"],
                            "function": function["id"],
                            "callFileOffset": action["callFileOffset"],
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    return found


def verify_executable(data: bytes) -> dict[str, dict[str, Any]]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, expected_hash) in RANGES.items():
        if digest(runtime_slice(data, address, length)) != expected_hash:
            raise ValueError(f"{name} changed")
    pointers = {
        0x0C29B060: 0x0C1600EC,
        0x0C29B0C0: 0x0C16B24C,
        0x0C1602A0: 0x0C153956,
        0x0C1602B0: 0x0C14458E,
        0x0C1446D8: 0x42464552,
        0x0C16B428: 0x0C17AB94,
        0x0C16B42C: 0x0C0BB342,
        0x0C16B430: 0x0C17ABEE,
    }
    for address, expected in pointers.items():
        if u32(data, address) != expected:
            raise ValueError(f"native pointer at 0x{address:08x} changed")
    return {
        name: {
            "address": f"0x{address:08x}",
            "length": length,
            "sha256": expected_hash,
        }
        for name, (address, length, expected_hash) in RANGES.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    ranges = verify_executable(data)
    refb_calls = calls(event_ir, 0x01A0)
    slot_calls = calls(event_ir, 0x01B8)
    refb_modes = Counter(call["arguments"][1].get("value") for call in refb_calls)
    if (
        len(refb_calls) != 4
        or {(call["disc"], call["area"]) for call in refb_calls} != {(1, "OP00")}
        or refb_modes != {0: 1, 2: 1, 3: 1, 5: 1}
        or any(
            len(call["arguments"]) != 3
            or call["arguments"][0].get("kind") != "frame-field"
            or call["arguments"][2].get("kind") != "constant"
            or call["arguments"][2].get("value") != 0
            or call["resultTarget"] is not None
            or call["resultComparison"] is not None
            for call in refb_calls
        )
    ):
        raise ValueError("operation-0x01a0 authored inventory changed")
    slot_modes = Counter(call["arguments"][0].get("value") for call in slot_calls)
    if (
        len(slot_calls) != 8
        or slot_modes != {0: 4, 1: 4}
        or any(len(call["arguments"]) != 2 for call in slot_calls)
        or any(call["arguments"][0].get("kind") != "constant" for call in slot_calls)
        or any(call["resultComparison"] is not None for call in slot_calls if call["area"] != "MA00")
        or any(
            call["resultTarget"] is None
            for call in slot_calls
            if call["arguments"][0].get("value") == 1
        )
        or any(
            call["resultTarget"] is not None
            for call in slot_calls
            if call["arguments"][0].get("value") == 0
        )
    ):
        raise ValueError("operation-0x01b8 authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-01a0-01b8-evidence-v1",
        "status": "exact-unrelated-refb-control-and-transient-slot-contracts",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedRanges": ranges,
        "operation01a0": {
            "operationId": 0x01A0,
            "operationHex": "0x01a0",
            "tableEntryAddress": "0x0c29b060",
            "handlerAddress": "0x0c1600ec",
            "recordTag": "REFB",
            "authoredCallCount": len(refb_calls),
            "authoredModes": sorted(refb_modes),
            "provenBehavior": (
                "Resolves argument zero, looks up its REFB associated record, "
                "writes argument one to dword +0x1c and argument two to dword "
                "+0x20, and installs the REFB callback only when dword +0x24 "
                "was zero before setting it to one. Missing objects or REFB "
                "records are exact no-ops."
            ),
        },
        "operation01b8": {
            "operationId": 0x01B8,
            "operationHex": "0x01b8",
            "tableEntryAddress": "0x0c29b0c0",
            "handlerAddress": "0x0c16b24c",
            "slotCount": 16,
            "allocationOrder": "15 down through 0",
            "authoredCallCount": len(slot_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in slot_calls}),
            "authoredModes": {str(mode): count for mode, count in sorted(slot_modes.items())},
            "provenBehavior": (
                "Mode one allocates the highest free slot in a sixteen-entry "
                "four-byte record table, initializes its four bytes, invokes "
                "native message 0x00a5, stores argument one as a signed word, "
                "and returns the slot or -1 when full. Mode zero invokes "
                "message 0x00a6 and clears the slot-active byte when argument "
                "one is at most 15."
            ),
        },
        "relationship": (
            "The operations are not a shared subsystem: 0x01a0 mutates an "
            "object-associated REFB record, while 0x01b8 owns an independent "
            "global sixteen-slot table at 0x0c224aa0."
        ),
        "evidenceBoundary": [
            "The exact record fields, allocation order, bounds, result, and authored operand shapes are proven.",
            "The high-level gameplay names of the REFB callback and transient slot messages remain intentionally unspecified.",
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
        f"Wrote {args.out}: {report['operation01a0']['authoredCallCount']} REFB "
        f"and {report['operation01b8']['authoredCallCount']} slot calls"
    )


if __name__ == "__main__":
    main()
