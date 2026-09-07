#!/usr/bin/env python3
"""Recover exact native predicate formulas guarding dialogue call routes.

Generated MAPINFO code represents booleans as SH-4 T-bit comparisons followed
by ``subc``-produced all-zero/all-one masks.  This extractor symbolically
executes those compiler forms through both acyclic and cyclic function CFGs,
including generated stack saves used across engine-operation calls. Cyclic
joins converge by fixed point where exact boolean absorption is sufficient;
irreducible recurrences widen to an explicit opaque path-join term. It records
a route only when an exact direct call or child-coroutine launch under that
predicate has an exact call-graph path to a recovered dialogue region.

Unknown instructions, widened path joins, and state-limit exits remain
explicit coverage gaps. No display name, story meaning, or interaction
ownership is inferred.
"""

from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import disassemble


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-predicate-routes.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-predicate-routes.json"
)
DEFAULT_SPATIAL_INVENTORY = (
    PROJECT_ROOT / "tools/evidence/spatial-interaction-system-inventory.json"
)
REGISTER = re.compile(r"^r(?:1[0-5]|[0-9])$")
MEMORY_AT_REGISTER = re.compile(r"^@(r(?:1[0-5]|[0-9]))$")
MEMORY_INDEXED = re.compile(
    r"^@\((r(?:1[0-5]|[0-9])),(r(?:1[0-5]|[0-9]))\)$"
)
MEMORY_DISPLACED = re.compile(
    r"^@\(([-+]?0x[0-9a-f]+|[-+]?\d+),(r(?:1[0-5]|[0-9]))\)$"
)


Expr = tuple[Any, ...]
UNKNOWN: Expr = ("unknown",)
TRUE: Expr = ("bool", True)
FALSE: Expr = ("bool", False)
SCENE_BASE: Expr = ("scene-base",)


def hx(value: int) -> str:
    return f"0x{value:x}"


def parse_int(value: str) -> int | None:
    try:
        return int(value, 0)
    except ValueError:
        return None


def is_unknown(value: Expr) -> bool:
    return value == UNKNOWN


def expr_sort_key(value: Expr) -> str:
    return repr(value)


def negate(value: Expr) -> Expr:
    if value == TRUE:
        return FALSE
    if value == FALSE:
        return TRUE
    if value and value[0] == "not":
        return value[1]
    return ("not", value)


def combine(kind: str, *values: Expr) -> Expr:
    flattened: list[Expr] = []
    identity = TRUE if kind == "and" else FALSE
    annihilator = FALSE if kind == "and" else TRUE
    for value in values:
        if value == annihilator:
            return annihilator
        if value == identity:
            continue
        if value and value[0] == kind:
            flattened.extend(value[1:])
        else:
            flattened.append(value)
    unique_set = set(flattened)
    for value in tuple(unique_set):
        if negate(value) in unique_set:
            return annihilator
    # Absorption keeps fixed-point formulas finite at loop joins:
    # A || (A && B) == A, and A && (A || B) == A.
    nested_kind = "and" if kind == "or" else "or"
    for value in tuple(unique_set):
        if value and value[0] == nested_kind:
            if any(term in unique_set for term in value[1:]):
                unique_set.remove(value)
    unique = sorted(unique_set, key=expr_sort_key)
    if not unique:
        return identity
    if len(unique) == 1:
        return unique[0]
    return (kind, *unique)


def merge_paths(
    previous: Expr,
    incoming: Expr,
    *,
    cyclic: bool,
    join_offset: int,
) -> Expr:
    """Join reachability formulas, widening irreducible loop recurrences.

    Exact absorption handles the normal loop-header case without growing the
    formula. If a cyclic join still changes after absorption, retain an
    explicit opaque marker instead of repeatedly expanding an unbounded
    recurrence.
    """

    if previous == incoming or incoming == FALSE or previous == TRUE:
        return previous
    if previous == FALSE or incoming == TRUE:
        return incoming
    if previous and previous[0] == "opaque-path-join":
        return previous
    if incoming and incoming[0] == "opaque-path-join":
        return incoming
    if incoming and incoming[0] == "and" and previous in incoming[1:]:
        return previous
    if previous and previous[0] == "and" and incoming in previous[1:]:
        return incoming
    if (
        cyclic
        or expression_complexity(previous, 192) >= 192
        or expression_complexity(incoming, 192) >= 192
    ):
        return ("opaque-path-join", join_offset)
    return combine("or", previous, incoming)


