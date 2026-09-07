#!/usr/bin/env python3
"""Verify operation 0x014f's exact raw float-word global write."""

from __future__ import annotations
import argparse, hashlib, json, struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/operation-014f-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER_ADDRESS = 0x0C1667F6
HANDLER_SHA256 = "9078d26b6d3287e43cd4b06df3647ec5f7affa6723d768e98ed6aec7faa0bdb0"

def slice_at(data, address, size):
    return data[address - BASE:address - BASE + size]

def u32(data, address):
    return struct.unpack("<I", slice_at(data, address, 4))[0]

def build_report(data, event_ir):
    if hashlib.sha256(data).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    handler = slice_at(data, HANDLER_ADDRESS, 8)
    if (hashlib.sha256(handler).hexdigest() != HANDLER_SHA256
            or u32(data, 0x0C29AF1C) != HANDLER_ADDRESS
            or u32(data, 0x0C1668F8) != 0x0C21BC74):
        raise ValueError("operation-0x014f native contract changed")
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action.get("kind") == "engineOperation" and action.get("operationId") == 0x014F:
                        calls.append((item["disc"], item["area"], function.get("dialogueRegion"), action))
    values = Counter(call[3]["arguments"][0].get("value") for call in calls)
    if (len(calls) != 63 or len({call[:2] for call in calls}) != 20
            or values != {0: 27, 1053609165: 19, 1056964608: 17}
            or any(call[2] is not None or len(call[3].get("arguments", [])) != 1
                   or call[3]["arguments"][0].get("kind") != "constant"
                   or call[3].get("resultComparison") is not None
                   or call[3].get("resultTarget") is not None for call in calls)):
        raise ValueError("operation-0x014f authored inventory changed")
    return {
        "schema": "new-yokosuka-operation-014f-evidence-v1",
        "status": "exact-native-raw-float-word-write-and-all-disc-inventory",
        "source": {"executable": "1ST_READ.BIN", "executableSha256": EXECUTABLE_SHA256,
                   "eventIr": ".disc-work/dialogue/native-event-ir.json"},
        "operation": {"operationId": 0x014F, "operationHex": "0x014f",
                      "tableEntryAddress": "0x0c29af1c", "handlerAddress": "0x0c1667f6",
                      "handlerLength": 8, "handlerSha256": HANDLER_SHA256,
                      "globalFloatWord": "0x0c21bc74",
                      "provenBehavior": "Copies argument zero's raw float32 word unchanged to the global."},
        "allDiscInventory": {"authoredCallCount": 63, "areaCount": 20,
                             "rawWordCounts": {str(k): v for k, v in sorted(values.items())}},
        "evidenceBoundary": ["The value remains a raw float32 word with no inferred units or gameplay-domain name."],
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes(), json.loads(args.event_ir.read_text()))
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}: 63 proven writes")

if __name__ == "__main__": main()
