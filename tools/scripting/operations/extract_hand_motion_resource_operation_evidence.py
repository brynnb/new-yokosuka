#!/usr/bin/env python3
"""Verify operation 0x00dd's native HMOT/HNDM request contract."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/hand-motion-resource-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handlerTableEntry": (
        0x0C29AD54, 4,
        "c0b25997a2f396f168baedbed33bc4384fd055c690424765f60f7a3f39f0d50c",
    ),
    "handler": (
        0x0C165128, 34,
        "22f88626f53d248146641c1c36b34374d1feff703bff96bece44cd92d7649b7b",
    ),
    "resourceLoader": (
        0x0C0DD744, 378,
        "b7dc8d06a31a74f0ff5685c500414f7d9fe15490075830dab5e5ff1ea82af4d8",
    ),
    "resultWriter": (
        0x0C0BB342, 6,
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


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") != "engineOperation" or action.get(
                        "operationId"
                    ) != 0x00DD:
                        continue
                    result.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                        "resultTarget": action.get("resultTarget"),
                    })
    return result


def verify_executable(data: bytes) -> dict[str, Any]:
    if digest(data) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(data, address, size)) != expected:
            raise ValueError(f"operation-0x00dd {name} changed")
    dependencies = {
        "handlerTableEntry": u32(data, 0x0C29AD54),
        "resourceLoader": u32(data, 0x0C165260),
        "resultWriter": u32(data, 0x0C165248),
        "sceneDirectoryFormat": c_string(data, u32(data, 0x0C0DD914)),
        "resourceTypeWord": u32(data, 0x0C0DD91C),
    }
    expected = {
        "handlerTableEntry": 0x0C165128,
        "resourceLoader": 0x0C0DD744,
        "resultWriter": 0x0C0BB342,
        "sceneDirectoryFormat": "scene/%02d/%c%c%c%c",
        "resourceTypeWord": 0x4D444E48,
    }
    if dependencies != expected:
        raise ValueError("operation-0x00dd native dependencies changed")
    return {
        name: f"0x{value:08x}" if isinstance(value, int) else value
        for name, value in dependencies.items()
    }


def build_report(data: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    native_contract = verify_executable(data)
    inventory = calls(event_ir)
    shapes = Counter(tuple(arg.get("kind") for arg in call["arguments"])
                     for call in inventory)
    expected_shapes = Counter({
        ("constant", "constant", "static-pointer"): 51,
        ("unresolved", "unresolved", "operation-result"): 6,
    })
    exact = [call for call in inventory
             if tuple(arg.get("kind") for arg in call["arguments"])
             == ("constant", "constant", "static-pointer")]
    op00 = [call for call in inventory
            if call["disc"] == 1 and call["area"] == "OP00"]
    op00_mapinfo = ROOT / ".disc-work/mapinfo/disc1/SCENE/01/OP00/MAPINFO.BIN"
    op00_bytes = op00_mapinfo.read_bytes()
    pointer = op00[0]["arguments"][2].get("value") if len(op00) == 1 else -1
    op00_filename = op00_bytes[pointer:op00_bytes.find(b"\0", pointer)].decode("ascii")
    if (
        len(inventory) != 57
        or shapes != expected_shapes
        or len(exact) != 51
        or sum(call["dialogue"] for call in inventory) != 4
        or sum(call["resultTarget"] is not None for call in inventory) != 24
        or len(op00) != 1
        or op00[0]["functionFileOffset"] != "0x1512a"
        or op00[0]["callFileOffset"] != "0x154ae"
        or [arg.get("value") for arg in op00[0]["arguments"]]
        != [1, 0x3030504F, 0x223D8]
        or op00_filename != "HMOT0102.BIN"
    ):
        raise ValueError("operation-0x00dd authored inventory changed")
    return {
        "schema": "new-yokosuka-hand-motion-resource-operation-evidence-v1",
        "status": "exact-native-HNDM-request-contract-and-full-ir-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
            "op00MapinfoSha256": digest(op00_bytes),
        },
        "operation": {
            "operationId": 0x00DD,
            "operationHex": "0x00dd",
            "argumentCount": 3,
            "handlerAddress": "0x0c165128",
            "verifiedRanges": {
                name: {"address": f"0x{address:08x}", "length": size,
                       "sha256": expected}
                for name, (address, size, expected) in RANGES.items()
            },
            "nativeContract": native_contract,
            "resourceType": "HNDM",
            "provenBehavior": (
                "Resolve argument two as a filename, build "
                "scene/%02d/%c%c%c%c from signed argument zero and the four "
                "little-endian bytes of argument one, load the named HNDM "
                "resource, and publish the returned opaque handle as the "
                "operation result."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(inventory),
            "exactOperandCallCount": len(exact),
            "unresolvedWrapperCallCount": len(inventory) - len(exact),
            "argumentShapes": [
                {"kinds": list(shape), "count": count}
                for shape, count in sorted(shapes.items())
            ],
            "dialogueRegionCallCount": sum(call["dialogue"] for call in inventory),
            "resultTargetCount": sum(call["resultTarget"] is not None
                                     for call in inventory),
            "op00": {**op00[0], "filename": op00_filename},
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
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


if __name__ == "__main__":
    main()