def expression_complexity(value: Expr, limit: int) -> int:
    count = 0
    pending = [value]
    while pending and count < limit:
        current = pending.pop()
        count += 1
        pending.extend(
            item
            for item in current[1:]
            if isinstance(item, tuple)
        )
    return count


def compare(kind: str, left: Expr, right: Expr) -> Expr:
    if is_unknown(left) or is_unknown(right):
        return UNKNOWN
    if left[0] == "const" and right[0] == "const":
        a, b = left[1], right[1]
        result = {
            "cmp/eq": a == b,
            "cmp/ge": a >= b,
            "cmp/gt": a > b,
            "cmp/hs": (a & 0xFFFFFFFF) >= (b & 0xFFFFFFFF),
            "cmp/hi": (a & 0xFFFFFFFF) > (b & 0xFFFFFFFF),
        }[kind]
        return TRUE if result else FALSE
    if kind == "cmp/eq":
        if left == right:
            return TRUE
        if right == ("const", 0):
            if left[0] == "mask":
                return negate(left[1])
            if left[0] == "bool-int":
                return negate(left[1])
        if left == ("const", 0):
            if right[0] == "mask":
                return negate(right[1])
            if right[0] == "bool-int":
                return negate(right[1])
    return ("compare", kind, left, right)


def mask(value: Expr) -> Expr:
    if value == TRUE:
        return ("const", -1)
    if value == FALSE:
        return ("const", 0)
    return ("mask", value)


def bitwise(kind: str, left: Expr, right: Expr) -> Expr:
    if is_unknown(left) or is_unknown(right):
        return UNKNOWN
    if left[0] == "const" and right[0] == "const":
        if kind == "and":
            return ("const", left[1] & right[1])
        return ("const", left[1] | right[1])
    if left[0] == "mask" and right[0] == "mask":
        return ("mask", combine(kind, left[1], right[1]))
    if kind == "and" and (
        left == ("const", 0) or right == ("const", 0)
    ):
        return ("const", 0)
    return (f"bitwise-{kind}", left, right)


def add(left: Expr, right: Expr) -> Expr:
    if is_unknown(left) or is_unknown(right):
        return UNKNOWN
    if left[0] == "const" and right[0] == "const":
        return ("const", left[1] + right[1])
    if left == SCENE_BASE and right[0] == "const":
        return ("scene-address", right[1])
    if right == SCENE_BASE and left[0] == "const":
        return ("scene-address", left[1])
    if left[0] == "scene-address" and right[0] == "const":
        return ("scene-address", left[1] + right[1])
    if right[0] == "scene-address" and left[0] == "const":
        return ("scene-address", right[1] + left[1])
    return ("add", left, right)


def load_memory(
    source: str,
    width: int,
    signed: bool,
    registers: dict[str, Expr],
) -> Expr:
    direct = MEMORY_AT_REGISTER.match(source)
    if direct:
        address = registers.get(direct.group(1), UNKNOWN)
        if address[0] == "scene-address":
            return ("scene-field", address[1], width, signed)
        return UNKNOWN
    indexed = MEMORY_INDEXED.match(source)
    if indexed:
        left = registers.get(indexed.group(1), UNKNOWN)
        right = registers.get(indexed.group(2), UNKNOWN)
        address = add(left, right)
        if address[0] == "scene-address":
            return ("scene-field", address[1], width, signed)
        return UNKNOWN
    displaced = MEMORY_DISPLACED.match(source)
    if displaced:
        displacement = parse_int(displaced.group(1))
        base = registers.get(displaced.group(2), UNKNOWN)
        if displacement is not None:
            address = add(base, ("const", displacement))
            if address[0] == "scene-address":
                return ("scene-field", address[1], width, signed)
    return UNKNOWN


def normalize_operation_arguments(arguments: list[dict[str, Any]]) -> tuple:
    result = []
    for item in arguments:
        if item.get("kind") == "constant":
            result.append(("constant", item["value"]))
        elif item.get("kind") == "static-pointer":
            result.append(("static-pointer", item["value"]))
        else:
            result.append((
                item.get("kind", "runtime"),
                item.get("source", "unresolved"),
            ))
    return tuple(result)


