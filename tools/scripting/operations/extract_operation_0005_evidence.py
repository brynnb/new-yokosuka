#!/usr/bin/env python3
"""Prove operation 0x0005's current-presentation-owner installation."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
OUTPUT = ROOT / "tools/evidence/operation-0005-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER = (0x0C141BEC, 64, "685c393be9d945a10d461707100a43aa0b01de268d7bd12f6891b5f88c56b3e3")
INSTALLER = (0x0C0F0CD8, 52, "23b9d024f05704b0357a1c30f4fe99cc97cbad973669256dd1311188ca4fae94")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def chunk(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def build(executable: bytes, event_ir: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for label, (address, size, expected) in {
        "operationHandler": HANDLER,
        "currentOwnerInstaller": INSTALLER,
    }.items():
        actual = digest(chunk(executable, address, size))
        if actual != expected:
            raise ValueError(f"operation 0x0005 {label} changed: {actual}")

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 5
                    ):
                        calls.append((source_map, function, action))
    if len(calls) != 138 or any(len(action[2]["arguments"]) != 1 for action in calls):
        raise ValueError("operation 0x0005 authored inventory changed")

    kinds = Counter(action[2]["arguments"][0]["kind"] for action in calls)
    op02 = [
        {
            "functionFileOffset": function["id"],
            "callFileOffset": action["callFileOffset"],
            "argument": action["arguments"][0],
        }
        for source_map, function, action in calls
        if source_map["disc"] == 1 and source_map["area"] == "OP02"
    ]
    if op02 != [{
        "functionFileOffset": "0x23c8",
        "callFileOffset": "0x2410",
        "argument": {
            "kind": "frame-field",
            "source": "@(12,r14) at 0x2406",
            "offset": 12,
        },
    }]:
        raise ValueError("OP02 operation 0x0005 route changed")

    return {
        "schema": "new-yokosuka-operation-0005-evidence-v1",
        "status": "exact-handler-current-presentation-owner-install",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 5,
            "operationHex": "0x0005",
            "argumentCount": 1,
            "handlerAddress": "0x0c141bec",
            "objectResolver": "0x0c153956",
            "primaryRuntimeReset": "0x0c0a6a06",
            "currentOwnerInstaller": "0x0c0f0cd8",
            "notificationTag": "CPCT",
            "resultWriter": "0x0c0bb342",
            "result": 1,
            "provenBehavior": (
                "Resolves the sole operand through the shared object resolver, "
                "resets the primary runtime, installs the resolved object (or "
                "null) in the engine current-presentation-owner cell with the "
                "CPCT notification, and writes integer result one."
            ),
        },
        "inventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(item[0]["disc"], item[0]["area"]) for item in calls}),
            "argumentKinds": dict(sorted(kinds.items())),
            "op02Calls": op02,
        },
        "verifiedNativeRanges": {
            "operationHandler": {
                "address": f"0x{HANDLER[0]:08x}",
                "size": HANDLER[1],
                "sha256": HANDLER[2],
            },
            "currentOwnerInstaller": {
                "address": f"0x{INSTALLER[0]:08x}",
                "size": INSTALLER[1],
                "sha256": INSTALLER[2],
            },
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=EVENT_IR)
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args()
    report = build(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: {report['inventory']['authoredCallCount']} proven calls")


if __name__ == "__main__":
    main()
