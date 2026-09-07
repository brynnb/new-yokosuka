#!/usr/bin/env python3
"""Verify operation 0x00ca named-resource release/load-completion modes."""

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
    / "tools/evidence/named-resource-residency-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operationHandler": (
        0x0C16B8C0,
        30,
        "9fbb924f0acec11eb4661a1cb70427c3fea8ee399e0c3a8d4eef842ff12bf53a",
    ),
    "modeDispatcher": (
        0x0C0B3E70,
        84,
        "5a8f292f90d07761caef79bcfdc978af12ebfe4465f2e659c9197ea7b1ffc097",
    ),
    "ensureRequest": (
        0x0C0B3EC4,
        86,
        "7c33e9e38bf31516b5c4b5b54466b3c5d28d251d80fc850998a55bd4cfa0b5c2",
    ),
    "pollCompletion": (
        0x0C0B4028,
        100,
        "e3b26be9145246d82813560eae8f9d1abaef50433c3c6082b43f78fd67c0a925",
    ),
    "release": (
        0x0C0B4110,
        86,
        "666e39723ded327edbb9fae0b3444803c320b2ea0eccd089261e472ee3232712",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def authored_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x00CA
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    mode = (
                        arguments[0].get("value")
                        if (
                            len(arguments) == 2
                            and arguments[0].get("kind") == "constant"
                        )
                        else None
                    )
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "mode": mode,
                        "resourceArgument": (
                            arguments[1] if len(arguments) == 2 else None
                        ),
                    })
    return calls


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x00ca {name} range changed")
    calls = authored_calls(event_ir)
    mode_counts = Counter(call["mode"] for call in calls)
    if mode_counts != {0: 319, 1: 699}:
        raise ValueError(f"operation-0x00ca authored modes changed: {mode_counts}")
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    if len(dialogue_calls) != 336:
        raise ValueError("operation-0x00ca dialogue inventory changed")
    argument_kinds = Counter(
        call["resourceArgument"]["kind"]
        for call in calls
        if call["resourceArgument"]
    )
    if argument_kinds != {"static-pointer": 1008, "frame-field": 10}:
        raise ValueError(
            f"operation-0x00ca resource arguments changed: {argument_kinds}"
        )
    return {
        "schema": "new-yokosuka-named-resource-residency-evidence-v1",
        "status": "exact-native-mode-paths-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x00CA,
            "operationHex": "0x00ca",
            "handlerAddress": "0x0c16b8c0",
            "modeDispatcher": "0x0c0b3e70",
            "resultWriter": "0x0c0bb358",
            "modes": [
                {
                    "mode": 0,
                    "targetAddress": "0x0c0b4110",
                    "behavior": (
                        "walks the 20 named-resource slots, releases every "
                        "matching resident entry, and clears its slot"
                    ),
                },
                {
                    "mode": 1,
                    "requestAddress": "0x0c0b3ec4",
                    "completionAddress": "0x0c0b4028",
                    "behavior": (
                        "ensures the named resource has a request, then "
                        "repeats the completion routine until it succeeds"
                    ),
                },
            ],
            "returnValue": 1,
            "provenBehavior": (
                "Forwards exact mode and resource-name pointer arguments to "
                "the named-resource dispatcher and writes its integer result. "
                "Authored mode zero releases matching residency; authored "
                "mode one ensures and waits for completed residency."
            ),
        },
        "allDiscInventory": {
            "callCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(mode_counts.items())
            },
            "resourceArgumentKindCounts": dict(sorted(
                argument_kinds.items()
            )),
        },
        "evidenceBoundary": [
            "Only exact two-argument calls with authored modes zero or one receive this semantic.",
            "Resource names remain pointer/runtime operands; no nearby string or filename is guessed.",
            "The native mode-one polling loop is represented by an awaitable load-completion adapter, not a timing heuristic.",
            "Native modes two and three are not authored and are not exposed by this semantic.",
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
