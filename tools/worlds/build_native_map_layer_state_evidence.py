#!/usr/bin/env python3
"""Build exact browser-ready numbered MAP-layer state rules.

The native operation 0x0098 handler writes operand[1] to one of 32 map
resource records selected by operand[0].  A zero value makes the native
per-frame resource loop skip that layer; a nonzero value activates it.

This first generated rule set contains the D000 clock-owned writes whose
control-flow ownership is already proven by d000-time-window-evidence.json.
Other operation-0x0098 writes remain in scripted-world-state-inventory.json
until their predicates are recovered; they are never guessed here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def operation_98_assignments(calls: list[dict[str, Any]]) -> list[dict[str, int]]:
    result = []
    for call in calls:
        if call.get("operation") != "0x0098":
            continue
        arguments = call.get("arguments", [])
        if (
            len(arguments) != 2
            or not all(isinstance(value, int) for value in arguments)
        ):
            continue
        result.append({
            "layer": arguments[0],
            "value": arguments[1],
        })
    return result


def build(source: Path) -> dict[str, Any]:
    source_bytes = source.read_bytes()
    evidence = json.loads(source_bytes)
    rules = []
    for call in evidence["calls"]:
        window = call.get("window")
        branch = call.get("resultBranch", {})
        branches = call.get("branchOwnedDirectCalls", {})
        true_assignments = operation_98_assignments(branches.get("trueOnly", []))
        false_assignments = operation_98_assignments(
            branches.get("falseOnly", [])
        )
        if (
            not window
            or branch.get("classification") != "exactCanonicalBooleanBranch"
            or not true_assignments
            or not false_assignments
        ):
            continue
        rules.append({
            "predicate": {
                "kind": "native-clock-window",
                "startMinute": window["normalizedStartMinute"],
                "endMinute": window["normalizedEndMinute"],
                "dayBoundaryHour": window["dayBoundaryHour"],
                "boundary": window["boundary"],
            },
            "whenTrue": true_assignments,
            "whenFalse": false_assignments,
            "evidence": {
                "predicateCallFileOffset": call["callFileOffset"],
                "compareFileOffset": branch["compareFileOffset"],
                "branchFileOffset": branch["branchFileOffset"],
                "trueSuccessorFileOffset": (
                    branch["trueSuccessorFileOffset"]
                ),
                "falseSuccessorFileOffset": (
                    branch["falseSuccessorFileOffset"]
                ),
                "routine": call["containingRoutine"],
            },
        })
    controlled_layers = sorted({
        assignment["layer"]
        for rule in rules
        for side in ("whenTrue", "whenFalse")
        for assignment in rule[side]
    })
    return {
        "schema": "new-yokosuka-native-map-layer-state-v1",
        "generatedFrom": {
            "path": str(source),
            "sha256": hashlib.sha256(source_bytes).hexdigest(),
        },
        "nativeSemantics": {
            "operation": "0x0098",
            "handlerAddress": "0x0c1649de",
            "getterAddress": "0x0c13080e",
            "setterAddress": "0x0c130824",
            "recordBaseAddress": "0x0c21c768",
            "recordCount": 32,
            "recordStride": 96,
            "activeRule": "record +0x00 != 0",
            "inactiveRule": "record +0x00 == 0",
        },
        "areas": {
            "D000": {
                "worldId": "dobuita",
                "modelPrefix": "S1_D000",
                "controlledLayers": controlled_layers,
                "rules": rules,
            }
        },
        "summary": {
            "areaCount": 1,
            "ruleCount": len(rules),
            "controlledLayerCount": len(controlled_layers),
        },
        "evidenceBoundary": (
            "Only literal D000 clock predicates with exact canonical branch "
            "ownership on both sides are executable here. The whole-disc "
            "operation-0x0098 inventory is retained separately; no story, "
            "season, weather, or runtime-valued predicate is synthesized."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("tools/evidence/d000-time-window-evidence.json"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("play/data/native-map-layer-states.json"),
    )
    args = parser.parse_args()
    report = build(args.source)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {report['summary']['ruleCount']} rules over "
        f"{report['summary']['controlledLayerCount']} numbered layers"
    )


if __name__ == "__main__":
    main()
