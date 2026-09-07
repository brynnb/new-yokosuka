#!/usr/bin/env python3
"""Extract a Dreamcast fixed-turn door curve from an object RAM recording."""

import argparse
import csv
import json
from pathlib import Path


def signed_u16(value):
    value &= 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("recording", type=Path)
    parser.add_argument("--word-address", required=True)
    parser.add_argument("--selector", type=int, required=True)
    parser.add_argument("--static-door-index", type=int, required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()

    column = f"w_{int(args.word_address, 0):08x}"
    with args.recording.open(newline="") as source:
        reader = csv.DictReader(
            line for line in source if not line.startswith("#")
        )
        if column not in (reader.fieldnames or []):
            parser.error(f"{column} is not present in {args.recording}")
        rows = list(reader)

    changes = []
    previous = None
    for row in rows:
        raw = signed_u16(int(row[column], 16))
        if raw == previous:
            continue
        changes.append({
            "recordingFrame": int(row["frame"]),
            "fixedTurn": raw,
            "degrees": raw * 360 / 65536,
        })
        previous = raw

    if len(changes) < 2:
        parser.error("recording contains no door transition")
    start = changes[0]["fixedTurn"]
    endpoint = changes[-1]["fixedTurn"]
    distance = endpoint - start
    if distance == 0:
        parser.error("door endpoint equals its starting pose")

    report = {
        "schema": "shenmue-d000-door-curve-v1",
        "sourceRecording": str(args.recording),
        "selector": args.selector,
        "staticDoorIndex": args.static_door_index,
        "model": args.model,
        "wordAddress": f"0x{int(args.word_address, 0):08x}",
        "renderNodeKey": 12,
        "sampling": {
            "distinctGameUpdates": len(changes) - 1,
            "note": (
                "Interpreter host frames repeat game state. Consecutive "
                "distinct fixed-turn values are retained as game updates."
            ),
        },
        "startFixedTurn": start,
        "endpointFixedTurn": endpoint,
        "endpointDegrees": endpoint * 360 / 65536,
        "fixedTurnSamples": [change["fixedTurn"] for change in changes],
        "normalizedSamples": [
            (change["fixedTurn"] - start) / distance for change in changes
        ],
        "changes": changes,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
