#!/usr/bin/env python3
"""Verify operation 0x0027's direct object scale-vector write."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/object-scale-vector-operation-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C164D44, 54, "5367587824861ab6a417d4150a2b29eae14ba6708afcd8446b303be17f99ea41"),
    "objectResolver": (0x0C153956, 58, "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f"),
    "momtExists": (0x0C114314, 28, "8c6e31027a4ae437740f04597870e04214c5e395e171244fd410cdf2a9235bf4"),
    "directScaleWrite": (0x0C0AB1FC, 20, "76c67a0496c80856fb4f7fa160a5601a2aa5dc11e79bbf5abd7d6556f53a17ca"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def calls(event_ir: dict) -> list[dict]:
    result = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") == "engineOperation" and action.get("operationId") == 0x0027:
                        result.append({
                            "disc": native_map["disc"],
                            "area": native_map["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "arguments": action.get("arguments", []),
                            "resultComparison": action.get("resultComparison"),
                            "resultTarget": action.get("resultTarget"),
                        })
    return result


def build_report(executable: bytes, event_ir: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(executable, address, size)) != expected:
            raise ValueError(f"operation-0x0027 {name} changed")
    inventory = calls(event_ir)
    shapes = Counter(tuple(arg.get("kind") for arg in call["arguments"]) for call in inventory)
    expected_shapes = Counter({
        ("constant", "frame-address"): 137,
        ("frame-field", "frame-address"): 115,
        ("constant", "static-pointer"): 72,
        ("runtime", "frame-address"): 44,
        ("frame-field", "static-pointer"): 14,
        ("scene-field", "frame-address"): 11,
    })
    if (
        len(inventory) != 393
        or len({(item["disc"], item["area"]) for item in inventory}) != 102
        or sum(item["dialogue"] for item in inventory) != 19
        or shapes != expected_shapes
        or any(len(item["arguments"]) != 2 for item in inventory)
        or any(item["resultComparison"] is not None or item["resultTarget"] is not None for item in inventory)
    ):
        raise ValueError("operation-0x0027 authored inventory changed")
    return {
        "schema": "new-yokosuka-object-scale-vector-operation-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 39,
            "operationHex": "0x0027",
            "semanticId": "resolved-object-scale-vector-write",
            "handlerAddress": "0x0c164d44",
            "arguments": ["resolved object reference", "three-float scale vector pointer"],
            "nativeContract": {
                "objectResolver": "0x0c153956",
                "momtExistsGate": "0x0c114314",
                "directScaleWrite": "0x0c0ab1fc",
                "directObjectOffsets": ["+0x34", "+0x38", "+0x3c"],
            },
            "verifiedRanges": {
                name: {"address": f"0x{address:08x}", "length": size, "sha256": expected}
                for name, (address, size, expected) in RANGES.items()
            },
            "provenBehavior": (
                "Resolves argument zero, skips the write when the object is absent or the shared MOMT gate is active, "
                "and otherwise copies the three raw float words addressed by argument one to direct object offsets "
                "+0x34/+0x38/+0x3c. Authored values and presentation consumers identify this vector as scale."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(inventory),
            "provenCallCount": len(inventory),
            "mapCount": len({(item["disc"], item["area"]) for item in inventory}),
            "dialogueRegionCallCount": sum(item["dialogue"] for item in inventory),
            "argumentKindShapes": [
                {"kinds": list(shape), "count": count}
                for shape, count in sorted(shapes.items())
            ],
        },
        "evidenceBoundary": [
            "All 393 authored calls have exactly two arguments and no consumed result.",
            "Dynamic object references remain runtime-resolved; this evidence does not replace them with scene constants.",
            "Missing objects and the native MOMT-gate path are executable-proven no-ops; package ownership still fails closed before presentation when a declared cutscene object is absent.",
        ],
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
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output.relative_to(ROOT)}: {report['allDiscInventory']['provenCallCount']} proven calls")


if __name__ == "__main__":
    main()
