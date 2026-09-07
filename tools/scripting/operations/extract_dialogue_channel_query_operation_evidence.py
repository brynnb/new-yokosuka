#!/usr/bin/env python3
"""Verify operation 0x00b2 as an optional-handle dialogue activity query."""

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
    / "tools/evidence/dialogue-channel-query-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C16B2BA
HANDLER_LENGTH = 28
HANDLER_SHA256 = (
    "cb976b35d0abe263e721d794ca02bab8f5e0009524a48fce854778059cba3451"
)
QUERY_ADDRESS = 0x0C0B4774
QUERY_LENGTH = 42
QUERY_SHA256 = (
    "339e864e6ba31a5a17e8b5b6d093f5972d550c89b479f73c4a3999b68f270558"
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 178
                    ):
                        continue
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "previousAdapterStatus": action.get("adapterStatus"),
                        "handleArgument": (
                            action["arguments"][0]
                            if action.get("arguments")
                            else {"kind": "missing"}
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
        raise ValueError("operation-0x00b2 handler changed")
    if sha256(runtime_slice(
        executable,
        QUERY_ADDRESS,
        QUERY_LENGTH,
    )) != QUERY_SHA256:
        raise ValueError("dialogue-channel query changed")
    if u32(executable, 0x0C16B438) != QUERY_ADDRESS:
        raise ValueError("operation-0x00b2 query target changed")
    if u32(executable, 0x0C0B481C) != 0x0C286130:
        raise ValueError("dialogue-channel registry pointer changed")

    calls = operation_calls(event_ir)
    if len(calls) != 10322:
        raise ValueError(
            f"expected 10322 operation-0x00b2 calls, found {len(calls)}"
        )
    dialogue_calls = [
        call
        for call in calls
        if call["dialogueRegion"]
    ]
    if len(dialogue_calls) != 10196:
        raise ValueError(
            "expected 10196 dialogue-region operation-0x00b2 calls, "
            f"found {len(dialogue_calls)}"
        )
    previously_unresolved_dialogue_calls = [
        call
        for call in dialogue_calls
        if call["previousAdapterStatus"] != "proven"
    ]
    if len(previously_unresolved_dialogue_calls) != 8580:
        raise ValueError(
            "expected 8580 previously unresolved dialogue-region "
            "operation-0x00b2 calls, found "
            f"{len(previously_unresolved_dialogue_calls)}"
        )
    return {
        "schema": "new-yokosuka-dialogue-channel-query-evidence-v1",
        "status": "exact-native-handler-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 178,
            "operationHex": "0x00b2",
            "handlerAddress": "0x0c16b2ba",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "queryFunction": "0x0c0b4774",
            "queryFunctionLength": QUERY_LENGTH,
            "queryFunctionSha256": QUERY_SHA256,
            "dialogueChannelRegistryPointer": "0x0c286130",
            "provenBehavior": (
                "Dereferences argument zero as an optional dialogue-channel "
                "handle and forwards it to the shared activity query. A "
                "non-null handle returns whether that exact channel's +0x04 "
                "active field is nonzero. A null handle checks the +0x04 "
                "active field of both 52-byte global channel records and "
                "returns one if either is active, otherwise zero."
            ),
            "returnValues": [0, 1],
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "previouslyUnresolvedDialogueRegionCallCount": (
                len(previously_unresolved_dialogue_calls)
            ),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": dict(sorted(Counter(
                call["handleArgument"]["kind"]
                for call in calls
            ).items())),
            "dialogueArgumentKindCounts": dict(sorted(Counter(
                call["handleArgument"]["kind"]
                for call in dialogue_calls
            ).items())),
            "calls": calls,
        },
        "evidenceBoundary": [
            (
                "The runtime-bound argument is preserved as an optional "
                "native channel handle; it is not guessed to be zero."
            ),
            (
                "The query's exact active-field contract is proven. Playback "
                "timing and browser channel ownership remain runtime concerns."
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
