#!/usr/bin/env python3
"""Extract native door-controller objects and join exact transition callbacks.

MAPINFO's SCN3 static-data region serializes a typed controller record used by
the native door subsystem.  The record is identified structurally, not by its
position in a room:

    +0x00  SCN3-relative object-name pointer
    +0x04  native record/subobject count
    +0x08  first controller ID (low 16 bits == 0x02ab)
    +0x0c  second controller ID (first + 0x00010000)
    +0x10  type (2)
    +0x14  zero
    +0x18  scale x/y/z
    +0x24  position x/y/z
    +0x30  Dreamcast fixed-angle yaw

Only records with a door-shaped authored name are exposed here.  A record is
associated with a transition only when every exact outgoing call in the same
MAPINFO deduplicates to one destination.  No spatial matching is performed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG = ROOT / "tools" / "evidence" / "map-transition-catalog.json"
DEFAULT_OUTPUT = ROOT / "tools" / "evidence" / "map-transition-objects.json"
DOOR_NAME = re.compile(
    r"^(?:DOOR|DOR[A-Z0-9_]*|DR\d{2}_\d{3}|[A-Z0-9_]+_DOOR)$"
)
CONTROLLER_TYPE = 0x02AB


def scn3_static_range(data: bytes) -> tuple[int, int, int]:
    scn3 = data.find(b"SCN3")
    if scn3 < 0 or scn3 + 0x30 > len(data):
        raise ValueError("input does not contain a complete SCN3 token")
    token_size = struct.unpack_from("<I", data, scn3 + 4)[0]
    static_relative = struct.unpack_from("<I", data, scn3 + 0x10)[0]
    static_start = scn3 + static_relative
    token_end = scn3 + token_size
    if not (scn3 + 0x30 <= static_start <= token_end <= len(data)):
        raise ValueError("SCN3 static/token ranges are inconsistent")
    return scn3, static_start, token_end


def c_string(data: bytes, offset: int, limit: int = 64) -> str | None:
    if not (0 <= offset < len(data)):
        return None
    raw = data[offset : min(len(data), offset + limit)].split(b"\0", 1)[0]
    if not raw or any(byte < 0x20 or byte >= 0x7F for byte in raw):
        return None
    return raw.decode("ascii")


def fixed_angle_degrees(raw: int) -> float:
    return (raw & 0xFFFF) * (360.0 / 65536.0)


def normalized_degrees(value: float) -> float:
    value = ((value + 180.0) % 360.0) - 180.0
    return 0.0 if abs(value) < 1e-10 else value


def exact_destinations(
    map_record: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    destinations = {}
    current_scene_destinations = {}
    calls = [
        *map_record.get("transitions", []),
        *map_record.get("localHelperTransitions", []),
    ]
    for call in calls:
        destination = call.get("destination")
        if call.get("classification", "exact") != "exact" or not destination:
            continue
        key = (
            destination["scene"],
            destination["area"],
            destination["entry"],
        )
        destinations[key] = {
            "scene": key[0],
            "area": key[1],
            "entry": key[2],
        }
        if str(call.get("resolutionKind", "")).startswith(
            "currentScene"
        ):
            current_scene_destinations[key] = destinations[key]
    all_destinations = [destinations[key] for key in sorted(destinations)]
    # Operation 0x019c is the native current-disc/scene query.  When present,
    # it identifies the reusable room-exit callback and separates it from
    # unrelated literal transitions in the same script (DBYO contains a
    # literal JOMO recovery route in addition to its D000 exit).
    if current_scene_destinations:
        selected = [
            current_scene_destinations[key]
            for key in sorted(current_scene_destinations)
        ]
        return all_destinations, selected, "currentSceneOperation019c"
    return all_destinations, all_destinations, "allExactOutgoingTransitions"


def extract_objects(map_record: dict[str, Any]) -> dict[str, Any]:
    path = ROOT / map_record["path"]
    data = path.read_bytes()
    scn3, static_start, token_end = scn3_static_range(data)
    records = []
    # Controller IDs are 32-bit aligned in every observed compiler output.
    first = (static_start + 3) & ~3
    for controller_offset in range(first, token_end - 0x34, 4):
        first_id, second_id, record_type, zero = struct.unpack_from(
            "<4I", data, controller_offset
        )
        if (
            (first_id & 0xFFFF) != CONTROLLER_TYPE
            or second_id != ((first_id + 0x00010000) & 0xFFFFFFFF)
            or record_type != 2
            or zero != 0
            or controller_offset < 8
        ):
            continue
        header_offset = controller_offset - 8
        name_relative, native_count = struct.unpack_from(
            "<2I", data, header_offset
        )
        name_offset = scn3 + name_relative
        name = c_string(data, name_offset)
        if name is None or not DOOR_NAME.fullmatch(name):
            continue
        scale = list(struct.unpack_from("<3f", data, header_offset + 0x18))
        position = list(struct.unpack_from("<3f", data, header_offset + 0x24))
        yaw_raw = struct.unpack_from("<I", data, header_offset + 0x30)[0]
        if (
            not all(math.isfinite(value) for value in [*scale, *position])
            or not all(0.0001 <= abs(value) <= 1000 for value in scale)
            or not all(abs(value) <= 10000 for value in position)
        ):
            continue
        yaw = fixed_angle_degrees(yaw_raw)
        records.append(
            {
                "name": name,
                "recordFileOffset": f"0x{header_offset:x}",
                "nameFileOffset": f"0x{name_offset:x}",
                "nameScn3RelativeOffset": f"0x{name_relative:x}",
                "nativeRecordCount": native_count,
                "controllerIds": [
                    f"0x{first_id:08x}",
                    f"0x{second_id:08x}",
                ],
                "controllerType": f"0x{CONTROLLER_TYPE:04x}",
                "scale": scale,
                "nativeTransform": {
                    "position": position,
                    "yawRaw": f"0x{yaw_raw:08x}",
                    "yawDegrees": yaw,
                },
                "browserProjection": {
                    "position": [-position[0], position[1], position[2]],
                    "yawDegrees": normalized_degrees(-yaw),
                },
            }
        )

    destinations, door_destinations, destination_rule = exact_destinations(
        map_record
    )
    association = "unresolved"
    if records and len(door_destinations) == 1:
        association = "exactSingleOutgoingDestination"
        for record in records:
            record["destination"] = door_destinations[0]
            record["destinationSelectionRule"] = destination_rule
            record["transitionAssociation"] = association
    elif records:
        for record in records:
            record["transitionAssociation"] = (
                "ambiguousMultipleOutgoingDestinations"
                if len(door_destinations) > 1
                else "noExactOutgoingDestination"
            )
    return {
        "source": map_record["source"],
        "path": map_record["path"],
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": f"0x{scn3:x}",
        "staticDataFileRange": [
            f"0x{static_start:x}",
            f"0x{token_end:x}",
        ],
        "exactOutgoingDestinations": destinations,
        "doorTransitionDestinations": door_destinations,
        "doorDestinationSelectionRule": destination_rule,
        "doorControllerRecords": records,
    }


def build_report(catalog: dict[str, Any]) -> dict[str, Any]:
    maps = []
    failures = []
    for map_record in catalog["maps"]:
        try:
            extracted = extract_objects(map_record)
        except (OSError, ValueError, struct.error) as error:
            failures.append(
                {
                    "source": map_record["source"],
                    "path": map_record["path"],
                    "error": str(error),
                }
            )
            continue
        if extracted["doorControllerRecords"]:
            maps.append(extracted)
    records = [
        record
        for map_record in maps
        for record in map_record["doorControllerRecords"]
    ]
    exact = [
        record
        for record in records
        if record["transitionAssociation"]
        == "exactSingleOutgoingDestination"
    ]
    return {
        "schema": "new-yokosuka-map-transition-objects-v1",
        "generatedFrom": "tools/evidence/map-transition-catalog.json",
        "recordLayout": {
            "namePointer": "+0x00, relative to SCN3 token",
            "nativeRecordCount": "+0x04",
            "controllerIds": ["+0x08", "+0x0c"],
            "typeAndZero": ["+0x10 = 2", "+0x14 = 0"],
            "scale": "+0x18, three float32 values",
            "position": "+0x24, three float32 values",
            "fixedAngleYaw": "+0x30, low 16 bits span one full turn",
        },
        "summary": {
            "mapCount": len(maps),
            "doorControllerRecordCount": len(records),
            "exactTransitionAssociatedRecordCount": len(exact),
            "ambiguousOrUnroutedRecordCount": len(records) - len(exact),
            "failureCount": len(failures),
        },
        "maps": maps,
        "failures": failures,
        "evidenceBoundary": [
            "Records are accepted only by the full typed controller structure and a door-shaped authored name.",
            "A destination is attached only when all statically exact outgoing calls in that MAPINFO deduplicate to one scene/area/entry tuple.",
            "When operation 0x019c current-scene exit callbacks exist, only those are considered door destinations; unrelated literal recovery/story transitions remain listed but cannot contaminate the door association.",
            "No distance, mesh-name proximity, browser configuration, or hand-authored room placement participates in extraction.",
            "The record proves the native door-controller root transform; its interaction-volume dimensions are not yet claimed.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text())
    report = build_report(catalog)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {args.out}: {summary['doorControllerRecordCount']} native "
        f"door-controller records, "
        f"{summary['exactTransitionAssociatedRecordCount']} exact associations"
    )


if __name__ == "__main__":
    main()
