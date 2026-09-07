#!/usr/bin/env python3
"""Recover native secondary-motion float, mode, and flag controls."""

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
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/secondary-motion-control-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "globalFloatHandler": (
        0x0C131B76,
        132,
        "255e8de92a986214eac60a7e1ed725848e6e527d466ea77cc92c0d4bd3e8096a",
    ),
    "actorModeHandler": (
        0x0C0ADF6C,
        38,
        "1d37b991b3a3291eeb0cb87138579dc2bced0657c3ae1b0e21727a737aefe5ce",
    ),
    "actorModeWrite": (
        0x0C0ADF92,
        32,
        "1c4d17e3869bb74384af8909b68ebd339c7357960db2fa1c5e2db7f128600eec",
    ),
    "actorModeInitialize": (
        0x0C0AE002,
        252,
        "dc2b82990bdda572ba24618c3186514cd51ed2c29bbb63597abb371cca092a36",
    ),
    "actorFlagHandler": (
        0x0C0ADFB2,
        78,
        "78895146b31b9a6ed8315df09bcfed6242c8337fd8260d2bfadad7502f4c7a9a",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int,
) -> list[dict[str, Any]]:
    result = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
                    ):
                        continue
                    result.append({
                        "disc": native_map["disc"],
                        "area": native_map["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return result


def constant_counts(calls: list[dict[str, Any]], index: int) -> dict[str, int]:
    return {
        str(value): count
        for value, count in sorted(Counter(
            call["arguments"][index]["value"]
            for call in calls
            if call["arguments"][index].get("kind") == "constant"
        ).items())
    }


def kind_counts(calls: list[dict[str, Any]], index: int) -> dict[str, int]:
    return dict(sorted(Counter(
        call["arguments"][index].get("kind") for call in calls
    ).items()))


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"secondary-motion {name} changed")

    global_float = operation_calls(event_ir, 0x0164)
    actor_mode = operation_calls(event_ir, 0x0142)
    actor_flag = operation_calls(event_ir, 0x0025)
    if (
        len(global_float) != 42
        or kind_counts(global_float, 0) != {"constant": 42}
        or kind_counts(global_float, 1) != {"constant": 39, "frame-field": 3}
        or constant_counts(global_float, 0) != {
            "0": 7, "1": 11, "2": 5,
            "10": 4, "11": 3,
            "20": 4, "21": 2,
            "30": 4, "31": 2,
        }
        or len(actor_mode) != 15
        or kind_counts(actor_mode, 0) != {"constant": 11, "frame-field": 4}
        or kind_counts(actor_mode, 1) != {"constant": 15}
        or constant_counts(actor_mode, 1) != {
            "0": 4, "2": 3, "4": 1, "5": 2,
            "6": 1, "8": 3, "9": 1,
        }
        or len(actor_flag) != 266
        or kind_counts(actor_flag, 0) != {"constant": 124, "frame-field": 142}
        or kind_counts(actor_flag, 1) != {"constant": 266}
        or kind_counts(actor_flag, 2) != {"constant": 266}
        or constant_counts(actor_flag, 1) != {"2": 89, "4": 34, "8": 143}
        or constant_counts(actor_flag, 2) != {"0": 73, "1": 193}
    ):
        raise ValueError("secondary-motion authored inventory changed")

    return {
        "schema": "new-yokosuka-secondary-motion-control-operation-evidence-v1",
        "status": "exact-native-float-mode-and-flag-contracts",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedRanges": {
            name: {
                "address": f"0x{address:08x}",
                "length": length,
                "sha256": digest,
            }
            for name, (address, length, digest) in RANGES.items()
        },
        "operations": [{
            "operationId": 0x0164,
            "operationHex": "0x0164",
            "handlerAddress": "0x0c131b76",
            "authoredCallCount": len(global_float),
            "areaCount": len({(call["disc"], call["area"]) for call in global_float}),
            "modeCounts": constant_counts(global_float, 0),
            "provenBehavior": (
                "Writes an exact float word to one of two primary globals, "
                "one of six quotient/remainder-indexed globals, or the "
                "dedicated mode-two/mode-three global."
            ),
        }, {
            "operationId": 0x0142,
            "operationHex": "0x0142",
            "handlerAddress": "0x0c0adf6c",
            "authoredCallCount": len(actor_mode),
            "dialogueRegionCallCount": sum(call["dialogueRegion"] for call in actor_mode),
            "modeCounts": constant_counts(actor_mode, 1),
            "provenBehavior": (
                "Resolves the actor's secondary-motion record, writes "
                "argument one to record byte +0x06, and invokes the native "
                "record initializer. Missing actors or records are no-ops."
            ),
        }, {
            "operationId": 0x0025,
            "operationHex": "0x0025",
            "handlerAddress": "0x0c0adfb2",
            "authoredCallCount": len(actor_flag),
            "dialogueRegionCallCount": sum(call["dialogueRegion"] for call in actor_flag),
            "maskCounts": constant_counts(actor_flag, 1),
            "stateCounts": constant_counts(actor_flag, 2),
            "provenBehavior": (
                "Resolves the actor's secondary-motion record and sets or "
                "clears the exact 0x02, 0x04, or 0x08 mask in record byte "
                "+0x00. Missing actors or records are no-ops."
            ),
        }],
        "op02Proof": {
            "globalFloat": {"mode": 2, "word": "0x3d99999a"},
            "actorMode": {"actorTag": "SINF", "mode": 4},
            "actorFlag": {"actorTag": "SINF", "mask": 8, "enabled": 1},
        },
        "evidenceBoundary": [
            "The native global float channels retain numeric mode identities.",
            "The record is named secondary-motion because its initializer "
            "selects the same native controller templates and CLBC collision "
            "owner consumed by the recovered secondary-motion runtime.",
            "No browser wind magnitude or cloth tuning is inferred here.",
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
    print(f"Wrote {args.out}: 323 exact calls")


if __name__ == "__main__":
    main()
