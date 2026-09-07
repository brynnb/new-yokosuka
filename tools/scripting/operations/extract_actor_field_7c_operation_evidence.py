#!/usr/bin/env python3
"""Verify operation 0x0121's exact two-argument actor dword +0x7c access."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/actor-field-7c-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1583DC,
        212,
        "95f610439ac6a414916c976288252538b8e2a15564b4ae6dc35b698e1428b598",
    ),
    "writeDword7c": (
        0x0C0AB2A0,
        12,
        "41f4b082fb6f4d5a15438e1ef99b8290b32195b921f6b92f39d70f682f0ac1e0",
    ),
    "readDword7c": (
        0x0C0AB2AC,
        16,
        "60354a0c734f23401408592fce82dc2909862137183cb02181963391dc0c43d5",
    ),
}
COMPILED_MODES = {0, 1, 2, 4, 8, 9, 11}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    found = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0121
                    ):
                        continue
                    found.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return found


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0121 {name} range changed")
    authored = calls(event_ir)
    selected = [
        call for call in authored
        if (
            len(call["arguments"]) == 2
            and call["arguments"][1].get("kind") == "constant"
            and call["arguments"][1].get("value") in COMPILED_MODES
        )
    ]
    mode_counts = Counter(call["arguments"][1]["value"] for call in selected)
    if (
        len(authored) != 435
        or len(selected) != 402
        or mode_counts != {0: 110, 1: 2, 2: 16, 4: 265, 8: 3, 9: 3, 11: 3}
        or Counter(len(call["arguments"]) for call in authored)
        != {0: 2, 2: 402, 3: 1, 4: 30}
    ):
        raise ValueError("operation-0x0121 authored inventory changed")
    dialogue = [call for call in selected if call["dialogueRegion"]]
    if len(dialogue) != 6 or any(call["arguments"][1]["value"] != 4 for call in dialogue):
        raise ValueError("operation-0x0121 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-actor-field-7c-operation-evidence-v1",
        "status": "exact-two-argument-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0121,
            "operationHex": "0x0121",
            "handlerAddress": "0x0c1583dc",
            "actorFieldOffset": "0x007c",
            "actorFieldWidth": 4,
            "writeModes": [0, 1, 2, 4, 8, 9],
            "readMode": 11,
            "provenBehavior": (
                "The exact two-argument routes resolve argument zero as an actor. "
                "Authored modes zero, one, two, four, eight, and nine write that "
                "mode as a dword at actor offset +0x7c, then return the field. "
                "Authored mode eleven only returns the current field. A missing "
                "actor returns 0xffffffff."
            ),
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "compiledTwoArgumentCallCount": len(selected),
            "uncompiledOtherShapeCount": len(authored) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in selected}),
            "modeCounts": {str(k): v for k, v in sorted(mode_counts.items())},
            "actorArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"] for call in selected
            ).items())),
        },
        "evidenceBoundary": [
            "The dword remains an opaque actor field; no gameplay label is inferred.",
            "The 33 authored zero-, three-, and four-argument routes remain unresolved.",
            "An available actor's mode-eleven read fails closed if its initial dword is unknown and the result is consumed.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['compiledTwoArgumentCallCount']} calls")


if __name__ == "__main__":
    main()
