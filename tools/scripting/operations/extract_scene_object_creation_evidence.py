#!/usr/bin/env python3
"""Recover operation 0x0008's zero-motion named-object creation contract."""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "dispatcher": (0x0C17344A, 0xf8, "d0efe2c44f2cd17d0b3b0120531be271177a2730679960bb2fc7cc7d0ce351a0"),
    "objectCreate": (0x0C0F0D0C, 0x68, "848b834b45f380c860390e6de95c72d456ca0c622160b214c4e9e8b7b02837db"),
    "baseConstructor": (0x0C0AAA38, 0x10c, "fec028dce1dba45fdbc1ad8d0c13e69c1c8f0454c608b76fb5672d58b27cb4ab"),
    "resultStore": (0x0C0BB342, 6, "0e95a398fa69bff19b2b51bfecd66ebcbddc95a59adb8690eafbb32ad4cbb2c2"),
    "chidInstall": (0x0C152D9A, 0x56, "49688f8f5fa5dc2f5489b6b0f016ce6b7dc722cdc31506f0e287cbc6375ba177"),
    "nameLookup": (0x0C153956, 0x48, "d48f79e4ae5ed14072c976306db5c3210782deaa3935c6f34bc6fc95b34f837f"),
    "imgmInstall": (0x0C0E3208, 0x22, "536f2160d417051ad83861e1b7601afeee1454b4d9a6d42b27401cc9177c42f9"),
    "secondaryDispatcher": (0x0C160918, 0x30, "9e0be555668022780e0216cb9d2f42c3b3ecdf0eeb34c3a364467394c89a1a90"),
    "cpamHandler": (0x0C15F388, 0x16, "c54676749e11ff6248aa6314b3386da3c5131ac3a59c666d24d4dc075a609ae7"),
    "cpamInstall": (0x0C0F54F2, 0x12, "bfa56ce6f8ecae340f2d9a96bc28cabad34c2ddb40dc6ad93ccd15dc5dc9747e"),
    "cpamUpdate": (0x0C0F53EC, 0x106, "d4b787dc9e97156afd56f788edcbf2111391c3a31dc78f6a3baf97587b048053"),
    "namedRecordAllocate": (0x0C0AAC90, 0xca, "4664b89f02173f3c24c1e2004ab96bcfd14caa24c3d9e3baf92ee4e62439eb72"),
    "recordZeroFill": (0x0C1DC970, 0x18, "5ad3e0d54fc4dd851554f442557da8a4e985f67c4f753bca372b415771537b61"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_report(executable: bytes) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(executable[address - BASE:address - BASE + size]) != expected:
            raise ValueError(f"named-object {name} changed")
    if struct.unpack_from("<I", executable, 0x0C29AA00 - BASE)[0] != 0x0C17344A:
        raise ValueError("operation 0x0008 table entry changed")
    if struct.unpack_from("<I", executable, 0x0C281284 - BASE)[0] != 0x0C15F388:
        raise ValueError("secondary operation 0x0003 table entry changed")
    kinds = list(struct.unpack_from("<4H", executable, 0x0C28ADD8 - BASE))
    start = 0x0C279830 - BASE
    name_format = executable[start:executable.index(0, start)].decode("ascii")
    contract = {
        "schema": "new-yokosuka-native-scene-object-creation-v1",
        "source": {"executable": "1ST_READ.BIN", "sha256": EXECUTABLE_SHA256},
        "operationId": 8, "handlerAddress": "0x0c17344a",
        "supportedMotionOperand": 0,
        "taskKinds": kinds,
        "baseTag": "CEWP", "associationTag": "CHAR", "nameRecordTag": "CHID", "imageRecordTag": "IMGM",
        "positionWords": [0, 0, 0], "orientationWords": [0, 0, 0],
        "scaleWords": [0x3f800000] * 3,
        "dword5c": struct.unpack_from("<H", executable, 0x0C0AAB7A - BASE)[0],
        "dword7c": 0,
        "cpam": {"secondaryOperationId": 3, "recordTag": "CPAM", "recordBytes": 4,
                 "floatOffset": "0x48", "initialFloatWord": 0,
                 "initialPayloadWord": 0, "nativeUpdateCallback": "0x0c0f53ec", "vmResult": 0},
        "autoName": {"counterAddress": "0x0c29b12c", "format": name_format,
                     "initialCounter": struct.unpack_from("<I", executable, 0x0C29B12C - BASE)[0],
                     "modulus": struct.unpack_from("<H", executable, 0x0C173590 - BASE)[0]},
    }
    if kinds != [5, 6, 7, 8] or name_format != " %03d" or contract["dword5c"] != 0x85:
        raise ValueError("named-object source layout changed")
    return {"schema": "new-yokosuka-native-scene-object-creation-evidence-v1", "contract": contract,
            "verifiedRanges": {name: {"address": hex(a), "length": n, "sha256": h} for name, (a, n, h) in RANGES.items()},
            "behavior": [
                "Selector 0/1/2/3 maps to task category 5/6/7/8; these are constructor categories, not model filenames or existing object handles.",
                "Zero target name formats a space and three decimal digits, advances the shared counter modulo 1000, and retries names already in the module's object namespace.",
                "Explicit names are retained bit-exactly, including lowercase. Their CHID record is installed at the head; duplicate literal names are not auto-renamed.",
                "The result is the selected name word, written by 0xc0bb342, not the allocated CEWP address.",
                "Secondary operation three resolves its sole name operand, explicitly writes float32 +0 at object +0x48 and installs the four-byte CPAM record. It does not publish the allocation pointer as a VM result; the secondary dispatcher leaves its pre-cleared result zero.",
                "A zero name resolves to null, never the current presentation owner. The named-record allocator clears the full aligned allocation, including the four-byte CPAM payload, and allocates another record on repeated installation.",
            ],
            "evidenceBoundary": [
                "Only the zero-motion operand path is recovered here; nonzero motion installation remains unsupported.",
                "Task allocation callbacks, geometry/data installation by operation 0x0009, browser roots and render visibility are separate boundaries.",
                "CPAM's native per-frame camera projection/update is not implemented by the record installer; its payload zero comes from the original allocator/zero-fill helper.",
                "The bounded browser name search reports exhaustion rather than reproducing the native infinite retry when all 1000 generated names collide.",
            ]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--out", type=Path, default=ROOT / "tools/evidence/scene-object-creation-evidence.json")
    parser.add_argument("--runtime-out", type=Path, default=ROOT / "play/data/events/nativeSceneObjectCreation.generated.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    report = build_report(args.executable.read_bytes())
    for path, value in [(args.out, report), (args.runtime_out, report["contract"])]:
        text = json.dumps(value, indent=2) + "\n"
        if args.check:
            if path.read_text() != text:
                raise SystemExit(f"named-object generated data is stale: {path.name}")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    print("Verified native named-object creation, constructor defaults and generated-name ownership")


if __name__ == "__main__":
    main()
