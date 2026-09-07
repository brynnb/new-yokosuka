#!/usr/bin/env python3
"""Project exact native warp evidence into browser-consumable transitions.

This generator deliberately does no spatial matching.  Dobuita doors are
joined by the native door selector, and destination placement comes only from
the native Entry parser evidence.  Destinations whose MAPINFO contains no
matching player Entry are retained as unsupported rather than assigned an
invented origin.
"""

from __future__ import annotations

import gzip
import json
import math
import re
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "tools" / "evidence" / "map-warp-inventory.json"
ENTRY_EVIDENCE = ROOT / "tools" / "evidence" / "map-entry-points.json"
OUTPUT = ROOT / "play" / "data" / "native-map-transitions.json"
MODEL_CATALOG = ROOT / "public" / "models.json"
MAP_CATALOG = ROOT / "public" / "data" / "maps.csv"
SCENE_ROOTS = {
    1: ROOT / "extracted_files" / "data" / "SCENE" / "01",
    2: ROOT / "extracted_disc2_v2" / "data" / "SCENE" / "02",
    3: ROOT / "extracted_disc3_v2" / "data" / "SCENE" / "03",
}


def map_area_names() -> dict[str, str]:
    """Read canonical human-facing area names from the shared map catalog."""
    names = {}
    for line in MAP_CATALOG.read_text(encoding="utf-8-sig").splitlines():
        columns = [column.strip() for column in line.split(";")]
        if len(columns) < 2:
            continue
        name, area = columns[:2]
        if re.fullmatch(r"[A-Z0-9]{4}", area):
            names.setdefault(area, name)
    return dict(sorted(names.items()))


def c_string(data: bytes, offset: int, limit: int) -> str | None:
    if offset < 0 or offset >= limit:
        return None
    end = data.find(b"\0", offset, limit)
    if end <= offset:
        return None
    raw = data[offset:end]
    if any(byte < 0x20 or byte > 0x7e for byte in raw):
        return None
    return raw.decode("ascii")


def relative_string(
    data: bytes,
    word_offset: int,
    string_start: int,
    string_end: int,
) -> str | None:
    if word_offset < 0 or word_offset + 4 > len(data):
        return None
    target = word_offset + struct.unpack_from("<I", data, word_offset)[0]
    if target < string_start or target >= string_end:
        return None
    return c_string(data, target, string_end)


def archive_member(data: bytes, wanted_name: str, wanted_ext: str) -> bytes | None:
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    if data[:4] in (b"PAKS", b"PAKF"):
        if len(data) < 8:
            return None
        offset = struct.unpack_from("<I", data, 4)[0]
        if offset > len(data) - 16:
            return None
        data = data[offset:]
    if len(data) < 16 or data[:4] != b"IPAC":
        return None
    dictionary_offset, count = struct.unpack_from("<II", data, 4)
    if (
        count > 100_000
        or dictionary_offset < 16
        or dictionary_offset + count * 20 > len(data)
    ):
        return None
    for index in range(count):
        entry = dictionary_offset + index * 20
        name_raw, ext_raw, offset, size = struct.unpack_from(
            "<8s4sII", data, entry
        )
        name = name_raw.rstrip(b"\0 ").decode("ascii", errors="replace")
        ext = ext_raw.rstrip(b"\0 ").decode("ascii", errors="replace")
        if name != wanted_name or ext != wanted_ext:
            continue
        if offset > len(data) or size > len(data) - offset:
            return None
        return data[offset:offset + size]
    return None


