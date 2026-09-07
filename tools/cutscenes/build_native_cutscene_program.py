#!/usr/bin/env python3
"""Build one lossless native cutscene owner-program closure.

The large native event IR remains a reproducible local research artifact. This
tool selects one exact entry and emits the complete static closure consumed by
the cutscene compiler. It does not use the old reviewed-route manifest or
playlist schema, and it retains unresolved operations as explicit blockers.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from tools.cutscenes.native_cutscene_dependencies import (
    action_target_file_offsets,
    operation_013c_archive_pairs,
    operation_013c_static_record_pairs,
    operation_013e_static_bindings,
    static_strings,
    static_vectors,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_CATALOG = (
    PROJECT_ROOT / "play/data/events/nativeScriptedSceneCatalog.generated.json"
)


def source_map(event_ir: dict[str, Any], disc: int, area: str) -> dict[str, Any]:
    matches = [
        item for item in event_ir["maps"]
        if item["disc"] == disc and item["area"] == area
    ]
    if len(matches) != 1:
        raise ValueError(
            f"expected one disc {disc} {area} native event map; found {len(matches)}"
        )
    return matches[0]


def catalog_entry(
    catalog: dict[str, Any],
    disc: int,
    area: str,
    mapinfo_sha256: str,
    entry_function: str,
) -> dict[str, Any] | None:
    scene = next((
        item for item in catalog["maps"]
        if item["disc"] == disc
        and item["area"] == area
        and item["mapinfoSha256"] == mapinfo_sha256
    ), None)
    if scene is None:
        return None
    return next((
        item for item in scene["entryCandidates"]
        if item["entryFunction"] == entry_function
    ), None)


def unresolved_operations(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for action in actions:
        if (
            action.get("kind") == "engineOperation"
            and action.get("adapterStatus") != "proven"
        ):
            groups[action["operationHex"]].append(action)
    return [
        {
            "kind": "engine-operation-unresolved",
            "operationHex": operation,
            "callFileOffsets": [item["callFileOffset"] for item in calls],
            "knownOperationFamilies": sorted({
                family
                for item in calls
                for family in item.get("knownOperationFamilies", [])
            }),
        }
        for operation, calls in sorted(groups.items())
    ]


def first_unresolved_operation(
    functions: list[dict[str, Any]],
    blockers: list[dict[str, Any]],
) -> dict[str, Any] | None:
    candidates = [
        (int(action["callFileOffset"], 16), function["id"], action)
        for function in functions
        for block in function.get("blocks", [])
        for action in block.get("actions", [])
        if action.get("kind") == "engineOperation"
        and action.get("adapterStatus") != "proven"
    ]
    if not candidates:
        return None
    _, function_id, action = min(candidates)
    blocker = next(
        item for item in blockers
        if item["operationHex"] == action["operationHex"]
    )
    return {
        "kind": "engineOperation",
        "identity": action["operationHex"],
        "callSiteCount": len(blocker["callFileOffsets"]),
        "firstFunction": function_id,
        "firstCallFileOffset": action["callFileOffset"],
    }


def embedded_auth_resources(mapinfo: bytes) -> list[dict[str, Any]]:
    """Index exact embedded TRCK resources in native registration order."""
    resources = []
    offset = 0
    while True:
        offset = mapinfo.find(b"TRCK", offset)
        if offset < 0:
            break
        if offset + 12 <= len(mapinfo):
            # TRCK's size word is the complete chunk length, including its
            # eight-byte tag/size header (unlike nested ASEQ chunks).
            byte_length = struct.unpack_from("<I", mapinfo, offset + 4)[0]
            end = offset + byte_length
            if end <= len(mapinfo) and mapinfo[offset + 8:offset + 12] == b"ASEQ":
                paths = []
                astr_offset = mapinfo.find(b"ASTR", offset + 12, end)
                if astr_offset >= 0 and astr_offset + 8 <= end:
                    # ASTR follows the same AUTH chunk convention: its size
                    # word includes the chunk header.
                    astr_length = struct.unpack_from("<I", mapinfo, astr_offset + 4)[0]
                    astr_end = astr_offset + astr_length
                    if astr_end <= end:
                        for part in mapinfo[astr_offset + 8:astr_end].split(b"\0"):
                            try:
                                value = part.decode("ascii")
                            except UnicodeDecodeError:
                                continue
                            if value.startswith("/"):
                                paths.append(value)
                resources.append({
                    "slot": len(resources),
                    "sourceFileOffset": f"0x{offset:x}",
                    "byteLength": byte_length,
                    "sha256": hashlib.sha256(mapinfo[offset:end]).hexdigest(),
                    "authoredPaths": paths,
                })
        offset += 4
    return resources


def _activity_start(action: dict[str, Any]) -> int | None:
    if action.get("operationHex") != "0x0050":
        return None
    arguments = action.get("arguments", [])
    if not arguments or arguments[0].get("kind") != "constant":
        return None
    value = arguments[0].get("value")
    return value if isinstance(value, int) and 0 <= value < 0x80000000 else None


def _actions_with_owner(function: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"functionId": function["id"], "blockId": block["id"], **action}
        for block in function.get("blocks", [])
        for action in block.get("actions", [])
    ]


def auth_resource_family_selection(
    functions: list[dict[str, Any]],
    entry_function: str,
    mapinfo: bytes,
    path_token: str,
) -> dict[str, Any]:
    """Recover one embedded AUTH family from its native owner call graph.

    MAPINFO assigns embedded TRCK slots in registration order. The family is
    selected from authored ASTR paths, while playback order comes from the
    owner's direct stage calls and each stage's native operation-0x0050 sites.
    No playlist order is accepted as input.
    """
    resources = embedded_auth_resources(mapinfo)
    matching = [
        resource for resource in resources
        if any(path_token in path for path in resource["authoredPaths"])
    ]
    if not matching:
        raise ValueError(f"AUTH resource family {path_token!r} is unavailable")
    runs: list[list[dict[str, Any]]] = []
    for resource in matching:
        if not runs or resource["slot"] != runs[-1][-1]["slot"] + 1:
            runs.append([])
        runs[-1].append(resource)
    longest = max(len(run) for run in runs)
    selected_runs = [run for run in runs if len(run) == longest]
    if len(selected_runs) != 1:
        raise ValueError(
            f"AUTH resource family {path_token!r} has ambiguous contiguous runs"
        )
    selected = selected_runs[0]
    selected_slots = {resource["slot"] for resource in selected}
    by_slot = {resource["slot"]: resource for resource in resources}
    selected_calls: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for function in functions:
        for action in _actions_with_owner(function):
            slot = _activity_start(action)
            if slot in selected_slots:
                selected_calls[function["id"]].append({
                    "slot": slot,
                    "callFileOffset": action["callFileOffset"],
                    "functionId": function["id"],
                    "blockId": action["blockId"],
                    "resource": {
                        key: by_slot[slot][key]
                        for key in ("sourceFileOffset", "byteLength", "sha256")
                    },
                })
    missing = sorted(selected_slots - {
        call["slot"] for calls in selected_calls.values() for call in calls
    })
    if missing:
        raise ValueError(f"AUTH family slots have no exact owner call: {missing}")
    duplicates = sorted(
        slot for slot in selected_slots
        if sum(call["slot"] == slot for calls in selected_calls.values() for call in calls) != 1
    )
    if duplicates:
        raise ValueError(f"AUTH family slots do not have one owner call: {duplicates}")

    owner = next(function for function in functions if function["id"] == entry_function)
    stage_calls = []
    for action in _actions_with_owner(owner):
        if action.get("kind") != "directCall":
            continue
        target = action.get("targetFileOffset")
        if target in selected_calls:
            stage_calls.append({
                "functionId": target,
                "ownerCallFileOffset": action["callFileOffset"],
                "ownerBlockId": action["blockId"],
            })
    if {stage["functionId"] for stage in stage_calls} != set(selected_calls):
        raise ValueError("AUTH family stages are not exact direct children of its owner")
    if len(stage_calls) != len(selected_calls):
        raise ValueError("AUTH family owner calls a stage more than once")
    stage_calls.sort(key=lambda stage: int(stage["ownerCallFileOffset"], 16))
    owner_calls = []
    for stage in stage_calls:
        calls = sorted(
            selected_calls[stage["functionId"]],
            key=lambda call: int(call["callFileOffset"], 16),
        )
        stage["activityCallCount"] = len(calls)
        owner_calls.extend(calls)

    completion_stage = stage_calls[-1]
    last_selected_offset = max(
        int(call["callFileOffset"], 16)
        for call in selected_calls[completion_stage["functionId"]]
    )
    completion_function = next(
        function for function in functions
        if function["id"] == completion_stage["functionId"]
    )
    following = sorted((
        {
            "slot": slot,
            "callFileOffset": action["callFileOffset"],
            "functionId": completion_function["id"],
            "blockId": action["blockId"],
            "resource": {
                key: by_slot[slot][key]
                for key in ("sourceFileOffset", "byteLength", "sha256")
            } if slot in by_slot else None,
        }
        for action in _actions_with_owner(completion_function)
        if (slot := _activity_start(action)) is not None
        and int(action["callFileOffset"], 16) > last_selected_offset
        and slot not in selected_slots
    ), key=lambda call: int(call["callFileOffset"], 16))
    if not following:
        raise ValueError("AUTH family has no exact following resource boundary")
    boundary = following[0]
    return {
        "selectionKind": "embedded-authored-path-family",
        "authoredPathToken": path_token,
        "embeddedResourceCount": len(resources),
        "matchingResourceCount": len(matching),
        "selectedResourceCount": len(selected),
        "selectedSlots": sorted(selected_slots),
        "stages": stage_calls,
        "ownerCalls": owner_calls,
        "completionBoundary": {
            "kind": "before-first-following-non-family-activity",
            **boundary,
            "ownerReturnBoundary": {
                "functionId": entry_function,
                "blockId": completion_stage["ownerBlockId"],
                "callFileOffset": completion_stage["ownerCallFileOffset"],
                "completedStageFunction": completion_stage["functionId"],
            },
        },
    }


def _reachable_blocks(
    function: dict[str, Any],
    *,
    stop_block: str | None = None,
    excluded_block: str | None = None,
) -> set[str]:
    blocks = {block["id"]: block for block in function.get("blocks", [])}
    pending = [function["entryBlock"]]
    reached = set()
    while pending:
        block_id = pending.pop()
        if block_id in reached or block_id == excluded_block or block_id not in blocks:
            continue
        reached.add(block_id)
        if block_id == stop_block:
            continue
        pending.extend(blocks[block_id].get("successors", []))
    return reached


def slice_auth_resource_family_program(
    functions: list[dict[str, Any]],
    entry_function: str,
    selection: dict[str, Any],
) -> tuple[list[dict[str, Any]], Counter[str]]:
    """Terminate a room owner at the exact next-resource boundary."""
    by_id = {function["id"]: copy.deepcopy(function) for function in functions}
    boundary = selection["completionBoundary"]
    stage = by_id[boundary["functionId"]]
    stage_reached = _reachable_blocks(stage, excluded_block=boundary["blockId"])
    stage["blocks"] = [block for block in stage["blocks"] if block["id"] in stage_reached]
    for block in stage["blocks"]:
        block["successors"] = [value for value in block.get("successors", []) if value in stage_reached]

    owner_boundary = boundary["ownerReturnBoundary"]
    owner = by_id[entry_function]
    owner_reached = _reachable_blocks(owner, stop_block=owner_boundary["blockId"])
    owner["blocks"] = [block for block in owner["blocks"] if block["id"] in owner_reached]
    for block in owner["blocks"]:
        block["successors"] = (
            [] if block["id"] == owner_boundary["blockId"]
            else [value for value in block.get("successors", []) if value in owner_reached]
        )

    reached_functions = set()
    pending = [entry_function]
    edge_kinds = Counter()
    while pending:
        function_id = pending.pop()
        if function_id in reached_functions:
            continue
        reached_functions.add(function_id)
        for action in _actions_with_owner(by_id[function_id]):
            if action.get("kind") not in {"directCall", "childCoroutineLaunch"}:
                continue
            for target in action_target_file_offsets(action):
                if target in by_id:
                    edge_kinds[action["kind"]] += 1
                    pending.append(target)
    result = []
    for function in functions:
        if function["id"] not in reached_functions:
            continue
        compiled = by_id[function["id"]]
        compiled["specializedReachableBlockCount"] = len(compiled.get("blocks", []))
        result.append(compiled)
    return result, edge_kinds


def exact_entry_invocation(
    native_map: dict[str, Any],
    entry_function: str,
) -> dict[str, Any] | None:
    entry = next(
        function
        for function in native_map["functions"]
        if function["id"] == entry_function
    )
    launch_sites = [
        {
            "sourceFunction": function["id"],
            "callFileOffset": action["callFileOffset"],
            "arguments": action.get("arguments", []),
        }
        for function in native_map["functions"]
        for block in function.get("blocks", [])
        for action in block.get("actions", [])
        if (
            action.get("kind") == "childCoroutineLaunch"
            and action.get("targetFileOffset") == entry_function
        )
    ]
    if not launch_sites:
        return None
    if len(launch_sites) != 1:
        raise ValueError(
            f"{entry_function}: expected one exact coroutine launch; "
            f"found {len(launch_sites)}"
        )
    frame_base = entry.get("frameArgumentBase")
    if not isinstance(frame_base, int):
        raise ValueError(f"{entry_function}: frame argument base is unavailable")
    launch = launch_sites[0]
    fields: dict[str, int] = {}
    for index, argument in enumerate(launch["arguments"]):
        if argument.get("kind") not in {
            "constant", "static-pointer", "function-pointer",
        } or not isinstance(argument.get("value"), int):
            raise ValueError(
                f"{entry_function}: launch argument {index} is not exact"
            )
        fields[str(frame_base + index * 4)] = argument["value"] & 0xffffffff
    return {
        **launch,
        "frameArgumentBase": frame_base,
        "initialFrameFields": fields,
    }


def expression_value(expression: dict[str, Any], fields: dict[int, int]) -> int | None:
    kind = expression.get("kind")
    if kind == "constant" and isinstance(expression.get("value"), int):
        return expression["value"] & 0xffffffff
    if kind == "frame-field":
        value = fields.get(expression.get("offset"))
        if value is None:
            return None
        width = expression.get("width", 4)
        mask = 0xffffffff if width == 4 else (1 << (width * 8)) - 1
        value &= mask
        if expression.get("signedLoad") and width < 4:
            sign = 1 << (width * 8 - 1)
            if value & sign:
                value |= ~mask
        return value & 0xffffffff
    binary = {
        "add": lambda left, right: left + right,
        "subtract": lambda left, right: left - right,
        "bitwise-and": lambda left, right: left & right,
        "multiply": lambda left, right: left * right,
    }.get(kind)
    if binary is not None:
        left = expression_value(expression.get("left", {}), fields)
        right = expression_value(expression.get("right", {}), fields)
        return None if left is None or right is None else binary(left, right) & 0xffffffff
    if kind == "arithmetic-shift":
        value = expression_value(expression.get("operand", {}), fields)
        count = expression.get("count")
        if value is None or not isinstance(count, int):
            return None
        if count < 0:
            return ((value if value < 0x80000000 else value - 0x100000000) >> -count) & 0xffffffff
        return (value << count) & 0xffffffff
    return None


def merge_fields(current: dict[int, int] | None, incoming: dict[int, int]) -> tuple[dict[int, int], bool]:
    if current is None:
        return dict(incoming), True
    merged = {
        offset: value
        for offset, value in current.items()
        if incoming.get(offset) == value
    }
    return merged, merged != current


def apply_frame_actions(
    block: dict[str, Any],
    incoming: dict[int, int],
) -> dict[int, int]:
    fields = dict(incoming)
    for action in block.get("actions", []):
        kind = action.get("kind")
        offset = action.get("offset")
        if kind == "frameFieldWrite":
            width = action.get("width", 4)
            mask = 0xffffffff if width == 4 else (1 << (width * 8)) - 1
            fields[offset] = action["value"] & mask
        elif kind == "frameFieldAdd":
            if offset in fields:
                fields[offset] = (fields[offset] + action["value"]) & 0xffffffff
        elif kind == "frameFieldExpressionWrite":
            value = expression_value(action.get("expression", {}), fields)
            if value is None:
                fields.pop(offset, None)
            else:
                width = action.get("width", 4)
                mask = 0xffffffff if width == 4 else (1 << (width * 8)) - 1
                fields[offset] = value & mask
        result_target = action.get("resultTarget")
        if result_target and result_target.get("kind") == "frameField":
            fields.pop(result_target.get("offset"), None)
    return fields


def exact_frame_successors(
    block: dict[str, Any],
    fields: dict[int, int],
) -> list[str]:
    branch_offset = (block.get("terminator") or {}).get("fileOffset")
    matches = [
        comparison
        for comparison in block.get("frameFieldComparisons", [])
        if comparison.get("resolvedBranch", {}).get("branchFileOffset") == branch_offset
    ]
    if len(matches) != 1:
        return block.get("successors", [])
    comparison = matches[0]
    value = fields.get(comparison.get("fieldOffset"))
    constant = comparison.get("constant")
    if value is None or not isinstance(constant, int):
        return block.get("successors", [])
    width = comparison.get("loadWidth", 4)
    mask = 0xffffffff if width == 4 else (1 << (width * 8)) - 1
    left = value & mask
    right = constant & mask
    if comparison.get("signedLoad") and width < 4:
        sign = 1 << (width * 8 - 1)
        left = left - (mask + 1) if left & sign else left
        right = right - (mask + 1) if right & sign else right
    operation = comparison.get("comparison")
    matched = {
        "cmp/eq": left == right,
        "cmp/ge": left >= right,
        "cmp/gt": left > right,
        "cmp/hs": (left & mask) >= (right & mask),
        "cmp/hi": (left & mask) > (right & mask),
    }.get(operation)
    if matched is None:
        return block.get("successors", [])
    route = comparison["resolvedBranch"]
    successor = route[
        "comparisonTrueSuccessor" if matched else "comparisonFalseSuccessor"
    ]
    return [successor]


def call_frame_fields(
    action: dict[str, Any],
    caller: dict[str, Any],
    callee: dict[str, Any],
    fields: dict[int, int],
) -> dict[int, int]:
    base = callee.get("frameArgumentBase")
    if not isinstance(base, int):
        return {}
    result = {}
    for index, argument in enumerate(action.get("arguments", [])):
        kind = argument.get("kind")
        value = None
        if kind in {"constant", "static-pointer", "function-pointer"}:
            value = argument.get("value")
        elif kind == "frame-field":
            value = fields.get(argument.get("offset"))
        elif kind == "caller-argument":
            caller_base = caller.get("frameArgumentBase")
            if isinstance(caller_base, int):
                value = fields.get(caller_base + argument.get("index", 0) * 4)
        if isinstance(value, int):
            result[base + index * 4] = value & 0xffffffff
    return result


def invocation_specialized_closure(
    native_map: dict[str, Any],
    entry_function: str,
    initial_frame_fields: dict[str, int],
) -> tuple[list[dict[str, Any]], Counter[str]]:
    by_id = {function["id"]: function for function in native_map["functions"]}
    pending = [(entry_function, {int(key): value for key, value in initial_frame_fields.items()})]
    visited_invocations: set[tuple[str, tuple[tuple[int, int], ...]]] = set()
    reached_blocks: dict[str, set[str]] = defaultdict(set)
    static_edges: set[tuple[str, str, str, str, str]] = set()

    while pending:
        function_id, initial = pending.pop()
        signature = (function_id, tuple(sorted(initial.items())))
        if signature in visited_invocations:
            continue
        visited_invocations.add(signature)
        function = by_id[function_id]
        blocks = {block["id"]: block for block in function.get("blocks", [])}
        states: dict[str, dict[int, int]] = {}
        work = [(function["entryBlock"], initial)]
        while work:
            block_id, incoming = work.pop()
            merged, changed = merge_fields(states.get(block_id), incoming)
            if not changed:
                continue
            states[block_id] = merged
            reached_blocks[function_id].add(block_id)
            block = blocks[block_id]
            outgoing = apply_frame_actions(block, merged)
            for action in block.get("actions", []):
                kind = action.get("kind")
                if kind not in {"directCall", "childCoroutineLaunch"}:
                    continue
                targets = action_target_file_offsets(action)
                for target_id in targets:
                    static_edges.add((
                        kind,
                        function_id,
                        block_id,
                        action.get("callFileOffset", ""),
                        target_id,
                    ))
                    pending.append((
                        target_id,
                        call_frame_fields(
                            action,
                            function,
                            by_id[target_id],
                            outgoing,
                        ),
                    ))
            for successor in exact_frame_successors(block, outgoing):
                work.append((successor, outgoing))

    functions = []
    for function in native_map["functions"]:
        selected = reached_blocks.get(function["id"])
        if not selected:
            continue
        compiled = copy.deepcopy(function)
        compiled["blocks"] = [
            block for block in compiled.get("blocks", [])
            if block["id"] in selected
        ]
        compiled["specializedReachableBlockCount"] = len(compiled["blocks"])
        functions.append(compiled)
    return functions, Counter(edge[0] for edge in static_edges)


def build_program(
    event_ir: dict[str, Any],
    catalog: dict[str, Any],
    *,
    program_id: str,
    disc: int,
    area: str,
    entry_function: str,
    mapinfo: bytes | None = None,
    auth_path_token: str | None = None,
) -> dict[str, Any]:
    native_map = source_map(event_ir, disc, area)
    entry_invocation = exact_entry_invocation(native_map, entry_function)
    functions, edge_kinds = invocation_specialized_closure(
        native_map,
        entry_function,
        entry_invocation["initialFrameFields"] if entry_invocation else {},
    )
    auth_selection = None
    if auth_path_token is not None:
        if mapinfo is None:
            raise ValueError("AUTH path-family selection requires MAPINFO bytes")
        auth_selection = auth_resource_family_selection(
            functions,
            entry_function,
            mapinfo,
            auth_path_token,
        )
        functions, edge_kinds = slice_auth_resource_family_program(
            functions,
            entry_function,
            auth_selection,
        )
    blocks = [block for function in functions for block in function.get("blocks", [])]
    actions = [action for block in blocks for action in block.get("actions", [])]
    blockers = unresolved_operations(actions)
    first_blocker = first_unresolved_operation(functions, blockers)
    operation_013c_pairs = operation_013c_static_record_pairs(functions)
    operation_013c_archives = operation_013c_archive_pairs(functions)
    operation_013e_bindings = operation_013e_static_bindings(functions)
    strings = static_strings(functions, mapinfo) if mapinfo is not None else []
    vectors = static_vectors(functions, mapinfo) if mapinfo is not None else []
    return {
        "schema": "new-yokosuka-native-cutscene-program-v1",
        "id": program_id,
        "disc": disc,
        "area": area,
        "mapinfoSha256": native_map["mapinfoSha256"],
        "entryFunction": entry_function,
        **({"entryInvocation": entry_invocation} if entry_invocation else {}),
        "source": {
            "nativeEventIr": ".disc-work/dialogue/native-event-ir.json",
            "nativeEventIrSchema": event_ir["schema"],
            "controlFlow": event_ir.get("generatedFrom"),
        },
        "staticStrings": strings,
        "staticVectors": vectors,
        "operation013cStaticRecordPairs": operation_013c_pairs,
        "operation013cArchivePairs": operation_013c_archives,
        "operation013eStaticBindings": operation_013e_bindings,
        **({"authResourceSelection": auth_selection} if auth_selection else {}),
        "compile": {
            "status": "blocked" if blockers else "compiled",
            **(
                {"firstBlocker": first_blocker}
                if first_blocker
                else {}
            ),
            "blockers": blockers,
        },
        "summary": {
            "functionCount": len(functions),
            "blockCount": len(blocks),
            "actionCount": len(actions),
            "actionKinds": dict(sorted(Counter(
                action["kind"] for action in actions
            ).items())),
            "staticTargetEdges": dict(sorted(edge_kinds.items())),
            "unresolvedOperationTypeCount": len(blockers),
            "unresolvedOperationCallCount": sum(
                len(blocker["callFileOffsets"]) for blocker in blockers
            ),
            "staticStringCount": len(strings),
            "staticVectorCount": len(vectors),
            "operation013cStaticRecordPairCount": len(operation_013c_pairs),
            "operation013cArchivePairCount": len(operation_013c_archives),
            "operation013eStaticBindingCount": len(operation_013e_bindings),
        },
        "functions": functions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_IR)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--id", required=True)
    parser.add_argument("--disc", type=int, required=True)
    parser.add_argument("--area", required=True)
    parser.add_argument("--entry", required=True)
    parser.add_argument("--mapinfo", type=Path)
    parser.add_argument(
        "--auth-path-token",
        help=(
            "select an embedded AUTH family by exact authored ASTR path and "
            "terminate before the next non-family activity"
        ),
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else PROJECT_ROOT / args.output

    mapinfo_path = args.mapinfo or (
        PROJECT_ROOT / ".disc-work" / "mapinfo" / f"disc{args.disc}"
        / "SCENE" / f"{args.disc:02d}" / args.area / "MAPINFO.BIN"
    )
    program = build_program(
        json.loads(args.event_ir.read_text()),
        json.loads(args.catalog.read_text()),
        program_id=args.id,
        disc=args.disc,
        area=args.area,
        entry_function=args.entry,
        mapinfo=mapinfo_path.read_bytes(),
        auth_path_token=args.auth_path_token,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(program, indent=2) + "\n")
    print(f"Wrote {output.relative_to(PROJECT_ROOT)}")


if __name__ == "__main__":
    main()
