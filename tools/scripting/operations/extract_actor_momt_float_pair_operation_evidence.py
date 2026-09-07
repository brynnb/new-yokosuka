#!/usr/bin/env python3
"""Verify operation 0x004e's exact actor MOMT float-pair write."""

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
    PROJECT_ROOT / "tools/evidence/actor-momt-float-pair-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C165A60,
        80,
        "6ad42809853e3e48fbd26aec0c4ccb1c1823597f51b64e38c1deb47b6276ede1",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "momtAccessor": (
        0x0C113A76,
        30,
        "69d657beb0f052b69809a44353767e8d1d78164f4255489734802b15c7027f35",
    ),
    "sceneRegistryUnlink": (
        0x0C152E82,
        92,
        "376a15375677a80e98e63068037825507f4ef8c7f750fda9d1c57189ccb7f39b",
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x004E
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x004e {name} changed")
    literals = {
        "actorResolver": u32(executable, 0x0C165B74),
        "momtAccessor": u32(executable, 0x0C165B78),
        "currentSceneOwner": u32(executable, 0x0C165B7C),
        "ownerResolver": u32(executable, 0x0C165B80),
        "sceneRegistryUnlink": u32(executable, 0x0C165B84),
    }
    if literals != {
        "actorResolver": 0x0C153956,
        "momtAccessor": 0x0C113A76,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "sceneRegistryUnlink": 0x0C152E82,
    } or u16(executable, 0x0C165B6E) != 0x00DC:
        raise ValueError("operation-0x004e dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    kinds = argument_kinds(calls)
    dialogue_kinds = argument_kinds(dialogue_calls)
    if (
        len(calls) != 701
        or len(dialogue_calls) != 67
        or any(len(call["arguments"]) != 2 for call in calls)
        or kinds != {
            "0": {
                "constant": 238,
                "frame-field": 235,
                "runtime": 226,
                "scene-field": 2,
            },
            "1": {"constant": 667, "frame-field": 31, "scene-field": 3},
        }
        or dialogue_kinds != {
            "0": {"constant": 32, "frame-field": 27, "runtime": 8},
            "1": {"constant": 67},
        }
    ):
        raise ValueError("operation-0x004e authored inventory changed")
    return {
        "schema": "new-yokosuka-actor-momt-float-pair-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x004E,
            "operationHex": "0x004e",
            "argumentCount": 2,
            "handlerAddress": "0x0c165a60",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "recordTag": "MOMT",
            "floatWordOffsets": ["0x00f0", "0x0128"],
            "provenBehavior": (
                "Resolves argument zero as an actor and its associated MOMT "
                "record. A present record receives argument one's exact "
                "32-bit float word at offsets +0x00f0 and +0x0128. A missing "
                "actor is a no-op; a resolved actor without MOMT is passed to "
                "the exact current-scene registry unlink routine."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": kinds,
            "dialogueArgumentKindCounts": dialogue_kinds,
        },
        "evidenceBoundary": [
            "MOMT remains an exact native record tag.",
            "The two float fields and their authored values retain numeric low-level identities.",
            "The no-MOMT registry unlink remains an explicit runtime adapter call.",
            "Unestablished actor or MOMT availability remains an interpreter stop.",
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