def chrt_defimage_bindings(source: dict) -> dict[str, dict]:
    archive = (
        SCENE_ROOTS[source["disc"]]
        / source["area"]
        / "MPK00.PKF"
    )
    if not archive.is_file():
        return {}
    chrt = archive_member(archive.read_bytes(), "CHARA", "CHRT")
    if chrt is None or len(chrt) < 16 or chrt[:4] != b"CHRS":
        return {}
    chrs_end = struct.unpack_from("<I", chrt, 4)[0]
    if chrs_end < 8 or chrs_end > len(chrt):
        return {}
    string_offset = chrt.find(b"STRG", chrs_end)
    if string_offset < 0 or string_offset + 8 > len(chrt):
        return {}
    string_size = struct.unpack_from("<I", chrt, string_offset + 4)[0]
    string_start = string_offset + 8
    string_end = min(len(chrt), string_offset + string_size)
    result = {}
    # Native CHRT DefImage serialization:
    #   rel("DefImage"), 0x23, rel(object tag), 0x04,
    #   rel("Image"), 0x19, 1.0f, rel(model filename)
    for offset in range(8, chrs_end - 31, 4):
        if (
            relative_string(chrt, offset, string_start, string_end)
            != "DefImage"
            or struct.unpack_from("<I", chrt, offset + 4)[0] != 0x23
            or struct.unpack_from("<I", chrt, offset + 12)[0] != 0x04
            or relative_string(
                chrt, offset + 16, string_start, string_end
            ) != "Image"
            or struct.unpack_from("<I", chrt, offset + 20)[0] != 0x19
            or struct.unpack_from("<I", chrt, offset + 24)[0] != 0x3f800000
        ):
            continue
        object_tag = relative_string(
            chrt, offset + 8, string_start, string_end
        )
        model = relative_string(
            chrt, offset + 28, string_start, string_end
        )
        if (
            object_tag
            and model
            and model.upper().endswith(".MT5")
        ):
            result[object_tag] = {
                "model": model.lstrip("$@"),
                "recordOffset": f"0x{offset:x}",
                "archive": str(archive.relative_to(ROOT)),
            }
    return result


def browser_world_id(area: str) -> str:
    return {
        "D000": "dobuita",
        "JHD0": "exterior",
        "JOMO": "interior",
        "JU00": "yamanose",
        "JD00": "sakuragaoka",
        "MFSY": "mfsy",
        "MKSG": "mksg",
        "MS08": "ms08",
        "DGCT": "arcade",
    }.get(area, area.lower())


def direct_transition(record: dict) -> dict:
    destination = record["destination"]
    placement = destination.get("entryPlacement")
    transition = {
        "id": (
            f"d000-door-{record['selector']}-to-"
            f"{destination['area'].lower()}-entry-{destination['entry']}"
        ),
        "source": {
            "worldId": "dobuita",
            "scene": 1,
            "area": "D000",
            # The coroutine argument has no proven identity mapping to the
            # physical door table. Expose its own namespace, never a pick key.
            "dispatchValue": record["selector"],
        },
        "destination": {
            "worldId": destination["area"].lower(),
            "scene": destination["scene"],
            "area": destination["area"],
            "entry": destination["entry"],
            "browserSpawn": (
                placement["browserProjection"] if placement else None
            ),
        },
        "supported": placement is not None,
        "evidence": {
            "selectorCompareFileOffset": record[
                "selectorCompareFileOffset"
            ],
            "caseFileOffset": record["caseFileOffset"],
            "coroutineCallFileOffset": record["coroutineCallFileOffset"],
            "sourceDoor": record["sourceDoor"],
            "entryPlacement": placement,
        },
    }
    if placement is None:
        transition["unsupportedReason"] = (
            "Destination MAPINFO has no requested player Entry and serializes "
            "only a killed placeholder Character; the native game does not "
            "construct a free-roaming player placement for this route."
        )
    return transition


def entry_index(report: dict) -> dict[tuple[int, str, int], dict]:
    result = {}
    for map_record in report["maps"]:
        for entry in map_record["entries"]:
            result[(map_record["scene"], map_record["area"], entry["entry"])] = {
                **entry["browserProjection"],
                "nativePosition": entry["position"],
                "nativeFacingDegrees": entry["facingDegrees"],
                "recordOffset": entry["recordOffset"],
                "sourceSha256": map_record["sourceSha256"],
            }
    return result


