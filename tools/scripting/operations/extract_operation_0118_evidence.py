#!/usr/bin/env python3
"""Verify operation 0x0118's exact authored object/global field routes."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-0118-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1648AC,
        138,
        "d2384760f42a5ecffdfdc954c17903a48b87f6083dfa037f05b61fe455f70a89",
    ),
    "fieldHelpers": (
        0x0C179C88,
        226,
        "1db6df1a3932eac91a4528534a54dde26ea85c8050593d99d4eff5f76e8edc43",
    ),
    "readDwordB8": (
        0x0C0ABDFC,
        16,
        "4dc5149fe3a0d62188b3f95426afa25af66e3ef48655552b6327091ad590d02c",
    ),
    "writeDwordB8": (
        0x0C0ABE0C,
        28,
        "dffe7fc72f631ce451cc35033782bc5c803641f810510b39861f7b12049eec9b",
    ),
    "writeFloatBc": (
        0x0C0ABE28,
        20,
        "ce405eb461567fcdc863fd92d199e98f208dcc3bda3a220e134c1ae75705f349",
    ),
}
MODE_VALUES = {
    0: set(range(13)),
    1: set(range(16)),
    2: set(range(5)),
    3: {0x41F00000},
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    found = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0118
                    ):
                        continue
                    found.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return found


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0118 {name} range changed")
    authored = calls(event_ir)
    selected = []
    by_mode: dict[int, Counter[int]] = defaultdict(Counter)
    for call in authored:
        arguments = call["arguments"]
        if (
            len(arguments) != 3
            or arguments[1].get("kind") != "constant"
            or arguments[2].get("kind") != "constant"
        ):
            continue
        mode = arguments[1].get("value")
        value = arguments[2].get("value")
        if mode not in MODE_VALUES or value not in MODE_VALUES[mode]:
            continue
        selected.append(call)
        by_mode[mode][value] += 1
    if (
        len(authored) != 433
        or len(selected) != 431
        or Counter(len(call["arguments"]) for call in authored) != {0: 2, 3: 431}
        or {mode: sum(values.values()) for mode, values in by_mode.items()}
        != {0: 88, 1: 114, 2: 228, 3: 1}
    ):
        raise ValueError("operation-0x0118 authored inventory changed")
    dialogue = [call for call in selected if call["dialogueRegion"]]
    if len(dialogue) != 2 or any(
        [arg.get("value") for arg in call["arguments"][1:]] != [2, 1]
        for call in dialogue
    ):
        raise ValueError("operation-0x0118 dialogue inventory changed")
    return {
        "schema": "new-yokosuka-operation-0118-evidence-v1",
        "status": "exact-four-mode-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0118,
            "operationHex": "0x0118",
            "handlerAddress": "0x0c1648ac",
            "objectDwordOffset": "0x00b8",
            "objectFloatOffset": "0x00bc",
            "globalFallbackDwordAddress": "0x0c224a0c",
            "globalFallbackFloatAddress": "0x0c224a10",
            "modes": [
                {"mode": 0, "behavior": "clear indexed bit and return prior bit"},
                {"mode": 1, "behavior": "set indexed bit and return prior bit"},
                {"mode": 2, "behavior": "replace dword with low-N-bits mask"},
                {"mode": 3, "behavior": "write raw float32 word"},
            ],
            "provenBehavior": (
                "The handler resolves argument zero. Modes zero and one clear "
                "or set argument two's indexed bit in dword +0xb8 and return "
                "whether it was previously set. Mode two replaces +0xb8 with "
                "a mask containing argument two low bits. Mode three writes "
                "argument two's raw float32 word to +0xbc. A null resolution "
                "uses fixed global fields instead of becoming a no-op."
            ),
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "compiledCallCount": len(selected),
            "uncompiledZeroArgumentCallCount": len(authored) - len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({(call["disc"], call["area"]) for call in selected}),
            "modeCounts": {
                str(mode): sum(values.values())
                for mode, values in sorted(by_mode.items())
            },
            "modeValueCounts": {
                str(mode): {str(value): count for value, count in sorted(values.items())}
                for mode, values in sorted(by_mode.items())
            },
            "objectArgumentKindCounts": dict(sorted(Counter(
                call["arguments"][0]["kind"] for call in selected
            ).items())),
        },
        "evidenceBoundary": [
            "The object and global fields remain numeric; no gameplay role is inferred.",
            "The two zero-argument calls remain unresolved and uncompiled.",
            "Modes zero and one require an exact prior dword before mutation; no default flags are invented.",
            "Object availability comes from an explicit identity adapter, never proximity.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['compiledCallCount']} calls")


if __name__ == "__main__":
    main()
