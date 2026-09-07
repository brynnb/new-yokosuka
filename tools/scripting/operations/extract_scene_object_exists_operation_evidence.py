#!/usr/bin/env python3
"""Verify operation 0x0166 mode 1 as a scene-object existence query."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
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
    / "tools/evidence/scene-object-exists-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C167AB4
HANDLER_SAMPLE_LENGTH = 128
HANDLER_SAMPLE_SHA256 = (
    "07dc08c61bec1ab2c4e3e577e54085b79e3b9e323af4484d1f80dd2b4a7027b6"
)
MODE_ONE_ADDRESS = 0x0C167C32
MODE_ONE_LENGTH = 32
MODE_ONE_SHA256 = (
    "8af7dc03bc9cbf7c411ef321fed36ee9ff2a615d18f37318bf2db2bb1cc2d62a"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def mode_one_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 358
                        or len(action.get("arguments", [])) < 2
                        or action["arguments"][0].get("kind") != "constant"
                        or action["arguments"][0].get("value") != 1
                    ):
                        continue
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "objectArgument": action["arguments"][1],
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
        HANDLER_SAMPLE_LENGTH,
    )) != HANDLER_SAMPLE_SHA256:
        raise ValueError("operation-0x0166 handler changed")
    if sha256(runtime_slice(
        executable,
        MODE_ONE_ADDRESS,
        MODE_ONE_LENGTH,
    )) != MODE_ONE_SHA256:
        raise ValueError("operation-0x0166 mode-1 path changed")
    pointers = {
        "currentSceneOwner": u32(executable, 0x0C167CD4),
        "ownerResolve": u32(executable, 0x0C167CD8),
        "sceneObjectLookup": u32(executable, 0x0C167CDC),
        "integerResultWriter": u32(executable, 0x0C167EDC),
    }
    if pointers != {
        "currentSceneOwner": 0x0C217488,
        "ownerResolve": 0x0C09766A,
        "sceneObjectLookup": 0x0C152E54,
        "integerResultWriter": 0x0C0BB342,
    }:
        raise ValueError("operation-0x0166 mode-1 dependencies changed")

    calls = mode_one_calls(event_ir)
    if len(calls) != 1181:
        raise ValueError(
            f"expected 1181 operation-0x0166 mode-1 calls, found {len(calls)}"
        )
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue_calls) != 279:
        raise ValueError(
            "expected 279 dialogue-region operation-0x0166 mode-1 calls, "
            f"found {len(dialogue_calls)}"
        )
    return {
        "schema": "new-yokosuka-scene-object-exists-evidence-v1",
        "status": "exact-native-handler-mode-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 358,
            "operationHex": "0x0166",
            "handlerAddress": "0x0c167ab4",
            "mode": 1,
            "modePathAddress": "0x0c167c32",
            "modePathLength": MODE_ONE_LENGTH,
            "modePathSha256": MODE_ONE_SHA256,
            "currentSceneOwnerAddress": "0x0c217488",
            "ownerResolveFunction": "0x0c09766a",
            "sceneObjectLookupFunction": "0x0c152e54",
            "integerResultWriterFunction": "0x0c0bb342",
            "returnValues": [0, 1],
            "provenBehavior": (
                "Mode one resolves the current scene owner, obtains its "
                "scene-object registry, looks up argument one as an exact "
                "four-byte object tag, and writes one when the lookup returns "
                "a non-null object or zero when it returns null."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["objectArgument"]["kind"]
                for call in calls
            ).items())),
            "calls": calls,
        },
        "evidenceBoundary": [
            "Only operation 0x0166 mode 1 receives this semantic.",
            (
                "The object tag stays runtime-bound where authored code "
                "supplies it dynamically."
            ),
            (
                "Other operation-0x0166 modes remain numeric and unresolved "
                "unless separately proven."
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
        f"{report['allDiscInventory']['callCount']} mode-1 calls"
    )


if __name__ == "__main__":
    main()
