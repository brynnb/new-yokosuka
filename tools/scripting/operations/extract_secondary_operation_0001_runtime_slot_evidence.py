#!/usr/bin/env python3
"""Prove secondary operation 0x0001 runtime-slot subcommands 6 and 13."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
OUTPUT = ROOT / "tools/evidence/secondary-operation-0001-runtime-slot-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "commandHandler": (0x0C15DD4C, 322, "a0c6b8c022a0350cbc4d3be3240519b62b356e28ec62b74abf435bfb73bc21f0"),
    "slotAllocate": (0x0C15DEDE, 152, "468a3792a4b9fdeed5f1887dcdf48a6ae6274b3e5fc3ebff744b4abcced8dbfe"),
    "freeSlotQuery": (0x0C15E3D2, 46, "789bda14b0c5876a3c0edae583d0914a0b73349878dedf51910a71752ea0c0fc"),
    "slotStatusConsume": (0x0C15E1DC, 112, "255acdbe79e6ab373c1f4e1968d527e6c47131582428661ea1aabb72c232d9c0"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def collect_calls(event_ir: dict[str, Any], subcommand: int) -> list[dict[str, Any]]:
    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if not (
                        action.get("kind") == "secondaryEngineOperation"
                        and action.get("operationId") == 1
                        and arguments
                        and arguments[0].get("kind") == "constant"
                        and arguments[0].get("value") == subcommand
                    ):
                        continue
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "argumentKinds": [item.get("kind") for item in arguments],
                        "argumentOffsets": [item.get("offset") for item in arguments],
                        "hasResultTarget": "resultTarget" in action,
                    })
    return calls


def main() -> None:
    executable = EXECUTABLE.read_bytes()
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in RANGES.items():
        actual = digest(executable[address - BASE:address - BASE + size])
        if actual != expected:
            raise ValueError(f"secondary operation 0x0001 {name} changed")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }
    event_ir = json.loads(EVENT_IR.read_text())
    allocate = collect_calls(event_ir, 6)
    consume = collect_calls(event_ir, 13)
    expected_areas = Counter(
        (disc, area)
        for disc in (1, 2, 3)
        for area in ("DBYO", "DSLT", "JOMO")
    )
    for subcommand, calls, kinds, offsets in (
        (6, allocate, ["constant", "frame-field", "frame-field"], [None, 20, 24]),
        (13, consume, ["constant", "frame-field"], [None, 4]),
    ):
        if (
            len(calls) != 9
            or Counter((item["disc"], item["area"]) for item in calls) != expected_areas
            or not all(item["argumentKinds"] == kinds for item in calls)
            or not all(item["argumentOffsets"] == offsets for item in calls)
            or not all(item["hasResultTarget"] for item in calls)
        ):
            raise ValueError(f"secondary operation 0x0001 mode {subcommand} inventory changed")
    report = {
        "schema": "new-yokosuka-secondary-operation-0001-runtime-slot-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedNativeRanges": verified,
        "runtimeSlotLayout": {
            "slotCount": 16,
            "slotSizeBytes": 24,
            "firstWordOffset": 0,
            "secondWordOffset": 4,
            "statusWordOffset": 12,
            "clearedWordOffset": 16,
            "controlWordOffset": 20,
            "freeStatus": -3,
        },
        "subcommands": [
            {
                "subcommand": 6,
                "authoredCallCount": len(allocate),
                "resultConsumedCount": sum(item["hasResultTarget"] for item in allocate),
                "behavior": "Allocates the first slot whose status is -3, writes argument two at word zero and argument one at word one, writes status 2, zero, and control 5 at words three through five, and returns the slot index or -1.",
            },
            {
                "subcommand": 13,
                "authoredCallCount": len(consume),
                "resultConsumedCount": sum(item["hasResultTarget"] for item in consume),
                "behavior": "Returns status values -2 through 2 unchanged, returns -1 for every other status, and clears slot word five.",
            },
        ],
        "areas": [
            {"disc": disc, "area": area}
            for disc, area in sorted(expected_areas)
        ],
        "evidenceBoundary": [
            "Only exact subcommands 6 and 13 with their complete authored argument shapes receive these semantics.",
            "The six runtime-slot words remain numeric; no gameplay-domain labels are inferred.",
            "Missing room-manager state stops explicitly instead of fabricating a slot result.",
        ],
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {OUTPUT}: {len(allocate)} allocate and {len(consume)} consume calls")


if __name__ == "__main__":
    main()
