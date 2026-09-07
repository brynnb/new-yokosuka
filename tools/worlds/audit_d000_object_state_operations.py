#!/usr/bin/env python3
"""Verify the low-level state bits used by Dobuita operations 0x1f/0xa8."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


RAM_BASE = 0x0C000000
TABLE_ADDRESS = 0x0C29A9E0


def offset(address: int) -> int:
    return address - RAM_BASE


def u32(ram: bytes, address: int) -> int:
    return struct.unpack_from("<I", ram, offset(address))[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ram", type=Path)
    parser.add_argument("calls", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    ram = args.ram.read_bytes()
    calls = json.loads(args.calls.read_text())["calls"]

    operation_1f_handler = u32(ram, TABLE_ADDRESS + 0x1F * 4)
    operation_a8_handler = u32(ram, TABLE_ADDRESS + 0xA8 * 4)
    bit_table = u32(ram, 0x0C0AB3C4)
    field_offset = struct.unpack_from("<H", ram, offset(0x0C0AB3BC))[0]
    bit_mask = ram[offset(bit_table) + 3]
    wagk_calls = [
        {
            "callFileOffset": call["callFileOffset"],
            "operationHex": call["operationHex"],
            "arguments": [
                argument.get("ascii", argument.get("value", argument["kind"]))
                for argument in call["arguments"]
            ],
        }
        for call in calls
        if any(
            argument.get("ascii") == "WAGK"
            for argument in call["arguments"]
        )
    ]

    failures = []
    if operation_1f_handler != 0x0C157E12:
        failures.append("operation 0x001f handler address changed")
    if operation_a8_handler != 0x0C157F36:
        failures.append("operation 0x00a8 handler address changed")
    if field_offset != 0x88 or bit_mask != 0x04:
        failures.append("operation 0x001f flag route is not +0x88 mask 0x04")
    expected_modes = {
        ("0x001f", 1),
        ("0x001f", 2),
        ("0x00a8", 0),
        ("0x00a8", 1),
        ("0x00a8", 0xFFFFFFFF),
    }
    actual_modes = {
        # Dispatch-call arguments are stored in native r6 order: object tag
        # first, operation mode second.
        (call["operationHex"], call["arguments"][1])
        for call in wagk_calls
    }
    if actual_modes != expected_modes:
        failures.append("WAGK operation/mode set changed")

    report = {
        "schema": "new-yokosuka-d000-object-state-operations-v1",
        "status": "verified" if not failures else "failed",
        "source": {
            "ram": str(args.ram),
            "calls": str(args.calls),
        },
        "operations": {
            "0x001f": {
                "handlerAddress": f"0x{operation_1f_handler:08x}",
                "resolvedObjectFieldOffset": field_offset,
                "mask": bit_mask,
                "modes": {
                    "0": "read mask",
                    "1": "set mask",
                    "2": "clear mask",
                },
                "handlerSha256": hashlib.sha256(
                    ram[
                        offset(operation_1f_handler):
                        offset(operation_1f_handler) + 192
                    ],
                ).hexdigest(),
            },
            "0x00a8": {
                "handlerAddress": f"0x{operation_a8_handler:08x}",
                "associatedObjectFieldOffset": 0x5C,
                "mask": 0x04,
                "modes": {
                    "0": "clear mask and install one scheduler state",
                    "1": "set mask and restore the prior scheduler state",
                    "4294967295": "no matching handler branch",
                },
                "handlerSha256": hashlib.sha256(
                    ram[
                        offset(operation_a8_handler):
                        offset(operation_a8_handler) + 192
                    ],
                ).hexdigest(),
            },
        },
        "wagkCalls": wagk_calls,
        "semanticBoundary": (
            "bit routes and mode effects are exact; the engine-level meaning "
            "of the two flags is not yet named"
        ),
        "failures": failures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out} ({report['status']})")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