def expression_json(value: Expr) -> dict[str, Any]:
    kind = value[0]
    if kind == "bool":
        return {"kind": "boolean", "value": value[1]}
    if kind == "const":
        return {"kind": "constant", "value": value[1]}
    if kind == "scene-field":
        return {
            "kind": "scene-field",
            "fieldOffset": hx(value[1]),
            "loadWidth": value[2],
            "signedLoad": value[3],
        }
    if kind == "operation-result":
        return {
            "kind": "engine-operation-result",
            "operationId": value[1],
            "operationHex": f"0x{value[1]:04x}",
            "arguments": [
                {"kind": item[0], "value": item[1]}
                for item in value[2]
            ],
            "callFileOffset": hx(value[3]),
        }
    if kind == "call-result":
        return {
            "kind": "native-call-result",
            "targetFileOffset": hx(value[1]),
            "callFileOffset": hx(value[2]),
        }
    if kind == "compare":
        return {
            "kind": "comparison",
            "operator": value[1],
            "left": expression_json(value[2]),
            "right": expression_json(value[3]),
        }
    if kind in {"and", "or"}:
        return {
            "kind": kind,
            "terms": [expression_json(item) for item in value[1:]],
        }
    if kind == "not":
        return {"kind": "not", "term": expression_json(value[1])}
    if kind == "opaque-branch":
        return {
            "kind": "opaque-native-branch",
            "branchFileOffset": hx(value[1]),
        }
    if kind == "opaque-path-join":
        return {
            "kind": "opaque-native-path-join",
            "joinFileOffset": hx(value[1]),
        }
    return {"kind": "unresolved-expression", "nativeForm": repr(value)}


def formula_has_source(value: Expr) -> bool:
    if not value:
        return False
    if value[0] in {"scene-field", "operation-result", "call-result"}:
        return True
    return any(
        isinstance(item, tuple) and formula_has_source(item)
        for item in value[1:]
    )


def formula_has_opaque(value: Expr) -> bool:
    if not value:
        return False
    kind = value[0]
    if kind in {"opaque-branch", "opaque-path-join", "unknown"}:
        return True
    if kind in {
        "bool",
        "const",
        "scene-field",
        "operation-result",
        "call-result",
    }:
        return False
    if kind not in {"compare", "and", "or", "not"}:
        return True
    return any(
        isinstance(item, tuple) and formula_has_opaque(item)
        for item in value[1:]
    )


def required_scene_equalities(value: Expr) -> list[tuple[int, int]]:
    terms = value[1:] if value and value[0] == "and" else (value,)
    result = []
    for term in terms:
        if not term or term[0] != "compare" or term[1] != "cmp/eq":
            continue
        left, right = term[2], term[3]
        if left[0] == "scene-field" and right[0] == "const":
            result.append((left[1], right[1]))
        elif right[0] == "scene-field" and left[0] == "const":
            result.append((right[1], left[1]))
    return result


def spatial_route_index(
    inventory: dict[str, Any] | None,
) -> dict[tuple[int, str], dict[str, Any]]:
    if inventory is None:
        return {}
    result = {}
    for item in inventory["maps"]:
        selector = next(
            (
                call for call in item["calls"]
                if call["mode"] == 0
                and call.get("selectorResultRouting") is not None
            ),
            None,
        )
        if selector is None or len(item["serializedSources"]) != 1:
            continue
        routing = selector["selectorResultRouting"]
        result[(item["disc"], item["area"])] = {
            "routing": routing,
            "source": item["serializedSources"][0],
        }
    return result


