#!/usr/bin/env python3
"""Extract direct object-node transform calls from a Dreamcast MAPINFO.BIN.

Shenmue's Dreamcast SCN3 payload contains native SH-4 routines.  The engine
operation at dispatch ID 0x00c9 consumes a five-word descriptor:

    object tag, node key, position-vector pointer, rotation-vector pointer,
    mode

This scanner recognizes the compiler's direct-call pattern and resolves
literal tags plus vectors stored in SCN3's static-data section.  Calls whose
tag or arguments are supplied through runtime locals are retained as
unresolved values instead of being guessed.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


OP_HMDL_TRANSFORM = 0x00C9
MODE_NAMES = {
    0: "set",
    1: "add",
    2: "read",
    3: "set-scale",
}


@dataclass(frozen=True)
class Symbol:
    kind: str
    value: int | None = None
    detail: str | None = None


UNKNOWN = Symbol("unknown")
STATIC_BASE = Symbol("static-base")


def signed_byte(value: int) -> int:
    return value - 0x100 if value >= 0x80 else value


def printable_tag(value: int) -> str | None:
    raw = struct.pack("<I", value & 0xFFFFFFFF)
    if all(0x20 <= byte < 0x7F for byte in raw):
        return raw.decode("ascii")
    return None


def parse_instruction(line: str) -> tuple[int, str, str, int | None] | None:
    # objdump emits:
    # "  5a9a2:\t19 d5       \tmov.l  0x5aa08,r5 ! c9"
    try:
        address_text, remainder = line.strip().split(":", 1)
        address = int(address_text, 16)
    except ValueError:
        return None

    fields = remainder.split("\t")
    if len(fields) < 3:
        return None
    assembly = " ".join(field.strip() for field in fields[2:] if field.strip())
    if not assembly or assembly.startswith(".word"):
        return None
    assembly, _, comment = assembly.partition("!")
    pieces = assembly.strip().split(None, 1)
    if not pieces:
        return None
    mnemonic = pieces[0]
    operands = pieces[1].replace(" ", "") if len(pieces) > 1 else ""
    literal = None
    comment = comment.strip()
    if comment:
        try:
            literal = int(comment, 16)
        except ValueError:
            pass
    return address, mnemonic, operands, literal


def destination_register(operands: str) -> str | None:
    if "," not in operands:
        return None
    destination = operands.rsplit(",", 1)[1]
    if destination.startswith("r") and destination[1:].isdigit():
        return destination
    return None


def read_vector(data: bytes, offset: int, representation: str) -> dict[str, Any] | None:
    if offset < 0 or offset + 12 > len(data):
        return None
    raw = struct.unpack_from("<3I", data, offset)
    result: dict[str, Any] = {
        "fileOffset": f"0x{offset:x}",
        "rawHex": [f"0x{value:08x}" for value in raw],
    }
    if representation == "float":
        result["initialValues"] = [
            value if math.isfinite(value) else None
            for value in struct.unpack_from("<3f", data, offset)
        ]
    else:
        result["initialValues"] = list(struct.unpack_from("<3i", data, offset))
        result["degrees"] = [
            value * 360.0 / 65536.0
            for value in struct.unpack_from("<3i", data, offset)
        ]
    return result


def symbol_json(symbol: Symbol) -> dict[str, Any] | int | None:
    if symbol.kind == "constant":
        return symbol.value
    if symbol.kind == "static-pointer":
        return {"staticOffset": f"0x{symbol.value:x}"}
    if symbol.kind == "memory":
        return {"source": symbol.detail}
    return None


def disassemble(path: Path, objdump: str) -> list[tuple[int, str, str, int | None]]:
    command = [
        objdump,
        "-D",
        "-b",
        "binary",
        "-m",
        "sh4",
        "-EL",
        str(path),
    ]
    result = subprocess.run(
        command,
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


def extract_calls(
    data: bytes,
    instructions: list[tuple[int, str, str, int | None]],
    static_data_base: int,
) -> list[dict[str, Any]]:
    registers = {f"r{index}": UNKNOWN for index in range(16)}
    pushes: list[tuple[int, Symbol]] = []
    calls: list[dict[str, Any]] = []
    pending_operation: tuple[int, int] | None = None

    for address, mnemonic, operands, literal in instructions:
        if mnemonic == "mov" and operands.startswith("#"):
            immediate, register = operands.split(",", 1)
            registers[register] = Symbol("constant", int(immediate[1:], 0))
        elif mnemonic == "mov" and "," in operands:
            source, register = operands.split(",", 1)
            if source in registers and register in registers:
                registers[register] = registers[source]
            elif register in registers:
                registers[register] = UNKNOWN
        elif mnemonic == "mov.l":
            if operands.endswith(",@-r13"):
                source = operands.split(",", 1)[0]
                pushes.append((address, registers.get(source, UNKNOWN)))
            else:
                destination = destination_register(operands)
                if destination:
                    if literal is not None:
                        registers[destination] = Symbol("constant", literal)
                    elif operands.startswith("@(4,r8),"):
                        registers[destination] = STATIC_BASE
                    else:
                        source = operands.rsplit(",", 1)[0]
                        registers[destination] = Symbol("memory", detail=source)
        elif mnemonic == "add" and "," in operands:
            source, destination = operands.split(",", 1)
            left = registers.get(source, UNKNOWN)
            right = registers.get(destination, UNKNOWN)
            if right.kind == "static-base" and left.kind == "constant":
                registers[destination] = Symbol("static-pointer", left.value)
            elif left.kind == "static-base" and right.kind == "constant":
                registers[destination] = Symbol("static-pointer", right.value)
            elif left.kind == "constant" and right.kind == "constant":
                registers[destination] = Symbol(
                    "constant",
                    (left.value + right.value) & 0xFFFFFFFF,
                )
            elif destination in registers:
                registers[destination] = UNKNOWN
        else:
            destination = destination_register(operands)
            if destination and mnemonic not in {"cmp/eq", "cmp/gt", "cmp/hs"}:
                registers[destination] = UNKNOWN

        if (
            mnemonic == "mov.l"
            and destination_register(operands) == "r5"
            and literal == OP_HMDL_TRANSFORM
        ):
            pending_operation = (address, len(pushes))
            continue

        if mnemonic != "jsr" or operands != "@r0" or pending_operation is None:
            continue

        operation_address, push_count = pending_operation
        pending_operation = None
        descriptor_pushes = pushes[max(0, push_count - 5):push_count]
        if len(descriptor_pushes) != 5:
            continue
        # Source order is mode, rotation pointer, position pointer, node, tag.
        # The downward-growing stack reverses that into descriptor order.
        mode, rotation, position, node, object_tag = [
            symbol for _, symbol in descriptor_pushes
        ]
        if object_tag.kind == "constant":
            tag = printable_tag(object_tag.value)
        else:
            tag = None

        call: dict[str, Any] = {
            "callFileOffset": f"0x{address:x}",
            "operationLoadFileOffset": f"0x{operation_address:x}",
            "operationId": f"0x{OP_HMDL_TRANSFORM:04x}",
            "objectTag": tag,
            "object": symbol_json(object_tag),
            "node": symbol_json(node),
            "mode": symbol_json(mode),
            "modeName": (
                MODE_NAMES.get(mode.value)
                if mode.kind == "constant"
                else None
            ),
            "position": symbol_json(position),
            "rotation": symbol_json(rotation),
        }
        if position.kind == "static-pointer":
            call["positionVector"] = read_vector(
                data,
                static_data_base + position.value,
                "float",
            )
        if rotation.kind == "static-pointer":
            call["rotationVector"] = read_vector(
                data,
                static_data_base + rotation.value,
                "fixed",
            )
        calls.append(call)

    return calls


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Extract direct SH-4 object transforms from MAPINFO.BIN.",
    )
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--object", help="Only emit this four-character object tag.")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
        help="SH-4 GNU objdump executable.",
    )
    args = parser.parse_args()

    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    data = args.mapinfo.read_bytes()
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x18 > len(data):
        parser.error("input does not contain a complete SCN3 token")
    token_size = struct.unpack_from("<I", data, scn3_offset + 4)[0]
    if token_size < 0x30 or scn3_offset + token_size > len(data):
        parser.error("SCN3 token size lies outside the input")
    # SCN3's internal offsets are relative to the token signature, not to the
    # MAPINFO file. This distinction is invisible for early tokens such as
    # JOMO (offset 0x8) but is material for D000 (offset 0x1338).
    static_data_relative = struct.unpack_from("<I", data, scn3_offset + 0x10)[0]
    static_data_base = scn3_offset + static_data_relative
    if static_data_base >= len(data):
        parser.error("SCN3 static-data offset lies outside the input")

    calls = extract_calls(
        data,
        disassemble(args.mapinfo, args.objdump),
        static_data_base,
    )
    if args.object:
        calls = [call for call in calls if call["objectTag"] == args.object]

    result = {
        "source": str(args.mapinfo),
        "scn3FileOffset": f"0x{scn3_offset:x}",
        "staticDataFileOffset": f"0x{static_data_base:x}",
        "operationId": f"0x{OP_HMDL_TRANSFORM:04x}",
        "callCount": len(calls),
        "calls": calls,
    }
    if args.json:
        json.dump(result, sys.stdout, indent=2, allow_nan=False)
        print()
    else:
        print(
            f"{args.mapinfo}: {len(calls)} direct 0x{OP_HMDL_TRANSFORM:04x} "
            f"transform calls"
        )
        for call in calls:
            print(
                call["callFileOffset"],
                (call["objectTag"] or "<runtime>").ljust(9),
                f"node={call['node']!s:<5}",
                f"mode={call['modeName'] or call['mode']}",
                f"pos={call.get('positionVector') or call['position']}",
                f"rot={call.get('rotationVector') or call['rotation']}",
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
