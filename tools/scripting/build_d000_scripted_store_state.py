#!/usr/bin/env python3
"""Join Dobuita's native clock layers to physical door records geometrically.

Only standalone layers whose native rule toggles that single layer are
included. Paired day/evening map variants are excluded. A door binding is
emitted only when its authored source point lies inside an authored
component's horizontal bounds.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LAYER_STATES = ROOT / "play/data/native-map-layer-states.json"
GEOMETRY = ROOT / "tools/evidence/d000-map-layer-geometry.json"
DOOR_LOGIC = ROOT / "tools/evidence/d000-door-logic.json"
OUTPUT = ROOT / "tools/evidence/d000-scripted-store-state.json"


def load(path: Path):
    return json.loads(path.read_text())


def door_rows(logic):
    # Physical table indices are not the argument of the transition coroutine.
    # Containment cannot establish a destination or absence of a player portal.
    return [
        {
            "selector": door["selector"],
            "dispatchKind": "unresolved",
            "destination": None,
            "sourceDoor": {
                key: door[key]
                for key in ("visibleStaticDoorIndex", "model", "position",
                            "rotationDegrees", "usesInvisibleProxy")
            },
        }
        for door in logic["doors"]
    ]


def main():
    states = load(LAYER_STATES)["areas"]["D000"]
    geometry = {
        layer["layer"]: layer
        for layer in load(GEOMETRY)["layers"]
    }
    doors = door_rows(load(DOOR_LOGIC))
    overlays = []

    for rule in states["rules"]:
        assignments = rule["whenTrue"] + rule["whenFalse"]
        layer_ids = {assignment["layer"] for assignment in assignments}
        if len(layer_ids) != 1:
            continue
        layer = next(iter(layer_ids))
        active_inside = next(
            assignment["value"]
            for assignment in rule["whenTrue"]
            if assignment["layer"] == layer
        )
        active_outside = next(
            assignment["value"]
            for assignment in rule["whenFalse"]
            if assignment["layer"] == layer
        )
        if active_inside != 0 or active_outside == 0:
            continue

        component_bindings = []
        layer_geometry = geometry[layer]
        for component_index, component in enumerate(layer_geometry["components"]):
            minimum = component["minimum"]
            maximum = component["maximum"]
            matches = []
            for door in doors:
                x, _y, z = door["sourceDoor"]["position"]
                if (
                    minimum[0] <= x <= maximum[0]
                    and minimum[2] <= z <= maximum[2]
                ):
                    matches.append(door)
            if matches:
                component_bindings.append(
                    {
                        "componentIndex": component_index,
                        "meshName": component["meshName"],
                        "triangleCount": component["triangleCount"],
                        "minimum": minimum,
                        "maximum": maximum,
                        "containedDoorSources": matches,
                    }
                )

        overlays.append(
            {
                "layer": layer,
                "classification": "standalone-native-clock-overlay",
                "openWindow": rule["predicate"],
                "activeOutsideOpenWindow": True,
                "geometry": {
                    "componentCount": len(layer_geometry["components"]),
                    "triangleCount": layer_geometry["triangleCount"],
                    "minimum": [
                        min(component["minimum"][axis]
                            for component in layer_geometry["components"])
                        for axis in range(3)
                    ],
                    "maximum": [
                        max(component["maximum"][axis]
                            for component in layer_geometry["components"])
                        for axis in range(3)
                    ],
                },
                "exactHorizontalContainmentBindings": component_bindings,
                "evidence": rule["evidence"],
            }
        )

    output = {
        "schema": "new-yokosuka-d000-scripted-store-state-v1",
        "source": {
            "nativeLayerState": str(LAYER_STATES.relative_to(ROOT)),
            "geometry": str(GEOMETRY.relative_to(ROOT)),
            "physicalDoors": str(DOOR_LOGIC.relative_to(ROOT)),
        },
        "evidenceBoundary": (
            "Layers are exact native clock assignments and geometry is exact "
            "decoded MT5 geometry. Door associations require exact horizontal "
            "point-in-component-AABB containment; no nearest-door threshold or "
            "store-name inference is used. This establishes spatial containment only, "
            "not dispatch, player access, opening hours, or a missing portal."
        ),
        "summary": {
            "standaloneClockOverlays": len(overlays),
            "overlaysWithContainedDoorSources": sum(
                bool(item["exactHorizontalContainmentBindings"])
                for item in overlays
            ),
            "containedDoorSources": sum(
                len(binding["containedDoorSources"])
                for item in overlays
                for binding in item["exactHorizontalContainmentBindings"]
            ),
        },
        "overlays": overlays,
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output["summary"], indent=2))


if __name__ == "__main__":
    main()