def resolve_door_model(
    source: dict,
    door_record: dict,
    model_catalog: list[str],
) -> tuple[str | None, str, list[str], dict | None]:
    prefix = f"S{source['disc']}_{source['area']}_"
    door_models = sorted(
        model
        for model in model_catalog
        if model.startswith(prefix)
        and re.match(
            r"^DR\d{2}[_-]\d{3}\.MT5$",
            model[len(prefix):],
        )
    )
    chrt_binding = chrt_defimage_bindings(source).get(door_record["name"])
    normalized_chrt_model = (
        chrt_binding["model"].lstrip("$@").replace("-", "_")
        if chrt_binding
        else None
    )
    chrt_models = [
        model
        for model in door_models
        if model[len(prefix):].replace("-", "_") == normalized_chrt_model
    ]
    normalized_name = door_record["name"].replace("-", "_")
    exact_name_models = [
        model
        for model in door_models
        if model[len(prefix):-4].replace("-", "_") == normalized_name
    ]
    if len(chrt_models) == 1:
        return (
            chrt_models[0],
            "exactChrtDefImageBinding",
            door_models,
            chrt_binding,
        )
    if len(exact_name_models) == 1:
        return (
            exact_name_models[0],
            "exactAuthoredName",
            door_models,
            chrt_binding,
        )
    if len(door_models) == 1:
        return (
            door_models[0],
            "uniqueDoorAssetInNativeAreaCatalog",
            door_models,
            chrt_binding,
        )
    return None, "ambiguousDoorAssets", door_models, chrt_binding


def interior_return_transition(
    map_record: dict,
    door_record: dict,
    entries: dict,
    model_catalog: list[str],
) -> dict:
    source = map_record["source"]
    destination = door_record["destination"]
    placement = entries.get(
        (destination["scene"], destination["area"], destination["entry"])
    )
    if placement is not None and destination["area"] == "D000":
        placement = face_away_from_entry_door(placement)
    (
        model,
        model_resolution,
        door_models,
        chrt_binding,
    ) = resolve_door_model(
        source,
        door_record,
        model_catalog,
    )
    return {
        "id": (
            f"{source['area'].lower()}-{door_record['name'].lower()}-to-"
            f"{destination['area'].lower()}-entry-{destination['entry']}"
        ),
        "source": {
            "worldId": browser_world_id(source["area"]),
            "scene": source["scene"],
            "area": source["area"],
            "objectTag": door_record["name"],
            "model": model,
            "nativeDoorObject": {
                "name": door_record["name"],
                "position": door_record["browserProjection"]["position"],
                "yawDegrees": door_record["browserProjection"]["yawDegrees"],
                "scale": door_record["scale"],
                "controllerWords": door_record["controllerIds"],
                "modelCandidates": door_models,
                "modelResolution": model_resolution,
                "chrtDefImageBinding": chrt_binding,
            },
        },
        "destination": {
            "worldId": browser_world_id(destination["area"]),
            **destination,
            "browserSpawn": placement,
        },
        "supported": placement is not None and model is not None,
        # The controller record proves the root, but the Door Box
        # subrecord is still being decoded.  Keeping this explicit prevents a
        # consumer from silently inventing a click-box extent.
        "interactionVolumeResolved": False,
        "evidence": {
            "recordFileOffset": door_record["recordFileOffset"],
            "nameFileOffset": door_record["nameFileOffset"],
            "sourceSha256": map_record["sourceSha256"],
            "transitionAssociation": door_record[
                "transitionAssociation"
            ],
            "destinationSelectionRule": door_record[
                "destinationSelectionRule"
            ],
            "modelResolution": model_resolution,
            "chrtDefImageBinding": chrt_binding,
        },
    }


def native_volume_transition(volume: dict, route: dict) -> dict:
    destination = route["destination"]
    entry_placement = destination.get("entryPlacement")
    browser_spawn = (
        {
            **entry_placement["browserProjection"],
            "nativePosition": entry_placement["position"],
            "nativeFacingDegrees": entry_placement["facingDegrees"],
            "recordOffset": entry_placement["recordOffset"],
            "sourceSha256": entry_placement["sourceSha256"],
        }
        if entry_placement
        else None
    )
    return {
        "id": (
            f"s{volume['disc']}-{volume['area'].lower()}-event-"
            f"{volume['eventId']}-to-{destination['area'].lower()}-"
            f"entry-{destination['entry']}"
        ),
        "source": {
            "worldId": browser_world_id(volume["area"]),
            "disc": volume["disc"],
            "area": volume["area"],
            "eventId": volume["eventId"],
            "recordFileOffset": volume["recordFileOffset"],
            "shape": {
                "kind": "parallelogram",
                **volume["browserShape"],
            },
        },
        "destination": {
            "worldId": browser_world_id(destination["area"]),
            "scene": destination["scene"],
            "area": destination["area"],
            "entry": destination["entry"],
            "browserSpawn": browser_spawn,
        },
        "supported": browser_spawn is not None,
        "evidence": {
            "flagHex": volume["flagHex"],
            "callbackFileOffset": volume["callback"]["functionFileOffset"],
            "callFileOffset": route["callFileOffset"],
            "helperFileOffset": route["helperFileOffset"],
            "resolution": volume["resolution"],
        },
    }


