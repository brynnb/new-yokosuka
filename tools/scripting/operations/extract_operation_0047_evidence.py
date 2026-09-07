#!/usr/bin/env python3
"""Recover operation 0x0047's exact EFPT controller routes and corpus ABI."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0047-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER_ADDRESS = 0x0C15FEAE
HANDLER_LENGTH = 488
HANDLER_SHA256 = "754769128a63165a75a1e3afd1032b5a09c6c83b35e9913a9faf6424895c227c"
TABLE_ENTRY_ADDRESS = 0x0C29AAFC
RESULT_WRITER = (0x0C15FFC4, 0x0C0BB342)
ROUTES = {
    0: {"argumentCount": 6, "pointer": (0x0C15FFD4, 0x0C0B9890)},
    1: {"argumentCount": 2, "pointer": (0x0C15FFA0, 0x0C0B5C0C)},
    2: {"argumentCount": 2, "pointer": (0x0C15FFA4, 0x0C0B5CC6)},
    3: {"argumentCount": 2, "pointer": (0x0C15FFA8, 0x0C0B5AF8)},
    6: {"argumentCount": 4, "pointer": (0x0C16027C, 0x0C0B5E60)},
    7: {"argumentCount": 3, "pointer": (0x0C160280, 0x0C0B5ED4)},
    10: {"argumentCount": 3, "pointer": (0x0C160288, 0x0C0B60C0)},
    13: {"argumentCount": 4, "pointer": (0x0C16028C, 0x0C0B5F6E)},
    15: {"argumentCount": 1, "pointer": (0x0C160290, 0x0C0B9AF0)},
}
EXPECTED_COUNTS = {0: 25, 1: 25, 2: 4, 3: 4, 6: 7, 7: 4, 10: 4, 13: 4, 15: 25}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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
                    if action.get("operationId") != 0x0047:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(data, TABLE_ENTRY_ADDRESS) != HANDLER_ADDRESS:
        raise ValueError("operation 0x0047 dispatch table entry changed")
    if digest(runtime_slice(data, HANDLER_ADDRESS, HANDLER_LENGTH)) != HANDLER_SHA256:
        raise ValueError("operation 0x0047 handler changed")
    if u32(data, RESULT_WRITER[0]) != RESULT_WRITER[1]:
        raise ValueError("operation 0x0047 result writer changed")
    for mode, route in ROUTES.items():
        address, expected = route["pointer"]
        if u32(data, address) != expected:
            raise ValueError(f"operation 0x0047 mode {mode} helper changed")
    return {
        "operationId": 0x0047,
        "operationHex": "0x0047",
        "tableEntryAddress": f"0x{TABLE_ENTRY_ADDRESS:08x}",
        "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
        "handlerLength": HANDLER_LENGTH,
        "handlerSha256": HANDLER_SHA256,
        "resultWriter": f"0x{RESULT_WRITER[1]:08x}",
        "routes": {
            str(mode): {
                "argumentCount": route["argumentCount"],
                "helperAddress": f"0x{route['pointer'][1]:08x}",
            }
            for mode, route in ROUTES.items()
        },
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    operation = verify_executable(data)
    calls = calls_for(event_ir)
    counts = Counter(call["arguments"][0].get("value") for call in calls)
    if counts != EXPECTED_COUNTS:
        raise ValueError("operation 0x0047 authored route counts changed")
    for call in calls:
        arguments = call["arguments"]
        mode = arguments[0].get("value")
        if arguments[0].get("kind") != "constant" or mode not in ROUTES:
            raise ValueError("operation 0x0047 dynamic mode changed")
        if len(arguments) != ROUTES[mode]["argumentCount"]:
            raise ValueError("operation 0x0047 authored ABI changed")
        if call["resultComparison"] is not None:
            raise ValueError("operation 0x0047 result comparison changed")
        if (call["resultTarget"] is not None) != (mode == 0):
            raise ValueError("operation 0x0047 result ownership changed")
    kind_counts = {
        str(mode): {
            str(index): dict(sorted(Counter(
                call["arguments"][index]["kind"]
                for call in calls
                if call["arguments"][0].get("value") == mode
            ).items()))
            for index in range(ROUTES[mode]["argumentCount"])
        }
        for mode in ROUTES
    }
    return {
        "schema": "new-yokosuka-native-operation-0047-evidence-v1",
        "status": "exact-native-efpt-controller-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": operation,
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "modeCounts": {str(mode): counts[mode] for mode in sorted(counts)},
            "argumentKindCountsByMode": kind_counts,
            "resultTargetCount": sum(call["resultTarget"] is not None for call in calls),
        },
        "evidenceBoundary": [
            "Operation 0x0047 owns nine exact authored EFPT routes: 0, 1, 2, 3, 6, 7, 10, 13, and 15.",
            "Mode zero forwards two three-word vectors, a count word, one raw float32 word, and a control word to the exact EFPT creation helper; it publishes the returned slot handle.",
            "The native EFPT creator searches exactly eight slots and returns -1 when every slot is occupied.",
            "Modes one, two, and three forward one handle through separate exact helpers using fixed native controller selector two.",
            "Mode six forwards one handle and two three-word vectors; modes seven and ten forward one raw float32 word; mode thirteen forwards two raw float32 words.",
            "Mode fifteen invokes the independent EFPT global reset helper and consumes no handle.",
            "No authored route other than mode zero consumes a result.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
