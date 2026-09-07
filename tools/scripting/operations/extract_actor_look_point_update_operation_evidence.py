#!/usr/bin/env python3
"""Verify operation 0x016c's optimized LKPT target-update contract."""

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
    PROJECT_ROOT
    / "tools/evidence/actor-look-point-update-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C165ED0,
        38,
        "de9f9708a0cd56fabc37cc2994f40ca4172470f96d7e7c58d2776ed638028cf8",
    ),
    "optimizedUpdate": (
        0x0C0FF32A,
        196,
        "47b9d7ff73b7e4eb393a7ca0ef8c188be696676ac752b3099db36f5adb5787f5",
    ),
    "fullControlFallback": (
        0x0C0FF172,
        440,
        "d84dae8d77853517ade0db8a6ddbc5397d43ad5ebb18790ec68e46c8fdcce443",
    ),
    "motmControllerAccessor": (
        0x0C113A76,
        30,
        "69d657beb0f052b69809a44353767e8d1d78164f4255489734802b15c7027f35",
    ),
    "downstreamAngularUpdate": (
        0x0C107338,
        0x338,
        "7db98ca41b974895c860b79347fb62960a49c9fe35a3be4d101725744d9a3ab5",
    ),
    "controllerTypeFourConsumer": (
        0x0C104D62,
        0x19C,
        "c7c2baefc1113e0b67d3ffe0704f24e240e7ad36be51fb0eb7e9eff017d928c3",
    ),
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x016C
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


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x016c {name} changed")
    dependencies = {
        "actorResolver": u32(executable, 0x0C165F60),
        "optimizedUpdate": u32(executable, 0x0C165FA4),
        "motmControllerAccessor": u32(executable, 0x0C0FF3FC),
        "recordTag": u32(executable, 0x0C0FF40C),
        "associatedRecordResolver": u32(executable, 0x0C0FF410),
        "fullControlFallback": 0x0C0FF172,
        "downstreamAngularUpdate": u32(executable, 0x0C104F30),
    }
    if dependencies != {
        "actorResolver": 0x0C153956,
        "optimizedUpdate": 0x0C0FF32A,
        "motmControllerAccessor": 0x0C113A76,
        "recordTag": 0x54504B4C,
        "associatedRecordResolver": 0x0C0AAD5A,
        "fullControlFallback": 0x0C0FF172,
        "downstreamAngularUpdate": 0x0C107338,
    }:
        raise ValueError("operation-0x016c dependencies changed")
    return {
        name: (
            f"0x{value:08x}" if isinstance(value, int) else value
        )
        for name, value in dependencies.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    dependencies = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if len(call["arguments"]) == 4]
    if len(calls) != 290 or len(selected) != 290:
        raise ValueError("operation-0x016c authored inventory changed")
    kinds = {
        str(index): argument_kind_counts(selected, index)
        for index in range(4)
    }
    if kinds != {
        "0": {
            "constant": 196,
            "frame-field": 72,
            "runtime": 1,
            "scene-field": 21,
        },
        "1": {"constant": 280, "frame-field": 7, "runtime": 3},
        "2": {"frame-address": 287, "static-pointer": 3},
        "3": {"constant": 288, "frame-field": 2},
    }:
        raise ValueError("operation-0x016c argument bindings changed")
    return {
        "schema": "new-yokosuka-actor-look-point-update-evidence-v1",
        "status": "exact-native-optimized-update-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x016C,
            "operationHex": "0x016c",
            "handlerAddress": "0x0c165ed0",
            "recordTag": {
                "ascii": "LKPT",
                "littleEndian": "0x54504b4c",
            },
            "nativeDependencies": dependencies,
            "optimizedAdmission": (
                "The resolved actor has a MOTM controller whose terminal "
                "dword at +0x260 is not one, an LKPT record exists with a "
                "nonzero active dword at +0x10, and controller dword +0x04 "
                "does not have bit 0x40 set."
            ),
            "optimizedBehavior": (
                "Copies argument two's exact three-float target, or the "
                "controller default vector at +0x1ec/+0x1f0/+0x1f4 when "
                "argument two is null, into LKPT +0x00/+0x04/+0x08. For a "
                "supplied target it synchronizes LKPT words +0x0c/+0x0e "
                "with the controller selector word at +0x84 using the exact "
                "0x8065 guard, then clears LKPT dword +0x14."
            ),
            "fallbackBehavior": (
                "A missing or inactive LKPT record, or controller flag 0x40, "
                "delegates to the same full controller used by operation "
                "0x002c. A missing actor/controller or terminal controller "
                "state one remains a native no-op."
            ),
            "matrixConsumer": {
                "controllerTraversalAddress": "0x0c104954",
                "controllerTypeCompareAddress": "0x0c104d62",
                "requiredControllerType": 4,
                "callbackCallAddress": "0x0c104ef8",
                "callbackAddress": "0x0c107338",
                "actorAngularWordOffsets": ["0x86", "0x90"],
                "behavior": (
                    "The native controller traversal calls the LKPT angular "
                    "update only from its exact controller-type-four branch. "
                    "The callback derives and limits the two target angles, "
                    "writes actor words +0x86 and +0x90, then composes those "
                    "angles into the current type-four controller matrix. "
                    "Controller type four occurs exactly once in every one "
                    "of the executable's 21 authored controller families."
                ),
            },
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentKindCounts": kinds,
            "constantSelectorCounts": constant_counts(selected, 1),
            "constantModeCounts": constant_counts(selected, 3),
        },
        "verifiedRanges": {
            name: {
                "address": f"0x{address:08x}",
                "length": length,
                "sha256": digest,
            }
            for name, (address, length, digest) in RANGES.items()
        },
        "evidenceBoundary": [
            "LKPT is the literal native record tag; the older KLPT transcription is corrected.",
            "Operation 0x016c's optimized path ignores arguments one and three, but the fallback consumes both through the full controller.",
            "Runtime execution may use the optimized path only when every admission field is exact.",
            "The full-controller fallback remains an explicit stop until its callback and selector-table effects are represented.",
            "The matrix consumer is identified by exact native controller type four, not by a guessed model, bone, or actor name.",
            "The affected controller route is now exact; the selector-dependent angular limits and interpolation response remain unresolved.",
            "No story meaning is inferred.",
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
