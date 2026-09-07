#!/usr/bin/env python3
"""Prove operation 0x017e's exact XMPT selector-five active query."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-017e-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "operationHandler": (0x0C166C8E, 48, "8c70b0a99bcb71f52b770730950e4efb4f2be7f2af867c3c7af938bb071cf157"),
    "objectRecordResolver": (0x0C153956, 60, "9f17c0e1e76d43fadc6671985324c0d702b079d170f73aa16e3fdc58d4534d09"),
    "xmptQuery": (0x0C0FED8E, 52, "85e01644213c1ee3017b3df6890aab66ed13369e0ea24700db3ee0739a9e8d5f"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("operation-0x017e range unavailable")
    return data[start:start + size]


def build_report(executable: bytes, event_ir: dict[str, Any]) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in RANGES.items():
        actual = digest(runtime_slice(executable, address, size))
        if actual != expected:
            raise ValueError(f"operation-0x017e {name} changed: {actual}")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationHex") != "0x017e":
                        continue
                    arguments = action.get("arguments", [])
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "argumentCount": len(arguments),
                        "argumentKind": arguments[0].get("kind") if arguments else None,
                        "constantTag": arguments[0].get("ascii") if arguments else None,
                        "hasResultTarget": "resultTarget" in action,
                    })
    shapes = Counter((
        item["argumentCount"], item["argumentKind"], item["constantTag"],
        item["hasResultTarget"],
    ) for item in calls)
    if shapes != {
        (1, "runtime", None, False): 193,
        (1, "frame-field", None, False): 96,
        (1, "constant", "AKIR", False): 9,
    }:
        raise ValueError("operation-0x017e authored inventory changed")
    areas = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-operation-017e-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedNativeRanges": verified,
        "operation": {
            "operationId": 0x017E,
            "operationHex": "0x017e",
            "argumentCount": 1,
            "objectRecordTag": "XMPT",
            "recordActiveOffset": "0x18",
            "recordSelectorOffset": "0x1c",
            "requiredSelector": 5,
            "matchedResult": 1,
            "unmatchedResult": 0,
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "areaCount": len(areas),
            "callsByDisc": {
                str(disc): sum(count for (item_disc, _), count in areas.items() if item_disc == disc)
                for disc in sorted({disc for disc, _ in areas})
            },
            "argumentKinds": dict(sorted(Counter(
                item["argumentKind"] for item in calls
            ).items())),
            "storedResultCount": sum(item["hasResultTarget"] for item in calls),
        },
        "evidenceBoundary": [
            "Only exact one-argument operation 0x017e receives this semantic.",
            "The resolved object and literal XMPT associated-record route are shared with the existing native actor XMPT owner.",
            "The handler queries XMPT activity and selector five; it does not advance, create, or delete the record.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
