#!/usr/bin/env python3
"""Prove the native placement-mode-10 controller transform from RAM."""

from __future__ import annotations

import hashlib
import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CAPTURES = [
    ROOT / "captures/analysis/dobuita-tknb-native-controller.json",
    ROOT / "captures/analysis/dobuita-kenji-native-controllers.json",
]
OUTPUT = (
    ROOT
    / "tools/evidence/scheduled-actor-controller-transform-evidence.json"
)
RAM_BASE = 0x8C000000


def unpack(ram: bytes, address: int, offset: int, fmt: str):
    return list(struct.unpack_from("<" + fmt, ram, address - RAM_BASE + offset))


def main():
    observations = []
    for capture_path in CAPTURES:
        capture = json.loads(capture_path.read_text())
        ram_path = Path(capture["source"]["ramPath"])
        ram = ram_path.read_bytes()
        digest = hashlib.sha256(ram).hexdigest()
        if digest != capture["source"]["sha256"]:
            raise RuntimeError(f"RAM hash mismatch: {ram_path}")
        for actor in capture["actors"]:
            actor_address = int(actor["actorAddress"], 16)
            controller_address = int(actor["controllerAddress"], 16)
            actor_position = unpack(ram, actor_address, 0x24, "3f")
            controller_position = unpack(
                ram, controller_address, 0x150, "3f"
            )
            actor_facing = unpack(ram, actor_address, 0x50, "h")[0]
            controller_rotation = unpack(
                ram, controller_address, 0x18C, "3i"
            )
            action_position = unpack(ram, actor_address, 0x1AC, "3f")
            observations.append(
                {
                    "actorCode": actor["actorCode"],
                    "capture": str(capture_path.relative_to(ROOT)),
                    "ramSha256": digest,
                    "actorAddress": actor["actorAddress"],
                    "controllerAddress": actor["controllerAddress"],
                    "actorCurrentPositionAt0x24": actor_position,
                    "controllerPositionAt0x150": controller_position,
                    "positionDelta": [
                        controller_position[index] - actor_position[index]
                        for index in range(3)
                    ],
                    "positionDeltaLength": math.dist(
                        actor_position, controller_position
                    ),
                    "actorFacingAt0x50": actor_facing,
                    "controllerEulerAt0x18c": controller_rotation,
                    "facingMatchesControllerY": (
                        actor_facing == controller_rotation[1]
                    ),
                    "actorActionPositionAt0x1ac": action_position,
                    "actionToCurrentDistance": math.dist(
                        action_position, actor_position
                    ),
                }
            )

    output = {
        "schema": "new-yokosuka-scheduled-actor-controller-transform-v1",
        "nativeRoutine": {
            "attachmentMatrixHandler": "0x0c11d6fa",
            "mode": 10,
            "controllerPointer": "actor +0x6c",
            "translation": "controller +0x150",
            "rotationX": "controller +0x18c",
            "rotationY": "controller +0x190",
            "rotationZ": "controller +0x194",
            "compositionOrder": [
                "identity",
                "translation",
                "rotationY",
                "rotationX",
                "rotationZ",
                "finalize",
            ],
        },
        "summary": {
            "observationCount": len(observations),
            "allFacingValuesMatch": all(
                item["facingMatchesControllerY"] for item in observations
            ),
            "maximumCurrentPositionDelta": max(
                item["positionDeltaLength"] for item in observations
            ),
            "minimumActionToCurrentDistance": min(
                item["actionToCurrentDistance"] for item in observations
            ),
        },
        "observations": observations,
        "evidenceBoundary": (
            "The native routine and offsets come from relocation-aware SH-4 "
            "disassembly. Two independent Dobuita RAM captures show the "
            "controller transform follows current actor position/facing while "
            "actor +0x1ac is a distinct action position. Browser mode 10 may "
            "therefore use the current scheduled-actor root; it is not aliased "
            "to mode 11."
        ),
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output["summary"], indent=2))


if __name__ == "__main__":
    main()
