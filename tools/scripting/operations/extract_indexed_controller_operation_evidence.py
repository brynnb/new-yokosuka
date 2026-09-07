#!/usr/bin/env python3
"""Verify exact operation 0x0066 controller selectors 0, 2, 4-6, 8, 10, 11."""

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
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/indexed-controller-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1644DC,
        206,
        "42141c546b1359e4430c5712b6a4c934865b50f49b0aca5341f6ce3923aef87b",
    ),
    "controlBitQuery": (
        0x0C0EB0A6,
        36,
        "cace4558e808ac2d85e1ab9f759d8c6820948e7fc64b91df039a9cfefdf5d310",
    ),
    "fieldZeroWriter": (
        0x0C0EB0DC,
        70,
        "4dc8a75ba9bac80c3b8c08c4408ca5b116ce0f7fd40357eb90ab3bb742186ef3",
    ),
    "floatWords08Writer": (
        0x0C0EB1D0,
        194,
        "518835ed7d71c8abc7a40938f0edfdf284a811c63c7889f8c7270c13360fec8c",
    ),
    "floatWord18Writer": (
        0x0C0EB398,
        122,
        "5cf55825b05613eb189538507f2fd454410ee36a1f2a46bb79d7eaacc0a0285b",
    ),
    "floatWord1cWriter": (
        0x0C0EB4A8,
        86,
        "b2b704c6da90d7de03ba628bceef87b722d6f2f4e0c31029b74f332791dac91c",
    ),
    "floatWord20SharedWriter": (
        0x0C0EB542,
        100,
        "ac95761ac581f73b01f24034f9b3f450205251c20912514e7791fe066f143f81",
    ),
    "floatWord20PointerWrapper": (
        0x0C0EB5A6,
        12,
        "0f17d285f931447a845b088c59ab6f553ca6d4a84808d6e6de67f8b050172b6b",
    ),
    "vector52Writer": (
        0x0C0EB714,
        120,
        "41a740bbd7f43b86794edf44886ef462d1f9c220dea28266b72da5b723a31e47",
    ),
    "fieldTenWriter": (
        0x0C0EB848,
        58,
        "5e07316bb054b0e9b0df0c6259eac3dbc7f31abcf5ce5256e18029c2407d276c",
    ),
    "fieldElevenWriter": (
        0x0C0EB048,
        94,
        "08fe7410ee645f5390595f7016d4e2f814c5d7a1b068a8ec2b934561f836f260",
    ),
}
SELECTORS = {0, 2, 4, 5, 6, 8, 10, 11}


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
                        or action.get("operationId") != 0x0066
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(3)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0066 {name} changed")
    dispatch = {
        str(selector): u32(executable, 0x0C1647D4 + selector * 4)
        for selector in range(12)
    }
    expected = [
        0x0C0EB0DC, 0x0C0EB1C8, 0x0C0EB1D0, 0x0C0EB390,
        0x0C0EB398, 0x0C0EB4A8, 0x0C0EB5A6, 0x0C0EB63A,
        0x0C0EB714, 0x0C0EB832, 0x0C0EB848, 0x0C0EB048,
    ]
    if list(dispatch.values()) != expected:
        raise ValueError("operation-0x0066 dispatch table changed")
    return {selector: f"0x{address:08x}" for selector, address in dispatch.items()}


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    dispatch = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [
        call for call in calls
        if len(call["arguments"]) == 3
        and call["arguments"][1].get("kind") == "constant"
        and (
            call["arguments"][1].get("value") in {0, 10, 11}
            or (
                call["arguments"][1].get("value") in {2, 6, 8}
                and call["arguments"][0].get("kind")
                in {"constant", "frame-field"}
                and call["arguments"][2].get("kind")
                in {"frame-address", "static-pointer"}
            )
            or (
                call["arguments"][1].get("value") in {4, 5}
                and call["arguments"][0].get("kind")
                in {"constant", "frame-field"}
                and call["arguments"][2].get("kind")
                in {"constant", "frame-field"}
            )
        )
    ]
    dialogue = [call for call in selected if call["dialogueRegion"]]
    selector_counts = Counter(
        call["arguments"][1]["value"] for call in selected
    )
    dialogue_selector_counts = Counter(
        call["arguments"][1]["value"] for call in dialogue
    )
    field_zero_values = Counter(
        call["arguments"][2].get("value")
        for call in selected
        if call["arguments"][1]["value"] == 0
    )
    field_eleven_values = Counter(
        call["arguments"][2].get("value")
        for call in selected
        if call["arguments"][1]["value"] == 11
    )
    if (
        len(calls) != 887
        or len(selected) != 840
        or len(dialogue) != 57
        or selector_counts != {
            0: 59, 2: 153, 4: 179, 5: 135, 6: 180, 8: 18,
            10: 81, 11: 35,
        }
        or dialogue_selector_counts != {
            0: 2, 2: 11, 4: 11, 5: 11, 6: 11, 10: 11,
        }
        or field_zero_values != {2: 13, 3: 5, 4: 41}
        or field_eleven_values != {0: 12, 1: 23}
        or argument_kinds(selected) != {
            "0": {"constant": 772, "frame-field": 68},
            "1": {"constant": 840},
            "2": {
                "constant": 469,
                "frame-address": 157,
                "frame-field": 20,
                "static-pointer": 194,
            },
        }
        or argument_kinds(dialogue) != {
            "0": {"constant": 57},
            "1": {"constant": 57},
            "2": {"constant": 35, "static-pointer": 22},
        }
    ):
        raise ValueError("operation-0x0066 authored inventory changed")
    return {
        "schema": "new-yokosuka-indexed-controller-operation-evidence-v4",
        "status": "exact-eight-selector-native-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0066,
            "operationHex": "0x0066",
            "argumentCount": 3,
            "handlerAddress": "0x0c1644dc",
            "provenSelectors": sorted(SELECTORS),
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "dispatchTable": dispatch,
            "recordStride": 68,
            "primaryIndexLimit": 128,
            "mirrorIndexLimit": 32,
            "provenBehavior": (
                "Selector zero accepts authored values two through four, "
                "writes record dword +0x04 while preserving its prior bit 3, "
                "and mirrors/callbacks low indices. Selector two copies four "
                "float words to +0x08 through +0x14 and normalizes components "
                "one through three below native word 0x3727c5ac to zero. "
                "Selector four writes +0x18 raw while its callback normalizes "
                "absolute values below word 0x38d1b717 to zero. Selectors five "
                "and six clamp +0x1c and +0x20 respectively to minimum word "
                "0x3c23d70b and callback with their float32 product. "
                "Selector eight copies three exact float words to +0x34 "
                "through +0x3c and, below index 32, mirrors them and invokes "
                "the native presentation callback with all signs inverted. "
                "Selector ten writes the "
                "raw argument-two word at +0x40 with the same low-index "
                "mirror/callback boundary. Selector eleven clears bit 3 of "
                "+0x04 for zero and sets it for nonzero, again mirroring and "
                "calling back below index 32."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "unresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in calls
            ),
            "provenDialogueRegionCallCount": len(dialogue),
            "selectorCounts": {
                str(key): value for key, value in sorted(selector_counts.items())
            },
            "dialogueSelectorCounts": {
                str(key): value
                for key, value in sorted(dialogue_selector_counts.items())
            },
            "areaCount": len({(call["disc"], call["area"]) for call in selected}),
            "argumentKindCounts": argument_kinds(selected),
            "dialogueArgumentKindCounts": argument_kinds(dialogue),
        },
        "evidenceBoundary": [
            "Only selectors 0, 2, 4, 5, 6, 8, 10, and 11 are promoted.",
            "Selectors 2, 6, and 8 retain exact frame-address or static-pointer word sources.",
            "Selectors 4 and 5 accept both exact authored constant and frame-field scalar words; both operand kinds reach the same native fmov route.",
            "The owning subsystem and per-index gameplay identities remain unnamed.",
            "Low-index mirror callbacks remain mandatory explicit adapters.",
            "Record fields retain exact numeric offsets and raw word identities.",
            "The other 47 calls remain unresolved rather than approximated.",
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
