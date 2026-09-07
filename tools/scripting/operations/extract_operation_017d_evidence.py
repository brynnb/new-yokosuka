#!/usr/bin/env python3
"""Prove operation 0x017d's selector-five XMPT request contract."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-017d-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "operationHandler": (
        0x0C166C2E,
        48,
        "b7eff722520971ad6ae05db6ab92910f20acf7e75ab46464ed4faef1f6c7dcf2",
    ),
    "objectRecordResolver": (
        0x0C153956,
        60,
        "9f17c0e1e76d43fadc6671985324c0d702b079d170f73aa16e3fdc58d4534d09",
    ),
    "xmptRequestCore": (
        0x0C0FEBC0,
        432,
        "a1788568795b3b9e26cb339c0490d522c6509cfd60a54cb32413252d5bd52576",
    ),
    "xmptController": (
        0x0C0FD1FC,
        2856,
        "76a48e543b56631a4d1d32cbdbcc8702770d62c606600136c913e82a655bd946",
    ),
    "selectorFiveTargetHelper": (
        0x0C0FDF8C,
        446,
        "e62b78d3a6aa9d63fc18d40c579d87c9aeb68a7ebb7d0acc2936a0ecc2b82e80",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x017d range unavailable")
    return data[start:start + size]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in RANGES.items():
        actual = digest(runtime_slice(executable, address, size))
        if actual != expected:
            raise ValueError(f"operation-0x017d {name} changed: {actual}")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationHex") != "0x017d":
                        continue
                    arguments = action.get("arguments", [])
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "argumentKinds": tuple(
                            argument.get("kind") for argument in arguments
                        ),
                        "hasResultTarget": "resultTarget" in action,
                    })
    shapes = Counter(item["argumentKinds"] for item in calls)
    if shapes != {
        ("frame-field", "scene-address", "runtime", "constant"): 96,
        ("runtime", "scene-address", "runtime", "frame-field"): 96,
        ("runtime", "scene-address", "runtime", "runtime"): 96,
        ("constant", "frame-address", "constant", "constant"): 6,
        ("constant", "scene-address", "runtime", "constant"): 3,
    }:
        raise ValueError("operation-0x017d authored inventory changed")
    if any(item["hasResultTarget"] for item in calls):
        raise ValueError("operation-0x017d unexpectedly stores a result")
    areas = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-operation-017d-evidence-v1",
        "status": "exact-native-handler-controller-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedNativeRanges": verified,
        "operation": {
            "operationId": 0x017D,
            "operationHex": "0x017d",
            "argumentCount": 4,
            "arguments": [
                {"index": 0, "meaning": "actor reference"},
                {"index": 1, "meaning": "pointer to an exact three-float target vector"},
                {"index": 2, "meaning": "word copied unchanged to XMPT +0x88"},
                {"index": 3, "meaning": "dword copied unchanged to XMPT +0x20"},
            ],
            "fixedRequestCoreArguments": {
                "routeScalar": -1.0,
                "supplementalRecordPointer": 0,
                "selector": 5,
            },
            "recordTag": "XMPT",
        },
        "selectorFiveLifecycle": {
            "initialState": 3,
            "routePreparationState": 3,
            "nearRouteWaitState": 4,
            "motionWaitState": 8,
            "finalAlignmentState": 7,
            "cleanupState": 11,
            "terminalState": 0,
            "farRouteTransition": [3, 8],
            "nearRouteTransition": [3, 4, 8],
            "alignmentLoop": [8, 7, 8],
            "completionTransition": [8, 11, 0],
            "selectorSpecificTargetHelperAddress": "0x0c0fdf8c",
            "motionRequestSource": "low 16 bits of XMPT +0x20 request dword",
            "controllerRequestWordOffset": "actor +0x66",
            "provenBehavior": (
                "State three invokes the selector-five target helper before "
                "choosing the native near or far route and starting motion. "
                "The far route enters wait state eight directly; the near "
                "route enters state four before state eight. State eight "
                "waits for actor +0x66 to clear, enters state seven when "
                "final alignment differs, and otherwise enters cleanup state "
                "eleven. State seven starts the final alignment and returns "
                "to state eight. State eleven performs shared cleanup and "
                "sets the record to terminal state zero."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len(areas),
            "callsByDisc": {
                str(disc): sum(
                    count
                    for (item_disc, _), count in areas.items()
                    if item_disc == disc
                )
                for disc in sorted({disc for disc, _ in areas})
            },
            "storedResultCount": 0,
            "argumentShapes": [
                {"kinds": list(shape), "count": count}
                for shape, count in sorted(shapes.items())
            ],
        },
        "evidenceBoundary": [
            "Only exact four-argument operation 0x017d receives this semantic.",
            "The handler supplies null supplemental data and literal selector five independently of all authored operands.",
            "The selector-five target helper is retained as an explicit controller obligation; its model- and motion-dependent geometry is not replaced by a guessed offset.",
            "A request is not complete until the native state path reaches zero; operation 0x017e remains the exact active predicate.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.output}: "
        f"{report['allDiscInventory']['authoredCallCount']} calls"
    )


if __name__ == "__main__":
    main()
