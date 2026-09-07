#!/usr/bin/env python3
"""Verify operation 0x0026's exact fixed-global dword query."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
TABLE_ENTRY = 0x0C29AA78
HANDLER = (0x0C1649A8, 8, "f64c232d66f39fca1f1a485d355fd8f17434527ce525a6412d559f32f3147119")
RESULT_HELPER = (0x0C0BB342, 6, "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2")
GLOBAL_POINTER_LITERAL = 0x0C164C1C
HELPER_POINTER_LITERAL = 0x0C164C20
GLOBAL_ADDRESS = 0x0C20C3E0


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(executable: bytes, event_ir: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for address, length, expected in (HANDLER, RESULT_HELPER):
        if digest(runtime_slice(executable, address, length)) != expected:
            raise ValueError(f"operation 0x0026 code at 0x{address:08x} changed")
    if u32(executable, TABLE_ENTRY) != HANDLER[0]:
        raise ValueError("operation 0x0026 table entry changed")
    if u32(executable, HELPER_POINTER_LITERAL) != RESULT_HELPER[0]:
        raise ValueError("operation 0x0026 result-helper pointer changed")
    if u32(executable, GLOBAL_POINTER_LITERAL) != GLOBAL_ADDRESS:
        raise ValueError("operation 0x0026 global address changed")

    calls = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") == 0x0026:
                        calls.append({
                            "disc": native_map["disc"],
                            "area": native_map["area"],
                            "arguments": action.get("arguments", []),
                            "resultTarget": action.get("resultTarget"),
                            "resultComparison": action.get("resultComparison"),
                        })
    if len(calls) != 115 or any(call["arguments"] for call in calls):
        raise ValueError("operation 0x0026 authored inventory changed")
    result_target_count = sum(call["resultTarget"] is not None for call in calls)
    result_comparison_count = sum(call["resultComparison"] is not None for call in calls)
    if result_target_count != 43 or result_comparison_count != 60:
        raise ValueError("operation 0x0026 result consumers changed")

    return {
        "schema": "new-yokosuka-operation-0026-evidence-v1",
        "generatedBy": "tools/scripting/operations/extract_operation_0026_evidence.py",
        "sources": {
            "executable": {"path": ".disc-work/exact/1ST_READ.BIN", "sha256": EXECUTABLE_SHA256},
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0026,
            "operationHex": "0x0026",
            "handlerAddress": f"0x{HANDLER[0]:08x}",
            "handlerLength": HANDLER[1],
            "handlerSha256": HANDLER[2],
            "resultHelperAddress": f"0x{RESULT_HELPER[0]:08x}",
            "resultHelperLength": RESULT_HELPER[1],
            "resultHelperSha256": RESULT_HELPER[2],
            "globalAddress": f"0x{GLOBAL_ADDRESS:08x}",
            "provenBehavior": (
                "Loads the dword at fixed address 0x0c20c3e0 and forwards it unchanged "
                "through the dispatcher's operation-result slot."
            ),
        },
        "inventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentCounts": {"0": len(calls)},
            "resultTargetCount": result_target_count,
            "resultComparisonCount": result_comparison_count,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--event-ir", type=Path, default=ROOT / ".disc-work/dialogue/native-event-ir.json")
    parser.add_argument("--output", type=Path, default=ROOT / "tools/evidence/operation-0026-evidence.json")
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    try:
        label = args.output.relative_to(ROOT)
    except ValueError:
        label = args.output
    print(f"Wrote {label}")


if __name__ == "__main__":
    main()
