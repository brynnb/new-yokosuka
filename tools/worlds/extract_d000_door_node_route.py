#!/usr/bin/env python3
"""Verify and report D000's native paired-door node-selection branch."""

import argparse
import json
from pathlib import Path


SIGNATURES = {
    # Function entry: save r14/pr, allocate 0xc4 bytes, set r14 to the frame.
    0x1DE74: "e62d224d807dbc7dd36e",
    # First caller passes its normalized boolean at caller frame +0x08.
    0x1576C: "00e4e255e856e757462de654562de555662d762d462d562d",
    # Second caller passes its relative-heading quadrant at frame +0x0c.
    0x15B34: "01e4e355e956e857462de754562de655662d762d462d562d",
    # Read incoming argument +0xdc; route values 2/3 to the first branch.
    0x21940: "08d0ee0402e550344a3406d0ee0503e660355a355b2443600088078b",
    # The first branch writes HMDL node 12.
    0x2197C: "00e40ce5ec3500e60ce7",
    # The alternate branch writes HMDL node 7.
    0x219C4: "00e40ce5ec3500e607e7",
    # Relative heading: subtract the object heading, divide fixed turns into
    # four quadrants, and mask to 0..3.
    0x29BD8: "1ce4ec34e7552ce6ec3604e77c36626668350ee66b666c4503e669255224",
}


def verify_signature(data, offset, encoded):
    expected = bytes.fromhex(encoded)
    actual = data[offset:offset + len(expected)]
    if actual != expected:
        raise ValueError(
            f"signature mismatch at 0x{offset:x}: "
            f"expected {expected.hex()}, found {actual.hex()}"
        )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    args = parser.parse_args()

    data = args.mapinfo.read_bytes()
    for offset, encoded in SIGNATURES.items():
        verify_signature(data, offset, encoded)

    report = {
        "schema": "shenmue-d000-door-node-route-v1",
        "source": str(args.mapinfo),
        "function": {
            "fileOffset": "0x1de74",
            "frameByteCount": 0xC4,
            "selectorIncomingStackOffset": "0xdc",
            "reason": (
                "The function allocates 0xc4 bytes after saving r14/pr; "
                "offset 0xdc therefore reads the fifth caller stack word."
            ),
        },
        "callers": [
            {
                "callFileOffset": "0x15786",
                "selectorCallerFrameOffset": "0x08",
                "selectorKind": "normalized-boolean",
            },
            {
                "callFileOffset": "0x15b4e",
                "selectorCallerFrameOffset": "0x0c",
                "selectorKind": "relative-heading-quadrant",
                "quadrantHelperFileOffset": "0x29a74",
                "quadrantReductionFileOffset": "0x29bd8",
            },
        ],
        "branch": {
            "fileOffset": "0x21940",
            "node12SelectorValues": [2, 3],
            "node12SetterFileOffset": "0x2199a",
            "node7SelectorValues": [0, 1],
            "node7SetterFileOffset": "0x219e2",
        },
        "browserSideObservation": {
            "sourceCapture": (
                "captures/pvr/20260724-013823-frame-9042/ram.bin"
            ),
            "doorSelector": 53,
            "staticDoorIndex": 0,
            "model": "S1_D000_DR01_011.MT5",
            "actorBrowserPosition": [
                121.08992767333984,
                0,
                81.13014221191406,
            ],
            "doorBrowserPosition": [122.646652, 0.0724, 82.192696],
            "doorBrowserYawDegrees": -51.59729,
            "actorDoorLocalZ": 0.5599071226606611,
            "observedRenderNodeKey": 12,
            "mapping": {
                "nonnegativeDoorLocalZ": 12,
                "negativeDoorLocalZ": 7,
            },
        },
        "verifiedSignatures": [
            {
                "fileOffset": f"0x{offset:x}",
                "bytes": encoded,
            }
            for offset, encoded in SIGNATURES.items()
        ],
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
