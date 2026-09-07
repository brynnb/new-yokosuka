#!/usr/bin/env python3
"""Join native trigger geometry, callbacks, destinations, and entry placement.

This is deliberately a join over independently extracted evidence.  It does
not infer destinations from proximity, area names, or the browser's existing
warp configuration.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "tools" / "evidence"


def load(name: str) -> dict:
    return json.loads((EVIDENCE / name).read_text())


def entry_index(entry_report: dict) -> dict[tuple[int, str, int], dict]:
    result = {}
    for map_record in entry_report["maps"]:
        for entry in map_record["entries"]:
            result[(map_record["scene"], map_record["area"], entry["entry"])] = {
                "position": entry["position"],
                "facingDegrees": entry["facingDegrees"],
                "browserProjection": entry["browserProjection"],
                "recordOffset": entry["recordOffset"],
                "sourceSha256": map_record["sourceSha256"],
                "mapDirection": map_record.get("mapDirection"),
                "sourceKind": "typed Entry/Position/Angle record",
            }
        default_player = map_record.get("defaultPlayerPlacement")
        default_key = (map_record["scene"], map_record["area"], 0)
        if default_player is not None and default_key not in result:
            result[default_key] = {
                "position": default_player["position"],
                "facingDegrees": default_player["facingDegrees"],
                "browserProjection": default_player["browserProjection"],
                "recordOffset": default_player["recordOffset"],
                "sourceSha256": map_record["sourceSha256"],
                "mapDirection": map_record.get("mapDirection"),
                "sourceKind": default_player["sourceKind"],
                "model": default_player["model"],
                "evidence": default_player["evidence"],
            }
    return result


def attach_entry(destination: dict, entries: dict) -> dict:
    destination = dict(destination)
    destination["entryPlacement"] = entries.get(
        (destination["scene"], destination["area"], destination["entry"])
    )
    return destination


def resolve_volume(volume: dict, callback_map: dict, entries: dict) -> dict:
    record = {
        **volume,
        "callback": None,
        "resolution": "unresolved",
        "routes": [],
    }
    if callback_map is None:
        record["unresolvedReason"] = (
            "Native callback table/dispatcher has not yet been recovered."
        )
        return record

    callbacks = {item["eventId"]: item for item in callback_map["callbacks"]}
    callback = callbacks.get(volume["eventId"])
    if callback is None:
        record["unresolvedReason"] = "No callback exists for this native event ID."
        return record

    record["callback"] = {
        "functionFileOffset": callback["functionFileOffset"],
        "selectorWrite": callback["selectorWrite"],
    }
    routes = callback["transitionRoutes"]
    if not routes and callback["selectorWrite"] and callback_map.get("selectorDispatch"):
        value = callback["selectorWrite"]["value"]
        routes = [
            route
            for route in callback_map["selectorDispatch"]["routes"]
            if route["selectorValue"] == value
        ]
        if routes:
            record["callback"]["selectorDispatchFunctionFileOffset"] = (
                callback_map["selectorDispatch"]["dispatchFunctionFileOffset"]
            )

    record["routes"] = [
        {
            **{key: value for key, value in route.items() if key != "destination"},
            "destination": attach_entry(route["destination"], entries),
        }
        for route in routes
    ]
    if record["routes"]:
        record["resolution"] = "exact"
    else:
        record["unresolvedReason"] = (
            "Callback is known, but its transition dispatch remains unresolved."
        )
    return record


def enrich_door(record: dict, entries: dict) -> dict:
    enriched = dict(record)
    if "destination" in enriched:
        enriched["destination"] = attach_entry(enriched["destination"], entries)
    if "whenTrue" in enriched:
        enriched["whenTrue"] = attach_entry(enriched["whenTrue"], entries)
    if "whenFalse" in enriched:
        enriched["whenFalse"] = attach_entry(enriched["whenFalse"], entries)
    if "routes" in enriched:
        enriched["routes"] = [
            {
                **route,
                "destination": attach_entry(route["destination"], entries),
            }
            for route in enriched["routes"]
        ]
    return enriched


def main() -> None:
    volumes = load("map-event-volumes.json")
    callbacks = load("map-event-callbacks.json")
    entry_report = load("map-entry-points.json")
    doors = load("d000-door-transitions.json")
    transition_objects = load("map-transition-objects.json")

    entries = entry_index(entry_report)
    callback_maps = {
        (item["disc"], item["area"]): item for item in callbacks["maps"]
    }
    callback_class_volumes = volumes["callbackClassVolumes"]
    native_volumes = [
        resolve_volume(
            volume,
            callback_maps.get((volume["disc"], volume["area"])),
            entries,
        )
        for volume in callback_class_volumes
        if (volume["disc"], volume["area"]) in callback_maps
    ]
    unclassified_callback_events = [
        volume
        for volume in callback_class_volumes
        if (volume["disc"], volume["area"]) not in callback_maps
    ]
    exact = sum(item["resolution"] == "exact" for item in native_volumes)
    missing_placements = sum(
        route["destination"]["entryPlacement"] is None
        for item in native_volumes
        for route in item["routes"]
    )

    report = {
        "schema": "new-yokosuka-map-warp-inventory-v1",
        "generatedFrom": [
            "tools/evidence/map-event-volumes.json",
            "tools/evidence/map-event-callbacks.json",
            "tools/evidence/map-entry-points.json",
            "tools/evidence/d000-door-transitions.json",
            "tools/evidence/map-transition-objects.json",
        ],
        "summary": {
            "nativeVolumeCount": len(native_volumes),
            "resolvedNativeVolumeCount": exact,
            "unresolvedNativeVolumeCount": len(native_volumes) - exact,
            "unclassifiedCallbackEventCount": len(
                unclassified_callback_events
            ),
            "nativeRouteCount": sum(len(item["routes"]) for item in native_volumes),
            "nativeRouteMissingEntryPlacementCount": missing_placements,
            "resolvedD000DirectDoorCount": len(doors["directTransitions"]),
            "resolvedD000ConditionalDoorCount": len(doors["conditionalTransitions"]),
            "resolvedD000TransitionSelectorCount": doors["summary"][
                "resolvedTransitionSelectorCount"
            ],
            "nativeD000NonTransitionSelectorCount": doors["summary"][
                "nativeNonTransitionSelectorCount"
            ],
            "unresolvedD000WarpSelectorCount": doors["summary"][
                "unresolvedTransitionSelectorCount"
            ],
            "unresolvedD000InteractionSelectorCount": doors["summary"][
                "unresolvedInteractionSelectorCount"
            ],
            "nativeDoorControllerRecordCount": transition_objects["summary"][
                "doorControllerRecordCount"
            ],
            "exactDoorControllerDestinationAssociationCount": (
                transition_objects["summary"][
                    "exactTransitionAssociatedRecordCount"
                ]
            ),
        },
        "nativeTransitionVolumes": native_volumes,
        "unclassifiedCallbackEvents": unclassified_callback_events,
        "d000DoorTransitions": {
            "direct": [
                enrich_door(item, entries) for item in doors["directTransitions"]
            ],
            "conditional": [
                enrich_door(item, entries) for item in doors["conditionalTransitions"]
            ],
            "nativeNonTransitionSelectors": doors[
                "nativeNonTransitionSelectors"
            ],
            "unresolvedInteractionSelectors": doors[
                "unresolvedInteractionSelectors"
            ],
        },
        "nativeDoorControllerObjects": transition_objects["maps"],
        "evidenceBoundary": [
            "Only exact native records and statically proven callback routes are joined.",
            "A null entryPlacement means the destination is proven but neither a typed Entry record nor a uniquely serialized CHRS Character AKIR default placement was extracted.",
            "CHRS AKIR is accepted only for entry 0: in maps containing both forms its Position/Angle is bit-identical to typed Entry 0. Partial-body records such as YKUR are never promoted.",
            "MFSY event 1 is retained as an unclassified class-4 event, not called a warp: MFSY installs no operation-0x0001 callback table.",
            "Every D000 call to the shared warp coroutine is assigned to one exact selector route. Selectors with no warp call remain separately catalogued as unresolved non-warp interactions.",
            "Door-controller transforms are structurally typed serialized records whose sequential controller words end in 0x02ab; destinations are attached only through exact callbacks in the same MAPINFO, never spatial matching.",
        ],
    }
    output = EVIDENCE / "map-warp-inventory.json"
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {output.relative_to(ROOT)}: {exact}/{len(native_volumes)} "
        f"native volumes resolved"
    )


if __name__ == "__main__":
    main()
