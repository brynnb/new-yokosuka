#!/usr/bin/env python3
"""Verify operation 0x002b's exact actor MOMT numeric query."""

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
    PROJECT_ROOT / "tools/evidence/actor-momt-numeric-query-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C165E48,
        98,
        "a421b9b481b7889d090110fa2d1636b34e2edf9b0c1182dec2d92875199256f4",
    ),
    "numericHelper": (
        0x0C114578,
        134,
        "d53a1dfc4da5a87f39226728826a5dfbffa14c67b41789d9b7b19d398e01ba93",
    ),
    "signedRemainder": (
        0x0C1DC440,
        198,
        "76dd71db7d1b54a272ad18ea0a917a8b548a21d5f48240c712e11348ac0cdd37",
    ),
    "signedQuotient": (
        0x0C1DC294,
        172,
        "de9f7407ff3561b31ea617fce63cab5ebfda7419f1dd6e204eb9cc90de01c570",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", runtime_slice(data, address, 2))[0]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def f32(data: bytes, address: int) -> float:
    return struct.unpack("<f", runtime_slice(data, address, 4))[0]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x002B
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def kind_counts(calls: list[dict[str, Any]]) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][0]["kind"] for call in calls
    ).items()))


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x002b {name} changed")
    literals = {
        "actorResolver": u32(executable, 0x0C165F60),
        "momtAccessor": u32(executable, 0x0C165F64),
        "currentSceneOwner": u32(executable, 0x0C165F68),
        "ownerResolver": u32(executable, 0x0C165F6C),
        "sceneRegistryUnlink": u32(executable, 0x0C165F70),
        "resultWriter": u32(executable, 0x0C165F98),
        "numericHelper": u32(executable, 0x0C165F9C),
        "globalDword": u32(executable, 0x0C11469C),
        "signedRemainder": u32(executable, 0x0C1146AC),
        "signedQuotient": u32(executable, 0x0C1146B4),
    }
    if literals != {
        "actorResolver": 0x0C153956,
        "momtAccessor": 0x0C113A76,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "sceneRegistryUnlink": 0x0C152E82,
        "resultWriter": 0x0C0BB348,
        "numericHelper": 0x0C114578,
        "globalDword": 0x0C20C48C,
        "signedRemainder": 0x0C1DC440,
        "signedQuotient": 0x0C1DC294,
    }:
        raise ValueError("operation-0x002b dependencies changed")
    if {
        "baseOffset": u16(executable, 0x0C114694),
        "controlOffset": u16(executable, 0x0C114696),
    } != {"baseOffset": 0x00F0, "controlOffset": 0x00DC}:
        raise ValueError("operation-0x002b MOMT offsets changed")
    constants = {
        "lowerExclusive": f32(executable, 0x0C1146A0),
        "upperExclusive": f32(executable, 0x0C1146A4),
        "hundred": f32(executable, 0x0C1146A8),
        "hundredth": f32(executable, 0x0C1146B0),
        "threeSixteenths": f32(executable, 0x0C1146B8),
    }
    if constants != {
        "lowerExclusive": 0.9899999499320984,
        "upperExclusive": 1.0099999904632568,
        "hundred": 100.0,
        "hundredth": 0.009999999776482582,
        "threeSixteenths": 0.1875,
    }:
        raise ValueError("operation-0x002b float constants changed")
    return {
        "dependencies": {
            name: f"0x{value:08x}" for name, value in literals.items()
        },
        "constants": constants,
    }


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if (
        len(calls) != 622
        or len(dialogue_calls) != 66
        or any(len(call["arguments"]) != 1 for call in calls)
        or kind_counts(calls) != {
            "constant": 244,
            "frame-field": 206,
            "runtime": 171,
            "scene-field": 1,
        }
        or kind_counts(dialogue_calls) != {
            "constant": 48,
            "frame-field": 12,
            "runtime": 6,
        }
    ):
        raise ValueError("operation-0x002b authored inventory changed")
    return {
        "schema": "new-yokosuka-actor-momt-numeric-query-evidence-v1",
        "status": "exact-native-handler-helper-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x002B,
            "operationHex": "0x002b",
            "argumentCount": 1,
            "handlerAddress": "0x0c165e48",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": contract,
            "recordTag": "MOMT",
            "recordFloatWordOffsets": {
                "base": "0x00f0",
                "control": "0x00dc",
            },
            "provenBehavior": (
                "Returns float-word zero for a missing actor and also unlinks "
                "a resolved actor without MOMT. With MOMT, it reads record "
                "+0x00f0 as the base and +0x00dc as control. Negative global "
                "state or global state one returns the base on their exact "
                "branches. Control strictly between the native 0.99 and 1.01 "
                "float constants applies the exact FTRC, signed remainder by "
                "100, signed quotient by 10, and parity rounding path. Other "
                "control values subtract control * multiplier * 0.1875, with "
                "the multiplier derived exactly from the global dword."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": kind_counts(calls),
            "dialogueArgumentKindCounts": kind_counts(dialogue_calls),
        },
        "evidenceBoundary": [
            "MOMT and all numeric fields remain low-level native identities.",
            "The query is not labelled speed, distance, duration, or animation state.",
            "Unsupported SH-4 FTRC inputs remain explicit runtime stops.",
            "Unestablished actor, MOMT, or global state remains an interpreter stop.",
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
        json.loads(args.event_ir.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {report['allDiscInventory']['provenCallCount']} proven calls")


if __name__ == "__main__":
    main()
