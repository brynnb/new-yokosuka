#!/usr/bin/env python3
"""Prove native operation 0x0040's actor MOMT mask-write modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    ROOT.parent / "new-yokosuka" / ".disc-work" / "exact" / "1ST_READ.BIN"
)
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/actor-momt-mask-operation-evidence.json"
)
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RUNTIME_BASE = 0x0C010000
HANDLER_ADDRESS = 0x0C165BDE
HANDLER_SIZE = 106
ACTOR_RESOLVER = 0x0C153956
MOMT_RESOLVER = 0x0C113A76
MASK_SETTER = 0x0C114528
MASK_CLEARER = 0x0C114530


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(executable: bytes) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    expected_literals = {
        0x0C165C94: ACTOR_RESOLVER,
        0x0C165C98: MOMT_RESOLVER,
        0x0C165CA8: MASK_SETTER,
        0x0C165CAC: MASK_CLEARER,
    }
    for address, expected in expected_literals.items():
        if u32(executable, address) != expected:
            raise ValueError(f"operation 0x0040 literal changed at 0x{address:08x}")
    if runtime_slice(executable, MASK_SETTER, 8) != bytes.fromhex(
        "42625b220b002224"
    ):
        raise ValueError("MOMT mask setter changed")
    if runtime_slice(executable, MASK_CLEARER, 10) != bytes.fromhex(
        "4263576559230b003224"
    ):
        raise ValueError("MOMT mask clearer changed")
    handler = runtime_slice(executable, HANDLER_ADDRESS, HANDLER_SIZE)
    return {
        "schema": "new-yokosuka-actor-momt-mask-operation-evidence-v1",
        "evidenceBoundary": [
            "Operation 0x0040 resolves argument zero as an actor and resolves that actor's associated MOMT record.",
            "Mode one ORs argument two into the resolved record's first 32-bit word.",
            "Mode two ANDs the inverse of argument two into the same word.",
            "Mode zero performs no mask write; other modes perform no mask write in the verified handler.",
            "The higher-level meanings of individual mask bits remain numeric.",
        ],
        "executable": {
            "filename": "1ST_READ.BIN",
            "runtimeBase": f"0x{RUNTIME_BASE:08x}",
            "sha256": digest(executable),
        },
        "operation": {
            "operationId": 0x0040,
            "operationHex": "0x0040",
            "semanticId": "actor-momt-mask-control",
            "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
            "handlerSize": HANDLER_SIZE,
            "handlerSha256": digest(handler),
            "actorArgument": 0,
            "modeArgument": 1,
            "maskArgument": 2,
            "modes": {
                "1": {
                    "operation": "bitwise OR",
                    "targetAddress": f"0x{MASK_SETTER:08x}",
                },
                "2": {
                    "operation": "bitwise AND NOT",
                    "targetAddress": f"0x{MASK_CLEARER:08x}",
                },
            },
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(args.executable.read_bytes())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report["operation"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
