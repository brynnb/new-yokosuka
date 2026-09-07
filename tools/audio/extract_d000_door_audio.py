#!/usr/bin/env python3
"""Recover D000 logical-door sound commands from native registration code.

D000's main door state machine reads three sound-command words from each
13-word logical record.  Those words are initialized at runtime by generated
registration calls, which means the immutable logical-record table contains
``0xffffffff`` placeholders.  This extractor follows the exact SH-4
registration descriptors instead of assigning sounds from model filenames.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import (
    UNKNOWN,
    Symbol,
    destination_register,
    disassemble,
)


REGISTRATION_REGION = (0x67900, 0x68AEE)
DOOR_STATE_MACHINE = (0x25098, 0x273E6)
DOOR_STATE_SOUND_CALLS = [
    {"callFileOffset": "0x269ce", "logicalRecordWord": 10},
    {"callFileOffset": "0x26d0e", "logicalRecordWord": 9},
    {"callFileOffset": "0x26e4a", "logicalRecordWord": 10},
    {"callFileOffset": "0x27296", "logicalRecordWord": 11},
]
DOOR_REGISTRATION_OPERATION = 5
NO_COMMAND = 0xFFFFFFFF


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hex32(value: int) -> str:
    return f"0x{value & 0xFFFFFFFF:08x}"


def command_hex_from_runtime_word(word: str) -> str | None:
    value = int(word, 16)
    if value == NO_COMMAND:
        return None
    return value.to_bytes(4, "little").hex()


def update_registers(
    registers: dict[str, Symbol],
    mnemonic: str,
    operands: str,
    literal: int | None,
) -> None:
    destination = destination_register(operands)
    if mnemonic == "mov" and operands.startswith("#") and destination:
        immediate = operands.split(",", 1)[0]
        registers[destination] = Symbol(
            "constant",
            int(immediate[1:], 0) & 0xFFFFFFFF,
        )
        return
    if mnemonic == "mov" and "," in operands and destination:
        source = operands.split(",", 1)[0]
        registers[destination] = registers.get(source, UNKNOWN)
        return
    if mnemonic == "mov.l" and destination:
        if literal is not None:
            registers[destination] = Symbol("constant", literal & 0xFFFFFFFF)
        else:
            registers[destination] = UNKNOWN
        return
    if destination and mnemonic not in {"cmp/eq", "cmp/ge", "cmp/gt", "cmp/hs"}:
        registers[destination] = UNKNOWN


def registration_descriptors(
    mapinfo: Path,
    objdump: str,
) -> list[dict[str, Any]]:
    instructions = disassemble(mapinfo, objdump)
    registers = {f"r{index}": UNKNOWN for index in range(16)}
    pushes: list[tuple[int, Symbol]] = []
    registrations = []

    for address, mnemonic, operands, literal in instructions:
        if address < REGISTRATION_REGION[0]:
            continue
        if address >= REGISTRATION_REGION[1]:
            break

        update_registers(registers, mnemonic, operands, literal)
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            source = operands.split(",", 1)[0]
            pushes.append((address, registers.get(source, UNKNOWN)))
            continue
        if mnemonic != "jsr" or operands != "@r0":
            continue
        operation = registers["r5"]
        if (
            operation.kind != "constant"
            or operation.value != DOOR_REGISTRATION_OPERATION
            or len(pushes) < 8
        ):
            continue
        raw = pushes[-8:]
        # The stack grows down, so the native descriptor begins with the most
        # recently pushed word.
        descriptor = list(reversed(raw))
        if any(symbol.kind != "constant" for _, symbol in descriptor):
            continue
        values = [symbol.value for _, symbol in descriptor]
        selector = values[0]
        sound_commands = values[4:7]
        if not (0 <= selector < 65):
            continue
        if not all(
            value == NO_COMMAND or (value & 0xFFFF) == 0x02AB
            for value in sound_commands
        ):
            continue
        if all(value == NO_COMMAND for value in sound_commands):
            continue
        registrations.append({
            "selector": selector,
            "callFileOffset": f"0x{address:x}",
            "descriptorPushOffsets": [
                f"0x{offset:x}" for offset, _ in descriptor
            ],
            "descriptorWords": [hex32(value) for value in values],
            "soundCommands": [hex32(value) for value in sound_commands],
        })
    return registrations


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument(
        "--source-name",
        default="SCENE/01/D000/MAPINFO.BIN",
        help="Stable provenance label stored instead of the local input path.",
    )
    parser.add_argument(
        "--door-logic",
        type=Path,
        default=Path("tools/evidence/d000-door-logic.json"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/d000-door-audio.json"),
    )
    parser.add_argument(
        "--runtime-out",
        type=Path,
        default=Path("play/data/native-d000-door-audio.json"),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")

    mapinfo = args.mapinfo.read_bytes()
    door_logic = json.loads(args.door_logic.read_text())
    registrations = registration_descriptors(args.mapinfo, args.objdump)
    by_selector: dict[int, list[dict[str, Any]]] = {}
    for registration in registrations:
        by_selector.setdefault(registration["selector"], []).append(registration)

    duplicate_conflicts = []
    doors = []
    for door in door_logic["doors"]:
        selector = door["selector"]
        records = by_selector.get(selector, [])
        unique_commands = {
            tuple(record["soundCommands"]) for record in records
        }
        if len(unique_commands) > 1:
            duplicate_conflicts.append({
                "selector": selector,
                "commandSets": [list(item) for item in sorted(unique_commands)],
            })
        commands = list(next(iter(unique_commands))) if unique_commands else [
            hex32(NO_COMMAND),
            hex32(NO_COMMAND),
            hex32(NO_COMMAND),
        ]
        captured = door.get("runtime", {}).get("recordWords", [])[9:12]
        if captured and any(value != hex32(NO_COMMAND) for value in captured):
            if commands != captured:
                raise ValueError(
                    f"Selector {selector} static commands {commands} "
                    f"do not match captured runtime commands {captured}"
                )
        doors.append({
            "selector": selector,
            "model": door["model"],
            "objectTag": door.get("runtime", {}).get("objectTag"),
            "soundCommands": commands,
            "registrationCalls": [
                record["callFileOffset"] for record in records
            ],
            "runtimeCaptureAgreement": bool(
                records and captured and commands == captured
            ),
        })

    missing = [door["selector"] for door in doors if not door["registrationCalls"]]
    if duplicate_conflicts:
        raise ValueError(
            f"Conflicting door registration commands: {duplicate_conflicts}"
        )
    output = {
        "schema": "new-yokosuka-d000-door-audio-v1",
        "generatedBy": "tools/audio/extract_d000_door_audio.py",
        "source": {
            "mapinfo": args.source_name,
            "mapinfoSha256": sha256(mapinfo),
            "doorLogic": str(args.door_logic),
            "doorLogicSha256": sha256(args.door_logic.read_bytes()),
            "registrationRegion": [
                f"0x{value:x}" for value in REGISTRATION_REGION
            ],
            "doorStateMachineRegion": [
                f"0x{value:x}" for value in DOOR_STATE_MACHINE
            ],
            "doorStateSoundCalls": DOOR_STATE_SOUND_CALLS,
        },
        "method": [
            "Generated registration operation 5 receives an eight-word "
            "descriptor whose first word is the logical-door selector.",
            "Descriptor words 4..6 are copied into logical-record words "
            "9..11 and later passed unchanged to engine operation 0x006c.",
            "The downward-growing SH-4 stack is reversed into native "
            "descriptor order before interpreting fields.",
            "Captured runtime record words are used only as an independent "
            "agreement check, never as a fallback mapping.",
        ],
        "summary": {
            "logicalDoorCount": len(doors),
            "registrationCount": len(registrations),
            "selectorCount": len(by_selector),
            "runtimeCaptureAgreementCount": sum(
                door["runtimeCaptureAgreement"] for door in doors
            ),
            "registeredDoorCount": len(doors) - len(missing),
            "notRegisteredInMainStateMachineSelectors": missing,
            "commandSets": sorted({
                tuple(door["soundCommands"]) for door in doors
                if door["registrationCalls"]
            }),
        },
        "registrations": registrations,
        "doors": doors,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(output, indent=2) + "\n")
    runtime_output = {
        "schema": "new-yokosuka-native-d000-door-audio-v1",
        "generatedBy": "tools/audio/extract_d000_door_audio.py",
        "evidence": str(args.out),
        "selectors": {
            str(door["selector"]): {
                "commands": [
                    command_hex_from_runtime_word(command)
                    for command in door["soundCommands"]
                ],
                "openingCommand": command_hex_from_runtime_word(
                    door["soundCommands"][0]
                ),
            }
            for door in doors
            if door["registrationCalls"]
        },
    }
    args.runtime_out.parent.mkdir(parents=True, exist_ok=True)
    args.runtime_out.write_text(
        json.dumps(runtime_output, indent=2) + "\n"
    )
    print(
        f"Wrote {len(doors)} door mappings from {len(registrations)} "
        f"registrations to {args.out} and {args.runtime_out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
