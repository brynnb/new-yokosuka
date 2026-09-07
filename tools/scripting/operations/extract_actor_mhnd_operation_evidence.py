#!/usr/bin/env python3
"""Verify operation 0x0081's exact authored MHND controller routes."""

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
    PROJECT_ROOT / "tools/evidence/actor-mhnd-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C164EF0,
        154,
        "f9b6bc4321182116064ae1a09a60b0b4c2a1c6fda9de944d742ddb1d1c552b41",
    ),
    "generalController": (
        0x0C0D96CC,
        468,
        "e2886486eb237dd9e4ddda2b031875d85785aba5852dffc72aafe23fcaead907",
    ),
    "timedSetup": (
        0x0C0D9214,
        346,
        "19be9d2c57c4cb4070b22d848bc474a399d33d1de0301183abf606f5f63a4524",
    ),
    "subcontrollerBuilder": (
        0x0C0D9182,
        146,
        "9dc862119a1a592192072753a07d01dd0426d4a8df5aa593d672db3c0fff2ad0",
    ),
    "recordInitializer": (
        0x0C0D915C,
        38,
        "079e0d4d92ad8c29b7ac564862022d180228c5599155e48b6f28ba472ed481e6",
    ),
    "resetWrapper": (
        0x0C0D9AD0,
        6,
        "5d9796ad4b79c0566c5b8e62e2a03021f8d1b17924056edea8d23cc48b7cdd19",
    ),
    "resetShared": (
        0x0C0D9A1A,
        188,
        "dab9f522314a23df0437268416d2548a2696833906febe78a7dcefec51232b0b",
    ),
    "signedDivision": (
        0x0C1DC294,
        180,
        "68b75bf7d57e0b5bffe4cc8066380d19b6208545841b29529bc9888565db8a21",
    ),
}
TARGET_TABLE_ADDRESS = 0x0C287E80
TARGET_TABLE_LENGTH = 16 * 80
TARGET_TABLE_SHA256 = (
    "07d9c66e445dbf2d1f4c7e7a68e335949000a0b5ca65da0432654843f6be46b4"
)


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
                        or action.get("operationId") != 0x0081
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kind_counts(
    calls: list[dict[str, Any]],
    index: int,
) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index]["kind"] for call in calls
    ).items()))


def constant_counts(
    calls: list[dict[str, Any]],
    index: int,
) -> dict[str, int]:
    counts = Counter(
        call["arguments"][index]["value"]
        for call in calls
        if call["arguments"][index]["kind"] == "constant"
    )
    return {str(value): count for value, count in sorted(counts.items())}


