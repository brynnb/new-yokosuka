#!/usr/bin/env python3
"""Reduce an SH-4 0x00c9 call trace to exact D000 door operations."""

import argparse
import csv
import json
import struct
from collections import Counter
from pathlib import Path


def tag_from_word(word):
    return struct.pack("<I", int(word, 16)).decode("ascii", errors="replace")


def signed_u16(word):
    value = int(word, 16) & 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", type=Path)
    parser.add_argument("--tag", default="dor0")
    parser.add_argument("--selector", type=int)
    parser.add_argument("--static-door-index", type=int)
    parser.add_argument("--model")
    args = parser.parse_args()

    with args.trace.open(newline="") as source:
        rows = list(csv.DictReader(source))

    tagged = [
        row for row in rows
        if tag_from_word(row["stack0"]) == args.tag
        and int(row["operation"], 16) == 0xC9
    ]
    operations = Counter()
    for row in tagged:
        operations[(
            row["pc"],
            int(row["stack1"], 16),
            int(row["stack4"], 16),
            row["stack2"] != "00000000",
            row["stack3"] != "00000000",
        )] += 1

    # The native setter descriptor is {tag, node 12, no position,
    # rotation pointer, mode 0}. Its rotation vector begins at stack8 because
    # r13 is 0x14 bytes below the routine's r14 local frame.
    setters = [
        row for row in tagged
        if int(row["stack1"], 16) == 12
        and row["stack2"] == "00000000"
        and row["stack3"] != "00000000"
        and int(row["stack4"], 16) == 0
    ]
    if not setters:
        parser.error(f"no node-12 rotation setter for {args.tag}")

    samples = []
    for row in setters:
        turn = signed_u16(row["stack9"])
        if not samples or samples[-1] != turn:
            samples.append(turn)

    # Opening begins with the first nonzero sample and is followed by the
    # longest stable endpoint before a later reverse/transition sequence.
    stable_start = 0
    best_start = 0
    best_length = 0
    for index in range(1, len(setters) + 1):
        if (
            index == len(setters)
            or setters[index]["stack9"] != setters[stable_start]["stack9"]
        ):
            length = index - stable_start
            if length > best_length:
                best_start = stable_start
                best_length = length
            stable_start = index
    endpoint = signed_u16(setters[best_start]["stack9"])
    endpoint_index = next(
        index for index, turn in enumerate(samples) if turn == endpoint
    )
    opening_samples = [0, *samples[:endpoint_index + 1]]
    if len(opening_samples) >= 2 and opening_samples[0] == opening_samples[1]:
        opening_samples.pop(0)

    report = {
        "schema": "shenmue-d000-door-call-trace-v1",
        "sourceTrace": str(args.trace),
        "tag": args.tag,
        **({"selector": args.selector} if args.selector is not None else {}),
        **({
            "staticDoorIndex": args.static_door_index,
        } if args.static_door_index is not None else {}),
        **({"model": args.model} if args.model else {}),
        "summary": {
            "allCallCount": len(rows),
            "taggedCallCount": len(tagged),
            "distinctOperationCount": len(operations),
            "node12SetterCallCount": len(setters),
            "openingUpdateCount": len(opening_samples) - 1,
            "endpointStableCallCount": best_length,
        },
        "operations": [
            {
                "pc": pc,
                "node": node,
                "mode": mode,
                "hasPosition": has_position,
                "hasRotation": has_rotation,
                "callCount": count,
            }
            for (
                pc,
                node,
                mode,
                has_position,
                has_rotation,
            ), count in sorted(operations.items())
        ],
        "opening": {
            "node": 12,
            "axis": "y",
            "setterPc": setters[0]["pc"],
            "endpointFixedTurn": endpoint,
            "endpointDegrees": endpoint * 360 / 65536,
            "fixedTurnSamples": opening_samples,
            "normalizedSamples": [
                turn / endpoint for turn in opening_samples
            ],
        },
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
