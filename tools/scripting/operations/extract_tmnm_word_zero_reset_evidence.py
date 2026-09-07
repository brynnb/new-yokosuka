#!/usr/bin/env python3
"""Verify operation 0x00fb's exact resolved-object TMNM word-zero reset."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/tmnm-word-zero-reset-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C1665EC, 38, "eea65fc6a75a690220ddc7732271b09af176584b2bb9d109a48329e86ed4297a"),
    "objectResolver": (0x0C153956, 58, "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f"),
    "tmnmLookup": (0x0C182C2A, 8, "9fbe526005ccb087dc967839f72cb0228bed5144d7331ad8ad73575290609972"),
    "associatedLookup": (0x0C0AAD5A, 50, "4c5affee0a1739c5cc4b01e389b4f6af7d2f6147cd09ad667b8e103fb3466c27"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def build_report(executable: bytes, event_ir: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(runtime_slice(executable, address, size)) != expected:
            raise ValueError(f"operation-0x00fb {name} changed")
    calls = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") == "engineOperation" and action.get("operationId") == 0x00FB:
                        calls.append((native_map, function, action))
    if (
        len(calls) != 15
        or len({(item[0]["disc"], item[0]["area"]) for item in calls}) != 7
        or sum(item[1].get("dialogueRegion") is not None for item in calls) != 5
        or Counter(tuple(arg.get("kind") for arg in item[2].get("arguments", [])) for item in calls) != {("constant",): 15}
        or any(item[2].get("resultComparison") is not None or item[2].get("resultTarget") is not None for item in calls)
    ):
        raise ValueError("operation-0x00fb authored inventory changed")
    return {
        "schema": "new-yokosuka-tmnm-word-zero-reset-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 251,
            "operationHex": "0x00fb",
            "semanticId": "resolved-object-tmnm-word-zero-reset",
            "handlerAddress": "0x0c1665ec",
            "componentTag": "TMNM",
            "fieldOffset": "+0x00",
            "provenBehavior": "Resolves the sole object argument, resolves its literal TMNM associated record, and writes zero to the record dword at +0x00. A missing object or TMNM record is a native no-op.",
            "verifiedRanges": {
                name: {"address": f"0x{address:08x}", "length": size, "sha256": expected}
                for name, (address, size, expected) in RANGES.items()
            },
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(calls),
            "mapCount": len({(item[0]["disc"], item[0]["area"]) for item in calls}),
            "dialogueRegionCallCount": sum(item[1].get("dialogueRegion") is not None for item in calls),
        },
        "evidenceBoundary": [
            "All authored calls pass one constant four-character object identity and consume no result.",
            "The dword's higher-level animation meaning is not inferred; the runtime preserves its exact TMNM record offset.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output.relative_to(ROOT)}: {report['allDiscInventory']['provenCallCount']} proven calls")


if __name__ == "__main__":
    main()
