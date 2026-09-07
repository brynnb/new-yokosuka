#!/usr/bin/env python3
"""Recover native call/launch paths leading to dialogue code regions.

The SCN3 compiler emits ordinary SH-4 helper calls with ``bsrf`` and creates
child coroutines through engine operation 0x0002. This extractor resolves both
forms without treating the broad executable-target table as a callback
registry. Full paths remain in ignored research storage; aggregate coverage is
safe to summarize in source control.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import sys
from bisect import bisect_right
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Sequence


from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls
from tools.worlds.extract_jomo_object_operations import (
    parse_immediate,
    resolve_register,
    value_json,
)
from tools.worlds.extract_map_event_callbacks import branch_target
from tools.scripting.extract_sh4_object_transforms import disassemble


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REGIONS = PROJECT_ROOT / ".disc-work/dialogue/code-regions.json"
DEFAULT_OUTPUT = PROJECT_ROOT / ".disc-work/dialogue/call-graph.json"
PROLOGUE = bytes.fromhex("e62d224d")
COROUTINE_LAUNCH_OPERATION = 0x0002


def hx(value: int) -> str:
    return f"0x{value:x}"


def function_starts(data: bytes, start: int, end: int) -> list[int]:
    result = []
    cursor = start + (start & 1)
    while cursor < end:
        found = data.find(PROLOGUE, cursor, end)
        if found < 0:
            break
        if found % 2 == 0:
            result.append(found)
        cursor = found + 2
    return result


def containing_function(starts: Sequence[int], offset: int) -> int | None:
    index = bisect_right(starts, offset) - 1
    return starts[index] if index >= 0 else None


def direct_call_edges(
    instructions: Sequence[tuple[int, str, str, int | None]],
    starts: Sequence[int],
    code_start: int,
    code_end: int,
) -> list[dict[str, int]]:
    result = []
    for index, row in enumerate(instructions):
        if (
            row[1] != "bsrf"
            or index == 0
            or instructions[index - 1][1] != "mov.l"
            or instructions[index - 1][3] is None
        ):
            continue
        target = branch_target(row[0], instructions[index - 1][3])
        source = containing_function(starts, row[0])
        if (
            source is not None
            and code_start <= target < code_end
            and target in starts
        ):
            result.append({
                "source": source,
                "target": target,
                "call": row[0],
            })
    return result


def resolve_module_relative_push(
    instructions: Sequence[tuple[int, str, str, int | None]],
    push_index: int,
    scn3_offset: int,
) -> int | None:
    push = instructions[push_index]
    if push[1] != "mov.l" or not push[2].endswith(",@-r13"):
        return None
    register = push[2].split(",", 1)[0]
    add_index = None
    relative_register = None
    for index in range(push_index - 1, max(-1, push_index - 14), -1):
        row = instructions[index]
        if row[1] == "add" and row[2].endswith(f",{register}"):
            source = row[2].split(",", 1)[0]
            if source.startswith("r") and source[1:].isdigit():
                add_index = index
                relative_register = source
                break
        if (
            row[1].startswith("mov")
            and row[2].endswith(f",{register}")
        ):
            return None
    if add_index is None:
        return None

    has_module_base = False
    relative = None
    for index in range(add_index - 1, max(-1, add_index - 10), -1):
        row = instructions[index]
        if row[1] == "mov.l" and row[2] == f"@(0,r8),{register}":
            has_module_base = True
        if (
            row[1] == "mov.l"
            and row[2].endswith(f",{relative_register}")
            and row[3] is not None
        ):
            relative = row[3]
        if has_module_base and relative is not None:
            return scn3_offset + relative
    return None


def live_argument_pushes(
    instructions: Sequence[tuple[int, str, str, int | None]],
    call_index: int,
    argument_count: int,
    function_start: int,
) -> list[int]:
    """Recover words still live on the downward-growing native stack.

    Generated SCN3 sometimes prepares child-coroutine payload words, invokes
    another engine operation to obtain the child target, reclaims only that
    nested operation's arguments, and finally invokes operation 0x0002. A
    proximity-only backward scan mistakes the reclaimed nested arguments for
    launch arguments. Walking backward across exact positive r13 cleanups
    preserves the stack lifetime without interpreting unrelated code.
    """

    pushes: list[int] = []
    reclaimed_words = 0
    for index in range(call_index - 1, -1, -1):
        address, mnemonic, operands, _literal = instructions[index]
        if address < function_start:
            break
        if mnemonic == "add" and operands.endswith(",r13"):
            immediate = parse_immediate(operands.split(",", 1)[0])
            if immediate is None:
                break
            if immediate & 0x80000000:
                immediate -= 0x100000000
            if immediate < 0 or immediate % 4:
                break
            reclaimed_words += immediate // 4
            continue
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            if reclaimed_words:
                reclaimed_words -= 1
                continue
            pushes.append(index)
            if len(pushes) == argument_count:
                break
        if mnemonic in {"bra", "braf", "bf", "bf.s", "bt", "bt.s", "jmp", "rts"}:
            break
    return pushes


def launch_argument_json(
    instructions: Sequence[tuple[int, str, str, int | None]],
    push_index: int,
    static_base: int,
    *,
    scn3_offset: int | None = None,
    starts: set[int] | None = None,
) -> dict[str, Any]:
    if scn3_offset is not None and starts is not None:
        target = resolve_module_relative_push(
            instructions,
            push_index,
            scn3_offset,
        )
        if target in starts:
            return {
                "kind": "function-pointer",
                "value": target,
                "targetFileOffset": hx(target),
                "source": hx(instructions[push_index][0]),
            }
    register = instructions[push_index][2].split(",", 1)[0]
    result = value_json(resolve_register(
        instructions,
        register,
        push_index,
        static_base,
    ))
    source = result.get("source")
    if result.get("kind") == "runtime" and isinstance(source, str):
        prefix = "@("
        suffix = ",r14) at "
        if source.startswith(prefix) and suffix in source:
            offset = source[len(prefix):source.index(suffix)]
            if offset.isdigit():
                result["kind"] = "frame-field"
                result["offset"] = int(offset)
    return result


def typed_table_launch_target(
    target_source: dict[str, Any],
    dispatch_by_call: dict[str, dict[str, Any]],
    data: bytes,
    starts: set[int],
    scn3_offset: int,
) -> dict[str, Any] | None:
    """Resolve an exact operation-0x009a mode-8 function-pointer table."""

    if target_source.get("kind") != "call-result":
        return None
    source_call = target_source.get("source")
    operation = dispatch_by_call.get(source_call)
    arguments = operation.get("arguments", []) if operation else []
    if (
        operation is None
        or operation.get("operationId") != 0x009A
        or len(arguments) != 3
        or arguments[0].get("kind") != "static-pointer"
        or arguments[1].get("kind") != "constant"
        or arguments[1].get("value") != 8
    ):
        return None
    table_base = arguments[0].get("value")
    if not isinstance(table_base, int) or table_base < 4:
        return None
    prior_relative = struct.unpack_from("<I", data, table_base - 4)[0]
    if scn3_offset + prior_relative in starts:
        return None
    entries = []
    cursor = table_base
    while cursor + 4 <= len(data):
        relative = struct.unpack_from("<I", data, cursor)[0]
        target = scn3_offset + relative
        if target not in starts:
            break
        entries.append({
            "index": len(entries),
            "relativeTarget": relative,
            "relativeTargetHex": hx(relative),
            "targetFileOffset": hx(target),
        })
        cursor += 4
    if not entries:
        return None
    return {
        "targetSource": {
            "kind": "typed-table-operation-result",
            "callFileOffset": source_call,
            "operationId": 0x009A,
            "operationHex": "0x009a",
            "mode": 8,
            "tableBaseFileOffset": hx(table_base),
            "scn3FileOffset": hx(scn3_offset),
        },
        "targetFileOffsets": sorted({
            entry["targetFileOffset"] for entry in entries
        }, key=lambda value: int(value, 16)),
        "targetTable": entries,
    }


def registered_selector_launch_target(
    target_source: dict[str, Any],
    dispatch_calls: Sequence[dict[str, Any]],
    instructions: Sequence[tuple[int, str, str, int | None]],
    source: int,
    source_end: int,
    executable_targets: Sequence[Any],
) -> dict[str, Any] | None:
    """Recover the compiler's registered four-entry child selector.

    This family stores mode-4 operation 0x009a results in frame offset four,
    bounds the selected index to four entries, and loads the child pointer
    from an r9-owned registration table.  The corresponding four functions
    are the ordered executable-target entries immediately after the wrapper.
    All three structural facts are required so an arbitrary frame value is
    never promoted to a child target.
    """

    if (
        target_source.get("kind") != "frame-field"
        or target_source.get("offset") != 4
    ):
        return None
    ordered = list(executable_targets)
    wrapper_index = next(
        (
            index
            for index, entry in enumerate(ordered)
            if entry.target_offset == source
        ),
        None,
    )
    if wrapper_index is None or wrapper_index + 4 >= len(ordered):
        return None
    selector_calls = [
        call
        for call in dispatch_calls
        if (
            call.get("operationId") == 0x009A
            and source <= int(call["callFileOffset"], 16) < source_end
            and len(call.get("arguments", [])) == 3
            and call["arguments"][1].get("kind") == "constant"
            and call["arguments"][1].get("value") == 4
        )
    ]
    if not selector_calls:
        return None
    source_rows = [
        row for row in instructions if source <= row[0] < source_end
    ]
    bounded_to_four = any(
        source_rows[index][1:3] == ("mov.l", "@(4,r14),r4")
        and source_rows[index + 1][1:3] == ("mov", "#4,r5")
        and source_rows[index + 2][1:3] == ("cmp/gt", "r4,r5")
        for index in range(len(source_rows) - 2)
    )
    registered_table_bases = []
    for index in range(len(source_rows) - 6):
        row = source_rows[index]
        if row[1] not in {"mov", "mov.l"}:
            continue
        register = row[2].rsplit(",", 1)[-1]
        table_base = (
            row[3]
            if row[1] == "mov.l"
            else parse_immediate(row[2].split(",", 1)[0])
        )
        if table_base is None:
            continue
        expected = [
            ("add", f"r9,{register}"),
            ("mov.l", "@(4,r14),r6"),
            ("mov", "#2,r7"),
            ("shad", "r7,r6"),
            ("add", f"r6,{register}"),
            ("mov.l", f"@{register},{register}"),
        ]
        if all(
            source_rows[index + offset + 1][1:3] == expected[offset]
            for offset in range(len(expected))
        ):
            registered_table_bases.append(table_base)
    if not bounded_to_four or not registered_table_bases:
        return None
    candidates = ordered[wrapper_index + 1:wrapper_index + 5]
    target_table = [
        {
            "index": index,
            "executableTargetIndex": entry.index,
            "targetFileOffset": hx(entry.target_offset),
        }
        for index, entry in enumerate(candidates)
    ]
    return {
        "targetSource": {
            "kind": "registered-selector-operation-result",
            "callFileOffsets": [
                call["callFileOffset"] for call in selector_calls
            ],
            "operationId": 0x009A,
            "operationHex": "0x009a",
            "mode": 4,
            "selectionFrameOffset": 4,
            "maximumExclusive": 4,
            "registeredTableGlobalOffsets": sorted(set(
                registered_table_bases
            )),
            "wrapperExecutableTargetIndex": ordered[wrapper_index].index,
        },
        "targetFileOffsets": [
            entry["targetFileOffset"] for entry in target_table
        ],
        "targetTable": target_table,
    }


def coroutine_launches(
    instructions: Sequence[tuple[int, str, str, int | None]],
    dispatch_calls: Sequence[dict[str, Any]],
    starts: Sequence[int],
    scn3_offset: int,
    code_start: int,
    code_end: int,
    *,
    data: bytes | None = None,
    include_dynamic: bool = False,
    executable_targets: Sequence[Any] = (),
) -> list[dict[str, Any]]:
    index_by_offset = {
        row[0]: index for index, row in enumerate(instructions)
    }
    result = []
    pending = []
    dispatch_by_call = {
        call["callFileOffset"]: call for call in dispatch_calls
    }
    start_set = set(starts)
    for call in dispatch_calls:
        if call["operationId"] != COROUTINE_LAUNCH_OPERATION:
            continue
        call_offset = int(call["callFileOffset"], 16)
        instruction_index = index_by_offset.get(call_offset)
        argument_count = call.get("argumentCount")
        if instruction_index is None or not isinstance(argument_count, int):
            continue
        source = containing_function(starts, call_offset)
        if source is None:
            continue
        source_position = bisect_right(starts, source) - 1
        source_end = (
            starts[source_position + 1]
            if source_position + 1 < len(starts)
            else code_end
        )
        pushes = live_argument_pushes(
            instructions,
            instruction_index,
            argument_count,
            source,
        )
        if len(pushes) != argument_count:
            continue
        # SCN3 arguments are pushed left-to-right, so the final push is the
        # first argument seen by operation 0x0002: the child target.
        target = resolve_module_relative_push(
            instructions,
            pushes[0],
            scn3_offset,
        )
        target_source = launch_argument_json(
            instructions,
            pushes[0],
            code_end,
            scn3_offset=scn3_offset,
            starts=start_set,
        )
        dynamic_target = (
            typed_table_launch_target(
                target_source,
                dispatch_by_call,
                data,
                start_set,
                scn3_offset,
            )
            if include_dynamic and data is not None
            else None
        )
        if dynamic_target is None and include_dynamic:
            dynamic_target = registered_selector_launch_target(
                target_source,
                dispatch_calls,
                instructions,
                source,
                source_end,
                executable_targets,
            )
        declared_argument = launch_argument_json(
            instructions,
            pushes[1],
            code_end,
        ) if len(pushes) > 1 else {}
        declared_argument_count = (
            declared_argument.get("value")
            if declared_argument.get("kind") == "constant"
            else None
        )
        if declared_argument_count not in {
            argument_count - 2,
            argument_count - 1,
        }:
            continue
        arguments = [
            launch_argument_json(
                instructions,
                push,
                code_end,
                scn3_offset=scn3_offset,
                starts=start_set,
            )
            for push in pushes[2:]
        ]
        implicit_argument_count = (
            declared_argument_count - len(arguments)
        )
        if implicit_argument_count == 1:
            # After operation 0x0002 reclaims its explicit words, the next
            # copied word is exactly the current r14-relative frame word.
            arguments.append({
                "kind": "frame-field",
                "offset": 0,
                "source": "live word at @r13/@r14 after launch cleanup",
            })
        elif implicit_argument_count != 0:
            continue
        launch = {
            "source": source,
            "call": call_offset,
            "argumentCount": declared_argument_count,
            "arguments": arguments,
            **(
                {"argumentCountRecovery": call["argumentCountRecovery"]}
                if call.get("argumentCountRecovery")
                else {}
            ),
            **({"implicitArgumentCount": 1} if implicit_argument_count else {}),
        }
        if dynamic_target is not None:
            launch.update(dynamic_target)
        elif (
            target is not None
            and code_start <= target < code_end
            and target in start_set
        ):
            launch["target"] = target
        else:
            pending.append((launch, target_source))
            continue
        result.append(launch)

    instruction_offsets = [row[0] for row in instructions]
    frame_bases = {}
    for position, start in enumerate(starts):
        start_index = bisect_right(instruction_offsets, start - 1)
        end = starts[position + 1] if position + 1 < len(starts) else code_end
        local_bytes = 0
        for _address, mnemonic, operands, _literal in instructions[
            start_index:min(bisect_right(instruction_offsets, end - 1), start_index + 12)
        ]:
            if mnemonic == "add" and operands.endswith(",r13"):
                amount = parse_immediate(operands.split(",", 1)[0])
                if amount is None:
                    break
                if amount & 0x80000000:
                    amount -= 0x100000000
                if amount > 0:
                    break
                local_bytes += -amount
            if mnemonic == "mov" and operands == "r13,r14":
                frame_bases[start] = local_bytes + 8
                break
            if mnemonic in {"bra", "braf", "jmp", "rts"}:
                break
    incoming: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for launch in result:
        if "target" in launch:
            incoming[launch["target"]].append(launch)

    def parameter_targets(
        function: int,
        parameter: int,
        visited: frozenset[tuple[int, int]] = frozenset(),
    ) -> set[int] | None:
        key = (function, parameter)
        if key in visited or not incoming.get(function):
            return None
        targets: set[int] = set()
        for launch in incoming[function]:
            if parameter >= len(launch["arguments"]):
                return None
            argument = launch["arguments"][parameter]
            if argument.get("kind") == "function-pointer":
                value = argument.get("value")
                if value not in start_set:
                    return None
                targets.add(value)
                continue
            if argument.get("kind") != "frame-field":
                return None
            base = frame_bases.get(launch["source"])
            offset = argument.get("offset")
            if (
                not isinstance(base, int)
                or not isinstance(offset, int)
                or offset < base
                or (offset - base) % 4
            ):
                return None
            inherited = parameter_targets(
                launch["source"],
                (offset - base) // 4,
                visited | {key},
            )
            if not inherited:
                return None
            targets.update(inherited)
        return targets or None

    for launch, target_source in pending:
        base = frame_bases.get(launch["source"])
        offset = target_source.get("offset")
        if (
            target_source.get("kind") != "frame-field"
            or not isinstance(base, int)
            or not isinstance(offset, int)
            or offset < base
            or (offset - base) % 4
        ):
            continue
        parameter = (offset - base) // 4
        targets = parameter_targets(launch["source"], parameter)
        if not targets:
            continue
        ordered_targets = sorted(targets)
        launch.update({
            "targetSource": {
                "kind": "propagated-coroutine-function-pointer",
                "frameOffset": offset,
                "parameterIndex": parameter,
            },
            "targetFileOffsets": [hx(value) for value in ordered_targets],
            "targetTable": [
                {
                    "nativeValue": value,
                    "targetFileOffset": hx(value),
                }
                for value in ordered_targets
            ],
        })
        result.append(launch)
    return result


def launch_paths(
    target: int,
    edges: Sequence[dict[str, int]],
    launches: Sequence[dict[str, int]],
    initial_target: int,
    *,
    maximum_paths: int = 32,
) -> list[dict[str, Any]]:
    incoming: dict[int, list[dict[str, int]]] = defaultdict(list)
    for edge in edges:
        incoming[edge["target"]].append(edge)
    launch_by_target: dict[int, list[dict[str, int]]] = defaultdict(list)
    for launch in launches:
        targets = (
            [launch["target"]]
            if "target" in launch
            else [
                int(value, 16)
                for value in launch.get("targetFileOffsets", [])
            ]
        )
        for launch_target in targets:
            launch_by_target[launch_target].append(launch)

    result = []
    queue = deque([(target, [])])
    visited_depth: dict[int, int] = {target: 0}
    while queue and len(result) < maximum_paths:
        node, reversed_edges = queue.popleft()
        if node == initial_target:
            result.append({
                "rootKind": "scn3-initial-entry",
                "initialFunctionFileOffset": hx(initial_target),
                "directCalls": [
                    {
                        "callerFunctionFileOffset": hx(edge["source"]),
                        "callFileOffset": hx(edge["call"]),
                        "calleeFunctionFileOffset": hx(edge["target"]),
                    }
                    for edge in reversed(reversed_edges)
                ],
            })
        for launch in launch_by_target.get(node, []):
            result.append({
                "rootKind": "operation-0x0002-child-coroutine",
                "launchCallFileOffset": hx(launch["call"]),
                "launchSourceFunctionFileOffset": hx(launch["source"]),
                "launchedFunctionFileOffset": hx(node),
                "argumentCount": launch["argumentCount"],
                **(
                    {"targetSource": launch["targetSource"]}
                    if launch.get("targetSource")
                    else {}
                ),
                "directCalls": [
                    {
                        "callerFunctionFileOffset": hx(edge["source"]),
                        "callFileOffset": hx(edge["call"]),
                        "calleeFunctionFileOffset": hx(edge["target"]),
                    }
                    for edge in reversed(reversed_edges)
                ],
            })
        for edge in incoming.get(node, []):
            depth = len(reversed_edges) + 1
            previous = visited_depth.get(edge["source"])
            if previous is not None and previous < depth:
                continue
            visited_depth[edge["source"]] = depth
            queue.append((edge["source"], reversed_edges + [edge]))
    return result


def unresolved_dynamic_roots(
    target: int,
    edges: Sequence[dict[str, int]],
    target_indices: dict[int, int],
) -> list[dict[str, Any]]:
    """Return exact terminal ancestors when no modeled launch reaches target.

    These are useful research boundaries, not inferred launch mechanisms. A
    terminal generated function can be selected by an engine-owned indirect
    scheduler that this extractor does not yet model.
    """
    incoming: dict[int, list[dict[str, int]]] = defaultdict(list)
    for edge in edges:
        incoming[edge["target"]].append(edge)

    roots: set[int] = set()
    queue = deque([target])
    visited = {target}
    while queue:
        node = queue.popleft()
        parents = incoming.get(node, [])
        if not parents:
            roots.add(node)
            continue
        for edge in parents:
            source = edge["source"]
            if source not in visited:
                visited.add(source)
                queue.append(source)
    return [
        {
            "functionFileOffset": hx(root),
            "generatedTargetIndex": target_indices.get(root),
            "status": "unresolved-indirect-entry",
        }
        for root in sorted(roots)
    ]


def mapinfo_report(
    path: Path,
    regions: Sequence[dict[str, Any]],
    objdump: str,
) -> dict[str, Any]:
    data, static_base, dispatch_calls, targets = mapinfo_dispatch_calls(
        path,
        objdump,
    )
    scn3 = data.find(b"SCN3")
    if scn3 < 0 or static_base < 0:
        raise ValueError(f"{path} has no valid SCN3 program")
    code_start = scn3 + 0x30
    initial_target = scn3 + struct.unpack_from("<I", data, scn3 + 0x0C)[0]
    starts = function_starts(data, code_start, static_base)
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_base
    ]
    edges = direct_call_edges(
        instructions,
        starts,
        code_start,
        static_base,
    )
    launches = coroutine_launches(
        instructions,
        dispatch_calls,
        starts,
        scn3,
        code_start,
        static_base,
    )
    target_indices = {
        item.target_offset: item.index for item in targets
    }
    dialogue = []
    for region in regions:
        target = int(region["regionStartFileOffset"], 16)
        paths = launch_paths(
            target,
            edges,
            launches,
            initial_target,
        )
        dialogue.append({
            "targetIndex": region["executableTargetIndex"],
            "targetFileOffset": hx(target),
            "voiceIds": region["voiceIds"],
            "actorTags": region["actorTags"],
            "launchPaths": paths,
            "unresolvedDynamicRoots": (
                []
                if paths
                else unresolved_dynamic_roots(
                    target,
                    edges,
                    target_indices,
                )
            ),
        })
    return {
        "source": str(path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "disc": regions[0]["disc"],
        "area": regions[0]["area"],
        "functionCount": len(starts),
        "generatedTargetCount": len(targets),
        "initialFunctionFileOffset": hx(initial_target),
        "directCallEdgeCount": len(edges),
        "coroutineLaunchCount": len(launches),
        "launchedGeneratedTargetIndices": sorted({
            target_indices[target]
            for launch in launches
            for target in (
                [launch["target"]]
                if "target" in launch
                else [
                    int(value, 16)
                    for value in launch.get("targetFileOffsets", [])
                ]
            )
            if target in target_indices
        }),
        "dialogue": dialogue,
    }


def build_report(
    code_regions: dict[str, Any],
    objdump: str,
) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for region in code_regions["regions"]:
        grouped[region["mapinfo"]].append(region)

    reports = []
    skipped = []
    for source, regions in sorted(grouped.items()):
        path = Path(source)
        if not path.is_file():
            skipped.append({"source": source, "reason": "missing"})
            continue
        try:
            reports.append(mapinfo_report(path, regions, objdump))
        except (OSError, ValueError, struct.error) as error:
            skipped.append({"source": source, "reason": str(error)})

    dialogue = [
        item
        for report in reports
        for item in report["dialogue"]
    ]
    return {
        "schema": "new-yokosuka-dialogue-call-graph-v2",
        "evidenceBoundary": [
            "Direct edges are exact SH-4 bsrf targets between generated function prologues.",
            "Coroutine launches are exact operation-0x0002 calls whose first argument resolves from the SCN3 module base and whose declared argument count matches.",
            "The SCN3 header's initial routine is an exact engine-created root and is tracked separately from operation-0x0002 child launches.",
            "A launch path proves executable control flow, not that every conditional branch on that path is currently true.",
            "Unresolved dynamic calls are omitted rather than guessed.",
            "For regions without a modeled launch path, terminal direct-call ancestors are retained as unresolved dynamic roots rather than promoted to launches.",
        ],
        "summary": {
            "mapinfoCount": len(reports),
            "skippedMapinfoCount": len(skipped),
            "functionCount": sum(
                report["functionCount"] for report in reports
            ),
            "directCallEdgeCount": sum(
                report["directCallEdgeCount"] for report in reports
            ),
            "coroutineLaunchCount": sum(
                report["coroutineLaunchCount"] for report in reports
            ),
            "dialogueRegionCount": len(dialogue),
            "dialogueRegionWithLaunchPathCount": sum(
                bool(item["launchPaths"]) for item in dialogue
            ),
            "dialogueRegionWithUnresolvedDynamicRootCount": sum(
                bool(item["unresolvedDynamicRoots"]) for item in dialogue
            ),
        },
        "skipped": skipped,
        "maps": reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", type=Path, default=DEFAULT_REGIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    report = build_report(
        json.loads(args.regions.read_text()),
        args.objdump,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['dialogueRegionWithLaunchPathCount']}/"
        f"{report['summary']['dialogueRegionCount']} dialogue regions have "
        "a recovered native coroutine-launch path"
    )


if __name__ == "__main__":
    main()
