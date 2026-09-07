#!/usr/bin/env python3
"""Verify the exact global presentation operations used by CATA's prelude."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_CONTROL_FLOW = (
    ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/native-prelude-presentation-state-evidence.json"
)
BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "operation0049": (0x0C16AE6E, 54),
    "fogAccessors": (0x0C0BF280, 50),
    "fogEnable": (0x0C0BF2B0, 44),
    "operation006f": (0x0C16AF3C, 204),
    "scrollColorSlotAccessors": (0x0C09B390, 18),
    "operation0173": (0x0C1571D6, 414),
    "cameraAuxiliaryAccessors": (0x0C09F62E, 126),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} unavailable")
    return data[offset:offset + size]


def call_inventory(control_flow: dict[str, Any], operation_id: int) -> list[dict]:
    result = []
    for item in control_flow["maps"]:
        for function in item["scriptedEventFunctions"]:
            for operation in function["nativeOperations"]:
                if operation.get("operationId") != operation_id:
                    continue
                result.append({
                    "disc": item["disc"],
                    "area": item["area"],
                    "callFileOffset": operation["callFileOffset"],
                    "arguments": operation.get("arguments", []),
                })
    return result


def require_cata_call(
    calls: list[dict],
    offset: str,
    expected_values: list[int | None],
) -> dict:
    call = next(
        item for item in calls
        if (
            item["disc"] == 1
            and item["area"] == "JU00"
            and item["callFileOffset"] == offset
        )
    )
    actual = [item.get("value") for item in call["arguments"]]
    if actual != expected_values:
        raise ValueError(f"CATA call {offset} changed: {actual!r}")
    return call


def build_report(executable: bytes, control_flow: dict[str, Any]) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for label, (address, size) in RANGES.items():
        sample = runtime_slice(executable, address, size)
        verified[label] = {
            "address": f"0x{address:08x}",
            "length": size,
            "sha256": digest(sample),
        }

    fog_calls = call_inventory(control_flow, 0x0049)
    scroll_calls = call_inventory(control_flow, 0x006F)
    camera_calls = call_inventory(control_flow, 0x0173)
    if len(fog_calls) != 107 or len(scroll_calls) != 111 or len(camera_calls) != 111:
        raise ValueError("prelude presentation operation inventory changed")
    if Counter(len(call["arguments"]) for call in fog_calls) != {1: 107}:
        raise ValueError("operation-0x0049 argument inventory changed")
    fog_kinds = Counter(call["arguments"][0].get("kind") for call in fog_calls)
    if fog_kinds != {"static-pointer": 106, "frame-address": 1}:
        raise ValueError("operation-0x0049 source inventory changed")
    scroll_modes = Counter(
        call["arguments"][0].get("value") for call in scroll_calls
    )
    if scroll_modes != {0: 92, 2: 16, 4: 3}:
        raise ValueError("operation-0x006f mode inventory changed")
    camera_modes = Counter(
        call["arguments"][0].get("value") for call in camera_calls
    )
    if camera_modes != {0: 7, 1: 3, 2: 3, 3: 1, 4: 1, 5: 96}:
        raise ValueError("operation-0x0173 mode inventory changed")

    cata_fog = require_cata_call(fog_calls, "0x26c26", [0x517DC])
    cata_scroll = require_cata_call(scroll_calls, "0x26c3e", [0, 0x517EC])
    cata_camera = [
        require_cata_call(camera_calls, offset, [0])
        for offset in ("0x2c092", "0x353fe")
    ]
    ju00_source = Path(next(
        item["source"] for item in control_flow["maps"]
        if item["disc"] == 1 and item["area"] == "JU00"
    )).read_bytes()
    fog_words = list(struct.unpack_from("<4I", ju00_source, 0x517DC))
    scroll_words = list(struct.unpack_from("<4I", ju00_source, 0x517EC))
    expected_fog_words = [0x4161999A, 0x44480000, 0x3EF5C28F, 0x7F9FD1FF]
    expected_scroll_words = [0, 0, 0xBB00663C, 0xBB00663C]
    if fog_words != expected_fog_words or scroll_words != expected_scroll_words:
        raise ValueError("CATA presentation payload changed")

    return {
        "schema": "new-yokosuka-native-prelude-presentation-state-evidence-v1",
        "status": "exact-native-routes-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "controlFlow": ".disc-work/dialogue/scripted-event-control-flow-index.json",
        },
        "operations": {
            "0x0049": {
                "handlerAddress": "0x0c16ae6e",
                "authoredCallCount": len(fog_calls),
                "sourceKindCounts": dict(fog_kinds),
                "fixedConfigurationAddress": "0x0c20bc44",
                "enabledAddress": "0x0c20bc54",
                "behavior": "Copies three float32 words and one packed color word, enables the native path, and rebuilds its 128-entry fog table.",
            },
            "0x006f-mode-0": {
                "handlerAddress": "0x0c16af3c",
                "allModeCounts": {str(key): value for key, value in sorted(scroll_modes.items())},
                "fixedSlotAddress": "0x0c1f7118",
                "slotCount": 4,
                "rendererResourceTags": ["SCRL", "SCOF", "SHOF", "SENT", "SCROLL%02d.SPR"],
                "behavior": "Copies four packed color words unchanged into the SCRL/SCROLL sprite renderer's four global slots.",
            },
            "0x0173-mode-0": {
                "handlerAddress": "0x0c1571d6",
                "allModeCounts": {str(key): value for key, value in sorted(camera_modes.items())},
                "controlAddress": "0x0c201b38",
                "auxiliaryVectorAddress": "0x0c201b3c",
                "primaryScaleAddress": "0x0c201b20",
                "secondaryScaleAddress": "0x0c201b2c",
                "behavior": "Writes control zero, auxiliary vector [0,0,0], and both scale vectors [1.0,1.0,1.0].",
            },
        },
        "cataDirectEntry": {
            "fogCall": cata_fog["callFileOffset"],
            "fogPointer": "0x517dc",
            "fogWords": fog_words,
            "scrollColorCall": cata_scroll["callFileOffset"],
            "scrollColorPointer": "0x517ec",
            "scrollColorWords": scroll_words,
            "cameraAuxiliaryResetCalls": [
                item["callFileOffset"] for item in cata_camera
            ],
        },
        "verifiedRanges": verified,
        "evidenceBoundary": [
            "Operation 0x0049's exact words and fog-table ownership are proven; its three float inputs are deliberately not assigned inferred names.",
            "Only operation 0x006f mode zero is promoted. Modes two and four remain unresolved.",
            "Only operation 0x0173 mode zero is promoted. Modes one through five remain unresolved.",
            "This evidence retains native state. A Babylon fog or screen-overlay presentation adapter is separate work.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--control-flow", type=Path, default=DEFAULT_CONTROL_FLOW)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.control_flow.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: CATA native prelude presentation state")


if __name__ == "__main__":
    main()
