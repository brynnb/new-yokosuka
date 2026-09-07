#!/usr/bin/env python3
"""Verify operation 0x004c's native LNWK command dispatcher."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/actor-lnwk-operation-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
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


def build_report(executable: bytes) -> dict:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    definitions = [
        (0, 0x0C0EE3EA, 518, "0b86d244fb9d588ddbc101df22eb08ba3632498bb1009a6b7cf81c7c6e840d0f"),
        (1, 0x0C0EE5F0, 116, "9d96193554d1b86ea607508940e031a2dae1ff03ccc1e10ff009b64eb2ff24b9"),
        (2, 0x0C0EE664, 250, "2ef5960cc294bc15256c8562503027ff95d1c4363deb340c9e2323f564ab30a2"),
        (3, 0x0C0EE75E, 78, "2071cb3f2481019fdf5ad744cecab650ffb13c23361850cedd96c6399de3fa65"),
        (4, 0x0C0EE7AC, 88, "cdcaaed34734c0546f754304fa3e516a0e74619e5cc13e38aab6e821ad84b5ca"),
    ]
    commands = []
    for command, address, size, expected in definitions:
        sample = runtime_slice(executable, address, size)
        actual = sha256(sample)
        if actual != expected:
            raise ValueError(f"LW command {command} changed: {actual}")
        commands.append({
            "command": command,
            "encodedValue": f"0x{0x4C570000 + command:08x}",
            "targetAddress": f"0x{address:08x}",
            "targetSha256": actual,
        })

    handler = runtime_slice(executable, 0x0C1724A4, 6)
    dispatcher = runtime_slice(executable, 0x0C0EE804, 76)
    if sha256(handler) != "1431193cbe44431d00075483b1b2333ff253417934827ea05516a0abd68b8053":
        raise ValueError("operation-0x004c thunk changed")
    if sha256(dispatcher) != "c4be4823c77039dac44b1fb488fcc3eefe5099d1b5a3f72c746abc5162fa73b3":
        raise ValueError("LNWK dispatcher changed")
    if u32(executable, 0x0C1724B4) != 0x0C0EE804:
        raise ValueError("operation-0x004c dispatcher target changed")
    if u32(executable, 0x0C0EE8B0) != 0x0C153956:
        raise ValueError("LNWK actor resolver changed")
    if u32(executable, 0x0C0EE8B4) != 0x4B574E4C:
        raise ValueError("LNWK tag changed")
    if u32(executable, 0x0C0EE8B8) != 0x0C0AAD5A:
        raise ValueError("LNWK record resolver changed")
    for index, command in enumerate(commands):
        if u32(executable, 0x0C0EE8BC + index * 4) != 0x4C570000 + index:
            raise ValueError(f"LW command constant {index} changed")

    return {
        "schema": "new-yokosuka-actor-lnwk-operation-evidence-v1",
        "status": "exact-native-handler-dispatch-and-record-family",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
        },
        "operation": {
            "operationId": 76,
            "operationHex": "0x004c",
            "handlerAddress": "0x0c1724a4",
            "handlerSha256": sha256(handler),
            "dispatcherAddress": "0x0c0ee804",
            "dispatcherSha256": sha256(dispatcher),
            "commandArgumentIndex": 0,
            "actorArgumentIndex": 1,
            "actorResolverAddress": "0x0c153956",
            "associatedRecordResolverAddress": "0x0c0aad5a",
            "associatedRecordTag": "LNWK",
            "associatedRecordTagValue": "0x4b574e4c",
            "commands": commands,
            "provenBehavior": (
                "Dispatches encoded LW commands 0 through 4, resolves the "
                "supplied actor, and creates, updates, advances, writes, or "
                "releases fields in that actor's associated LNWK record."
            ),
        },
        "allDiscScriptEvidence": {
            "engineOperationCallCount": 153,
            "observedEncodedCommands": [
                "0x4c570000",
                "0x4c570001",
                "0x4c570002",
                "0x4c570003",
            ],
            "unobservedButNativeCommand": "0x4c570004",
        },
        "evidenceBoundary": [
            (
                "The thunk, dispatcher, five command constants and targets, "
                "actor resolution, LNWK tag, and associated-record lookup are "
                "executable-proven."
            ),
            (
                "LNWK is retained as the native record-family name. Its "
                "expanded gameplay meaning and several command fields remain "
                "unresolved rather than being guessed."
            ),
            (
                "Operation 0x004c does not occur inside the four exact Hato "
                "conversation phase functions."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes())
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
