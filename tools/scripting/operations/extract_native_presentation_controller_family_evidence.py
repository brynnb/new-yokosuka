#!/usr/bin/env python3
"""Verify OP00's adjacent native presentation-controller operation family."""

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
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/native-presentation-controller-family-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLERS = {
    0x0175: {
        "address": 0x0C172508,
        "length": 580,
        "sha256": "1e16736a10495d662479320925acbc6f16771e1d94403cb777ff838af8ced5fe",
        "tableEntry": 0x0C29AFB4,
    },
    0x0176: {
        "address": 0x0C17274C,
        "length": 804,
        "sha256": "1f8ebb76f5ee2acb529fdd0216a94b5474b2ec27357ed3eba59224fa2436959e",
        "tableEntry": 0x0C29AFB8,
    },
    0x0178: {
        "address": 0x0C172B8C,
        "length": 308,
        "sha256": "50a33da03b00fcc943dfd37ffcfa22212f8c5de5d41b6940c7881ad0c46416c6",
        "tableEntry": 0x0C29AFC0,
    },
    0x0179: {
        "address": 0x0C172CC0,
        "length": 1220,
        "sha256": "d66d7709e9ea827dc324f7f546b525ad6f2400c37b39556d63be960ac117ed54",
        "tableEntry": 0x0C29AFC4,
    },
}
EXPECTED = {
    0x0175: {
        "calls": 472,
        "areas": 108,
        "dialogue": 0,
        "argc": {1: 191, 2: 281},
        "modes": {1: 144, 2: 37, 15: 4, 21: 10, 23: 120, 24: 19, 25: 128, 27: 10},
        "supportedModes": {1, 2, 15, 21, 23, 24, 25, 27},
        "supportedCalls": 472,
        "op00Calls": 4,
        "op00Modes": {15: 4},
    },
    0x0176: {
        "calls": 341,
        "areas": 108,
        "dialogue": 11,
        "argc": {2: 197, 4: 11, 5: 109, 6: 21, 7: 3},
        "modes": {1: 128, 9: 3, 10: 21, 11: 11, 12: 69, 13: 109},
        "supportedModes": {1},
        "supportedCalls": 128,
        "op00Calls": 3,
        "op00Modes": {1: 3},
    },
    0x0178: {
        "calls": 72,
        "areas": 12,
        "dialogue": 0,
        "argc": {1: 2, 2: 65, 7: 5},
        "modes": {1: 5, 6: 5, 7: 27, 10: 2, 13: 21, 14: 12},
        "supportedModes": {1, 6, 7, 10, 13, 14},
        "supportedCalls": 72,
        "op00Calls": 22,
        "op00Modes": {1: 2, 6: 5, 7: 14, 10: 1},
    },
    0x0179: {
        "calls": 278,
        "areas": 102,
        "dialogue": 0,
        "argc": {1: 15, 2: 35, 3: 133, 7: 3, 11: 92},
        "modes": {
            2: 1, 3: 2, 4: 2, 7: 1, 11: 6, 12: 13, 13: 2, 14: 7,
            16: 9, 18: 6, 36: 1, 37: 2, 38: 92, 39: 20, 41: 8,
            42: 94, 44: 6, 47: 6,
        },
        "supportedModes": {
            2, 3, 4, 7, 11, 12, 13, 14, 16, 18, 36, 37,
            38, 39, 41, 42, 44, 47,
        },
        "supportedCalls": 278,
        "op00Calls": 27,
        "op00Modes": {
            2: 1, 3: 2, 4: 2, 7: 1, 11: 3, 12: 6, 13: 2, 14: 1,
            16: 3, 18: 3, 36: 1, 37: 2,
        },
    },
}
ROUTES = {
    0x0175: {
        1: (1, ["0x0c1badbc"], []),
        2: (1, ["0x0c1baed0"], []),
        15: (2, ["0x0c1baf0c"], [1]),
        21: (2, ["0x0c1bc5f8"], [1]),
        23: (2, ["0x0c1bc5f8", "0x0c1bc5ee"], ["literal:0x0780"]),
        24: (2, ["0x0c1bc5f8", "0x0c1bc5ee"], ["literal:0x1800"]),
        25: (2, ["0x0c1bc5f8", "0x0c1bc5ee"], ["literal:12"]),
        27: (1, ["0x0c1baeee", "0x0c1bcb32"], ["helper-result"]),
    },
    0x0176: {
        1: (2, ["0x0c1ba8fa", "0x0c1baae4"], ["branch:1"]),
    },
    0x0178: {
        1: (2, ["0x0c1c173c", "0x0c1bb2da", "0x0c0bb342"], [1]),
        6: (7, ["0x0c1c1794", "0x0c1bb2da", "0x0c0bb342"], [1, 2, 3, 4, 5, 6]),
        7: (2, ["0x0c1bb514", "0x0c1c17d8"], [1]),
        10: (1, ["0x0c1bc0f2"], []),
        13: (2, ["0x0c1baf00"], [1]),
        14: (2, ["0x0c09b9c8"], [1]),
    },
    0x0179: {
        2: (2, ["0x0c1bb6c4"], [1]),
        3: (1, ["0x0c1bb702"], []),
        4: (2, ["0x0c1bb79e"], [1]),
        7: (2, ["0x0c1bb83c"], [1]),
        11: (2, ["0x0c1bb9d6"], [1]),
        12: (1, ["0x0c1bba14"], []),
        13: (2, ["0x0c1bbab0"], [1]),
        14: (3, ["0x0c1bbaf6"], [2, 1]),
        16: (2, ["0x0c1bbb94"], [1]),
        18: (2, ["0x0c1bbbdc"], [1]),
        36: (7, ["0x0c1bb92e"], [1, 2, 3, 4, 5, 6]),
        37: (7, ["0x0c1bbc24"], [1, 2, 3, 4, 5, 6]),
        38: (
            11,
            ["0x0c1bb738", "0x0c1bba4a", "0x0c1bbd6c"],
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        ),
        39: (3, ["0x0c1bc43c"], [1, 2, "literal:0"]),
        41: (2, ["0x0c1bc516"], [1, "literal:0"]),
        42: (3, ["0x0c1bc4b6"], [1, 2, "literal:0"]),
        44: (3, ["0x0c1bc43c"], [1, 2, "literal:1"]),
        47: (3, ["0x0c1bc4b6"], [1, 2, "literal:1"]),
    },
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


def operation_calls(event_ir: dict[str, Any], operation_id: int) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == operation_id
                    ):
                        result.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    return result


