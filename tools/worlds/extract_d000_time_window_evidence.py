#!/usr/bin/env python3
"""Recover D000's native in-game clock-window predicates.

The shared predicate at file offset 0x7ed70 receives four stack arguments in
the order start-minute, end-hour, end-minute, start-hour. Hours before 06:00
are normalized by adding 24 before it evaluates the half-open window
``start <= current < end``. This report inventories every literal call,
retains dynamic operands as unresolved, and associates each call with its
containing native routine and direct object/flag operations.

For the compiler's canonical result test, this report also constructs the
routine's direct SH-4 control-flow graph and classifies direct object/flag
calls as true-only, false-only, or shared. A call is never attributed to a
time branch merely because it resides in the same routine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path
from typing import Any

from tools.worlds.extract_d000_door_transitions import branch_target, immediate
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


CLOCK_WINDOW_PREDICATE = 0x7ED70
SELECTED_OPERATIONS = {0x001F, 0x0051, 0x0098, 0x00A8}
CONTROL_FLOW = {
    "bra", "braf", "bf", "bf.s", "bt", "bt.s",
    "bsr", "bsrf", "jmp", "jsr", "rts",
}


def scn3_static_base(data: bytes) -> int:
    offset = data.find(b"SCN3")
    if offset < 0 or offset + 0x14 > len(data):
        raise ValueError("MAPINFO does not contain a complete SCN3 header")
    return offset + struct.unpack_from("<I", data, offset + 0x10)[0]


def compact_argument(argument: dict[str, Any]) -> Any:
    if argument.get("kind") != "constant":
        return {"kind": "runtime", "source": argument.get("source")}
    if "ascii" in argument:
        return argument["ascii"]
    return argument.get("value")


def routine_bounds(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
) -> tuple[int | None, int | None]:
    start = next(
        (
            row[0]
            for row in reversed(instructions[:call_index])
            if row[1] == "sts.l" and row[2] == "pr,@-r13"
        ),
        None,
    )
    end = next(
        (
            row[0] + 4
            for row in instructions[call_index:]
            if row[1] == "rts"
        ),
        None,
    )
    return start, end


def literal_window(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
) -> dict[str, Any] | None:
    # Exact compiler form: four immediate register loads followed by four
    # pushes in r4,r5,r6,r7 order and the literal target load.
    if call_index < 9:
        return None
    block = instructions[call_index - 9:call_index]
    if [
        (row[1], row[2])
        for row in block[4:8]
    ] != [
        ("mov.l", "r4,@-r13"),
        ("mov.l", "r5,@-r13"),
        ("mov.l", "r6,@-r13"),
        ("mov.l", "r7,@-r13"),
    ]:
        return None
    values = [
        immediate(block[index][2], f"r{index + 4}")
        if block[index][1] == "mov"
        else None
        for index in range(4)
    ]
    if any(value is None for value in values):
        return None
    start_minute, end_hour, end_minute, start_hour = values
    if not (
        0 <= start_hour <= 23
        and 0 <= end_hour <= 23
        and 0 <= start_minute <= 59
        and 0 <= end_minute <= 59
    ):
        return None
    return {
        "start": {"hour": start_hour, "minute": start_minute},
        "end": {"hour": end_hour, "minute": end_minute},
        "normalizedStartMinute": (
            (start_hour + (24 if start_hour < 6 else 0)) * 60
            + start_minute
        ),
        "normalizedEndMinute": (
            (end_hour + (24 if end_hour < 6 else 0)) * 60
            + end_minute
        ),
        "boundary": "start-inclusive, end-exclusive",
        "dayBoundaryHour": 6,
    }


def direct_target(operand: str) -> int | None:
    try:
        return int(operand, 16)
    except ValueError:
        return None


def control_flow_successors(
    instructions: list[tuple[int, str, str, int | None]],
    start: int,
    end: int,
) -> dict[int, set[int]]:
    """Build conservative direct intra-routine successors.

    Calls return after their delay slot. Indirect jumps are deliberately
    terminal. BRAF is exact only when its immediately preceding instruction
    carries the objdump-resolved literal displacement.
    """

    rows = {
        row[0]: row
        for row in instructions
        if start <= row[0] < end
    }
    ordered = sorted(rows)
    next_address = {
        address: ordered[index + 1] if index + 1 < len(ordered) else None
        for index, address in enumerate(ordered)
    }
    previous = {
        address: ordered[index - 1] if index else None
        for index, address in enumerate(ordered)
    }
    result: dict[int, set[int]] = {}
    for address in ordered:
        _, mnemonic, operands, _ = rows[address]
        targets: set[int] = set()
        fallthrough = next_address[address]
        if mnemonic in {"bf", "bf.s", "bt", "bt.s"}:
            target = direct_target(operands)
            if target in rows:
                targets.add(target)
            if fallthrough is not None:
                targets.add(fallthrough)
        elif mnemonic == "bra":
            target = direct_target(operands)
            if target in rows:
                targets.add(target)
        elif mnemonic == "braf":
            prior = rows.get(previous[address])
            if prior is not None and prior[3] is not None:
                target = branch_target(address, prior[3])
                if target in rows:
                    targets.add(target)
        elif mnemonic in {"rts", "jmp"}:
            pass
        elif mnemonic in {"bsr", "bsrf", "jsr"}:
            # SH-4 calls execute one delay-slot instruction and return to +4.
            return_address = address + 4
            if return_address in rows:
                targets.add(return_address)
        elif fallthrough is not None:
            targets.add(fallthrough)
        result[address] = targets
    return result


def reachable(graph: dict[int, set[int]], seed: int | None) -> set[int]:
    if seed is None or seed not in graph:
        return set()
    seen: set[int] = set()
    pending = [seed]
    while pending:
        address = pending.pop()
        if address in seen:
            continue
        seen.add(address)
        pending.extend(graph.get(address, ()))
    return seen


def assigned_register(mnemonic: str, operands: str) -> str | None:
    if "," not in operands:
        return None
    destination = operands.rsplit(",", 1)[1]
    if destination.startswith("r") and destination[1:].isdigit():
        return destination
    return None


def preceding_immediate(
    instructions: list[tuple[int, str, str, int | None]],
    index: int,
    register: str,
    allowed: set[int],
) -> tuple[int, int] | None:
    for candidate in range(index - 1, max(-1, index - 10), -1):
        row = instructions[candidate]
        if row[0] not in allowed or row[1] in CONTROL_FLOW:
            return None
        if assigned_register(row[1], row[2]) != register:
            continue
        if row[1] == "mov":
            value = immediate(row[2], register)
            return (row[0], value) if value is not None else None
        return None
    return None


def local_byte_writes(
    instructions: list[tuple[int, str, str, int | None]],
    allowed: set[int],
) -> list[dict[str, Any]]:
    """Extract exact constant writes to this routine's r14 stack frame."""

    result = []
    for index, row in enumerate(instructions):
        address, mnemonic, operands, _ = row
        if address not in allowed or mnemonic != "mov.b" or "," not in operands:
            continue
        source, destination = operands.split(",", 1)
        source_value = preceding_immediate(
            instructions, index, source, allowed
        )
        if source_value is None:
            continue
        frame_offset = None
        address_proof = []
        if destination.startswith("@(") and destination.endswith(",r14)"):
            try:
                frame_offset = int(destination[2:-5], 0)
            except ValueError:
                pass
        elif destination.startswith("@r"):
            pointer_register = destination[1:]
            # Canonical compiler form: mov #offset,rN; add r14,rN.
            add_index = None
            for candidate in range(index - 1, max(-1, index - 10), -1):
                candidate_row = instructions[candidate]
                if (
                    candidate_row[0] not in allowed
                    or candidate_row[1] in CONTROL_FLOW
                ):
                    break
                if (
                    candidate_row[1] == "add"
                    and candidate_row[2] == f"r14,{pointer_register}"
                ):
                    add_index = candidate
                    break
                if assigned_register(
                    candidate_row[1], candidate_row[2]
                ) == pointer_register:
                    break
            if add_index is not None:
                pointer_value = preceding_immediate(
                    instructions, add_index, pointer_register, allowed
                )
                if pointer_value is not None:
                    frame_offset = pointer_value[1]
                    address_proof = [
                        f"0x{pointer_value[0]:x}",
                        f"0x{instructions[add_index][0]:x}",
                    ]
        if frame_offset is None:
            continue
        result.append({
            "writeFileOffset": f"0x{address:x}",
            "frameOffset": frame_offset,
            "valueSigned": source_value[1],
            "valueHex": f"0x{source_value[1] & 0xff:02x}",
            "valueLoadFileOffset": f"0x{source_value[0]:x}",
            "addressProofFileOffsets": address_proof,
        })
    return result


