#!/usr/bin/env python3
"""Verify and extract JD00's source-backed EVNT transition regions."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


EXPECTED_SHA256 = (
    "8582ed57e13593d7622d24216ef8f93e5393b13fffd2132f70500f9e6ce2a43b"
)
SCN3_FILE_OFFSET = 0x5A0
EVNT_FILE_OFFSET = 0x8C534
CALLBACK_TABLE_FILE_OFFSET = 0x80E18
ACTIVE_FLAG_MASK = 0xFFFF0000
ACTIVE_FLAG_VALUE = 0x00040000


def hex_offset(value: int) -> str:
    return f"0x{value:x}"


def browser_shape(values: tuple[float, ...]) -> dict[str, object]:
    origin = [-values[0], -values[1]]
    edge_a = [-values[2], -values[3]]
    edge_b = [-values[4], -values[5]]
    vertices = [
        origin,
        [origin[0] + edge_a[0], origin[1] + edge_a[1]],
        [
            origin[0] + edge_a[0] + edge_b[0],
            origin[1] + edge_a[1] + edge_b[1],
        ],
        [origin[0] + edge_b[0], origin[1] + edge_b[1]],
    ]
    return {
        "origin": origin,
        "edgeA": edge_a,
        "edgeB": edge_b,
        "vertices": vertices,
    }


def extract_records(data: bytes) -> list[dict[str, object]]:
    tag, payload_bytes = struct.unpack_from("<4sI", data, EVNT_FILE_OFFSET)
    if tag != b"EVNT":
        raise ValueError(
            f"expected EVNT at {hex_offset(EVNT_FILE_OFFSET)}, got {tag!r}"
        )

    cursor = EVNT_FILE_OFFSET + 8
    end = cursor + payload_bytes
    records = []
    while cursor < end:
        record_offset = cursor
        flag, kind = struct.unpack_from("<II", data, cursor)
        cursor += 8
        if kind != 5:
            raise ValueError(
                f"unexpected EVNT kind {kind} at {hex_offset(record_offset)}"
            )
        values = struct.unpack_from("<6f", data, cursor)
        cursor += 24
        terminator = struct.unpack_from("<I", data, cursor)[0]
        cursor += 4
        if terminator != 0xFFFFFFFF:
            raise ValueError(
                f"missing terminator at {hex_offset(cursor - 4)}"
            )
        records.append(
            {
                "recordFileOffset": hex_offset(record_offset),
                "flag": flag,
                "flagHex": f"0x{flag:08x}",
                "eventId": flag & 0xFFFF,
                "kind": kind,
                "nativeQueryShape": {
                    "origin": list(values[0:2]),
                    "edgeA": list(values[2:4]),
                    "edgeB": list(values[4:6]),
                },
                "browserShape": browser_shape(values),
            }
        )
    if cursor != end:
        raise ValueError("EVNT payload did not end on a record boundary")
    return records


def extract_callback_table(data: bytes) -> list[dict[str, object]]:
    results = []
    for event_id in range(4):
        stored = struct.unpack_from(
            "<I", data, CALLBACK_TABLE_FILE_OFFSET + event_id * 4
        )[0]
        results.append(
            {
                "eventId": event_id,
                "storedScn3RelativeFunction": hex_offset(stored),
                "functionFileOffset": hex_offset(stored + SCN3_FILE_OFFSET),
            }
        )
    return results


def verify_manifest(
    records: list[dict[str, object]],
    callbacks: list[dict[str, object]],
    manifest_path: Path,
) -> None:
    manifest = json.loads(manifest_path.read_text())
    manifest_records = {
        route["trigger"]["eventId"]: route["trigger"]
        for route in manifest["routes"]
    }
    active_records = {
        record["eventId"]: record
        for record in records
        if (
            record["flag"] & ACTIVE_FLAG_MASK
        ) == ACTIVE_FLAG_VALUE
    }
    if set(active_records) != {1, 2, 3}:
        raise ValueError(
            f"expected active EVNT IDs 1, 2, 3; got {sorted(active_records)}"
        )
    for event_id, record in active_records.items():
        manifest_record = manifest_records[event_id]
        for key in (
            "recordFileOffset",
            "flag",
            "flagHex",
            "eventId",
            "kind",
            "nativeQueryShape",
            "browserShape",
        ):
            if manifest_record[key] != record[key]:
                raise ValueError(
                    f"manifest event {event_id} differs at {key}"
                )

    manifest_callbacks = manifest["selectorFlow"]["callbackTable"]["entries"]
    for extracted, recorded in zip(callbacks, manifest_callbacks, strict=True):
        for key in (
            "eventId",
            "storedScn3RelativeFunction",
            "functionFileOffset",
        ):
            if extracted[key] != recorded[key]:
                raise ValueError(
                    f"manifest callback {extracted['eventId']} differs at {key}"
                )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mapinfo",
        nargs="?",
        type=Path,
        default=Path(
            ".disc-work/mapinfo/disc1/SCENE/01/JD00/MAPINFO.BIN"
        ),
    )
    parser.add_argument(
        "--verify-manifest",
        type=Path,
        default=Path(
            "tools/evidence/jd00-d000-boundary-transition.json"
        ),
    )
    args = parser.parse_args()

    data = args.mapinfo.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != EXPECTED_SHA256:
        raise ValueError(
            f"unexpected MAPINFO SHA-256: {digest}; expected {EXPECTED_SHA256}"
        )

    records = extract_records(data)
    callbacks = extract_callback_table(data)
    if args.verify_manifest:
        verify_manifest(records, callbacks, args.verify_manifest)
    print(
        json.dumps(
            {
                "mapinfo": str(args.mapinfo),
                "mapinfoSha256": digest,
                "eventTokenFileOffset": hex_offset(EVNT_FILE_OFFSET),
                "records": records,
                "callbackTableFileOffset": hex_offset(
                    CALLBACK_TABLE_FILE_OFFSET
                ),
                "callbackTable": callbacks,
                "manifestVerified": (
                    str(args.verify_manifest)
                    if args.verify_manifest
                    else None
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
