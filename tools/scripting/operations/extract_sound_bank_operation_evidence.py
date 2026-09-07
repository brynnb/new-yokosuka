#!/usr/bin/env python3
"""Prove operation 0x00f3's exact eight-slot sound-bank contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = ROOT.parent / "new-yokosuka"
DEFAULT_EXECUTABLE = SOURCE_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_MAPINFO = (
    SOURCE_ROOT / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/native-sound-bank-operation-evidence.json"
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)
RUNTIME_BASE = 0x0C010000
RANGES = {
    "handler": (
        0x0C16B350,
        8,
        "1c8b2669297efad1d2ac9009ae635a3b829c9e9b7f1dfdd0358eb81e6b36d4ce",
    ),
    "reconciler": (
        0x0C17A160,
        238,
        "29d18a68838ffa37a21e7b714b52c4cd7cc929bc5fc1867c65b2187de64b92b3",
    ),
    "installOrRelease": (
        0x0C17A24E,
        156,
        "81035a9f9252152d836026c9e71fa217935f7bbf50eb5244baaef79db03b6fa9",
    ),
    "slotMatchesRequest": (
        0x0C17A632,
        38,
        "e954581dae6a1a3a01edd39fd390fbccbf2de4a6d7d5091456f69b7d8c4dadf9",
    ),
}
D000_SELECTOR_18_POINTERS = [
    0,
    0,
    0x000B132C,
    0x000B1337,
    0x000B133C,
    0x000B1349,
    0x000B1356,
    0x000B135B,
]
D000_SELECTOR_18_REQUEST = [
    None,
    None,
    "bgm013.snd",
    "FREE",
    "a1_senfk.snd",
    "battle_1.snd",
    "FREE",
    "FREE",
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def c_string(data: bytes, offset: int) -> str:
    if offset < 0 or offset >= len(data):
        raise ValueError(f"MAPINFO string offset 0x{offset:x} is unavailable")
    end = data.find(b"\0", offset)
    if end < 0:
        raise ValueError(f"MAPINFO string offset 0x{offset:x} is unterminated")
    return data[offset:end].decode("ascii")


def build_report(executable: bytes, mapinfo: bytes) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if digest(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected Disc 1 D000 MAPINFO.BIN")
    verified_ranges = {}
    for name, (address, size, expected_digest) in RANGES.items():
        actual = digest(runtime_slice(executable, address, size))
        if actual != expected_digest:
            raise ValueError(f"operation-0x00f3 {name} range changed")
        verified_ranges[name] = {
            "address": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }
    if u32(executable, 0x0C16B454) != 0x0C20C3D8:
        raise ValueError("operation-0x00f3 state pointer changed")
    if u32(executable, 0x0C16B458) != 0x0C17A160:
        raise ValueError("operation-0x00f3 reconciler target changed")
    if u32(executable, 0x0C17A334) != 0x0C27B0F0:
        raise ValueError("operation-0x00f3 FREE pointer changed")
    if u32(executable, 0x0C17A338) != 0x0C179E0E:
        raise ValueError("operation-0x00f3 string comparator changed")
    if runtime_slice(executable, 0x0C27B0F0, 5) != b"FREE\0":
        raise ValueError("operation-0x00f3 FREE sentinel changed")
    request = [
        None if pointer == 0 else c_string(mapinfo, pointer)
        for pointer in D000_SELECTOR_18_POINTERS
    ]
    if request != D000_SELECTOR_18_REQUEST:
        raise ValueError("D000 selector-18 sound-bank request changed")
    return {
        "schema": "new-yokosuka-native-sound-bank-operation-evidence-v1",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": f"0x{RUNTIME_BASE:08x}",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 0x00F3,
            "operationHex": "0x00f3",
            "argumentCount": 8,
            "handlerAddress": "0x0c16b350",
            "handlerTargetAddress": "0x0c17a160",
            "stateAddress": "0x0c20c3d8",
        },
        "helpers": {
            "reconcile": "0x0c17a160",
            "installSlot": "0x0c17a24e",
            "releaseSlot": "0x0c17a2ea",
            "slotMatchesRequest": "0x0c17a632",
            "stringComparator": "0x0c179e0e",
            "freeSentinelAddress": "0x0c27b0f0",
            "freeSentinel": "FREE",
        },
        "verifiedRanges": verified_ranges,
        "provenBehavior": [
            "The handler forwards the native argument array to a fixed eight-slot reconciler.",
            "A null request skips both comparison and installation for that slot, preserving its current occupant.",
            "A non-null request releases a mismatched current occupant before installation.",
            "The exact string FREE releases the selected slot and does not install a bank.",
            "Every other non-null request is passed to the native sound-bank installation path in its authored slot.",
        ],
        "d000Selector18": {
            "functionFileOffset": "0x84b60",
            "blockFileOffset": "0x84b8e",
            "callFileOffset": "0x84bcc",
            "argumentPointers": [f"0x{value:08x}" for value in D000_SELECTOR_18_POINTERS],
            "request": request,
        },
        "evidenceBoundary": (
            "This proves ordered sound-bank residency behavior. It does not "
            "equate the operation with immediate playback, synthesize missing "
            "audio assets, or assign meanings to the individual slot numbers."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["operation"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
