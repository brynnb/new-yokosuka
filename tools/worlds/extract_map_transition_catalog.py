#!/usr/bin/env python3
"""Catalog SCN3 map-transition calls from extracted Shenmue MAPINFO files.

The native engine dispatcher operation 0x0030 has the argument order:

    scene number, four-character area ID, entry point

Calls whose three arguments are constants are exact offline edges. Calls with
one or more runtime arguments are retained as dynamic edges rather than being
guessed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any

from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


TRANSITION_OPERATION = 0x0030
CURRENT_SCENE_OPERATION = 0x019C
MAPINFO_PATH = re.compile(
    r"(?:^|/)(disc(?P<disc>\d+))/SCENE/(?P<scene>\d+)/"
    r"(?P<area>[^/]+)/MAPINFO\.BIN$",
    re.IGNORECASE,
)
SCENE_MAPINFO_PATH = re.compile(
    r"(?:^|/)SCENE/(?P<scene>\d+)/(?P<area>[^/]+)/MAPINFO\.BIN$",
    re.IGNORECASE,
)
AREA_ID = re.compile(r"^[A-Z0-9]{4}$")
FUNCTION_PROLOGUE = bytes.fromhex("e62d224d")


def scn3_ranges(data: bytes) -> tuple[int, int, int, int]:
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x30 > len(data):
        raise ValueError("input does not contain a complete SCN3 token")
    token_size = struct.unpack_from("<I", data, scn3_offset + 4)[0]
    code_end_relative = struct.unpack_from("<I", data, scn3_offset + 0x0C)[0]
    static_data_relative = struct.unpack_from("<I", data, scn3_offset + 0x10)[0]
    token_end = scn3_offset + token_size
    code_start = scn3_offset + 0x30
    code_end = scn3_offset + code_end_relative
    static_data_base = scn3_offset + static_data_relative
    if not (
        code_start <= code_end <= static_data_base <= token_end <= len(data)
    ):
        raise ValueError("SCN3 code/static/token ranges are inconsistent")
    return scn3_offset, code_start, code_end, static_data_base


def source_from_path(path: Path) -> dict[str, Any]:
    normalized = path.as_posix()
    match = MAPINFO_PATH.search(normalized)
    if not match:
        scene_match = SCENE_MAPINFO_PATH.search(normalized)
        if not scene_match:
            raise ValueError(
                "path must contain SCENE/NN/AREA/MAPINFO.BIN"
            )
        scene = int(scene_match.group("scene"))
        return {
            # Shenmue's extracted SCENE/01, /02 and /03 roots correspond to
            # the three source discs. Preserve that identity when the path
            # does not contain an explicit discN component.
            "disc": scene,
            "scene": scene,
            "area": scene_match.group("area").upper(),
        }
    return {
        "disc": int(match.group("disc")),
        "scene": int(match.group("scene")),
        "area": match.group("area").upper(),
    }


def exact_destination(call: dict[str, Any]) -> dict[str, Any] | None:
    arguments = call.get("arguments", [])
    if len(arguments) != 3 or any(
        argument.get("kind") != "constant" for argument in arguments
    ):
        return None
    area = arguments[1].get("ascii")
    if not isinstance(area, str) or not AREA_ID.fullmatch(area):
        return None
    return {
        "scene": arguments[0]["value"],
        "area": area,
        "entry": arguments[2]["value"],
    }


def signed_u32(value: int) -> int:
    return value - 0x1_0000_0000 if value >= 0x8000_0000 else value


def branch_target(address: int, literal: int) -> int:
    return (address + 4 + signed_u32(literal)) & 0xFFFF_FFFF


def register_constant(
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


def function_starts(data: bytes, start: int, end: int) -> list[int]:
    return [
        offset
        for offset in range(start, end - 4, 2)
        if data[offset : offset + 4] == FUNCTION_PROLOGUE
    ]


def stack_argument_offsets(call: dict[str, Any]) -> list[int] | None:
    offsets = []
    for argument in call["arguments"]:
        match = re.match(
            r"^@\((\d+),r14\) at 0x[0-9a-f]+$",
            argument.get("source", ""),
        )
        if not match:
            return None
        offsets.append(int(match.group(1)))
    if len(offsets) != 3 or offsets != list(
        range(offsets[0], offsets[0] + 12, 4)
    ):
        return None
    return offsets


def resolve_pushed_constants(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
    argument_count: int,
) -> list[int] | None:
    pushes = []
    for index in range(call_index - 2, max(-1, call_index - 32), -1):
        row = instructions[index]
        if row[1] == "mov.l" and row[2].endswith(",@-r13"):
            pushes.append((index, row[2].split(",", 1)[0]))
            if len(pushes) == argument_count:
                break
    pushes.reverse()
    expected_registers = [f"r{index}" for index in range(4, 4 + argument_count)]
    if [register for _index, register in pushes] != expected_registers:
        return None

    values = []
    for push_index, register in pushes:
        value = None
        for index in range(push_index - 1, max(-1, push_index - 20), -1):
            candidate = register_constant(instructions[index], register)
            if candidate is not None:
                value = candidate
                break
            # Do not borrow a value from before another native/script call.
            if instructions[index][1] in {"jsr", "bsrf", "bsr"}:
                break
        if value is None:
            return None
        values.append(value)
    return values


def current_scene_transition_destination(
    instructions: list[tuple[int, str, str, int | None]],
    dispatch_calls: list[dict[str, Any]],
    transition_call: dict[str, Any],
    source_scene: int,
) -> dict[str, Any] | None:
    """Resolve ``0x019c(entry, area) -> 0x0030(result, area, entry)``.

    Engine operation 0x019c is handled by 0x0c1649b0.  It forwards the
    current scene value at 0x0c20c3d8 to the SCN3 result-slot writer
    0x0c0bb342.  Interior exit callbacks use that result as operation
    0x0030's scene argument, allowing the same MAPINFO to work from each
    source disc.  Accept only the exact adjacent compiler sequence and exact
    literal entry/area arguments.
    """

    transition_offset = int(transition_call["callFileOffset"], 16)
    instruction_index = {
        row[0]: index for index, row in enumerate(instructions)
    }
    transition_index = instruction_index.get(transition_offset)
    if transition_index is None:
        return None

    previous = None
    for call in reversed(dispatch_calls):
        call_offset = int(call["callFileOffset"], 16)
        if call_offset >= transition_offset:
            continue
        if transition_offset - call_offset > 0x20:
            break
        previous = call
        break
    if previous is None or previous["operationId"] != CURRENT_SCENE_OPERATION:
        return None

    previous_offset = int(previous["callFileOffset"], 16)
    previous_index = instruction_index.get(previous_offset)
    if previous_index is None:
        return None
    values = resolve_pushed_constants(instructions, previous_index, 2)
    if values is None:
        return None
    entry, area_value = values
    try:
        area = struct.pack("<I", area_value & 0xFFFF_FFFF).decode("ascii")
    except UnicodeDecodeError:
        return None
    if not AREA_ID.fullmatch(area):
        return None

    # The result must be transferred directly from r0 to the first argument
    # stack slot before the transition dispatch.
    between = instructions[previous_index + 1 : transition_index]
    result_registers = {
        row[2].split(",", 1)[1]
        for row in between
        if row[1] == "mov"
        and row[2].startswith("r0,r")
        and "," in row[2]
    }
    if not any(
        row[1] == "mov.l"
        and row[2].endswith(",@-r13")
        and row[2].split(",", 1)[0] in result_registers
        for row in between
    ):
        return None
    return {
        "scene": source_scene,
        "area": area,
        "entry": entry,
    }


def current_scene_static_slots(
    instructions: list[tuple[int, str, str, int | None]],
    dispatch_calls: list[dict[str, Any]],
) -> set[int]:
    """Find SCN3 static slots initialized from operation 0x019c's result."""

    instruction_index = {
        row[0]: index for index, row in enumerate(instructions)
    }
    slots: set[int] = set()
    for call in dispatch_calls:
        if call["operationId"] != CURRENT_SCENE_OPERATION:
            continue
        index = instruction_index.get(int(call["callFileOffset"], 16))
        if index is None:
            continue
        before = instructions[max(0, index - 8) : index]
        offset_load = next(
            (
                row
                for row in reversed(before)
                if row[1] == "mov.l"
                and row[2].endswith(",r4")
                and row[3] is not None
            ),
            None,
        )
        if offset_load is None:
            continue
        if not any(
            row[1] == "add" and row[2] == "r9,r4" for row in before
        ):
            continue
        if not any(
            row[1] == "mov.l" and row[2] == "r4,@-r13"
            for row in before
        ):
            continue
        after = instructions[index + 1 : index + 6]
        if (
            any(row[1] == "mov" and row[2] == "r0,r4" for row in after)
            and any(
                row[1] == "mov.l" and row[2] == "@r13+,r5"
                for row in after
            )
            and any(
                row[1] == "mov.l" and row[2] == "r4,@r5"
                for row in after
            )
        ):
            slots.add(offset_load[3])
    return slots