def predicate_branch(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
    start: int | None,
    end: int | None,
) -> dict[str, Any]:
    """Resolve the canonical ``cmp/eq #0,r0`` result branch exactly."""

    if start is None or end is None:
        return {
            "classification": "unresolvedRoutine",
            "reason": "containing routine boundary is unavailable",
        }
    candidate = None
    for index in range(call_index + 1, min(call_index + 14, len(instructions))):
        row = instructions[index]
        if row[1] == "cmp/eq" and row[2] == "#0,r0":
            next_row = instructions[index + 1]
            if next_row[1] in {"bf", "bf.s", "bt", "bt.s"}:
                candidate = (row, next_row, instructions[index + 2])
            break
        if row[1] in {"bra", "braf", "jmp", "rts"}:
            break
    if candidate is None:
        return {
            "classification": "runtimeCombinedPredicate",
            "reason": (
                "clock result is combined with other runtime state before "
                "the controlling branch"
            ),
        }
    compare, branch, fallthrough = candidate
    target = direct_target(branch[2])
    if target is None:
        return {
            "classification": "unresolvedDirectBranch",
            "compareFileOffset": f"0x{compare[0]:x}",
            "branchFileOffset": f"0x{branch[0]:x}",
        }
    if branch[1].startswith("bf"):
        true_seed, false_seed = target, fallthrough[0]
    else:
        true_seed, false_seed = fallthrough[0], target
    graph = control_flow_successors(instructions, start, end)
    true_reachable = reachable(graph, true_seed)
    false_reachable = reachable(graph, false_seed)
    return {
        "classification": "exactCanonicalBooleanBranch",
        "compareFileOffset": f"0x{compare[0]:x}",
        "branchFileOffset": f"0x{branch[0]:x}",
        "branchMnemonic": branch[1],
        "trueSuccessorFileOffset": f"0x{true_seed:x}",
        "falseSuccessorFileOffset": f"0x{false_seed:x}",
        "_trueReachable": true_reachable,
        "_falseReachable": false_reachable,
    }


