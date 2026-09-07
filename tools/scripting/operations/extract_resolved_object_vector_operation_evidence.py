#!/usr/bin/env python3
"""Verify operation 0x001d's resolved-object three-vector behavior."""

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
    / "tools/evidence/resolved-object-vector-operation-evidence.json"
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
    ranges = {
        "handler": (0x0C15787A, 128),
        "vectorOperation": (0x0C15791C, 280),
        "directRead": (0x0C0AAF80, 20),
        "associatedRead": (0x0C0AB06A, 32),
        "directWrite": (0x0C0AAF62, 20),
        "associatedWrite": (0x0C0AB08A, 24),
    }
    expected = {
        "handler": "ea405850c9ad9d4704e6bbf9accba88b9ca2e3556ef8a9bda8c3cad49c7082d6",
        "vectorOperation": "0fca4408a6463fa75c3447c507b2345a00bea5cdfc36141999c8d5aec090a306",
        "directRead": "d652081dec5df7f6feec12e7e2c99317606041449350cd17096c5a67e674a006",
        "associatedRead": "42bfcbb9dc106fa7bba23af1ad229d782d03912d8ed2d02460cfbfe519ab69df",
        "directWrite": "d92cfde68acff87673fc3751c66aa211f6e89ecfb863cc5ab48a7f6ba8c04a54",
        "associatedWrite": "dcd6c1b3e2e622b0e9292f46c5ec4799644af6f5bac78ce7019dc0e99d918880",
    }
    actual = {
        name: sha256(runtime_slice(executable, address, size))
        for name, (address, size) in ranges.items()
    }
    if actual != expected:
        raise ValueError(f"verified vector-operation ranges changed: {actual}")
    postlude = mapinfo[0x7FB60:0x7FC2C]
    if sha256(postlude) != (
        "e0eb0159b492a7189df42662a837b6dc9776fa3d6f8d34dee630f38b236bec55"
    ):
        raise ValueError("D000/Hato postlude changed")
    call = mapinfo[0x7FC00:0x7FC1C]
    if call.hex() != (
        "00e409d59c3509d6e357462d562d662d762d1de58a508d540b40d366"
    ):
        raise ValueError("D000/Hato vector call changed")
    return {
        "schema": "new-yokosuka-resolved-object-vector-operation-evidence-v1",
        "status": "exact-native-handler-flags-and-hato-dataflow",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 29,
            "operationHex": "0x001d",
            "handlerAddress": "0x0c15787a",
            "handlerSampleSha256": actual["handler"],
            "actorResolverAddress": "0x0c153956",
            "vectorOperationAddress": "0x0c15791c",
            "vectorOperationSha256": actual["vectorOperation"],
            "arguments": [
                {
                    "index": 0,
                    "meaning": "object reference resolved by the actor resolver",
                },
                {
                    "index": 1,
                    "meaning": "bit field selecting vector source and operation",
                },
                {
                    "index": 2,
                    "meaning": "pointer to the supplied three-component vector",
                },
                {
                    "index": 3,
                    "meaning": (
                        "auxiliary pointer used only by the separately "
                        "branched angular computation"
                    ),
                },
            ],
            "normalVectorPath": {
                "associatedVectorBit": "0x40000000",
                "addInsteadOfReplaceBit": "0x80000000",
                "componentBits": [
                    {
                        "bit": "0x20000000",
                        "component": 0,
                    },
                    {
                        "bit": "0x10000000",
                        "component": 1,
                    },
                    {
                        "bit": "0x08000000",
                        "component": 2,
                    },
                ],
                "specialAngularPathMask": "0x04200000",
                "directVectorOffsets": ["+0x14", "+0x18", "+0x1c"],
                "directReadAddress": "0x0c0aaf80",
                "associatedReadAddress": "0x0c0ab06a",
                "directWriteAddress": "0x0c0aaf62",
                "associatedWriteAddress": "0x0c0ab08a",
            },
            "provenBehavior": (
                "Resolves an object, obtains one of its native three-component "
                "vectors, conditionally replaces or adds selected components "
                "from a supplied vector, and writes the result back through "
                "the matching direct or associated-object path; flag mask "
                "0x04200000 selects a separate angular computation."
            ),
        },
        "hatoConversation": {
            "phase": "postlude",
            "functionFileOffset": "0x7fb60",
            "callFileOffset": "0x7fc18",
            "actorCode": "AKIR",
            "actorLiteralValue": "0x52494b41",
            "actorLiteralLoadFileOffset": "0x7fb6c",
            "actorLocalStoreFileOffset": "0x7fb6e",
            "actorArgumentLoadFileOffset": "0x7fc08",
            "flags": "0x78000000",
            "flagsMeaning": (
                "associated-vector path; replace all three components; "
                "normal non-angular path"
            ),
            "vectorSource": {
                "base": "room VM r9",
                "offset": "0x00ec",
                "components": 3,
            },
            "auxiliaryPointer": 0,
        },
        "evidenceBoundary": [
            (
                "The resolver, flag masks, direct vector offsets, component "
                "selection, replace/add behavior, and paired read/write paths "
                "are executable-proven."
            ),
            (
                "Exact D000 constant propagation proves Hato's postlude "
                "targets AKIR and replaces all three components from room-VM "
                "vector r9 +0x00ec."
            ),
            (
                "The vectors' engine-wide coordinate-space names and the "
                "special angular path's gameplay purpose remain deliberately "
                "unnamed."
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
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
