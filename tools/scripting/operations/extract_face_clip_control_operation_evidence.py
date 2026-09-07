#!/usr/bin/env python3
"""Verify operation 0x0113's exact FACE/CLIP record mutation."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/face-clip-control-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C164EB8,
        56,
        "5da94d1dce59b7d03359981026f9178496f2d84f6de10fc015733ddaf7be4dfe",
    ),
    "actorResolver": (
        0x0C153956,
        58,
        "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f",
    ),
    "momtPrecheck": (
        0x0C114314,
        28,
        "8c6e31027a4ae437740f04597870e04214c5e395e171244fd410cdf2a9235bf4",
    ),
    "faceClipMutator": (
        0x0C0BC688,
        146,
        "2e43e43f27db389fd256138a7364f1f32a49ca70f4cd34aca4afdea965922ae1",
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x0113
                    ):
                        calls.append({
                            "disc": item["disc"],
                            "area": item["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return calls


def verify_executable(data: bytes) -> dict[str, str]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0113 {name} changed")
    contract = {
        "handlerTableEntry": u32(data, 0x0C29AE2C),
        "actorResolver": u32(data, 0x0C164F8C),
        "momtPrecheck": u32(data, 0x0C164F90),
        "faceClipMutator": u32(data, 0x0C164FBC),
        "momtTag": u32(data, 0x0C114440),
        "faceTag": u32(data, 0x0C0BC774),
        "clipTag": u32(data, 0x0C0BC77C),
    }
    expected = {
        "handlerTableEntry": 0x0C164EB8,
        "actorResolver": 0x0C153956,
        "momtPrecheck": 0x0C114314,
        "faceClipMutator": 0x0C0BC688,
        "momtTag": 0x4D544F4D,
        "faceTag": 0x45434146,
        "clipTag": 0x50494C43,
    }
    if contract != expected:
        raise ValueError("operation-0x0113 native dependencies changed")
    tags = {"momtTag", "faceTag", "clipTag"}
    return {
        name: (
            value.to_bytes(4, "little").decode("ascii")
            if name in tags
            else f"0x{value:08x}"
        )
        for name, value in contract.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    authored = operation_calls(event_ir)
    proven = [call for call in authored if len(call["arguments"]) == 4]
    dialogue = [call for call in proven if call["dialogue"]]
    argument_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in proven
        ).items()))
        for index in range(4)
    }
    expected_kinds = {
        "0": {"constant": 940, "frame-field": 126},
        "1": {"constant": 1043, "frame-field": 23},
        "2": {"constant": 1043, "frame-field": 23},
        "3": {"constant": 1043, "frame-field": 23},
    }
    dialogue_kinds = {
        str(index): dict(sorted(Counter(
            call["arguments"][index]["kind"] for call in dialogue
        ).items()))
        for index in range(4)
    }
    if (
        len(authored) != 1067
        or len(proven) != 1066
        or len(dialogue) != 38
        or Counter(len(call["arguments"]) for call in authored)
            != {0: 1, 4: 1066}
        or argument_kinds != expected_kinds
        or dialogue_kinds != {
            "0": {"constant": 34, "frame-field": 4},
            "1": {"constant": 38},
            "2": {"constant": 38},
            "3": {"constant": 38},
        }
        or any(
            call["resultComparison"] is not None
            or call["resultTarget"] is not None
            for call in authored
        )
    ):
        raise ValueError("operation-0x0113 authored inventory changed")
    return {
        "schema": "new-yokosuka-face-clip-control-operation-evidence-v1",
        "status": "exact-record-writes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0113,
            "operationHex": "0x0113",
            "handlerAddress": "0x0c164eb8",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "recordContract": {
                "prerequisites": ["resolved actor", "MOMT", "FACE", "CLIP"],
                "faceWrites": [
                    {
                        "offset": "0x2c",
                        "width": 2,
                        "value": "low16(argument1) * 6, low16 result",
                    },
                    {
                        "offset": "0x2e",
                        "width": 2,
                        "value": "signed-low16(argument3) clamped to at least 1",
                    },
                    {
                        "offset": "0x45",
                        "width": 1,
                        "value": 1,
                        "condition": "signed FACE byte +0x47 <= 1",
                    },
                    {
                        "offset": "0x4a",
                        "width": 2,
                        "value": "clamped argument3",
                        "condition": (
                            "signed FACE byte +0x47 <= 1 and "
                            "FACE byte +0x45 == 0"
                        ),
                    },
                ],
                "clipWrites": [
                    {
                        "offset": "0x10",
                        "width": 1,
                        "value": (
                            "1 when signed-low16(argument2) == -1, otherwise 2"
                        ),
                    },
                    {
                        "offset": "0x16",
                        "width": 2,
                        "value": "clamped argument3",
                    },
                    {
                        "offset": "0x1c",
                        "width": 2,
                        "value": "low16(argument2)",
                    },
                ],
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "provenCallCount": len(proven),
            "unresolvedMalformedCallCount": len(authored) - len(proven),
            "dialogueRegionCallCount": len(dialogue),
            "areaCount": len({
                (call["disc"], call["area"]) for call in proven
            }),
            "argumentKindCounts": argument_kinds,
            "dialogueArgumentKindCounts": dialogue_kinds,
        },
        "evidenceBoundary": [
            "The record names are literal executable fourcc values, not inferred domain labels.",
            "Missing actors or any prerequisite record are exact native no-ops.",
            "All arithmetic is preserved at SH-4 word width and signedness.",
            "Only the 1,066 complete four-argument calls are promoted.",
            "The single zero-argument scanner detection remains unresolved.",
            "No result from the operation feeds a comparison or stored result target.",
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
