#!/usr/bin/env python3
"""Verify operation 0x013e's exact 70-slot resource-binding lifecycle."""

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
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-013e-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C15555A,
        46,
        "10081a0da05b9ed59a67078360f62a51e607eba088f854d0988a3517477b8036",
    ),
    "install": (
        0x0C1553B0,
        332,
        "15f8607ba7372b2b7c959d0be9d65e8455dcd526ef35d24b54230d1814439fa5",
    ),
    "release": (
        0x0C1554FC,
        94,
        "c17d5ab4426782ee05e6482c67d1d81d686ee12faa2ae26cded12894b4cb791b",
    ),
    "initialize": (
        0x0C15532A,
        122,
        "359c35ee54d80aec40ba5aafc6b8b17054b66fb556c6ea017becc9df3b7e456d",
    ),
    "clearSlot": (
        0x0C15530C,
        30,
        "83a4f7a926ac0878b8f5f59a104d18f92717b3a9884f7198f766bfedde17addd",
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
                        or action.get("operationId") != 0x013E
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kinds(
    calls: list[dict[str, Any]],
    count: int = 4,
) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            (
                call["arguments"][index]["kind"]
                if index < len(call["arguments"])
                else "missing"
            )
            for call in calls
        ).items()))
        for index in range(count)
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x013e {name} range changed")

    calls = authored_calls(event_ir)
    mode_counts = Counter(call["arguments"][0].get("value") for call in calls)
    argument_counts = Counter(len(call["arguments"]) for call in calls)
    dialogue = [call for call in calls if call["dialogueRegion"]]
    dialogue_modes = Counter(
        call["arguments"][0].get("value") for call in dialogue
    )
    if (
        len(calls) != 530
        or mode_counts != {0: 306, 1: 224}
        or argument_counts != {4: 306, 2: 224}
        or len(dialogue) != 25
        or dialogue_modes != {0: 13, 1: 12}
        or argument_kinds(calls) != {
            "0": {"constant": 530},
            "1": {"constant": 511, "frame-field": 19},
            "2": {"missing": 224, "static-pointer": 306},
            "3": {"missing": 224, "static-pointer": 306},
        }
        or argument_kinds(dialogue) != {
            "0": {"constant": 25},
            "1": {"constant": 25},
            "2": {"missing": 12, "static-pointer": 13},
            "3": {"missing": 12, "static-pointer": 13},
        }
    ):
        raise ValueError("operation-0x013e authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-013e-evidence-v1",
        "status": "exact-two-mode-native-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x013E,
            "operationHex": "0x013e",
            "handlerAddress": "0x0c15555a",
            "slotCount": 70,
            "slotRecordBytes": 20,
            "slotTableAddress": "0x0c222588",
            "modes": [
                {
                    "mode": 0,
                    "argumentCount": 4,
                    "targetAddress": "0x0c1553b0",
                    "behavior": (
                        "replaces the selected slot using the two exact "
                        "resource-pointer arguments and marks the slot active"
                    ),
                },
                {
                    "mode": 1,
                    "argumentCount": 2,
                    "targetAddress": "0x0c1554fc",
                    "behavior": (
                        "releases the selected active slot when native "
                        "lifecycle guards permit, then clears its 20-byte record"
                    ),
                },
            ],
            "provenBehavior": (
                "Rejects slot indices outside 0..69. Mode zero forwards the "
                "slot and two authored resource pointers through the exact "
                "replacement path. Mode one follows the exact release path "
                "for that slot. Other modes are native no-ops."
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
                str(mode): count for mode, count in sorted(mode_counts.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
            "argumentKindCounts": argument_kinds(calls),
            "dialogueArgumentKindCounts": argument_kinds(dialogue),
        },
        "evidenceBoundary": [
            "The two pointer operands retain exact pointer identity; no filename or gameplay role is inferred.",
            "A mode-zero binding may execute only for a resource pair declared by the version-pinned program.",
            "The browser state models the proven slot lifecycle, not Dreamcast allocation or reference-count internals.",
            "Unknown modes and malformed argument shapes remain unresolved and fail closed.",
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
