#!/usr/bin/env python3
"""Prove the shared native operation routes blocking BEBF's owner program."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_CONTROL_FLOW = (
    ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/bebf-owner-operation-evidence.json"

RANGES = {
    "operation004b": (0x0C16AF2A, 18),
    "fogEnable": (0x0C0BF2B0, 44),
    "operation0073": (0x0C16B008, 16),
    "scrollGlobalControlWrite": (0x0C09B3BE, 8),
    "operation006f": (0x0C16AF3C, 204),
    "scrollModeTwoWrite": (0x0C09B3A2, 10),
    "operation00fd": (0x0C164DFC, 122),
    "faceTableIndexLookup": (0x0C142544, 108),
    "faceTableRefresh": (0x0C1425B0, 200),
    "faceActivityQuery": (0x0C0DF350, 50),
    "operation013c": (0x0C15F484, 712),
    "record52Query": (0x0C139AA2, 30),
}

BEBF_CALLS = {
    "0x4b7a6": (0x013C, [2, 3, 0x96548]),
    "0x4bf96": (0x004B, [0]),
    "0x4bfa6": (0x0073, [0]),
    "0x4bfba": (0x006F, [2, 0xFF000000]),
    "0x4c3dc": (0x00FD, [0x464E4953, 0, 0]),
    "0x4c3f4": (0x00FD, [0x464E4953, 1, 0]),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} unavailable")
    return data[offset:offset + size]


def calls(control_flow: dict[str, Any], operation_id: int) -> list[dict]:
    return [
        {
            "disc": item["disc"],
            "area": item["area"],
            "callFileOffset": operation["callFileOffset"],
            "arguments": operation.get("arguments", []),
        }
        for item in control_flow["maps"]
        for function in item["scriptedEventFunctions"]
        for operation in function["nativeOperations"]
        if operation.get("operationId") == operation_id
    ]


def build_report(executable: bytes, control_flow: dict[str, Any]) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for label, (address, size) in RANGES.items():
        sample = runtime_slice(executable, address, size)
        verified[label] = {
            "address": f"0x{address:08x}",
            "length": size,
            "sha256": digest(sample),
        }

    inventories = {}
    for operation_id in (0x004B, 0x0073, 0x006F, 0x00FD, 0x013C):
        inventory = calls(control_flow, operation_id)
        inventories[f"0x{operation_id:04x}"] = {
            "callCount": len(inventory),
            "argumentCount": dict(sorted(Counter(
                len(call["arguments"]) for call in inventory
            ).items())),
        }

    exact_calls = []
    for offset, (operation_id, expected) in BEBF_CALLS.items():
        matches = [
            call for call in calls(control_flow, operation_id)
            if call["disc"] == 1
            and call["area"] == "JOMO"
            and call["callFileOffset"] == offset
        ]
        if len(matches) != 1:
            raise ValueError(f"expected one BEBF operation at {offset}")
        actual = [argument.get("value") for argument in matches[0]["arguments"]]
        if actual != expected:
            raise ValueError(f"BEBF operation {offset} changed: {actual!r}")
        exact_calls.append({
            "callFileOffset": offset,
            "operationHex": f"0x{operation_id:04x}",
            "argumentValues": actual,
        })

    return {
        "schema": "new-yokosuka-bebf-owner-operation-evidence-v1",
        "status": "exact-shared-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": f"0x{BASE:08x}",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": ".disc-work/dialogue/scripted-event-control-flow-index.json",
        },
        "routes": {
            "0x004b": {
                "behavior": "Converts argument zero to a Boolean and passes it to the native fog enable path, whose fixed enabled dword is 0x0c20bc54.",
            },
            "0x0073": {
                "behavior": "Writes argument zero unchanged to the fixed SCRL renderer control dword at 0x0c1f7128.",
            },
            "0x006f-mode-2": {
                "behavior": "Writes one to fixed SCRL dword 0x0c1f7130 and argument one unchanged to fixed SCRL dword 0x0c1f7134.",
            },
            "0x00fd-mode-0": {
                "behavior": "Resolves the tagged object, requires MOMT and FACE, finds the FACE pointer or NULL fallback in the exact eight-entry 28-byte table, and refreshes that selected table entry. Missing prerequisites or index eight are native no-ops.",
            },
            "0x00fd-mode-1": {
                "behavior": "Resolves the tagged object, runs the native activity query, sign-extends its byte result, and returns whether it is at least one. A missing object returns zero.",
            },
            "0x013c-route-2-selector-3": {
                "behavior": "Resolves argument two through the exact 32-record table and returns whether it equals the record currently installed at fixed container dword +0x34; missing records return zero.",
            },
        },
        "bebfCalls": exact_calls,
        "allDiscInventory": inventories,
        "verifiedRanges": verified,
        "evidenceBoundary": [
            "SCRL and FACE are executable record tags, not inferred product-level names.",
            "Operation 0x00fd mode zero retains the native FACE-table refresh as a mandatory adapter; no facial expression meaning is invented.",
            "Operation 0x00fd mode one retains the native object activity query as a mandatory adapter.",
            "Only the exact routes above are promoted; other modes remain unresolved.",
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
        json.loads(args.control_flow.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: BEBF owner operation routes")


if __name__ == "__main__":
    main()
