#!/usr/bin/env python3
"""Recover D000's native spatial-interaction selector boundary.

The generated room routine at MAPINFO file offset 0x13ac calls SCN3 operation
0x0181 in mode zero. The native operation handler scans authored 24-byte
spatial records and returns a zero-based selected record. The generated room
code stores that result plus one in the indexed scene-context selector slots
beginning at 0x84. Hato's dialogue predicate later requires the first slot to
equal six. The same generic interaction coroutine subsequently writes -1 to
the indexed slot, and Hato's full control routine waits for that exact reset
before beginning its staged event.

This extractor verifies the room bytecode and captured executable together. It
does not assign story meanings to the spatial records or infer click targets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

from tools.worlds.extract_d000_door_dispatch_input_evidence import (
    OPERATION_TABLE,
    disassemble_ram,
    ram_u32,
)
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


RAM_BASE = 0x0C000000
OP_SPATIAL_SELECTOR = 0x0181
OP_SPATIAL_SELECTOR_HANDLER = 0x0C163B3C
SPATIAL_SCAN = 0x0C163CF8
RESULT_WRITER = 0x0C0BB342

INTERACTION_ROUTINE = 0x13AC
INTERACTION_LAUNCH_CALL = 0x767EA
INTERACTION_TARGET_RELATIVE_LITERAL = 0x76838
INTERACTION_TABLE_RELATIVE_LITERAL = 0x76830
INTERACTION_TABLE_RELATIVE = 0xD0FC
INTERACTION_WIDTH_TABLE_RELATIVE = 0xD2B0
INTERACTION_OPERATION_CALL = 0x148A
INTERACTION_RESULT_LOCAL = 76
SCENE_SELECTOR_SLOT = 0x84
SCENE_SELECTOR_WRITE = 0x16D8
SCENE_SELECTOR_RESET_WRITE = 0x29E8
SCENE_INTERACTION_STATE_SLOT = 0xB0
SCENE_INTERACTION_STATE_WRITE = 0x16E8
SCENE_INTERACTION_STATE_RESET_WRITE = 0x29D4
HATO_SELECTOR_READ = 0x7AC54
HATO_REQUIRED_SELECTOR = 6
HATO_SELECTOR_RESET_WAIT_READ = 0x80070
HATO_INTERACTION_STATE_OR_WRITE = 0x8015C
HATO_INTERACTION_STATE_WAIT_READ = 0x80164

SPATIAL_RECORD_SIZE = 24
WIDTH_OVERRIDE_RECORD_SIZE = 12
WIDTH_OVERRIDE_ENTRY_TYPE = 0
WIDTH_OVERRIDE_TERMINATOR_TYPE = 3
DEFAULT_HALF_WIDTH = 0.4
VERTICAL_HALF_EXTENT = 0.4
LONGITUDINAL_HALF_EXTENT = 0.6
CUSTOM_HALF_WIDTH_FLAG = 0x100
FULL_TURN_RAW = 0x10000
# The source table ends at a distinct configuration block beginning 0xaf72c.
# Captured interaction context +0x6c contains this count and +0x70 points to
# the byte-identical relocated table passed directly to operation 0x0181.
SERIALIZED_RECORD_COUNT = 18
ACTOR_AKIR = 0x52494B41
INTERACTION_FLAGS = 0x4000


def hx(value: int) -> str:
    return f"0x{value:x}"


def require_instruction(
    rows: dict[int, tuple[int, str, str, int | None]],
    address: int,
    mnemonic: str,
    operands: str,
) -> None:
    actual = rows.get(address)
    if actual is None or actual[1:3] != (mnemonic, operands):
        raise ValueError(
            f"Expected {address:#x}: {mnemonic} {operands}, found {actual}"
        )


def record(data: bytes, offset: int, index: int) -> dict[str, object]:
    raw = data[offset:offset + SPATIAL_RECORD_SIZE]
    if len(raw) != SPATIAL_RECORD_SIZE:
        raise ValueError("Spatial record extends beyond MAPINFO")
    x, y, z = struct.unpack_from("<3f", raw)
    required_facing, selector_flags, auxiliary_word = struct.unpack_from(
        "<3I", raw, 12
    )
    return {
        "index": index,
        "fileOffset": hx(offset),
        "position": [x, y, z],
        "requiredFacingRaw": required_facing,
        "requiredFacingDegrees": required_facing * 360 / FULL_TURN_RAW,
        "selectorFlags": selector_flags,
        "usesCustomHalfWidth": bool(
            selector_flags & CUSTOM_HALF_WIDTH_FLAG
        ),
        "auxiliaryWord": auxiliary_word,
        "packedFieldsHex": raw[12:].hex(),
        "rawHex": raw.hex(),
    }


def width_overrides(data: bytes, offset: int) -> tuple[list[dict[str, object]], int]:
    entries = []
    cursor = offset
    while True:
        entry_type, record_index, half_width = struct.unpack_from(
            "<IIf", data, cursor
        )
        if entry_type == WIDTH_OVERRIDE_TERMINATOR_TYPE:
            return entries, cursor
        if entry_type != WIDTH_OVERRIDE_ENTRY_TYPE:
            raise ValueError(
                f"Unknown D000 half-width entry type {entry_type} "
                f"at {cursor:#x}"
            )
        entries.append({
            "recordIndex": record_index,
            "lateralHalfWidth": half_width,
            "fileOffset": hx(cursor),
        })
        cursor += WIDTH_OVERRIDE_RECORD_SIZE


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("ram", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")

    data = args.mapinfo.read_bytes()
    ram = args.ram.read_bytes()
    scn3 = data.find(b"SCN3")
    if scn3 < 0:
        raise ValueError("MAPINFO has no SCN3 token")
    static_base = scn3 + struct.unpack_from("<I", data, scn3 + 0x10)[0]
    table_offset = static_base + INTERACTION_TABLE_RELATIVE
    width_table_offset = static_base + INTERACTION_WIDTH_TABLE_RELATIVE
    identity = data[scn3:scn3 + 0x40]
    loaded_offset = ram.find(identity)
    if loaded_offset < 0 or ram.find(identity, loaded_offset + 1) >= 0:
        raise ValueError("Captured D000 SCN3 module is absent or ambiguous")
    loaded_scn3 = RAM_BASE + loaded_offset
    loaded_table = loaded_scn3 + table_offset - scn3
    loaded_width_table = loaded_scn3 + width_table_offset - scn3

    map_rows = {
        row[0]: row for row in disassemble(args.mapinfo, args.objdump)
    }
    for expected in (
        (INTERACTION_ROUTINE, "mov.l", "r14,@-r13"),
        (0x145C, "mov", "#76,r4"),
        (0x145E, "add", "r14,r4"),
        (0x1468, "mov", "#112,r0"),
        (0x146A, "mov.l", "@(r0,r9),r7"),
        (0x146C, "mov.l", "r4,@-r13"),
        (0x146E, "mov", "#108,r0"),
        (0x1470, "mov.l", "@(r0,r9),r4"),
        (0x1482, "mov.l", "r6,@-r13"),
        (0x1484, "mov.l", "0x14b4,r5"),
        (INTERACTION_OPERATION_CALL, "jsr", "@r0"),
        (0x1490, "mov", "r0,r4"),
        (0x1492, "mov.l", "@r13+,r5"),
        (0x1494, "mov.l", "r4,@r5"),
        (0x16C2, "mov.l", "0x175c,r4"),
        (0x16D0, "mov", "#76,r0"),
        (0x16D2, "mov.l", "@(r0,r14),r5"),
        (0x16D4, "mov", "#1,r6"),
        (0x16D6, "add", "r6,r5"),
        (SCENE_SELECTOR_WRITE, "mov.l", "r5,@r4"),
        (0x16DC, "mov.l", "0x1760,r4"),
        (0x16DE, "add", "r9,r4"),
        (0x16E0, "mov", "#88,r0"),
        (0x16E2, "mov.l", "@(r0,r14),r5"),
        (0x16E4, "add", "r5,r4"),
        (0x16E6, "mov", "#3,r5"),
        (SCENE_INTERACTION_STATE_WRITE, "mov.b", "r5,@r4"),
        (0x29C8, "mov.l", "0x2a14,r4"),
        (0x29CA, "add", "r9,r4"),
        (0x29CC, "mov", "#88,r0"),
        (0x29CE, "mov.l", "@(r0,r14),r5"),
        (0x29D0, "add", "r5,r4"),
        (0x29D2, "mov", "#0,r5"),
        (SCENE_INTERACTION_STATE_RESET_WRITE, "mov.b", "r5,@r4"),
        (0x29D8, "mov.l", "0x2a18,r4"),
        (0x29DA, "add", "r9,r4"),
        (0x29DC, "mov", "#88,r0"),
        (0x29DE, "mov.l", "@(r0,r14),r5"),
        (0x29E0, "mov", "#2,r6"),
        (0x29E2, "shad", "r6,r5"),
        (0x29E4, "add", "r5,r4"),
        (0x29E6, "mov", "#-1,r5"),
        (SCENE_SELECTOR_RESET_WRITE, "mov.l", "r5,@r4"),
        (HATO_SELECTOR_READ, "mov.l", "@r4,r4"),
        (0x7AC58, "cmp/eq", "r5,r4"),
        (0x8006C, "mov.l", "0x80094,r4"),
        (0x8006E, "add", "r9,r4"),
        (HATO_SELECTOR_RESET_WAIT_READ, "mov.l", "@r4,r4"),
        (0x80072, "mov", "#-1,r5"),
        (0x80074, "cmp/eq", "r5,r4"),
        (0x8014E, "mov.l", "0x8018c,r4"),
        (0x80150, "add", "r9,r4"),
        (0x80156, "mov.b", "@r5,r5"),
        (0x80158, "mov", "#1,r6"),
        (0x8015A, "or", "r6,r5"),
        (HATO_INTERACTION_STATE_OR_WRITE, "mov.b", "r5,@r4"),
        (HATO_INTERACTION_STATE_WAIT_READ, "mov.b", "@r4,r4"),
        (0x80168, "cmp/eq", "#0,r0"),
    ):
        require_instruction(map_rows, *expected)

    if struct.unpack_from("<I", data, 0x14B4)[0] != OP_SPATIAL_SELECTOR:
        raise ValueError("D000 interaction call operation ID changed")
    if (
        struct.unpack_from(
            "<I", data, INTERACTION_TARGET_RELATIVE_LITERAL
        )[0]
        != INTERACTION_ROUTINE - scn3
    ):
        raise ValueError("D000 interaction coroutine target changed")
    if (
        struct.unpack_from(
            "<I", data, INTERACTION_TABLE_RELATIVE_LITERAL
        )[0]
        != INTERACTION_TABLE_RELATIVE
    ):
        raise ValueError("D000 interaction-table relative pointer changed")

    dispatch_calls = extract_dispatch_calls(
        list(map_rows.values()),
        static_base,
    )
    selector_call = next(
        (
            call for call in dispatch_calls
            if int(call["callFileOffset"], 16) == INTERACTION_OPERATION_CALL
        ),
        None,
    )
    if (
        selector_call is None
        or selector_call["operationId"] != OP_SPATIAL_SELECTOR
        or selector_call["argumentCount"] != 6
        or selector_call["arguments"][0].get("value") != 0
    ):
        raise ValueError("D000 operation 0x0181 mode-zero call changed")

    if (
        ram_u32(ram, OPERATION_TABLE + OP_SPATIAL_SELECTOR * 4)
        != OP_SPATIAL_SELECTOR_HANDLER
    ):
        raise ValueError("Captured operation 0x0181 handler changed")
    native_rows = {
        row[0]: row
        for row in disassemble_ram(
            args.ram,
            args.objdump,
            OP_SPATIAL_SELECTOR_HANDLER,
            0x0C163FD4,
        )
    }
    for expected in (
        (0x0C163B50, "mov.l", "@r13,r0"),
        (0x0C163B56, "cmp/eq", "#0,r0"),
        (0x0C163B80, "bsr", "0xc163cf8"),
        (0x0C163BAC, "mov.l", "0xc163ccc,r2"),
        (0x0C163BB2, "mov.l", "@r15+,r10"),
        (SPATIAL_SCAN, "mov.l", "r14,@-r15"),
        (0x0C163D16, "mov", "#-1,r10"),
        (0x0C163F14, "mov.w", "0xc163fba,r9"),
        (0x0C163F18, "cmp/hs", "r8,r3"),
        (0x0C163F4C, "mov.l", "@(16,r14),r3"),
        (0x0C163F4E, "tst", "r9,r3"),
        (0x0C163F56, "bsr", "0xc164198"),
        (0x0C163F66, "bsr", "0xc1641fc"),
        (0x0C163F70, "mov.l", "@(12,r14),r5"),
        (0x0C163F74, "bsr", "0xc16428a"),
        (0x0C163F86, "add", "#1,r13"),
        (0x0C163F88, "cmp/hs", "r8,r13"),
        (0x0C163F8C, "add", "#24,r14"),
        (0x0C163F8E, "mov", "r10,r0"),
        (0x0C163F90, "cmp/eq", "#-1,r0"),
        (0x0C163FA0, "mov", "r10,r0"),
    ):
        require_instruction(native_rows, *expected)
    if ram_u32(ram, 0x0C163CCC) != RESULT_WRITER:
        raise ValueError("Operation 0x0181 integer result writer changed")
    native_constants = {
        "defaultHalfWidth": struct.unpack_from(
            "<f", ram, 0x0C1641F8 - RAM_BASE
        )[0],
        "verticalHalfExtent": struct.unpack_from(
            "<f", ram, 0x0C163FC0 - RAM_BASE
        )[0],
        "longitudinalHalfExtent": struct.unpack_from(
            "<f", ram, 0x0C16442C - RAM_BASE
        )[0],
    }
    expected_constants = {
        "defaultHalfWidth": DEFAULT_HALF_WIDTH,
        "verticalHalfExtent": VERTICAL_HALF_EXTENT,
        "longitudinalHalfExtent": LONGITUDINAL_HALF_EXTENT,
    }
    for name, expected in expected_constants.items():
        if abs(native_constants[name] - expected) > 1e-6:
            raise ValueError(
                f"Operation 0x0181 {name} changed: "
                f"{native_constants[name]}"
            )

    serialized_records = [
        record(data, table_offset + index * SPATIAL_RECORD_SIZE, index)
        for index in range(SERIALIZED_RECORD_COUNT)
    ]
    serialized_width_overrides, width_terminator_offset = width_overrides(
        data, width_table_offset
    )
    width_by_record = {
        entry["recordIndex"]: entry["lateralHalfWidth"]
        for entry in serialized_width_overrides
    }
    for item in serialized_records:
        item["lateralHalfWidth"] = width_by_record.get(
            item["index"],
            native_constants["defaultHalfWidth"],
        )
    selected_index = HATO_REQUIRED_SELECTOR - 1
    table_pointer = struct.pack("<I", loaded_table)
    contexts = []
    cursor = 0
    while True:
        occurrence = ram.find(table_pointer, cursor)
        if occurrence < 0:
            break
        cursor = occurrence + 1
        context = occurrence - 0x70
        if context < 0 or context + 0x90 > len(ram):
            continue
        if (
            struct.unpack_from("<I", ram, context + 0x6C)[0]
            == SERIALIZED_RECORD_COUNT
            and struct.unpack_from("<I", ram, context + 0x70)[0]
            == loaded_table
            and struct.unpack_from("<I", ram, context + 0x74)[0]
            == loaded_width_table
            and struct.unpack_from("<I", ram, context + 0x80)[0]
            == ACTOR_AKIR
            and struct.unpack_from("<I", ram, context + 0x8C)[0]
            == INTERACTION_FLAGS
        ):
            contexts.append(context)
    if len(contexts) != 1:
        raise ValueError(
            "Captured D000 interaction context is absent or ambiguous: "
            f"{[hx(RAM_BASE + item) for item in contexts]}"
        )
    context = contexts[0]
    runtime_table_offset = loaded_table - RAM_BASE
    table_size = SERIALIZED_RECORD_COUNT * SPATIAL_RECORD_SIZE
    if (
        ram[runtime_table_offset:runtime_table_offset + table_size]
        != data[table_offset:table_offset + table_size]
    ):
        raise ValueError("Captured D000 spatial table differs from MAPINFO")
    runtime_width_table_offset = loaded_width_table - RAM_BASE
    width_table_size = (
        width_terminator_offset
        + WIDTH_OVERRIDE_RECORD_SIZE
        - width_table_offset
    )
    if (
        ram[
            runtime_width_table_offset:
            runtime_width_table_offset + width_table_size
        ]
        != data[
            width_table_offset:
            width_table_offset + width_table_size
        ]
    ):
        raise ValueError(
            "Captured D000 half-width table differs from MAPINFO"
        )

    report = {
        "schema": "new-yokosuka-d000-interaction-selector-evidence-v1",
        "status": "exact-native-spatial-selector-boundary",
        "source": {
            "mapinfo": str(args.mapinfo),
            "mapinfoSha256": hashlib.sha256(data).hexdigest(),
            "ram": str(args.ram),
            "ramSha256": hashlib.sha256(ram).hexdigest(),
        },
        "generatedInteractionCoroutine": {
            "fileOffset": hx(INTERACTION_ROUTINE),
            "launch": {
                "operationId": 0x0002,
                "callFileOffset": hx(INTERACTION_LAUNCH_CALL),
                "targetRelativeLiteralFileOffset": hx(
                    INTERACTION_TARGET_RELATIVE_LITERAL
                ),
            },
            "spatialSelectorCall": {
                "operationId": OP_SPATIAL_SELECTOR,
                "mode": 0,
                "callFileOffset": hx(INTERACTION_OPERATION_CALL),
                "argumentCount": selector_call["argumentCount"],
                "resultLocalFrameOffset": INTERACTION_RESULT_LOCAL,
            },
            "sceneSelectorWrite": {
                "fileOffset": hx(SCENE_SELECTOR_WRITE),
                "sceneContextRelativeOffset": hx(SCENE_SELECTOR_SLOT),
                "slotIndexLocalFrameOffset": 88,
                "value": "spatial selector result + 1",
            },
            "sceneSelectorReset": {
                "fileOffset": hx(SCENE_SELECTOR_RESET_WRITE),
                "sceneContextRelativeOffset": hx(SCENE_SELECTOR_SLOT),
                "slotIndexLocalFrameOffset": 88,
                "value": -1,
                "hatoControlWait": {
                    "functionFileOffset": "0x8002c",
                    "readFileOffset": hx(HATO_SELECTOR_RESET_WAIT_READ),
                    "slotIndex": 0,
                    "requiredValue": -1,
                },
                "exactBoundary": (
                    "The generic interaction coroutine owns this reset. "
                    "It is an interaction-selector lifecycle transition, "
                    "not a room-ready timer."
                ),
            },
            "interactionStateLifecycle": {
                "sceneContextRelativeOffset": hx(
                    SCENE_INTERACTION_STATE_SLOT
                ),
                "slotIndexLocalFrameOffset": 88,
                "selectedWrite": {
                    "fileOffset": hx(SCENE_INTERACTION_STATE_WRITE),
                    "value": 3,
                },
                "consumedReset": {
                    "fileOffset": hx(
                        SCENE_INTERACTION_STATE_RESET_WRITE
                    ),
                    "value": 0,
                },
                "hatoCleanupHandshake": {
                    "functionFileOffset": "0x8002c",
                    "orWriteFileOffset": hx(
                        HATO_INTERACTION_STATE_OR_WRITE
                    ),
                    "orMask": 1,
                    "waitReadFileOffset": hx(
                        HATO_INTERACTION_STATE_WAIT_READ
                    ),
                    "completionValue": 0,
                },
            },
        },
        "nativeOperation0181": {
            "handlerAddress": f"0x{OP_SPATIAL_SELECTOR_HANDLER:08x}",
            "mode0ScannerAddress": f"0x{SPATIAL_SCAN:08x}",
            "resultWriterAddress": f"0x{RESULT_WRITER:08x}",
            "notSelectedSentinel": -1,
            "recordStrideBytes": SPATIAL_RECORD_SIZE,
            "resultMeaning": "zero-based selected spatial-record index",
            "recordSchema": [
                {
                    "offset": "0x00",
                    "type": "float32[3]",
                    "meaning": "interaction position x/y/z",
                },
                {
                    "offset": "0x0c",
                    "type": "uint32",
                    "meaning": (
                        "required facing angle; 0x10000 raw units is one turn"
                    ),
                },
                {
                    "offset": "0x10",
                    "type": "uint32",
                    "meaning": (
                        "selector flags; bit 0x0100 enables a per-record "
                        "half-width lookup"
                    ),
                },
                {
                    "offset": "0x14",
                    "type": "uint32",
                    "meaning": (
                        "auxiliary word; not read by the mode-zero scanner"
                    ),
                },
            ],
            "selectionGeometry": {
                "verticalHalfExtent": native_constants[
                    "verticalHalfExtent"
                ],
                "defaultLateralHalfWidth": native_constants[
                    "defaultHalfWidth"
                ],
                "longitudinalHalfExtent": native_constants[
                    "longitudinalHalfExtent"
                ],
                "orientation": (
                    "the position delta is rotated by the live actor facing "
                    "before the lateral/depth bounds are tested"
                ),
                "customHalfWidthFlag": CUSTOM_HALF_WIDTH_FLAG,
                "customHalfWidthSource": (
                    "operation argument 4 points to a terminated 12-byte "
                    "override table keyed by zero-based record index"
                ),
                "facingToleranceArgument": INTERACTION_FLAGS,
                "facingToleranceDegrees": (
                    INTERACTION_FLAGS * 360 / FULL_TURN_RAW
                ),
                "facingRule": (
                    "circular raw-angle difference must be strictly less "
                    "than the tolerance"
                ),
            },
        },
        "serializedSpatialSource": {
            "staticBaseFileOffset": hx(static_base),
            "relativePointer": hx(INTERACTION_TABLE_RELATIVE),
            "tableFileOffset": hx(table_offset),
            "recordCount": SERIALIZED_RECORD_COUNT,
            "recordStrideBytes": SPATIAL_RECORD_SIZE,
            "records": serialized_records,
            "loadedAddress": f"0x{loaded_table:08x}",
            "capturedTableByteExact": True,
            "customHalfWidthOverrides": {
                "tableFileOffset": hx(width_table_offset),
                "loadedAddress": f"0x{loaded_width_table:08x}",
                "recordStrideBytes": WIDTH_OVERRIDE_RECORD_SIZE,
                "entryType": WIDTH_OVERRIDE_ENTRY_TYPE,
                "terminatorType": WIDTH_OVERRIDE_TERMINATOR_TYPE,
                "entries": serialized_width_overrides,
                "terminatorFileOffset": hx(width_terminator_offset),
                "capturedTableByteExact": True,
            },
            "runtimeContext": {
                "address": f"0x{RAM_BASE + context:08x}",
                "countRelativeOffset": "0x6c",
                "count": SERIALIZED_RECORD_COUNT,
                "tablePointerRelativeOffset": "0x70",
                "customHalfWidthTablePointerRelativeOffset": "0x74",
                "actorTagRelativeOffset": "0x80",
                "actorTag": "AKIR",
                "flagsRelativeOffset": "0x8c",
                "flags": INTERACTION_FLAGS,
            },
            "runtimeRelationship": (
                "context +0x6c count and +0x70 table pointer are passed "
                "directly to native operation 0x0181"
            ),
        },
        "hatoPredicateConnection": {
            "predicateReadFileOffset": hx(HATO_SELECTOR_READ),
            "requiredOneBasedSceneSelector": HATO_REQUIRED_SELECTOR,
            "requiredZeroBasedSpatialIndex": selected_index,
            "selectedSpatialRecord": serialized_records[selected_index],
            "semanticLimit": (
                "The native position, facing, and selection volume are exact. "
                "The authored record's higher-level story label and the "
                "semantics of fields unused by mode zero remain unresolved."
            ),
        },
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out} ({SERIALIZED_RECORD_COUNT} serialized records; "
        f"Hato runtime index {selected_index})"
    )


if __name__ == "__main__":
    main()
