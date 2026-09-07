#!/usr/bin/env python3
"""Verify operation 0x00ac's exact global-byte write and Hato operand."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_MAPINFO = (
    PROJECT_ROOT / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/global-byte-state-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(executable: bytes, mapinfo: bytes) -> dict:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected D000 MAPINFO.BIN")

    ranges = {
        "handler": runtime_slice(executable, 0x0C156D80, 14),
        "setter": runtime_slice(executable, 0x0C188088, 6),
        "consumerInit": runtime_slice(executable, 0x0C187394, 116),
        "consumerUpdate": runtime_slice(executable, 0x0C187408, 336),
        "hatoCall": mapinfo[0x800F2:0x80106],
    }
    expected = {
        "handler": "9f317501d9ece7aad52549b923b81b2c332c4a05a434c18514894814ce958724",
        "setter": "8310220c01acf625df8dd2c358c0c33de39c389563b39779c7f41d0a3e72f361",
        "consumerInit": "5d854c9c44581cc292f430d2114a898d4c3d7e277203ebfa411904d0df71fa4e",
        "consumerUpdate": "6bcbfe0b6225b44f6d673cd98d5586283a2be01afb053436a245598c5bf43fcb",
        "hatoCall": "e25a496c612662c1130a294cd3ae1fe7454e774532aa66a1086159495fd64316",
    }
    actual = {name: sha256(data) for name, data in ranges.items()}
    if actual != expected:
        raise ValueError(f"verified code ranges changed: {actual}")
    if u32(executable, 0x0C156EB4) != 0x0C188088:
        raise ValueError("operation-0x00ac setter target changed")
    if u32(executable, 0x0C1880C4) != 0x0C225340:
        raise ValueError("operation-0x00ac byte address changed")

    return {
        "schema": "new-yokosuka-global-byte-state-operation-evidence-v1",
        "status": "exact-native-handler-write-consumer-and-hato-dataflow",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 172,
            "operationHex": "0x00ac",
            "handlerAddress": "0x0c156d80",
            "handlerSha256": actual["handler"],
            "setterAddress": "0x0c188088",
            "setterSha256": actual["setter"],
            "destinationAddress": "0x0c225340",
            "destinationWidth": "byte",
            "argument": {
                "index": 0,
                "behavior": "low byte is written directly to 0x0c225340",
            },
            "provenBehavior": (
                "Writes the low byte of argument zero directly to global "
                "address 0x0c225340."
            ),
            "consumerEvidence": {
                "initializationFunction": "0x0c187394",
                "initializationSha256": actual["consumerInit"],
                "updateFunction": "0x0c187408",
                "updateSha256": actual["consumerUpdate"],
                "boundedBehavior": (
                    "The neighboring subsystem initializes the byte to one, "
                    "branches on whether it is zero during its update, and "
                    "restores it to one after the zero branch."
                ),
            },
        },
        "hatoConversation": {
            "phase": "control cleanup",
            "callFileOffset": "0x80100",
            "value": 1,
        },
        "evidenceBoundary": [
            (
                "The handler target, destination address and width, direct "
                "write, consumer reads/writes, and Hato operand are exact."
            ),
            (
                "The owning subsystem and high-level meaning of the byte "
                "remain unresolved, so it is not named as a camera reset, "
                "visibility switch, or interpolation flag."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
