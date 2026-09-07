#!/usr/bin/env python3
"""Inventory exact native state inputs required to select player portal routes."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parents[2]


def condition_atoms(condition: dict[str, Any] | None) -> Iterator[dict[str, Any]]:
    if not condition:
        return
    operator = condition.get("operator")
    if operator in {"all", "any"}:
        for term in condition.get("terms", []):
            yield from condition_atoms(term)
        return
    if operator == "not":
        yield from condition_atoms(condition.get("term"))
        return
    if operator != "otherwise":
        yield condition


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=ROOT / "tools/evidence/player-portal-inventory.json",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "tools/evidence/player-portal-state-requirements.json",
    )
    args = parser.parse_args()

    inventory = json.loads(args.input.read_text())
    branches: list[dict[str, Any]] = []
    flag_keys: set[tuple[int, int]] = set()
    predicate_keys: set[tuple[Any, ...]] = set()
    operator_counts: Counter[str] = Counter()

    for transition_class in ("portals", "nonPortalTransitions"):
        for transition in inventory[transition_class]:
            for binding in transition.get("physicalSourceBindings", []):
                condition = binding.get("source", {}).get("condition")
                if condition is None:
                    continue
                atoms = list(condition_atoms(condition))
                for atom in atoms:
                    operator = atom["operator"]
                    operator_counts[operator] += 1
                    if operator in {"flagClear", "flagSet"}:
                        flag_keys.add((atom["namespace"], atom["flag"]))
                    elif operator == "nativePredicateGreaterThan":
                        predicate_keys.add((
                            atom["functionFileOffset"],
                            tuple(atom.get("arguments", [])),
                            atom["threshold"],
                        ))

                source = binding["source"]
                branches.append({
                    "transitionClass": transition_class,
                    "source": {
                        "disc": source.get("disc"),
                        "scene": source.get("scene"),
                        "area": source.get("area"),
                        "doorSelector": source.get("doorSelector"),
                        "branchIndex": source.get("branchIndex"),
                        "selectorCompareFileOffset": source.get(
                            "selectorCompareFileOffset"
                        ),
                    },
                    "destination": binding["destination"],
                    "condition": condition,
                    "stateAtoms": atoms,
                })

    branches.sort(key=lambda item: (
        item["source"]["disc"] or 0,
        item["source"]["area"] or "",
        item["source"]["doorSelector"] or -1,
        item["source"]["branchIndex"] or -1,
        item["destination"]["area"],
        item["destination"]["entry"],
    ))

    report = {
        "schema": "new-yokosuka-player-portal-state-requirements-v1",
        "generatedFrom": str(args.input.relative_to(ROOT)),
        "summary": {
            "conditionalBranchCount": len(branches),
            "conditionalDoorSelectorCount": len({
                (
                    item["source"]["disc"],
                    item["source"]["area"],
                    item["source"]["doorSelector"],
                )
                for item in branches
            }),
            "persistentFlagCount": len(flag_keys),
            "nativePredicateCount": len(predicate_keys),
            "atomOperatorCounts": dict(sorted(operator_counts.items())),
        },
        "persistentFlags": [
            {
                "namespace": namespace,
                "flag": flag,
                "nativeOperation": "0x0051",
                "readSubcommand": 11 if namespace == 2 else None,
            }
            for namespace, flag in sorted(flag_keys)
        ],
        "nativePredicates": [
            {
                "functionFileOffset": function,
                "arguments": list(arguments),
                "threshold": threshold,
                "status": "requires native predicate recovery",
            }
            for function, arguments, threshold in sorted(predicate_keys)
        ],
        "branches": branches,
        "evidenceBoundary": (
            "This inventory preserves only condition trees already recovered "
            "from native transition control flow. It does not assign default "
            "flag values, synthesize story state, or choose a fallback branch. "
            "A conditional portal remains non-executable until every atom in "
            "its selected native condition can be evaluated exactly."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
