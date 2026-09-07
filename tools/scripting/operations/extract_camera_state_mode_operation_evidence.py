#!/usr/bin/env python3
"""Verify and emit the exact operation-0x000e camera-state behavior."""

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
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/camera-state-mode-operation-evidence.json"
)
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
    handler = runtime_slice(executable, 0x0C156A58, 128)
    selector = runtime_slice(executable, 0x0C09F4C6, 24)
    if sha256(handler) != (
        "d1ecd8afbfef82aad58ad20e8bebd3d7c0012caebfb64f5b11e432b24badf744"
    ):
        raise ValueError("operation-0x000e handler changed")
    if sha256(selector) != (
        "3145d92ed2de645695f0acb686ee58d56b742954c7d3db03b534a3b51401a903"
    ):
        raise ValueError("camera mode selector changed")
    if u32(executable, 0x0C156C84) != 0x0C09F4C6:
        raise ValueError("operation-0x000e no longer targets camera selector")
    return {
        "schema": "new-yokosuka-camera-state-mode-operation-evidence-v1",
        "status": "exact-native-handler-and-camera-state-write",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
        },
        "operation": {
            "operationId": 14,
            "operationHex": "0x000e",
            "handlerAddress": "0x0c156a58",
            "handlerSampleSha256": sha256(handler),
            "cameraStateModeSelectorAddress": "0x0c09f4c6",
            "cameraStateModeSelectorSha256": sha256(selector),
            "argument": {
                "index": 0,
                "meaning": (
                    "camera-state mode forwarded unchanged to the native "
                    "camera subsystem"
                ),
            },
            "provenBehavior": (
                "Forwards its first argument unchanged to the shared camera-"
                "state mode selector, which records the requested mode and "
                "performs the native mode transition."
            ),
        },
        "crossOperationEvidence": {
            "operationHex": "0x0011",
            "relationship": (
                "The independently recovered event-camera request handler "
                "uses the same selector address with constant mode 6."
            ),
            "source": "tools/evidence/event-camera-operation-evidence.json",
        },
        "hatoConversation": {
            "phase": "control cleanup",
            "callFileOffset": "0x80110",
            "requestedMode": 0,
        },
        "evidenceBoundary": [
            (
                "The handler forwarding, shared selector address, requested "
                "mode value, and state-machine transition are exact."
            ),
            (
                "Individual numeric modes are not assigned invented names. "
                "Only mode 6's event-camera relationship is independently "
                "proven by operation 0x0011."
            ),
            (
                "Hato requests mode 0 after releasing its look point; the "
                "browser follow-camera transition contract remains unresolved."
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
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
