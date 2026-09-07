#!/usr/bin/env python3
"""Verify operation 0x003d's exact native collection increment routes."""

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
    PROJECT_ROOT / "tools/evidence/collection-increment-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C163060,
        64,
        "821fccb5186efafd94a38c2652e69821d0fb963b7d70c417568ab7ce7fff3280",
    ),
    "primaryIncrement": (
        0x0C0E38B6,
        246,
        "6206468c2530626bc730d20083dae4ed4daa0fd147f88bd6010aa82fa4041c76",
    ),
    "auxiliaryIncrement": (
        0x0C0E7D18,
        122,
        "41932011de70c0e84365f6cc719c7ef23ad86e715e0f2777368cad4db6ea8ccc",
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
                        or action.get("operationId") != 0x003D
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
        for index in range(4)
    }


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x003d {name} changed")
    literals = {
        "primaryIncrement": u32(executable, 0x0C1632A0),
        "auxiliaryIncrement": u32(executable, 0x0C16329C),
        "resultWriter": u32(executable, 0x0C1632A4),
        "primaryLowStorage": u32(executable, 0x0C0E3A10),
        "primaryHighStorage": u32(executable, 0x0C0E3A20),
        "primaryLowPreparation": u32(executable, 0x0C0E3A14),
        "registeredSpecialCallback": u32(executable, 0x0C0E3A18),
        "fixedSpecialCallback": u32(executable, 0x0C0E3A1C),
        "auxiliaryStorage": u32(executable, 0x0C0E7FCC),
    }
    if literals != {
        "primaryIncrement": 0x0C0E38B6,
        "auxiliaryIncrement": 0x0C0E7D18,
        "resultWriter": 0x0C0BB342,
        "primaryLowStorage": 0x0C221A84,
        "primaryHighStorage": 0x0C221CBC,
        "primaryLowPreparation": 0x0C0E9CC2,
        "registeredSpecialCallback": 0x0C1514D8,
        "fixedSpecialCallback": 0x0C0E9A58,
        "auxiliaryStorage": 0x0C221DBC,
    }:
        raise ValueError("operation-0x003d dependencies changed")
    return {name: f"0x{value:08x}" for name, value in literals.items()}


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    dialogue_calls = [call for call in calls if call["dialogueRegion"]]
    modes = Counter(
        (
            call["arguments"][3].get("value")
            if call["arguments"][3].get("kind") == "constant"
            else call["arguments"][3].get("kind")
        )
        for call in calls
    )
    if (
        len(calls) != 221
        or len(dialogue_calls) != 62
        or any(len(call["arguments"]) != 4 for call in calls)
        or argument_kinds(calls) != {
            "0": {
                "constant": 130,
                "frame-field": 70,
                "runtime": 12,
                "scene-field": 8,
                "unresolved": 1,
            },
            "1": {"constant": 219, "frame-field": 1, "unresolved": 1},
            "2": {"constant": 220, "unresolved": 1},
            "3": {"constant": 220, "runtime": 1},
        }
        or modes != {0: 198, 1: 22, "runtime": 1}
    ):
        raise ValueError("operation-0x003d authored inventory changed")
    return {
        "schema": "new-yokosuka-collection-increment-evidence-v1",
        "status": "exact-native-handler-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x003D,
            "operationHex": "0x003d",
            "argumentCount": 4,
            "handlerAddress": "0x0c163060",
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
                    "whenArgument3": 0,
                    "indexWidth": "signed-word",
                    "validIndices": "0..234",
                    "quantityWidth": "unsigned-byte",
                    "storage": [
                        {"indices": "0..66", "address": "0x0c221a84"},
                        {"indices": "67..234", "address": "0x0c221cbc"},
                    ],
                    "saturation": "values above 255 become 255",
                    "result": "one unless saturation occurred; otherwise zero",
                },
                {
                    "whenArgument3": "nonzero",
                    "indexWidth": "signed-byte",
                    "validIndices": "0..27",
                    "quantityWidth": "unsigned-byte",
                    "storageAddress": "0x0c221dbc",
                    "recordCount": 32,
                    "recordSize": 2,
                    "fallbackSelector": -1,
                    "saturation": "values at or above 255 become 255",
                    "result": "one when a record resolves; otherwise zero",
                },
            ],
            "provenBehavior": (
                "Argument three selects one of two exact byte-increment "
                "stores. The primary route updates a 235-index namespace in "
                "two native arrays, preserves its low-index preparation and "
                "four exact special callbacks, saturates above 255, and "
                "returns whether saturation was avoided. The auxiliary route "
                "resolves one of 32 two-byte records by signed selector or "
                "fallback -1, installs the requested selector, saturates at "
                "255, compacts positive records, and returns whether a record "
                "resolved. Argument two is forwarded but unused by both "
                "native helpers."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "dialogueRegionCallCount": len(dialogue_calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentKindCounts": argument_kinds(calls),
            "routeSelectorCounts": {
                str(key): value for key, value in sorted(
                    modes.items(), key=lambda item: str(item[0])
                )
            },
        },
        "evidenceBoundary": [
            "Collection is retained as the existing native subsystem identity.",
            "Native numeric indices are not mapped onto generic browser item IDs.",
            "Persistence ownership remains outside scene state and must be injected.",
            "Primary preparation, special, and summary-update calls remain exact adapter boundaries.",
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
    print(f"Wrote {args.out}: {report['allDiscInventory']['provenCallCount']} proven calls")


if __name__ == "__main__":
    main()
