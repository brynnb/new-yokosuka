#!/usr/bin/env python3
"""Verify operation 0x0166's exact fixed-state and cleanup routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0166-control-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C167AB4,
        900,
        "35e2555cd8d69878dc2601a667ce37dfae6f8e68d9d4bdf60bf964f6883587ae",
    ),
    "modeTwoHelper": (
        0x0C166EEC,
        94,
        "3de5ead4f4f04950a2e8b2319354bf55c84a617123c3700b67dd06eff0731a41",
    ),
    "modeThreeHelper": (
        0x0C166F50,
        98,
        "d7dc577f8dfc39637276038877793c6b444a3184f328f6081e8ef58e0dc6330f",
    ),
    "modeThirteenHelper": (
        0x0C1676A0,
        44,
        "9e8a428af2196d5c8ee9ac8a88333ed989eb1f4c90426e35a25d1585f945744d",
    ),
    "modeEighteenSecondHelper": (
        0x0C166FB2,
        188,
        "ce3becdf5320ca2f6c8b65ab0860c2b539b545b654b1e1fdf4d6bedd903f08f6",
    ),
    "modeFourHelper": (
        0x0C16706E,
        590,
        "8c72743e19010fef1eee3c2784d1975ebbeb20bf220a1076d7b177ecbbdf1290",
    ),
    "modeTwentySevenHelper": (
        0x0C1672BC,
        242,
        "d249360fae9c701705026486e5ddaaf332b78dcf8bb57f622154cfbc24e3954c",
    ),
    "modeFiveHelper": (
        0x0C1673AE,
        146,
        "e805a4900dac74d5e336026b028b48dc168c59a3914a1d0360891711ebd3a9ef",
    ),
    "modeSixHelper": (
        0x0C167440,
        174,
        "bade3e1c69fd1e65d58a32f99da1f2f0c749412680b79f3d48fd65d51086d2cc",
    ),
    "modeSevenHelper": (
        0x0C1674EE,
        78,
        "8c4958c6fdea38500ebb1835a102778f5a9349f467a471151765d28ba3d880d9",
    ),
}
SELECTED_SHAPES = {
    (2, 2): 462,
    (3, 1): 43,
    (4, 3): 266,
    (5, 2): 215,
    (6, 2): 149,
    (7, 2): 128,
    (8, 2): 54,
    (13, 3): 40,
    (18, 1): 108,
    (27, 2): 14,
}
SELECTED_DIALOGUE_MODES = {
    2: 11, 4: 6, 5: 6, 6: 3, 7: 3, 8: 3, 13: 3, 18: 3,
}
LIFECYCLE_RESULT_SHAPES = {
    (4, 3, False, False): 266,
    (5, 2, False, False): 2,
    (5, 2, True, False): 130,
    (5, 2, True, True): 83,
    (6, 2, False, True): 149,
    (7, 2, False, False): 128,
    (27, 2, True, False): 4,
    (27, 2, True, True): 10,
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


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0166
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "mode": constant(arguments[0]) if arguments else None,
                        "argumentCount": len(arguments),
                        "arguments": arguments,
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0166 {name} changed")

    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AF78),
        "integerResultWriter": u32(data, 0x0C167EDC),
        "modeTwoControlDword": u32(data, 0x0C1670DC),
        "modeTwoListRoot": u32(data, 0x0C1670E0),
        "modeTwoRecordRelease": u32(data, 0x0C1670E4),
        "modeTwoCleanupSelector": u32(data, 0x0C1670E8),
        "modeTwoAuxiliaryRoot": u32(data, 0x0C1670EC),
        "modeThreeFirstListRoot": u32(data, 0x0C1670F0),
        "modeThreeRecordRelease": u32(data, 0x0C1670F4),
        "modeThreeSecondListRoot": u32(data, 0x0C1670F8),
        "modeEighteenFirstListRoot": u32(data, 0x0C1670FC),
        "modeEighteenSecondListRoot": u32(data, 0x0C167104),
        "modeThirteenListRoot": u32(data, 0x0C167700),
        "modeEightControlDword": u32(data, 0x0C167CE4),
        "modeEightEnableCallback": u32(data, 0x0C167CE8),
        "actorActiveListRoot": u32(data, 0x0C16723C),
        "actorResourceRoot": u32(data, 0x0C167424),
        "actorResourceBusyDword": u32(data, 0x0C167428),
        "actorResourceReadyQuery": u32(data, 0x0C167540),
        "actorResourceRequestedTag": u32(data, 0x0C16743C),
    }
    expected = {
        "handlerTableEntry": 0x0C167AB4,
        "integerResultWriter": 0x0C0BB342,
        "modeTwoControlDword": 0x0C21BCE8,
        "modeTwoListRoot": 0x0C21BCA4,
        "modeTwoRecordRelease": 0x0C1153E6,
        "modeTwoCleanupSelector": 0x0C21BC7C,
        "modeTwoAuxiliaryRoot": 0x0C21BC94,
        "modeThreeFirstListRoot": 0x0C21BCA8,
        "modeThreeRecordRelease": 0x0C1193DC,
        "modeThreeSecondListRoot": 0x0C21BCA0,
        "modeEighteenFirstListRoot": 0x0C21BC98,
        "modeEighteenSecondListRoot": 0x0C21BC9C,
        "modeThirteenListRoot": 0x0C21BCAC,
        "modeEightControlDword": 0x0C21BCE4,
        "modeEightEnableCallback": 0x0C115434,
        "actorActiveListRoot": 0x0C21BCAC,
        "actorResourceRoot": 0x0C21BC8C,
        "actorResourceBusyDword": 0x0C21BC7C,
        "actorResourceReadyQuery": 0x0C139348,
        "actorResourceRequestedTag": 0x0C224420,
    }
    if dependencies != expected:
        raise ValueError("operation-0x0166 native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    selected = [
        call for call in authored
        if (call["mode"], call["argumentCount"]) in SELECTED_SHAPES
    ]
    shape_counts = Counter(
        (call["mode"], call["argumentCount"]) for call in selected
    )
    dialogue_mode_counts = Counter(
        call["mode"] for call in selected if call["dialogue"]
    )
    lifecycle_result_shapes = Counter(
        (
            call["mode"],
            call["argumentCount"],
            call["resultTarget"] is not None,
            call["resultComparison"] is not None,
        )
        for call in selected
        if call["mode"] in {4, 5, 6, 7, 27}
    )
    fixed_control = [
        call for call in selected
        if call["mode"] in {2, 3, 8, 13, 18}
    ]
    if (
        len(authored) != 3085
        or shape_counts != SELECTED_SHAPES
        or len(selected) != 1479
        or dialogue_mode_counts != SELECTED_DIALOGUE_MODES
        or lifecycle_result_shapes != LIFECYCLE_RESULT_SHAPES
        or Counter(
            call["mode"] for call in fixed_control
            if call["resultComparison"] is not None
        ) != {2: 3}
        or any(call["resultTarget"] is not None for call in fixed_control)
    ):
        raise ValueError("operation-0x0166 authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-0166-control-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0166,
            "operationHex": "0x0166",
            "handlerAddress": "0x0c167ab4",
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
                    "mode": 4,
                    "argumentCount": 3,
                    "behavior": (
                        "Search the exact ordered actor-record roots for argument one, "
                        "write the Boolean activation word from argument two, and move "
                        "matched inactive records to the active root 0x0c21bcac. Return one."
                    ),
                },
                {
                    "mode": 5,
                    "argumentCount": 2,
                    "behavior": (
                        "When the fixed resource root is present and neither busy nor "
                        "blocked, resolve argument one's actor resource indices, issue "
                        "the exact request, retain its tag at 0x0c224420, and return the "
                        "request result; otherwise return zero."
                    ),
                },
                {
                    "mode": 6,
                    "argumentCount": 2,
                    "behavior": (
                        "Return the fixed readiness query. When ready, find the active "
                        "record for the retained actor tag, bind argument one and its "
                        "derived attachment fields, and run the record finalizer."
                    ),
                },
                {
                    "mode": 7,
                    "argumentCount": 2,
                    "behavior": (
                        "Find the active record whose dword +0x8c equals argument one, "
                        "release its attachment, and clear dwords +0x68 and +0x6c; if "
                        "none matches, run the native global resource cleanup. Return one."
                    ),
                },
                {
                    "mode": 2,
                    "argumentCount": 2,
                    "behavior": (
                        "Store Boolean(argument one) at dword 0x0c21bce8. "
                        "On zero, release the exact linked-record structure "
                        "when present. Return one."
                    ),
                },
                {
                    "mode": 3,
                    "argumentCount": 1,
                    "behavior": (
                        "Release the two exact fixed lists rooted at "
                        "0x0c21bca8 and 0x0c21bca0. Return one."
                    ),
                },
                {
                    "mode": 8,
                    "argumentCount": 2,
                    "behavior": (
                        "Store Boolean(argument one) at dword 0x0c21bce4. "
                        "Call 0x0c115434 with one only on a zero-to-one edge. "
                        "Return one."
                    ),
                },
                {
                    "mode": 13,
                    "argumentCount": 3,
                    "behavior": (
                        "Scan the ordered list at 0x0c21bcac, compare its "
                        "nested object fourcc with argument one, and write "
                        "argument two unchanged to the first match's dword "
                        "+0x90. Return one for a match or zero otherwise."
                    ),
                },
                {
                    "mode": 18,
                    "argumentCount": 1,
                    "behavior": (
                        "Run the exact mode-three cleanup, then the additional "
                        "cleanup rooted at 0x0c21bc98 and 0x0c21bc9c. Return one."
                    ),
                },
                {
                    "mode": 27,
                    "argumentCount": 2,
                    "behavior": (
                        "Search the three exact dynamic actor lists for argument one. "
                        "On a match, unlink it, stop and release its attachment, release "
                        "the record, and return its dword +0x8c. When absent, run the "
                        "mode-four activation path with value one and return zero."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(selected),
            "dialogueRegionCallCount": sum(dialogue_mode_counts.values()),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "modeArgumentCountCounts": {
                f"{mode}/{argument_count}": count
                for (mode, argument_count), count in sorted(shape_counts.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_mode_counts.items())
            },
            "resultComparisonCount": sum(
                call["resultComparison"] is not None for call in selected
            ),
            "resultTargetCount": sum(
                call["resultTarget"] is not None for call in selected
            ),
        },
        "evidenceBoundary": [
            "Only the ten exact mode and argument-count shapes listed above receive this semantic.",
            "The gameplay-domain ownership of the linked records and fixed lists remains unknown.",
            "Opaque release and notification calls remain mandatory low-level adapters at their exact native boundaries.",
            "Mode zero and all other operation-0x0166 shapes remain unresolved unless separately proven.",
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
