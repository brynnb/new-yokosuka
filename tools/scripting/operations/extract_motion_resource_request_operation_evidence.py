#!/usr/bin/env python3
"""Verify operation 0x0084's native motion-resource request contract."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/motion-resource-request-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29ABF0,
        4,
        "71e573567fb35edb1cf63d1b4b23ab29688cba202b654f4bd5955c9e1fedd667",
    ),
    "handler": (
        0x0C165FD2,
        78,
        "099fc64c27f190e23d3451548c9d820d2a01d6c64dc1283d197462d1e719a97a",
    ),
    "stringCompare": (
        0x0C1DC710,
        114,
        "7fb80bf6a25a2799896e5a0d773df768c4df79a69abcc2a82ca60b03ce11db2c",
    ),
    "sceneRequestBuilder": (
        0x0C10BB10,
        70,
        "85083c7390855b7ba42798ae89be257591ec031e06df403cfb28bda47151ebd3",
    ),
    "miscRequestBuilder": (
        0x0C10BAE2,
        16,
        "f9bad6b3ccb4bf6835ddcc9ddad429981abcaf2077cb22378126a2aa0b9e1f1f",
    ),
    "requestQueue": (
        0x0C10BA8A,
        88,
        "9c06668e249d9a49b5898f5411bb6dd94519e03394bc1473e797a8b7e97ee25e",
    ),
    "resultWriter": (
        0x0C0BB342,
        6,
        "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2",
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


def c_string(data: bytes, address: int) -> str:
    start = address - BASE
    end = data.find(b"\0", start)
    if start < 0 or end < start:
        raise ValueError(f"native string at 0x{address:08x} is unavailable")
    return data[start:end].decode("ascii")


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0084
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultComparison": action.get("resultComparison"),
                        "resultTarget": action.get("resultTarget"),
                    })
    return calls


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x0084 {name} changed")

    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29ABF0),
        "globalMotionObjectFilename": c_string(data, u32(data, 0x0C1660B4)),
        "stringCompare": u32(data, 0x0C1660B8),
        "globalMotionDoorFilename": c_string(data, u32(data, 0x0C1660BC)),
        "miscDirectory": c_string(data, u32(data, 0x0C1660C0)),
        "miscRequestBuilder": u32(data, 0x0C1660C4),
        "sceneRequestBuilder": u32(data, 0x0C1660C8),
        "resultWriter": u32(data, 0x0C1660CC),
        "sceneDirectoryFormat": c_string(data, u32(data, 0x0C10BCC4)),
        "resourceTypeWord": u32(data, 0x0C10BCCC),
        "requestQueue": u32(data, 0x0C10BCD0),
    }
    expected = {
        "handlerTableEntry": 0x0C165FD2,
        "globalMotionObjectFilename": "M_MOBJ.BIN",
        "stringCompare": 0x0C1DC710,
        "globalMotionDoorFilename": "M_MDOR.BIN",
        "miscDirectory": "misc",
        "miscRequestBuilder": 0x0C10BAE2,
        "sceneRequestBuilder": 0x0C10BB10,
        "resultWriter": 0x0C0BB342,
        "sceneDirectoryFormat": "scene/%02d/%c%c%c%c",
        "resourceTypeWord": 0x49544F4D,
        "requestQueue": 0x0C0BE5EE,
    }
    if dependencies != expected:
        raise ValueError("operation-0x0084 native dependencies changed")
    return {
        key: f"0x{value:08x}" if isinstance(value, int) else value
        for key, value in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    calls = operation_calls(event_ir)
    shapes = Counter(tuple(
        argument.get("kind") for argument in call["arguments"]
    ) for call in calls)
    expected_shapes = Counter({
        ("constant", "constant", "static-pointer"): 95,
        ("frame-field", "constant", "static-pointer"): 12,
        ("scene-field", "constant", "static-pointer"): 4,
        ("operation-result", "constant", "static-pointer"): 134,
    })
    op00_calls = [
        call for call in calls
        if call["disc"] == 1 and call["area"] == "OP00"
    ]
    if (
        len(calls) != 245
        or Counter(len(call["arguments"]) for call in calls) != {3: 245}
        or shapes != expected_shapes
        or sum(call["dialogue"] for call in calls) != 4
        or any(call["resultComparison"] is not None for call in calls)
        or [call["callFileOffset"] for call in op00_calls]
        != ["0x15476", "0x15492", "0x154ca", "0x154e6"]
        or [call["arguments"][0].get("value") for call in op00_calls]
        != [1, 1, 1, 1]
        or [call["arguments"][1].get("ascii") for call in op00_calls]
        != ["OP00", "OP00", "OP00", "OP00"]
        or [call["arguments"][2].get("value") for call in op00_calls]
        != [0x223C3, 0x223CF, 0x223E5, 0x223F1]
    ):
        raise ValueError("operation-0x0084 authored inventory changed")

    exact_calls = [
        call for call in calls
        if call["arguments"][2].get("kind") == "static-pointer"
        and call["arguments"][1].get("kind") == "constant"
        and call["arguments"][0].get("kind") in {
            "constant", "frame-field", "operation-result", "runtime",
            "scene-field",
        }
    ]
    return {
        "schema": "new-yokosuka-motion-resource-request-operation-evidence-v1",
        "status": "exact-native-request-routing-and-full-ir-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0084,
            "operationHex": "0x0084",
            "argumentCount": 3,
            "handlerAddress": "0x0c165fd2",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "provenBehavior": (
                "Resolve argument two as a filename. M_MOBJ.BIN and "
                "M_MDOR.BIN are requested from misc; every other filename is "
                "requested from scene/%02d/%c%c%c%c using signed argument "
                "zero and the four little-endian bytes of argument one. Queue "
                "the request as MOTI and write its returned handle to the "
                "operation result."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "exactOperandCallCount": len(exact_calls),
            "unresolvedWrapperCallCount": len(calls) - len(exact_calls),
            "currentSceneResultCallCount": sum(
                call["arguments"][0].get("kind") == "operation-result"
                for call in calls
            ),
            "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
            "resultTargetCount": sum(
                call["resultTarget"] is not None for call in calls
            ),
            "argumentKindShapes": {
                ",".join(shape): count
                for shape, count in sorted(shapes.items())
            },
            "discCounts": dict(sorted(Counter(
                str(call["disc"]) for call in calls
            ).items())),
            "op00": {
                "callFileOffsets": [
                    call["callFileOffset"] for call in op00_calls
                ],
                "filenamePointers": [
                    f"0x{call['arguments'][2]['value']:08x}"
                    for call in op00_calls
                ],
            },
        },
        "evidenceBoundary": [
            "The operation queues a MOTI resource request; it does not itself parse or play the returned motion data.",
            "The two global filenames and all path routing are executable-backed and are not scene-specific policy.",
            "The structural IR proves all 245 authored calls, including 134 generated wrappers that preserve the area and filename across current-scene query 0x019c and consume its exact operation result as the disc argument.",
            "The request handle is an opaque native queue identity. A browser adapter must allocate its own stable handle rather than treating a filename as the result.",
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
        f"{report['allDiscInventory']['exactOperandCallCount']} exact calls"
    )


if __name__ == "__main__":
    main()
