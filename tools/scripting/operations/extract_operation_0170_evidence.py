#!/usr/bin/env python3
"""Verify operation 0x0170's exact native MAP render-preparation routes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_PROGRAM_PACK = (
    PROJECT_ROOT / "play/data/events/nativeEventPrograms.generated.json"
)
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-0170-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
EXECUTABLE_RANGES = {
    "handler": (0x0C164BE6, 128, "6e5ac52258438c4a1f432cd10c159a4ecd0f7368101939bed1fb7fa07bcc03f6"),
    "mapInitialize": (0x0C13060C, 334, "e7c47d1cba685295cae4cad38aedbf86423dfa74d0e26a99e6b26655cd73660d"),
    "slotResolver": (0x0C13075A, 38, "f5de306a4adb3709033609242bd188f17d9926695bcbf01c86a6e98d144cf321"),
    "modeZeroIndexed": (0x0C131022, 54, "a09a3cda1bf319c9e7a19c1f0f5d40759914be76b9c8ade9cd4b560ed685a456"),
    "modeZeroAll": (0x0C131058, 34, "bd004ac419c0d33b3cdf6da4a7cbd7e2c7e2075bc56e27b72326fc41bd0f6c30"),
    "modeOneIndexed": (0x0C130E60, 202, "4c60000e44cf59d9b4f90acaa9d254ee479c815744075e7a354f30b772cf17b0"),
    "modeOneAll": (0x0C130F2A, 248, "ece764e8fa5f325033243902af59076d8a537d93160fe7e89ed672cb4534789d"),
    "recursiveInvalidator": (0x0C0FC0A0, 52, "509c8267fe31c39e2ea2583631cf8541bfca7169ea0aca7ec780d37da89b907b"),
    "renderPreparation": (0x0C0FC012, 56, "6b014654c168b89b7d7a54ed50a0df8f02ec47044d6dbc6d00d46ba17d91b37e"),
    "workspaceAllocate": (0x0C0FBEFE, 44, "00881aaa80a527ae030ebdaebcaa85bc2ba382fb881bd8d85ed375a8f765571d"),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def c_string(data: bytes, address: int) -> str:
    offset = address - RUNTIME_BASE
    end = data.find(b"\0", offset)
    if offset < 0 or end < offset:
        raise ValueError(f"runtime string at 0x{address:08x} is unavailable")
    return data[offset:end].decode("ascii")


def selector_actions(program_pack: dict[str, Any]) -> dict[str, Any]:
    program = next(
        item for item in program_pack["programs"]
        if item["id"] == "disc1-d000-selector-18-0x84b60"
    )
    wanted = {"0x85e06", "0x8601e"}
    actions = {
        action["callFileOffset"]: action
        for function in program["functions"]
        for block in function["blocks"]
        for action in block["actions"]
        if action.get("callFileOffset") in wanted
    }
    if set(actions) != wanted:
        raise ValueError("D000 selector-18 operation-0x0170 route changed")
    expected = {
        "0x85e06": [0xFFFFFFFF, 0],
        "0x8601e": [0xFFFFFFFF, 1],
    }
    for offset, arguments in expected.items():
        action = actions[offset]
        if action["operationId"] != 0x0170 or [
            item.get("value") for item in action["arguments"]
        ] != arguments:
            raise ValueError(f"operation-0x0170 call at {offset} changed")
    return actions


def build_report(executable: bytes, program_pack: dict[str, Any]) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for label, (address, size, digest) in EXECUTABLE_RANGES.items():
        if sha256(runtime_slice(executable, address, size)) != digest:
            raise ValueError(f"operation-0x0170 range {label} changed")

    expected_pointers = {
        0x0C164C9C: 0x0C131058,
        0x0C164C98: 0x0C130F2A,
        0x0C164D28: 0x0C131022,
        0x0C164D24: 0x0C130E60,
        0x0C130898: 0x0C21C768,
        0x0C0FC068: 0x52455250,
    }
    for address, expected in expected_pointers.items():
        if u32(executable, address) != expected:
            raise ValueError(f"operation-0x0170 literal 0x{address:08x} changed")
    expected_strings = {
        0x0C277B40: "MAP.MT5",
        0x0C277B48: "MAP%02d.MT5",
        0x0C277B94: "MAPR",
        0x0C277B9C: "MAPP",
        0x0C277BA4: "MAPE",
        0x0C277BAC: "MAPT",
    }
    for address, expected in expected_strings.items():
        if c_string(executable, address) != expected:
            raise ValueError(f"native MAP string 0x{address:08x} changed")
    selector_actions(program_pack)

    return {
        "schema": "new-yokosuka-operation-0170-evidence-v1",
        "status": "exact-native-map-render-preparation-invalidate-and-rebuild",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "programPack": "play/data/events/nativeEventPrograms.generated.json",
        },
        "operation": {
            "operationId": 0x0170,
            "operationHex": "0x0170",
            "handlerAddress": "0x0c164be6",
            "slotCount": 32,
            "slotRecordAddress": "0x0c21c768",
            "selector": {
                "allSlots": -1,
                "indexedRange": "0..31",
            },
            "provenModes": [
                {
                    "mode": 0,
                    "behavior": (
                        "recursively clears render-preparation bit 0x10 on "
                        "each present selected MAP model hierarchy and clears "
                        "that slot's retained preparation pointer"
                    ),
                },
                {
                    "mode": 1,
                    "behavior": (
                        "allocates hierarchy-sized PRER workspace, applies the "
                        "current native render/light preparation to each "
                        "present selected MAP model, and marks preparation made"
                    ),
                },
            ],
            "mapIdentity": {
                "base": "MAP.MT5",
                "numbered": "MAP%02d.MT5",
                "sourceChunks": ["MAPR", "MAPP", "MAPE", "MAPT"],
                "workspaceTagBytes": "PRER",
            },
            "d000Selector18": {
                "invalidateCall": "0x85e06",
                "invalidateArguments": [-1, 0],
                "rebuildCall": "0x8601e",
                "rebuildArguments": [-1, 1],
            },
            "babylonAdapter": {
                "stateOwner": "play/world/NativeMapRenderPreparationState.js",
                "semanticHandler": "play/events/NativeOperation0170Runtime.js",
                "equivalentBoundary": (
                    "resynchronize light sources and mark light-dependent "
                    "materials dirty on only the exact loaded MAP layers"
                ),
                "transactional": True,
            },
            "verifiedRanges": {
                label: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": digest,
                }
                for label, (address, size, digest) in EXECUTABLE_RANGES.items()
            },
        },
        "evidenceBoundary": [
            "Operation 0x0170 controls Dreamcast render preparation for exact native MAP model slots; it does not select story state, collision visibility, actors, or a nearby scene object.",
            "D000 selector 18 invalidates all present MAP slots before changing presentation state and rebuilds all present slots afterward.",
            "Babylon does not recreate the Dreamcast PRER workspace; its explicit equivalent resynchronizes MAP mesh light sources and dirties their light-dependent materials.",
            "The adapter is transaction-owned and targets only exact MAP layers; it does not accept these calls as no-ops or broaden them to arbitrary scene meshes.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--program-pack", type=Path, default=DEFAULT_PROGRAM_PACK)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.program_pack.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: exact 32-slot MAP preparation route")


if __name__ == "__main__":
    main()
