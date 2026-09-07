#!/usr/bin/env python3
"""Inventory source-backed EVNT records across every extracted map."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


DEFAULT_ROOTS = (
    Path(".disc-work/mapinfo/disc1/SCENE/01"),
    Path(".disc-work/mapinfo/disc2/SCENE/02"),
    Path("extracted_disc3_v2/data/SCENE/03"),
)


def hex_offset(value: int) -> str:
    return f"0x{value:x}"


def browser_shape(values: tuple[float, ...]) -> dict[str, object]:
    origin = [-values[0], -values[1]]
    edge_a = [-values[2], -values[3]]
    edge_b = [-values[4], -values[5]]
    return {
        "origin": origin,
        "edgeA": edge_a,
        "edgeB": edge_b,
        "vertices": [
            origin,
            [origin[0] + edge_a[0], origin[1] + edge_a[1]],
            [
                origin[0] + edge_a[0] + edge_b[0],
                origin[1] + edge_a[1] + edge_b[1],
            ],
            [origin[0] + edge_b[0], origin[1] + edge_b[1]],
        ],
    }


def browser_polygon(
    points: list[tuple[float, float]],
) -> dict[str, object]:
    return {
        "vertices": [[-x, -y] for x, y in points],
    }


def infer_disc(path: Path) -> int:
    parts = path.parts
    for index, part in enumerate(parts):
        if part == "SCENE" and index + 1 < len(parts):
            value = parts[index + 1]
            if value.isdigit():
                return int(value)
        if part.startswith("disc") and part[4:].isdigit():
            return int(part[4:])
    raise ValueError(f"cannot infer disc from {path}")


def extract_map(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    offset = data.find(b"EVNT")
    if offset < 0:
        return {
            "disc": infer_disc(path),
            "area": path.parent.name,
            "path": str(path),
            "sha256": hashlib.sha256(data).hexdigest(),
            "status": "EVNT token absent",
            "records": [],
        }
    payload_length = struct.unpack_from("<I", data, offset + 4)[0]
    payload_start = offset + 8
    payload_end = payload_start + payload_length
    if payload_end > len(data):
        raise ValueError(f"EVNT exceeds {path}")

    records: list[dict[str, object]] = []
    status = "empty"
    if payload_length:
        cursor = payload_start
        kinds: set[int] = set()
        while cursor < payload_end:
            record_offset = cursor
            if cursor + 12 > payload_end:
                raise ValueError(f"truncated EVNT record header in {path}")
            flag, kind = struct.unpack_from("<II", data, cursor)
            kinds.add(kind)
            event_class = flag >> 16
            common = {
                "recordFileOffset": hex_offset(record_offset),
                "flag": flag,
                "flagHex": f"0x{flag:08x}",
                "eventClass": event_class,
                "eventId": flag & 0xFFFF,
                "kind": kind,
                "nativeCallbackClass": event_class == 4,
            }
            if kind == 5:
                if cursor + 36 > payload_end:
                    raise ValueError(f"truncated kind-5 EVNT record in {path}")
                values = struct.unpack_from("<6f", data, cursor + 8)
                terminator = struct.unpack_from("<I", data, cursor + 32)[0]
                if terminator != 0xFFFFFFFF:
                    raise ValueError(f"kind-5 record lacks terminator in {path}")
                records.append(
                    {
                        **common,
                        "nativeQueryShape": {
                            "shape": "parallelogram",
                            "origin": list(values[0:2]),
                            "edgeA": list(values[2:4]),
                            "edgeB": list(values[4:6]),
                        },
                        "browserShape": browser_shape(values),
                    }
                )
                cursor += 36
                continue
            if kind == 6:
                point_count = struct.unpack_from("<I", data, cursor + 8)[0]
                record_size = 16 + point_count * 8
                if (
                    point_count < 3
                    or point_count > 256
                    or cursor + record_size > payload_end
                ):
                    raise ValueError(
                        f"invalid kind-6 EVNT point count {point_count} in {path}"
                    )
                values = struct.unpack_from(
                    f"<{point_count * 2}f", data, cursor + 12
                )
                points = [
                    (values[index], values[index + 1])
                    for index in range(0, len(values), 2)
                ]
                terminator = struct.unpack_from(
                    "<I", data, cursor + record_size - 4
                )[0]
                if terminator != 0xFFFFFFFF:
                    raise ValueError(f"kind-6 record lacks terminator in {path}")
                records.append(
                    {
                        **common,
                        "pointCount": point_count,
                        "nativeQueryShape": {
                            "shape": "polygon",
                            "vertices": [list(point) for point in points],
                        },
                        "browserShape": browser_polygon(points),
                    }
                )
                cursor += record_size
                continue
            raise ValueError(f"unresolved EVNT kind {kind} in {path}")
        status = (
            "exact mixed kind-5/kind-6 records"
            if len(kinds) > 1
            else f"exact kind-{next(iter(kinds))} records"
        )

    return {
        "disc": infer_disc(path),
        "area": path.parent.name,
        "path": str(path),
        "sha256": hashlib.sha256(data).hexdigest(),
        "eventTokenFileOffset": hex_offset(offset),
        "payloadByteLength": payload_length,
        "status": status,
        "records": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="*", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tools/evidence/map-event-volumes.json"),
    )
    args = parser.parse_args()

    roots = tuple(args.roots) or DEFAULT_ROOTS
    paths = sorted(
        {
            path
            for root in roots
            for path in root.glob("*/MAPINFO.BIN")
        }
    )
    maps = [extract_map(path) for path in paths]
    exact_records = [record for item in maps for record in item["records"]]
    kind5_records = [
        record for record in exact_records if record["kind"] == 5
    ]
    kind6_records = [
        record for record in exact_records if record["kind"] == 6
    ]
    callback_class = [
        {
            "disc": item["disc"],
            "area": item["area"],
            **record,
        }
        for item in maps
        for record in item["records"]
        if record["nativeCallbackClass"]
    ]
    output = {
        "schema": "new-yokosuka-map-event-volumes-v3",
        "generatedFrom": [str(root) for root in roots],
        "summary": {
            "mapCount": len(maps),
            "mapWithEvntPayloadCount": sum(
                item.get("payloadByteLength", 0) > 0 for item in maps
            ),
            "exactRecordCount": len(exact_records),
            "exactKind5RecordCount": len(kind5_records),
            "exactKind6RecordCount": len(kind6_records),
            "nativeCallbackClassRecordCount": len(callback_class),
            "opaquePayloadMapCount": 0,
        },
        "nativeEvidence": {
            "kind5RecordByteLength": 36,
            "kind5Layout": (
                "u32 flag, u32 kind=5, six f32 parallelogram values, "
                "u32 0xffffffff"
            ),
            "kind6Layout": (
                "u32 flag, u32 kind=6, u32 vertex count, count pairs of "
                "f32 polygon coordinates, u32 0xffffffff"
            ),
            "flagRule": (
                "The reviewed native event dispatcher uses the flag high "
                "half as an event class and the low half as its event ID. "
                "Class 4 invokes a registered same-index callback when that "
                "map installs a callback table. It is not intrinsically a "
                "transition class."
            ),
            "reviewedMapEvidence": (
                "tools/evidence/jd00-d000-boundary-transition.json"
            ),
        },
        "callbackClassVolumes": callback_class,
        "maps": maps,
        "evidenceBoundary": (
            "All kind-5 and variable-length kind-6 geometry is decoded "
            "exactly. High-half class 4 is "
            "only a callback class; a record becomes a transition volume "
            "only after its map's registered callback/selector flow is "
            "independently joined to operation 0x0030."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(
        f"wrote {args.output}: {len(maps)} maps, "
        f"{len(exact_records)} exact kind-5/kind-6 records, "
        f"{len(callback_class)} callback-class records"
    )


if __name__ == "__main__":
    main()
