#!/usr/bin/env python3
"""Verify extracted native-operation images against live Flycast RAM."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote


HANDLER_TABLE_ADDRESS = 0x0C29A9E0
DEFAULT_EVIDENCE = (
    Path("tools/evidence/spatial-bounds-query-evidence.json"),
    Path("tools/evidence/object-link-field-evidence.json"),
    Path("tools/evidence/object-dword-5c-evidence.json"),
)


def parse_address(value: str) -> int:
    return int(value, 16)


def validate_range(
    remote: FlycastRemote,
    operation_hex: str,
    range_name: str,
    specification: dict[str, object],
) -> dict[str, object]:
    address = parse_address(str(specification["address"]))
    length = int(specification["length"])
    expected_hash = str(specification["sha256"])
    p0_bytes = remote.read_memory(address, length)
    p1_address = address | 0x80000000
    p1_bytes = remote.read_memory(p1_address, length)
    live_hash = hashlib.sha256(p0_bytes).hexdigest()
    return {
        "operationHex": operation_hex,
        "range": range_name,
        "p0Address": f"0x{address:08x}",
        "p1Address": f"0x{p1_address:08x}",
        "length": length,
        "expectedSha256": expected_hash,
        "liveSha256": live_hash,
        "p0P1MirrorsIdentical": p0_bytes == p1_bytes,
        "matchesExtractedImage": (
            live_hash == expected_hash and p0_bytes == p1_bytes
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3263)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument(
        "--resume-seconds",
        type=float,
        default=0.0,
        help="keep the debugger connection open while the guest runs",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "evidence",
        nargs="*",
        type=Path,
        default=list(DEFAULT_EVIDENCE),
    )
    args = parser.parse_args()

    evidence_documents = [
        (path, json.loads(path.read_text())) for path in args.evidence
    ]
    remote = FlycastRemote(args.host, args.port, args.timeout)
    started_at = time.time()
    try:
        remote.command("?")
        guest_pc = remote.read_register(16)
        operations: list[dict[str, object]] = []
        ranges: list[dict[str, object]] = []
        for evidence_path, document in evidence_documents:
            operation = document["operation"]
            operation_id = int(operation["operationId"])
            operation_hex = str(operation["operationHex"])
            expected_handler = parse_address(str(operation["handlerAddress"]))
            live_handler = remote.read_u32(
                HANDLER_TABLE_ADDRESS + operation_id * 4
            )
            operations.append(
                {
                    "evidence": str(evidence_path),
                    "operationId": operation_id,
                    "operationHex": operation_hex,
                    "tableEntryAddress": (
                        f"0x{HANDLER_TABLE_ADDRESS + operation_id * 4:08x}"
                    ),
                    "expectedHandlerAddress": f"0x{expected_handler:08x}",
                    "liveHandlerAddress": f"0x{live_handler:08x}",
                    "handlerTableMatches": live_handler == expected_handler,
                }
            )
            for range_name, specification in operation[
                "verifiedRanges"
            ].items():
                ranges.append(
                    validate_range(
                        remote,
                        operation_hex,
                        range_name,
                        specification,
                    )
                )
    finally:
        try:
            if args.resume_seconds > 0:
                remote.resume()
                time.sleep(args.resume_seconds)
            remote.detach()
        finally:
            remote.close()

    passed = all(
        operation["handlerTableMatches"] for operation in operations
    ) and all(item["matchesExtractedImage"] for item in ranges)
    payload = {
        "schema": "new-yokosuka-live-operation-image-validation-v1",
        "status": "passed" if passed else "failed",
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": "live SH-4 registers and Dreamcast RAM",
        },
        "guestProgramCounter": f"0x{guest_pc:08x}",
        "handlerTableAddress": f"0x{HANDLER_TABLE_ADDRESS:08x}",
        "elapsedSeconds": round(time.time() - started_at, 3),
        "operations": operations,
        "verifiedRanges": ranges,
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
