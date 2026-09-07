#!/usr/bin/env python3
"""Recover operation 0x006e's fixed float exchanges and inert authored routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-006e-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
TABLE_ENTRY_ADDRESS = 0x0C29AB98
HANDLER_ADDRESS = 0x0C156BC4
HANDLER_LENGTH = 288
HANDLER_SHA256 = "7c7d61dbdc10781e058f04f8f56cf6a04fa27749a2b4916daeb3340de418598f"
INVENTORY_SHA256 = "89a364d1fa5bb450b1222a52f1f7624686cfbc25832d6a2fe80152cad403a1dc"
RESULT_WRITER = (0x0C156CE0, 0x0C0BB348)
EXCHANGES = {
    0: {
        "pointer": (0x0C156CC0, 0x0C18805A),
        "length": 14,
        "sha256": "d33dc26be0ccfb787393f4a9008e970b147bf364cc1262665a822c55f473637c",
        "storage": [0x0C29CFBC],
    },
    1: {
        "pointer": (0x0C156CC4, 0x0C188068),
        "length": 18,
        "sha256": "cebd8ffd10e585b5f21d5b476585e1c94f9824593efb93b7df2f99a2e84ea259",
        "storage": [0x0C29CFC0, 0x0C29CFC8],
    },
    2: {
        "pointer": (0x0C156CC8, 0x0C18807A),
        "length": 14,
        "sha256": "480ef384c97813a299e1f0754e905cd16700b6a933c3dfea61c797027c8227a3",
        "storage": [0x0C29CFCC],
    },
}
INERT_MODE_SIX = {
    "pointer": (0x0C156CDC, 0x0C188642),
    "length": 4,
    "sha256": "551572a9f87a0af199dced20f1d78fc9ddb31537c3a7ce5b747bfedb295ab1e9",
}
MODE_COUNTS = {0: 119, 1: 99, 2: 96, 5: 84, 6: 96}
ARGUMENT_COUNTS = {2: 410, 4: 84}
MODE_FIVE_CALLS = {(5, 0, 1, 0): 6, (5, 6, 1, 0): 78}
MODE_SIX_CALLS = {(6, 4): 24, (6, 7): 72}
RESULT_COUNTS = {0: 31, 1: 25, 2: 24, 5: 0, 6: 0}


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
                    if action.get("operationId") != 0x006E:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if u32(data, TABLE_ENTRY_ADDRESS) != HANDLER_ADDRESS:
        raise ValueError("operation 0x006e dispatch table entry changed")
    if digest(runtime_slice(data, HANDLER_ADDRESS, HANDLER_LENGTH)) != HANDLER_SHA256:
        raise ValueError("operation 0x006e handler changed")
    if u32(data, RESULT_WRITER[0]) != RESULT_WRITER[1]:
        raise ValueError("operation 0x006e result writer changed")
    exchange_routes = {}
    for mode, route in EXCHANGES.items():
        pointer_address, helper_address = route["pointer"]
        if u32(data, pointer_address) != helper_address:
            raise ValueError(f"operation 0x006e mode {mode} helper changed")
        if digest(runtime_slice(data, helper_address, route["length"])) != route["sha256"]:
            raise ValueError(f"operation 0x006e mode {mode} helper body changed")
        exchange_routes[str(mode)] = {
            "helperAddress": f"0x{helper_address:08x}",
            "helperLength": route["length"],
            "helperSha256": route["sha256"],
            "storageAddresses": [f"0x{address:08x}" for address in route["storage"]],
        }
    pointer_address, helper_address = INERT_MODE_SIX["pointer"]
    if u32(data, pointer_address) != helper_address:
        raise ValueError("operation 0x006e mode 6 helper changed")
    if digest(runtime_slice(
        data, helper_address, INERT_MODE_SIX["length"],
    )) != INERT_MODE_SIX["sha256"]:
        raise ValueError("operation 0x006e mode 6 helper body changed")
    return {
        "operationId": 0x006E,
        "operationHex": "0x006e",
        "tableEntryAddress": f"0x{TABLE_ENTRY_ADDRESS:08x}",
        "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
        "handlerLength": HANDLER_LENGTH,
        "handlerSha256": HANDLER_SHA256,
        "resultWriter": f"0x{RESULT_WRITER[1]:08x}",
        "exchangeRoutes": exchange_routes,
        "inertRoutes": {
            "5": {"dispatch": "unmatched-selector-default"},
            "6": {
                "helperAddress": f"0x{helper_address:08x}",
                "helperLength": INERT_MODE_SIX["length"],
                "helperSha256": INERT_MODE_SIX["sha256"],
            },
        },
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    operation = verify_executable(data)
    calls = calls_for(event_ir)
    if len(calls) != 494 or json_digest(calls) != INVENTORY_SHA256:
        raise ValueError("operation 0x006e authored inventory changed")
    mode_counts = Counter(call["arguments"][0].get("value") for call in calls)
    argument_counts = Counter(len(call["arguments"]) for call in calls)
    if mode_counts != MODE_COUNTS or argument_counts != ARGUMENT_COUNTS:
        raise ValueError("operation 0x006e authored ABI counts changed")
    if any(call["resultComparison"] is not None for call in calls):
        raise ValueError("operation 0x006e result comparisons changed")
    for mode in EXCHANGES:
        mode_calls = [call for call in calls if call["arguments"][0].get("value") == mode]
        if any(len(call["arguments"]) != 2 for call in mode_calls):
            raise ValueError(f"operation 0x006e mode {mode} shape changed")
        if any(call["arguments"][0].get("kind") != "constant" for call in mode_calls):
            raise ValueError(f"operation 0x006e mode {mode} selector changed")
        if sum(call["resultTarget"] is not None for call in mode_calls) != RESULT_COUNTS[mode]:
            raise ValueError(f"operation 0x006e mode {mode} result ownership changed")
        for call in mode_calls:
            if call["resultTarget"] is not None and call["arguments"][1].get("value") != 0xBF800000:
                raise ValueError("operation 0x006e stored result sentinel changed")
    tuple_counts = lambda mode: Counter(
        tuple(argument.get("value") for argument in call["arguments"])
        for call in calls
        if call["arguments"][0].get("value") == mode
    )
    if tuple_counts(5) != MODE_FIVE_CALLS:
        raise ValueError("operation 0x006e inert mode 5 routes changed")
    if tuple_counts(6) != MODE_SIX_CALLS:
        raise ValueError("operation 0x006e inert mode 6 routes changed")
    return {
        "schema": "new-yokosuka-native-operation-006e-evidence-v1",
        "status": "exact-fixed-float-exchanges-and-inert-authored-routes",
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
            "modeCounts": {str(key): mode_counts[key] for key in sorted(mode_counts)},
            "argumentCountCounts": {
                str(key): argument_counts[key] for key in sorted(argument_counts)
            },
            "argumentKindCountsByMode": {
                str(mode): {
                    str(index): dict(sorted(Counter(
                        call["arguments"][index]["kind"]
                        for call in calls
                        if call["arguments"][0].get("value") == mode
                    ).items()))
                    for index in range(4 if mode == 5 else 2)
                }
                for mode in sorted(mode_counts)
            },
            "resultTargetCountsByMode": {
                str(mode): RESULT_COUNTS[mode] for mode in sorted(RESULT_COUNTS)
            },
            "canonicalSha256": INVENTORY_SHA256,
        },
        "authoredRouteSignatures": {
            "exchangeModes": [0, 1, 2],
            "mode5": [list(route) for route in sorted(MODE_FIVE_CALLS)],
            "mode6": [list(route) for route in sorted(MODE_SIX_CALLS)],
        },
        "evidenceBoundary": [
            "Modes zero, one, and two exchange one raw float32 word with three fixed native globals and return the previous raw word.",
            "A negative float argument performs an exact read without changing the stored word by exchanging zero and immediately restoring the prior value.",
            "Mode one mirrors every non-query write to a second fixed native global exactly as helper 0x0c188068 does.",
            "Authored selector five is not matched by the native dispatcher and has no observable effect; its two exact four-word signatures are retained as inert routes.",
            "Authored selector six converts its integer argument by 1/100 and calls the exact rts/nop helper at 0x0c188642, so its two exact signatures are inert.",
            "No scene-specific meaning is assigned to any fixed float channel or inert route.",
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