def resolve_spatial_triggers(
    predicate: Expr,
    spatial: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if spatial is None:
        return []
    base = int(
        spatial["routing"]["sceneSelectorArrayBaseOffset"],
        16,
    )
    source = spatial["source"]
    records = source["records"]
    result = []
    for field_offset, selector_value in required_scene_equalities(predicate):
        record_index = selector_value - 1
        if field_offset != base or not (0 <= record_index < len(records)):
            continue
        result.append({
            "sceneSelectorArrayBaseOffset": hx(base),
            "selectorValue": selector_value,
            "spatialRecordIndex": record_index,
            "serializedSourceFileOffset": source["fileOffset"],
            "record": records[record_index],
        })
    return result


def clone_state(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "registers": dict(state["registers"]),
        "stack": dict(state["stack"]),
        "sp": state["sp"],
        "t": state["t"],
        "path": state["path"],
    }


def state_identity(state: dict[str, Any]) -> tuple:
    return (
        tuple(sorted(state["registers"].items())),
        tuple(sorted(state["stack"].items())),
        state["sp"],
        state["t"],
    )


def set_destination_unknown(
    mnemonic: str,
    operands: str,
    registers: dict[str, Expr],
) -> None:
    if "," in operands:
        destination = operands.rsplit(",", 1)[1]
        if destination in registers and mnemonic not in {
            "cmp/eq",
            "cmp/ge",
            "cmp/gt",
            "cmp/hi",
            "cmp/hs",
            "tst",
        }:
            registers[destination] = UNKNOWN


def execute_noncall(
    row: tuple[int, str, str, int | None],
    state: dict[str, Any],
) -> None:
    _address, mnemonic, operands, literal = row
    registers = state["registers"]
    if mnemonic in {"nop", "bra", "braf", "bf", "bt", "bf.s", "bt.s"}:
        return
    if mnemonic == "mov" and "," in operands:
        source, destination = operands.split(",", 1)
        if destination not in registers:
            return
        immediate = parse_int(source[1:]) if source.startswith("#") else None
        registers[destination] = (
            ("const", immediate)
            if immediate is not None
            else registers.get(source, UNKNOWN)
        )
        return
    if mnemonic in {"mov.l", "mov.w", "mov.b"} and "," in operands:
        source, destination = operands.rsplit(",", 1)
        width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
        signed = mnemonic in {"mov.b", "mov.w"}
        if source.startswith("#"):
            value = parse_int(source[1:])
            if destination in registers and value is not None:
                registers[destination] = ("const", value)
            return
        if source == "@r13+" and destination in registers:
            registers[destination] = state["stack"].get(
                state["sp"],
                UNKNOWN,
            )
            state["sp"] += 4
            return
        if destination == "@-r13" and source in registers:
            state["sp"] -= 4
            state["stack"][state["sp"]] = registers[source]
            return
        if destination in registers:
            if literal is not None and not source.startswith("@"):
                registers[destination] = ("const", literal)
            elif source in registers:
                registers[destination] = registers[source]
            else:
                registers[destination] = load_memory(
                    source,
                    width,
                    signed,
                    registers,
                )
            return
        return
    if mnemonic == "add" and "," in operands:
        source, destination = operands.split(",", 1)
        if destination not in registers:
            return
        if source.startswith("#"):
            immediate = parse_int(source[1:])
            source_value = (
                ("const", immediate)
                if immediate is not None
                else UNKNOWN
            )
        else:
            source_value = registers.get(source, UNKNOWN)
        if destination == "r13" and source_value[0] == "const":
            state["sp"] += source_value[1]
        registers[destination] = add(
            registers.get(destination, UNKNOWN),
            source_value,
        )
        return
    if mnemonic in {"and", "or"} and "," in operands:
        source, destination = operands.split(",", 1)
        if destination in registers:
            registers[destination] = bitwise(
                mnemonic,
                registers.get(destination, UNKNOWN),
                registers.get(source, UNKNOWN),
            )
        return
    if mnemonic == "not" and "," in operands:
        source, destination = operands.split(",", 1)
        value = registers.get(source, UNKNOWN)
        if value[0] == "const":
            registers[destination] = ("const", ~value[1])
        elif value[0] == "mask":
            registers[destination] = ("mask", negate(value[1]))
        else:
            registers[destination] = ("bitwise-not", value)
        return
    if mnemonic in {"extu.b", "extu.w", "exts.b", "exts.w"}:
        source, destination = operands.split(",", 1)
        value = registers.get(source, UNKNOWN)
        if value[0] == "scene-field":
            registers[destination] = (
                "scene-field",
                value[1],
                1 if mnemonic.endswith(".b") else 2,
                mnemonic.startswith("exts"),
            )
        else:
            registers[destination] = value
        return
    if mnemonic in {"cmp/eq", "cmp/ge", "cmp/gt", "cmp/hi", "cmp/hs"}:
        left_text, right_text = operands.split(",", 1)
        left_immediate = (
            parse_int(left_text[1:]) if left_text.startswith("#") else None
        )
        left = (
            ("const", left_immediate)
            if left_immediate is not None
            else registers.get(left_text, UNKNOWN)
        )
        right = registers.get(right_text, UNKNOWN)
        # SH-4 encodes these as Rm,Rn but evaluates Rn against Rm.
        state["t"] = compare(mnemonic, right, left)
        return
    if mnemonic == "subc" and "," in operands:
        source, destination = operands.split(",", 1)
        if destination in registers:
            if source == destination:
                registers[destination] = mask(state["t"])
            else:
                registers[destination] = UNKNOWN
            state["t"] = UNKNOWN
        return
    if mnemonic == "movt" and operands in registers:
        registers[operands] = ("bool-int", state["t"])
        return
    if mnemonic == "tst" and "," in operands:
        left, right = operands.split(",", 1)
        state["t"] = compare(
            "cmp/eq",
            bitwise(
                "and",
                registers.get(left, UNKNOWN),
                registers.get(right, UNKNOWN),
            ),
            ("const", 0),
        )
        return
    if mnemonic == "clrt":
        state["t"] = FALSE
        return
    if mnemonic == "sett":
        state["t"] = TRUE
        return
    set_destination_unknown(mnemonic, operands, registers)


def apply_call(
    address: int,
    state: dict[str, Any],
    operation: dict[str, Any] | None,
    target: int | None,
) -> None:
    registers = state["registers"]
    for index in range(1, 8):
        registers[f"r{index}"] = UNKNOWN
    if operation is not None:
        registers["r0"] = (
            "operation-result",
            operation["operationId"],
            normalize_operation_arguments(operation.get("arguments", [])),
            address,
        )
    elif target is not None:
        registers["r0"] = ("call-result", target, address)
    else:
        registers["r0"] = UNKNOWN
    state["t"] = UNKNOWN


def simulate_function(
    function: dict[str, Any],
    instruction_rows: dict[int, tuple[int, str, str, int | None]],
    instruction_addresses: list[int],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    blocks = {
        int(block["startFileOffset"], 16): block
        for block in function["basicBlocks"]
    }
    if not blocks:
        return [], {"status": "empty"}
    is_cyclic = any(
        int(successor, 16) <= start
        for start, block in blocks.items()
        for successor in block["successors"]
        if int(successor, 16) in blocks
    )

    operations = {
        int(item["callFileOffset"], 16): item
        for item in function["nativeOperations"]
    }
    direct_calls = {
        int(item["callFileOffset"], 16): int(
            item["targetFileOffset"],
            16,
        )
        for item in function["directCalls"]
    }
    child_launches = {
        int(item["callFileOffset"], 16): int(
            item["targetFileOffset"],
            16,
        )
        for item in function["childCoroutineLaunches"]
    }
    incoming: dict[int, list[dict[str, Any]]] = defaultdict(list)
    start = int(function["fileOffset"], 16)
    incoming[start].append({
        "registers": {
            f"r{index}": (
                SCENE_BASE if index == 9 else UNKNOWN
            )
            for index in range(16)
        },
        "stack": {},
        "sp": 0,
        "t": UNKNOWN,
        "path": TRUE,
    })
    pending = [start]
    seen_paths: dict[tuple[int, tuple], Expr] = {}
    calls_by_site: dict[tuple[str, int, int], Expr] = {}
    processed_state_count = 0
    while pending:
        block_start = pending.pop()
        block = blocks.get(block_start)
        if block is None:
            continue
        states = incoming.pop(block_start, [])
        for initial in states:
            identity = (block_start, state_identity(initial))
            previous_path = seen_paths.get(identity)
            if previous_path is not None:
                merged_path = merge_paths(
                    previous_path,
                    initial["path"],
                    cyclic=is_cyclic,
                    join_offset=block_start,
                )
                if merged_path == previous_path:
                    continue
                initial = clone_state(initial)
                initial["path"] = merged_path
            seen_paths[identity] = initial["path"]
            processed_state_count += 1
            if processed_state_count > 4096:
                calls = [
                    {
                        "kind": key[0],
                        "callFileOffset": key[1],
                        "targetFileOffset": key[2],
                        "predicate": predicate,
                    }
                    for key, predicate in sorted(calls_by_site.items())
                ]
                return calls, {
                    "status": "state-limit",
                    "processedStateCount": processed_state_count,
                    "cyclicCfg": is_cyclic,
                }
            state = clone_state(initial)
            block_end = int(block["endFileOffsetExclusive"], 16)
            first = bisect.bisect_left(instruction_addresses, block_start)
            last = bisect.bisect_left(instruction_addresses, block_end, first)
            addresses = instruction_addresses[first:last]
            cursor = 0
            while cursor < len(addresses):
                address = addresses[cursor]
                row = instruction_rows[address]
                mnemonic = row[1]
                if mnemonic in {"jsr", "bsr", "bsrf"}:
                    operation = operations.get(address)
                    target = (
                        direct_calls.get(address)
                        or child_launches.get(address)
                    )
                    if target is not None:
                        kind = (
                            "childCoroutineLaunch"
                            if address in child_launches
                            else "directCall"
                        )
                        key = (kind, address, target)
                        calls_by_site[key] = merge_paths(
                            calls_by_site.get(key, FALSE),
                            state["path"],
                            cyclic=is_cyclic,
                            join_offset=address,
                        )
                    if cursor + 1 < len(addresses):
                        execute_noncall(
                            instruction_rows[addresses[cursor + 1]],
                            state,
                        )
                        cursor += 1
                    apply_call(address, state, operation, target)
                else:
                    execute_noncall(row, state)
                cursor += 1

            successors = [
                int(item, 16)
                for item in block["successors"]
                if int(item, 16) in blocks
            ]
            terminator = block.get("terminator")
            if (
                terminator is not None
                and terminator["mnemonic"] in {"bf", "bt", "bf.s", "bt.s"}
                and len(successors) == 2
            ):
                branch_address = int(terminator["fileOffset"], 16)
                condition = state["t"]
                if is_unknown(condition):
                    condition = ("opaque-branch", branch_address)
                target = int(terminator["operands"], 16)
                for successor in successors:
                    branch_true = successor == target
                    takes_when_t = (
                        not terminator["mnemonic"].startswith("bf")
                    )
                    required_t = (
                        branch_true
                        if takes_when_t
                        else not branch_true
                    )
                    next_state = clone_state(state)
                    next_state["path"] = combine(
                        "and",
                        state["path"],
                        condition if required_t else negate(condition),
                    )
                    if next_state["path"] != FALSE:
                        incoming[successor].append(next_state)
                        pending.append(successor)
            else:
                for successor in successors:
                    incoming[successor].append(clone_state(state))
                    pending.append(successor)
    calls = [
        {
            "kind": key[0],
            "callFileOffset": key[1],
            "targetFileOffset": key[2],
            "predicate": predicate,
        }
        for key, predicate in sorted(calls_by_site.items())
    ]
    return calls, {
        "status": (
            "fixed-point-cyclic"
            if is_cyclic
            else "exact-acyclic"
        ),
        "processedStateCount": processed_state_count,
        "cyclicCfg": is_cyclic,
    }


def dialogue_descendants(
    functions: dict[int, dict[str, Any]],
    root: int,
) -> list[dict[str, Any]]:
    pending = [root]
    seen = set()
    regions = {}
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        function = functions.get(current)
        if function is None:
            continue
        region = function.get("dialogueRegion")
        if region is not None:
            regions[(region["executableTargetIndex"], current)] = {
                "functionFileOffset": hx(current),
                **region,
            }
        pending.extend(
            int(item["targetFileOffset"], 16)
            for item in function["directCalls"]
        )
        pending.extend(
            int(item["targetFileOffset"], 16)
            for item in function["childCoroutineLaunches"]
        )
    return [regions[key] for key in sorted(regions)]


def build_report(
    index: dict[str, Any],
    objdump: str,
    spatial_inventory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spatial_by_map = spatial_route_index(spatial_inventory)
    maps = []
    statuses = Counter()
    total_functions = 0
    for item in index["maps"]:
        source = Path(item["source"])
        data = source.read_bytes()
        if hashlib.sha256(data).hexdigest() != item["mapinfoSha256"]:
            raise ValueError(f"{source}: source hash changed")
        rows = {
            row[0]: row
            for row in disassemble(source, objdump)
        }
        instruction_addresses = sorted(rows)
        functions = {
            int(function["fileOffset"], 16): function
            for function in item["scriptedEventFunctions"]
        }
        routes = []
        function_coverage = []
        for function_start, function in sorted(functions.items()):
            total_functions += 1
            calls, coverage = simulate_function(
                function,
                rows,
                instruction_addresses,
            )
            statuses[coverage["status"]] += 1
            if coverage["status"] != "exact-acyclic":
                function_coverage.append({
                    "functionFileOffset": hx(function_start),
                    **coverage,
                })
            for call in calls:
                predicate = call["predicate"]
                if predicate == TRUE or not formula_has_source(predicate):
                    continue
                descendants = dialogue_descendants(
                    functions,
                    call["targetFileOffset"],
                )
                if not descendants:
                    continue
                routes.append({
                    "sourceFunctionFileOffset": hx(function_start),
                    "callKind": call["kind"],
                    "callFileOffset": hx(call["callFileOffset"]),
                    "targetFileOffset": hx(call["targetFileOffset"]),
                    "predicate": expression_json(predicate),
                    "containsOpaqueTerm": formula_has_opaque(predicate),
                    "spatialTriggers": resolve_spatial_triggers(
                        predicate,
                        spatial_by_map.get((item["disc"], item["area"])),
                    ),
                    "dialogueDescendants": descendants,
                })
        if routes or function_coverage:
            maps.append({
                "disc": item["disc"],
                "area": item["area"],
                "mapinfoSha256": item["mapinfoSha256"],
                "routes": routes,
                "unmodeledFunctions": function_coverage,
            })
    routes = [route for item in maps for route in item["routes"]]
    return {
        "schema": "new-yokosuka-dialogue-predicate-routes-v1",
        "evidenceBoundary": [
            "Predicates come from exact symbolic execution of generated SH-4 comparison, T-bit, subc-mask, bitwise-composition, scene-field, stack-save, and call forms.",
            "Dialogue descendants use only exact direct-call and child-coroutine edges.",
            "Cyclic functions are traversed to a fixed point; irreducible loop joins, unsupported expressions, opaque branch terms, and state-limit exits remain explicitly marked rather than guessed.",
            "A guarded call route does not by itself identify a clicked actor, object, prompt, or story meaning.",
        ],
        "summary": {
            "mapinfoCount": len(index["maps"]),
            "scriptedEventFunctionCount": total_functions,
            "functionStatusCounts": dict(sorted(statuses.items())),
            "predicateRouteCount": len(routes),
            "fullyResolvedPredicateRouteCount": sum(
                not route["containsOpaqueTerm"] for route in routes
            ),
            "routeWithExactSpatialTriggerCount": sum(
                bool(route["spatialTriggers"]) for route in routes
            ),
            "dialogueDescendantCount": sum(
                len(route["dialogueDescendants"]) for route in routes
            ),
        },
        "maps": maps,
    }


def summary_report(report: dict[str, Any], full_output: Path) -> dict[str, Any]:
    try:
        full_report = str(full_output.relative_to(PROJECT_ROOT))
    except ValueError:
        full_report = str(full_output)
    representative = []
    verified_anchors = []
    for item in report["maps"]:
        for route in item["routes"]:
            if (
                item["disc"] == 1
                and item["area"] == "D000"
                and route["callFileOffset"] == "0x7ac72"
            ):
                verified_anchors.append({
                    "disc": item["disc"],
                    "area": item["area"],
                    **route,
                })
            if len(representative) >= 24:
                continue
            representative.append(
                {"disc": item["disc"], "area": item["area"], **route}
            )
    return {
        "schema": report["schema"],
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "verifiedAnchors": verified_anchors,
        "representativeRoutes": representative,
        "fullReport": full_report,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument(
        "--spatial-inventory",
        type=Path,
        default=DEFAULT_SPATIAL_INVENTORY,
    )
    parser.add_argument("--objdump", default="sh4-linux-gnu-objdump")
    args = parser.parse_args()
    spatial_inventory = (
        json.loads(args.spatial_inventory.read_text())
        if args.spatial_inventory.exists()
        else None
    )
    report = build_report(
        json.loads(args.input.read_text()),
        args.objdump,
        spatial_inventory,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary_report(report, args.output), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['predicateRouteCount']} predicate routes"
    )


if __name__ == "__main__":
    main()
