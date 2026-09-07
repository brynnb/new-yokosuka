#!/usr/bin/env python3
"""Extract authored event-camera spline records from a MAPINFO ECAM node.

The record layout is the output of Shenmue's recovered CreateSplData routine:
an ASCII four-digit camera number, total record size, flags, then eight curve
channels. Each channel stores a count followed by parallel float arrays for
time, value, and slope. The camera-specific channel order is position XYZ,
target XYZ, roll, and perspective.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any

from tools.lib.portable_paths import portable_project_path


CHANNEL_NAMES = (
    "positionX",
    "positionY",
    "positionZ",
    "targetX",
    "targetY",
    "targetZ",
    "roll",
    "perspective",
)


def u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"u32 read outside file at 0x{offset:x}")
    return struct.unpack_from("<I", data, offset)[0]


def f32_array(data: bytes, offset: int, count: int) -> list[float]:
    end = offset + count * 4
    if offset < 0 or end > len(data):
        raise ValueError(
            f"{count} float values outside file at 0x{offset:x}"
        )
    return list(struct.unpack_from(f"<{count}f", data, offset))


def find_ecam(data: bytes) -> tuple[int, int]:
    offsets = []
    cursor = 0
    while True:
        cursor = data.find(b"ECAM", cursor)
        if cursor < 0:
            break
        if cursor % 4 == 0 and cursor + 8 <= len(data):
            size = u32(data, cursor + 4)
            if size >= 8 and cursor + size <= len(data):
                offsets.append((cursor, size))
        cursor += 4
    if len(offsets) != 1:
        raise ValueError(
            f"expected one bounded ECAM node, found {len(offsets)}"
        )
    return offsets[0]


def parse_curve(
    data: bytes,
    offset: int,
    record_end: int,
) -> tuple[dict[str, Any], int]:
    count = u32(data, offset)
    if count > 100_000:
        raise ValueError(f"implausible ECAM key count {count}")
    cursor = offset + 4
    byte_count = count * 4
    end = cursor + byte_count * 3
    if end > record_end:
        raise ValueError(
            f"ECAM curve at 0x{offset:x} exceeds its record"
        )
    curve = {
        "count": count,
        "times": f32_array(data, cursor, count),
        "values": f32_array(data, cursor + byte_count, count),
        "slopes": f32_array(data, cursor + byte_count * 2, count),
    }
    return curve, end


def parse_ecam(data: bytes) -> dict[str, Any]:
    chunk_offset, chunk_size = find_ecam(data)
    chunk_end = chunk_offset + chunk_size
    records = []
    cursor = chunk_offset + 8
    while cursor < chunk_end:
        if cursor + 12 > chunk_end:
            raise ValueError(
                f"truncated ECAM record header at 0x{cursor:x}"
            )
        raw_id = data[cursor:cursor + 4]
        try:
            camera_id = raw_id.decode("ascii")
        except UnicodeDecodeError as error:
            raise ValueError(
                f"non-ASCII ECAM ID at 0x{cursor:x}"
            ) from error
        if len(camera_id) != 4 or not camera_id.isdigit():
            raise ValueError(
                f"invalid ECAM ID {camera_id!r} at 0x{cursor:x}"
            )
        record_size = u32(data, cursor + 4)
        if record_size < 12 or record_size % 4:
            raise ValueError(
                f"invalid ECAM record size {record_size} for {camera_id}"
            )
        record_end = cursor + record_size
        if record_end > chunk_end:
            raise ValueError(f"ECAM record {camera_id} exceeds node")
        flags = u32(data, cursor + 8)
        curve_cursor = cursor + 12
        curves = {}
        required_channels = CHANNEL_NAMES[:6]
        optional_channels = []
        if flags & 0x20:
            optional_channels.append("roll")
        if flags & 0x40:
            optional_channels.append("perspective")
        for name in (*required_channels, *optional_channels):
            curve, curve_cursor = parse_curve(
                data,
                curve_cursor,
                record_end,
            )
            curves[name] = curve
        for name in CHANNEL_NAMES:
            curves.setdefault(name, {
                "count": 0,
                "times": [],
                "values": [],
                "slopes": [],
            })
        if curve_cursor != record_end:
            raise ValueError(
                f"ECAM record {camera_id} has "
                f"{record_end - curve_cursor} unparsed bytes"
            )
        records.append({
            "cameraId": camera_id,
            "cameraNumber": int(camera_id),
            "fileOffset": f"0x{cursor:x}",
            "recordSize": record_size,
            "flags": flags,
            "curves": curves,
        })
        cursor = record_end
    return {
        "ecamFileOffset": f"0x{chunk_offset:x}",
        "ecamSize": chunk_size,
        "records": records,
    }


def build_report(
    path: Path,
    camera_numbers: set[int] | None = None,
) -> dict[str, Any]:
    data = path.read_bytes()
    parsed = parse_ecam(data)
    if camera_numbers is not None:
        available = {
            record["cameraNumber"] for record in parsed["records"]
        }
        missing = sorted(camera_numbers - available)
        if missing:
            raise ValueError(f"requested ECAM records are missing: {missing}")
        parsed["records"] = [
            record for record in parsed["records"]
            if record["cameraNumber"] in camera_numbers
        ]
    return {
        "schema": "new-yokosuka-event-camera-catalog-v1",
        "source": portable_project_path(path),
        "mapinfoSha256": hashlib.sha256(data).hexdigest(),
        "channelOrder": list(CHANNEL_NAMES),
        "layoutSource": {
            "reference": "docs/reference/external/original-source-examples.md",
            "routine": "CreateSplData",
            "cameraOrder": "position XYZ, target XYZ, roll, perspective"
        },
        **parsed,
        "evidenceBoundary": [
            "Camera IDs, flags, counts, times, values, and slopes are decoded directly from the bounded MAPINFO ECAM node.",
            "The channel order and parallel-array layout come from the recovered original CreateSplData source.",
            "This catalog does not infer projection conventions, coordinate conversion, interpolation clock ownership, collision, or transition behavior."
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--camera",
        type=int,
        action="append",
        dest="camera_numbers",
        help="retain only this camera number; may be repeated",
    )
    args = parser.parse_args()
    selected = set(args.camera_numbers) if args.camera_numbers else None
    report = build_report(args.mapinfo.expanduser().resolve(), selected)
    output = args.out.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {output}: {len(report['records'])} event cameras"
    )


if __name__ == "__main__":
    main()
