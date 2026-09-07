#!/usr/bin/env python3
"""Recover native EVNT callback tables and their transition routes.

Every extracted MAPINFO is scanned for native operation ``0x0001``. Its exact
static pointer and callback count identify the table without treating arbitrary
pointer-like static data as event callbacks. The only registrations in the
three retail scene roots are D000, JD00, and JU00 on each disc.

Literal calls to each map's local transition helper are decoded as
``mode, entry, area, scene``.  The helper reorders its last three arguments
before invoking operation ``0x0030(scene, area, entry)``. Conditional callbacks
retain every literal
route found in the function; this tool does not guess which branch is active.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
import sys
from pathlib import Path
from typing import Any


from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble


DEFAULT_ROOTS = (
    Path(".disc-work/mapinfo/disc1/SCENE/01"),
    Path(".disc-work/mapinfo/disc2/SCENE/02"),
    Path("extracted_disc3_v2/data/SCENE/03"),
)
PROLOGUE = bytes.fromhex("e62d224d")
EMPTY_FUNCTION = bytes.fromhex(
    "e62d224d007dd36e007d264d0b00d66e"
)


def hex_offset(value: int) -> str:
    return f"0x{value:x}"


def infer_disc(path: Path) -> int:
    for index, part in enumerate(path.parts):
        if part == "SCENE" and index + 1 < len(path.parts):
            return int(path.parts[index + 1])
        if part.startswith("disc") and part[4:].isdigit():
            return int(part[4:])
    raise ValueError(f"cannot infer disc from {path}")


def signed_u32(value: int) -> int:
    return value - 0x1_0000_0000 if value >= 0x8000_0000 else value


def branch_target(address: int, literal: int) -> int:
    return (address + 4 + signed_u32(literal)) & 0xFFFF_FFFF


def register_value(
    instruction: tuple[int, str, str, int | None],
    register: str,
) -> int | None:
    _address, mnemonic, operands, literal = instruction
    suffix = f",{register}"
    if not operands.endswith(suffix):
        return None
    if mnemonic == "mov" and operands.startswith("#"):
        try:
            return int(operands[1 : -len(suffix)], 0)
        except ValueError:
            return None
    if mnemonic == "mov.l":
        return literal
    return None


def area_word(value: int | None) -> str | None:
    if value is None:
        return None
    raw = struct.pack("<I", value & 0xFFFF_FFFF)
    if not all(0x30 <= byte <= 0x5A for byte in raw):
        return None
    try:
        area = raw.decode("ascii")
    except UnicodeDecodeError:
        return None
    return area if re.fullmatch(r"[A-Z0-9]{4}", area) else None


def function_starts(data: bytes, code_start: int, code_end: int) -> list[int]:
    return [
        offset
        for offset in range(code_start, code_end - 4, 2)
        if data[offset : offset + 4] == PROLOGUE
    ]


def function_end(start: int, starts: list[int], code_end: int) -> int:
    for candidate in starts:
        if candidate > start:
            return candidate
    return code_end


def contains_akir(data: bytes, start: int, end: int) -> bool:
    return b"AKIR" in data[start:end]


def pointer_table(
    data: bytes,
    scn3: int,
    static_start: int,
    code_start: int,
    code_end: int,
    count: int,
    predicate,
) -> tuple[int, list[int]]:
    matches: list[tuple[int, list[int]]] = []
    for offset in range(static_start, len(data) - count * 4 + 1, 4):
        raw = struct.unpack_from(f"<{count}I", data, offset)
        targets = [scn3 + value for value in raw]
        if not all(code_start <= target < code_end for target in targets):
            continue
        if predicate(targets):
            matches.append((offset, targets))
    if len(matches) != 1:
        raise ValueError(
            f"expected one {count}-entry EVNT callback table, "
            f"found {len(matches)}"
        )
    return matches[0]


def transition_helper_calls(
    instructions: list[tuple[int, str, str, int | None]],
    start: int,
    end: int,
) -> list[dict[str, Any]]:
    rows = [row for row in instructions if start <= row[0] < end]
    routes = []
    for index in range(len(rows) - 9):
        block = rows[index : index + 10]
        mode = register_value(block[0], "r4")
        entry = register_value(block[1], "r5")
        area = area_word(register_value(block[2], "r6"))
        scene = register_value(block[3], "r7")
        if None in (mode, scene, area, entry):
            continue
        if [
            (item[1], item[2])
            for item in block[4:8]
        ] != [
            ("mov.l", "r4,@-r13"),
            ("mov.l", "r5,@-r13"),
            ("mov.l", "r6,@-r13"),
            ("mov.l", "r7,@-r13"),
        ]:
            continue
        literal_load, call = block[8], block[9]
        if (
            literal_load[1] != "mov.l"
            or not literal_load[2].endswith(",r1")
            or literal_load[3] is None
            or call[1] != "bsrf"
        ):
            continue
        routes.append(
            {
                "callFileOffset": hex_offset(call[0]),
                "helperFileOffset": hex_offset(
                    branch_target(call[0], literal_load[3])
                ),
                "mode": mode,
                "destination": {
                    "scene": scene,
                    "area": area,
                    "entry": entry,
                },
            }
        )
    return routes


def selector_write(
    instructions: list[tuple[int, str, str, int | None]],
    start: int,
    end: int,
) -> dict[str, Any] | None:
    rows = [row for row in instructions if start <= row[0] < end]
    for index in range(len(rows) - 3):
        pointer = register_value(rows[index], "r4")
        value = register_value(rows[index + 2], "r5")
        if (
            pointer is not None
            and rows[index + 1][1:] == ("add", "r9,r4", None)
            and value is not None
            and rows[index + 3][1:] == ("mov.b", "r5,@r4", None)
        ):
            return {
                "scn3RelativeOffset": hex_offset(pointer),
                "value": value,
                "writeFileOffset": hex_offset(rows[index + 3][0]),
            }
    return None


def jd00_selector_routes(
    instructions: list[tuple[int, str, str, int | None]],
    starts: list[int],
    code_end: int,
    selector_offset: int,
) -> dict[str, Any]:
    """Join JD00's callback selector byte to its three native routes."""

    candidates = []
    for index in range(len(instructions) - 4):
        pointer_load = instructions[index]
        if not (
            pointer_load[1] == "mov.l"
            and pointer_load[3] == selector_offset
            and pointer_load[2].endswith(",r0")
            and instructions[index + 1][1] == "mov.b"
            and instructions[index + 1][2] == "@(r0,r9),r5"
            and instructions[index + 2][1] == "mov.l"
            and instructions[index + 2][2].endswith("r5,@r4")
        ):
            continue
        function_start = max(
            start for start in starts if start <= pointer_load[0]
        )
        end = function_end(function_start, starts, code_end)
        rows = [
            row
            for row in instructions
            if function_start <= row[0] < end
        ]
        # The stack slot is materialized immediately before the selector
        # load as ``mov #N,r4; add r14,r4``.
        stack_offset = register_value(instructions[index - 2], "r4")
        if (
            stack_offset is None
            or instructions[index - 1][1:] != ("add", "r14,r4", None)
        ):
            continue
        stack_operand = (
            "@(0,r14),r4"
            if stack_offset == 0
            else f"@({stack_offset},r14),r4"
        )
        compares = []
        for row_index in range(len(rows) - 3):
            value = register_value(rows[row_index + 1], "r5")
            if (
                rows[row_index][1:] == (
                    "mov.l",
                    stack_operand,
                    None,
                )
                and value is not None
                and rows[row_index + 2][1:] == (
                    "cmp/eq",
                    "r5,r4",
                    None,
                )
            ):
                compares.append(
                    (row_index, value, rows[row_index][0])
                )
        selector_routes = []
        for compare_index, (row_index, value, address) in enumerate(
            compares
        ):
            stop = (
                compares[compare_index + 1][2]
                if compare_index + 1 < len(compares)
                else end
            )
            routes = transition_helper_calls(
                instructions, address, stop
            )
            for route in routes:
                selector_routes.append(
                    {"selectorValue": value, **route}
                )
        if {route["selectorValue"] for route in selector_routes} == {
            1,
            2,
            3,
        }:
            candidates.append(
                {
                    "dispatchFunctionFileOffset": hex_offset(
                        function_start
                    ),
                    "dispatchFunctionEndFileOffset": hex_offset(end),
                    "selectorStackOffset": stack_offset,
                    "routes": selector_routes,
                }
            )
    unique = {
        candidate["dispatchFunctionFileOffset"]: candidate
        for candidate in candidates
    }
    if len(unique) != 1:
        raise ValueError(
            "expected one JD00 selector dispatcher, found "
            f"{len(unique)}"
        )
    return next(iter(unique.values()))