def d000_door_candidates(evidence: dict) -> list[dict]:
    """Return the physical D000 doors independently of dispatch ordinals."""
    by_selector = {}
    door_evidence = evidence["d000DoorTransitions"]
    for section in (
        "direct",
        "conditional",
        "nativeNonTransitionSelectors",
    ):
        for record in door_evidence.get(section, []):
            source_door = record.get("sourceDoor")
            selector = record.get("selector")
            if source_door is not None and isinstance(selector, int):
                by_selector[selector] = {
                    "selector": selector,
                    **source_door,
                }
    return list(by_selector.values())


def derived_interior_spawn(return_transition: dict) -> dict:
    """Place the player just inside an authored interior exit door."""
    door = return_transition["source"]["nativeDoorObject"]
    position = door["position"]
    door_yaw_degrees = door["yawDegrees"]
    door_yaw = math.radians(door_yaw_degrees)
    inward_distance = 0.85
    yaw_degrees = (door_yaw_degrees + 180) % 360
    if yaw_degrees > 180:
        yaw_degrees -= 360
    return {
        "position": [
            position[0] + math.sin(door_yaw) * inward_distance,
            position[1],
            position[2] + math.cos(door_yaw) * inward_distance,
        ],
        "yawDegrees": yaw_degrees,
        "yawRadians": math.radians(yaw_degrees),
        "sourceKind": "reverse interior door transform",
        "evidence": {
            "returnTransitionId": return_transition["id"],
            "inwardOffset": inward_distance,
        },
    }


def face_away_from_entry_door(browser_spawn: dict) -> dict:
    """Turn an inbound spawn away from the exit door and into the room."""
    yaw_degrees = browser_spawn.get("yawDegrees")
    if yaw_degrees is None:
        yaw_degrees = math.degrees(browser_spawn["yawRadians"])
    yaw_degrees = (yaw_degrees + 180) % 360
    if yaw_degrees > 180:
        yaw_degrees -= 360
    return {
        **browser_spawn,
        "yawDegrees": yaw_degrees,
        "yawRadians": math.radians(yaw_degrees),
    }


