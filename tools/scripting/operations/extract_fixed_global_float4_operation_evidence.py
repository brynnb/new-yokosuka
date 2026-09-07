#!/usr/bin/env python3
"""Verify operation 0x010b's exact four-float fixed-global copy."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_CONTROL_FLOW = (
    ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/fixed-global-float4-operation-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C1600C4,
        14,
        "e1909cf6b1fa0e521787836a89f81c5f560533264512a167da1c135f4d19528f",
    ),
    "copyHelper": (
        0x0C1444DE,
        26,
        "78c509f37581c6f8322fd4f5124f42309874ce222912a5cc431c6ae249c257fb",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def executable_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    return data[start:start + size]


def build_report(executable: bytes, control_flow: dict) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(executable_slice(executable, address, size)) != expected:
            raise ValueError(f"operation-0x010b {name} changed")
    table_entry = struct.unpack_from(
        "<I", executable, 0x0C29AE0C - BASE
    )[0]
    helper = struct.unpack_from("<I", executable, 0x0C1602A8 - BASE)[0]
    destination = struct.unpack_from("<I", executable, 0x0C1446D0 - BASE)[0]
    if (table_entry, helper, destination) != (
        0x0C1600C4,
        0x0C1444DE,
        0x0C220330,
    ):
        raise ValueError("operation-0x010b native dependencies changed")

    calls = []
    payload_rows = []
    for item in control_flow["maps"]:
        mapinfo = Path(item["source"]).read_bytes()
        for function in item["scriptedEventFunctions"]:
            for operation in function["nativeOperations"]:
                if operation.get("operationId") != 0x010B:
                    continue
                arguments = operation.get("arguments", [])
                if len(arguments) != 1:
                    raise ValueError("operation-0x010b argument shape changed")
                operand = arguments[0]
                calls.append({
                    "disc": item["disc"],
                    "area": item["area"],
                    "kind": operand.get("kind"),
                })
                if operand.get("kind") == "static-pointer":
                    pointer = operand.get("value")
                    if (
                        not isinstance(pointer, int)
                        or pointer < 0
                        or pointer + 16 > len(mapinfo)
                    ):
                        raise ValueError("operation-0x010b static payload unavailable")
                    words = struct.unpack_from("<4I", mapinfo, pointer)
                    payload_rows.append(
                        f"{item['disc']}:{item['area']}:{pointer:08x}:"
                        + ",".join(f"{word:08x}" for word in words)
                    )
                elif operand.get("kind") != "frame-address":
                    raise ValueError("operation-0x010b operand kind changed")
    kind_counts = Counter(call["kind"] for call in calls)
    if len(calls) != 58 or kind_counts != {
        "static-pointer": 55,
        "frame-address": 3,
    }:
        raise ValueError("operation-0x010b authored inventory changed")

    return {
        "schema": "new-yokosuka-fixed-global-float4-operation-evidence-v1",
        "status": "exact-native-route-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": (
                ".disc-work/dialogue/scripted-event-control-flow-index.json"
            ),
        },
        "operation": {
            "operationId": 0x010B,
            "operationHex": "0x010b",
            "handlerAddress": "0x0c1600c4",
            "copyHelperAddress": "0x0c1444de",
            "destinationAddress": "0x0c220330",
            "wordCount": 4,
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": expected,
                }
                for name, (address, size, expected) in RANGES.items()
            },
            "behavior": (
                "Dereference argument zero and copy four float32 words "
                "unchanged and in order to 0x0c220330 through 0x0c22033c."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "operandKindCounts": dict(sorted(kind_counts.items())),
            "areaCount": len({(call["disc"], call["area"]) for call in calls}),
            "staticPayloadManifestSha256": digest(
                ("\n".join(payload_rows) + "\n").encode()
            ),
        },
        "evidenceBoundary": [
            "Only the exact one-argument static-pointer and frame-address shapes receive this semantic.",
            "The four words are retained bit-exactly; no color, lighting, or other gameplay label is inferred.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--control-flow", type=Path, default=DEFAULT_CONTROL_FLOW)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.control_flow.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
