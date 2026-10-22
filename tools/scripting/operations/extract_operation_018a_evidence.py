#!/usr/bin/env python3
"""Verify room AMB1 ownership and authored 0x018a/0x018b controller routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-018a-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C16B150, 142, "bfe92ddb52fa8b2cde4fc6acbb2eac6f63820b084f360e21fb7ef6538f3a2c76"),
    "slotController": (0x0C17B862, 72, "12623ad42c5ab832556087aa3e2885837afeed66387ea236209dfad1b0635406"),
    "primaryInitialize": (0x0C17B8BC, 186, "9e94a0e6cc11a831590d0d9534b24e8c5b83d0a6828aecc8efce9f842b5ea123"),
    "secondaryInitialize": (0x0C17BA50, 44, "f7e664cff9d25d658d130c183cddfb3e311c28081e17947e868c31d24c738816"),
    "roomPoolInitialize": (0x0C17B4FC, 42, "c703886b24d14edee12a64b4d5e208517d0f4c98661f416eb4995086d22ac6fe"),
    "poolZeroFill": (0x0C1DC970, 24, "5ad3e0d54fc4dd851554f442557da8a4e985f67c4f753bca372b415771537b61"),
    "ambientSystemPoolCall": (0x0C17B174, 8, "a41908db39686aea0de258410972400b03f104e3208f06d4b1c83dd5a190b46a"),
    "roomLoaderAmbientCall": (0x0C0F0702, 6, "03b28b518481d3b1016b0d1c487d4b36505ce21a7f250dd8c6711cb7f838e41f"),
    "commandDispatch": (0x0C17A91C, 212, "1ac3cdcc487ca9bb3ed1bd10e967b90f2be4ca2792258dbe74ac05ff6cbc5d7f"),
    "recordWriteHandler": (0x0C16B1DE, 42, "250d5d0d94078c7f4a4cca69cc91bcd2f9493cf72a27fcdbe256ef5eab9d4172"),
    "recordWriter": (0x0C17B976, 42, "f3f62463d618b53120485ce3d28ce63f0a55522378639ffd50e85f9de9f6c632"),
}
LITERALS = {
    0x0C16B224: 0x0C17A91C,
    0x0C16B234: 0x0C17B862,
    0x0C16B238: 0x0C17A920,
    0x0C16B23C: 0x0C17B8BC,
    0x0C16B240: 0x0C17BA50,
    0x0C16B244: 0x0C17B976,
    0x0C0F07E4: 0x0C17B15A,
    0x0C17B538: 0x31424D41,
    0x0C17B53C: 0x0C08CA10,
    0x0C17B540: 0x0C224B44,
    0x0C17B544: 0x0C1DC970,
    0x0C17BA10: 0x0C224B48,
    0x0C17BA14: 0x0C224B44,
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def verify_executable(data: bytes) -> None:
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if hashlib.sha256(runtime_slice(data, address, size)).hexdigest() != expected:
            raise ValueError(f"operation-0x018a {name} changed")
    for address, expected in LITERALS.items():
        if struct.unpack("<I", runtime_slice(data, address, 4))[0] != expected:
            raise ValueError(f"operation-0x018a literal 0x{address:08x} changed")


def calls(event_ir: dict[str, Any], operation_id: int) -> list[dict[str, Any]]:
    return [
        {"disc": item["disc"], "area": item["area"], "arguments": action["arguments"]}
        for item in event_ir["maps"]
        for function in item["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("kind") == "engineOperation" and action.get("operationId") == operation_id
    ]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(executable)
    authored = calls(event_ir, 0x018A)
    modes = Counter(call["arguments"][0].get("value") for call in authored)
    if len(authored) != 111 or modes != Counter({0: 56, 1: 28, 2: 24, 3: 3}):
        raise ValueError("operation-0x018a authored inventory changed")
    if any(len(call["arguments"]) != 2 for call in authored):
        raise ValueError("operation-0x018a argument count changed")
    if any(
        call["arguments"][1].get("value") != (0x5DA8 if mode == 0 else 0x5EA8)
        for call in authored
        for mode in [call["arguments"][0].get("value")]
        if mode in (0, 1)
    ):
        raise ValueError("operation-0x018a command selector changed")
    if any(
        call["arguments"][1].get("kind") not in ("constant", "frame-field")
        for call in authored
        if call["arguments"][0].get("value") in (2, 3)
    ):
        raise ValueError("operation-0x018a slot operand changed")
    writers = calls(event_ir, 0x018B)
    if not writers or any(len(call["arguments"]) != 8 for call in writers):
        raise ValueError("operation-0x018b argument count changed")
    for call in writers:
        args = call["arguments"]
        if any(arg.get("kind") != ("static-pointer" if i in (2, 7) else "constant")
               for i, arg in enumerate(args)):
            raise ValueError("operation-0x018b authored operand provenance changed")
        if not 1 <= args[0]["value"] <= 16:
            raise ValueError("operation-0x018b authored slot exceeds the AMB1 pool")
    allocation_size = struct.unpack("<H", runtime_slice(executable, 0x0C17B52A, 2))[0]
    if allocation_size != 16 * 44:
        raise ValueError("AMB1 allocation does not match sixteen 44-byte records")
    return {
        "schema": "new-yokosuka-operation-018a-evidence-v2",
        "status": "exact-native-all-authored-routes",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x018A,
            "operationHex": "0x018a",
            "handlerAddress": "0x0c16b150",
            "routes": {
                "0": "Sends command (0x09a0,1,25), then (0x5da8,0,0); activates the existing AMB1 pool, registers controller one and sends (0x28a0,1,slot) for slots one through sixteen. Clears only words +32/+36/+40; preserves +0 through +28.",
                "1": "Sends command (0x09a0,1,50), then (0x5ea8,0,0); registers controller three for slots three through one and sets its initialized marker. These are command operands, not allocation sizes or unit counts.",
                "2": "Resets one primary slot to words 0, 0, 127, and -1 and re-registers controller one; selectors above sixteen execute the helper for all sixteen slots in descending order.",
                "3": "Writes one to the selected primary slot's record word only when its resource word at offset +8 is non-null.",
            },
        },
        "roomPool": {
            "initializer": "0x0c17b4fc", "allocationTag": "AMB1",
            "allocationBytes": allocation_size, "slotCount": 16, "slotBytes": 44,
            "ownerPointer": "0x0c224b44", "activePointer": "0x0c224b48",
            "initialization": "The room loader calls 0xc17b15a, which calls the pool initializer before room scripts. It clears the active pointer, allocates AMB1, stores the pool owner, then zero-fills all 704 bytes.",
        },
        "recordWrite": {
            "operationId": 0x018B, "operationHex": "0x018b", "argumentCount": 8,
            "handlerAddress": "0x0c16b1de", "helperAddress": "0x0c17b976",
            "recordAddress": "owner + (argument0 - 1) * 44",
            "writes": [
                {"offset": 0, "width": 4, "constant": 1},
                *[{"offset": offset, "width": 4, "argument": i, "representation": representation}
                  for i, offset, representation in [(1, 4, "word"), (2, 8, "pointer"),
                                                     (3, 12, "float32-bits"), (4, 16, "float32-bits"),
                                                     (5, 20, "float32-bits"), (6, 24, "word"),
                                                     (7, 28, "pointer")]],
            ],
            "preservesOffsets": [32, 36, 40],
            "inventory": {
                "callCount": len(writers),
                "mapCount": len({(c["disc"], c["area"]) for c in writers}),
                "argumentKinds": {str(i): dict(sorted(Counter(c["arguments"][i]["kind"] for c in writers).items()))
                                  for i in range(8)},
                "slotCounts": dict(sorted(Counter(str(c["arguments"][0]["value"]) for c in writers).items(), key=lambda kv: int(kv[0]))),
            },
        },
        "verifiedRanges": {name: {"address": hex(a), "length": n, "sha256": h}
                           for name, (a, n, h) in RANGES.items()},
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "areaCount": len({(call["disc"], call["area"]) for call in authored}),
            "modeCounts": {str(mode): count for mode, count in sorted(modes.items())},
        },
        "evidenceBoundary": [
            "Allocation belongs to room initialization, not 0x018a. The earlier report incorrectly labeled opaque command words and arguments as allocation sizes and unit counts.",
            "The two map-relative pointers retain their provenance; no guessed process pointer is fabricated.",
            "This contract covers record ownership, writes, activation and controller requests, not the per-frame native ambient-audio evaluator or browser audio playback.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
