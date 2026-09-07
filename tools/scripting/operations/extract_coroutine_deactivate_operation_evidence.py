#!/usr/bin/env python3
"""Verify operation 0x0003 as an event-record deactivation request."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/coroutine-deactivate-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C0BB3D8
HANDLER_LENGTH = 58
HANDLER_SHA256 = (
    "67ee46e6efdf3439397fc5c201eff961d122b77e73cec32d495b2bef55626e01"
)
DISPATCH_LOOP_ADDRESS = 0x0C0BB1A8
DISPATCH_LOOP_LENGTH = 38
DISPATCH_LOOP_SHA256 = (
    "cd1a9143cb11260d451fb96812c5e3b57ba0b5c0c3a1f962f2ae65b9d19403c3"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 3
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "targetArgument": (
                            arguments[0] if arguments else None
                        ),
                    })
    return result


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(runtime_slice(
        executable,
        HANDLER_ADDRESS,
        HANDLER_LENGTH,
    )) != HANDLER_SHA256:
        raise ValueError("operation-0x0003 handler changed")
    if sha256(runtime_slice(
        executable,
        DISPATCH_LOOP_ADDRESS,
        DISPATCH_LOOP_LENGTH,
    )) != DISPATCH_LOOP_SHA256:
        raise ValueError("event-record dispatch loop changed")

    calls = operation_calls(event_ir)
    if len(calls) != 1988:
        raise ValueError(
            f"expected 1988 operation-0x0003 calls, found {len(calls)}"
        )
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue_calls) != 66:
        raise ValueError(
            "expected 66 dialogue-region operation-0x0003 calls, "
            f"found {len(dialogue_calls)}"
        )
    return {
        "schema": "new-yokosuka-coroutine-deactivate-evidence-v1",
        "status": "exact-native-handler-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 3,
            "operationHex": "0x0003",
            "handlerAddress": "0x0c0bb3d8",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "dispatchLoopAddress": "0x0c0bb1a8",
            "dispatchLoopLength": DISPATCH_LOOP_LENGTH,
            "dispatchLoopSha256": DISPATCH_LOOP_SHA256,
            "recordNextOffset": 16,
            "recordFlagsOffset": 22,
            "deactivateFlagMask": 1,
            "dispatchSkipMask": 3,
            "returnValues": [0, 1],
            "provenBehavior": (
                "Searches the owning scheduler's event-record list for "
                "argument zero, or for the current event record when argument "
                "zero is null. If the exact record is present and flag bit "
                "zero is clear, it sets that bit and returns one; otherwise "
                "it returns zero. The scheduler dispatch loop skips records "
                "whose low two flag bits are nonzero."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "targetArgumentKindCounts": dict(sorted(Counter(
                (
                    call["targetArgument"]["kind"]
                    if call["targetArgument"] is not None
                    else "missing"
                )
                for call in calls
            ).items())),
            "nullCurrentRecordCallCount": sum(
                call["targetArgument"] is not None
                and call["targetArgument"].get("kind") == "constant"
                and call["targetArgument"].get("value") == 0
                for call in calls
            ),
            "calls": calls,
        },
        "evidenceBoundary": [
            (
                "The semantic is the exact scheduler-record mutation, not a "
                "claim about why an authored script deactivates a coroutine."
            ),
            (
                "A null target selects the current native event record; it "
                "must not be treated as an arbitrary zero handle."
            ),
            (
                "Flag bit one also suppresses dispatch, but operation 0x0003 "
                "does not set it and this evidence does not name its purpose."
            ),
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
