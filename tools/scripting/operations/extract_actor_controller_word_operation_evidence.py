#!/usr/bin/env python3
"""Verify the exact 0x009c/0x009d MOTM controller contracts."""

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
    / "tools/evidence/actor-controller-word-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "wordWriteHandler": (
        0x0C16602E,
        74,
        "da0bd82b9f1d73b6aa1bc1f5a15bd54a6f4a55892fb93293b7d50ba709f83d1e",
    ),
    "modeControlHandler": (
        0x0C166078,
        208,
        "29664bbbd2efe1402c4b6b11ec572b6e7fc827efe718c38dedc0b7e6cc120075",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "motmControllerAccessor": (
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


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int,
) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
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


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"MOTM controller operation {name} changed")
    literals = {
        "actorResolver": u32(executable, 0x0C1660D4),
        "motmControllerAccessor": u32(executable, 0x0C1660D8),
        "currentSceneOwner": u32(executable, 0x0C1660DC),
        "ownerResolver": u32(executable, 0x0C1660E0),
        "sceneRegistryUnlink": u32(executable, 0x0C1660E4),
    }
    if literals != {
        "actorResolver": 0x0C153956,
        "motmControllerAccessor": 0x0C113A76,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "sceneRegistryUnlink": 0x0C152E82,
    }:
        raise ValueError("MOTM controller dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def kind_counts(
    calls: list[dict[str, Any]],
    index: int,
) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index]["kind"] for call in calls
    ).items()))


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir, 0x009C)
    if len(calls) != 631 or any(len(call["arguments"]) != 2 for call in calls):
        raise ValueError("operation-0x009c authored inventory changed")
    argument_kinds = {
        "0": kind_counts(calls, 0),
        "1": kind_counts(calls, 1),
    }
    if argument_kinds != {
        "0": {
            "constant": 373,
            "frame-field": 170,
            "runtime": 80,
            "scene-field": 8,
        },
        "1": {"constant": 627, "frame-field": 4},
    }:
        raise ValueError("operation-0x009c argument bindings changed")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    dialogue_kinds = {
        "0": kind_counts(dialogue_calls, 0),
        "1": kind_counts(dialogue_calls, 1),
    }
    if dialogue_kinds != {
        "0": {"constant": 39, "frame-field": 38, "scene-field": 3},
        "1": {"constant": 80},
    }:
        raise ValueError("operation-0x009c dialogue bindings changed")
    mode_calls = operation_calls(event_ir, 0x009D)
    if (
        len(mode_calls) != 351
        or any(len(call["arguments"]) != 2 for call in mode_calls)
    ):
        raise ValueError("operation-0x009d authored inventory changed")
    mode_argument_kinds = {
        "0": kind_counts(mode_calls, 0),
        "1": kind_counts(mode_calls, 1),
    }
    if mode_argument_kinds != {
        "0": {"constant": 313, "frame-field": 38},
        "1": {"constant": 351},
    }:
        raise ValueError("operation-0x009d argument bindings changed")
    mode_values = dict(sorted(Counter(
        call["arguments"][1]["value"] for call in mode_calls
    ).items()))
    if mode_values != {
        0: 64,
        1: 4,
        2: 3,
        3: 5,
        0xFFFFFFFF: 275,
    }:
        raise ValueError("operation-0x009d authored modes changed")
    mode_dialogue_calls = [
        call for call in mode_calls if call["dialogueRegion"]
    ]
    if (
        len(mode_dialogue_calls) != 1
        or mode_dialogue_calls[0]["disc"] != 1
        or mode_dialogue_calls[0]["area"] != "JHD0"
        or mode_dialogue_calls[0]["arguments"][0].get("ascii") != "FUKU"
        or mode_dialogue_calls[0]["arguments"][1].get("value") != 0xFFFFFFFF
    ):
        raise ValueError("operation-0x009d dialogue call changed")
    return {
        "schema": "new-yokosuka-actor-controller-word-evidence-v2",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x009C,
            "operationHex": "0x009c",
            "handlerAddress": "0x0c16602e",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "controllerRecordTag": "MOTM",
            "controllerWordOffset": "0x007c",
            "controllerWordWidth": 2,
            "provenBehavior": (
                "Resolves argument zero as an actor. A missing actor is a "
                "no-op. When the actor has a MOTM controller, the handler "
                "writes argument one's low word to controller offset +0x7c. "
                "When the actor exists without that controller, the handler "
                "calls the exact current-scene registry unlink routine for "
                "the resolved actor."
            ),
        },
        "modeControlOperation": {
            "operationId": 0x009D,
            "operationHex": "0x009d",
            "handlerAddress": "0x0c166078",
            "controllerRecordTag": "MOTM",
            "controllerFlagMask": "0x00004000",
            "modeDwordOffset": "0x01cc",
            "resetWordOffsets": ["0x0086", "0x0090", "0x009a"],
            "authoredModes": {
                "0xffffffff": {
                    "flag4000": False,
                    "dword1cc": 0,
                    "word86": 0,
                    "word90": 0,
                    "word9a": 0,
                },
                "0": {"flag4000": True, "dword1cc": 3},
                "1": {"flag4000": True, "dword1cc": 7},
                "2": {"flag4000": True, "dword1cc": 0},
                "3": {"flag4000": True, "dword1cc": 5},
            },
            "provenBehavior": (
                "Resolves argument zero as an actor and then its MOTM "
                "controller. A missing actor is a no-op. A resolved actor "
                "without MOTM follows the exact current-scene registry "
                "unlink path. Modes zero through three set controller flag "
                "0x4000 and write 3, 7, 0, or 5 respectively to dword "
                "+0x1cc. Authored mode 0xffffffff clears that flag and "
                "zeroes dword +0x1cc plus words +0x86, +0x90, and +0x9a."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "argumentKindCounts": argument_kinds,
            "dialogueArgumentKindCounts": dialogue_kinds,
        },
        "modeControlAllDiscInventory": {
            "authoredCallCount": len(mode_calls),
            "provenCallCount": len(mode_calls),
            "dialogueRegionCallCount": len(mode_dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"]) for call in mode_calls
            }),
            "argumentKindCounts": mode_argument_kinds,
            "modeValueCounts": {
                f"0x{value:08x}": count
                for value, count in mode_values.items()
            },
        },
        "evidenceBoundary": [
            "The MOTM tag and numeric controller offset remain low-level native identities.",
            "The meaning of controller word +0x7c is not inferred from its authored values.",
            "The no-controller registry unlink remains an explicit runtime adapter call.",
            "No gameplay name or purpose is assigned to the 0x009d mode values.",
            "Runtime, frame-field, and scene-field actor bindings remain unresolved until their exact execution context supplies them.",
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
        f"{report['allDiscInventory']['provenCallCount']} word writes and "
        f"{report['modeControlAllDiscInventory']['provenCallCount']} "
        "mode controls proven"
    )


if __name__ == "__main__":
    main()
