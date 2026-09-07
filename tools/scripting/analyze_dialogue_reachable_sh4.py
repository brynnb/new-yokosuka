#!/usr/bin/env python3
"""Profile reachable SH-4 instructions in dialogue-bearing SCN3 programs.

Blind linear disassembly counts the literal pools embedded between the room
compiler's coroutine branches as code. This tool instead begins at every
generated-function prologue already recovered by the dialogue call graph and
follows only direct intra-function control flow. It handles the compiler's
literal-relative ``braf`` resume jumps and SH-4 delay slots explicitly.

The result is an implementation-planning profile, not a claim that every
branch executes in a particular game state. Indirect jumps remain unresolved
and are reported rather than guessed.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

from tools.scripting.extract_dialogue_call_graph import function_starts
from tools.worlds.extract_map_event_callbacks import branch_target
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CALL_GRAPH = PROJECT_ROOT / ".disc-work/dialogue/call-graph.json"
DEFAULT_OUTPUT = PROJECT_ROOT / ".disc-work/dialogue/reachable-sh4-profile.json"
DEFAULT_SUMMARY_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/dialogue-native-code-profile.json"
)
DIRECT_BRANCHES = {"bra", "bf", "bf.s", "bt", "bt.s", "bsr"}
CALLS = {"bsr", "bsrf", "jsr"}
INDIRECT_TERMINATORS = {"braf", "jmp"}
RETURNS = {"rts", "rte"}
DELAYED = {"bra", "braf", "bf.s", "bt.s", "bsr", "bsrf", "jmp", "jsr", "rts", "rte"}
REGISTER_RE = re.compile(r"\br(?:1[0-5]|[0-9])\b")
HEX_RE = re.compile(r"0x[0-9a-f]+")
DECIMAL_RE = re.compile(r"(?<![a-z@])#?-?\d+")


def hx(value: int) -> str:
    return f"0x{value:x}"


def direct_target(operands: str) -> int | None:
    try:
        return int(operands, 16)
    except ValueError:
        return None


def normalized_signature(mnemonic: str, operands: str) -> str:
    """Retain addressing shape while removing unimportant literal values."""
    normalized = REGISTER_RE.sub("rN", operands)
    normalized = HEX_RE.sub("ADDR", normalized)
    normalized = DECIMAL_RE.sub("IMM", normalized)
    return f"{mnemonic} {normalized}".rstrip()


def braf_target(
    address: int,
    rows: dict[int, tuple[int, str, str, int | None]],
) -> int | None:
    prior = rows.get(address - 2)
    if prior is None or prior[1] != "mov.l" or prior[3] is None:
        return None
    register = rows[address][2]
    if not prior[2].endswith(f",{register}"):
        return None
    return branch_target(address, prior[3])


def reachable_in_function(
    instructions: Sequence[tuple[int, str, str, int | None]],
    start: int,
    end: int,
) -> tuple[set[int], list[dict[str, Any]]]:
    """Return reachable instruction addresses and unresolved control transfers."""
    rows = {
        row[0]: row
        for row in instructions
        if start <= row[0] < end
    }
    if start not in rows:
        return set(), [{
            "fileOffset": hx(start),
            "mnemonic": None,
            "operands": None,
            "reason": "function entry was not disassembled",
        }]

    reached: set[int] = set()
    pending = [start]
    unresolved: list[dict[str, Any]] = []

    def enqueue(address: int | None) -> None:
        if address is not None and address in rows and address not in reached:
            pending.append(address)

    while pending:
        address = pending.pop()
        if address in reached:
            continue
        row = rows.get(address)
        if row is None:
            continue
        reached.add(address)
        _, mnemonic, operands, _literal = row

        delay = address + 2 if mnemonic in DELAYED else None
        if delay in rows:
            reached.add(delay)

        if mnemonic in {"bf", "bt"}:
            enqueue(direct_target(operands))
            enqueue(address + 2)
            continue
        if mnemonic in {"bf.s", "bt.s"}:
            enqueue(direct_target(operands))
            enqueue(address + 4)
            continue
        if mnemonic == "bra":
            enqueue(direct_target(operands))
            continue
        if mnemonic == "braf":
            target = braf_target(address, rows)
            if target is None:
                unresolved.append({
                    "fileOffset": hx(address),
                    "mnemonic": mnemonic,
                    "operands": operands,
                    "reason": "literal-relative target was not statically resolvable",
                })
            else:
                enqueue(target)
            continue
        if mnemonic in CALLS:
            # The callee is profiled from its own generated-function entry.
            # At this level a call returns after its delay slot.
            enqueue(address + 4)
            continue
        if mnemonic in RETURNS:
            continue
        if mnemonic == "jmp":
            unresolved.append({
                "fileOffset": hx(address),
                "mnemonic": mnemonic,
                "operands": operands,
                "reason": "indirect jump target",
            })
            continue
        enqueue(address + 2)

    return reached, unresolved


def dialogue_path_functions(report: dict[str, Any]) -> set[int]:
    result: set[int] = set()
    for item in report["dialogue"]:
        result.add(int(item["targetFileOffset"], 16))
        for path in item["launchPaths"]:
            for key in (
                "initialFunctionFileOffset",
                "launchSourceFunctionFileOffset",
                "launchedFunctionFileOffset",
            ):
                if path.get(key):
                    result.add(int(path[key], 16))
            for call in path["directCalls"]:
                result.add(int(call["callerFunctionFileOffset"], 16))
                result.add(int(call["calleeFunctionFileOffset"], 16))
        for root in item["unresolvedDynamicRoots"]:
            result.add(int(root["functionFileOffset"], 16))
    return result


def map_profile(
    report: dict[str, Any],
    objdump: str,
) -> dict[str, Any]:
    path = Path(report["source"])
    data = path.read_bytes()
    scn3, code_start, _initial_entry, static_start = scn3_ranges(data)
    starts = function_starts(data, code_start, static_start)
    instructions = [
        row
        for row in disassemble(path, objdump)
        if code_start <= row[0] < static_start
    ]
    by_address = {row[0]: row for row in instructions}
    path_starts = dialogue_path_functions(report)
    mnemonic_counts: Counter[str] = Counter()
    signature_counts: Counter[str] = Counter()
    path_mnemonics: Counter[str] = Counter()
    path_signatures: Counter[str] = Counter()
    total_reached: set[int] = set()
    path_reached: set[int] = set()
    unresolved: list[dict[str, Any]] = []

    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else static_start
        reached, function_unresolved = reachable_in_function(
            instructions,
            start,
            end,
        )
        total_reached.update(reached)
        unresolved.extend({
            "functionFileOffset": hx(start),
            **item,
        } for item in function_unresolved)
        is_dialogue_path = start in path_starts
        if is_dialogue_path:
            path_reached.update(reached)
        for address in reached:
            row = by_address[address]
            mnemonic_counts[row[1]] += 1
            signature_counts[normalized_signature(row[1], row[2])] += 1
            if is_dialogue_path:
                path_mnemonics[row[1]] += 1
                path_signatures[normalized_signature(row[1], row[2])] += 1

    return {
        "source": str(path),
        "disc": report["disc"],
        "area": report["area"],
        "scn3FileOffset": hx(scn3),
        "generatedFunctionCount": len(starts),
        "dialoguePathFunctionCount": len(path_starts),
        "linearDisassemblyInstructionCount": len(instructions),
        "reachableInstructionCount": len(total_reached),
        "dialoguePathReachableInstructionCount": len(path_reached),
        "reachableMnemonics": dict(sorted(mnemonic_counts.items())),
        "dialoguePathReachableMnemonics": dict(sorted(path_mnemonics.items())),
        "reachableOperandSignatures": dict(sorted(signature_counts.items())),
        "dialoguePathReachableOperandSignatures": dict(sorted(path_signatures.items())),
        "unresolvedControlTransfers": unresolved,
    }


def merge_counts(
    reports: Sequence[dict[str, Any]],
    key: str,
) -> dict[str, int]:
    total: Counter[str] = Counter()
    for report in reports:
        total.update(report[key])
    return dict(sorted(total.items()))


def build_report(call_graph: dict[str, Any], objdump: str) -> dict[str, Any]:
    maps = [map_profile(report, objdump) for report in call_graph["maps"]]
    return {
        "schema": "new-yokosuka-dialogue-reachable-sh4-profile-v1",
        "evidenceBoundary": [
            "Reachability starts only at exact generated-function prologues recovered from dialogue-bearing SCN3 programs.",
            "Direct branches, compiler literal-relative BRAF resumes, and SH-4 delay slots are modeled; embedded literal pools skipped by those branches are not counted as code.",
            "Every side of a conditional branch is retained. Reachable means executable for some state, not observed in a particular save.",
            "Indirect JMP transfers and BRAF forms without an exact adjacent literal are reported unresolved rather than guessed.",
            "Dialogue-path functions are only functions present on recovered launch/call paths. Helper callees and seven unresolved engine-scheduler entries remain bounded by the call-graph evidence.",
            "This is an interpreter-feasibility profile, not a browser implementation or a claim that operation semantics are complete.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            "generatedFunctionCount": sum(item["generatedFunctionCount"] for item in maps),
            "dialoguePathFunctionCount": sum(item["dialoguePathFunctionCount"] for item in maps),
            "linearDisassemblyInstructionCount": sum(
                item["linearDisassemblyInstructionCount"] for item in maps
            ),
            "reachableInstructionCount": sum(
                item["reachableInstructionCount"] for item in maps
            ),
            "dialoguePathReachableInstructionCount": sum(
                item["dialoguePathReachableInstructionCount"] for item in maps
            ),
            "unresolvedControlTransferCount": sum(
                len(item["unresolvedControlTransfers"]) for item in maps
            ),
            "reachableMnemonicCount": len(merge_counts(maps, "reachableMnemonics")),
            "dialoguePathReachableMnemonicCount": len(
                merge_counts(maps, "dialoguePathReachableMnemonics")
            ),
            "reachableOperandSignatureCount": len(
                merge_counts(maps, "reachableOperandSignatures")
            ),
            "dialoguePathReachableOperandSignatureCount": len(
                merge_counts(maps, "dialoguePathReachableOperandSignatures")
            ),
        },
        "reachableMnemonics": merge_counts(maps, "reachableMnemonics"),
        "dialoguePathReachableMnemonics": merge_counts(
            maps,
            "dialoguePathReachableMnemonics",
        ),
        "reachableOperandSignatures": merge_counts(
            maps,
            "reachableOperandSignatures",
        ),
        "dialoguePathReachableOperandSignatures": merge_counts(
            maps,
            "dialoguePathReachableOperandSignatures",
        ),
        "maps": maps,
    }


def source_safe_summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "new-yokosuka-dialogue-native-code-profile-v1",
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "reachableMnemonics": report["reachableMnemonics"],
        "dialoguePathReachableMnemonics": (
            report["dialoguePathReachableMnemonics"]
        ),
        "reachableOperandSignatures": report["reachableOperandSignatures"],
        "dialoguePathReachableOperandSignatures": (
            report["dialoguePathReachableOperandSignatures"]
        ),
        "fullReport": ".disc-work/dialogue/reachable-sh4-profile.json",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--call-graph", type=Path, default=DEFAULT_CALL_GRAPH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=DEFAULT_SUMMARY_OUTPUT,
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    call_graph = json.loads(args.call_graph.read_text())
    if call_graph.get("schema") != "new-yokosuka-dialogue-call-graph-v2":
        raise SystemExit("dialogue call graph v2 is required")
    report = build_report(call_graph, args.objdump)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(source_safe_summary(report), indent=2) + "\n"
    )
    summary = report["summary"]
    print(
        f"Wrote {args.output}: "
        f"{summary['reachableInstructionCount']:,} reachable instructions, "
        f"{summary['dialoguePathReachableInstructionCount']:,} on modeled "
        "dialogue paths"
    )


if __name__ == "__main__":
    main()
