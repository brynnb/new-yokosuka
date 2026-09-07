#!/usr/bin/env python3
"""Verify exact numeric modes of native operation 0x0009."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/operation-0009-numeric-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C17320C
HANDLER_LENGTH = 402
HANDLER_SHA256 = (
    "c2fcec6d1c28cdb23c4d59a8c1e4dc1f80d146a3939273de0b343c069609fb83"
)
MODES = {
    8: {
        "semanticId": "signed-integer-to-float",
        "pathAddress": 0x0C1732C4,
        "pathLength": 10,
        "pathSha256": (
            "350ca6fb29f3de04a7a72105ca657a89fc55c164f771f6b97ed2fe9897fe6a82"
        ),
        "behavior": (
            "Converts signed integer argument one to an SH-4 "
            "single-precision float and writes its exact 32-bit word."
        ),
    },
    10: {
        "semanticId": "binary-angle-sine",
        "pathAddress": 0x0C1732DE,
        "pathLength": 10,
        "pathSha256": (
            "cf8ac586ed6c46d54d5d0e92777e88a2a38d52dfcee3f6a3a114376a5997d02b"
        ),
        "behavior": (
            "Passes the low 16 bits of argument one to the native binary-angle "
            "sine routine and writes its exact single-precision result word."
        ),
        "dependency": {
            "address": 0x0C1CE320,
            "length": 152,
            "sha256": (
                "30b19d90b0d4111fca4cbc031f0075a48d7a6d09b8fbd4f95654f70cce943a56"
            ),
        },
    },
    11: {
        "semanticId": "binary-angle-cosine",
        "pathAddress": 0x0C1732E8,
        "pathLength": 10,
        "pathSha256": (
            "d0733c06a6d12e64debda74c8b58eeed596469a66d4c86e36544418416bcc489"
        ),
        "behavior": (
            "Passes the low 16 bits of argument one to the native binary-angle "
            "cosine wrapper and writes its exact single-precision result word."
        ),
        "dependency": {
            "address": 0x0C1CDD90,
            "length": 24,
            "sha256": (
                "3f6eb178c3cc3b5a903cdec18cacb95003ca91a73f80cad73eed72d946faf6bb"
            ),
        },
    },
    12: {
        "semanticId": "float-square-root",
        "pathAddress": 0x0C1732F2,
        "pathLength": 8,
        "pathSha256": (
            "fca2bffb532cd5290d957d2090e6829c7ec82ee8bce89322eb6e76eb79552abe"
        ),
        "behavior": (
            "Loads argument one as a single-precision float, applies FSQRT, "
            "and writes the exact single-precision result word."
        ),
    },
    13: {
        "semanticId": "float-absolute-value",
        "pathAddress": 0x0C1732FA,
        "pathLength": 8,
        "pathSha256": (
            "88e3a99a20310c6739796c575c7054fa09ec055445776eefbd8a718940bb974c"
        ),
        "behavior": (
            "Loads argument one as a single-precision float, applies FABS, "
            "and writes the exact single-precision result word."
        ),
    },
    14: {
        "semanticId": "two-dimensional-xz-distance",
        "pathAddress": 0x0C173302,
        "pathLength": 12,
        "pathSha256": (
            "48140eec5511a6c568c38d620843a47db37caf2e0ce2edc7b148a5838ea72ee2"
        ),
        "behavior": (
            "Reads two native three-float vector pointers, computes the "
            "single-precision Euclidean distance using components zero and "
            "two, and writes the exact result word."
        ),
        "dependency": {
            "address": 0x0C09145C,
            "length": 12,
            "sha256": (
                "aba231891e76b2a7e5a2418d43aeaddaea46158ff9c4b4654f3a85a55563eba9"
            ),
        },
    },
    15: {
        "semanticId": "three-dimensional-distance",
        "pathAddress": 0x0C17330E,
        "pathLength": 64,
        "pathSha256": (
            "b304a3634bed2869de4942e425883f87216a62a561e40af94ae1af9fb52540f1"
        ),
        "behavior": (
            "Reads two native three-float vector pointers, subtracts all "
            "three components, computes the single-precision Euclidean "
            "length, and writes the exact result word."
        ),
        "dependency": {
            "address": 0x0C091468,
            "length": 16,
            "sha256": (
                "a645978b37b3b19aab5a011b288e1fa79b7accd0bdcef07c863499901fb31251"
            ),
        },
    },
    16: {
        "semanticId": "scaled-uniform-random-float",
        "pathAddress": 0x0C17334E,
        "pathLength": 14,
        "pathSha256": (
            "e49e6657bd5ee0742f94f77ab1ffd7633dd0696c9add4fefdc7ba6141e40f9a0"
        ),
        "behavior": (
            "Calls the shared normalized random source, multiplies its "
            "single-precision result by float argument one, and writes the "
            "exact single-precision result word."
        ),
    },
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def numeric_mode_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 9
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    mode = (
                        arguments[0].get("value")
                        if arguments
                        and arguments[0].get("kind") == "constant"
                        else None
                    )
                    if mode not in MODES:
                        continue
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "mode": mode,
                        "inputArgument": (
                            arguments[1] if len(arguments) > 1 else None
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
        raise ValueError("operation-0x0009 handler changed")
    for mode, definition in MODES.items():
        actual = sha256(runtime_slice(
            executable,
            definition["pathAddress"],
            definition["pathLength"],
        ))
        if actual != definition["pathSha256"]:
            raise ValueError(f"operation-0x0009 mode {mode} path changed")
        dependency = definition.get("dependency")
        if dependency is not None and sha256(runtime_slice(
            executable,
            dependency["address"],
            dependency["length"],
        )) != dependency["sha256"]:
            raise ValueError(
                f"operation-0x0009 mode {mode} dependency changed"
            )

    calls = numeric_mode_calls(event_ir)
    mode_counts = Counter(call["mode"] for call in calls)
    if mode_counts != Counter({
        8: 43,
        10: 710,
        11: 670,
        12: 4,
        13: 31,
        14: 132,
        15: 48,
        16: 1104,
    }):
        raise ValueError(f"unexpected operation-0x0009 mode counts {mode_counts}")
    return {
        "schema": "new-yokosuka-operation-0009-numeric-evidence-v1",
        "status": "exact-native-handler-modes-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 9,
            "operationHex": "0x0009",
            "handlerAddress": "0x0c17320c",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "sharedRandomFunction": "0x0c1ce210",
            "floatResultWriterFunction": "0x0c0bb348",
            "modes": [
                {
                    "mode": mode,
                    "semanticId": definition["semanticId"],
                    "pathAddress": f"0x{definition['pathAddress']:08x}",
                    "pathLength": definition["pathLength"],
                    "pathSha256": definition["pathSha256"],
                    **({
                        "dependencyAddress": (
                            f"0x{definition['dependency']['address']:08x}"
                        ),
                        "dependencyLength": (
                            definition["dependency"]["length"]
                        ),
                        "dependencySha256": (
                            definition["dependency"]["sha256"]
                        ),
                    } if "dependency" in definition else {}),
                    "provenBehavior": definition["behavior"],
                }
                for mode, definition in MODES.items()
            ],
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count in sorted(Counter(
                    call["mode"]
                    for call in calls
                    if call["dialogueRegion"]
                ).items())
            },
            "inputArgumentKindCounts": dict(sorted(Counter(
                (
                    call["inputArgument"]["kind"]
                    if call["inputArgument"] is not None
                    else "missing"
                )
                for call in calls
            ).items())),
            "calls": calls,
        },
        "evidenceBoundary": [
            (
                "Float inputs and outputs are native IEEE-754 "
                "single-precision words, not untyped JavaScript numbers."
            ),
            (
                "Mode 16 includes the authored float bound multiplication; "
                "only the shared source itself has range [0, 1)."
            ),
            (
                "Other operation-0x0009 modes remain separately numeric and "
                "unresolved unless their full native dependencies are proven."
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