def discover_table(
    area: str,
    data: bytes,
    scn3: int,
    code_start: int,
    code_end: int,
    static_start: int,
    starts: list[int],
    instructions: list[tuple[int, str, str, int | None]],
) -> tuple[int, list[int]]:
    start_set = set(starts)

    if area == "D000":
        def d000(targets: list[int]) -> bool:
            if data[targets[0] : targets[0] + 16] != EMPTY_FUNCTION:
                return False
            if data[targets[1] : targets[1] + 16] != EMPTY_FUNCTION:
                return False
            if not all(target in start_set for target in targets[2:]):
                return False
            return all(
                contains_akir(
                    data,
                    target,
                    function_end(target, starts, code_end),
                )
                for target in targets[2:]
            )

        return pointer_table(
            data, scn3, static_start, code_start, code_end, 6, d000
        )

    if area == "JD00":
        def jd00(targets: list[int]) -> bool:
            if data[targets[0] : targets[0] + 16] != EMPTY_FUNCTION:
                return False
            if not all(target in start_set for target in targets[1:]):
                return False
            writes = [
                selector_write(
                    instructions,
                    target,
                    function_end(target, starts, code_end),
                )
                for target in targets[1:]
            ]
            return (
                all(write is not None for write in writes)
                and len(
                    {
                        write["scn3RelativeOffset"]
                        for write in writes
                        if write
                    }
                )
                == 1
            )

        return pointer_table(
            data, scn3, static_start, code_start, code_end, 4, jd00
        )

    if area == "JU00":
        def ju00(targets: list[int]) -> bool:
            if data[targets[0] : targets[0] + 16] != EMPTY_FUNCTION:
                return False
            if targets[1] not in start_set:
                return False
            end = function_end(targets[1], starts, code_end)
            routes = transition_helper_calls(
                instructions, targets[1], end
            )
            return (
                contains_akir(data, targets[1], end)
                and any(
                    route["destination"]["area"] == "JD00"
                    for route in routes
                )
            )

        return pointer_table(
            data, scn3, static_start, code_start, code_end, 2, ju00
        )

    raise ValueError(f"unsupported proven callback layout {area}")


