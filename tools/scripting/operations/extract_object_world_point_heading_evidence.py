#!/usr/bin/env python3
"""Verify operation 0x001e's object-to-world-point heading write."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_CONTROL_FLOW = (
    PROJECT_ROOT
    / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/object-world-point-heading-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
VERIFIED_RANGES = {
    "handler": (
        0x0C1578A4,
        120,
        "83934bbed5ea0da2f8542b5172931f425dd67b512b4a4f85b46d5605a2e2f0be",
    ),
    "directPositionRead": (
        0x0C0AAF10,
        34,
        "22d8140a65dbecc460bbb085d7f76322fdc8afdbe5de5c7402f8836eb976433f",
    ),
    "binaryAngle": (
        0x0C0915E0,
        132,
        "2f025d2a26785ea167b85eefbec9494a2b487c15d337703c4fa74e52ba90c350",
    ),
    "secondaryVectorOperation": (
        0x0C15791C,
        280,
        "0fca4408a6463fa75c3447c507b2345a00bea5cdfc36141999c8d5aec090a306",
    ),
    "directSecondaryRead": (
        0x0C0AAF80,
        20,
        "d652081dec5df7f6feec12e7e2c99317606041449350cd17096c5a67e674a006",
    ),
    "directSecondaryWrite": (
        0x0C0AAF62,
        20,
        "d92cfde68acff87673fc3751c66aa211f6e89ecfb863cc5ab48a7f6ba8c04a54",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def operation_calls(control_flow: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in control_flow["maps"]:
        for function in item["scriptedEventFunctions"]:
            for operation in function["nativeOperations"]:
                if operation["operationId"] != 30:
                    continue
                calls.append({
                    "disc": item["disc"],
                    "area": item["area"],
                    "functionFileOffset": function["fileOffset"],
                    "callFileOffset": operation["callFileOffset"],
                    "arguments": operation["arguments"],
                })
    return calls


def build_report(
    executable: bytes,
    control_flow: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, length, expected_hash) in VERIFIED_RANGES.items():
        actual_hash = sha256(runtime_slice(executable, address, length))
        if actual_hash != expected_hash:
            raise ValueError(f"operation-0x001e {name} changed")
        verified[name] = {
            "address": f"0x{address:08x}",
            "length": length,
            "sha256": actual_hash,
        }

    calls = operation_calls(control_flow)
    if len(calls) != 58:
        raise ValueError(f"expected 58 operation-0x001e calls, found {len(calls)}")
    for call in calls:
        arguments = call["arguments"]
        if len(arguments) != 4:
            raise ValueError(f"{call['callFileOffset']}: unexpected argument count")
        if (
            arguments[1].get("kind") != "constant"
            or arguments[1].get("value") != 0x38000000
            or arguments[3].get("kind") != "constant"
            or arguments[3].get("value") != 0
        ):
            raise ValueError(f"{call['callFileOffset']}: unproved authored form")
        if arguments[2].get("kind") not in {
            "frame-address", "scene-address", "static-pointer",
        }:
            raise ValueError(f"{call['callFileOffset']}: unsupported target form")

    cata = next(
        call for call in calls
        if call["disc"] == 1
        and call["area"] == "JU00"
        and call["functionFileOffset"] == "0x2becc"
        and call["callFileOffset"] == "0x2bf3a"
    )
    if [
        cata["arguments"][0].get("ascii"),
        cata["arguments"][2].get("kind"),
        cata["arguments"][2].get("offset"),
    ] != ["AKIR", "frame-address", 12]:
        raise ValueError("CATA operation-0x001e call changed")

    return {
        "schema": "new-yokosuka-object-world-point-heading-evidence-v1",
        "status": "exact-handler-accessors-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": (
                ".disc-work/dialogue/scripted-event-control-flow-index.json"
            ),
        },
        "operation": {
            "operationId": 30,
            "operationHex": "0x001e",
            "handlerAddress": "0x0c1578a4",
            "operationResultWriterAddress": "0x0c0bb342",
            "operationResult": 0,
            "verifiedRanges": verified,
            "argumentCount": 4,
            "authoredFlags": "0x38000000",
            "authoredAuxiliaryWord": 0,
            "directPositionOffsets": ["+0x08", "+0x0c", "+0x10"],
            "directSecondaryOffsets": ["+0x14", "+0x18", "+0x1c"],
            "provenBehavior": (
                "Resolves argument zero, reads its direct position, subtracts "
                "that X/Z position from argument two's world point, computes "
                "the native low-16-bit binary heading, and invokes the shared "
                "operation-0x001d vector helper with [0, heading, 0]. Every "
                "authored call replaces all three direct secondary-vector "
                "components through flags 0x38000000 and reports result zero."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "discCounts": dict(sorted(Counter(
                str(call["disc"]) for call in calls
            ).items())),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "targetKindCounts": dict(sorted(Counter(
                call["arguments"][2]["kind"] for call in calls
            ).items())),
            "calls": calls,
        },
        "cataDirectEntry": cata,
        "evidenceBoundary": [
            (
                "The object resolver, direct position accessors, float32 X/Z "
                "subtraction, native binary-angle helper, zeroed X/Z output, "
                "and direct secondary-vector reconciliation are executable-proven."
            ),
            (
                "All 58 recovered authored calls use the same full direct "
                "replacement form; no other flags or auxiliary form receives "
                "this semantic adapter."
            ),
            (
                "This report names the two distinct accessor families but does "
                "not assign broader engine-wide meaning to secondary vectors."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument(
        "--control-flow", type=Path, default=DEFAULT_CONTROL_FLOW,
    )
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.control_flow.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: {report['allDiscInventory']['callCount']} calls")


if __name__ == "__main__":
    main()
