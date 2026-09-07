#!/usr/bin/env python3
"""Join every recovered transition edge to entry and physical-source evidence.

The transition-call catalog proves destinations, while the warp inventory
proves only the smaller set of native volumes and door controllers that can be
bound to a physical source without spatial guesses.  Keeping those facts
separate prevents a recovered destination call from being presented as a
clickable door before its dispatcher/controller association is known.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "tools" / "evidence"


def load(name: str) -> dict[str, Any]:
    return json.loads((EVIDENCE / name).read_text())


def destination_key(destination: dict[str, Any]) -> tuple[int, str, int]:
    return (
        destination["scene"],
        destination["area"],
        destination["entry"],
    )


def entry_index(report: dict[str, Any]) -> dict[tuple[int, str, int], dict]:
    result: dict[tuple[int, str, int], dict] = {}
    for map_record in report["maps"]:
        for entry in map_record["entries"]:
            result[
                (
                    map_record["scene"],
                    map_record["area"],
                    entry["entry"],
                )
            ] = {
                "sourceKind": "typed Entry/Position/Angle record",
                "recordOffset": entry["recordOffset"],
                "position": entry["position"],
                "facingDegrees": entry["facingDegrees"],
                "browserProjection": entry["browserProjection"],
                "sourceSha256": map_record["sourceSha256"],
            }
        default = map_record.get("defaultPlayerPlacement")
        key = (map_record["scene"], map_record["area"], 0)
        if default is not None and key not in result:
            result[key] = {
                **default,
                "sourceSha256": map_record["sourceSha256"],
            }
    return result


def exact_door_bindings(
    transition_objects: dict[str, Any],
) -> list[dict[str, Any]]:
    bindings = []
    for map_record in transition_objects["maps"]:
        source = map_record["source"]
        for door in map_record.get("doorControllerRecords", []):
            if door.get("transitionAssociation") != (
                "exactSingleOutgoingDestination"
            ):
                continue
            bindings.append(
                {
                    "kind": "typed-door-controller",
                    "source": source,
                    "door": {
                        key: door[key]
                        for key in (
                            "name",
                            "recordFileOffset",
                            "controllerIds",
                            "scale",
                            "nativeTransform",
                            "browserProjection",
                        )
                    },
                    "destination": door["destination"],
                    "selectionRule": door["destinationSelectionRule"],
                }
            )
    return bindings


def exact_volume_bindings(
    warp_inventory: dict[str, Any],
) -> list[dict[str, Any]]:
    bindings = []
    for volume in warp_inventory["nativeTransitionVolumes"]:
        if volume["resolution"] != "exact":
            continue
        for route in volume["routes"]:
            bindings.append(
                {
                    "kind": "native-event-volume",
                    "source": {
                        "disc": volume["disc"],
                        "scene": volume["disc"],
                        "area": volume["area"],
                        "eventId": volume["eventId"],
                        "recordFileOffset": volume["recordFileOffset"],
                        "flagHex": volume["flagHex"],
                        "browserShape": volume["browserShape"],
                    },
                    "destination": {
                        key: route["destination"][key]
                        for key in ("scene", "area", "entry")
                    },
                    "callFileOffset": route["callFileOffset"],
                    "callbackFileOffset": volume["callback"][
                        "functionFileOffset"
                    ],
                }
            )
    return bindings


def d000_selector_bindings(
    warp_inventory: dict[str, Any],
) -> list[dict[str, Any]]:
    bindings = []
    direct = warp_inventory["d000DoorTransitions"]["direct"]
    for route in direct:
        bindings.append(
            {
                "kind": "d000-door-selector",
                "source": {
                    "disc": 1,
                    "scene": 1,
                    "area": "D000",
                    "doorSelector": route["selector"],
                    "selectorCaseFileOffset": route["caseFileOffset"],
                },
                "destination": {
                    key: route["destination"][key]
                    for key in ("scene", "area", "entry")
                },
                "callFileOffset": route["coroutineCallFileOffset"],
            }
        )
    for route in warp_inventory["d000DoorTransitions"]["conditional"]:
        branches = route.get("orderedRoutes") or route.get("routes")
        if branches is None:
            branches = [
                {
                    "condition": route["condition"],
                    "destination": route["whenTrue"],
                    "branch": "whenTrue",
                },
                {
                    "condition": {
                        "operator": "not",
                        "term": route["condition"],
                    },
                    "destination": route["whenFalse"],
                    "branch": "whenFalse",
                },
            ]
        for route_index, branch in enumerate(branches):
            destination = branch["destination"]
            bindings.append(
                {
                    "kind": "d000-conditional-door-selector",
                    "source": {
                        "disc": 1,
                        "scene": 1,
                        "area": "D000",
                        "doorSelector": route["selector"],
                        "branchIndex": route_index,
                        "branch": branch.get("branch"),
                        "condition": branch["condition"],
                        "selectorCompareFileOffset": route[
                            "selectorCompareFileOffset"
                        ],
                    },
                    "destination": {
                        key: destination[key]
                        for key in ("scene", "area", "entry")
                    },
                }
            )
    return bindings


def binding_key(binding: dict[str, Any]) -> tuple[int, str, int, str, int]:
    source = binding["source"]
    destination = binding["destination"]
    return (
        source["scene"],
        source["area"],
        destination["scene"],
        destination["area"],
        destination["entry"],
    )


def main() -> None:
    catalog = load("map-transition-catalog.json")
    entries = entry_index(load("map-entry-points.json"))
    warp_inventory = load("map-warp-inventory.json")
    transition_objects = load("map-transition-objects.json")

    bindings = [
        *exact_volume_bindings(warp_inventory),
        *exact_door_bindings(transition_objects),
        *d000_selector_bindings(warp_inventory),
    ]
    bindings_by_edge: dict[tuple[int, str, int, str, int], list[dict]] = {}
    for binding in bindings:
        bindings_by_edge.setdefault(binding_key(binding), []).append(binding)

    edges = []
    for edge in catalog["exactEdges"]:
        source = edge["source"]
        destination = edge["destination"]
        key = (
            source["scene"],
            source["area"],
            destination["scene"],
            destination["area"],
            destination["entry"],
        )
        edge_bindings = bindings_by_edge.get(key, [])
        placement = entries.get(destination_key(destination))
        edges.append(
            {
                **edge,
                "destination": {
                    **destination,
                    "entryPlacement": placement,
                },
                "physicalSourceBindings": edge_bindings,
                "physicalSourceStatus": (
                    "exact"
                    if edge_bindings
                    else "destination-only; physical dispatcher unbound"
                ),
            }
        )

    dynamic_calls = []
    helper_targets = {
        transition["operationCallFileOffset"]
        for map_record in catalog["maps"]
        for transition in map_record.get("localHelperTransitions", [])
    }
    for map_record in catalog["maps"]:
        for transition in map_record.get("transitions", []):
            if transition.get("classification") != "dynamic":
                continue
            dynamic_calls.append(
                {
                    "source": map_record["source"],
                    **transition,
                    "status": (
                        "shared transition helper; exact callers enumerated"
                        if transition["callFileOffset"] in helper_targets
                        else "runtime destination component unresolved"
                    ),
                }
            )

    exact_physical_edges = sum(
        edge["physicalSourceStatus"] == "exact" for edge in edges
    )
    report = {
        "schema": "new-yokosuka-map-transition-coverage-v1",
        "generatedFrom": [
            "tools/evidence/map-transition-catalog.json",
            "tools/evidence/map-entry-points.json",
            "tools/evidence/map-warp-inventory.json",
            "tools/evidence/map-transition-objects.json",
        ],
        "summary": {
            "mapInfoCount": catalog["summary"]["mapInfoCount"],
            "exactDestinationEdgeCount": len(edges),
            "exactDestinationEdgeWithEntryPlacementCount": sum(
                edge["destination"]["entryPlacement"] is not None
                for edge in edges
            ),
            "exactPhysicalSourceBindingCount": len(bindings),
            "exactEdgeWithPhysicalSourceBindingCount": exact_physical_edges,
            "destinationOnlyEdgeCount": len(edges) - exact_physical_edges,
            "dynamicTransitionCallCount": len(dynamic_calls),
            "dynamicSharedHelperCount": sum(
                call["status"].startswith("shared") for call in dynamic_calls
            ),
            "trueRuntimeDestinationCallCount": sum(
                call["status"].startswith("runtime") for call in dynamic_calls
            ),
        },
        "edges": edges,
        "physicalSourceBindings": bindings,
        "dynamicCalls": dynamic_calls,
        "evidenceBoundary": (
            "Every edge is an exact statically decoded operation-0x0030 "
            "destination. A physical source is attached only through a native "
            "EVNT callback, an exact typed door-controller association, or "
            "the recovered D000 selector dispatcher. Destination-only edges "
            "must not be turned into clickable doors or volumes by proximity."
        ),
    }
    output = EVIDENCE / "map-transition-coverage.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {output.relative_to(ROOT)}: {len(edges)} exact edges, "
        f"{exact_physical_edges} physically bound, "
        f"{report['summary']['trueRuntimeDestinationCallCount']} true dynamic"
    )


if __name__ == "__main__":
    main()
