#!/usr/bin/env python3
"""Verify and emit the exact operation-0x0042 MOMT flag behavior."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_MAPINFO = (
    PROJECT_ROOT / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/actor-momt-flag-operation-evidence.json"
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


def build_report(executable: bytes, mapinfo: bytes) -> dict:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected D000 MAPINFO.BIN")

    handler = runtime_slice(executable, 0x0C165E22, 128)
    setter = runtime_slice(executable, 0x0C113AB0, 46)
    resolver = runtime_slice(executable, 0x0C113A76, 32)
    cleanup = mapinfo[0x7FD94:0x7FDC0]
    expected = {
        "handler": "94426dc4e21d845cfbdba6201377d796c70012a3a66bcd75fb631c682bfbe909",
        "setter": "94d5da7d12620f27e8163eb7bdb9275769b226cbf9fb7fa39fc145c0edae32c0",
        "resolver": "7a82eb94931edc37e37678ec249f38629cec8ec2c59d270a8c89e1e96e40f0a2",
        "cleanup": "ec6477b736b72ab2f1f64affce11f26c7e5fa5d1db617d30e58e2104ce386ecc",
    }
    actual = {
        "handler": sha256(handler),
        "setter": sha256(setter),
        "resolver": sha256(resolver),
        "cleanup": sha256(cleanup),
    }
    if actual != expected:
        raise ValueError(f"verified code ranges changed: {actual}")

    # The cleanup function writes literal AKIR to local slot zero, reloads
    # that exact slot as argument zero, pushes literal one as argument one,
    # and dispatches operation 0x42. Keep the instruction bytes as an
    # independent deterministic guard for that constant propagation.
    cleanup_call = mapinfo[0x7FDA0:0x7FDB8]
    if cleanup_call.hex() != (
        "1ed55224536001e4e055462d562d42e58a508d540b40d366"
    ):
        raise ValueError("D000/Hato cleanup call no longer matches")

    return {
        "schema": "new-yokosuka-actor-momt-flag-operation-evidence-v1",
        "status": "exact-native-handler-and-hato-dataflow",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 66,
            "operationHex": "0x0042",
            "handlerAddress": "0x0c165e22",
            "handlerSampleSha256": actual["handler"],
            "actorResolverAddress": "0x0c153956",
            "momtRecordResolverAddress": "0x0c0aad5a",
            "momtTagAscii": "MOMT",
            "momtTagValue": "0x544d4f4d",
            "flagSetterAddress": "0x0c113ab0",
            "flagSetterSha256": actual["setter"],
            "arguments": [
                {
                    "index": 0,
                    "meaning": (
                        "actor reference resolved by the native actor resolver"
                    ),
                },
                {
                    "index": 1,
                    "meaning": (
                        "zero clears MOMT record +0x14 bit 0; nonzero sets it"
                    ),
                },
            ],
            "provenBehavior": (
                "Resolves the actor's associated MOMT record and clears or "
                "sets bit 0 of the 32-bit flags word at record +0x14."
            ),
        },
        "hatoConversation": {
            "phase": "cleanup",
            "functionFileOffset": "0x7fd94",
            "callFileOffset": "0x7fdb4",
            "actorCode": "AKIR",
            "actorLiteralValue": "0x52494b41",
            "actorLiteralLoadFileOffset": "0x7fda0",
            "actorLocalStoreFileOffset": "0x7fda2",
            "actorArgumentLoadFileOffset": "0x7fda8",
            "flagValue": 1,
            "cleanupFunctionSha256": actual["cleanup"],
        },
        "evidenceBoundary": [
            (
                "The actor resolution, MOMT associated-record lookup, exact "
                "flag word offset, and bit-zero mutation are executable-proven."
            ),
            (
                "Constant propagation through the D000 cleanup function "
                "proves that the runtime-looking actor operand is AKIR."
            ),
            (
                "The consumer-side meaning of MOMT flag bit 0 remains "
                "unresolved; it is not labelled movement lock, input lock, "
                "visibility, or animation state."
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
    args.out.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
