#!/usr/bin/env python3
"""Verify operation 0x019f's exact MOMT controller flag route."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-019f-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C166D7C,
        136,
        "17c539a89ef0c174660b94f8b1c0512294dd86655e7893a216477a6332b31935",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "momtControllerAccessor": (
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


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
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
                        or action.get("operationId") != 0x019F
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x019f {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29B05C),
        "actorResolver": u32(data, 0x0C166DD4),
        "momtControllerAccessor": u32(data, 0x0C166DDC),
        "currentSceneOwner": u32(data, 0x0C166DE0),
        "ownerResolver": u32(data, 0x0C166DE4),
        "sceneRegistryUnlink": u32(data, 0x0C166DE8),
        "flagMask": u32(data, 0x0C166DEC),
        "clearMask": u32(data, 0x0C166ED0),
    }
    expected = {
        "handlerTableEntry": 0x0C166D7C,
        "actorResolver": 0x0C153956,
        "momtControllerAccessor": 0x0C113A76,
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "sceneRegistryUnlink": 0x0C152E82,
        "flagMask": 0x01000000,
        "clearMask": 0xFEFFFFFF,
    }
    if dependencies != expected:
        raise ValueError("operation-0x019f native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def kinds(
    calls: list[dict[str, Any]],
    index: int,
) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index]["kind"] for call in calls
    ).items()))


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    dialogue = [call for call in authored if call["dialogue"]]
    argument_kinds = {
        "0": kinds(authored, 0),
        "1": kinds(authored, 1),
    }
    dialogue_argument_kinds = {
        "0": kinds(dialogue, 0),
        "1": kinds(dialogue, 1),
    }
    modes = Counter(call["arguments"][1].get("value") for call in authored)
    dialogue_modes = Counter(
        call["arguments"][1].get("value") for call in dialogue
    )
    if (
        len(authored) != 74
        or any(len(call["arguments"]) != 2 for call in authored)
        or len(dialogue) != 34
        or argument_kinds != {
            "0": {"constant": 72, "frame-field": 2},
            "1": {"constant": 74},
        }
        or dialogue_argument_kinds != {
            "0": {"constant": 34},
            "1": {"constant": 34},
        }
        or modes != {0: 36, 1: 38}
        or dialogue_modes != {0: 18, 1: 16}
        or any(call["resultComparison"] is not None for call in authored)
        or any(call["resultTarget"] is not None for call in authored)
    ):
        raise ValueError("operation-0x019f authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-019f-evidence-v1",
        "status": "exact-native-momt-flag-route-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x019F,
            "operationHex": "0x019f",
            "handlerAddress": "0x0c166d7c",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "recordTag": "MOMT",
            "controllerBaseOffset": "0x0014",
            "flagsOffsetFromController": "0x0004",
            "flagsOffsetFromRecord": "0x0018",
            "flagMask": "0x01000000",
            "routes": [
                {
                    "argumentOne": 0,
                    "behavior": (
                        "Clear mask 0x01000000 in MOMT record dword +0x18."
                    ),
                },
                {
                    "argumentOne": 1,
                    "behavior": (
                        "Set mask 0x01000000 in MOMT record dword +0x18."
                    ),
                },
            ],
            "missingBehavior": (
                "A missing resolved actor is a no-op. A resolved actor without "
                "a MOMT controller is passed to the exact current-scene "
                "registry unlink routine."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(authored),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in authored
            }),
            "modeCounts": {
                str(mode): count for mode, count in sorted(modes.items())
            },
            "dialogueModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_modes.items())
            },
            "argumentKindCounts": argument_kinds,
            "dialogueArgumentKindCounts": dialogue_argument_kinds,
            "resultComparisonCount": 0,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the two authored Boolean routes are promoted; no other argument-one values are admitted.",
            "The literal MOMT tag, controller base +0x14, raw flags dword +0x18, and mask 0x01000000 are executable-proven.",
            "The consumer-side meaning of bit 24 remains unknown.",
            "The no-controller scene-registry unlink remains an exact runtime adapter rather than an inferred ownership rule.",
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
