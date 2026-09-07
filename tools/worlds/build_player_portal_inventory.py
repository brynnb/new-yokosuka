#!/usr/bin/env python3
"""Classify recovered transition calls by their proven player-facing source.

MAPINFO contains many exact transition destinations that are invoked by
cutscenes and story scripts.  A literal destination is not, by itself,
evidence for a walk-over volume or clickable door.  This report keeps that
distinction explicit and identifies the subset that has both a native
physical source binding and an exact destination placement.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "tools" / "evidence"


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def edge_key(record: dict[str, Any]) -> tuple[int, str, int, str, int]:
    source = record["source"]
    destination = record["destination"]
    return (
        source["scene"],
        source["area"],
        destination["scene"],
        destination["area"],
        destination["entry"],
    )


def runtime_edge_keys(runtime: dict[str, Any]) -> set[tuple[int, str, int, str, int]]:
    keys: set[tuple[int, str, int, str, int]] = set()
    groups = (
        runtime.get("d000DirectTransitions", []),
        runtime.get("interiorReturnTransitions", []),
        runtime.get("allExactDoorTransitions", []),
        runtime.get("runtimeNativeVolumeTransitions", []),
    )
    for group in groups:
        for record in group:
            if not record.get("supported", True):
                continue
            source = record.get("source", {})
            destination = record.get("destination", {})
            source_scene = source.get("scene", source.get("disc"))
            if source_scene is None or "area" not in source or not {
                "scene",
                "area",
                "entry",
            }.issubset(destination):
                continue
            keys.add(
                (
                    source_scene,
                    source["area"],
                    destination["scene"],
                    destination["area"],
                    destination["entry"],
                )
            )
    return keys


def classification(edge: dict[str, Any]) -> tuple[str, str]:
    has_source = bool(edge["physicalSourceBindings"])
    has_entry = edge["destination"]["entryPlacement"] is not None
    if has_source and has_entry:
        return (
            "native-player-portal",
            "exact physical trigger and exact destination placement",
        )
    if has_source:
        return (
            "native-physical-trigger-to-scripted-destination",
            "exact physical trigger, but destination has no free-roam Entry/"
            "default-player placement",
        )
    if has_entry:
        return (
            "destination-only-source-unbound",
            "exact destination and placement, but no physical door/volume "
            "dispatcher is proven",
        )
    return (
        "scripted-or-unbound-transition",
        "exact destination call only; neither a physical player trigger nor "
        "a free-roam destination placement is proven",
    )


def main() -> None:
    coverage = load(EVIDENCE / "map-transition-coverage.json")
    runtime_path = ROOT / "play" / "data" / "native-map-transitions.json"
    runtime = load(runtime_path)
    implemented = runtime_edge_keys(runtime)

    records = []
    counts: dict[str, int] = {}
    for edge in coverage["edges"]:
        category, reason = classification(edge)
        counts[category] = counts.get(category, 0) + 1
        key = edge_key(edge)
        records.append(
            {
                "source": edge["source"],
                "destination": edge["destination"],
                "callSites": edge["callSites"],
                "physicalSourceBindings": edge["physicalSourceBindings"],
                "classification": category,
                "classificationReason": reason,
                "browserRuntimeEdgePresent": key in implemented,
            }
        )

    portal_records = [
        record
        for record in records
        if record["classification"] == "native-player-portal"
    ]
    output = {
        "schema": "new-yokosuka-player-portal-inventory-v1",
        "generatedFrom": [
            "tools/evidence/map-transition-coverage.json",
            "play/data/native-map-transitions.json",
        ],
        "summary": {
            "exactTransitionEdgeCount": len(records),
            "classificationCounts": counts,
            "nativePlayerPortalCount": len(portal_records),
            "nativePlayerPortalRuntimeEdgeCount": sum(
                record["browserRuntimeEdgePresent"]
                for record in portal_records
            ),
        },
        "portals": portal_records,
        "nonPortalTransitions": [
            record
            for record in records
            if record["classification"] != "native-player-portal"
        ],
        "evidenceBoundary": (
            "A literal operation-0x0030 destination is never promoted to a "
            "clickable door or walk-over volume. native-player-portal requires "
            "an exact typed door/event-volume/selector binding and an exact "
            "destination Entry or default-player placement. Other categories "
            "remain evidence, not browser interaction rules."
        ),
    }
    destination = EVIDENCE / "player-portal-inventory.json"
    destination.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output["summary"], indent=2))


if __name__ == "__main__":
    main()