def build_report(mapinfo_path: Path, objdump: str) -> dict[str, Any]:
    data = mapinfo_path.read_bytes()
    instructions = disassemble(mapinfo_path, objdump)
    static_base = scn3_static_base(data)
    dispatch_calls = extract_dispatch_calls(instructions, static_base)
    result = []
    for index, row in enumerate(instructions):
        if (
            row[1] != "bsrf"
            or index == 0
            or instructions[index - 1][3] is None
            or branch_target(row[0], instructions[index - 1][3])
            != CLOCK_WINDOW_PREDICATE
        ):
            continue
        start, end = routine_bounds(instructions, index)
        direct_calls = [
            {
                "operation": call["operationHex"],
                "callFileOffset": call["callFileOffset"],
                "arguments": [
                    compact_argument(argument)
                    for argument in call["arguments"]
                ],
            }
            for call in dispatch_calls
            if (
                call["operationId"] in SELECTED_OPERATIONS
                and start is not None
                and end is not None
                and start <= int(call["callFileOffset"], 16) < end
            )
        ]
        branch = predicate_branch(instructions, index, start, end)
        true_reachable = branch.pop("_trueReachable", set())
        false_reachable = branch.pop("_falseReachable", set())
        branch_calls = {
            "trueOnly": [],
            "falseOnly": [],
            "shared": [],
            "unreachable": [],
        }
        for call in direct_calls:
            address = int(call["callFileOffset"], 16)
            in_true = address in true_reachable
            in_false = address in false_reachable
            if in_true and not in_false:
                branch_calls["trueOnly"].append(call)
            elif in_false and not in_true:
                branch_calls["falseOnly"].append(call)
            elif in_true and in_false:
                branch_calls["shared"].append(call)
            else:
                branch_calls["unreachable"].append(call)
        branch_local_writes = {
            "trueOnly": local_byte_writes(
                instructions,
                true_reachable - false_reachable,
            ),
            "falseOnly": local_byte_writes(
                instructions,
                false_reachable - true_reachable,
            ),
        }
        routine_bytes = data[start:end] if start is not None and end else b""
        result.append({
            "callFileOffset": f"0x{row[0]:x}",
            "window": literal_window(instructions, index),
            "operandClassification": (
                "exactLiteralWindow"
                if literal_window(instructions, index)
                else "runtimeOrNoncanonicalArguments"
            ),
            "containingRoutine": {
                "startFileOffset": (
                    f"0x{start:x}" if start is not None else None
                ),
                "endFileOffsetExclusive": (
                    f"0x{end:x}" if end is not None else None
                ),
                "sha256": (
                    hashlib.sha256(routine_bytes).hexdigest()
                    if routine_bytes else None
                ),
            },
            "directObjectAndPersistentStateCalls": direct_calls,
            "resultBranch": branch,
            "branchOwnedDirectCalls": branch_calls,
            "branchOwnedLocalByteWrites": branch_local_writes,
        })

    return {
        "schema": "new-yokosuka-d000-time-window-evidence-v2",
        "source": {
            "path": str(mapinfo_path),
            "sha256": hashlib.sha256(data).hexdigest(),
        },
        "nativePredicate": {
            "fileOffset": f"0x{CLOCK_WINDOW_PREDICATE:x}",
            "semantics": (
                "normalize each hour below 06:00 by adding 24, then evaluate "
                "start <= current game hour/minute < end"
            ),
            "dayBoundaryHour": 6,
            "sourceClock": {
                "hourOffset": "SCN3 module state +0xcc",
                "minuteOffset": "SCN3 module state +0xcd",
            },
        },
        "summary": {
            "callCount": len(result),
            "exactLiteralWindowCount": sum(
                item["window"] is not None for item in result
            ),
            "dynamicOrNoncanonicalCount": sum(
                item["window"] is None for item in result
            ),
            "uniqueRoutineCount": len({
                item["containingRoutine"]["startFileOffset"]
                for item in result
            }),
            "exactCanonicalBooleanBranchCount": sum(
                item["resultBranch"]["classification"]
                == "exactCanonicalBooleanBranch"
                for item in result
            ),
            "runtimeCombinedPredicateCount": sum(
                item["resultBranch"]["classification"]
                == "runtimeCombinedPredicate"
                for item in result
            ),
            "trueOnlyDirectCallCount": sum(
                len(item["branchOwnedDirectCalls"]["trueOnly"])
                for item in result
            ),
            "falseOnlyDirectCallCount": sum(
                len(item["branchOwnedDirectCalls"]["falseOnly"])
                for item in result
            ),
            "sharedDirectCallCount": sum(
                len(item["branchOwnedDirectCalls"]["shared"])
                for item in result
            ),
            "branchOwnedLocalByteWriteCount": sum(
                len(writes)
                for item in result
                for writes in item["branchOwnedLocalByteWrites"].values()
            ),
        },
        "calls": result,
        "evidenceBoundary": (
            "Literal windows, containing native routines, canonical result "
            "branches, and direct-call reachability are exact. Calls marked "
            "shared are not attributed to the time predicate. Runtime-combined "
            "predicates and indirect helper effects remain unresolved; the "
            "browser must not change an object from those records alone."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mapinfo",
        nargs="?",
        type=Path,
        default=Path(".disc-work/exact/d000/MAPINFO.BIN"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/d000-time-window-evidence.json"),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(args.mapinfo, args.objdump)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {report['summary']['callCount']} clock-window "
        f"calls, {report['summary']['exactLiteralWindowCount']} literal"
    )


if __name__ == "__main__":
    main()
