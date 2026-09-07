#!/usr/bin/env python3
"""Extract the statically authored and runtime-observed D000 TKO node spin."""

from __future__ import annotations

import argparse
import csv
import json
import struct
from pathlib import Path


TKO_TAG_WORDS = {
    "4b4f4b54": "TKOK",
    "4c4f4b54": "TKOL",
}
STATIC_CALLS = {
    "TKOK": 0x69254,
    "TKOL": 0x69440,
}
VECTOR_FILE_OFFSET = 0xAE188
NODE = 0x98
MODE = 1
OPERATION = 0xC9


def hex32(value: int) -> str:
    return f"0x{value & 0xFFFFFFFF:08x}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--trace", type=Path)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    data = args.mapinfo.read_bytes()
    vector = struct.unpack_from("<3i", data, VECTOR_FILE_OFFSET)
    if vector != (0, -910, 0):
        raise SystemExit(f"unexpected TKO vector: {vector}")

    trace_counts: dict[tuple[str, str, str, str, str], int] = {}
    if args.trace:
        with args.trace.open(newline="") as handle:
            for row in csv.DictReader(handle):
                tag = TKO_TAG_WORDS.get(row["stack0"])
                if (
                    tag
                    and int(row["operation"], 16) == OPERATION
                    and int(row["stack1"], 16) == NODE
                    and int(row["stack2"], 16) == 0
                    and int(row["stack4"], 16) == MODE
                ):
                    key = (
                        tag,
                        row["pc"],
                        row["stack1"],
                        row["stack3"],
                        row["stack4"],
                    )
                    trace_counts[key] = trace_counts.get(key, 0) + 1

    report = {
        "schema": "new-yokosuka-d000-tko-node-spin-v1",
        "source": {
            "mapinfo": str(args.mapinfo),
            "trace": str(args.trace) if args.trace else None,
        },
        "operation": {
            "dispatcherOperation": hex32(OPERATION),
            "mode": MODE,
            "modeName": "add",
            "node": NODE,
            "rotationVectorFileOffset": hex(VECTOR_FILE_OFFSET),
            "sourceFixedTurnsPerTick": list(vector),
            "sourceDegreesPerTick": [
                value * 360 / 65536 for value in vector
            ],
            "gameHz": 30,
            "browserYReflection": (
                "Mt5Loader maps source rotation Y to Babylon -Y"
            ),
            "browserDegreesPerSecond": -vector[1] * 360 / 65536 * 30,
        },
        "staticCalls": [
            {
                "objectTag": tag,
                "callFileOffset": hex(offset),
                "operation": hex32(OPERATION),
                "node": NODE,
                "mode": MODE,
                "rotationVectorFileOffset": hex(VECTOR_FILE_OFFSET),
            }
            for tag, offset in STATIC_CALLS.items()
        ],
        "runtimeObservations": [
            {
                "objectTag": key[0],
                "pc": f"0x{key[1]}",
                "node": int(key[2], 16),
                "rotationPointer": f"0x{key[3]}",
                "mode": int(key[4], 16),
                "callCount": count,
            }
            for key, count in sorted(trace_counts.items())
        ],
    }
    serialized = json.dumps(report, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(serialized)
    print(serialized, end="")


if __name__ == "__main__":
    main()
