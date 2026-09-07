#!/usr/bin/env python3
"""Verify every authored operation-0x01a1 byte-envelope route."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
TABLE_ENTRY = 0x0C29B064
HANDLER = (0x0C16ADB0, 134, "ffdd5f7e3a4fb7741f4e3de8be6d203812407f21b8553fbdc3b56d74aea73602")
CONFIGURE_HELPER = (0x0C173C04, 250, "80c67789a89d3f461a4974aa6c7a8e6d605e6c2fc928a4421b00a18b7666a5bb")
QUERY_HELPER = (0x0C173CFE, 32, "1413b507763070240a21f889d5c165be5220b6c89efecc10450e1cd7b8c1aca0")
RESULT_HELPER = (0x0C0BB342, 6, "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2")
POINTERS = {
    0x0C16AEE4: QUERY_HELPER[0],
    0x0C16AEE8: RESULT_HELPER[0],
    0x0C16AEEC: CONFIGURE_HELPER[0],
    0x0C173D50: 0x0C224750,
    0x0C173D54: 0x0C1DC294,
    0x0C173D58: 0x0C0975D6,
}
EXPECTED_CONFIGURATIONS = Counter({
    (30, 1, 0, 255, 255, 255, 255, 255, 255, 255): 1,
    (0, 1, 255, 255, 255, 255, 255, 255, 255, 255): 1,
    (30, 2, 255, 0, 0, 0, 0, 0, 0, 0): 2,
    (50, 1, 150, 68, 50, 0, 255, 255, 255, 255): 1,
})


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
    for address, length, expected in (HANDLER, CONFIGURE_HELPER, QUERY_HELPER, RESULT_HELPER):
        if digest(runtime_slice(executable, address, length)) != expected:
            raise ValueError(f"operation 0x01a1 code at 0x{address:08x} changed")
    if u32(executable, TABLE_ENTRY) != HANDLER[0]:
        raise ValueError("operation 0x01a1 table entry changed")
    for address, expected in POINTERS.items():
        if u32(executable, address) != expected:
            raise ValueError(f"operation 0x01a1 pointer at 0x{address:08x} changed")

    calls = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("operationId") != 0x01A1:
                        continue
                    if any(value.get("kind") != "constant" for value in action.get("arguments", [])):
                        raise ValueError("operation 0x01a1 has a non-constant authored argument")
                    calls.append({
                        "disc": native_map["disc"],
                        "area": native_map["area"],
                        "function": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "arguments": [value["value"] for value in action.get("arguments", [])],
                        "hasResultComparison": action.get("resultComparison") is not None,
                    })
    configurations = Counter(tuple(call["arguments"]) for call in calls if len(call["arguments"]) == 10)
    queries = [call for call in calls if len(call["arguments"]) == 1]
    if len(calls) != 6 or configurations != EXPECTED_CONFIGURATIONS:
        raise ValueError("operation 0x01a1 configuration inventory changed")
    if len(queries) != 1 or queries[0]["arguments"] != [0xFFFFFFFF]:
        raise ValueError("operation 0x01a1 query inventory changed")
    if not queries[0]["hasResultComparison"] or any(
        call["hasResultComparison"] for call in calls if len(call["arguments"]) == 10
    ):
        raise ValueError("operation 0x01a1 result use changed")

    return {
        "schema": "new-yokosuka-operation-01a1-evidence-v1",
        "generatedBy": "tools/scripting/operations/extract_operation_01a1_evidence.py",
        "sources": {
            "executable": {"path": ".disc-work/exact/1ST_READ.BIN", "sha256": EXECUTABLE_SHA256},
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x01A1,
            "operationHex": "0x01a1",
            "handlerAddress": f"0x{HANDLER[0]:08x}",
            "handlerLength": HANDLER[1],
            "handlerSha256": HANDLER[2],
            "configureHelperAddress": f"0x{CONFIGURE_HELPER[0]:08x}",
            "configureHelperLength": CONFIGURE_HELPER[1],
            "configureHelperSha256": CONFIGURE_HELPER[2],
            "queryHelperAddress": f"0x{QUERY_HELPER[0]:08x}",
            "queryHelperLength": QUERY_HELPER[1],
            "queryHelperSha256": QUERY_HELPER[2],
            "cacheAddress": "0x0c224750",
            "provenBehavior": (
                "Ten-argument routes configure two four-byte channel vectors and a "
                "duration on the fixed native envelope record. Mode one retains the "
                "target quartet in the exact native cache; mode two sources its first "
                "channels from that cache when active. The one-argument -1 route returns "
                "whether the record's duration field is nonzero."
            ),
        },
        "inventory": {
            "authoredCallCount": len(calls),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "argumentCounts": {"1": 1, "10": 5},
            "configurationRoutes": [
                {"arguments": list(arguments), "callCount": count}
                for arguments, count in sorted(configurations.items())
            ],
            "queryArguments": [0xFFFFFFFF],
        },
        "calls": calls,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--event-ir", type=Path, default=ROOT / ".disc-work/dialogue/native-event-ir.json")
    parser.add_argument("--output", type=Path, default=ROOT / "tools/evidence/operation-01a1-evidence.json")
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