def current_scene_static_transition_destination(
    instructions: list[tuple[int, str, str, int | None]],
    transition_call: dict[str, Any],
    source_scene: int,
    current_scene_slots: set[int],
) -> dict[str, Any] | None:
    """Resolve a scene argument loaded from an 0x019c-initialized slot."""

    arguments = transition_call.get("arguments", [])
    if len(arguments) != 3 or not current_scene_slots:
        return None
    area = arguments[1].get("ascii")
    entry = arguments[2].get("value")
    if (
        arguments[1].get("kind") != "constant"
        or not isinstance(area, str)
        or not AREA_ID.fullmatch(area)
        or arguments[2].get("kind") != "constant"
        or not isinstance(entry, int)
    ):
        return None
    match = re.match(
        r"^@\(r0,r9\) at (0x[0-9a-f]+)$",
        arguments[0].get("source", ""),
    )
    if not match:
        return None
    source_offset = int(match.group(1), 16)
    instruction_index = {
        row[0]: index for index, row in enumerate(instructions)
    }
    index = instruction_index.get(source_offset)
    if index is None:
        return None
    slot = next(
        (
            row[3]
            for row in reversed(instructions[max(0, index - 4) : index])
            if row[1] == "mov.l"
            and row[2].endswith(",r0")
            and row[3] is not None
        ),
        None,
    )
    if slot not in current_scene_slots:
        return None
    return {"scene": source_scene, "area": area, "entry": entry}


