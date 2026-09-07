#!/usr/bin/env python3
"""Prove operation 0x0002's child-coroutine ABI and extraction coverage."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_CONTROL_FLOW = (
    ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0002-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "operationHandler": (
        0x0C0BB3AC,
        44,
        "9e7789a934f489967b9eb5466dcfa0410f868db93f551ce6e57f769b44ec6ca3",
    ),
    "coroutineConstructor": (
        0x0C0BB1D6,
        290,
        "c12634820dc021fedf41c45642d453de1e08654bb3d1af1faf44e41fa8b6edfb",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x0002 native range unavailable")
    return data[start:start + size]


def build_report(executable: bytes, control_flow: dict[str, Any]) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in RANGES.items():
        actual = digest(runtime_slice(executable, address, size))
        if actual != expected:
            raise ValueError(f"operation-0x0002 {name} changed: {actual}")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }

    launch_count = 0
    raw_calls = []
    implicit_launches = []
    typed_table_launches = []
    registered_selector_launches = []
    propagated_pointer_launches = []
    launches_by_disc: Counter[int] = Counter()
    launches_by_map: Counter[tuple[int, str]] = Counter()
    for source_map in control_flow["maps"]:
        for function in source_map["scriptedEventFunctions"]:
            launches = function["childCoroutineLaunches"]
            launch_offsets = {
                launch["callFileOffset"] for launch in launches
            }
            for launch in launches:
                launch_count += 1
                launches_by_disc[source_map["disc"]] += 1
                launches_by_map[(source_map["disc"], source_map["area"])] += 1
                if (
                    launch.get("targetSource", {}).get("kind")
                    == "typed-table-operation-result"
                ):
                    if (
                        len(launch.get("targetTable", [])) != 38
                        or len(launch.get("targetFileOffsets", [])) != 13
                    ):
                        raise ValueError("typed child-target table changed")
                    typed_table_launches.append(launch)
                if (
                    launch.get("targetSource", {}).get("kind")
                    == "registered-selector-operation-result"
                ):
                    if (
                        len(launch.get("targetTable", [])) != 4
                        or len(launch.get("targetFileOffsets", [])) != 4
                    ):
                        raise ValueError("registered child selector changed")
                    registered_selector_launches.append(launch)
                if (
                    launch.get("targetSource", {}).get("kind")
                    == "propagated-coroutine-function-pointer"
                ):
                    propagated_pointer_launches.append(launch)
                if launch.get("implicitArgumentCount"):
                    if (
                        launch["implicitArgumentCount"] != 1
                        or len(launch["arguments"]) != launch["argumentCount"]
                        or launch["arguments"][-1].get("kind") != "frame-field"
                        or launch["arguments"][-1].get("offset") != 0
                    ):
                        raise ValueError("implicit launch-frame word changed")
                    implicit_launches.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "functionFileOffset": function["fileOffset"],
                        "callFileOffset": launch["callFileOffset"],
                        "targetFileOffset": launch["targetFileOffset"],
                        "argumentCount": launch["argumentCount"],
                    })
            for operation in function["nativeOperations"]:
                if (
                    operation["operationId"] == 2
                    and operation["callFileOffset"] not in launch_offsets
                ):
                    raw_calls.append(operation)

    if launch_count != 7701 or raw_calls:
        raise ValueError("operation-0x0002 extraction inventory changed")
    if len(implicit_launches) != 18:
        raise ValueError("operation-0x0002 implicit-word inventory changed")
    if len(typed_table_launches) != 288:
        raise ValueError("typed child-target launch inventory changed")
    if len(registered_selector_launches) != 21:
        raise ValueError("registered child-selector inventory changed")
    if len(propagated_pointer_launches) != 10:
        raise ValueError("propagated child-pointer inventory changed")
    shared_cleanup_launch_count = sum(
        launch.get("argumentCountRecovery")
        == "direct-branch-shared-cleanup"
        for source_map in control_flow["maps"]
        for function in source_map["scriptedEventFunctions"]
        for launch in function["childCoroutineLaunches"]
    )
    if shared_cleanup_launch_count != 10:
        raise ValueError("shared launch-cleanup inventory changed")

    return {
        "schema": "new-yokosuka-operation-0002-evidence-v1",
        "status": "exact-native-handler-and-bounded-target-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": (
                ".disc-work/dialogue/"
                "scripted-event-control-flow-index.json"
            ),
        },
        "verifiedNativeRanges": verified,
        "operation": {
            "operationId": 2,
            "operationHex": "0x0002",
            "argumentZero": "absolute child SCN3 function pointer",
            "argumentOne": "number of words copied into the child coroutine",
            "remainingWords": "child coroutine frame payload",
            "result": "new SCNT coroutine record stored on the caller",
            "recordTag": "SCNT",
            "recordSize": 0x240,
        },
        "stackContract": {
            "direction": "downward-growing",
            "sourcePushOrder": "left-to-right",
            "nativeArgumentOrder": "reverse push order",
            "nestedCleanupRule": (
                "positive r13 adjustments reclaim only the nearest nested "
                "pushes; older payload pushes remain live"
            ),
            "implicitFrameWordRule": (
                "18 authored launches request one word beyond their explicit "
                "operation operands; after cleanup that word is exactly "
                "frame offset zero"
            ),
        },
        "inventory": {
            "authoredReachableCallCount": launch_count + len(raw_calls),
            "exactLaunchCount": launch_count,
            "fixedTargetLaunchCount": (
                launch_count
                - len(typed_table_launches)
                - len(registered_selector_launches)
                - len(propagated_pointer_launches)
            ),
            "typedTableTargetLaunchCount": len(typed_table_launches),
            "registeredSelectorTargetLaunchCount": len(
                registered_selector_launches
            ),
            "propagatedFunctionPointerLaunchCount": len(
                propagated_pointer_launches
            ),
            "remainingDynamicOrUnderRecoveredCallCount": len(raw_calls),
            "implicitFrameWordLaunchCount": len(implicit_launches),
            "launchCountsByDisc": {
                str(key): value for key, value in sorted(launches_by_disc.items())
            },
            "mapCountWithExactLaunches": len(launches_by_map),
            "remainingTargetKinds": {},
        },
        "implicitFrameWordLaunches": implicit_launches,
        "recoveredDynamicTargetFamilies": {
            "registeredFourEntrySelectors": len(registered_selector_launches),
            "propagatedCoroutineFunctionPointers": len(
                propagated_pointer_launches
            ),
            "sharedCleanupStaticTargets": shared_cleanup_launch_count,
        },
        "evidenceBoundary": [
            "The native handler and SCNT constructor are hash-pinned.",
            "Every static target is SCN3-relative and must match an exact same-MAPINFO function prologue.",
            "Nested operation arguments are excluded through exact stack cleanup rather than proximity.",
            "The 18 implicit words preserve their exact live frame source instead of being dropped.",
            "Mode-8 typed tables retain all 38 ordered entries and 13 exact legal targets per room.",
            "Registered selectors require the exact index bound, indexed r9 table load, and ordered executable-target group.",
            "Propagated targets resolve through every exact incoming coroutine payload; incomplete or conflicting provenance fails closed.",
            "Shared epilogue recovery follows only direct branches to an immediate exact r13 cleanup.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--control-flow", type=Path, default=DEFAULT_CONTROL_FLOW)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.control_flow.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['inventory']['exactLaunchCount']} exact launches, "
        f"{report['inventory']['remainingDynamicOrUnderRecoveredCallCount']} remaining"
    )


if __name__ == "__main__":
    main()
