#!/usr/bin/env python3
"""Decode JOMO's compact shared-object tables without runtime interaction.

This deliberately stops at the evidence boundary: table membership, callback
tokens, action IDs, per-object offsets, and node selectors are decoded
exactly. A callback token is not labeled as translation or rotation until its
native dataflow has also been proven.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from collections import defaultdict
from pathlib import Path
from typing import Any


GROUP_START = 0x9B700
GROUP_END = 0x9B960
RECORD_START = 0x9A800
RECORD_END = GROUP_START
FUNCTION_TABLE_START = 0x9D160


def printable_tag(raw: bytes) -> str | None:
    if len(raw) != 4 or any(value < 0x20 or value > 0x7E for value in raw):
        return None
    return raw.decode("ascii")


def decode_callback_token(data: bytes, word: int) -> dict[str, Any]:
    selector = word >> 16
    result = {
        "rawHex": f"0x{word:08x}",
        "opcode": f"0x{word & 0xffff:04x}",
        "selector": selector,
    }
    entry_offset = FUNCTION_TABLE_START + selector * 4
    if (
        word & 0xffff == 0x05A9
        and entry_offset + 4 <= len(data)
    ):
        # SCN3 stores each exported SH-4 entry eight bytes before the first
        # executable instruction.
        stored_offset = struct.unpack_from("<I", data, entry_offset)[0]
        result["functionTableEntryFileOffset"] = f"0x{entry_offset:x}"
        result["functionFileOffset"] = f"0x{stored_offset + 8:x}"
    return result


def read_groups(data: bytes, known_tags: set[str]) -> list[dict[str, Any]]:
    groups = []
    offset = GROUP_START
    while offset + 4 <= min(GROUP_END, len(data)):
        if data[offset : offset + 4] != b"\xff\xff\xff\xff":
            offset += 4
            continue
        cursor = offset + 4
        header_words = []
        tags = []
        while cursor + 4 <= min(GROUP_END, len(data)):
            raw = data[cursor : cursor + 4]
            if raw == b"\xff\xff\xff\xff":
                break
            tag = printable_tag(raw)
            if tag in known_tags:
                tags.append(tag)
            elif tags:
                break
            else:
                header_words.append(struct.unpack_from("<I", raw)[0])
            cursor += 4
        if tags:
            groups.append({
                "index": len(groups),
                "fileOffset": f"0x{offset:x}",
                "callbackTokens": [
                    decode_callback_token(data, word) for word in header_words
                ],
                "objectTags": tags,
            })
            offset = cursor
        else:
            offset += 4
    return groups


def read_records(data: bytes, known_tags: set[str]) -> dict[str, dict[str, Any]]:
    records = {}
    for offset in range(RECORD_START, min(RECORD_END, len(data)), 0x20):
        tag = printable_tag(data[offset : offset + 4])
        if tag not in known_tags:
            continue
        words = struct.unpack_from("<8I", data, offset)
        values = struct.unpack_from("<3f", data, offset + 8)
        if not all(math.isfinite(value) for value in values):
            continue
        selector = words[7]
        # The trailing string pool can contain an aligned four-character
        # identifier that resembles a record (BMB2 is the known example).
        # Records are ordered before that pool, so retain the first valid
        # aligned occurrence instead of allowing later text to overwrite it.
        records.setdefault(tag, {
            "fileOffset": f"0x{offset:x}",
            "interactionOffset": list(values),
            "actionId": words[6],
            "actionIdHex": f"0x{words[6]:08x}",
            "route": {
                "nodeOrVariant": selector & 0xffff,
                "nodeOrVariantHex": f"0x{selector & 0xffff:04x}",
                "flags": selector >> 16,
                "flagsHex": f"0x{selector >> 16:04x}",
            },
            "rawWords": [f"0x{word:08x}" for word in words],
        })
    return records


def paired_actions(
    group: dict[str, Any],
    records: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    by_action: dict[int, list[str]] = defaultdict(list)
    for tag in group["objectTags"]:
        record = records.get(tag)
        if record:
            by_action[record["actionId"]].append(tag)
    return [
        {
            "actionId": action_id,
            "actionIdHex": f"0x{action_id:08x}",
            "objectTags": tags,
            "records": [records[tag] for tag in tags],
        }
        for action_id, tags in sorted(by_action.items())
        if len(tags) > 1
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("runtime_manifest", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    data = args.mapinfo.read_bytes()
    manifest = json.loads(args.runtime_manifest.read_text())
    known_tags = {
        entry["objectTag"] for entry in manifest.get("objectTags", [])
        if entry.get("objectTag")
    }
    groups = read_groups(data, known_tags)
    records = read_records(data, known_tags)
    for group in groups:
        group["records"] = {
            tag: records[tag] for tag in group["objectTags"] if tag in records
        }
        group["pairedActions"] = paired_actions(group, records)

    result = {
        "schema": "new-yokosuka-jomo-shared-object-dispatch-v1",
        "source": {
            "mapinfo": str(args.mapinfo),
            "runtimeManifest": str(args.runtime_manifest),
        },
        "method": {
            "runtimeInputRequired": False,
            "emulatorClicksRequired": False,
            "groupRange": [f"0x{GROUP_START:x}", f"0x{GROUP_END:x}"],
            "recordRange": [f"0x{RECORD_START:x}", f"0x{RECORD_END:x}"],
            "functionTableFileOffset": f"0x{FUNCTION_TABLE_START:x}",
            "evidenceBoundary": (
                "Callback tokens, action IDs, offsets, selectors, and pair "
                "membership are exact. Motion type remains unresolved until "
                "the selector-to-transform dataflow is proven."
            ),
        },
        "summary": {
            "groupCount": len(groups),
            "groupedObjectCount": sum(len(group["objectTags"]) for group in groups),
            "decodedRecordCount": len(records),
            "pairedActionCount": sum(
                len(group["pairedActions"]) for group in groups
            ),
        },
        "groups": groups,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(
        f"Wrote {args.out} "
        f"({len(groups)} groups, {len(records)} records)"
    )


if __name__ == "__main__":
    main()
