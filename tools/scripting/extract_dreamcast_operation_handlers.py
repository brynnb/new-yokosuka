#!/usr/bin/env python3
"""Resolve SCN3 operation IDs to the live Dreamcast SH-4 handler table.

The script-facing dispatcher at 0x0c0bb69c calls 0x0c0bb6fe. That routine
indexes a u32 function-pointer table at 0x0c29a9e0 using the operation ID in
r5. Resolving the table removes ambiguity between similarly shaped SCN3 call
sites and gives later analysis an exact native handler address.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


RAM_BASE = 0x0C000000
DISPATCHER = 0x0C0BB69C
TABLE_ADDRESS = 0x0C29A9E0
HANDLER_SAMPLE_BYTES = 128


def address_offset(address: int) -> int:
    return address - RAM_BASE


def operation_ids_from_report(report: dict[str, object]) -> list[int]:
    if isinstance(report.get("calls"), list):
        return sorted({
            call["operationId"]
            for call in report["calls"]
            if isinstance(call.get("operationId"), int)
        })
    summary = report.get("summary")
    if isinstance(summary, dict) and isinstance(
        summary.get("operationIds"),
        list,
    ):
        return sorted({
            operation["operationId"]
            for operation in summary["operationIds"]
            if isinstance(operation.get("operationId"), int)
        })
    if isinstance(report.get("callbacks"), list):
        return sorted({
            operation["operationId"]
            for callback in report["callbacks"]
            for operation in callback.get("operations", [])
            if isinstance(operation.get("operationId"), int)
        })
    if isinstance(report.get("regions"), list):
        return sorted({
            operation["operationId"]
            for region in report["regions"]
            for operation in region.get("operations", [])
            if isinstance(operation.get("operationId"), int)
        })
    raise ValueError("input report does not contain operation IDs")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ram", type=Path)
    parser.add_argument("calls", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    ram = args.ram.read_bytes()
    calls_report = json.loads(args.calls.read_text())
    operation_ids = operation_ids_from_report(calls_report)

    handlers = []
    failures = []
    table_offset = address_offset(TABLE_ADDRESS)
    for operation_id in operation_ids:
        entry_offset = table_offset + operation_id * 4
        if entry_offset < 0 or entry_offset + 4 > len(ram):
            failures.append(
                f"operation 0x{operation_id:04x} table entry is outside RAM",
            )
            continue
        handler = struct.unpack_from("<I", ram, entry_offset)[0]
        handler_offset = address_offset(handler)
        if (
            handler < RAM_BASE
            or handler_offset < 0
            or handler_offset + HANDLER_SAMPLE_BYTES > len(ram)
        ):
            failures.append(
                f"operation 0x{operation_id:04x} has invalid handler "
                f"0x{handler:08x}",
            )
            continue
        sample = ram[
            handler_offset:handler_offset + HANDLER_SAMPLE_BYTES
        ]
        handlers.append({
            "operationId": operation_id,
            "operationHex": f"0x{operation_id:04x}",
            "tableEntryAddress": (
                f"0x{TABLE_ADDRESS + operation_id * 4:08x}"
            ),
            "handlerAddress": f"0x{handler:08x}",
            "handlerSampleBytes": len(sample),
            "handlerSampleSha256": hashlib.sha256(sample).hexdigest(),
        })

    report = {
        "schema": "new-yokosuka-dreamcast-operation-handlers-v1",
        "status": "verified" if not failures else "failed",
        "source": {
            "ram": str(args.ram),
            "calls": str(args.calls),
        },
        "dispatcherAddress": f"0x{DISPATCHER:08x}",
        "tableAddress": f"0x{TABLE_ADDRESS:08x}",
        "operationCount": len(handlers),
        "handlers": handlers,
        "failures": failures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out} ({report['status']}, {len(handlers)} handlers)")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
