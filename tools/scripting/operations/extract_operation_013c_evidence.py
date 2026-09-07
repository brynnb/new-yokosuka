#!/usr/bin/env python3
"""Verify the ten exact promoted operation 0x013c route shapes."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-013c-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C15F484,
        712,
        "3f14a8b1ff3162066eedbab80b9f120bdabe6105320c35e174e918c4cc0de353",
    ),
    "createWrapper": (
        0x0C138F0C,
        46,
        "9ff3779cf9bc509272600667948df2ca019693dbe2b83519e25a40ff04099357",
    ),
    "releaseHelper": (
        0x0C138F9A,
        66,
        "d32587d7defc5013cab56e98896bd4d6361ba6db1129b83b5a9b74a86037082c",
    ),
    "recordResolver": (
        0x0C1393F0,
        100,
        "5ac92abe5781c24748a5d66cecb11f9b4ec7fe1ab798afb8a87bd199cc63e713",
    ),
    "record52Installer": (
        0x0C139AC0,
        78,
        "325835765eee67a3c5de911c0470528440d4226b6ceff2e3a767633aca8eb2c5",
    ),
    "activityQuery": (
        0x0C139B4C,
        72,
        "4289b46e9c59e1cd7351861c8eddc9197f135da5f8eb5f1035c1b95fddcdd2cc",
    ),
    "word08Query": (
        0x0C139CB8,
        60,
        "940e657470d12fa6f8def822dfd0799454eb3159b481e903c794d4d0f788cedd",
    ),
    "word08Writer": (
        0x0C139CF4,
        40,
        "b3d8c91241f233b6233613b0f26f962948e34186767ebb06363dd579c6104c33",
    ),
    "archiveAcquire": (
        0x0C1391E0,
        268,
        "314c3246c461365fb2b70940fd20f119c0fda50b0a4d01ece047da2d1b434206",
    ),
    "archiveRelease": (
        0x0C1392EC,
        92,
        "4f316d94ad61947ef8f3a55373dc9178df32614da15e9c77c7bd22bd8caae780",
    ),
    "archiveActivityLookup": (
        0x0C139454,
        150,
        "0e06e6d34a077f8564f7ab52e4e5182fb1194b7c4231c27d9f09489c0a051fd8",
    ),
    "archiveActivityStart": (
        0x0C1390B0,
        270,
        "1fe0448d67f9c05431f2c3051cbe3093c5e9e5876cfb0a1d5d043117fe754f20",
    ),
    "activeRecord56Query": (
        0x0C139B0E,
        30,
        "3298ba81200ca9f2482b604513fb09cd082030a9d0f1e6fd2dbc60c13dd4df92",
    ),
    "platformWord72Writer": (
        0x0C139BB6,
        80,
        "ad51a2b24dc261a5a7c843bc797a179d66f59efbbc12c0266d931ba3077e9474",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x013C
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


def is_proven(call: dict[str, Any]) -> bool:
    arguments = call["arguments"]
    if not all(
        argument.get("kind") == "constant"
        for argument in arguments[:2]
    ):
        return False
    route = tuple(argument.get("value") for argument in arguments[:2])
    if route == (0, 0):
        return (
            len(arguments) == 4
            and arguments[2].get("kind") in {"frame-field", "static-pointer"}
            and arguments[3].get("kind") in {"frame-field", "static-pointer"}
        )
    if route == (0, 2):
        return len(arguments) == 2
    if route in {(0, 5), (0, 6)}:
        return (
            len(arguments) == 3
            and arguments[2].get("kind") in {"frame-field", "static-pointer"}
        )
    if route == (2, 1):
        return (
            len(arguments) == 3
            and arguments[2].get("kind") == "constant"
        )
    if route == (2, 2):
        return (
            len(arguments) == 3
            and arguments[2].get("kind") == "static-pointer"
        )
    if route == (1, 0):
        return (
            len(arguments) == 4
            and all(
                argument.get("kind") == "static-pointer"
                for argument in arguments[2:]
            )
        )
    if route == (1, 1):
        return (
            len(arguments) == 3
            and arguments[2].get("kind") == "frame-field"
        )
    if route == (0, 8):
        return (
            len(arguments) == 5
            # The archive record can be retained in either the coroutine
            # frame or the scene-owned native record table.  In particular,
            # OP00 stores the result of selector 1/0 at scene +0, then feeds
            # that exact value into every selector 0/8 subordinate activity.
            and arguments[2].get("kind") in {"frame-field", "scene-field"}
            and all(
                argument.get("kind") == "constant"
                for argument in arguments[3:]
            )
        )
    if route == (0, 10):
        return (
            len(arguments) == 3
            and arguments[2].get("kind") == "constant"
        )
    return False


def route_counts(calls: list[dict[str, Any]]) -> Counter[tuple[int, int]]:
    return Counter(
        (
            call["arguments"][0]["value"],
            call["arguments"][1]["value"],
        )
        for call in calls
    )


def argument_kinds(
    calls: list[dict[str, Any]],
    count: int = 4,
) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            (
                call["arguments"][index]["kind"]
                if index < len(call["arguments"])
                else "missing"
            )
            for call in calls
        ).items()))
        for index in range(count)
    }


def verify_native_contract(executable: bytes) -> None:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x013c {name} changed")


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [call for call in calls if is_proven(call)]
    dialogue = [call for call in selected if call["dialogueRegion"]]
    expected_routes = {
        (0, 0): 235,
        (0, 2): 278,
        (0, 5): 66,
        (0, 6): 292,
        (0, 8): 67,
        (0, 10): 45,
        (1, 0): 2,
        (1, 1): 1,
        (2, 1): 587,
        (2, 2): 128,
    }
    expected_dialogue_routes = {
        (0, 0): 6,
        (0, 2): 6,
        (0, 5): 2,
        (0, 6): 11,
        (2, 1): 16,
        (2, 2): 2,
    }
    if (
        len(calls) != 1751
        or len(selected) != 1701
        or len(dialogue) != 43
        or route_counts(selected) != expected_routes
        or route_counts(dialogue) != expected_dialogue_routes
        or argument_kinds(selected, 5) != {
            "0": {"constant": 1701},
            "1": {"constant": 1701},
            "2": {
                "constant": 632,
                "frame-field": 84,
                "missing": 278,
                "scene-field": 66,
                "static-pointer": 641,
            },
            "3": {
                "constant": 67,
                "frame-field": 36,
                "missing": 1397,
                "static-pointer": 201,
            },
            "4": {"constant": 67, "missing": 1634},
        }
        or argument_kinds(dialogue, 5) != {
            "0": {"constant": 43},
            "1": {"constant": 43},
            "2": {
                "constant": 16,
                "missing": 6,
                "static-pointer": 21,
            },
            "3": {"missing": 37, "static-pointer": 6},
            "4": {"missing": 43},
        }
    ):
        raise ValueError("operation-0x013c authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-013c-evidence-v3",
        "status": "exact-ten-route-native-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x013C,
            "operationHex": "0x013c",
            "handlerAddress": "0x0c15f484",
            "provenRoutes": [
                {"majorRoute": major, "selector": selector}
                for major, selector in expected_routes
            ],
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "fixedContainerAddress": "0x0c21da10",
            "provenBehavior": (
                "Major route 2 selector 1 writes argument two to fixed "
                "container dword +0x08. Its selector 2 resolves argument two "
                "through the 32-record table and, only after the native "
                "range/family/nonzero-+0x04 checks, installs it at container "
                "+0x34. Major route 0 selector 2 reports whether container "
                "+0x38/+0x3c/+0x40 or the platform fallback is active. "
                "Selector 5 reports whether argument two resolves. Selector "
                "6 releases a resolved record and clears +0x34 when it was "
                "that record. Selector 0 rejects an already-resolved "
                "argument three; otherwise it clears container +0x44, creates "
                "from arguments two/three, and installs success at +0x38. "
                "Major route 1 selector 0 acquires one of four exact "
                "reference-counted two-string archive records and selector 1 "
                "releases it. Major route 0 selector 8 locates an existing "
                "subordinate archive activity, waits while container +0x38 "
                "is owned, or starts the exact indexed activity."
                " Selector 10 writes argument two to the fixed platform "
                "controller dword +0x48, substituting the native default "
                "3000 when the authored argument is zero."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "unresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in calls
            ),
            "provenDialogueRegionCallCount": len(dialogue),
            "routeCounts": {
                f"{major},{selector}": count
                for (major, selector), count in expected_routes.items()
            },
            "dialogueRouteCounts": {
                f"{major},{selector}": count
                for (major, selector), count
                in expected_dialogue_routes.items()
            },
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "argumentKindCounts": argument_kinds(selected, 5),
            "dialogueArgumentKindCounts": argument_kinds(dialogue, 5),
        },
        "evidenceBoundary": [
            "The fixed container and raw offsets remain numerically named.",
            "Record creation, release, and the platform activity fallback are "
            "mandatory adapters rather than browser substitutes.",
            "Offset-52 eligibility must be explicitly configured from the "
            "native range, family, and record-word checks.",
            "The other 50 non-dialogue calls remain unresolved.",
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
