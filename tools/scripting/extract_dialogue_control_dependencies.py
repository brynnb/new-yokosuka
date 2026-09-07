#!/usr/bin/env python3
"""Derive exact branch-exclusive dialogue routes from the native CFG index.

This does not infer high-level game meanings.  It relates a recovered native
scene-field comparison to calls that are reachable on exactly one outcome of
that comparison, then follows the exact native call graph to any recovered
dialogue region.  Compound predicates and paths that reconverge before a call
remain unresolved instead of being guessed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = PROJECT_ROOT / ".disc-work/dialogue/control-flow-index.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/dialogue-control-dependencies.json"
)


def number(value: str) -> int:
    return int(value, 16)


def containing_block(
    blocks: list[dict[str, Any]],
    offset: int,
) -> dict[str, Any] | None:
    return next(
        (
            block
            for block in blocks
            if number(block["startFileOffset"])
            <= offset
            < number(block["endFileOffsetExclusive"])
        ),
        None,
    )


def reachable_blocks(
    blocks_by_start: dict[str, dict[str, Any]],
    start: str,
) -> set[str]:
    reached: set[str] = set()
    pending = [start]
    while pending:
        current = pending.pop()
        if current in reached or current not in blocks_by_start:
            continue
        reached.add(current)
        pending.extend(blocks_by_start[current]["successors"])
    return reached


def actions_in_blocks(
    function: dict[str, Any],
    block_starts: set[str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    blocks = {
        block["startFileOffset"]: block
        for block in function["basicBlocks"]
    }
    selected_blocks = [blocks[start] for start in block_starts]

    def contains(call: dict[str, Any]) -> bool:
        return containing_block(
            selected_blocks,
            number(call["callFileOffset"]),
        ) is not None

    return (
        [call for call in function["directCalls"] if contains(call)],
        [
            launch
            for launch in function["childCoroutineLaunches"]
            if contains(launch)
        ],
    )


def dialogue_descendants(
    functions_by_start: dict[str, dict[str, Any]],
    roots: Iterable[str],
) -> list[dict[str, Any]]:
    reached: set[str] = set()
    pending = list(roots)
    regions: dict[tuple[int, str], dict[str, Any]] = {}
    while pending:
        current = pending.pop()
        if current in reached:
            continue
        reached.add(current)
        function = functions_by_start.get(current)
        if function is None:
            continue
        region = function.get("dialogueRegion")
        if region is not None:
            key = (
                region["executableTargetIndex"],
                current,
            )
            regions[key] = {
                "functionFileOffset": current,
                **region,
            }
        pending.extend(
            call["targetFileOffset"]
            for call in function["directCalls"]
        )
        pending.extend(
            launch["targetFileOffset"]
            for launch in function["childCoroutineLaunches"]
        )
    return [
        regions[key]
        for key in sorted(regions)
    ]


def outcome(
    function: dict[str, Any],
    functions_by_start: dict[str, dict[str, Any]],
    exclusive_blocks: set[str],
) -> dict[str, Any]:
    calls, launches = actions_in_blocks(function, exclusive_blocks)
    roots = [
        action["targetFileOffset"]
        for action in (*calls, *launches)
    ]
    return {
        "exclusiveBlockCount": len(exclusive_blocks),
        "exclusiveDirectCalls": calls,
        "exclusiveChildCoroutineLaunches": launches,
        "dialogueDescendants": dialogue_descendants(
            functions_by_start,
            roots,
        ),
    }


def dependencies_for_map(item: dict[str, Any]) -> list[dict[str, Any]]:
    functions_by_start = {
        function["fileOffset"]: function
        for function in item["dialoguePathFunctions"]
    }
    result = []
    for function in item["dialoguePathFunctions"]:
        blocks_by_start = {
            block["startFileOffset"]: block
            for block in function["basicBlocks"]
        }
        for comparison in function["sceneFieldComparisons"]:
            branch = comparison.get("resolvedBranch")
            if branch is None:
                continue
            true_reached = reachable_blocks(
                blocks_by_start,
                branch["comparisonTrueSuccessor"],
            )
            false_reached = reachable_blocks(
                blocks_by_start,
                branch["comparisonFalseSuccessor"],
            )
            true_result = outcome(
                function,
                functions_by_start,
                true_reached - false_reached,
            )
            false_result = outcome(
                function,
                functions_by_start,
                false_reached - true_reached,
            )
            if not (
                true_result["exclusiveDirectCalls"]
                or false_result["exclusiveDirectCalls"]
                or true_result["exclusiveChildCoroutineLaunches"]
                or false_result["exclusiveChildCoroutineLaunches"]
                or true_result["dialogueDescendants"]
                or false_result["dialogueDescendants"]
            ):
                continue
            result.append({
                "functionFileOffset": function["fileOffset"],
                "comparison": comparison,
                "whenComparisonTrue": true_result,
                "whenComparisonFalse": false_result,
            })
    return result


def build_report(index: dict[str, Any]) -> dict[str, Any]:
    maps = []
    for item in index["maps"]:
        dependencies = dependencies_for_map(item)
        if dependencies:
            maps.append({
                "disc": item["disc"],
                "area": item["area"],
                "mapinfoSha256": item["mapinfoSha256"],
                "dependencies": dependencies,
            })
    dependencies = [
        dependency
        for item in maps
        for dependency in item["dependencies"]
    ]
    return {
        "schema": "new-yokosuka-dialogue-control-dependencies-v1",
        "evidenceBoundary": [
            "Every listed relation is branch-exclusive reachability in the recovered native SH-4 control-flow graph.",
            "Comparison outcomes account for the compiler's intervening SH-4 boolean-normalization instructions; bt/bf direction is not guessed.",
            "Dialogue descendants are reached only through exact direct calls or exact child-coroutine launch targets.",
            "Comparisons without a resolvable branch, compound paths that reconverge before their action, and dynamic transfers remain absent rather than inferred.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            "branchExclusiveDependencyCount": len(dependencies),
            "trueDialogueRegionCount": sum(
                len(item["whenComparisonTrue"]["dialogueDescendants"])
                for item in dependencies
            ),
            "falseDialogueRegionCount": sum(
                len(item["whenComparisonFalse"]["dialogueDescendants"])
                for item in dependencies
            ),
        },
        "maps": maps,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(json.loads(args.input.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['branchExclusiveDependencyCount']} "
        "branch-exclusive dependencies"
    )


if __name__ == "__main__":
    main()
