#!/usr/bin/env python3
"""Recover operation 0x0100's exact YD01 EFPT routes and full corpus ABI."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0100-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
TABLE_ENTRY_ADDRESS = 0x0C29ADE0
HANDLER_ADDRESS = 0x0C15F74C
HANDLER_LENGTH = 1170
HANDLER_SHA256 = "095f5cde693e5db56b240a68b1ca28ee78b21545dfda2283b03323edc40def92"
FULL_INVENTORY_SHA256 = "ded66a3a8f623d26fcf96b33910cf5004c3d3042cc623262d93e2be53a947f2d"
YD01_INVENTORY_SHA256 = "4e3d1500577383374abb6d09da3503f3a95e5512acc0f2e03b4cbd09491ea005"
HELPERS = {
    0: (7, 0x0C15F9C8, 0x0C0B7BC8, 1292,
        "09873041cd438bfb7e2940625167689a9889bedd8f5628e35ae378f46be166c0"),
    1: (2, 0x0C15F9CC, 0x0C0B5C0C, 186,
        "66e5aa06c5473969c79fd9c9770b51edd2a727a553b327c2198fe805a57bb1f5"),
    2: (2, 0x0C15F9D0, 0x0C0B5CC6, 198,
        "9fa9677fd53f435f69cfb7e65efd63ba480ddad36d8d6b087cc453d6dfe14618"),
    3: (2, 0x0C15F9D4, 0x0C0B5AF8, 276,
        "34e4284207b12503e8311ea1c2c64f1a3f2dd6cf63cfa6ff3ad8e322dfdfc964"),
    7: (3, 0x0C15F9E8, 0x0C0B5ED4, 72,
        "c0a1112b4add46a19501a8c6b5d665574bc43acca7d8dd079742cae29e852c2a"),
    8: (4, 0x0C15F9EC, 0x0C0B5F6E, 80,
        "54bcb9f294523957b9f4e86788258198131b2788bbf8dedc2373cb4efe9b7d3a"),
    9: (5, 0x0C15F9F0, 0x0C0B5FE0, 224,
        "06e640d98d2074935e5e93dbe05dfeb20d3ba6bc872051275958482cf573f86d"),
    11: (3, 0x0C15F9F8, 0x0C0B61E4, 256,
         "41d89fb82afaa0998977f2b9ed0e6352a1a605756bd5006ff6e46551b793b62f"),
    12: (3, 0x0C15F9FC, 0x0C0B62E4, 192,
         "846ab6515c29ae2b9c3e5618ba63b718379453e3e7a183ff62e024d23b7621ce"),
}
SELECTOR_COUNTS = {
    0: 34, 1: 52, 2: 33, 3: 41, 4: 6, 5: 12, 6: 38, 7: 59,
    8: 49, 9: 46, 10: 41, 11: 45, 12: 46, 13: 4, 14: 8, 15: 7,
    16: 18, 50: 1, 100: 1, 101: 1, 102: 1, 103: 1, 105: 1,
    106: 1, 107: 3, 108: 1, 109: 1, 110: 2, 111: 2, 112: 1,
    113: 1,
}
ARGUMENT_COUNTS = {2: 135, 3: 218, 4: 122, 5: 47, 6: 1, 7: 34}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_digest(value: Any) -> str:
    return digest(json.dumps(
        value, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8"))


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls_for(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x0100:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(data, TABLE_ENTRY_ADDRESS) != HANDLER_ADDRESS:
        raise ValueError("operation 0x0100 dispatch table entry changed")
    if digest(runtime_slice(data, HANDLER_ADDRESS, HANDLER_LENGTH)) != HANDLER_SHA256:
        raise ValueError("operation 0x0100 handler changed")
    routes = {}
    for mode, (argument_count, pointer_address, helper_address,
               helper_length, helper_sha256) in HELPERS.items():
        if u32(data, pointer_address) != helper_address:
            raise ValueError(f"operation 0x0100 mode {mode} helper changed")
        if digest(runtime_slice(data, helper_address, helper_length)) != helper_sha256:
            raise ValueError(f"operation 0x0100 mode {mode} helper body changed")
        routes[str(mode)] = {
            "argumentCount": argument_count,
            "helperAddress": f"0x{helper_address:08x}",
            "helperLength": helper_length,
            "helperSha256": helper_sha256,
        }
    if runtime_slice(data, 0x0C0B7D08, 4) != b"EFPT":
        raise ValueError("operation 0x0100 creator resource tag changed")
    return {
        "operationId": 0x0100,
        "operationHex": "0x0100",
        "tableEntryAddress": f"0x{TABLE_ENTRY_ADDRESS:08x}",
        "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
        "handlerLength": HANDLER_LENGTH,
        "handlerSha256": HANDLER_SHA256,
        "controllerSelector": 0,
        "slotCount": 16,
        "resourceTag": "EFPT",
        "yd01Routes": routes,
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    operation = verify_executable(data)
    calls = calls_for(event_ir)
    if len(calls) != 557 or json_digest(calls) != FULL_INVENTORY_SHA256:
        raise ValueError("operation 0x0100 full authored inventory changed")
    selectors = Counter(call["arguments"][0].get("value") for call in calls)
    argument_counts = Counter(len(call["arguments"]) for call in calls)
    if selectors != SELECTOR_COUNTS or argument_counts != ARGUMENT_COUNTS:
        raise ValueError("operation 0x0100 authored ABI counts changed")
    yd01 = [
        call for call in calls
        if call["disc"] == 1 and call["area"] == "YD01"
    ]
    if len(yd01) != 9 or json_digest(yd01) != YD01_INVENTORY_SHA256:
        raise ValueError("operation 0x0100 YD01 route inventory changed")
    if {call["arguments"][0]["value"] for call in yd01} != set(HELPERS):
        raise ValueError("operation 0x0100 YD01 selector set changed")
    for call in yd01:
        mode = call["arguments"][0]["value"]
        if len(call["arguments"]) != HELPERS[mode][0]:
            raise ValueError("operation 0x0100 YD01 authored ABI changed")
    return {
        "schema": "new-yokosuka-native-operation-0100-evidence-v1",
        "status": "exact-yd01-native-efpt-primary-controller-routes",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": operation,
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "selectorCounts": {str(key): selectors[key] for key in sorted(selectors)},
            "argumentCountCounts": {
                str(key): argument_counts[key] for key in sorted(argument_counts)
            },
            "canonicalSha256": FULL_INVENTORY_SHA256,
        },
        "yd01Inventory": {
            "authoredCallCount": len(yd01),
            "canonicalSha256": YD01_INVENTORY_SHA256,
            "routes": yd01,
        },
        "evidenceBoundary": [
            "Operation 0x0100 dispatches a broad native selector family; this recovery promotes only YD01's nine exact authored routes.",
            "YD01 mode zero forwards two three-word vectors and four scalar words to the exact EFPT creator, then publishes its sixteen-slot handle or -1 when full.",
            "YD01 modes one, two, and three address exact controller selector zero through separate activate, deactivate, and release helpers.",
            "YD01 modes seven and eight write one and two raw float32 words; mode nine forwards three authored byte words through the exact packed-field helper.",
            "YD01 modes eleven and twelve forward one integer word through separate exact controller helpers.",
            "The full 557-call corpus inventory is pinned, but unlisted selector/argument combinations remain unresolved rather than being promoted as a cross-product.",
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
    print(f"Wrote {args.out}: {report['yd01Inventory']['authoredCallCount']} YD01 routes")


if __name__ == "__main__":
    main()
