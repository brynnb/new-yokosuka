#!/usr/bin/env python3
"""Extract every native engine-dispatch call from a MAPINFO SCN3 payload.

Unlike the JOMO coverage builder, this utility is map-agnostic.  SCN3 offsets
are relative to the token signature, so maps whose SCN3 token does not begin
at file offset 0x8 (notably D000) are handled without an ad-hoc offset fix.
Arguments are emitted in the exact order seen by the native handler at r6.
"""

from __future__ import annotations

import argparse
import json
import shutil
import struct
from pathlib import Path

from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")

    data = args.mapinfo.read_bytes()
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x30 > len(data):
        parser.error("input does not contain a complete SCN3 token")

    token_size = struct.unpack_from("<I", data, scn3_offset + 4)[0]
    code_end_relative = struct.unpack_from(
        "<I",
        data,
        scn3_offset + 0x0C,
    )[0]
    static_data_relative = struct.unpack_from(
        "<I",
        data,
        scn3_offset + 0x10,
    )[0]
    token_end = scn3_offset + token_size
    code_start = scn3_offset + 0x30
    code_end = scn3_offset + code_end_relative
    static_data_base = scn3_offset + static_data_relative
    if not (
        code_start <= code_end <= static_data_base <= token_end <= len(data)
    ):
        parser.error("SCN3 code/static/token ranges are inconsistent")

    # SCN3 callback functions occupy the region between the primary-code
    # boundary and static data.  This includes ordinary door/warp callbacks.
    executable_code_end = static_data_base
    instructions = [
        instruction
        for instruction in disassemble(args.mapinfo, args.objdump)
        if code_start <= instruction[0] < executable_code_end
    ]
    calls = extract_dispatch_calls(instructions, static_data_base)
    report = {
        "schema": "new-yokosuka-mapinfo-dispatch-calls-v3",
        "source": str(args.mapinfo),
        "argumentOrder": (
            "native r6 memory order (first word consumed by handler first)"
        ),
        "scn3FileOffset": f"0x{scn3_offset:x}",
        "primaryCodeEndFileOffset": f"0x{code_end:x}",
        "executableCodeFileRange": [
            f"0x{code_start:x}",
            f"0x{executable_code_end:x}",
        ],
        "staticDataFileOffset": f"0x{static_data_base:x}",
        "callCount": len(calls),
        "calls": calls,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out} ({len(calls)} dispatch calls)")


if __name__ == "__main__":
    main()
