#!/usr/bin/env python3
"""Verify the exact native indexed-controller initializer operation family."""

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
DEFAULT_OUTPUT = ROOT / "tools/evidence/indexed-controller-subsystem-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
OPERATIONS = {
    0x0062: (0x0C1645B8, 14, "78b0cac50968628a77e6db4d119929802764570e293b6f87ccb0e82e3ae59c59"),
    0x0064: (0x0C164480, 14, "4204bb0d941d235e5870174c8c69ee0c5b224ab12f75d700762dda76291e27ec"),
    0x0068: (0x0C1645D6, 16, "ad082b8f7e6a654c3da2d0d7f7d8049b22b78e0489910381a226bed63f232303"),
    0x0069: (0x0C1645E6, 16, "ed460cb2b34ac4fd15ab427fe70f23b41001225b8b1e169de2385242adb8a965"),
    0x006A: (0x0C1645F6, 16, "2c4a96c2ee28651f94c234d1de77adc0a209192f24b733c40e539efef8e3d7aa"),
}
HELPERS = {
    "float4Write": (0x0C0EAEE0, 30, "804ba07a0e2dda7fa5a9d8ea5440d445f17aefe6518cf798413a3f561cb21a32"),
    "resetAll": (0x0C0EB9F4, 82, "a50407e2e045f5ddf91d7a6709f775774de353f9f3c866ba88260c74f4da8503"),
    "initializeRecord": (0x0C0EB988, 108, "bd4bad89e6932d10b5a08b7aebbb66e751da6335b8dc15b88dce3a8197d638cb"),
    "mode2": (0x0C0EC358, 44, "0db5a96b802ce4e68635a77cdc8a7c089ea09c6326a92aa5971fc093b32610e8"),
    "mode3": (0x0C0EC384, 44, "67c298573b7050a553b0efa46bea257cf4d7e06676b2be8e7a24f69665ad93b6"),
    "mode4": (0x0C0EC3B0, 52, "f137f40bf2693e37698829e06d07137dcb1350f2173d5b48a68cf1127a11d97d"),
    "vector40": (0x0C0EB63A, 114, "dc946d20afe5fae0eba740d34160b8727c6ba227fdea4e8cc5397fb805ee5112"),
    "vector52": (0x0C0EB714, 120, "41a740bbd7f43b86794edf44886ef462d1f9c220dea28266b72da5b723a31e47"),
    "activation": (0x0C0EAF8E, 122, "88d9614f5750b974c754c2a9b6261884e703af4705841260e363e3cb31efe640"),
}
DISPATCH_TARGETS = {
    0x0062: 0x0C1645B8,
    0x0064: 0x0C164480,
    0x0068: 0x0C1645D6,
    0x0069: 0x0C1645E6,
    0x006A: 0x0C1645F6,
}
WRAPPER_TARGETS = {
    0x0062: (0x0C164808, 0x0C0EB9F4),
    0x0064: (0x0C1644CC, 0x0C0EAEE0),
    0x0068: (0x0C164810, 0x0C0EC358),
    0x0069: (0x0C164814, 0x0C0EC384),
    0x006A: (0x0C164818, 0x0C0EC3B0),
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} unavailable")
    return data[start:start + size]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def calls_for(event_ir: dict[str, Any], operation_id: int) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") != "engineOperation":
                        continue
                    if action.get("operationId") != operation_id:
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogue": function.get("dialogueRegion") is not None,
                        "arguments": action.get("arguments", []),
                    })
    return calls


def verify_executable(executable: bytes) -> None:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for operation_id, (address, size, expected) in OPERATIONS.items():
        if digest(runtime_slice(executable, address, size)) != expected:
            raise ValueError(f"operation 0x{operation_id:04x} handler changed")
        table_address = 0x0C29A9E0 + operation_id * 4
        if u32(executable, table_address) != DISPATCH_TARGETS[operation_id]:
            raise ValueError(f"operation 0x{operation_id:04x} dispatch changed")
    for name, (address, size, expected) in HELPERS.items():
        if digest(runtime_slice(executable, address, size)) != expected:
            raise ValueError(f"indexed-controller helper {name} changed")
    for operation_id, (literal, target) in WRAPPER_TARGETS.items():
        if u32(executable, literal) != target:
            raise ValueError(f"operation 0x{operation_id:04x} helper changed")


def inventory(calls: list[dict[str, Any]]) -> dict[str, Any]:
    shapes = Counter(
        tuple(argument.get("kind", "unknown") for argument in call["arguments"])
        for call in calls
    )
    return {
        "callCount": len(calls),
        "discAreaCount": len({(call["disc"], call["area"]) for call in calls}),
        "dialogueRegionCallCount": sum(call["dialogue"] for call in calls),
        "argumentCounts": dict(sorted(Counter(
            len(call["arguments"]) for call in calls
        ).items())),
        "argumentShapes": {
            ",".join(shape): count for shape, count in sorted(shapes.items())
        },
    }


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    verify_executable(executable)
    inventories = {
        f"0x{operation_id:04x}": inventory(calls_for(event_ir, operation_id))
        for operation_id in OPERATIONS
    }
    return {
        "schema": "new-yokosuka-indexed-controller-subsystem-evidence-v1",
        "executable": {
            "sha256": EXECUTABLE_SHA256,
            "runtimeBase": "0x0c010000",
        },
        "operations": {
            "0x0062": {"behavior": "reset-128-records-and-select-global-mode"},
            "0x0064": {"behavior": "copy-four-raw-words-and-present"},
            "0x0068": {"mode": 2, "vectorOffset": "0x34", "wordCount": 3},
            "0x0069": {"mode": 3, "vectorOffset": "0x28", "wordCount": 3},
            "0x006a": {"mode": 4, "vectorOffsets": ["0x28", "0x34"], "wordCountEach": 3},
        },
        "verifiedRanges": {
            **{
                f"operation-0x{operation_id:04x}": {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                    "dispatchTarget": f"0x{DISPATCH_TARGETS[operation_id]:08x}",
                    "helperTarget": f"0x{WRAPPER_TARGETS[operation_id][1]:08x}",
                }
                for operation_id, (address, size, expected) in OPERATIONS.items()
            },
            **{
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in HELPERS.items()
            },
        },
        "nativeBoundary": {
            "recordCount": 128,
            "mirrorRecordCount": 32,
            "lowIndicesInvokeCallbacks": True,
            "operation0062InvokesPresentationCallback": True,
            "operation0064InvokesPresentationCallback": True,
        },
        "allDiscInventory": inventories,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text(encoding="utf-8")),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
