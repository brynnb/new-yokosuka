#!/usr/bin/env python3
"""Recover native free-conversation participant facing-target semantics."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_EXECUTABLE,
    EXECUTABLE_SHA256,
    RUNTIME_BASE,
    hx,
    write_json,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ACTOR_RESOURCES = (
    ROOT / "tools" / "evidence" / "dialogue-actor-resources.json"
)
DEFAULT_BODY_ROUTES = (
    ROOT / ".disc-work" / "dialogue" / "actor-conversation-body-routes.json"
)
DEFAULT_OUTPUT = (
    ROOT / "tools" / "evidence" / "dialogue-participant-facing.json"
)

VERIFIED_RANGES = {
    "participantFacingCommandHandler": (
        0x0C16188C,
        0x276,
        "5f7a0107100ad06ec0771a241975758dd4a241d200570a9b2b71da8555d88999",
    ),
    "faceControllerTargetWriter": (
        0x0C0BC784,
        0xA0,
        "15d8708b777292a84b3fd7d8559908e5db59f5f94188066690c7bcb8338f495a",
    ),
    "lowerFamilyControlStateTransition": (
        0x0C161D06,
        0xA6,
        "2c19ce2320fee23b455412bbb226416ea7ef3454af004fe00ae9641474eb555b",
    ),
}

FACE_TYPE_LITERAL = 0x0C0BC81C
FACE_WRITER_POINTER_LITERAL = 0x0C161B20
FACE_WRITER_ADDRESS = 0x0C0BC784


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range {hx(address)}+{size} is unavailable")
    return data[offset : offset + size]


def runtime_u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def verify_executable(executable: bytes) -> dict[str, Any]:
    digest = hashlib.sha256(executable).hexdigest()
    if digest != EXECUTABLE_SHA256:
        raise ValueError(f"unexpected 1ST_READ.BIN SHA-256: {digest}")
    ranges = {}
    for name, (address, size, expected_digest) in VERIFIED_RANGES.items():
        actual = hashlib.sha256(runtime_slice(executable, address, size)).hexdigest()
        if actual != expected_digest:
            raise ValueError(f"native range {name} changed: {actual}")
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": actual,
        }
    if runtime_slice(executable, FACE_TYPE_LITERAL, 4) != b"FACE":
        raise ValueError("native target writer no longer resolves FACE")
    if runtime_u32(executable, FACE_WRITER_POINTER_LITERAL) != FACE_WRITER_ADDRESS:
        raise ValueError("participant handler FACE writer pointer changed")
    return {
        "filename": "1ST_READ.BIN",
        "sha256": digest,
        "verifiedCodeRanges": ranges,
        "faceControllerTypeLiteral": {
            "runtimeAddress": hx(FACE_TYPE_LITERAL),
            "value": "FACE",
        },
        "faceControllerWriterPointer": {
            "runtimeAddress": hx(FACE_WRITER_POINTER_LITERAL),
            "value": hx(FACE_WRITER_ADDRESS),
        },
    }


def command_target_index(command_word: int) -> int | None:
    if 0x14 <= command_word <= 0x1D:
        return command_word - 0x14
    if 0x78 <= command_word <= 0x81:
        return command_word - 0x78
    return None


def build_report(
    executable: bytes,
    actor_resources: dict[str, Any],
    body_routes: dict[str, Any],
) -> dict[str, Any]:
    targets = [
        target
        for resource in actor_resources["resources"]
        for target in resource["participantFacingTargets"]
    ]
    command_sites: Counter[int] = Counter()
    source_resources: dict[int, set[str]] = defaultdict(set)
    for resource in body_routes["resources"]:
        for body in resource["bodies"]:
            for group in body["graph"]["messageGroups"]:
                for command in group["nativeCommands"]:
                    command_word = command["commandWord"]
                    if command_target_index(command_word) is None:
                        continue
                    command_sites[command_word] += 1
                    source_resources[command_word].add(resource["actorCode"])

    return {
        "schema": "new-yokosuka-dialogue-participant-facing-v1",
        "evidenceBoundary": [
            "The command handler, FACE component lookup, FACE target writer, and lower-family control-state transition are exact executable evidence.",
            "Static actor SCNF +0x28 contains 12-byte float triples bounded by static participant table +0x20. The FACE consumer selects those triples by command ordinal.",
            "Commands 0x014..0x01d select index command-0x014 and then execute the additional native control-state transition. Commands 0x078..0x081 select index command-0x078 without that transition.",
            "Source actor-resource counts describe where command words occur in authored bytecode; they are not used as a substitute for the runtime participant identity passed to the native receiver.",
        ],
        "executableEvidence": verify_executable(executable),
        "nativeHandler": {
            "runtimeAddress": hx(0x0C16188C),
            "runtimePersonFacingTableOffset": hx(0x2C),
            "staticScnfFacingTableOffset": hx(0x28),
            "entrySize": 12,
            "controllerType": "FACE",
            "families": [
                {
                    "firstCommand": hx(0x14),
                    "lastCommand": hx(0x1D),
                    "indexExpression": "commandWord - 0x14",
                    "appliesControlStateTransition": True,
                    "transitionAddress": hx(0x0C161D06),
                },
                {
                    "firstCommand": hx(0x78),
                    "lastCommand": hx(0x81),
                    "indexExpression": "commandWord - 0x78",
                    "appliesControlStateTransition": False,
                    "transitionAddress": None,
                },
            ],
        },
        "summary": {
            "resourceCount": len(actor_resources["resources"]),
            "resourceWithFacingTargetsCount": sum(
                bool(resource["participantFacingTargets"])
                for resource in actor_resources["resources"]
            ),
            "facingTargetCount": len(targets),
            "nativeFacingCommandSiteCount": sum(command_sites.values()),
            "nativeFacingCommandCounts": [
                {
                    "commandWord": hx(command_word),
                    "targetIndex": command_target_index(command_word),
                    "siteCount": count,
                    "sourceActorResourceCount": len(
                        source_resources[command_word]
                    ),
                }
                for command_word, count in sorted(command_sites.items())
            ],
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument(
        "--actor-resources",
        type=Path,
        default=DEFAULT_ACTOR_RESOURCES,
    )
    parser.add_argument("--body-routes", type=Path, default=DEFAULT_BODY_ROUTES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.actor_resources.read_text(encoding="utf-8")),
        json.loads(args.body_routes.read_text(encoding="utf-8")),
    )
    write_json(args.output, report)
    print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
