#!/usr/bin/env python3
"""Verify operation 0x0071's exact three-channel float-word access."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-0071-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C156CE4,
        142,
        "02590c1045adcc089456c0b1563c892c91f0e46092418247c45d11a2b93eec4e",
    ),
    "channelAccessors": (
        0x0C09F1B0,
        48,
        "d8f79ea9f9789c552b0c8aa4a9dc6787e537518b66adf386fb7de1cca418c9dd",
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
                        or action.get("operationId") != 0x0071
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0071 {name} range changed")

    calls = authored_calls(event_ir)
    dialogue = [call for call in calls if call["dialogueRegion"]]
    modes = Counter(call["arguments"][0].get("value") for call in calls)
    kinds = Counter(call["arguments"][1].get("kind") for call in calls)
    dialogue_modes = Counter(
        call["arguments"][0].get("value") for call in dialogue
    )
    if (
        len(calls) != 794
        or any(len(call["arguments"]) != 2 for call in calls)
        or modes != {0: 410, 1: 5, 2: 347, 3: 3, 4: 29}
        or kinds != {
            "constant": 776,
            "frame-field": 11,
            "scene-field": 4,
            "runtime": 3,
        }
        or len(dialogue) != 17
        or dialogue_modes != {0: 10, 2: 7}
    ):
        raise ValueError("operation-0x0071 authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-0071-evidence-v1",
        "status": "exact-three-channel-float-word-contract-and-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0071,
            "operationHex": "0x0071",
            "handlerAddress": "0x0c156ce4",
            "stateBaseAddress": "0x0c2019f0",
            "channelOffsets": ["0x0104", "0x0108", "0x010c"],
            "modes": [
                {"mode": 0, "channel": 0, "behavior": "write and return prior word"},
                {"mode": 1, "channel": 0, "behavior": "read current word"},
                {"mode": 2, "channel": 1, "behavior": "write and return prior word"},
                {"mode": 3, "channel": 1, "behavior": "read current word"},
                {"mode": 4, "channel": 2, "behavior": "write and return prior word"},
                {"mode": 5, "channel": 2, "behavior": "read current word; not authored"},
            ],
            "provenBehavior": (
                "Even modes write argument one's raw float32 word to one of "
                "three fixed fields and return that field's prior word. Odd "
                "modes return the matching current word without mutation."
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
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "modeCounts": {
                str(mode): count for mode, count in sorted(modes.items())
            },
            "argumentOneKindCounts": dict(sorted(kinds.items())),
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
        },
        "evidenceBoundary": [
            "The three fixed fields retain numeric channel identities; no visual or gameplay label is inferred.",
            "Mode five is proven in the handler but remains outside compilation because no authored call uses it.",
            "A read or prior-value consumer stops when the corresponding word has not been established exactly.",
            "All values remain raw float32 words; no host-number reinterpretation is used for storage.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['callCount']} calls")


if __name__ == "__main__":
    main()