def callback_registration(
    instructions: list[tuple[int, str, str, int | None]],
    static_start: int,
) -> dict[str, Any] | None:
    registrations = []
    for call in extract_dispatch_calls(instructions, static_start):
        if call["operationId"] != 0x0001:
            continue
        arguments = call.get("arguments", [])
        if (
            len(arguments) != 2
            or arguments[0].get("kind") != "static-pointer"
            or arguments[1].get("kind") != "constant"
        ):
            raise ValueError(
                "operation 0x0001 callback registration has dynamic operands"
            )
        registrations.append(
            {
                "callFileOffset": call["callFileOffset"],
                "tableFileOffset": arguments[0]["value"],
                "callbackCount": arguments[1]["value"],
            }
        )
    if not registrations:
        return None
    unique = {
        (item["tableFileOffset"], item["callbackCount"]): item
        for item in registrations
    }
    if len(unique) != 1:
        raise ValueError(
            f"multiple distinct callback registrations: {registrations}"
        )
    return next(iter(unique.values()))


def extract_map(path: Path, objdump: str) -> dict[str, Any] | None:
    data = path.read_bytes()
    area = path.parent.name.upper()
    scn3, code_start, code_end, static_start = scn3_ranges(data)
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_start
    ]
    starts = function_starts(data, code_start, code_end)
    registration = callback_registration(instructions, static_start)
    if registration is None:
        return None
    table_offset = registration["tableFileOffset"]
    callback_count = registration["callbackCount"]
    if (
        callback_count <= 0
        or callback_count > 0x1000
        or table_offset < static_start
        or table_offset + callback_count * 4 > len(data)
    ):
        raise ValueError(
            f"invalid operation-0x0001 callback table in {path}"
        )
    stored_targets = struct.unpack_from(
        f"<{callback_count}I", data, table_offset
    )
    targets = [scn3 + value for value in stored_targets]
    start_set = set(starts)
    if not all(
        code_start <= target < code_end and target in start_set
        for target in targets
    ):
        raise ValueError(
            f"operation-0x0001 table targets invalid code in {path}"
        )
    callbacks = []
    for event_id, start in enumerate(targets):
        end = function_end(start, starts, code_end)
        routes = transition_helper_calls(instructions, start, end)
        callback: dict[str, Any] = {
            "eventId": event_id,
            "storedScn3RelativeFunction": hex_offset(start - scn3),
            "functionFileOffset": hex_offset(start),
            "functionEndFileOffset": hex_offset(end),
            "empty": data[start : start + 16] == EMPTY_FUNCTION,
            "selectorWrite": selector_write(
                instructions, start, end
            ),
            "transitionRoutes": routes,
        }
        callbacks.append(callback)
    item = {
        "disc": infer_disc(path),
        "area": area,
        "path": str(path),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": hex_offset(scn3),
        "callbackTableFileOffset": hex_offset(table_offset),
        "registration": {
            "operation": "0x0001",
            "callFileOffset": registration["callFileOffset"],
            "callbackCount": callback_count,
        },
        "callbacks": callbacks,
    }
    if area == "JD00":
        selector_offsets = {
            int(callback["selectorWrite"]["scn3RelativeOffset"], 16)
            for callback in callbacks
            if callback["selectorWrite"]
        }
        if len(selector_offsets) != 1:
            raise ValueError("JD00 callbacks do not share one selector")
        item["selectorDispatch"] = jd00_selector_routes(
            instructions,
            starts,
            code_end,
            next(iter(selector_offsets)),
        )
    return item


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="*", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tools/evidence/map-event-callbacks.json"),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    roots = tuple(args.roots) or DEFAULT_ROOTS
    paths = sorted(
        {
            path
            for root in roots
            for path in root.glob("*/MAPINFO.BIN")
        }
    )
    maps = [
        item
        for path in paths
        if (item := extract_map(path, args.objdump)) is not None
    ]
    output = {
        "schema": "new-yokosuka-map-event-callbacks-v1",
        "generatedFrom": [str(root) for root in roots],
        "summary": {
            "mapCount": len(maps),
            "callbackCount": sum(
                len(item["callbacks"]) for item in maps
            ),
            "literalTransitionRouteCount": sum(
                len(callback["transitionRoutes"])
                for item in maps
                for callback in item["callbacks"]
            ),
        },
        "nativeEvidence": {
            "callbackIndexRule": (
                "The low 16 bits of a class-4 EVNT record select the "
                "same-index entry in the map's callback table."
            ),
            "registrationRule": (
                "Every emitted table is the exact static pointer and count "
                "passed to native operation 0x0001. All extracted MAPINFO "
                "files are scanned without a map-name allowlist."
            ),
            "localTransitionHelperSignature": (
                "mode, entry, four-character area ID, scene; the helper "
                "reorders these into operation 0x0030(scene, area, entry)"
            ),
            "reviewedRuntimeAndStaticTrace": (
                "tools/evidence/jd00-d000-boundary-transition.json"
            ),
        },
        "maps": maps,
        "unresolved": [],
        "evidenceBoundary": (
            "This report emits every table registered by native operation "
            "0x0001. Maps without that operation are omitted; pointer-like "
            "static data is never promoted to a callback table. "
            "Every literal local-helper call is retained, including "
            "conditional alternatives. It does not select a story branch "
            "or infer a destination for an unresolved callback."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(
        f"wrote {args.output}: {output['summary']['mapCount']} maps, "
        f"{output['summary']['callbackCount']} callbacks, "
        f"{output['summary']['literalTransitionRouteCount']} routes"
    )


if __name__ == "__main__":
    main()