def helper_transition_routes(
    data: bytes,
    instructions: list[tuple[int, str, str, int | None]],
    code_start: int,
    code_end: int,
    dynamic_calls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Resolve literal callers of native operation-0x0030 wrappers.

    The compiler emits a small wrapper when a caller supplies the transition
    tuple indirectly. Its operation call reads three consecutive incoming
    stack arguments. We identify that ABI from the operation call itself,
    then accept only standard literal r4..r7 push blocks that call the exact
    wrapper entry. Runtime-selected callers remain unresolved.
    """

    starts = function_starts(data, code_start, code_end)
    routes = []
    for operation_call in dynamic_calls:
        offsets = stack_argument_offsets(operation_call)
        if offsets is None or offsets[0] not in (8, 12):
            continue
        operation_offset = int(operation_call["callFileOffset"], 16)
        candidates = [start for start in starts if start <= operation_offset]
        if not candidates:
            continue
        helper = max(candidates)
        argument_count = offsets[-1] // 4 - 1
        if argument_count not in (3, 4):
            continue
        for index, row in enumerate(instructions):
            if row[1] != "bsrf" or index == 0:
                continue
            literal = instructions[index - 1][3]
            if literal is None or branch_target(row[0], literal) != helper:
                continue
            values = resolve_pushed_constants(
                instructions, index, argument_count
            )
            if values is None:
                continue
            if argument_count == 4:
                mode, entry, area_value, scene = values
            else:
                mode = None
                entry, area_value, scene = values
            area = struct.pack("<I", area_value & 0xFFFF_FFFF)
            try:
                area_name = area.decode("ascii")
            except UnicodeDecodeError:
                continue
            if not AREA_ID.fullmatch(area_name):
                continue
            routes.append(
                {
                    "callFileOffset": f"0x{row[0]:x}",
                    "helperFunctionFileOffset": f"0x{helper:x}",
                    "operationCallFileOffset": operation_call[
                        "callFileOffset"
                    ],
                    "argumentOrder": (
                        ["mode", "entry", "area", "scene"]
                        if argument_count == 4
                        else ["entry", "area", "scene"]
                    ),
                    "mode": mode,
                    "destination": {
                        "scene": scene,
                        "area": area_name,
                        "entry": entry,
                    },
                }
            )
    return routes


def catalog_mapinfo(path: Path, objdump: str) -> dict[str, Any]:
    source = source_from_path(path)
    data = path.read_bytes()
    scn3_offset, code_start, code_end, static_data_base = scn3_ranges(data)
    # The SCN3 header's first code boundary only terminates the primary
    # program.  Map callbacks continue until the static-data boundary.  Door
    # and boundary-transition callbacks commonly live in that second code
    # region, so stopping at code_end silently drops their operation-0x0030
    # calls.
    executable_code_end = static_data_base
    instructions = [
        instruction
        for instruction in disassemble(path, objdump)
        if code_start <= instruction[0] < executable_code_end
    ]
    transitions = []
    dispatch_calls = extract_dispatch_calls(instructions, static_data_base)
    scene_slots = current_scene_static_slots(instructions, dispatch_calls)
    for call in dispatch_calls:
        if call["operationId"] != TRANSITION_OPERATION:
            continue
        destination = exact_destination(call)
        resolution_kind = "literalArguments"
        if destination is None:
            destination = current_scene_transition_destination(
                instructions,
                dispatch_calls,
                call,
                source["scene"],
            )
            if destination is not None:
                resolution_kind = "currentSceneOperation019c"
        if destination is None:
            destination = current_scene_static_transition_destination(
                instructions,
                call,
                source["scene"],
                scene_slots,
            )
            if destination is not None:
                resolution_kind = "currentSceneStaticSlotOperation019c"
        transition = {
            "callFileOffset": call["callFileOffset"],
            "classification": "exact" if destination else "dynamic",
            "arguments": call["arguments"],
        }
        if destination:
            transition["destination"] = destination
            transition["resolutionKind"] = resolution_kind
        if (
            source == {"disc": 1, "scene": 1, "area": "JOMO"}
            and call["callFileOffset"] == "0x4434a"
        ):
            transition["runtimeCapture"] = (
                "tools/evidence/jomo-front-door-map-transition.json"
            )
        transitions.append(transition)
    local_helper_transitions = helper_transition_routes(
        data,
        instructions,
        code_start,
        executable_code_end,
        [
            call
            for call in dispatch_calls
            if call["operationId"] == TRANSITION_OPERATION
            and exact_destination(call) is None
        ],
    )
    return {
        "source": source,
        "path": str(path),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": f"0x{scn3_offset:x}",
        "primaryCodeEndFileOffset": f"0x{code_end:x}",
        "executableCodeFileRange": [
            f"0x{code_start:x}",
            f"0x{executable_code_end:x}",
        ],
        "currentSceneStaticSlots": [
            f"0x{offset:x}" for offset in sorted(scene_slots)
        ],
        "transitionCallCount": len(transitions),
        "transitions": transitions,
        "localHelperTransitionCount": len(local_helper_transitions),
        "localHelperTransitions": local_helper_transitions,
    }


def edge_key(source: dict[str, Any], destination: dict[str, Any]) -> tuple[Any, ...]:
    return (
        source["scene"],
        source["area"],
        destination["scene"],
        destination["area"],
        destination["entry"],
    )


def build_catalog(paths: list[Path], objdump: str) -> dict[str, Any]:
    maps = []
    failures = []
    edge_sites: dict[tuple[Any, ...], list[dict[str, Any]]] = defaultdict(list)
    exact_calls = 0
    dynamic_calls = 0
    helper_calls = 0
    for path in paths:
        try:
            item = catalog_mapinfo(path, objdump)
        except (OSError, ValueError) as error:
            failures.append({"path": str(path), "error": str(error)})
            continue
        maps.append(item)
        for transition in item["transitions"]:
            if transition["classification"] == "dynamic":
                dynamic_calls += 1
                continue
            exact_calls += 1
            key = edge_key(item["source"], transition["destination"])
            edge_sites[key].append(
                {
                    "disc": item["source"]["disc"],
                    "callFileOffset": transition["callFileOffset"],
                    "routeKind": "directOperation",
                }
            )
        for transition in item["localHelperTransitions"]:
            helper_calls += 1
            key = edge_key(item["source"], transition["destination"])
            edge_sites[key].append(
                {
                    "disc": item["source"]["disc"],
                    "callFileOffset": transition["callFileOffset"],
                    "routeKind": "localHelper",
                    "helperFunctionFileOffset": transition[
                        "helperFunctionFileOffset"
                    ],
                    "operationCallFileOffset": transition[
                        "operationCallFileOffset"
                    ],
                }
            )

    edges = []
    for key, call_sites in sorted(edge_sites.items()):
        source_scene, source_area, dest_scene, dest_area, entry = key
        edges.append(
            {
                "source": {"scene": source_scene, "area": source_area},
                "destination": {
                    "scene": dest_scene,
                    "area": dest_area,
                    "entry": entry,
                },
                "callSites": call_sites,
            }
        )
    transition_calls = exact_calls + dynamic_calls
    return {
        "schema": "new-yokosuka-map-transition-catalog-v3",
        "evidence": {
            "operationId": TRANSITION_OPERATION,
            "operationHex": "0x0030",
            "argumentOrder": ["scene", "area", "entry"],
            "localHelperRule": (
                "A dynamic operation-0x0030 wrapper is resolved only when "
                "its operation arguments are consecutive incoming stack "
                "slots and a caller supplies the exact standard literal "
                "r4..r7 push block."
            ),
            "currentSceneRule": (
                "Operation 0x019c is accepted as the scene argument only "
                "when an adjacent callback passes exact literal entry/area "
                "arguments to 0x019c and transfers its r0 result directly "
                "into operation 0x0030. Engine functions 0x0c1649b0 and "
                "0x0c0bb342 prove that result is the current scene value "
                "stored at 0x0c20c3d8."
            ),
            "runtimeValidation": (
                "tools/evidence/jomo-front-door-map-transition.json"
            ),
            "scn3ExecutableBoundary": (
                "The header offset at +0x0c ends the primary program, not "
                "all executable content. Callback code continues through "
                "the static-data offset at +0x10; the catalog scans both "
                "native code regions and never scans static data."
            ),
        },
        "summary": {
            "mapInfoCount": len(maps),
            "mapInfoFailureCount": len(failures),
            "mapsWithTransitionCalls": sum(
                bool(item["transitions"]) for item in maps
            ),
            "transitionCallCount": transition_calls,
            "exactCallCount": exact_calls,
            "dynamicCallCount": dynamic_calls,
            "resolvedLocalHelperCallCount": helper_calls,
            "uniqueExactEdgeCount": len(edges),
        },
        "exactEdges": edges,
        "maps": maps,
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "roots",
        nargs="+",
        type=Path,
        help="directories or MAPINFO.BIN files to scan",
    )
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")

    paths: set[Path] = set()
    for root in args.roots:
        if root.is_file():
            paths.add(root)
        elif root.is_dir():
            paths.update(root.rglob("MAPINFO.BIN"))
    # Ignore accidental root-level extracts that have no source-map context.
    paths = {
        path
        for path in paths
        if (
            MAPINFO_PATH.search(path.as_posix())
            or SCENE_MAPINFO_PATH.search(path.as_posix())
        )
    }
    if not paths:
        parser.error("no source-identifiable MAPINFO.BIN files were found")

    report = build_catalog(sorted(paths), args.objdump)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {args.out}: {summary['mapInfoCount']} maps, "
        f"{summary['exactCallCount']} exact and "
        f"{summary['dynamicCallCount']} dynamic transition calls"
    )


if __name__ == "__main__":
    main()
