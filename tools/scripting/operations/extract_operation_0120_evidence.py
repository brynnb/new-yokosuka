#!/usr/bin/env python3
"""Verify operation 0x0120's three exact fixed-record routes."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-0120-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C164AE6,
        120,
        "c4c0d89f30886d30d70949d09740256cbf25e830c8f27fe0bcbf83ce107ac7a5",
    ),
    "singleRecordWriter": (
        0x0C0B50BA,
        32,
        "331facdc40ce326b7ffb48a6ac0e9569324a62541ef4b38cd0b693ef31f1b3ce",
    ),
    "modeZeroBroadcast": (
        0x0C0B50EE,
        44,
        "4412ba3899edb858af91169d7300b55111b1ff54b5d78b61ec23a7c3d7db2239",
    ),
    "modeOneQuery": (
        0x0C0B50DC,
        18,
        "91e71228fd20c22393e8887fb3b36d55799ad5f050509953c83cb804e1210e54",
    ),
    "modeTwoQuery": (
        0x0C1307E4,
        22,
        "6393fde6eddd74b83a7e08ee67c46b0c3b8557ece34b72b015c79a81e7173fa2",
    ),
    "modeTwoWriter": (
        0x0C1307FA,
        20,
        "16fde96b08ec3a2a7ca3029c797ddfbb462dc3c66a7979fbde33ba69e73cf228",
    ),
    "recordTableInitializer": (
        0x0C0B4B9C,
        32,
        "aea8e8b1efb416a3e3b493d36ff0cb5bea3ab09cbe8d814d8103a342488aa41e",
    ),
    "recordPresenceSetter": (
        0x0C0B4BBC,
        16,
        "e1fd0dc3030b43b9784e34f7888b8e9c12cb60a02ad689aa10e07aa8dad53ca8",
    ),
    "clipLoaderRecordRoute": (
        0x0C12F40E,
        68,
        "7318996dec11ca778725ab969849001e75e72c5ebaca578aab171251535170cb",
    ),
    "clipConsumerGate": (
        0x0C0B4CAC,
        30,
        "83cc43fd5760d4074d44be2f721745b51315a8c4ac8f19bcd48b9de1b5b3dd33",
    ),
    "mapLayerClipLoaderRoute": (
        0x0C13023A,
        40,
        "c1f82114156ed3559193041202fdaf197c2da6436224ab602e54f5480c911f4d",
    ),
    "mapLayerClipSourceResolver": (
        0x0C13075A,
        38,
        "f5de306a4adb3709033609242bd188f17d9926695bcbf01c86a6e98d144cf321",
    ),
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


def constant(argument: dict[str, Any]) -> int | None:
    return argument.get("value") if argument.get("kind") == "constant" else None


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0120
                    ):
                        continue
                    arguments = action.get("arguments", [])
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": arguments,
                        "mode": constant(arguments[0]) if arguments else None,
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0120 {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AE60),
        "integerResultWriter": u32(data, 0x0C164C2C),
        "modeZeroBroadcast": u32(data, 0x0C164C70),
        "modeOneQuery": u32(data, 0x0C164C74),
        "singleRecordWriter": u32(data, 0x0C164C78),
        "modeTwoQuery": u32(data, 0x0C164C7C),
        "modeTwoWriter": u32(data, 0x0C164C80),
        "fixedRecordTable": u32(data, 0x0C0B5148),
        "recordTableInitializerBase": u32(data, 0x0C0B4C4C),
        "clipConsumerTable": u32(data, 0x0C0B4EDC),
        "clipResourceTag": u32(data, 0x0C12F4A8),
        "clipPresenceSetter": u32(data, 0x0C12F4FC),
        "clipActivityWriter": u32(data, 0x0C12F500),
        "mapLayerClipLoader": u32(data, 0x0C130378),
        "mapLayerRecordTable": u32(data, 0x0C13037C),
    }
    expected = {
        "handlerTableEntry": 0x0C164AE6,
        "integerResultWriter": 0x0C0BB358,
        "modeZeroBroadcast": 0x0C0B50EE,
        "modeOneQuery": 0x0C0B50DC,
        "singleRecordWriter": 0x0C0B50BA,
        "modeTwoQuery": 0x0C1307E4,
        "modeTwoWriter": 0x0C1307FA,
        "fixedRecordTable": 0x0C2020F0,
        "recordTableInitializerBase": 0x0C2020F0,
        "clipConsumerTable": 0x0C2020F0,
        "clipResourceTag": 0x50494C43,
        "clipPresenceSetter": 0x0C0B4BBC,
        "clipActivityWriter": 0x0C0B50BA,
        "mapLayerClipLoader": 0x0C12F378,
        "mapLayerRecordTable": 0x0C21C768,
    }
    if dependencies != expected:
        raise ValueError("operation-0x0120 native dependencies changed")
    return {name: f"0x{value:08x}" for name, value in dependencies.items()}


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    selected = [
        call for call in authored
        if (
            call["mode"] in (0, 1, 2)
            and len(call["arguments"]) == (2 if call["mode"] == 0 else 3)
            and all(
                argument.get("kind") == "constant"
                for argument in call["arguments"]
            )
        )
    ]
    dialogue = [call for call in selected if call["dialogue"]]
    mode_counts = Counter(call["mode"] for call in selected)
    values = Counter(
        call["arguments"][-1]["value"] for call in selected
    )
    dialogue_values = Counter(
        call["arguments"][1]["value"] for call in dialogue
    )
    if (
        len(authored) != 220
        or Counter(len(call["arguments"]) for call in authored)
            != {2: 173, 3: 47}
        or Counter(call["mode"] for call in authored)
            != {0: 173, 1: 35, 2: 12}
        or len(selected) != 220
        or len(dialogue) != 37
        or mode_counts != {0: 173, 1: 35, 2: 12}
        or values != {0: 111, 1: 107, 0xFFFFFFFF: 2}
        or dialogue_values != {0: 19, 1: 18}
        or sum(
            call["resultComparison"] is not None for call in selected
        ) != 3
        or any(call["resultTarget"] is not None for call in selected)
    ):
        raise ValueError("operation-0x0120 authored inventory changed")

    return {
        "schema": "new-yokosuka-operation-0120-evidence-v2",
        "status": (
            "exact-native-clip-layer-routes-and-all-disc-inventory"
        ),
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0120,
            "operationHex": "0x0120",
            "handlerAddress": "0x0c164ae6",
            "modes": [0, 1, 2],
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "recordCount": 32,
            "recordStride": 20,
            "presenceFieldOffset": 0,
            "writtenFieldOffset": 8,
            "provenBehavior": (
                "Mode zero visits all 32 fixed records at 0x0c2020f0 with "
                "stride 20. A record whose dword +0x00 is nonzero receives "
                "argument one unchanged at dword +0x08; a record whose "
                "dword +0x00 is zero receives zero at dword +0x08."
            ),
            "clipLayerContract": {
                "resourceTag": "CLIP",
                "loaderAddress": "0x0c12f378",
                "recordTableAddress": "0x0c2020f0",
                "mapLayerRecordTableAddress": "0x0c21c768",
                "mapLayerRecordCount": 32,
                "mapLayerRecordStride": 96,
                "behavior": (
                    "The native MAP-layer loader passes its exact numbered "
                    "layer index to the CLIP loader. The CLIP loader clears "
                    "that index's fixed record, sets dword +0x00 only when "
                    "parsed CLIP data exists, and writes dword +0x08 through "
                    "the same helper used by operation 0x0120. The CLIP "
                    "consumer skips a record unless both dword +0x00 and "
                    "dword +0x08 are nonzero."
                ),
            },
            "routes": [
                {
                    "mode": 0,
                    "argumentCount": 2,
                    "behavior": (
                        "Broadcast argument one to active dword +0x08 "
                        "fields and zero inactive fields, then return zero."
                    ),
                },
                {
                    "mode": 1,
                    "argumentCount": 3,
                    "behavior": (
                        "Return the selected record's old dword +0x08, then "
                        "write argument two there when dword +0x00 is nonzero "
                        "or write zero otherwise."
                    ),
                },
                {
                    "mode": 2,
                    "argumentCount": 3,
                    "behavior": (
                        "Return the selected 96-byte record's old dword "
                        "+0x34, then replace it with argument two."
                    ),
                },
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(selected),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(mode_counts.items())
            },
            "valueCounts": {
                str(value): count for value, count in sorted(values.items())
            },
            "dialogueValueCounts": {
                str(value): count
                for value, count in sorted(dialogue_values.items())
            },
            "resultComparisonCount": 3,
            "resultTargetCount": 0,
        },
        "evidenceBoundary": [
            "Only the exact constant argument shapes inventoried for modes zero through two receive this semantic.",
            "Modes zero and one own active processing of parsed CLIP data for exact numbered native MAP layers; this does not prove any broader visual-layer or arbitrary-mesh behavior.",
            "Mode two targets the separate 32-by-96 native MAP-layer table at dword +0x34; that field's higher-level meaning remains unproved and has no Babylon adapter.",
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
