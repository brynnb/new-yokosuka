#!/usr/bin/env python3
"""Verify the native packed STEP-byte writer and inventory every recovered call."""

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C16B3E0, 46, "0f8989d4388a2f7c5fe54485465138e542a775d673b128b15c898ee221ee5514"),
    "stepWriter": (0x0C17BBBC, 56, "c9d619421a39027100def7e074a7942dcce2a8c72f8931b3f5e816c4dc84ad2a"),
    "actorResolver": (0x0C153956, 58, "b99d1c60ec19d8c20dec13ede36b9f81a3b04510da97159b53e03db38deba35f"),
    "recordResolver": (0x0C0AAD5A, 52, "14abed9a9089fed352b450240afd7cf7dd112eca734db9e98d97a45a47aa05eb"),
    "footstepCallback": (0x0C17BB14, 168, "e3b5840bcc80408988e8acd30c3c9ce01e3d0fc11d14272ecc59fad97f0cb3e9"),
}


def build_report(executable, event_ir, ir_sha256):
    if hashlib.sha256(executable).hexdigest() != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, digest) in RANGES.items():
        if hashlib.sha256(executable[address - BASE:address - BASE + size]).hexdigest() != digest:
            raise ValueError(f"STEP {name} changed")
    literals = {address: struct.unpack_from("<I", executable, address - BASE)[0]
                for address in [0x0C16B46C, 0x0C16B470, 0x0C17BC58, 0x0C17BC5C]}
    if list(literals.values()) != [0x0C153956, 0x0C17BBBC, 0x50455453, 0x0C0AAD5A]:
        raise ValueError("STEP handler dependencies changed")
    calls = [
        {"disc": m["disc"], "area": m["area"], "function": f["id"],
         "callFileOffset": a["callFileOffset"], "arguments": a["arguments"]}
        for m in event_ir["maps"] for f in m["functions"]
        for b in f["blocks"] for a in b["actions"]
        if a.get("kind") == "engineOperation" and a.get("operationId") == 0x00F5
    ]
    if not calls or any(len(c["arguments"]) != 2 for c in calls):
        raise ValueError("STEP authored argument ABI changed")
    return {
        "schema": "new-yokosuka-actor-step-operation-evidence-v1",
        "status": "exact-native-handler-and-recovered-corpus-inventory",
        "source": {"executable": "1ST_READ.BIN", "executableRuntimeBase": hex(BASE),
                   "executableSha256": EXECUTABLE_SHA256,
                   "eventIr": ".disc-work/dialogue/native-event-ir.json", "eventIrSha256": ir_sha256},
        "operation": {"operationId": 245, "operationHex": "0x00f5",
                      "handlerAddress": "0x0c16b3e0", "argumentCount": 2,
                      "recordTag": "STEP", "packedMode": "(argument1 >>> 8) & 255",
                      "byteValue": "argument1 & 255", "modeOffsets": {"0": 1, "1": 2},
                      "otherModes": "native no-op",
                      "missingActorOrRecord": "native no-op",
                      "provenBehavior": "Writes byte +1 (enable) for mode 0, or byte +2 (fallback surface) for mode 1. The footstep callback returns without sound when byte +1 is zero, and uses byte +2 only when the collision material is zero."},
        "inventory": {"callCount": len(calls),
                      "mapCount": len({(c["disc"], c["area"]) for c in calls}),
                      "argumentKinds": {str(i): dict(sorted(Counter(c["arguments"][i]["kind"] for c in calls).items())) for i in range(2)},
                      "constantPackedValues": dict(sorted(Counter(str(c["arguments"][1]["value"]) for c in calls if c["arguments"][1]["kind"] == "constant").items())),
                      "calls": calls},
        "verifiedRanges": {name: {"address": hex(a), "length": n, "sha256": h}
                           for name, (a, n, h) in RANGES.items()},
        "evidenceBoundary": [
            "This is the actor STEP property, not the unrelated global story STEP at 0xc22020c.",
            "Existing captured actor property bytes supply initial state; the writer does not allocate missing STEP records.",
            "The corpus inventory covers recovered script IR, not every possible executable call site.",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--event-ir", type=Path, default=ROOT / ".disc-work/dialogue/native-event-ir.json")
    parser.add_argument("--out", type=Path, default=ROOT / "tools/evidence/actor-step-operation-evidence.json")
    args = parser.parse_args()
    encoded = args.event_ir.read_bytes()
    report = build_report(args.executable.read_bytes(), json.loads(encoded), hashlib.sha256(encoded).hexdigest())
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Verified {report['inventory']['callCount']} STEP calls in {report['inventory']['mapCount']} disc/areas")


if __name__ == "__main__":
    main()
