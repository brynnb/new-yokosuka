#!/usr/bin/env python3
"""Verify exact operation-0x01af byte-state routes used by dialogue code."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/game-state-byte-control-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operationHandler": (
        0x0C16B64E,
        26,
        "225ee6e480bbff1d7cd6af2df859c5b39b511329afc87b4f0b0e946e38007143",
    ),
    "byteStateDispatcher": (
        0x0C151622,
        1464,
        "91863289d3d6f0dd51c17520867534f0c16c517b6b77a4cbd77e59a823b97b88",
    ),
    "registeredCodeAppender": (
        0x0C1514D8,
        64,
        "d4bcf3fcaa85328d31e8300140910606bee2772f840347a018c3eda204ab2743",
    ),
    "pairRecordResolver": (
        0x0C1515A6,
        124,
        "112263b276b204295679dd4d84c2084ad63d32670399268b3b750dbd324e3955",
    ),
}
MODE_ARGUMENT_COUNTS = {
    42: 2,
    44: 1,
    14: 2,
    15: 1,
    55: 4,
    56: 3,
    57: 2,
    58: 1,
    71: 3,
    72: 2,
    73: 2,
    74: 1,
    75: 2,
    76: 1,
}
EXPECTED_MODE_COUNTS = {
    42: 133,
    44: 15,
    14: 3,
    15: 3,
    55: 26,
    56: 26,
    57: 3,
    58: 3,
    71: 33,
    72: 9,
    73: 19,
    74: 19,
    75: 20,
    76: 20,
}
EXPECTED_DIALOGUE_MODE_COUNTS = {
    14: 3,
    15: 3,
    55: 8,
    56: 8,
    71: 1,
    72: 1,
    73: 1,
    74: 1,
    75: 1,
    76: 1,
}
EXPECTED_JUMP_TARGETS = {
    42: 0x0C1518B8,
    44: 0x0C151966,
    14: 0x0C151788,
    15: 0x0C151798,
    55: 0x0C151A32,
    56: 0x0C151A46,
    57: 0x0C151A54,
    58: 0x0C151A64,
    71: 0x0C151B58,
    72: 0x0C151B80,
    73: 0x0C151B8A,
    74: 0x0C151BA0,
    75: 0x0C151BA6,
    76: 0x0C151BBC,
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", runtime_slice(data, address, 2))[0]


def s16(data: bytes, address: int) -> int:
    return struct.unpack("<h", runtime_slice(data, address, 2))[0]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x01AF
                        or not arguments
                        or arguments[0].get("value")
                        not in MODE_ARGUMENT_COUNTS
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": arguments,
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"game-state byte-control {name} changed")

    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29B09C),
        "dispatcher": u32(data, 0x0C16B6C4),
        "resultWriter": u32(data, 0x0C16B6AC),
        "stateBase": u32(data, 0x0C151660),
    }
    if dependencies != {
        "handlerTableEntry": 0x0C16B64E,
        "dispatcher": 0x0C151622,
        "resultWriter": 0x0C0BB342,
        "stateBase": 0x0C220A54,
    }:
        raise ValueError("game-state byte-control dependencies changed")

    targets = {
        mode: 0x0C15165C + s16(data, 0x0C15166C + mode * 2)
        for mode in EXPECTED_JUMP_TARGETS
    }
    if targets != EXPECTED_JUMP_TARGETS:
        raise ValueError("game-state byte-control jump targets changed")
    literals = {
        "incrementedByteOffset": u16(data, 0x0C151984),
        "registeredCodeCapacity": u16(data, 0x0C1515AE),
        "registeredCodeCountAddress": u32(data, 0x0C1515B8),
        "registeredCodeArrayAddress": u32(data, 0x0C1515BC),
        "signedWord44Offset": u16(data, 0x0C15196A),
        "pairTableOffset": u16(data, 0x0C151A72),
        "fixedByte57Offset": 0x0004,
        "indexedByteOffset": u16(data, 0x0C151B7A),
        "fixedByte73Offset": u16(data, 0x0C151C7A),
        "fixedByte75Offset": u16(data, 0x0C151C7C),
    }
    if literals != {
        "incrementedByteOffset": 0x09EC,
        "registeredCodeCapacity": 0x0200,
        "registeredCodeCountAddress": 0x0C22220C,
        "registeredCodeArrayAddress": 0x0C221E0C,
        "signedWord44Offset": 0x02C0,
        "pairTableOffset": 0x0184,
        "fixedByte57Offset": 0x0004,
        "indexedByteOffset": 0x0E78,
        "fixedByte73Offset": 0x0E99,
        "fixedByte75Offset": 0x0E98,
    }:
        raise ValueError("game-state byte-control offsets changed")
    return {
        "dependencies": {
            name: f"0x{address:08x}"
            for name, address in dependencies.items()
        },
        "jumpTargets": {
            str(mode): f"0x{target:08x}"
            for mode, target in sorted(targets.items())
        },
        "offsets": {
            name: f"0x{value:04x}"
            for name, value in literals.items()
        },
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    dialogue = [call for call in authored if call["dialogue"]]
    modes = Counter(call["arguments"][0]["value"] for call in authored)
    dialogue_modes = Counter(
        call["arguments"][0]["value"] for call in dialogue
    )
    argument_kind_counts = {}
    for mode in sorted(MODE_ARGUMENT_COUNTS):
        calls = [
            call for call in authored
            if call["arguments"][0]["value"] == mode
        ]
        argument_kind_counts[str(mode)] = {
            str(index): dict(sorted(Counter(
                call["arguments"][index]["kind"] for call in calls
            ).items()))
            for index in range(MODE_ARGUMENT_COUNTS[mode])
        }
    if (
        len(authored) != 332
        or len(dialogue) != 28
        or modes != EXPECTED_MODE_COUNTS
        or dialogue_modes != EXPECTED_DIALOGUE_MODE_COUNTS
        or any(
            len(call["arguments"])
            != MODE_ARGUMENT_COUNTS[call["arguments"][0]["value"]]
            for call in authored
        )
        or Counter(
            call["arguments"][0]["value"]
            for call in authored
            if call["resultComparison"] is not None
        ) != {44: 15, 56: 18, 58: 3, 72: 3}
        or sum(call["resultTarget"] is not None for call in authored) != 32
        or len({
            (call["disc"], call["area"]) for call in authored
        }) != 105
    ):
        raise ValueError("game-state byte-control authored inventory changed")

    return {
        "schema": "new-yokosuka-game-state-byte-control-evidence-v1",
        "status": "exact-byte-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x01AF,
            "operationHex": "0x01af",
            "handlerAddress": "0x0c16b64e",
            "dispatcherAddress": "0x0c151622",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "routes": [
                {
                    "incrementMode": 42,
                    "kind": "saturating-indexed-byte-increment",
                    "baseAddress": "0x0c221440",
                    "maximum": 255,
                    "specialCodeRegistrations": {
                        "15": [0x02BE, 0x02BF, 0x02C0],
                        "19": [0x02BE, 0x02BF, 0x02C0],
                        "79": [0x00FB],
                        "90": [0x00CB, 0x011C],
                        "92": [0x00D0, 0x00D3],
                        "99": [0x02C0, 0x007D, 0x00FD],
                        "100": [0x02BD, 0x02C1, 0x0322, 0x0323, 0x0076],
                    },
                    "registeredCodeArrayAddress": "0x0c221e0c",
                    "registeredCodeCountAddress": "0x0c22220c",
                    "registeredCodeCapacity": 512,
                },
                {
                    "readMode": 44,
                    "kind": "signed-word",
                    "address": "0x0c220d14",
                },
                {
                    "writeMode": 14,
                    "readMode": 15,
                    "kind": "fixed-byte",
                    "address": "0x0c220a5b",
                },
                {
                    "writeMode": 55,
                    "readMode": 56,
                    "kind": "opaque-two-key-byte-table",
                    "stateBaseOffset": "0x0184",
                },
                {
                    "writeMode": 57,
                    "readMode": 58,
                    "kind": "fixed-byte",
                    "address": "0x0c220a58",
                },
                {
                    "writeMode": 71,
                    "readMode": 72,
                    "kind": "indexed-byte",
                    "baseAddress": "0x0c2218cc",
                },
                {
                    "writeMode": 73,
                    "readMode": 74,
                    "kind": "fixed-byte",
                    "address": "0x0c2218ed",
                },
                {
                    "writeMode": 75,
                    "readMode": 76,
                    "kind": "fixed-byte",
                    "address": "0x0c2218ec",
                },
            ],
            "writeValueRule": (
                "Clamp signed values greater than 255 to 255, otherwise "
                "store the low byte."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(authored),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": 105,
            "modeCounts": {
                str(mode): count for mode, count in sorted(modes.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
            "argumentKindCountsByMode": argument_kind_counts,
            "resultComparisonCountsByMode": {
                "44": 15,
                "56": 18,
                "58": 3,
                "72": 3,
            },
            "resultTargetCount": 32,
        },
        "evidenceBoundary": [
            "Only the fourteen exact authored selectors and their exact argument counts receive this semantic.",
            "Selector 42's saturating increment, indexed address, and seven special code-registration lists are executable-proven.",
            "Fixed addresses, widths, indexed address arithmetic, byte clamping, and read results are executable-proven.",
            "The selector-55/56 pair-record allocator remains a mandatory neutral adapter.",
            "The fields' gameplay names and persistence owner remain unknown.",
            "No other operation-0x01af selector is promoted by this evidence.",
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
