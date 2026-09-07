#!/usr/bin/env python3
"""Verify operation 0x0139's outer controller modes zero and sixteen."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/tagged-object-controller-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "wrapper": (
        0x0C165544,
        0x14C,
        "14ce3eaf4dbed8ee8fa93b4a4b386b32804e831b4821303cadea70677cb18884",
    ),
    "pairInitializer": (
        0x0C0C9B4C,
        0x190,
        "6fba7467ecbe81df9fd8d0d70c6c0b66da5c9ad07a32390535dd854677ec6598",
    ),
    "configurationWriter": (
        0x0C0CCAFE,
        0x16,
        "4cb56f265bd24ab51b277849c9ee07f0232e0771afa61d2b80f5d7bb66ee57e9",
    ),
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def verify(executable: bytes) -> dict[str, object]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0139 {name} changed")
    jump_table = list(struct.unpack(
        "<22H",
        runtime_slice(executable, 0x0C165578, 44),
    ))
    if jump_table[0] != 0x0030 or jump_table[16] != 0x00F2:
        raise ValueError("operation-0x0139 outer selector map changed")
    literals = {
        "objectResolver": u32(executable, 0x0C165574),
        "pairInitializer": u32(executable, 0x0C165728),
        "emptyInitializer": u32(executable, 0x0C16572C),
        "configurationWriter": u32(executable, 0x0C165758),
        "resultWriter": u32(executable, 0x0C165760),
        "activeController": u32(executable, 0x0C0CCBE0),
        "configurationPointer": u32(executable, 0x0C0CCBE4),
    }
    expected = {
        "objectResolver": 0x0C153956,
        "pairInitializer": 0x0C0C9B4C,
        "emptyInitializer": 0x0C0C9CDC,
        "configurationWriter": 0x0C0CCAFE,
        "resultWriter": 0x0C0BB342,
        "activeController": 0x0C2164AC,
        "configurationPointer": 0x0C2164B4,
    }
    if literals != expected:
        raise ValueError("operation-0x0139 dependency literals changed")
    return {
        name: f"0x{value:08x}"
        for name, value in literals.items()
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    executable = args.executable.read_bytes()
    native_contract = verify(executable)
    report = {
        "schema": "new-yokosuka-tagged-object-controller-operation-evidence-v1",
        "status": "exact-outer-modes-zero-and-sixteen",
        "source": {
            "executable": args.executable.name,
            "executableRuntimeBase": f"0x{RUNTIME_BASE:08x}",
            "executableSha256": sha256(executable),
        },
        "operation": {
            "operationId": 0x0139,
            "operationHex": "0x0139",
            "handlerAddress": "0x0c165544",
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest) in RANGES.items()
            },
            "nativeContract": native_contract,
            "modes": [
                {
                    "mode": 0,
                    "semanticId": "tagged-object-controller-initialize",
                    "argumentCount": 3,
                    "provenBehavior": (
                        "Resolves arguments one and two through the native "
                        "object resolver when either tag is nonzero, then "
                        "passes both resolved pointers to 0x0c0c9b4c. Two "
                        "zero tags instead call 0x0c0c9cdc. The helper result "
                        "is returned unchanged."
                    ),
                },
                {
                    "mode": 16,
                    "semanticId": (
                        "tagged-object-controller-configuration-write"
                    ),
                    "argumentCount": 2,
                    "provenBehavior": (
                        "Returns -1 without mutation when global controller "
                        "0x0c2164ac is null. Otherwise writes argument one "
                        "unchanged to 0x0c2164b4 and returns zero."
                    ),
                },
            ],
        },
        "d000Owner": {
            "functionFileOffset": "0x69b14",
            "modeZeroCallFileOffset": "0x69b38",
            "modeZeroTags": ["YKUL", "YKUR"],
            "modeSixteenCallFileOffset": "0x69b68",
            "modeSixteenConfigurationPointer": "0x000ae354",
        },
        "evidenceBoundary": [
            "The two modes are outer operation selectors, distinct from the inner object-action selectors used by outer modes one through five.",
            "Mode zero's large paired-controller helper remains an explicit adapter boundary; no high-level input or proximity meaning is assigned to its private fields.",
            "Mode sixteen is only the exact active-controller guard and configuration-pointer write; it is not the neighboring mode-fifteen natural-input updater.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