def constant_mode(call: dict[str, Any]) -> int | None:
    arguments = call["arguments"]
    if not arguments or arguments[0].get("kind") != "constant":
        return None
    return arguments[0].get("value")


def verify_executable(data: bytes) -> None:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for operation_id, spec in HANDLERS.items():
        actual = digest(runtime_slice(data, spec["address"], spec["length"]))
        if actual != spec["sha256"]:
            raise ValueError(f"operation-0x{operation_id:04x} handler changed")
        if u32(data, spec["tableEntry"]) != spec["address"]:
            raise ValueError(f"operation-0x{operation_id:04x} table entry changed")


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(data)
    operations = []
    for operation_id, expected in EXPECTED.items():
        calls = operation_calls(event_ir, operation_id)
        modes = Counter(constant_mode(call) for call in calls)
        argc = Counter(len(call["arguments"]) for call in calls)
        areas = {(call["disc"], call["area"]) for call in calls}
        dialogue = sum(call["dialogue"] for call in calls)
        supported = [
            call for call in calls
            if constant_mode(call) in expected["supportedModes"]
        ]
        op00 = [
            call for call in calls
            if call["disc"] == 1 and call["area"] == "OP00"
        ]
        op00_modes = Counter(constant_mode(call) for call in op00)
        if (
            len(calls) != expected["calls"]
            or len(areas) != expected["areas"]
            or dialogue != expected["dialogue"]
            or argc != expected["argc"]
            or modes != expected["modes"]
            or len(supported) != expected["supportedCalls"]
            or len(op00) != expected["op00Calls"]
            or op00_modes != expected["op00Modes"]
            or any(constant_mode(call) is None for call in calls)
            or any(
                len(call["arguments"])
                != ROUTES[operation_id][constant_mode(call)][0]
                for call in supported
            )
        ):
            raise ValueError(
                f"operation-0x{operation_id:04x} authored inventory changed"
            )
        routes = []
        for mode, (argument_count, helpers, forwarded) in ROUTES[operation_id].items():
            routes.append({
                "mode": mode,
                "argumentCount": argument_count,
                "helperAddresses": helpers,
                "forwardedWords": forwarded,
                "authoredCallCount": modes[mode],
                "op00CallCount": op00_modes[mode],
                "returnsHandle": operation_id == 0x0178 and mode in (1, 6),
            })
        handler = HANDLERS[operation_id]
        operations.append({
            "operationId": operation_id,
            "operationHex": f"0x{operation_id:04x}",
            "handler": {
                "address": f"0x{handler['address']:08x}",
                "length": handler["length"],
                "sha256": handler["sha256"],
                "tableEntryAddress": f"0x{handler['tableEntry']:08x}",
            },
            "routes": routes,
            "inventory": {
                "authoredCallCount": len(calls),
                "supportedCallCount": len(supported),
                "unresolvedCallCount": len(calls) - len(supported),
                "areaCount": len(areas),
                "dialogueRegionCallCount": dialogue,
                "argumentCountCounts": {
                    str(key): value for key, value in sorted(argc.items())
                },
                "modeCounts": {
                    str(key): value for key, value in sorted(modes.items())
                },
                "op00CallCount": len(op00),
                "op00ModeCounts": {
                    str(key): value for key, value in sorted(op00_modes.items())
                },
            },
        })
    return {
        "schema": "new-yokosuka-native-presentation-controller-family-evidence-v1",
        "status": "op00-complete-exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operations": operations,
        "summary": {
            "authoredCallCount": sum(item["inventory"]["authoredCallCount"] for item in operations),
            "supportedCallCount": sum(item["inventory"]["supportedCallCount"] for item in operations),
            "unresolvedCallCount": sum(item["inventory"]["unresolvedCallCount"] for item in operations),
            "op00CallCount": sum(item["inventory"]["op00CallCount"] for item in operations),
            "op00UnresolvedCallCount": 0,
        },
        "evidenceBoundary": [
            "The four handlers are adjacent executable dispatchers and share a runtime adapter boundary, but no unproved shared native state is asserted.",
            "All OP00 routes are exact, including operation-0x0178 handle creation and release and operation-0x0179 paired-vector ABI.",
            "Operations 0x0175, 0x0178, and 0x0179 are complete for the all-disc authored inventory; operation 0x0176 modes 9-13 remain outside this proof.",
            "Operation 0x0179 mode 38 forwards four exact two-float groups and two scalar float words to three helpers in order; modes 39/44, 41, and 42/47 preserve distinct helper identities and literal zero/one controls.",
            "Opaque helper addresses retain address-derived identities until their presentation-domain meanings are independently proved.",
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
        f"Wrote {args.out}: {report['summary']['op00CallCount']} OP00 calls, "
        f"{report['summary']['unresolvedCallCount']} non-OP00 calls unresolved"
    )


if __name__ == "__main__":
    main()
