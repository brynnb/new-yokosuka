#!/usr/bin/env python3
"""Recover native dialogue participant-table command routing."""

from __future__ import annotations

import argparse
import hashlib
import json
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
    ROOT / "tools" / "evidence" / "dialogue-participant-routes.json"
)

VERIFIED_RANGES = {
    "runtimePersonParticipantResolver": (
        0x0C159234,
        0x3E,
        "878592c97a32dfc04e55d0f76f20934acdb895ca5efc9a8e9851893b72d143be",
    ),
    "activeParticipantTableCopy": (
        0x0C1623E8,
        0x34,
        "d14bd0cd3f6f9c89c5913958c4fb4dba7e61e63455d63856cb2822980c5d9c72",
    ),
    "nativeCommandReceiver": (
        0x0C160EFE,
        0x21E,
        "d7507b9009d7b2d195e166cfec36a1fdca5c94c832c26128df1dd85426ce5699",
    ),
    "randomParticipantPairSelection": (
        0x0C161140,
        0x66,
        "15b8b5f3e2b6a02c9daf5ba4f4fcbddb847a305529837a56822418a23c71d336",
    ),
    "participantControlDispatch": (
        0x0C16175C,
        0xE4,
        "5bcffc1c19a40bdc34a0724a3a8afa4db6aaf719fefaa5eadc0cfe02cf804910",
    ),
    "actorMotionPointRequest": (
        0x0C0FEF0E,
        0x170,
        "aeecf11416e8145639853dc548dddafc2e77a601f224611af6ae5429201dc749",
    ),
}


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range {hx(address)}+{size} is unavailable")
    return data[offset : offset + size]


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
    return {
        "filename": "1ST_READ.BIN",
        "sha256": digest,
        "verifiedCodeRanges": ranges,
    }


def table_route(command_word: int) -> dict[str, Any] | None:
    if 0x32 <= command_word <= 0x3B:
        return {
            "participantTableIndex": command_word - 0x31,
            "behavior": "participantControlDispatch",
            "handlerAddress": hx(0x0C16175C),
        }
    if 0x8C <= command_word <= 0x95:
        return {
            "participantTableIndex": command_word - 0x8B,
            "behavior": "selectedParticipantWrite",
            "selectedParticipantAddress": hx(0x0C2243A0),
            "selectedParticipantFlagAddress": hx(0x0C224370),
        }
    return None


def iter_native_commands(body_routes: dict[str, Any]):
    for resource in body_routes["resources"]:
        for body in resource["bodies"]:
            for group in body["graph"]["messageGroups"]:
                for command in group["nativeCommands"]:
                    yield resource["actorCode"], command["commandWord"]


def build_report(
    executable: bytes,
    actor_resources: dict[str, Any],
    body_routes: dict[str, Any],
) -> dict[str, Any]:
    route_counts: Counter[int] = Counter()
    source_resources: dict[int, set[str]] = defaultdict(set)
    pair_counts: Counter[int] = Counter()
    for actor_code, command_word in iter_native_commands(body_routes):
        if table_route(command_word):
            route_counts[command_word] += 1
            source_resources[command_word].add(actor_code)
        if 0x28 <= command_word <= 0x31:
            pair_counts[command_word] += 1

    participant_tables = [
        resource["participantFourccs"]
        for resource in actor_resources["resources"]
    ]
    return {
        "schema": "new-yokosuka-dialogue-participant-routes-v1",
        "evidenceBoundary": [
            "The current runtime person supplies its participant FOURCC table and authored count. The receiver copies at most eight terminated entries to the active command table.",
            "Commands 0x032..0x03b dispatch active-table ordinal command-0x031 through native handler 0x0c16175c. Commands 0x08c..0x095 write ordinal command-0x08b to the selected-participant slot and set its flag.",
            "For an enabled 0x032..0x03b participant, handler 0x0c16175c records the selected FOURCC, resets prior target and AKIR control, and submits an actor motion-point request at the participant's current position minus 0.001 on native X with native up axis [0,1,0].",
            "A natural Flycast conversation independently reached this path and supplied the exact self-offset point without guest writes or artificial handler calls; animation naming and timing remain unassigned.",
            "Commands 0x028..0x031 execute the separate native pair-selection handler. That handler selects two distinct entries from ordinals 1..3, except 0x02a fixes ordinals 1 and 2. Its later consumer meaning remains unnamed.",
            "An ordinal beyond the terminated participant table resolves to no participant. The browser runtime preserves null instead of substituting the conversation owner or another actor.",
        ],
        "executableEvidence": verify_executable(executable),
        "activeParticipantTable": {
            "runtimePersonTableOffset": hx(0x28),
            "runtimePersonCountOffset": hx(0x16),
            "resolverAddress": hx(0x0C159234),
            "copyAddress": hx(0x0C1623E8),
            "storageAddress": hx(0x0C224270),
            "capacity": 8,
            "terminator": 0,
        },
        "commandFamilies": {
            "participantControlDispatch": {
                "firstCommand": hx(0x32),
                "lastCommand": hx(0x3B),
                "indexExpression": "commandWord - 0x31",
                "handlerAddress": hx(0x0C16175C),
                "excludedTargetFourcc": "CATM",
                "participantEnabledFlagsAddress": hx(0x0C224401),
                "selectedParticipantTableAddress": hx(0x0C22437C),
                "participantControlFlagsAddress": hx(0x0C22435C),
                "priorControlResetAddress": hx(0x0C162ACC),
                "priorControlResetTargets": [
                    "selected participant",
                    "AKIR",
                ],
                "motionRequestAddress": hx(0x0C0FEF0E),
                "motionTargetExpression": (
                    "[participant.x - 0.001, participant.y, participant.z]"
                ),
                "motionAxis": [0.0, 1.0, 0.0],
                "liveEvidence": (
                    "tools/evidence/"
                    "live-dialogue-participant-control-emulator-evidence.json"
                ),
            },
            "selectedParticipantWrite": {
                "firstCommand": hx(0x8C),
                "lastCommand": hx(0x95),
                "indexExpression": "commandWord - 0x8b",
                "selectedParticipantAddress": hx(0x0C2243A0),
                "selectedParticipantFlagAddress": hx(0x0C224370),
            },
            "participantPairSelection": {
                "firstCommand": hx(0x28),
                "lastCommand": hx(0x31),
                "handlerAddress": hx(0x0C161140),
                "randomOrdinals": [1, 2, 3],
                "requiresDistinctOrdinals": True,
                "fixedCommand": hx(0x2A),
                "fixedOrdinals": [1, 2],
            },
        },
        "summary": {
            "resourceCount": len(participant_tables),
            "participantTableLengthCounts": dict(sorted(Counter(
                len(table) for table in participant_tables
            ).items())),
            "resourceCountBeginningWithAkir": sum(
                bool(table) and table[0] == "AKIR"
                for table in participant_tables
            ),
            "participantRouteCommandSiteCount": sum(route_counts.values()),
            "participantRouteCommands": [
                {
                    "commandWord": hx(command_word),
                    **table_route(command_word),
                    "siteCount": count,
                    "sourceActorResourceCount": len(
                        source_resources[command_word]
                    ),
                }
                for command_word, count in sorted(route_counts.items())
            ],
            "participantPairCommandSiteCount": sum(pair_counts.values()),
            "participantPairCommandCounts": [
                {
                    "commandWord": hx(command_word),
                    "siteCount": count,
                }
                for command_word, count in sorted(pair_counts.items())
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
