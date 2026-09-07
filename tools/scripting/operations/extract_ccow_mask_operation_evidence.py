#!/usr/bin/env python3
"""Verify exact CCOW-record mask controls in operations 0x0046 and 0x005d."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/ccow-mask-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1587DC,
        164,
        "06e25cc0362335db802f2e9431b4dd59c24f2bcdc38e3097f9b2e3b98ee65929",
    ),
    "setMask": (
        0x0C0A39E0,
        40,
        "6d43b8d3719dc08a4d878f4d558d1a1ad22c5944bcc591b9a7942e7528d77021",
    ),
    "clearMask": (
        0x0C0A3A08,
        42,
        "83497260eb3c8666981dde59e00d8c0f76deb3c653328f0f306b430be21b3214",
    ),
    "queryMask": (
        0x0C0A3A4C,
        46,
        "285f344a45a47e53e8e9d65a0fdb20959abe1fd1792e41dc2e756f2af44d8bc3",
    ),
    "fixedBitHandler": (
        0x0C158880,
        62,
        "f9777ca16062ba2948045c51f01f9f2cd3467e69b8d653ae8ecbb50e33c31d99",
    ),
}
MODES = {
    1: ("set", 0x00000007),
    2: ("clear", 0x00000007),
    3: ("set", 0x00000002),
    4: ("clear", 0x00000002),
    5: ("set", 0x00000004),
    6: ("clear", 0x00000004),
    7: ("query", 0x00000004),
    8: ("query", 0x00000002),
    9: ("set", 0x00002000),
    10: ("clear", 0x00002000),
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


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int = 0x0046,
) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
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


def constant_argument(call: dict[str, Any], index: int) -> int | None:
    arguments = call["arguments"]
    if index >= len(arguments) or arguments[index].get("kind") != "constant":
        return None
    return arguments[index].get("value")


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0046 {name} changed")
    literals = {
        "objectResolver": u32(executable, 0x0C158810),
        "clearMask": u32(executable, 0x0C158814),
        "setMask": u32(executable, 0x0C158818),
        "queryMask": u32(executable, 0x0C158940),
        "resultWriter": u32(executable, 0x0C158944),
        "recordTag": u32(executable, 0x0C0A3A44),
        "recordLookup": u32(executable, 0x0C0A3A48),
        "fixedBitObjectResolver": u32(executable, 0x0C158948),
        "fixedBitSetMask": u32(executable, 0x0C15894C),
        "fixedBitClearMask": u32(executable, 0x0C158950),
    }
    if literals != {
        "objectResolver": 0x0C153956,
        "clearMask": 0x0C0A3A08,
        "setMask": 0x0C0A39E0,
        "queryMask": 0x0C0A3A4C,
        "resultWriter": 0x0C0BB358,
        "recordTag": 0x574F4343,
        "recordLookup": 0x0C0AAD5A,
        "fixedBitObjectResolver": 0x0C153956,
        "fixedBitSetMask": 0x0C0A39E0,
        "fixedBitClearMask": 0x0C0A3A08,
    }:
        raise ValueError("operation-0x0046 dependencies changed")
    return {
        name: (
            "CCOW" if name == "recordTag" else f"0x{value:08x}"
        )
        for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [
        call for call in calls
        if (
            len(call["arguments"]) == 2
            and constant_argument(call, 1) in MODES
        )
    ]
    if len(calls) != 1182 or len(selected) != 1182:
        raise ValueError("operation-0x0046 authored inventory changed")
    mode_counts = Counter(constant_argument(call, 1) for call in selected)
    expected_counts = {
        1: 386,
        2: 603,
        3: 58,
        4: 39,
        5: 17,
        6: 48,
        7: 4,
        8: 1,
        9: 13,
        10: 13,
    }
    if mode_counts != expected_counts:
        raise ValueError("operation-0x0046 mode inventory changed")
    dialogue_mode_counts = Counter(
        constant_argument(call, 1)
        for call in selected
        if call["dialogueRegion"]
    )
    if dialogue_mode_counts != {1: 51, 2: 78, 3: 3, 4: 6, 6: 4}:
        raise ValueError("operation-0x0046 dialogue inventory changed")
    fixed_bit_calls = operation_calls(event_ir, 0x005D)
    fixed_bit_selected = [
        call for call in fixed_bit_calls
        if (
            len(call["arguments"]) == 2
            and constant_argument(call, 1) in {0, 1, 2}
        )
    ]
    fixed_bit_mode_counts = Counter(
        constant_argument(call, 1) for call in fixed_bit_selected
    )
    fixed_bit_dialogue_mode_counts = Counter(
        constant_argument(call, 1)
        for call in fixed_bit_selected
        if call["dialogueRegion"]
    )
    if (
        len(fixed_bit_calls) != 311
        or len(fixed_bit_selected) != 311
        or fixed_bit_mode_counts != {0: 8, 1: 189, 2: 114}
        or fixed_bit_dialogue_mode_counts != {1: 4, 2: 5}
    ):
        raise ValueError("operation-0x005d authored inventory changed")
    return {
        "schema": "new-yokosuka-ccow-mask-operation-evidence-v2",
        "status": "exact-native-record-mask-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0046,
            "operationHex": "0x0046",
            "handlerAddress": "0x0c1587dc",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "recordTag": "CCOW",
            "flagsWordOffset": "record+0x08",
            "mutationStateByteOffset": "record+0x05",
            "mutationStateByteValue": 0,
            "modes": [
                {
                    "mode": mode,
                    "action": action,
                    "mask": f"0x{mask:08x}",
                }
                for mode, (action, mask) in MODES.items()
            ],
            "provenBehavior": (
                "Resolves argument zero, obtains its associated CCOW record, "
                "and sets, clears, or queries exact masks in the record's "
                "32-bit flags word at +0x08. Set and clear paths also write "
                "zero to record byte +0x05. Every path returns zero except a "
                "successful query, which returns one."
            ),
        },
        "fixedBitOperation": {
            "operationId": 0x005D,
            "operationHex": "0x005d",
            "handlerAddress": "0x0c158880",
            "handlerLength": RANGES["fixedBitHandler"][1],
            "handlerSha256": RANGES["fixedBitHandler"][2],
            "recordTag": "CCOW",
            "flagsWordOffset": "record+0x08",
            "mutationStateByteOffset": "record+0x05",
            "mutationStateByteValue": 0,
            "modes": [
                {"mode": 0, "action": "no-op", "mask": None},
                {"mode": 1, "action": "set", "mask": "0x00000080"},
                {"mode": 2, "action": "clear", "mask": "0x00000080"},
            ],
            "provenBehavior": (
                "Resolves argument zero. Mode zero returns without a CCOW "
                "lookup. Modes one and two obtain the exact CCOW associated "
                "record, clear byte +0x05, and respectively set or clear bit "
                "0x00000080 in the flags word at +0x08. Missing objects or "
                "records are native no-ops."
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
            "modeCounts": {
                str(mode): count for mode, count in sorted(mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_mode_counts.items())
            },
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"] for call in selected
            ).items())),
        },
        "fixedBitAllDiscInventory": {
            "callCount": len(fixed_bit_selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in fixed_bit_selected
            ),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in fixed_bit_selected
            }),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(fixed_bit_mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count
                in sorted(fixed_bit_dialogue_mode_counts.items())
            },
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"]
                for call in fixed_bit_selected
            ).items())),
        },
        "evidenceBoundary": [
            "CCOW is retained only as the executable's exact associated-record tag.",
            "All 1,182 authored calls use one of the ten exact native modes.",
            "The individual flags' gameplay meanings remain numeric and unnamed.",
            "A missing object or CCOW record is a native no-op and query false, not an inferred error.",
            "Operation 0x005d's fixed bit remains numeric and unnamed; no gameplay role is inferred.",
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
        f"{report['allDiscInventory']['callCount']} calls"
    )


if __name__ == "__main__":
    main()
