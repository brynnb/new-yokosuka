#!/usr/bin/env python3
"""Verify operation 0x002a's exact mode-zero actor/MOMT offset path."""

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
    / "tools/evidence/actor-momt-scaled-offset-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "modeZeroHandler": (
        0x0C165CD4,
        336,
        "1b2ab7318a65522961ca7cc27446cefd675631044afb9085d280d9de149132bf",
    ),
    "actorResolverSample": (
        0x0C153956,
        64,
        "46e00fc5aa0eb86845d366f0eac4ad78ef1124d2aff4f210e8728b7f1d79e3cd",
    ),
    "momtAccessor": (
        0x0C113A76,
        30,
        "69d657beb0f052b69809a44353767e8d1d78164f4255489734802b15c7027f35",
    ),
    "momtVectorReader": (
        0x0C1144F6,
        24,
        "af76dfdb72fe4a84ad12c0ff76c1b702d0b4f75140ab31f96e0f569e2297bd43",
    ),
    "actorPositionOffset": (
        0x0C0AB186,
        86,
        "348c6d88a42e9188f06c238d5fb79f445d1b25efcf9e0f57d09986de45cf7411",
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x002A
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
        for index in range(3)
    }


def mode_calls(
    calls: list[dict[str, Any]],
    mode: int,
) -> list[dict[str, Any]]:
    return [
        call for call in calls
        if call["arguments"][2].get("kind") == "constant"
        and call["arguments"][2].get("value") == mode
    ]


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x002a {name} changed")
    literals = {
        "defaultVector": u32(executable, 0x0C165F5C),
        "actorResolver": u32(executable, 0x0C165F60),
        "momtAccessor": u32(executable, 0x0C165F64),
        "currentSceneOwner": u32(executable, 0x0C165F68),
        "ownerResolver": u32(executable, 0x0C165F6C),
        "sceneRegistryUnlink": u32(executable, 0x0C165F70),
        "momtVectorReader": u32(executable, 0x0C165F74),
        "actorPositionOffset": u32(executable, 0x0C165F90),
    }
    if literals != {
        "defaultVector": 0x0C279660,
        "actorResolver": 0x0C153956,
        "momtAccessor": 0x0C113A76,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "sceneRegistryUnlink": 0x0C152E82,
        "momtVectorReader": 0x0C1144F6,
        "actorPositionOffset": 0x0C0AB186,
    }:
        raise ValueError("operation-0x002a dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    mode_zero = mode_calls(calls, 0)
    mode_one = mode_calls(calls, 1)
    if (
        len(calls) != 112
        or len(dialogue_calls) != 57
        or len(mode_zero) != 99
        or len(mode_one) != 13
        or any(len(call["arguments"]) != 3 for call in calls)
        or any(call["arguments"][2].get("value") != 0 for call in dialogue_calls)
        or argument_kinds(calls) != {
            "0": {"constant": 74, "frame-field": 34, "runtime": 4},
            "1": {"frame-field": 2, "runtime": 7, "static-pointer": 103},
            "2": {"constant": 112},
        }
        or argument_kinds(mode_zero) != {
            "0": {"constant": 63, "frame-field": 32, "runtime": 4},
            "1": {"runtime": 2, "static-pointer": 97},
            "2": {"constant": 99},
        }
        or argument_kinds(dialogue_calls) != {
            "0": {"constant": 41, "frame-field": 12, "runtime": 4},
            "1": {"runtime": 2, "static-pointer": 55},
            "2": {"constant": 57},
        }
    ):
        raise ValueError("operation-0x002a authored inventory changed")
    return {
        "schema": "new-yokosuka-actor-momt-scaled-offset-evidence-v1",
        "status": "exact-mode-zero-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x002A,
            "operationHex": "0x002a",
            "argumentCount": 3,
            "handlerAddress": "0x0c165cd4",
            "provenMode": 0,
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
            "momtScaleWordOffsets": ["record+0x0194", "record+0x0198", "record+0x019c"],
            "actorPositionWordOffsets": ["actor+0x40", "actor+0x44", "actor+0x48"],
            "provenBehavior": (
                "Mode zero resolves argument zero as an actor and obtains its "
                "associated MOMT record. It reads the three raw MOMT float "
                "words at record offsets +0x0194/+0x0198/+0x019c, multiplies "
                "them componentwise in float32 by the three raw float words "
                "at argument one's pointer, optionally applies the actor's "
                "native parent transform, and float32-adds the result to actor "
                "position words +0x40/+0x44/+0x48. A missing actor is a no-op; "
                "a resolved actor without MOMT takes the exact current-scene "
                "registry unlink path. Both early exits occur before argument "
                "one is dereferenced."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(mode_zero),
            "unresolvedModeOneCallCount": len(mode_one),
            "dialogueRegionCallCount": len(dialogue_calls),
            "provenDialogueRegionCallCount": len([
                call for call in mode_zero if call["dialogueRegion"]
            ]),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "provenAreaCount": len({
                (call["disc"], call["area"]) for call in mode_zero
            }),
            "argumentKindCounts": argument_kinds(calls),
            "provenArgumentKindCounts": argument_kinds(mode_zero),
            "dialogueArgumentKindCounts": argument_kinds(dialogue_calls),
        },
        "evidenceBoundary": [
            "Only exact selector zero is promoted; the 13 selector-one calls remain unresolved.",
            "MOMT and all field offsets retain their native low-level identities.",
            "The optional parent-space transform remains an explicit injected adapter.",
            "Actor/MOMT availability and pointer reads remain ordered native prerequisites.",
            "No spatial intent, persistence owner, or flattened gameplay effect is inferred.",
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
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
