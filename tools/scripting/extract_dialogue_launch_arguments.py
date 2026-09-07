#!/usr/bin/env python3
"""Recover arguments passed through native dialogue-launch wrappers.

Generated SCN3 code passes every native function argument on its downward
growing stack.  Dialogue coroutines are often launched by a generic wrapper,
so the operation-0x0002 call itself contains only references to that wrapper's
incoming arguments.  This extractor follows exact ``bsrf`` call sites and
substitutes those incoming arguments without assigning gameplay meaning to
them.

Literal values, unchanged caller arguments, and exact MAPINFO-base address
additions are propagated. Other arithmetic, loads from mutable memory,
ambiguous callers, and control-flow-dependent values remain explicit rather
than being guessed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import sys
from bisect import bisect_right
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Sequence


from tools.scripting.extract_dialogue_call_graph import (  # noqa: E402
    branch_target,
    direct_call_edges,
    function_starts,
)
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls  # noqa: E402
from tools.scripting.extract_sh4_object_transforms import disassemble  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CANDIDATES = (
    PROJECT_ROOT / ".disc-work/dialogue/interaction-candidates.json"
)
DEFAULT_CALL_GRAPH = PROJECT_ROOT / ".disc-work/dialogue/call-graph.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-launch-arguments.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-launch-arguments.json"
)
CALLER_ARGUMENT = re.compile(r"^@\((\d+),r14\)")
INDEXED_FRAME_ARGUMENT = re.compile(
    r"^@\((?P<index>r(?:1[0-5]|[0-9])),r14\)$"
)
REGISTER = re.compile(r"^r(?:1[0-5]|[0-9])$")
CONTROL_FLOW = {
    "bra",
    "braf",
    "bf",
    "bf.s",
    "bt",
    "bt.s",
    "bsr",
    "bsrf",
    "jmp",
    "jsr",
    "rts",
}


def hx(value: int) -> str:
    return f"0x{value:x}"


def signed_immediate(operand: str) -> int | None:
    if not operand.startswith("#"):
        return None
    try:
        value = int(operand[1:], 0)
    except ValueError:
        return None
    return value - 256 if value >= 128 else value


def ascii_value(value: int) -> str | None:
    raw = struct.pack("<I", value & 0xFFFF_FFFF)
    if all(0x20 <= byte < 0x7F for byte in raw):
        return raw.decode("ascii")
    return None


def literal(value: int, source: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "kind": "constant",
        "value": value & 0xFFFF_FFFF,
        "hex": f"0x{value & 0xFFFF_FFFF:08x}",
    }
    text = ascii_value(value)
    if text is not None:
        result["ascii"] = text
    float_value = struct.unpack(
        "<f",
        struct.pack("<I", value & 0xFFFF_FFFF),
    )[0]
    if math.isfinite(float_value):
        result["float32"] = float_value
    if source is not None:
        result["sourceFileOffset"] = hx(source)
    return result


def unresolved(reason: str, source: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"kind": "runtime", "reason": reason}
    if source is not None:
        result["sourceFileOffset"] = hx(source)
    return result


def static_pointer(value: int, source: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "kind": "static-pointer",
        "value": value & 0xFFFF_FFFF,
        "hex": f"0x{value & 0xFFFF_FFFF:08x}",
    }
    if source is not None:
        result["sourceFileOffset"] = hx(source)
    return result


def add_values(
    left: dict[str, Any],
    right: dict[str, Any],
    source: int,
) -> dict[str, Any]:
    if left["kind"] == "constant" and right["kind"] == "constant":
        return literal(left["value"] + right["value"], source)
    if left["kind"] == "static-base" and right["kind"] == "constant":
        return static_pointer(right["value"], source)
    if left["kind"] == "constant" and right["kind"] == "static-base":
        return static_pointer(left["value"], source)
    if left["kind"] == "static-pointer" and right["kind"] == "constant":
        return static_pointer(left["value"] + right["value"], source)
    if left["kind"] == "constant" and right["kind"] == "static-pointer":
        return static_pointer(left["value"] + right["value"], source)
    return unresolved("non-static-addition", source)


def frame_argument_base(
    instructions: Sequence[tuple[int, str, str, int | None]],
    start_index: int,
    end_index: int,
) -> int | None:
    """Return r14 offset of incoming argument zero for a standard frame."""

    local_bytes = 0
    for address, mnemonic, operands, _literal in instructions[
        start_index : min(end_index, start_index + 12)
    ]:
        if mnemonic == "add" and operands.endswith(",r13"):
            amount = signed_immediate(operands.split(",", 1)[0])
            if amount is None or amount > 0:
                return None
            local_bytes += -amount
        if mnemonic == "mov" and operands == "r13,r14":
            return local_bytes + 8
        if mnemonic in CONTROL_FLOW:
            return None
    return None


def assigned_register(mnemonic: str, operands: str) -> str | None:
    if "," not in operands:
        return None
    destination = operands.rsplit(",", 1)[1]
    return destination if REGISTER.fullmatch(destination) else None


def resolve_register(
    instructions: Sequence[tuple[int, str, str, int | None]],
    register: str,
    before_index: int,
    function_start_index: int,
    argument_base: int | None,
    *,
    depth: int = 0,
) -> dict[str, Any]:
    if depth > 16:
        return unresolved("register-copy-depth-exceeded")
    for index in range(before_index - 1, function_start_index - 1, -1):
        address, mnemonic, operands, value = instructions[index]
        destination = assigned_register(mnemonic, operands)
        if destination != register:
            continue
        source = operands.rsplit(",", 1)[0]
        if mnemonic == "mov":
            immediate = signed_immediate(source)
            if immediate is not None:
                return literal(immediate, address)
            if REGISTER.fullmatch(source):
                return resolve_register(
                    instructions,
                    source,
                    index,
                    function_start_index,
                    argument_base,
                    depth=depth + 1,
                )
            return unresolved(f"unsupported-move-source:{source}", address)
        if mnemonic in {"mov.b", "mov.w", "mov.l"}:
            if mnemonic == "mov.l" and value is not None:
                return literal(value, address)
            if mnemonic == "mov.l" and source == "@(4,r8)":
                return {
                    "kind": "static-base",
                    "sourceFileOffset": hx(address),
                }
            match = CALLER_ARGUMENT.match(source)
            if match:
                offset = int(match.group(1))
                delta = (
                    offset - argument_base
                    if argument_base is not None
                    else -1
                )
                if mnemonic == "mov.l" and delta >= 0 and delta % 4 == 0:
                    return {
                        "kind": "caller-argument",
                        "index": delta // 4,
                        "frameOffset": offset,
                        "sourceFileOffset": hx(address),
                    }
                return {
                    "kind": "frame-field",
                    "offset": offset,
                    "width": {
                        "mov.b": 1,
                        "mov.w": 2,
                        "mov.l": 4,
                    }[mnemonic],
                    "sourceFileOffset": hx(address),
                }
            indexed_match = INDEXED_FRAME_ARGUMENT.fullmatch(source)
            if indexed_match:
                index_value = resolve_register(
                    instructions,
                    indexed_match.group("index"),
                    index,
                    function_start_index,
                    argument_base,
                    depth=depth + 1,
                )
                if index_value.get("kind") == "constant":
                    return {
                        "kind": "frame-field",
                        "offset": index_value["value"],
                        "width": {
                            "mov.b": 1,
                            "mov.w": 2,
                            "mov.l": 4,
                        }[mnemonic],
                        "sourceFileOffset": hx(address),
                    }
            return unresolved(f"mutable-memory-load:{source}", address)
        if mnemonic == "add":
            left_source = operands.split(",", 1)[0]
            destination_value = resolve_register(
                instructions,
                register,
                index,
                function_start_index,
                argument_base,
                depth=depth + 1,
            )
            immediate = signed_immediate(left_source)
            if immediate is not None:
                return add_values(
                    destination_value,
                    literal(immediate),
                    address,
                )
            if REGISTER.fullmatch(left_source):
                source_value = resolve_register(
                    instructions,
                    left_source,
                    index,
                    function_start_index,
                    argument_base,
                    depth=depth + 1,
                )
                return add_values(
                    destination_value,
                    source_value,
                    address,
                )
            return unresolved("unsupported-addition-source", address)
        return unresolved(f"unsupported-assignment:{mnemonic}", address)
    return unresolved(f"no-definition:{register}")


def pushed_arguments(
    instructions: Sequence[tuple[int, str, str, int | None]],
    call_index: int,
    function_start_index: int,
    argument_base: int | None,
) -> list[dict[str, Any]] | None:
    """Resolve the exact stack words removed immediately after a call."""

    cleanup_index = call_index + 2  # one SH-4 delay-slot instruction
    if cleanup_index >= len(instructions):
        return None
    cleanup = instructions[cleanup_index]
    if cleanup[1] != "add" or not cleanup[2].endswith(",r13"):
        return []
    byte_count = signed_immediate(cleanup[2].split(",", 1)[0])
    if byte_count is None or byte_count <= 0 or byte_count % 4:
        return None
    count = byte_count // 4
    pushes: list[tuple[int, str]] = []
    for index in range(call_index - 1, function_start_index - 1, -1):
        _address, mnemonic, operands, _value = instructions[index]
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            source = operands.split(",", 1)[0]
            if not REGISTER.fullmatch(source):
                return None
            pushes.append((index, source))
            if len(pushes) == count:
                break
        elif mnemonic in CONTROL_FLOW:
            return None
    if len(pushes) != count:
        return None
    # The final push is argument zero at the stack pointer seen by the callee.
    return [
        resolve_register(
            instructions,
            register,
            push_index,
            function_start_index,
            argument_base,
        )
        for push_index, register in pushes
    ]


def substitute(
    expression: dict[str, Any],
    caller_arguments: Sequence[dict[str, Any]],
) -> dict[str, Any]:
    if expression["kind"] != "caller-argument":
        return expression
    index = expression["index"]
    if index >= len(caller_arguments):
        return unresolved(f"caller-does-not-supply-argument:{index}")
    return caller_arguments[index]


def resolve_parameter_values(
    function: int,
    parameter: int,
    incoming: dict[int, list[dict[str, Any]]],
    *,
    visited: frozenset[tuple[int, int]] = frozenset(),
    maximum_depth: int = 12,
) -> list[dict[str, Any]]:
    """Resolve a generated function parameter through all exact callers."""

    key = (function, parameter)
    if key in visited or maximum_depth <= 0:
        return [unresolved("recursive-or-depth-limited-call-chain")]
    callers = incoming.get(function, [])
    if not callers:
        return [unresolved("no-exact-direct-caller")]
    values = []
    for edge in callers:
        if parameter >= len(edge["arguments"]):
            values.append(unresolved("caller-argument-count-too-small"))
            continue
        value = edge["arguments"][parameter]
        if value["kind"] == "caller-argument":
            values.extend(resolve_parameter_values(
                edge["source"],
                value["index"],
                incoming,
                visited=visited | {key},
                maximum_depth=maximum_depth - 1,
            ))
        else:
            values.append(value)
    unique = {
        json.dumps(value, sort_keys=True): value
        for value in values
    }
    return [unique[key] for key in sorted(unique)]


def operation_argument_expression(
    argument: dict[str, Any],
    argument_base: int | None,
) -> dict[str, Any]:
    if argument.get("kind") == "constant":
        return literal(argument["value"])
    match = CALLER_ARGUMENT.match(argument.get("source", ""))
    if match and argument_base is not None:
        offset = int(match.group(1))
        delta = offset - argument_base
        if delta >= 0 and delta % 4 == 0:
            return {
                "kind": "caller-argument",
                "index": delta // 4,
                "frameOffset": offset,
            }
    return unresolved(f"operation-source:{argument.get('source', 'unknown')}")


def map_report(
    graph_map: dict[str, Any],
    launch_offsets: set[int],
    objdump: str,
) -> dict[str, Any]:
    path = Path(graph_map["source"])
    data, static_base, dispatch_calls, _targets = mapinfo_dispatch_calls(
        path,
        objdump,
    )
    scn3 = data.find(b"SCN3")
    code_start = scn3 + 0x30
    starts = function_starts(data, code_start, static_base)
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_base
    ]
    instruction_index = {
        row[0]: index for index, row in enumerate(instructions)
    }
    start_index = {
        start: instruction_index[start]
        for start in starts
        if start in instruction_index
    }
    frame_bases = {}
    for position, start in enumerate(starts):
        if start not in start_index:
            continue
        end = starts[position + 1] if position + 1 < len(starts) else static_base
        end_index = bisect_right([row[0] for row in instructions], end - 1)
        frame_bases[start] = frame_argument_base(
            instructions,
            start_index[start],
            end_index,
        )

    edges = direct_call_edges(
        instructions,
        starts,
        code_start,
        static_base,
    )
    incoming: dict[int, list[dict[str, Any]]] = defaultdict(list)
    direct_calls = []
    for edge in edges:
        index = instruction_index[edge["call"]]
        arguments = pushed_arguments(
            instructions,
            index,
            start_index[edge["source"]],
            frame_bases.get(edge["source"]),
        )
        row = {
            "source": edge["source"],
            "target": edge["target"],
            "call": edge["call"],
            "arguments": arguments or [],
            "argumentRecovery": (
                "exact-stack-cleanup" if arguments is not None else "unresolved"
            ),
        }
        direct_calls.append(row)
        incoming[edge["target"]].append(row)

    launches = []
    for call in dispatch_calls:
        call_offset = int(call["callFileOffset"], 16)
        if call["operationId"] != 2 or call_offset not in launch_offsets:
            continue
        owner_position = bisect_right(starts, call_offset) - 1
        if owner_position < 0:
            continue
        owner = starts[owner_position]
        child_expressions = [
            operation_argument_expression(
                argument,
                frame_bases.get(owner),
            )
            for argument in call["arguments"][2:]
        ]
        resolved_arguments = []
        for expression in child_expressions:
            if expression["kind"] == "caller-argument":
                alternatives = resolve_parameter_values(
                    owner,
                    expression["index"],
                    incoming,
                )
            else:
                alternatives = [expression]
            resolved_arguments.append({
                "expression": expression,
                "alternatives": alternatives,
                "exactSingleValue": (
                    alternatives[0]
                    if len(alternatives) == 1
                    and alternatives[0]["kind"] == "constant"
                    else None
                ),
            })
        incoming_argument_count = max(
            (
                len(edge["arguments"])
                for edge in incoming.get(owner, [])
            ),
            default=0,
        )
        incoming_arguments = []
        for parameter in range(incoming_argument_count):
            alternatives = resolve_parameter_values(
                owner,
                parameter,
                incoming,
            )
            incoming_arguments.append({
                "index": parameter,
                "alternatives": alternatives,
                "exactSingleValue": (
                    alternatives[0]
                    if len(alternatives) == 1
                    and alternatives[0]["kind"] == "constant"
                    else None
                ),
            })
        launches.append({
            "callFileOffset": hx(call_offset),
            "sourceFunctionFileOffset": hx(owner),
            "declaredChildArgumentCount": (
                call["arguments"][1].get("value")
                if len(call["arguments"]) > 1
                else None
            ),
            "childArguments": resolved_arguments,
            "sourceFunctionIncomingArguments": incoming_arguments,
        })
    return {
        "disc": graph_map["disc"],
        "area": graph_map["area"],
        "source": str(path),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "launches": launches,
    }


def build_report(
    candidates: dict[str, Any],
    call_graph: dict[str, Any],
    objdump: str,
) -> dict[str, Any]:
    launch_offsets: dict[tuple[int, str], set[int]] = defaultdict(set)
    candidate_by_launch: dict[tuple[int, str, int], list[int]] = defaultdict(list)
    for candidate in candidates["candidates"]:
        for path in candidate["launchPaths"]:
            if path["rootKind"] != "operation-0x0002-child-coroutine":
                continue
            call = int(path["launchCallFileOffset"], 16)
            key = (candidate["disc"], candidate["area"])
            launch_offsets[key].add(call)
            candidate_by_launch[(*key, call)].append(
                candidate["executableTargetIndex"]
            )

    maps = []
    for item in call_graph["maps"]:
        offsets = launch_offsets.get((item["disc"], item["area"]), set())
        if offsets:
            maps.append(map_report(item, offsets, objdump))
    launches = []
    for item in maps:
        for launch in item["launches"]:
            call = int(launch["callFileOffset"], 16)
            launch["dialogueExecutableTargetIndices"] = sorted(
                candidate_by_launch[(item["disc"], item["area"], call)]
            )
            launches.append(launch)

    exact_launches = [
        launch
        for launch in launches
        if launch["childArguments"]
        and all(
            argument["exactSingleValue"] is not None
            for argument in launch["childArguments"]
        )
    ]
    text_values = Counter()
    for launch in launches:
        arguments = (
            launch["childArguments"]
            + launch["sourceFunctionIncomingArguments"]
        )
        for argument in arguments:
            value = argument["exactSingleValue"]
            if value is not None and "ascii" in value:
                text_values[value["ascii"]] += 1
    return {
        "schema": "new-yokosuka-dialogue-launch-arguments-v1",
        "evidenceBoundary": [
            "Values are propagated only through exact generated bsrf call targets, immediate post-call stack cleanup, literal register loads, register copies, and unchanged incoming stack arguments.",
            "A recovered four-character value is an authored launch argument; this report does not yet assert whether that argument names the clicked object, an actor, or another native resource.",
            "Multiple callers remain alternatives. Mutable-memory loads, arithmetic, indirect calls, control-flow-dependent values, recursion, and unsupported frame layouts remain runtime.",
            "This evidence does not by itself make a dialogue candidate runtime-ready or prove an interaction trigger.",
        ],
        "summary": {
            "mapCount": len(maps),
            "candidateLaunchCount": len(launches),
            "launchWithAllChildArgumentsExactCount": len(exact_launches),
            "launchWithAnyExactChildArgumentCount": sum(
                any(
                    argument["exactSingleValue"] is not None
                    for argument in launch["childArguments"]
                )
                for launch in launches
            ),
            "launchWithAnyExactUpstreamContextArgumentCount": sum(
                any(
                    argument["exactSingleValue"] is not None
                    for argument in launch[
                        "sourceFunctionIncomingArguments"
                    ]
                )
                for launch in launches
            ),
            "exactFourCharacterArgumentCounts": dict(
                sorted(text_values.items())
            ),
        },
        "maps": maps,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": report["schema"],
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--call-graph", type=Path, default=DEFAULT_CALL_GRAPH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    report = build_report(
        json.loads(args.candidates.read_text()),
        json.loads(args.call_graph.read_text()),
        args.objdump,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(json.dumps(summary_report(report), indent=2) + "\n")
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['launchWithAllChildArgumentsExactCount']}/"
        f"{report['summary']['candidateLaunchCount']} candidate launches have "
        "all child arguments exactly recovered"
    )


if __name__ == "__main__":
    main()
