#!/usr/bin/env python3
"""Recover D000's public SCN3 exports and generated target table.

There are two distinct tables near the end of D000's SCN3 token:

* the six-entry public export table installed in the live SCN3 runtime; and
* a maximal 858-entry suffix of generated coroutine targets.

The latter contains the shared logical-door dispatcher, but it is not the
public export table.  This tool uses a captured runtime object to recover the
public table exactly, then independently recovers and verifies the broader
generated-target table.  It deliberately leaves the broad table's engine
consumer unnamed until that indirect scheduler boundary is proven.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


RAM_BASE = 0x0C000000
GENERATED_COROUTINE_PROLOGUE = bytes.fromhex("e62d224d")
DOOR_ROUTINE_FILE_OFFSET = 0x783B4


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def hx(value: int) -> str:
    return f"0x{value:08x}"


def ram_offset(address: int, ram: bytes) -> int:
    offset = address - RAM_BASE
    if not 0 <= offset <= len(ram) - 4:
        raise ValueError(f"RAM address is out of range: {hx(address)}")
    return offset


def find_runtime_object(
    ram: bytes,
    module_address: int,
    static_relative: int,
    code_relative: int,
) -> int:
    """Find the live SCN3 runtime from constructor-initialized fields."""
    needle = struct.pack("<I", module_address)
    candidates: list[int] = []
    cursor = 0
    while True:
        occurrence = ram.find(needle, cursor)
        if occurrence < 0:
            break
        cursor = occurrence + 1
        runtime = occurrence - 4
        if runtime < 0 or runtime + 0x6C > len(ram):
            continue
        if (
            u32(ram, runtime + 0x04) == module_address
            and u32(ram, runtime + 0x14) == module_address
            and u32(ram, runtime + 0x28) == module_address
            and u32(ram, runtime + 0x2C)
            == module_address + static_relative
            and u32(ram, runtime + 0x68)
            == module_address + code_relative
        ):
            table_address = u32(ram, runtime + 0x0C)
            export_count = u32(ram, runtime + 0x10)
            if 0 < export_count < 0x100 and (
                module_address <= table_address
                < module_address + 0x01000000
            ):
                candidates.append(runtime)
    if len(candidates) != 1:
        raise ValueError(
            "Captured SCN3 runtime is absent or ambiguous: "
            f"{[hx(RAM_BASE + item) for item in candidates]}"
        )
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("ram", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    data = args.mapinfo.read_bytes()
    ram = args.ram.read_bytes()
    scn3 = data.find(b"SCN3")
    if scn3 < 0 or scn3 + 0x30 > len(data):
        raise ValueError("MAPINFO does not contain a complete SCN3 header")

    token_size = u32(data, scn3 + 4)
    static_relative = u32(data, scn3 + 0x10)
    code_relative = u32(data, scn3 + 0x20)
    token_end = scn3 + token_size
    if not (0x30 <= code_relative < static_relative < token_size):
        raise ValueError("SCN3 executable/token ranges are inconsistent")
    if token_end > len(data):
        raise ValueError("SCN3 token extends beyond MAPINFO")

    # Locate the captured module by immutable header/code bytes.
    identity = data[scn3:scn3 + 0x40]
    loaded_offset = ram.find(identity)
    if loaded_offset < 0 or ram.find(identity, loaded_offset + 1) >= 0:
        raise ValueError("Captured D000 SCN3 module is absent or ambiguous")
    loaded_scn3 = RAM_BASE + loaded_offset

    runtime_offset = find_runtime_object(
        ram,
        loaded_scn3,
        static_relative,
        code_relative,
    )
    runtime_address = RAM_BASE + runtime_offset
    public_table_address = u32(ram, runtime_offset + 0x0C)
    public_count = u32(ram, runtime_offset + 0x10)
    public_relative = public_table_address - loaded_scn3
    public_file_offset = scn3 + public_relative
    if not (
        0 <= public_relative < token_size
        and public_file_offset + public_count * 4 <= token_end
    ):
        raise ValueError("Live public export table does not map into SCN3")

    public_entries = [
        u32(data, public_file_offset + index * 4)
        for index in range(public_count)
    ]
    public_bytes = data[
        public_file_offset:public_file_offset + public_count * 4
    ]
    captured_public = ram[
        ram_offset(public_table_address, ram):
        ram_offset(public_table_address, ram) + public_count * 4
    ]
    if captured_public != public_bytes:
        raise ValueError("Captured public export table differs from MAPINFO")
    if not all(
        0x30 <= target < static_relative
        and data[scn3 + target:scn3 + target + 4]
        == GENERATED_COROUTINE_PROLOGUE
        for target in public_entries
    ):
        raise ValueError("Public export target is invalid")

    # Independently recover the maximal generated-target suffix.  Runtime
    # evidence proves this is not the public export table.
    generated_table_start = token_end
    while generated_table_start >= scn3 + 4:
        relative_target = u32(data, generated_table_start - 4)
        target = scn3 + relative_target
        if (
            relative_target & 1
            or not 0x30 <= relative_target < static_relative
            or data[target:target + 4] != GENERATED_COROUTINE_PROLOGUE
        ):
            break
        generated_table_start -= 4

    generated_entries = [
        item[0]
        for item in struct.iter_unpack(
            "<I", data[generated_table_start:token_end]
        )
    ]
    if not generated_entries or len(generated_entries) != len(
        set(generated_entries)
    ):
        raise ValueError("Generated-target suffix is empty or duplicated")
    if u32(data, generated_table_start - 4) != 0:
        raise ValueError(
            "Generated-target boundary is not preceded by its zero word"
        )

    generated_address = (
        loaded_scn3 + generated_table_start - scn3
    )
    generated_ram_offset = ram_offset(generated_address, ram)
    generated_bytes = data[generated_table_start:token_end]
    if ram[
        generated_ram_offset:generated_ram_offset + len(generated_bytes)
    ] != generated_bytes:
        raise ValueError("Captured generated-target table differs from file")

    door_relative = DOOR_ROUTINE_FILE_OFFSET - scn3
    try:
        door_index = generated_entries.index(door_relative)
    except ValueError as error:
        raise ValueError(
            "Door dispatcher is absent from generated-target table"
        ) from error
    if door_relative in public_entries:
        raise ValueError("Door dispatcher unexpectedly appears in public exports")

    loaded_target = loaded_scn3 + door_relative
    target_ram_offset = ram_offset(loaded_target, ram)
    if ram[
        target_ram_offset:target_ram_offset + 4
    ] != GENERATED_COROUTINE_PROLOGUE:
        raise ValueError("Captured door coroutine prologue differs from file")

    report = {
        "schema": "new-yokosuka-d000-door-callback-table-evidence-v2",
        "status": "exact",
        "source": {
            "mapinfo": str(args.mapinfo),
            "mapinfoSha256": hashlib.sha256(data).hexdigest(),
            "ram": str(args.ram),
            "ramSha256": hashlib.sha256(ram).hexdigest(),
        },
        "scn3": {
            "fileOffset": hx(scn3),
            "tokenSize": token_size,
            "tokenEndFileOffset": hx(token_end),
            "staticDataRelative": hx(static_relative),
            "codeRelative": hx(code_relative),
            "loadedAddress": hx(loaded_scn3),
            "runtimeObjectAddress": hx(runtime_address),
        },
        "publicExportTable": {
            "discovery": (
                "live SCN3 runtime fields +0x0c (table pointer) and +0x10 "
                "(entry count), mapped back into MAPINFO"
            ),
            "fileOffset": hx(public_file_offset),
            "relativeOffset": hx(public_relative),
            "loadedAddress": hx(public_table_address),
            "entryCount": public_count,
            "relativeTargets": [hx(item) for item in public_entries],
            "allTargetsHaveGeneratedCoroutinePrologue": True,
            "capturedTableByteExact": True,
        },
        "generatedExecutableTargetTable": {
            "discovery": (
                "maximal SCN3-token suffix of unique aligned relative targets "
                "whose code begins mov.l r14,@-r13; sts.l pr,@-r13"
            ),
            "fileOffset": hx(generated_table_start),
            "relativeOffset": hx(generated_table_start - scn3),
            "loadedAddress": hx(generated_address),
            "entryCount": len(generated_entries),
            "precedingWord": 0,
            "allTargetsHaveGeneratedCoroutinePrologue": True,
            "capturedTableByteExact": True,
            "consumerRole": "unresolved; it is not the public export table",
        },
        "doorDispatcher": {
            "generatedTargetIndexZeroBased": door_index,
            "tableEntryFileOffset": hx(
                generated_table_start + door_index * 4
            ),
            "tableEntryLoadedAddress": hx(
                generated_address + door_index * 4
            ),
            "relativeTarget": hx(door_relative),
            "targetFileOffset": hx(DOOR_ROUTINE_FILE_OFFSET),
            "targetLoadedAddress": hx(loaded_target),
            "isPublicExport": False,
            "generatedCoroutinePrologue": GENERATED_COROUTINE_PROLOGUE.hex(),
        },
        "conclusion": (
            f"D000 exposes {public_count} public SCN3 exports. The logical-door "
            f"dispatcher is generated target {door_index} in a separate "
            f"{len(generated_entries)}-entry table and is not a public export."
        ),
        "evidenceBoundary": (
            "Both table boundaries, targets, loaded addresses, and the "
            "public/non-public distinction are exact. The engine consumer "
            "that indirectly selects generated target 570 and supplies its "
            "resumed logical-door selector remains unresolved."
        ),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out} "
        f"({public_count} public exports; door generated target "
        f"{door_index}/{len(generated_entries)})"
    )


if __name__ == "__main__":
    main()
