#!/usr/bin/env python3
"""Build a branch-aware native control-flow index for dialogue paths.

The existing dialogue call graph proves inter-function calls and child
coroutine launches.  This index preserves the intra-function basic blocks,
native operation calls, and directly recognizable scene-context comparisons
for every function on one of those paths.  It is deliberately an index, not a
high-level script translation: conditions whose operation semantics remain
unknown stay as exact native operands instead of receiving guessed meanings.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from bisect import bisect_right
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any, Sequence

from tools.scripting.analyze_dialogue_reachable_sh4 import (
    CALLS,
    DIRECT_BRANCHES,
    INDIRECT_TERMINATORS,
    RETURNS,
    braf_target,
    dialogue_path_functions,
    direct_target,
    reachable_in_function,
)
from tools.scripting.extract_dialogue_call_graph import (
    containing_function,
    coroutine_launches,
    direct_call_edges,
    function_starts,
)
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls
from tools.scripting.extract_dialogue_launch_arguments import (
    frame_argument_base,
    pushed_arguments,
)
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.scripting.native_event_dataflow import (
    frame_field_additions,
    frame_field_constant_writes,
    frame_field_expression_writes,
    frame_field_scene_writes,
    function_return_value,
    indirect_call_json,
    operation_argument,
    operation_json,
    operation_result_comparison,
    operation_result_numeric_transform,
    operation_result_target,
    scene_field_bitwise_writes,
    scene_field_constant_writes,
)
from tools.scripting.native_event_predicates import (
    branch_successors,
    call_result_expression_branch_predicates,
    comparison_branch_outcomes,
    frame_expression_branch_predicates,
    frame_field_comparisons,
    hx,
    scene_field_comparisons,
    signed_immediate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CALL_GRAPH = PROJECT_ROOT / ".disc-work/dialogue/call-graph.json"
DEFAULT_REGIONS = PROJECT_ROOT / ".disc-work/dialogue/code-regions.json"
DEFAULT_OUTPUT = PROJECT_ROOT / ".disc-work/dialogue/control-flow-index.json"
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-control-flow-index.json"
)
DEFAULT_SCRIPTED_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_SCRIPTED_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/scripted-event-control-flow-index.json"
)
DEFAULT_SCRIPTED_MAP_CATALOG = (
    PROJECT_ROOT / "tools/evidence/scripted-world-state-inventory.json"
)


def resolved_source(value: str) -> str:
    path = Path(value)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return str(path.resolve())


def scripted_map_graphs(
    catalog: dict[str, Any],
) -> list[dict[str, Any]]:
    """Adapt the all-disc MAPINFO catalog to the control-flow input shape."""
    maps = []
    identities: set[tuple[int, str, str]] = set()
    for item in catalog.get("maps", []):
        disc = item.get("scene")
        area = item.get("area")
        source = item.get("source")
        if (
            not isinstance(disc, int)
            or disc not in (1, 2, 3)
            or not isinstance(area, str)
            or not area
            or not isinstance(source, str)
            or not source
        ):
            raise ValueError("scripted MAPINFO catalog entry is invalid")
        source = resolved_source(source)
        identity = (disc, area, source)
        if identity in identities:
            raise ValueError(f"duplicate scripted MAPINFO entry: {identity}")
        identities.add(identity)
        maps.append({
            "disc": disc,
            "area": area,
            "source": source,
        })
    maps.sort(key=lambda item: (
        item["disc"],
        item["area"],
        item["source"],
    ))
    if not maps:
        raise ValueError("scripted MAPINFO catalog contains no maps")
    return maps


def attach_dialogue_regions(
    report: dict[str, Any],
    code_regions: dict[str, Any],
) -> int:
    """Join dialogue metadata without repeating expensive SH-4 analysis."""
    by_source: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for region in code_regions.get("regions", []):
        source = resolved_source(region["mapinfo"])
        target = region["regionStartFileOffset"]
        detail = {
            "executableTargetIndex": region["executableTargetIndex"],
            "voiceIds": region["voiceIds"],
            "actorTags": region["actorTags"],
        }
        previous = by_source[source].get(target)
        if previous is not None and previous != detail:
            raise ValueError(
                f"conflicting dialogue metadata for {source}#{target}"
            )
        by_source[source][target] = detail

    joined = 0
    for source_map in report.get("maps", []):
        available = by_source.get(resolved_source(source_map["source"]), {})
        functions = source_map.get(
            "dialoguePathFunctions",
            source_map.get("scriptedEventFunctions", []),
        )
        for function in functions:
            function["dialogueRegion"] = available.get(
                function["fileOffset"]
            )
            joined += function["dialogueRegion"] is not None
    report["summary"]["dialogueRegionCount"] = joined
    return joined


def validate_reusable_scripted_report(
    report: dict[str, Any],
    catalog: dict[str, Any],
) -> None:
    if report.get("schema") != (
        "new-yokosuka-scripted-event-control-flow-index-v1"
    ):
        raise ValueError("reusable scripted-event report has the wrong schema")
    expected = {
        (item["disc"], item["area"], resolved_source(item["source"]))
        for item in scripted_map_graphs(catalog)
    }
    observed = {
        (item["disc"], item["area"], resolved_source(item["source"]))
        for item in report.get("maps", [])
    }
    if observed != expected:
        raise ValueError("reusable scripted-event report map catalog changed")
    for source_map in report["maps"]:
        source = Path(resolved_source(source_map["source"]))
        if hashlib.sha256(source.read_bytes()).hexdigest() != (
            source_map["mapinfoSha256"]
        ):
            raise ValueError(f"reusable MAPINFO source changed: {source}")


def basic_blocks(
    instructions: Sequence[tuple[int, str, str, int | None]],
    start: int,
    end: int,
) -> list[dict[str, Any]]:
    rows = {
        row[0]: row
        for row in instructions
        if start <= row[0] < end
    }
    reached, _unresolved = reachable_in_function(instructions, start, end)
    rows = {
        address: row
        for address, row in rows.items()
        if address in reached
    }
    if not rows:
        return []

    leaders = {start}
    for row in rows.values():
        _address, mnemonic, operands, _literal = row
        if mnemonic in DIRECT_BRANCHES:
            target = direct_target(operands)
            if target in rows:
                leaders.add(target)
            fallthrough = row[0] + (4 if mnemonic.endswith(".s") else 2)
            if mnemonic in {"bf", "bt", "bf.s", "bt.s"} and fallthrough in rows:
                leaders.add(fallthrough)
        elif mnemonic == "braf":
            target = braf_target(row[0], rows)
            if target in rows:
                leaders.add(target)
        elif mnemonic in CALLS:
            fallthrough = row[0] + 4
            if fallthrough in rows:
                leaders.add(fallthrough)

    ordered = sorted(rows)
    ordered_leaders = sorted(item for item in leaders if item in rows)
    leader_set = set(ordered_leaders)
    blocks = []
    cursor = 0
    while cursor < len(ordered):
        block_start = ordered[cursor]
        if block_start not in leader_set:
            cursor += 1
            continue
        addresses = [block_start]
        cursor += 1
        while cursor < len(ordered):
            address = ordered[cursor]
            if address in leader_set:
                break
            prior = rows[addresses[-1]]
            if (
                prior[1] in DIRECT_BRANCHES
                or prior[1] in INDIRECT_TERMINATORS
                or prior[1] in RETURNS
            ):
                break
            addresses.append(address)
            cursor += 1
        terminal = rows[addresses[-1]]
        block = {
            "startFileOffset": hx(block_start),
            "endFileOffsetExclusive": hx(addresses[-1] + 2),
            "successors": [
                hx(item)
                for item in branch_successors(terminal, rows)
            ],
        }
        if terminal[1] in DIRECT_BRANCHES or terminal[1] == "braf":
            block["terminator"] = {
                "fileOffset": hx(terminal[0]),
                "mnemonic": terminal[1],
                "operands": terminal[2],
            }
        blocks.append(block)
    return blocks


def native_event_functions(
    roots: set[int],
    edges: Sequence[dict[str, Any]],
    launches: Sequence[dict[str, Any]],
    reached_for: Any,
) -> set[int]:
    """Return functions reachable from exact engine/native entry points.

    Calls found in bytes that the owning function cannot execute are excluded
    before graph traversal. This is important because MAPINFO frequently keeps
    alignment data and old code after a real return.
    """

    adjacency: dict[int, set[int]] = defaultdict(set)
    for item in (*edges, *launches):
        source = item["source"]
        if item["call"] in reached_for(source):
            targets = (
                [item["target"]]
                if "target" in item
                else [
                    int(value, 16)
                    for value in item.get("targetFileOffsets", [])
                ]
            )
            adjacency[source].update(targets)
    found: set[int] = set()
    pending = list(roots)
    while pending:
        current = pending.pop()
        if current in found:
            continue
        found.add(current)
        pending.extend(adjacency.get(current, set()) - found)
    return found


def map_index(
    graph: dict[str, Any],
    regions: Sequence[dict[str, Any]],
    objdump: str,
    scope: str = "dialogue",
) -> dict[str, Any]:
    path = Path(graph["source"])
    data, static_base, dispatch_calls, executable_targets = mapinfo_dispatch_calls(
        path,
        objdump,
    )
    scn3, code_start, initial_entry, static_check = scn3_ranges(data)
    if static_base != static_check:
        raise ValueError(f"{path}: conflicting SCN3 static-data offsets")
    starts = function_starts(data, code_start, static_base)
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_base
    ]
    instruction_rows = {
        row[0]: row
        for row in instructions
    }
    instruction_index = {
        row[0]: index
        for index, row in enumerate(instructions)
    }
    instruction_addresses = [row[0] for row in instructions]
    secondary_dispatch_calls = extract_dispatch_calls(
        instructions,
        static_base,
        target_byte_offset=48,
    )
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
        data=data,
        include_dynamic=True,
        executable_targets=executable_targets,
    )
    start_index = {value: index for index, value in enumerate(starts)}
    frame_argument_bases: dict[int, int | None] = {}
    for position, start in enumerate(starts):
        if start not in instruction_index:
            continue
        end = (
            starts[position + 1]
            if position + 1 < len(starts)
            else static_base
        )
        frame_argument_bases[start] = frame_argument_base(
            instructions,
            instruction_index[start],
            bisect_right(instruction_addresses, end - 1),
        )
    reached_cache: dict[int, tuple[set[int], list[dict[str, Any]]]] = {}

    def reached_for(start: int) -> set[int]:
        if start not in start_index:
            return set()
        if start not in reached_cache:
            index = start_index[start]
            end = (
                starts[index + 1]
                if index + 1 < len(starts)
                else static_base
            )
            reached_cache[start] = reachable_in_function(
                instructions,
                start,
                end,
            )
        return reached_cache[start][0]

    if scope == "dialogue":
        path_starts = dialogue_path_functions(graph)
        function_key = "dialoguePathFunctions"
    elif scope == "scripted-events":
        path_starts = native_event_functions(
            {
                initial_entry,
                *(
                    target
                    for launch in launches
                    if launch["call"] in reached_for(launch["source"])
                    for target in (
                        [launch["target"]]
                        if "target" in launch
                        else [
                            int(value, 16)
                            for value in launch.get("targetFileOffsets", [])
                        ]
                    )
                ),
            },
            edges,
            launches,
            reached_for,
        )
        function_key = "scriptedEventFunctions"
    else:
        raise ValueError(f"Unsupported control-flow scope {scope!r}")
    calls_by_function: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for call in dispatch_calls:
        offset = int(call["callFileOffset"], 16)
        owner = containing_function(starts, offset)
        if owner in path_starts:
            operation = operation_json(call, instruction_rows, static_base)
            result_target = operation_result_target(
                instruction_rows,
                offset,
            )
            if result_target is not None:
                operation["resultTarget"] = result_target
            calls_by_function[owner].append(operation)
    secondary_calls_by_function: dict[
        int,
        list[dict[str, Any]],
    ] = defaultdict(list)
    for call in secondary_dispatch_calls:
        offset = int(call["callFileOffset"], 16)
        owner = containing_function(starts, offset)
        if owner in path_starts:
            operation = operation_json(call, instruction_rows, static_base)
            result_target = operation_result_target(
                instruction_rows,
                offset,
            )
            if result_target is not None:
                operation["resultTarget"] = result_target
            secondary_calls_by_function[owner].append(operation)
    edges_by_function: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for edge in edges:
        if edge["source"] in path_starts:
            source_instruction_start = instruction_index[edge["source"]]
            arguments = pushed_arguments(
                instructions,
                instruction_index[edge["call"]],
                source_instruction_start,
                frame_argument_bases.get(edge["source"]),
            )
            item = {
                "callFileOffset": hx(edge["call"]),
                "targetFileOffset": hx(edge["target"]),
                "arguments": arguments or [],
                "argumentRecovery": (
                    "exact-stack-cleanup"
                    if arguments is not None
                    else "unresolved"
                ),
            }
            result_target = operation_result_target(
                instruction_rows,
                edge["call"],
            )
            if result_target is not None:
                item["resultTarget"] = result_target
            result_comparison = operation_result_comparison(
                instruction_rows,
                edge["call"],
            )
            if result_comparison is not None:
                item["resultComparison"] = result_comparison
            edges_by_function[edge["source"]].append(item)
    launches_by_function: dict[int, list[dict[str, Any]]] = defaultdict(list)
    operation_by_call = {
        operation["callFileOffset"]: operation
        for operations in calls_by_function.values()
        for operation in operations
    }
    for launch in launches:
        if launch["source"] in path_starts:
            call_offset = hx(launch["call"])
            operation = operation_by_call.get(call_offset)
            item = {
                "callFileOffset": call_offset,
                "argumentCount": launch["argumentCount"],
                "arguments": launch.get("arguments", (
                    operation["arguments"][2:]
                    if operation is not None
                    else []
                )),
            }
            if launch.get("argumentCountRecovery"):
                item["argumentCountRecovery"] = launch[
                    "argumentCountRecovery"
                ]
            if "target" in launch:
                item["targetFileOffset"] = hx(launch["target"])
            else:
                item["targetFileOffsets"] = launch["targetFileOffsets"]
                item["targetSource"] = launch["targetSource"]
                item["targetTable"] = launch["targetTable"]
            if launch.get("implicitArgumentCount"):
                item["implicitArgumentCount"] = launch[
                    "implicitArgumentCount"
                ]
            result_target = operation_result_target(
                instruction_rows,
                launch["call"],
            )
            if result_target is not None:
                item["resultTarget"] = result_target
            launches_by_function[launch["source"]].append(item)
    indirect_calls_by_function: dict[int, list[dict[str, Any]]] = defaultdict(
        list
    )
    for address, mnemonic, operands, _literal in instructions:
        if mnemonic != "jsr":
            continue
        owner = containing_function(starts, address)
        if owner in path_starts:
            indirect_calls_by_function[owner].append(
                indirect_call_json(
                    address,
                    operands,
                    instruction_rows,
                    static_base,
                )
            )
    dialogue_by_target = {
        int(region["regionStartFileOffset"], 16): {
            "executableTargetIndex": region["executableTargetIndex"],
            "voiceIds": region["voiceIds"],
            "actorTags": region["actorTags"],
        }
        for region in regions
    }

    functions = []
    for start in sorted(path_starts):
        index = start_index.get(start)
        if index is None:
            continue
        end = starts[index + 1] if index + 1 < len(starts) else static_base
        reached, unresolved = reached_cache.get(start) or (
            reachable_in_function(instructions, start, end)
        )
        reachable_operations = [
            operation
            for operation in calls_by_function.get(start, [])
            if int(operation["callFileOffset"], 16) in reached
        ]
        reachable_secondary_operations = [
            operation
            for operation in secondary_calls_by_function.get(start, [])
            if int(operation["callFileOffset"], 16) in reached
        ]
        reachable_calls = [
            call
            for call in edges_by_function.get(start, [])
            if int(call["callFileOffset"], 16) in reached
        ]
        reachable_launches = [
            launch
            for launch in launches_by_function.get(start, [])
            if int(launch["callFileOffset"], 16) in reached
        ]
        represented_call_offsets = {
            item["callFileOffset"]
            for item in (
                *reachable_operations,
                *reachable_secondary_operations,
                *reachable_calls,
                *reachable_launches,
            )
        }
        reachable_indirect_calls = [
            call
            for call in indirect_calls_by_function.get(start, [])
            if (
                int(call["callFileOffset"], 16) in reached
                and call["callFileOffset"] not in represented_call_offsets
            )
        ]
        function_rows = {
            address: row
            for address, row in instruction_rows.items()
            if start <= address < end
        }
        function_blocks = basic_blocks(instructions, start, end)
        compound_call_comparisons = call_result_expression_branch_predicates(
            instructions,
            function_blocks,
            reached,
        )
        represented_actions = {
            item["callFileOffset"]: item
            for item in (
                *reachable_operations,
                *reachable_secondary_operations,
                *reachable_calls,
            )
        }
        for comparison in compound_call_comparisons:
            owner = represented_actions.get(
                comparison["sourceCallFileOffset"]
            )
            if owner is not None and "resultComparison" not in owner:
                owner["resultComparison"] = {
                    key: value
                    for key, value in comparison.items()
                    if key != "sourceCallFileOffset"
                }
        frame_expressions = frame_field_expression_writes(
            function_rows,
            reached,
        )
        covered_frame_store_offsets = {
            mutation["callFileOffset"] for mutation in frame_expressions
        }
        frame_additions = [
            mutation
            for mutation in frame_field_additions(function_rows, reached)
            if mutation["callFileOffset"] not in covered_frame_store_offsets
        ]
        functions.append({
            "fileOffset": hx(start),
            "endFileOffsetExclusive": hx(end),
            "frameArgumentBase": frame_argument_bases.get(start),
            "reachableInstructionCount": len(reached),
            "basicBlocks": function_blocks,
            "sceneFieldComparisons": scene_field_comparisons(
                instructions,
                start,
                end,
                reached,
            ),
            "frameFieldComparisons": [
                *frame_field_comparisons(
                    instructions,
                    start,
                    end,
                    reached,
                ),
                *frame_expression_branch_predicates(
                    instructions,
                    function_blocks,
                    reached,
                ),
            ],
            "frameFieldMutations": [
                *frame_additions,
                *frame_field_constant_writes(
                    function_rows,
                    static_base,
                    reached,
                ),
                *frame_expressions,
                *frame_field_scene_writes(function_rows, reached),
                *scene_field_bitwise_writes(function_rows, reached),
                *scene_field_constant_writes(
                    function_rows,
                    static_base,
                    reached,
                ),
            ],
            "returnValue": function_return_value(function_rows, reached),
            "nativeOperations": sorted(
                reachable_operations,
                key=lambda item: int(item["callFileOffset"], 16),
            ),
            "secondaryNativeOperations": sorted(
                reachable_secondary_operations,
                key=lambda item: int(item["callFileOffset"], 16),
            ),
            "directCalls": sorted(
                reachable_calls,
                key=lambda item: int(item["callFileOffset"], 16),
            ),
            "childCoroutineLaunches": sorted(
                reachable_launches,
                key=lambda item: int(item["callFileOffset"], 16),
            ),
            "indirectCalls": sorted(
                reachable_indirect_calls,
                key=lambda item: int(item["callFileOffset"], 16),
            ),
            "dialogueRegion": dialogue_by_target.get(start),
            "unresolvedControlTransfers": unresolved,
        })

    return {
        "disc": graph["disc"],
        "area": graph["area"],
        "source": str(path),
        "mapinfoSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": hx(scn3),
        "initialFunctionFileOffset": hx(initial_entry),
        function_key: functions,
    }


def _map_index_job(
    job: tuple[dict[str, Any], list[dict[str, Any]], str, str],
) -> dict[str, Any]:
    """Process-pool entry point for one independent MAPINFO program."""
    graph, regions, objdump, scope = job
    return map_index(graph, regions, objdump, scope)


def map_indexes(
    map_graphs: list[dict[str, Any]],
    regions_by_source: dict[str, list[dict[str, Any]]],
    objdump: str,
    scope: str,
    workers: int,
) -> list[dict[str, Any]]:
    if not isinstance(workers, int) or workers < 1:
        raise ValueError("control-flow worker count must be positive")
    jobs = [
        (
            graph,
            regions_by_source.get(resolved_source(graph["source"]), []),
            objdump,
            scope,
        )
        for graph in map_graphs
    ]
    if workers == 1 or len(jobs) < 2:
        return [_map_index_job(job) for job in jobs]
    # executor.map preserves input order, keeping generated JSON byte-stable
    # regardless of which MAPINFO worker finishes first.
    with ProcessPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(_map_index_job, jobs, chunksize=1))


def build_report(
    call_graph: dict[str, Any],
    code_regions: dict[str, Any],
    objdump: str,
    scope: str = "dialogue",
    scripted_map_catalog: dict[str, Any] | None = None,
    workers: int = 1,
) -> dict[str, Any]:
    regions_by_source: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for region in code_regions["regions"]:
        regions_by_source[resolved_source(region["mapinfo"])].append(region)
    map_graphs = (
        scripted_map_graphs(scripted_map_catalog)
        if scope == "scripted-events" and scripted_map_catalog is not None
        else call_graph["maps"]
    )
    maps = map_indexes(
        map_graphs,
        regions_by_source,
        objdump,
        scope,
        workers,
    )
    functions = [
        function
        for item in maps
        for function in item[
            "dialoguePathFunctions"
            if scope == "dialogue"
            else "scriptedEventFunctions"
        ]
    ]
    comparisons = [
        comparison
        for function in functions
        for comparison in function["sceneFieldComparisons"]
    ]
    frame_comparisons = [
        comparison
        for function in functions
        for comparison in function["frameFieldComparisons"]
    ]
    operations = [
        operation
        for function in functions
        for operation in function["nativeOperations"]
    ]
    indirect_calls = [
        call
        for function in functions
        for call in function["indirectCalls"]
    ]
    indirect_sources = [
        source
        for call in indirect_calls
        if (source := call.get("targetSource")) is not None
    ]
    return {
        "schema": (
            "new-yokosuka-dialogue-control-flow-index-v1"
            if scope == "dialogue"
            else "new-yokosuka-scripted-event-control-flow-index-v1"
        ),
        "evidenceBoundary": [
            (
                "Functions are included only when the exact dialogue call "
                "graph places them on a recovered dialogue launch/call path."
                if scope == "dialogue"
                else
                "Functions are included only when reachable from the SCN3 "
                "initial routine or an exact operation-0x0002 child-coroutine "
                "target by exact direct calls or further child launches."
            ),
            "Basic-block successors model direct SH-4 branches, compiler literal-relative BRAF targets, delay-slot fallthrough, and returns.",
            "Native operation calls and child-coroutine launches retain their exact recovered operands and file offsets.",
            "Reachable indirect calls not represented by a recovered operation, direct call, or child launch remain explicit.",
            "Scene-field comparisons are direct r9-relative compiler forms. They do not imply that a comparison controls every later call in the same function.",
            "Unknown native operation meanings and unresolved indirect transfers remain numeric and explicit rather than being guessed.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            (
                "dialoguePathFunctionCount"
                if scope == "dialogue"
                else "scriptedEventFunctionCount"
            ): len(functions),
            "basicBlockCount": sum(
                len(function["basicBlocks"])
                for function in functions
            ),
            "sceneFieldComparisonCount": len(comparisons),
            "sceneFieldOffsets": dict(sorted(Counter(
                item["fieldOffset"] for item in comparisons
            ).items())),
            "frameFieldComparisonCount": len(frame_comparisons),
            "frameExpressionComparisonCount": sum(
                item.get("comparison") == "frame-expression"
                for item in frame_comparisons
            ),
            "frameFieldOffsets": dict(sorted(Counter(
                str(item["fieldOffset"])
                for item in frame_comparisons
                if "fieldOffset" in item
            ).items())),
            "nativeOperationCallCount": len(operations),
            "nativeOperationIds": dict(sorted(Counter(
                item["operationHex"] for item in operations
            ).items())),
            "directCallCount": sum(
                len(function["directCalls"])
                for function in functions
            ),
            "childCoroutineLaunchCount": sum(
                len(function["childCoroutineLaunches"])
                for function in functions
            ),
            "unresolvedIndirectCallCount": sum(
                len(function["indirectCalls"])
                for function in functions
            ),
            "indirectCallTargetSourceCount": len(indirect_sources),
            "indirectCallBaseRegisterSlots": dict(sorted(Counter(
                (
                    f"{item['baseRegister']}+"
                    f"0x{item['byteOffset']:x}"
                )
                for item in indirect_sources
                if item["kind"] == "base-register-slot"
            ).items())),
            "dialogueRegionCount": sum(
                function["dialogueRegion"] is not None
                for function in functions
            ),
            "unresolvedControlTransferCount": sum(
                len(function["unresolvedControlTransfers"])
                for function in functions
            ),
        },
        "maps": maps,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": (
            "new-yokosuka-dialogue-control-flow-summary-v1"
            if report["schema"]
            == "new-yokosuka-dialogue-control-flow-index-v1"
            else "new-yokosuka-scripted-event-control-flow-summary-v1"
        ),
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "fullReport": (
            ".disc-work/dialogue/control-flow-index.json"
            if report["schema"]
            == "new-yokosuka-dialogue-control-flow-index-v1"
            else
            ".disc-work/dialogue/scripted-event-control-flow-index.json"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--call-graph", type=Path, default=DEFAULT_CALL_GRAPH)
    parser.add_argument("--regions", type=Path, default=DEFAULT_REGIONS)
    parser.add_argument(
        "--scope",
        choices=("dialogue", "scripted-events"),
        default="dialogue",
    )
    parser.add_argument("--output", type=Path)
    parser.add_argument("--summary-output", type=Path)
    parser.add_argument(
        "--scripted-map-catalog",
        type=Path,
        default=DEFAULT_SCRIPTED_MAP_CATALOG,
        help="all-disc MAPINFO catalog used by scripted-events scope",
    )
    parser.add_argument(
        "--reuse-output",
        action="store_true",
        help=(
            "reuse hash-validated scripted control flow and refresh only "
            "dialogue-region joins"
        ),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="parallel MAPINFO worker processes (output remains deterministic)",
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    output = args.output or (
        DEFAULT_OUTPUT
        if args.scope == "dialogue"
        else DEFAULT_SCRIPTED_OUTPUT
    )
    summary_output = args.summary_output or (
        DEFAULT_SUMMARY
        if args.scope == "dialogue"
        else DEFAULT_SCRIPTED_SUMMARY
    )
    call_graph = (
        json.loads(args.call_graph.read_text())
        if args.call_graph.is_file()
        else {"maps": []}
    )
    code_regions = (
        json.loads(args.regions.read_text())
        if args.regions.is_file()
        else {"regions": []}
    )
    scripted_map_catalog = (
        json.loads(args.scripted_map_catalog.read_text())
        if args.scope == "scripted-events"
        else None
    )
    if args.reuse_output:
        if args.scope != "scripted-events" or scripted_map_catalog is None:
            parser.error("--reuse-output is supported only for scripted-events")
        if not output.is_file():
            parser.error(f"--reuse-output requires existing {output}")
        report = json.loads(output.read_text())
        validate_reusable_scripted_report(report, scripted_map_catalog)
        attach_dialogue_regions(report, code_regions)
    else:
        report = build_report(
            call_graph,
            code_regions,
            args.objdump,
            args.scope,
            scripted_map_catalog,
            args.workers,
        )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    summary_output.parent.mkdir(parents=True, exist_ok=True)
    summary_output.write_text(
        json.dumps(summary_report(report), indent=2) + "\n"
    )
    print(
        f"Wrote {output}: "
        f"{sum(1 for item in report['maps'] for _function in item.get('dialoguePathFunctions', item.get('scriptedEventFunctions', [])))} functions, "
        f"{report['summary']['basicBlockCount']} blocks, "
        f"{report['summary']['sceneFieldComparisonCount']} scene comparisons"
    )


if __name__ == "__main__":
    main()