def route_counts(calls: list[dict[str, Any]]) -> dict[str, int]:
    result = Counter()
    for call in calls:
        selector = call["arguments"][1]["value"]
        duration = call["arguments"][3]["value"]
        if selector == 0xFFFFFFFF:
            route = "reset-minus-one"
        elif duration == 1:
            route = "immediate-duration-one"
        else:
            route = "timed-controller"
        result[route] += 1
    return dict(sorted(result.items()))


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0081 {name} changed")
    if sha256(runtime_slice(
        executable,
        TARGET_TABLE_ADDRESS,
        TARGET_TABLE_LENGTH,
    )) != TARGET_TABLE_SHA256:
        raise ValueError("operation-0x0081 target table changed")
    dependencies = {
        "actorResolver": u32(executable, 0x0C164F8C),
        "resultWriter": u32(executable, 0x0C164FA4),
        "resetRoute": u32(executable, 0x0C164FC0),
        "minusTwoRoute": u32(executable, 0x0C164FC4),
        "minusThreeRoute": u32(executable, 0x0C164FC8),
        "generalRoute": u32(executable, 0x0C164FCC),
        "targetTable": u32(executable, 0x0C0D9860),
        "recordActivator": u32(executable, 0x0C0D9868),
        "recordConstructor": u32(executable, 0x0C0D995C),
        "recordAllocator": u32(executable, 0x0C0D9960),
        "recordTag": u32(executable, 0x0C0D9964),
        "recordResolver": u32(executable, 0x0C0D9968),
        "resetTimingTable": u32(executable, 0x0C0D9B60),
    }
    if dependencies != {
        "actorResolver": 0x0C153956,
        "resultWriter": 0x0C0BB342,
        "resetRoute": 0x0C0D9AD0,
        "minusTwoRoute": 0x0C0D9B70,
        "minusThreeRoute": 0x0C0D9BB6,
        "generalRoute": 0x0C0D96CC,
        "targetTable": 0x0C287ED0,
        "recordActivator": 0x0C0AADAC,
        "recordConstructor": 0x0C0D961E,
        "recordAllocator": 0x0C0AAC90,
        "recordTag": 0x444E484D,
        "recordResolver": 0x0C0AAD5A,
        "resetTimingTable": 0x0C288380,
    }:
        raise ValueError("operation-0x0081 dependencies changed")
    return {
        name: f"0x{value:08x}"
        for name, value in dependencies.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    dependencies = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    if len(calls) != 796 or any(len(call["arguments"]) != 4 for call in calls):
        raise ValueError("operation-0x0081 authored inventory changed")
    kinds = {
        str(index): argument_kind_counts(calls, index)
        for index in range(4)
    }
    expected_kinds = {
        "0": {
            "constant": 514,
            "frame-field": 264,
            "runtime": 14,
            "scene-field": 4,
        },
        "1": {"constant": 796},
        "2": {"constant": 752, "frame-field": 12, "runtime": 32},
        "3": {"constant": 796},
    }
    if kinds != expected_kinds:
        raise ValueError("operation-0x0081 argument bindings changed")
    selector_counts = constant_counts(calls, 1)
    if selector_counts != {
        "0": 246,
        "1": 200,
        "2": 152,
        "4294967295": 198,
    }:
        raise ValueError("operation-0x0081 route selectors changed")
    routes = route_counts(calls)
    if routes != {
        "immediate-duration-one": 2,
        "reset-minus-one": 198,
        "timed-controller": 596,
    }:
        raise ValueError("operation-0x0081 route inventory changed")
    dialogue = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue) != 114 or route_counts(dialogue) != {
        "reset-minus-one": 24,
        "timed-controller": 90,
    }:
        raise ValueError("operation-0x0081 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-actor-mhnd-operation-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0081,
            "operationHex": "0x0081",
            "handlerAddress": "0x0c164ef0",
            "recordTag": {
                "ascii": "MHND",
                "littleEndian": "0x444e484d",
            },
            "nativeDependencies": dependencies,
            "dispatch": (
                "Resolves argument zero. Argument one selects reset (-1), "
                "two unauthored routes (-2 and -3), or the general numeric "
                "channel controller. Missing actors are native no-ops."
            ),
            "resetBehavior": (
                "The authored -1 route requires actor +0x40, resolves or "
                "allocates and initializes MHND, then writes state 14 and "
                "timing pointer 0x0c288380 into both scheduler records at "
                "MHND +0x110 and +0x134."
            ),
            "timedBehavior": (
                "General channels 0, 1, and 2 with signed duration greater "
                "than one configure the first, second, or both 0x88-byte "
                "MHND subcontrollers. Each stores its source node, numeric "
                "channel, numeric target index, duration, a 40-byte runtime "
                "source snapshot, the exact 40-byte static target row, and "
                "twenty signed-truncating delta/duration dwords."
            ),
            "explicitBoundary": (
                "The two authored duration-one calls enter direct action "
                "helpers 0x0c0d8f30/0x0c0d9044 and remain runtime stops. "
                "The native -2 and -3 routes have no authored calls."
            ),
        },
        "targetTable": {
            "address": "0x0c287e80",
            "rowIndices": list(range(-1, 15)),
            "rowByteLength": 80,
            "sha256": TARGET_TABLE_SHA256,
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "argumentKindCounts": kinds,
            "constantRouteSelectorCounts": selector_counts,
            "constantTargetIndexCounts": constant_counts(calls, 2),
            "constantDurationCounts": constant_counts(calls, 3),
            "routeCounts": routes,
            "dialogueRouteCounts": route_counts(dialogue),
        },
        "verifiedRanges": {
            name: {
                "address": f"0x{address:08x}",
                "length": length,
                "sha256": digest,
            }
            for name, (address, length, digest) in RANGES.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
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
        f"Wrote {args.out} "
        f"({report['allDiscInventory']['callCount']} calls)"
    )


if __name__ == "__main__":
    main()