def reverse_matched_d000_transition(
    return_transition: dict,
    authored_inbound_spawns: dict,
    door_candidates: list[dict],
) -> dict | None:
    """Recover an inbound storefront edge from its exact reverse edge.

    The D000 transition coroutine's resumed dispatch value is not the logical
    door selector. Matching those integers caused valid destinations to be
    attached to unrelated storefronts. An interior return names an exact D000
    Entry, and that Entry is spatially adjacent to the physical exterior door.
    """
    if (
        return_transition["destination"]["area"] != "D000"
        or return_transition["destination"]["browserSpawn"] is None
        or return_transition["source"]["nativeDoorObject"] is None
    ):
        return None
    exterior_position = return_transition["destination"]["browserSpawn"][
        "position"
    ]
    candidates = sorted(
        door_candidates,
        key=lambda door: math.hypot(
            door["position"][0] - exterior_position[0],
            door["position"][2] - exterior_position[2],
        ),
    )
    if not candidates:
        return None
    source_door = candidates[0]
    distance = math.hypot(
        source_door["position"][0] - exterior_position[0],
        source_door["position"][2] - exterior_position[2],
    )
    if distance > 2.5:
        return None

    source_area = return_transition["source"]["area"]
    source_scene = return_transition["source"]["scene"]
    authored_spawn = authored_inbound_spawns.get(
        (source_scene, source_area, 0)
    )
    browser_spawn = (
        authored_spawn
        if authored_spawn is not None
        else derived_interior_spawn(return_transition)
    )
    # You Arcade has a separately tuned arrival. The generated storefront
    # interiors should face into their room rather than back at the exit.
    if source_area != "DGCT":
        browser_spawn = face_away_from_entry_door(browser_spawn)
    return {
        "id": (
            f"d000-door-{source_door['selector']}-to-"
            f"{source_area.lower()}-reverse-matched"
        ),
        "source": {
            "worldId": "dobuita",
            "scene": 1,
            "area": "D000",
            "doorSelector": source_door["selector"],
            "model": source_door["model"],
        },
        "destination": {
            "worldId": browser_world_id(source_area),
            "scene": source_scene,
            "area": source_area,
            "entry": 0 if authored_spawn is not None else None,
            "browserSpawn": browser_spawn,
        },
        "supported": True,
        "evidence": {
            "association": "exact reverse edge D000 Entry to nearest physical door",
            "returnTransitionId": return_transition["id"],
            "returnDestinationEntry": return_transition["destination"]["entry"],
            "exteriorDoorDistance": distance,
            "sourceDoor": {
                "visibleStaticDoorIndex": source_door[
                    "visibleStaticDoorIndex"
                ],
                "model": source_door["model"],
                "position": source_door["position"],
                "rotationDegrees": source_door["rotationDegrees"],
                "usesInvisibleProxy": source_door["usesInvisibleProxy"],
            },
            "destinationPlacement": (
                "authored Entry 0"
                if authored_spawn is not None
                else "derived from exact reverse interior door transform"
            ),
        },
    }


