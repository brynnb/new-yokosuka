#!/usr/bin/env python3
"""Verify operation 0x01c7's exact fixed-state control routes."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-01c7-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C16A1DC,
        234,
        "a33120557018df140979eba731212c05e1362d6b81609036ef6a4cbfcd3fcca1",
    ),
    "recordApply": (
        0x0C14A9BE,
        106,
        "27edcd5f911a1be45b779a0ef4da678ba9034ad476f56dba214cde1b81808b3b",
    ),
    "statusQuery": (
        0x0C14AAD6,
        16,
        "68a6a881c250527c13a9ba2927efb9118b89652293a060eaa51fa9b76358dfdf",
    ),
    "byteWrite": (
        0x0C14AAE8,
        6,
        "e8c6f1b1e2695dbfb6296e4a73b896a7e88c892cc175d62c337652a696654e05",
    ),
    "byteRead": (
        0x0C14AAEE,
        8,
        "88921667975fb5a15cb7d2d889c8dc95ca19f7107ee3340cab6c2e39f61678d5",
    ),
    "floatRead": (
        0x0C14AAF6,
        30,
        "a1c26ea2acde41b2c0a51c46aa3e4d12c6fc081080c2b6594808a07ce549cfa0",
    ),
    "floatWrite": (
        0x0C14AB14,
        30,
        "fe471e65a25e9db12eda2d4973c03db8df5688f73d381d33ef5d130841f83f29",
    ),
    "booleanWrite": (
        0x0C14AB38,
        6,
        "1eec1721c820200d84d308c51cdc4d4ff207e67a1fa92a2bf72ed57fed8585eb",
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
                        or action.get("operationId") != 0x01C7
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def constant(call: dict[str, Any], index: int) -> int | None:
    argument = call["arguments"][index]
    return (
        argument["value"]
        if argument.get("kind") == "constant"
        else None
    )


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"]
            for call in calls
            if len(call["arguments"]) > index
        ).items()))
        for index in range(4)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x01c7 {name} changed")
    literals = {
        "integerResultWriter": u32(executable, 0x0C16A2C8),
        "statusQuery": u32(executable, 0x0C16A2CC),
        "recordApply": u32(executable, 0x0C16A2D0),
        "booleanWrite": u32(executable, 0x0C16A2D4),
        "byteRead": u32(executable, 0x0C16A2D8),
        "byteWrite": u32(executable, 0x0C16A2DC),
        "floatRead": u32(executable, 0x0C16A2E0),
        "floatResultWriter": u32(executable, 0x0C16A2E4),
        "floatWrite": u32(executable, 0x0C16A2E8),
        "parameterBuffer": u32(executable, 0x0C14AB64),
        "copyFourBytes": u32(executable, 0x0C14AB68),
        "recordApplySource": u32(executable, 0x0C14AB6C),
        "statusByte": u32(executable, 0x0C14AB90),
        "booleanDword": u32(executable, 0x0C14AB94),
    }
    if literals != {
        "integerResultWriter": 0x0C0BB342,
        "statusQuery": 0x0C14AAD6,
        "recordApply": 0x0C14A9BE,
        "booleanWrite": 0x0C14AB38,
        "byteRead": 0x0C14AAEE,
        "byteWrite": 0x0C14AAE8,
        "floatRead": 0x0C14AAF6,
        "floatResultWriter": 0x0C0BB348,
        "floatWrite": 0x0C14AB14,
        "parameterBuffer": 0x0C2203A3,
        "copyFourBytes": 0x0C1DC8D8,
        "recordApplySource": 0x0C220370,
        "statusByte": 0x0C2203A1,
        "booleanDword": 0x0C2203C4,
    }:
        raise ValueError("operation-0x01c7 dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def route_key(call: dict[str, Any]) -> tuple[int | None, int | None, int]:
    mode = constant(call, 0)
    submode = constant(call, 1) if mode == 3 else None
    return mode, submode, len(call["arguments"])


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    routes = Counter(route_key(call) for call in calls)
    expected_routes = {
        (0, None, 1): 55,
        (1, None, 1): 55,
        (2, None, 2): 263,
        (3, 0, 3): 120,
        (3, 1, 4): 195,
        (3, 2, 3): 1,
        (3, 3, 4): 1,
    }
    if (
        len(calls) != 690
        or len(dialogue_calls) != 62
        or routes != expected_routes
        or argument_kinds(calls) != {
            "0": {"constant": 690},
            "1": {"constant": 580},
            "2": {"constant": 317},
            "3": {
                "constant": 103,
                "frame-field": 8,
                "runtime": 77,
                "scene-field": 8,
            },
        }
    ):
        raise ValueError("operation-0x01c7 authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-01c7-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x01C7,
            "operationHex": "0x01c7",
            "handlerAddress": "0x0c16a1dc",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": contract,
            "routes": [
                {
                    "mode": 0,
                    "argumentCount": 1,
                    "behavior": (
                        "Return -1 when byte 0x0c2203a1 is nonzero; "
                        "otherwise return zero."
                    ),
                },
                {
                    "mode": 1,
                    "argumentCount": 1,
                    "behavior": (
                        "Delegate to the exact record-apply helper using "
                        "fixed record 0x0c220370."
                    ),
                },
                {
                    "mode": 2,
                    "argumentCount": 2,
                    "behavior": (
                        "Write argument one normalized to zero or one into "
                        "dword 0x0c2203c4."
                    ),
                },
                {
                    "mode": 3,
                    "submodes": {
                        "0": "Read an unsigned byte from 0x0c2203a3 + argument two.",
                        "1": (
                            "Return that byte, then write argument three's "
                            "low byte to the same address."
                        ),
                        "2": "Read a float32 from 0x0c2203a3 + argument two.",
                        "3": (
                            "Return that float32, then write argument three "
                            "as float32 to the same address."
                        ),
                    },
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
            "argumentKindCounts": argument_kinds(calls),
            "routeCounts": {
                (
                    f"mode-{mode}"
                    if submode is None
                    else f"mode-{mode}-submode-{submode}"
                ): count
                for (mode, submode, _argc), count in sorted(routes.items())
            },
        },
        "evidenceBoundary": [
            "The operation retains its numeric identity; no gameplay-domain label is inferred.",
            "The mode-one record-apply helper remains a mandatory external adapter.",
            "The fixed globals are not assigned to scene persistence without ownership evidence.",
            "Only the seven exact authored mode, submode, and argument-count shapes are promoted.",
            "Runtime operands remain interpreter stops when no exact resolver is supplied.",
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
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
