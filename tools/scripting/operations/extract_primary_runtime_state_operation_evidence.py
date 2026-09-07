#!/usr/bin/env python3
"""Verify operation-0x002d's exact primary-runtime modes and authored use."""

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
DEFAULT_MAPINFO = (
    PROJECT_ROOT / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
)
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/primary-runtime-state-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)


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
                        or action.get("operationId") != 0x002D
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


def selector(call: dict[str, Any]) -> int | None:
    if not call["arguments"]:
        return None
    argument = call["arguments"][0]
    return (
        argument.get("value")
        if argument.get("kind") == "constant"
        else None
    )


def build_report(
    executable: bytes,
    mapinfo: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected D000 MAPINFO.BIN")

    ranges = {
        "handler": runtime_slice(executable, 0x0C168D40, 396),
        "mode0": runtime_slice(executable, 0x0C0A6A06, 20),
        "mode1": runtime_slice(executable, 0x0C0A69F2, 20),
        "mode2": runtime_slice(executable, 0x0C0A6A80, 62),
        "mode8": runtime_slice(executable, 0x0C0A954A, 26),
        "preludeCall": mapinfo[0x7F8B0:0x7F8C4],
        "cleanupCall": mapinfo[0x8013A:0x8014E],
    }
    expected = {
        "handler": "a7b3813e3e4dd1dafcbe997745f41c838de2b058ce0522deecccd9143124efa8",
        "mode0": "c0bd937674bde0a3a602d8e2e0730ce6b2bfb0fb56c2478cf2aa5c1ef3e761eb",
        "mode1": "e93aea292f06caa421f692013ffd1f083b1be2411da727020188c574acf90462",
        "mode2": "b6dbb99a2576fb2c36b06fcfa53e972e8b413e538f121e85e29f8a6cb07de03b",
        "mode8": "b2682c3a6be75565c6f5f750b9ad36272b2125d226ff2a566d8413e16f3e2835",
        "preludeCall": "42bb07b48b78a3ec0ab01ffacd8d73d11bf4d6be8a4195bd515031d133b65bcd",
        "cleanupCall": "978ae32384a32717317d8d433b19d58c908ef5fde6ffb1440bf2921459eee498",
    }
    actual = {name: sha256(data) for name, data in ranges.items()}
    if actual != expected:
        raise ValueError(f"verified code ranges changed: {actual}")

    if u32(executable, 0x0C168FF8) != 0x0C0A6A06:
        raise ValueError("operation-0x002d mode 0 target changed")
    if u32(executable, 0x0C168FFC) != 0x0C0A69F2:
        raise ValueError("operation-0x002d mode 1 target changed")
    if u32(executable, 0x0C169000) != 0x0C0A6A80:
        raise ValueError("operation-0x002d mode 2 target changed")
    if u32(executable, 0x0C169014) != 0x0C0A954A:
        raise ValueError("operation-0x002d mode 8 target changed")
    if u32(executable, 0x0C0A6A74) != 0x0C281AF8:
        raise ValueError("shared runtime-object pointer changed")
    if u16(executable, 0x0C0A6A26) != 0x01F8:
        raise ValueError("shared runtime-object state offset changed")
    if u32(executable, 0x0C0A6A78) != 0x0C0A563C:
        raise ValueError("mode-1 transition callback changed")
    if u32(executable, 0x0C0A6A7C) != 0x0C281B02:
        raise ValueError("mode-0 byte-state address changed")
    mode2_dependencies = {
        "currentSceneOwner": u32(executable, 0x0C0A6B5C),
        "ownerResolver": u32(executable, 0x0C0A6B60),
        "primaryRuntimePointer": u32(executable, 0x0C0A6B64),
        "gateByte": u32(executable, 0x0C0A6B68),
        "stateOffset": u16(executable, 0x0C0A6B54),
    }
    if mode2_dependencies != {
        "currentSceneOwner": 0x0C217488,
        "ownerResolver": 0x0C09766A,
        "primaryRuntimePointer": 0x0C281AF8,
        "gateByte": 0x0C281B01,
        "stateOffset": 0x01F8,
    }:
        raise ValueError("mode-2 query dependencies changed")
    mode8_dependencies = {
        "primaryRuntimePointer": u32(executable, 0x0C0A9620),
        "statusOffset": u16(executable, 0x0C0A9606),
    }
    if mode8_dependencies != {
        "primaryRuntimePointer": 0x0C281AF8,
        "statusOffset": 0x01D9,
    }:
        raise ValueError("mode-8 query dependencies changed")
    extended_dependencies = {
        "mode7": u32(executable, 0x0C169010),
        "mode9": u32(executable, 0x0C169018),
        "mode11": u32(executable, 0x0C169020),
        "mode12WhenOne": u32(executable, 0x0C169024),
        "mode13": u32(executable, 0x0C169028),
        "actorResolver": u32(executable, 0x0C16902C),
        "mode14": u32(executable, 0x0C169030),
        "mode15": u32(executable, 0x0C169034),
        "resultWriter": u32(executable, 0x0C169038),
        "mode16": u32(executable, 0x0C16903C),
        "mode17": u32(executable, 0x0C169040),
        "mode18": u32(executable, 0x0C169044),
    }
    if extended_dependencies != {
        "mode7": 0x0C0A9472,
        "mode9": 0x0C0A6AF0,
        "mode11": 0x0C0A8E02,
        "mode12WhenOne": 0x0C1887A8,
        "mode13": 0x0C0A6B16,
        "actorResolver": 0x0C153956,
        "mode14": 0x0C0A99A0,
        "mode15": 0x0C0A8EF6,
        "resultWriter": 0x0C0BB342,
        "mode16": 0x0C13EF58,
        "mode17": 0x0C0AA77A,
        "mode18": 0x0C0AA832,
    }:
        raise ValueError("extended primary-runtime dependencies changed")

    calls = operation_calls(event_ir)
    selector_counts = Counter(selector(call) for call in calls)
    argument_count_counts = Counter(
        len(call["arguments"]) for call in calls
    )
    expected_selector_counts = {
        0: 833,
        1: 704,
        2: 103,
        7: 192,
        8: 82,
        9: 3,
        11: 52,
        12: 108,
        13: 2,
        14: 4,
        15: 10,
        16: 51,
        17: 3,
        18: 3,
    }
    if (
        len(calls) != 2150
        or selector_counts != expected_selector_counts
        or argument_count_counts != {1: 1787, 2: 359, 3: 4}
    ):
        raise ValueError("operation-0x002d authored inventory changed")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    dialogue_selector_counts = Counter(
        selector(call) for call in dialogue_calls
    )
    if dialogue_selector_counts != {
        0: 253,
        1: 246,
        2: 21,
        7: 29,
        8: 16,
        16: 2,
    }:
        raise ValueError("operation-0x002d dialogue inventory changed")

    return {
        "schema": "new-yokosuka-primary-runtime-state-operation-evidence-v1",
        "status": "exact-native-handler-modes-and-hato-dataflow",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 45,
            "operationHex": "0x002d",
            "handlerAddress": "0x0c168d40",
            "handlerSampleSha256": actual["handler"],
            "modeArgumentIndex": 0,
            "provenModes": [
                {
                    "mode": 0,
                    "targetAddress": "0x0c0a6a06",
                    "targetSha256": actual["mode0"],
                    "writes": [
                        {
                            "basePointerAddress": "0x0c281af8",
                            "offset": "0x01f8",
                            "value": 0,
                        },
                        {
                            "basePointerAddress": "0x0c281af8",
                            "offset": "0x0020",
                            "value": 2,
                        },
                        {
                            "absoluteAddress": "0x0c281b02",
                            "width": "byte",
                            "value": 0,
                        },
                    ],
                },
                {
                    "mode": 1,
                    "targetAddress": "0x0c0a69f2",
                    "targetSha256": actual["mode1"],
                    "writes": [
                        {
                            "basePointerAddress": "0x0c281af8",
                            "offset": "0x01f8",
                            "value": 1,
                        },
                        {
                            "basePointerAddress": "0x0c281af8",
                            "offset": "0x0020",
                            "value": 1,
                        },
                    ],
                    "transitionCallback": {
                        "address": "0x0c0a563c",
                        "argument": 1,
                    },
                },
                {
                    "mode": 2,
                    "targetAddress": "0x0c0a6a80",
                    "targetSha256": actual["mode2"],
                    "query": {
                        "currentEventRequired": True,
                        "primaryRuntimeRequired": True,
                        "gateByteAddress": "0x0c281b01",
                        "acceptedGateByteValues": [0, 1],
                        "stateDwordOffset": "0x01f8",
                        "requiredStateDwordValue": 1,
                        "result": "boolean",
                    },
                },
                {
                    "mode": 8,
                    "targetAddress": "0x0c0a954a",
                    "targetSha256": actual["mode8"],
                    "query": {
                        "primaryRuntimeRequired": True,
                        "statusByteOffset": "0x01d9",
                        "comparison": "not-equal",
                        "value": 0,
                        "result": "boolean",
                    },
                },
                {
                    "mode": 7,
                    "targetAddress": "0x0c0a9472",
                    "behavior": "Forward argument one unchanged.",
                },
                {
                    "mode": 9,
                    "targetAddress": "0x0c0a6af0",
                    "behavior": "Forward argument one unchanged.",
                },
                {
                    "mode": 11,
                    "targetAddress": "0x0c0a8e02",
                    "behavior": "Return the exact helper result.",
                },
                {
                    "mode": 12,
                    "authoredArgumentOne": 0,
                    "behavior": (
                        "Take the exact no-op route; only value one would "
                        "dispatch helper 0x0c1887a8."
                    ),
                },
                {
                    "mode": 13,
                    "targetAddress": "0x0c0a6b16",
                    "behavior": "Forward argument one unchanged.",
                },
                {
                    "mode": 14,
                    "targetAddress": "0x0c0a99a0",
                    "behavior": (
                        "Resolve argument one as an actor and, when present, "
                        "forward that actor with argument two."
                    ),
                },
                {
                    "mode": 15,
                    "targetAddress": "0x0c0a8ef6",
                    "behavior": "Return the exact helper result.",
                },
                {
                    "mode": 16,
                    "targetAddress": "0x0c13ef58",
                    "behavior": (
                        "Resolve argument one as an actor and forward only a "
                        "present actor."
                    ),
                },
                {
                    "mode": 17,
                    "targetAddress": "0x0c0aa77a",
                    "behavior": (
                        "Forward authored literal JOMO and return the exact "
                        "helper result."
                    ),
                },
                {
                    "mode": 18,
                    "targetAddress": "0x0c0aa832",
                    "behavior": "Tail-call the exact no-argument helper.",
                },
            ],
            "extendedNativeContract": {
                name: f"0x{value:08x}"
                for name, value in extended_dependencies.items()
            },
            "provenBehavior": (
                "Dispatches a numeric primary-runtime state command. Modes "
                "0 and 1 apply the exact opposing state writes listed here; "
                "mode 1 additionally invokes the shared transition callback. "
                "Mode 2 returns whether the current-event and primary-runtime "
                "prerequisites hold, the gate byte is zero or one, and state "
                "dword +0x01f8 equals one. Mode 8 returns whether the primary "
                "runtime exists and status byte +0x01d9 is nonzero. Every "
                "authored mode 7, 9, and 11 through 18 route is also retained "
                "at its exact helper, actor-resolution, result, or no-op "
                "boundary."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": 2150,
            "unresolvedCallCount": 0,
            "dialogueRegionCallCount": len(dialogue_calls),
            "provenDialogueRegionCallCount": 567,
            "unresolvedDialogueRegionCallCount": 0,
            "areaCount": len({
                (call["disc"], call["area"]) for call in calls
            }),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(selector_counts.items())
            },
            "dialogueSelectorCounts": {
                str(value): count
                for value, count in sorted(dialogue_selector_counts.items())
            },
            "argumentCountCounts": {
                str(value): count
                for value, count in sorted(argument_count_counts.items())
            },
        },
        "hatoConversation": {
            "prelude": {
                "callFileOffset": "0x7f8be",
                "mode": 0,
            },
            "controlCleanup": {
                "callFileOffset": "0x80148",
                "mode": 1,
            },
        },
        "evidenceBoundary": [
            (
                "The dispatcher targets, state addresses, field offsets, "
                "written values, callback, and Hato call arguments are exact."
            ),
            (
                "The high-level names of the shared runtime object and its "
                "numeric modes remain unresolved, so this report does not "
                "call them player lock/unlock or cinematic enter/exit."
            ),
            (
                "Opaque helpers for modes 7, 9, 11, 13, 14, 15, 16, 17, and "
                "18 remain mandatory neutral adapters; no subsystem meaning "
                "is inferred from their callers."
            ),
            (
                "Unobserved modes 3 through 6 and 10 are not registered even "
                "though the handler dispatch table exposes their targets."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
        json.loads(args.event_ir.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
