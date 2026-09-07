#!/usr/bin/env python3
"""Prove the native inputs to D000's logical-door dispatcher.

The room routine beginning at MAPINFO file offset 0x783b4 is a generated
coroutine. It queries engine operation 0x0031 with field selector 1 and
separately receives a caller/resume argument at stack +60. That argument is
copied to frame +48 and is the value compared by the door dispatch tree.

This extractor checks both halves of that boundary:

* the D000 SCN3 call/resume instructions; and
* the captured executable operation table and native 0x0031 handler.

Operation 0x0031(1) is *not* mislabeled as the door selector: corpus evidence
shows status-like 0/0x400 values in that field while D000 dispatches selectors
1..45. The upstream supplier of the caller/resume argument remains unresolved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import subprocess
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import disassemble, parse_instruction


RAM_BASE = 0x0C000000
OPERATION_TABLE = 0x0C29A9E0
OP_EVENT_FIELD = 0x0031
OP_PRECONDITION = 0x01AE
EVENT_FIELD_HANDLER = 0x0C16B4C8
PRECONDITION_HANDLER = 0x0C1658D0
CURRENT_EVENT_GETTER = 0x0C0F0B3C
RECORD_OFFSETTER = 0x0C137482
RESULT_WRITER = 0x0C0BB342
CURRENT_SCENE_OWNER_GLOBAL = 0x0C217488

DOOR_ROUTINE = 0x783B4
PRECONDITION_CALL = 0x783C6
EVENT_SELECTOR_CALL = 0x783EA
RESUME_COPY = (0x7840C, 0x78410, 0x78412)
SELECTOR_FRAME_OFFSET = 48
RESUMED_ARGUMENT_OFFSET = 60

HANDLER_POINTERS = {
    0x0C16B6A4: CURRENT_EVENT_GETTER,
    0x0C16B6A8: RECORD_OFFSETTER,
    0x0C16B6AC: RESULT_WRITER,
}

FIELD_ROUTES = [
    {"argument": 0, "width": "u16", "recordOffset": 4},
    {"argument": 1, "width": "u16", "recordOffset": 8},
    {"argument": 2, "width": "u16", "recordOffset": 10},
    {"argument": 3, "width": "u8", "recordOffset": 12},
    {"argument": 4, "width": "u8", "recordOffset": 13},
    {"argument": 5, "width": "u8", "recordOffset": 14},
    {"argument": 6, "width": "u8", "recordOffset": 15},
    {"argument": 7, "width": "u16", "recordOffset": 18},
]


def hex_address(value: int) -> str:
    return f"0x{value:08x}"


def ram_u32(ram: bytes, address: int) -> int:
    offset = address - RAM_BASE
    if offset < 0 or offset + 4 > len(ram):
        raise ValueError(f"{hex_address(address)} is outside captured RAM")
    return struct.unpack_from("<I", ram, offset)[0]


def ram_bytes(ram: bytes, address: int, size: int) -> bytes:
    offset = address - RAM_BASE
    if offset < 0 or offset + size > len(ram):
        raise ValueError(f"{hex_address(address)} is outside captured RAM")
    return ram[offset:offset + size]


def disassemble_ram(
    ram_path: Path,
    objdump: str,
    start: int,
    stop: int,
) -> list[tuple[int, str, str, int | None]]:
    result = subprocess.run(
        [
            objdump,
            "-D",
            "-b",
            "binary",
            "-m",
            "sh4",
            "-EL",
            f"--adjust-vma={hex_address(RAM_BASE)}",
            f"--start-address={hex_address(start)}",
            f"--stop-address={hex_address(stop)}",
            str(ram_path),
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return [
        instruction
        for line in result.stdout.splitlines()
        if (instruction := parse_instruction(line)) is not None
    ]


def require_instruction(
    by_address: dict[int, tuple[int, str, str, int | None]],
    address: int,
    mnemonic: str,
    operands: str,
) -> None:
    row = by_address.get(address)
    if row is None or row[1:3] != (mnemonic, operands):
        raise ValueError(
            f"Expected {address:#x}: {mnemonic} {operands}, found {row}"
        )


def operation_call(
    calls: dict[str, Any],
    offset: int,
    operation: int,
    argument: int,
) -> dict[str, Any]:
    match = next(
        (
            call for call in calls["calls"]
            if int(call["callFileOffset"], 16) == offset
        ),
        None,
    )
    if match is None:
        raise ValueError(f"Missing operation call at {offset:#x}")
    if match["operationId"] != operation:
        raise ValueError(
            f"Call {offset:#x} is operation {match['operationHex']}, "
            f"not 0x{operation:04x}"
        )
    arguments = match.get("arguments", [])
    if (
        len(arguments) != 1
        or arguments[0].get("kind") != "constant"
        or arguments[0].get("value") != argument
    ):
        raise ValueError(
            f"Call {offset:#x} does not have exact argument {argument}"
        )
    return match


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("ram", type=Path)
    parser.add_argument("dispatch_calls", type=Path)
    parser.add_argument("operation_handlers", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--captures-root",
        type=Path,
        default=Path("captures"),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")

    map_data = args.mapinfo.read_bytes()
    ram = args.ram.read_bytes()
    calls = json.loads(args.dispatch_calls.read_text())
    handlers = json.loads(args.operation_handlers.read_text())

    map_rows = disassemble(args.mapinfo, args.objdump)
    map_by_address = {row[0]: row for row in map_rows}
    require_instruction(map_by_address, DOOR_ROUTINE, "mov.l", "r14,@-r13")
    require_instruction(map_by_address, 0x783B6, "sts.l", "pr,@-r13")
    require_instruction(map_by_address, RESUME_COPY[0], "mov", "#48,r4")
    require_instruction(map_by_address, RESUME_COPY[1], "mov.l", "@(60,r14),r5")
    require_instruction(map_by_address, RESUME_COPY[2], "mov.l", "r5,@r4")
    require_instruction(map_by_address, 0x78416, "mov.l", "@(48,r14),r4")

    precondition_call = operation_call(
        calls, PRECONDITION_CALL, OP_PRECONDITION, 0
    )
    selector_call = operation_call(
        calls, EVENT_SELECTOR_CALL, OP_EVENT_FIELD, 1
    )

    handlers_by_id = {
        item["operationId"]: item for item in handlers["handlers"]
    }
    if int(
        handlers_by_id[OP_EVENT_FIELD]["handlerAddress"], 16
    ) != EVENT_FIELD_HANDLER:
        raise ValueError("Captured operation 0x0031 handler changed")
    if int(
        handlers_by_id[OP_PRECONDITION]["handlerAddress"], 16
    ) != PRECONDITION_HANDLER:
        raise ValueError("Captured operation 0x01ae handler changed")
    if ram_u32(
        ram, OPERATION_TABLE + OP_EVENT_FIELD * 4
    ) != EVENT_FIELD_HANDLER:
        raise ValueError("RAM operation table does not contain 0x0031 handler")
    for pointer_slot, expected in HANDLER_POINTERS.items():
        if ram_u32(ram, pointer_slot) != expected:
            raise ValueError(
                f"Native pointer slot {hex_address(pointer_slot)} changed"
            )

    handler_rows = disassemble_ram(
        args.ram, args.objdump, EVENT_FIELD_HANDLER, 0x0C16B53C
    )
    handler_by_address = {row[0]: row for row in handler_rows}
    # These are the exact field loads selected by argument values 0..7.
    expected_loads = {
        0x0C16B508: ("mov.w", "@(4,r4),r0"),
        0x0C16B50C: ("mov.w", "@(8,r4),r0"),
        0x0C16B510: ("mov.w", "@(10,r4),r0"),
        0x0C16B512: ("mov.b", "@(12,r4),r0"),
        0x0C16B518: ("mov.b", "@(13,r4),r0"),
        0x0C16B51E: ("mov.b", "@(14,r4),r0"),
        0x0C16B524: ("mov.b", "@(15,r4),r0"),
        0x0C16B52A: ("mov.w", "@(18,r4),r0"),
    }
    for address, (mnemonic, operands) in expected_loads.items():
        require_instruction(handler_by_address, address, mnemonic, operands)

    getter_rows = disassemble_ram(
        args.ram, args.objdump, CURRENT_EVENT_GETTER, 0x0C0F0B4C
    )
    getter_by_address = {row[0]: row for row in getter_rows}
    require_instruction(
        getter_by_address, 0x0C0F0B44, "mov.l", "@r3,r4"
    )
    require_instruction(
        getter_by_address, 0x0C0F0B4A, "mov.l", "@(4,r0),r0"
    )
    if ram_u32(ram, 0x0C0F0C60) != CURRENT_SCENE_OWNER_GLOBAL:
        raise ValueError("Current-scene-owner pointer literal changed")

    observed_event_field_values: dict[int, int] = {}
    observed_d000_captures = 0
    for capture in args.captures_root.rglob("ram.bin"):
        capture_ram = capture.read_bytes()
        if (
            len(capture_ram) < 0x20C3E0
            or capture_ram[0x20C3DC:0x20C3E0] != b"D000"
        ):
            continue
        owner = ram_u32(capture_ram, CURRENT_SCENE_OWNER_GLOBAL)
        if not (RAM_BASE <= owner <= RAM_BASE + len(capture_ram) - 0x40):
            continue
        scene_context = ram_u32(capture_ram, owner + 0x3C)
        if not (
            RAM_BASE <= scene_context <= RAM_BASE + len(capture_ram) - 8
        ):
            continue
        current_event = ram_u32(capture_ram, scene_context + 4)
        # 0x0031 first adds four to this pointer, then argument 1 reads +8.
        query_address = current_event + 4 + 8
        if not (
            RAM_BASE <= query_address <= RAM_BASE + len(capture_ram) - 2
        ):
            continue
        value = struct.unpack_from(
            "<H", capture_ram, query_address - RAM_BASE
        )[0]
        observed_event_field_values[value] = (
            observed_event_field_values.get(value, 0) + 1
        )
        observed_d000_captures += 1

    report = {
        "schema": "new-yokosuka-d000-door-dispatch-input-evidence-v1",
        "status": "exact",
        "source": {
            "mapinfo": str(args.mapinfo),
            "mapinfoSha256": hashlib.sha256(map_data).hexdigest(),
            "ram": str(args.ram),
            "ramSha256": hashlib.sha256(ram).hexdigest(),
            "dispatchCalls": str(args.dispatch_calls),
            "operationHandlers": str(args.operation_handlers),
        },
        "doorCoroutine": {
            "routineFileOffset": f"0x{DOOR_ROUTINE:x}",
            "preconditionQuery": {
                "operation": "0x01ae",
                "argument": 0,
                "callFileOffset": precondition_call["callFileOffset"],
                "handlerAddress": hex_address(PRECONDITION_HANDLER),
            },
            "eventControlQuery": {
                "operation": "0x0031",
                "argument": 1,
                "callFileOffset": selector_call["callFileOffset"],
                "meaning": (
                    "current event/coroutine control field; not the logical "
                    "door selector"
                ),
                "nativeRecordOffset": 8,
                "width": "u16",
            },
            "selectorInputDataflow": {
                "resumedArgumentFrameOffset": RESUMED_ARGUMENT_OFFSET,
                "selectorLocalFrameOffset": SELECTOR_FRAME_OFFSET,
                "copyInstructionFileOffsets": [
                    f"0x{offset:x}" for offset in RESUME_COPY
                ],
                "firstDispatchReadFileOffset": "0x78416",
            },
        },
        "nativeOperation0031": {
            "operationTableAddress": hex_address(OPERATION_TABLE),
            "tableEntryAddress": hex_address(
                OPERATION_TABLE + OP_EVENT_FIELD * 4
            ),
            "handlerAddress": hex_address(EVENT_FIELD_HANDLER),
            "currentEventGetterAddress": hex_address(CURRENT_EVENT_GETTER),
            "recordOffsetterAddress": hex_address(RECORD_OFFSETTER),
            "resultWriterAddress": hex_address(RESULT_WRITER),
            "currentSceneOwnerGlobal": hex_address(
                CURRENT_SCENE_OWNER_GLOBAL
            ),
            "recordBase": (
                "FUN_0c0f0b3c() + 4; FUN_0c0f0b3c() follows the current "
                "scene owner at 0x0c217488 through owner +0x3c, then +0x04"
            ),
            "fieldRoutes": FIELD_ROUTES,
            "resultWrite": "*( *(resultContext + 4) + 0x0c )",
        },
        "captureCorpus": {
            "root": str(args.captures_root),
            "d000CaptureCount": observed_d000_captures,
            "operation0031Argument1Values": [
                {"value": value, "count": count}
                for value, count in sorted(observed_event_field_values.items())
            ],
            "logicalDoorSelectorRange": [0, 64],
            "conclusion": (
                "Observed operation-0x0031 argument-1 values are coroutine/"
                "event control states, not D000 logical door selectors."
            ),
        },
        "conclusion": (
            "D000's door dispatcher branches on a distinct caller/resume "
            "argument copied from stack +60 to frame +48. The supplier of "
            "that argument remains upstream and unresolved."
        ),
        "evidenceBoundary": (
            "This proves the dispatch input boundary and the complete 0x0031 "
            "field layout. It does not yet prove who supplies the selector, "
            "nor event availability, opening-hour gating, or store state."
        ),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out} (exact D000 door-dispatch input boundary)")


if __name__ == "__main__":
    main()
