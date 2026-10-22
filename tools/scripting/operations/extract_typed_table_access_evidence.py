#!/usr/bin/env python3
"""Verify the original typed element-access ABI and its VM result rules."""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = 0x0C010000
EXE_SHA = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "handler": (0x0C1737B4, 0xce, "85a87c0051bf9daaa09099fd2414c816ff445e68ff58c190bd51b89f026069ed"),
    "relativePointer": (0x0C0BB37E, 8, "6ef7333e7e1079d37677c87017b21a2c69d1b945bd1282b5a3b3db4f9768b290"),
    "primaryDispatcher": (0x0C0BB6FE, 0x2c, "7987e9f08ccb1eac0d71e2a7fb2c217011f8a63dd4f846fe9f15dce7fd4b1061"),
}
BRANCHES = {
    0x0C173820: {"access": "read", "width": 1, "valueKind": "unsigned-byte"},
    0x0C173826: {"access": "read", "width": 2, "valueKind": "unsigned-word"},
    0x0C17382C: {"access": "read", "width": 4, "valueKind": "raw-dword"},
    0x0C173830: {"access": "read", "width": 4, "valueKind": "float32-bits"},
    0x0C173846: {"access": "read", "width": 4, "valueKind": "module-relative-pointer"},
    0x0C173858: {"access": "write", "width": 1, "valueKind": "low-byte"},
    0x0C17385E: {"access": "write", "width": 2, "valueKind": "low-word"},
    0x0C173864: {"access": "write", "width": 4, "valueKind": "raw-dword"},
    0x0C173868: {"access": "write", "width": 4, "valueKind": "float32-bits"},
    0x0C17386E: {"access": "write", "width": 4, "valueKind": "raw-dword"},
}


def build(executable: bytes) -> dict:
    if hashlib.sha256(executable).hexdigest() != EXE_SHA:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (a, n, expected) in RANGES.items():
        if hashlib.sha256(executable[a - BASE:a - BASE + n]).hexdigest() != expected:
            raise ValueError(f"typed-table {name} changed")
    if struct.unpack_from("<I", executable, 0x0C29AC48 - BASE)[0] != 0x0C1737B4:
        raise ValueError("typed-table dispatch entry changed")
    routes = []
    for i in range(18):
        target = 0x0C1737F8 + struct.unpack_from("<h", executable, 0x0C1737FC - BASE + i * 2)[0]
        if target != 0x0C173872:
            routes.append({"mode": i + 1, "target": hex(target), **BRANCHES[target]})
    return {"schema": "new-yokosuka-native-typed-table-evidence-v1",
            "source": {"executable": "1ST_READ.BIN", "sha256": EXE_SHA}, "routes": routes,
            "verifiedRanges": {k: {"address": hex(a), "length": n, "sha256": h} for k, (a, n, h) in RANGES.items()},
            "contract": [
                "Arguments zero/one/two are memory base, mode and element index; writes read a fourth raw word. There is no descriptor struct at the base pointer.",
                "Byte, word and dword addresses use index multiplied by one, two and four respectively, with native 32-bit wrapping.",
                "Float loads/stores preserve raw bits in the VM return cell. Mode eight adds the current module's data base to its loaded relative pointer word.",
                "The primary dispatcher pre-clears its return cell. Writes and unsupported switch modes therefore return zero.",
            ],
            "boundary": "The browser memory adapter operates only on declared source-owned module ranges. Native heap/frame-pointer aliases and unowned addresses remain explicit unsupported inputs."}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    p.add_argument("--out", type=Path, default=ROOT / "tools/evidence/typed-table-access-evidence.json")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()
    text = json.dumps(build(args.executable.read_bytes()), indent=2) + "\n"
    if args.check:
        if args.out.read_text() != text: raise SystemExit("typed-table evidence is stale")
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print("Verified typed table reads/writes, relative-pointer mode and VM result initialization")


if __name__ == "__main__": main()
