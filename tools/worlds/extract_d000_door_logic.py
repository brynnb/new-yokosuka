#!/usr/bin/env python3
"""Recover D000's complete logical-door to visible-door mapping.

Dobuita keeps 65 logical door records and 120 placed door records. Nineteen
logical records address an invisible type-1 doorway proxy; the visible type-2
model is the immediately following placement at the same transform. This tool
resolves that pairing and can optionally attach the runtime-populated logical
record fields from a Flycast RAM capture.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Any


LOGICAL_DOOR_COUNT = 65
LOGICAL_RECORD_WORDS = 13
LOGICAL_RECORD_SIZE = LOGICAL_RECORD_WORDS * 4
LOGICAL_RECORDS_OFFSET = 0xA776C
PLACEMENT_INDEX_MAP_OFFSET = 0xA84D4
RUNTIME_LOGICAL_RECORDS_OFFSET = 0x46CEAC


def hex_words(words: tuple[int, ...]) -> list[str]:
    return [f"0x{word:08x}" for word in words]


def is_adjacent_door_pair(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Validate the adjacent collision-proxy/visible-door convention."""
    distance = math.dist(left["position"], right["position"])
    return (
        distance <= 1.0
        and abs(left["position"][1] - right["position"][1]) <= 0.01
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Recover all D000 logical door bindings.",
    )
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("static_doors", type=Path)
    parser.add_argument("--ram", type=Path)
    parser.add_argument("--observed-bindings", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    mapinfo = args.mapinfo.read_bytes()
    static_report = json.loads(args.static_doors.read_text())
    placements = static_report["placements"]
    ram = args.ram.read_bytes() if args.ram else None
    if ram is not None and len(ram) < (
        RUNTIME_LOGICAL_RECORDS_OFFSET
        + LOGICAL_DOOR_COUNT * LOGICAL_RECORD_SIZE
    ):
        parser.error("RAM capture is too small for D000's logical door table")

    doors: list[dict[str, Any]] = []
    mapped_indices: set[int] = set()
    proxy_count = 0
    for selector in range(LOGICAL_DOOR_COUNT):
        source_offset = LOGICAL_RECORDS_OFFSET + selector * LOGICAL_RECORD_SIZE
        source_words = struct.unpack_from(
            "<13I",
            mapinfo,
            source_offset,
        )
        map_entry = source_words[0]
        map_offset = PLACEMENT_INDEX_MAP_OFFSET + map_entry * 4
        mapped_index = struct.unpack_from("<I", mapinfo, map_offset)[0]
        if mapped_index >= len(placements):
            raise ValueError(
                f"selector {selector} maps outside the static door table",
            )

        visible_index = mapped_index
        mapped = placements[mapped_index]
        uses_proxy = mapped["runtime"]["staticDoorType"] == 1
        if uses_proxy:
            visible_index += 1
            if visible_index >= len(placements):
                raise ValueError(
                    f"selector {selector} has an unpaired final proxy",
                )
            visible = placements[visible_index]
            if (
                visible["runtime"]["staticDoorType"] != 2
                or not is_adjacent_door_pair(mapped, visible)
            ):
                raise ValueError(
                    f"selector {selector} proxy is not paired with a visible door",
                )
            proxy_count += 1
        else:
            visible = mapped
            if visible["runtime"]["staticDoorType"] != 2:
                raise ValueError(
                    f"selector {selector} did not resolve to a visible door",
                )

        runtime_words = None
        if ram is not None:
            runtime_words = struct.unpack_from(
                "<13I",
                ram,
                RUNTIME_LOGICAL_RECORDS_OFFSET
                + selector * LOGICAL_RECORD_SIZE,
            )
            if runtime_words[0] != source_words[0]:
                raise ValueError(
                    f"selector {selector} source/runtime identity differs",
                )

        mapped_indices.add(visible_index)
        doors.append({
            "selector": selector,
            "mappedStaticDoorIndex": mapped_index,
            "visibleStaticDoorIndex": visible_index,
            "usesInvisibleProxy": uses_proxy,
            "model": visible["model"],
            "position": visible["position"],
            "rotationDegrees": visible["rotationDegrees"],
            "source": {
                "logicalRecordOffset": f"0x{source_offset:x}",
                "placementMapEntry": map_entry,
                "placementMapOffset": f"0x{map_offset:x}",
                "recordWords": hex_words(source_words),
            },
            **({
                "runtime": {
                    "logicalRecordRamOffset": (
                        "0x"
                        f"{RUNTIME_LOGICAL_RECORDS_OFFSET + selector * LOGICAL_RECORD_SIZE:x}"
                    ),
                    "recordWords": hex_words(runtime_words),
                },
            } if runtime_words is not None else {}),
        })

    visible_indices = {
        index
        for index, placement in enumerate(placements)
        if placement["runtime"]["staticDoorType"] == 2
    }
    if mapped_indices != visible_indices:
        raise ValueError(
            "logical table does not form a bijection over visible doors: "
            f"missing={sorted(visible_indices - mapped_indices)}, "
            f"extra={sorted(mapped_indices - visible_indices)}",
        )

    observed_count = 0
    observed_mismatches: list[dict[str, int]] = []
    if args.observed_bindings:
        observed = json.loads(args.observed_bindings.read_text())
        by_selector = {door["selector"]: door for door in doors}
        for binding in observed["recoveredDoors"]:
            observed_count += 1
            selector = binding["runtimeDoorSelector"]
            observed_index = binding["staticDoorIndex"]
            door = by_selector[selector]
            if observed_index not in {
                door["mappedStaticDoorIndex"],
                door["visibleStaticDoorIndex"],
            }:
                observed_mismatches.append({
                    "selector": selector,
                    "observedStaticDoorIndex": observed_index,
                    "mappedStaticDoorIndex": door["mappedStaticDoorIndex"],
                    "visibleStaticDoorIndex": door["visibleStaticDoorIndex"],
                })
        if observed_mismatches:
            raise ValueError(
                f"{len(observed_mismatches)} observed bindings disagree",
            )

    report = {
        "schema": "new-yokosuka-d000-door-logic-v1",
        "source": {
            "mapinfo": str(args.mapinfo),
            "staticDoors": str(args.static_doors),
            **({"ram": str(args.ram)} if args.ram else {}),
            **({
                "observedBindings": str(args.observed_bindings),
            } if args.observed_bindings else {}),
        },
        "method": {
            "logicalRecordCount": LOGICAL_DOOR_COUNT,
            "logicalRecordWords": LOGICAL_RECORD_WORDS,
            "logicalRecordsOffset": f"0x{LOGICAL_RECORDS_OFFSET:x}",
            "placementIndexMapOffset": f"0x{PLACEMENT_INDEX_MAP_OFFSET:x}",
            "runtimeLogicalRecordsRamOffset": (
                f"0x{RUNTIME_LOGICAL_RECORDS_OFFSET:x}"
            ),
            "proxyNormalization": (
                "type-1 mapped record followed by its adjacent type-2 "
                "door-leaf record selects the visible record"
            ),
        },
        "summary": {
            "logicalDoorCount": len(doors),
            "visibleDoorCount": len(mapped_indices),
            "invisibleProxyPairCount": proxy_count,
            "observedBindingCount": observed_count,
            "observedMismatchCount": len(observed_mismatches),
        },
        "doors": doors,
    }
    encoded = f"{json.dumps(report, indent=2)}\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded)
        print(f"Wrote {args.out} ({len(doors)} logical doors)")
    else:
        print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
