#!/usr/bin/env python3
"""Verify operation 0x003f's exact native collection query routes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/collection-query-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1630DE,
        46,
        "dc3379c94777feade37d3f979b58851abb67614610ebd90f067dde653d85b471",
    ),
    "primaryQuery": (
        0x0C0E38BE,
        60,
        "aceecedd8265ecd0aaadbc4734fbcd2cab4bccd0d709a1a1ac61e7511afb1628",
    ),
    "auxiliaryQuery": (
        0x0C0E7E20,
        48,
        "92305be1d15ccc6a1acbf832bef76e453e0597080c206a5febcbeff5a0be3de1",
    ),
    "auxiliaryLookup": (
        0x0C0E7D92,
        38,
        "dd7b0f483bd9f681dd191c244eeb27a85ec682029c8741ef86468439d0258189",
    ),
}


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
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x003F
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def argument_kinds(calls: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    return {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in calls
        ).items()))
        for index in range(2)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x003f {name} changed")
    literals = {
        "resultWriter": u32(executable, 0x0C1632A4),
        "auxiliaryQuery": u32(executable, 0x0C1632B0),
        "primaryQuery": u32(executable, 0x0C1632B4),
        "primaryLowStorage": u32(executable, 0x0C0E3934),
        "primaryHighStorage": u32(executable, 0x0C0E393C),
        "auxiliaryStorage": u32(executable, 0x0C0E7FCC),
    }
    if literals != {
        "resultWriter": 0x0C0BB342,
        "auxiliaryQuery": 0x0C0E7E20,
        "primaryQuery": 0x0C0E38BE,
        "primaryLowStorage": 0x0C221A84,
        "primaryHighStorage": 0x0C221CBC,
        "auxiliaryStorage": 0x0C221DBC,
    }:
        raise ValueError("operation-0x003f dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    route_selectors = Counter(
        (
            call["arguments"][1]["value"]
            if call["arguments"][1].get("kind") == "constant"
            else call["arguments"][1].get("kind")
        )
        for call in calls
    )
    if (
        len(calls) != 217
        or len(dialogue_calls) != 59
        or any(len(call["arguments"]) != 2 for call in calls)
        or argument_kinds(calls) != {
            "0": {
                "constant": 186,
                "frame-field": 12,
                "runtime": 3,
                "unresolved": 16,
            },
            "1": {"constant": 201, "runtime": 16},
        }
        or route_selectors != {0: 192, 1: 9, "runtime": 16}
    ):
        raise ValueError("operation-0x003f authored inventory changed")
    return {
        "schema": "new-yokosuka-collection-query-evidence-v1",
        "status": "exact-native-handler-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x003F,
            "operationHex": "0x003f",
            "argumentCount": 2,
            "handlerAddress": "0x0c1630de",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": contract,
            "routes": [
                {
                    "whenArgument1": 0,
                    "indexWidth": "signed-word",
                    "validIndices": "0..234",
                    "result": "unsigned byte from the primary namespace",
                },
                {
                    "whenArgument1": "nonzero",
                    "indexWidth": "signed-byte",
                    "validIndices": "0..28",
                    "lookup": "exact auxiliary record selector",
                    "result": (
                        "unsigned record value byte, or zero when invalid "
                        "or absent"
                    ),
                },
            ],
            "provenBehavior": (
                "Argument one selects an exact read-only query over the "
                "same two native collection stores used by operation "
                "0x003d. The zero route reads the primary 235-index byte "
                "namespace. The nonzero route resolves an exact signed-byte "
                "selector in the 32 auxiliary records. Both return an "
                "unsigned byte, with invalid or absent entries returning zero."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({
                (call["disc"], call["area"])
                for call in calls
            }),
            "argumentKindCounts": argument_kinds(calls),
            "routeSelectorCounts": {
                str(key): value
                for key, value in sorted(
                    route_selectors.items(),
                    key=lambda item: str(item[0]),
                )
            },
        },
        "evidenceBoundary": [
            "The collection namespace remains numeric and is not mapped to browser item IDs.",
            "The auxiliary query's inclusive index 28 bound is preserved separately from operation 0x003d.",
            "Collection persistence ownership remains independently injected.",
            "Unresolved runtime operands remain interpreter stops.",
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