def main() -> None:
    evidence = json.loads(EVIDENCE.read_text())
    entry_report = json.loads(ENTRY_EVIDENCE.read_text())
    model_catalog = json.loads(MODEL_CATALOG.read_text())
    entries = entry_index(entry_report)
    transitions = [
        direct_transition(record)
        for record in evidence["d000DoorTransitions"]["direct"]
    ]
    supported_interior_areas = {
        transition["destination"]["area"]
        for transition in transitions
        if transition["supported"]
    }
    return_transitions = []
    for map_record in evidence["nativeDoorControllerObjects"]:
        source = map_record["source"]
        if (
            source["disc"] != 1
            or source["area"] not in supported_interior_areas
        ):
            continue
        for door_record in map_record["doorControllerRecords"]:
            if (
                door_record["transitionAssociation"]
                != "exactSingleOutgoingDestination"
            ):
                continue
            return_transitions.append(
                interior_return_transition(
                    map_record,
                    door_record,
                    entries,
                    model_catalog,
                )
            )
    supported = sum(item["supported"] for item in transitions)
    canonical_door_records = {}
    for map_record in evidence["nativeDoorControllerObjects"]:
        source = map_record["source"]
        for door_record in map_record["doorControllerRecords"]:
            if (
                door_record["transitionAssociation"]
                != "exactSingleOutgoingDestination"
                or not door_record.get("destination")
            ):
                continue
            destination = door_record["destination"]
            key = (
                source["area"],
                door_record["name"],
                destination["area"],
                destination["entry"],
            )
            candidate = (source["disc"], map_record, door_record)
            existing = canonical_door_records.get(key)
            if existing is None or candidate[0] < existing[0]:
                canonical_door_records[key] = candidate
    all_exact_door_transitions = [
        interior_return_transition(
            map_record,
            door_record,
            entries,
            model_catalog,
        )
        for _, map_record, door_record in sorted(
            canonical_door_records.values(),
            key=lambda item: (
                item[1]["source"]["area"],
                item[2]["name"],
                item[2]["destination"]["area"],
                item[2]["destination"]["entry"],
            ),
        )
    ]
    door_candidates = d000_door_candidates(evidence)
    authored_inbound_spawns = {
        (
            transition["destination"]["scene"],
            transition["destination"]["area"],
            transition["destination"]["entry"],
        ): transition["destination"]["browserSpawn"]
        for transition in transitions
        if transition["destination"]["browserSpawn"] is not None
    }
    reverse_matched_d000_transitions = [
        transition
        for transition in (
            reverse_matched_d000_transition(
                return_transition,
                authored_inbound_spawns,
                door_candidates,
            )
            for return_transition in all_exact_door_transitions
        )
        if transition is not None
    ]
    native_volume_transitions = sorted([
        native_volume_transition(volume, route)
        for volume in evidence["nativeTransitionVolumes"]
        for route in volume["routes"]
    ], key=lambda transition: (
        transition["source"]["disc"],
        transition["source"]["area"],
        transition["source"]["eventId"],
        transition["destination"]["area"],
        transition["destination"]["entry"],
    ))
    # `/play` currently reconstructs the Disc 1 town chain. Preserve every
    # disc variant above, while selecting the exact Disc 1 callbacks for the
    # active runtime rather than merging subtly different later-disc routes.
    runtime_native_volume_transitions = [
        transition
        for transition in native_volume_transitions
        if transition["source"]["disc"] == 1
    ]
    report = {
        "schema": "new-yokosuka-native-map-transitions-v2",
        "generatedFrom": [
            str(EVIDENCE.relative_to(ROOT)),
            str(ENTRY_EVIDENCE.relative_to(ROOT)),
            str(MAP_CATALOG.relative_to(ROOT)),
            "each source area's MPK00.PKF::CHARA.CHRT when present",
        ],
        "areaNames": map_area_names(),
        "summary": {
            "d000DirectTransitionCount": len(transitions),
            "d000SupportedFreeRoamTransitionCount": supported,
            "d000NativeNonFreeRoamTransitionCount": (
                len(transitions) - supported
            ),
            "exactInteriorReturnTransitionCount": len(return_transitions),
            "interiorReturnWithExactDestinationPlacementCount": sum(
                item["destination"]["browserSpawn"] is not None
                for item in return_transitions
            ),
            "interiorReturnWithResolvedDoorModelCount": sum(
                item["source"]["model"] is not None
                for item in return_transitions
            ),
            "interiorReturnWithResolvedInteractionVolumeCount": sum(
                item["interactionVolumeResolved"]
                for item in return_transitions
            ),
            "canonicalExactDoorTransitionCount": len(
                all_exact_door_transitions
            ),
            "canonicalExactDoorWithEntryPlacementCount": sum(
                item["destination"]["browserSpawn"] is not None
                for item in all_exact_door_transitions
            ),
            "canonicalExactDoorWithResolvedModelCount": sum(
                item["source"]["model"] is not None
                for item in all_exact_door_transitions
            ),
            "reverseMatchedD000TransitionCount": len(
                reverse_matched_d000_transitions
            ),
            "reverseMatchedD000DerivedSpawnCount": sum(
                item["evidence"]["destinationPlacement"]
                == "derived from exact reverse interior door transform"
                for item in reverse_matched_d000_transitions
            ),
            "nativeVolumeTransitionCount": len(native_volume_transitions),
            "runtimeDisc1NativeVolumeTransitionCount": len(
                runtime_native_volume_transitions
            ),
            "runtimeDisc1NativeVolumeWithEntryPlacementCount": sum(
                item["supported"]
                for item in runtime_native_volume_transitions
            ),
        },
        "d000DirectTransitions": transitions,
        "interiorReturnTransitions": return_transitions,
        "allExactDoorTransitions": all_exact_door_transitions,
        "reverseMatchedD000Transitions": reverse_matched_d000_transitions,
        "nativeVolumeTransitions": native_volume_transitions,
        "runtimeNativeVolumeTransitions": runtime_native_volume_transitions,
        "evidenceBoundary": (
            "D000 storefronts are associated by each interior's exact reverse "
            "D000 Entry rather than equating coroutine dispatch ordinals with "
            "logical door selectors. Destinations without an authored player "
            "Entry use the exact reverse interior door transform plus a fixed "
            "inward offset. "
            "Interior return-door roots are exact native door-controller records; "
            "they remain non-interactive until the native Door Box dimensions "
            "are decoded."
        ),
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {OUTPUT.relative_to(ROOT)}: {supported}/{len(transitions)} "
        "Dobuita direct destinations have native free-roam placement"
    )


if __name__ == "__main__":
    main()
