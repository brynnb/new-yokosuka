#!/usr/bin/env python3
"""Verify operation 0x002e eight-channel transition writes and query."""

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
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/scene-eight-channel-transition-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operationHandler": (
        0x0C16AD48,
        102,
        "306898e8b07b62412f78d5abbbef9a9c64b423315675a2d2bfc48e55aab79c53",
    ),
    "transitionWriter": (
        0x0C173C04,
        250,
        "80c67789a89d3f461a4974aa6c7a8e6d605e6c2fc928a4421b00a18b7666a5bb",
    ),
    "activeQuery": (
        0x0C173CFE,
        30,
        "847645f0e02d66e7847e779d50c56e0d800f4288ced107a4d1e125b4ca5cf44c",
    ),
    "perTickUpdate": (
        0x0C173B68,
        156,
        "bb4edaee1b0d65bf20deb63b45584cadeb128ba185d143b52b3777ae2c5aa07e",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def authored_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x002E
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    query = (
                        len(arguments) == 1
                        and arguments[0].get("kind") == "constant"
                        and arguments[0].get("value") == 0xFFFFFFFF
                    )
                    write = (
                        len(arguments) == 9
                        and all(
                            argument.get("kind") == "constant"
                            for argument in arguments[1:]
                        )
                    )
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "form": (
                            "active-query" if query
                            else "transition-write" if write
                            else "unselected"
                        ),
                        "durationKind": (
                            arguments[0].get("kind")
                            if write else None
                        ),
                    })
    return calls


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x002e {name} range changed")
    calls = authored_calls(event_ir)
    forms = Counter(call["form"] for call in calls)
    if forms != {
        "active-query": 756,
        "transition-write": 1338,
        "unselected": 2,
    }:
        raise ValueError(f"operation-0x002e forms changed: {forms}")
    dialogue_forms = Counter(
        call["form"] for call in calls if call["dialogueRegion"]
    )
    if dialogue_forms != {
        "active-query": 103,
        "transition-write": 145,
    }:
        raise ValueError(
            f"operation-0x002e dialogue forms changed: {dialogue_forms}"
        )
    duration_kinds = Counter(
        call["durationKind"]
        for call in calls
        if call["form"] == "transition-write"
    )
    return {
        "schema": "new-yokosuka-scene-eight-channel-transition-v1",
        "status": "exact-native-write-query-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x002E,
            "operationHex": "0x002e",
            "handlerAddress": "0x0c16ad48",
            "transitionWriter": "0x0c173c04",
            "activeQuery": "0x0c173cfe",
            "perTickUpdate": "0x0c173b68",
            "writeForm": {
                "argumentCount": 9,
                "durationArgumentIndex": 0,
                "firstEndpointArgumentIndices": [1, 2, 3, 4],
                "secondEndpointArgumentIndices": [5, 6, 7, 8],
                "storedEndpointScale": 65536,
                "deltaFormula": (
                    "signed(secondEndpointWord - firstEndpointWord) "
                    "/ signed duration, truncating toward zero"
                ),
                "zeroDurationDeltaWords": [0, 0, 0, 0],
                "tickBehavior": (
                    "decrement duration once; snap current words to the second "
                    "endpoint when it reaches zero, otherwise add the four "
                    "stored delta words with 32-bit wrapping"
                ),
            },
            "queryForm": {
                "argumentCount": 1,
                "sentinel": "0xffffffff",
                "returnValues": [0, 1],
                "condition": "stored duration word is nonzero",
            },
            "provenBehavior": (
                "Nine-argument calls install two four-byte endpoints as eight "
                "16.16-scaled channel words, store argument zero as duration, "
                "and derive four signed per-tick deltas when duration is "
                "nonzero. The native update callback decrements duration, "
                "advances the four current words, and installs the exact "
                "second endpoint on the terminal tick. The one-argument -1 "
                "form returns whether the stored duration is nonzero."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "formCounts": dict(sorted(forms.items())),
            "dialogueRegionFormCounts": dict(sorted(
                dialogue_forms.items()
            )),
            "durationArgumentKindCounts": dict(sorted(
                duration_kinds.items()
            )),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
        },
        "evidenceBoundary": [
            "The endpoint order, byte truncation, 16.16 scaling, duration field, signed division, zero-duration path, per-tick update, terminal endpoint, and query condition are exact.",
            "The eight channels retain a neutral numeric name; no lighting, fog, palette, or color meaning is assigned.",
            "Two zero-argument scanner detections remain unresolved.",
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
