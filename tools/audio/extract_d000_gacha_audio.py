#!/usr/bin/env python3
"""Recover D000 gacha audio commands and their authored-motion control flow.

This is deliberately a static extractor. It proves command identity, coroutine
reachability, and the Ryo-frame gates present in SCN3 without naming sounds by
ear or converting child-coroutine scheduler ticks into motion frames.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from collections import defaultdict, deque
from pathlib import Path
from typing import Any


from tools.scripting.extract_dialogue_call_graph import (  # noqa: E402
    containing_function,
    coroutine_launches,
    direct_call_edges,
    function_starts,
)
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls  # noqa: E402
from tools.scripting.extract_sh4_object_transforms import disassemble  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)
EXPECTED_BANK_SHA256 = (
    "84538c809f1eb93b6afd52d39061b21d2009929c21f313ccef07a7ac7e406349"
)
EXPECTED_MOTION_SHA256 = (
    "3dee651e6b7b5d33c0326628133ea104ab643f75c25ceec404fdb94739ccc23b"
)

ROOT_FUNCTION = 0x52780
SOUND_OPERATION = 0x006C
RYO_FRAME_OPERATION = 0x002B

ROOT_GATES = (
    (100.0, 0x52824, 0x52860, 0x52A90),
    (170.0, 0x52894, 0x528BC, 0x52C4C),
    (215.0, 0x528EC, 0x52914, 0x52DE4),
    (280.0, 0x52944, 0x5296C, 0x52F5C),
    (300.0, 0x5299C, 0x529C4, 0x52FF4),
    (310.0, 0x529F4, 0x52A1C, 0x535E4),
)

EXPECTED_SOUNDS = (
    (0x53876, 0x535E4, "a9040200"),
    (0x541F6, 0x540F0, "a9040500"),
    (0x54396, 0x54244, "a9040100"),
    (0x55592, 0x553D0, "a9040000"),
    (0x555C6, 0x555AC, "a9040300"),
    (0x55CEA, 0x555AC, "a9040400"),
)

EXPECTED_LAUNCHES = (
    (0x52780, 0x52A90, 0x52860, 1),
    (0x52780, 0x52C4C, 0x528BC, 0),
    (0x52780, 0x52DE4, 0x52914, 0),
    (0x52780, 0x52F5C, 0x5296C, 0),
    (0x52780, 0x52FF4, 0x529C4, 0),
    (0x52780, 0x535E4, 0x52A1C, 0),
    (0x52A90, 0x553D0, 0x52C12, 0),
    (0x52C4C, 0x54244, 0x52D2E, 1),
    (0x52DE4, 0x54244, 0x52E70, 1),
    (0x52DE4, 0x555AC, 0x52EDE, 0),
    (0x52DE4, 0x55CFC, 0x52F18, 0),
    (0x535E4, 0x540F0, 0x539BE, 1),
    (0x535E4, 0x53E98, 0x53B4A, 0),
    (0x535E4, 0x540F0, 0x53DF2, 1),
)


def first_existing(candidates: list[Path], label: str) -> Path:
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        f"{label} not found; tried: {', '.join(map(str, candidates))}"
    )


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:x}"


def native_command_hex(value: int) -> str:
    return struct.pack("<I", value).hex()


def shortest_launch_path(
    source: int,
    target: int,
    launches: list[dict[str, int]],
) -> list[dict[str, int]]:
    outgoing: dict[int, list[dict[str, int]]] = defaultdict(list)
    for launch in launches:
        outgoing[launch["source"]].append(launch)
    queue = deque([(source, [])])
    visited = {source}
    while queue:
        node, path = queue.popleft()
        if node == target:
            return path
        for launch in outgoing[node]:
            if launch["target"] in visited:
                continue
            visited.add(launch["target"])
            queue.append((launch["target"], path + [launch]))
    return []


def compact_launch(launch: dict[str, int]) -> dict[str, Any]:
    return {
        "sourceFunctionFileOffset": hx(launch["source"]),
        "launchCallFileOffset": hx(launch["call"]),
        "targetFunctionFileOffset": hx(launch["target"]),
        "childArgumentCount": launch["argumentCount"],
    }


def file_evidence(path: Path, data: bytes, logical_path: str) -> dict[str, Any]:
    return {
        "path": logical_path,
        "byteLength": len(data),
        "sha256": sha256(data),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mapinfo",
        type=Path,
        default=None,
        help="exact D000 MAPINFO.BIN",
    )
    parser.add_argument(
        "--bank",
        type=Path,
        default=None,
        help="Disc 1 E1GACHAP.SND",
    )
    parser.add_argument(
        "--motion",
        type=Path,
        default=PROJECT_ROOT / "play/assets/dobuita/M_GACH.MOTN",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROJECT_ROOT / "tools/evidence/d000-gacha-audio.json",
    )
    parser.add_argument("--objdump", default="sh4-linux-gnu-objdump")
    args = parser.parse_args()

    mapinfo_path = args.mapinfo or first_existing(
        [
            PROJECT_ROOT / ".disc-work/exact/d000/MAPINFO.BIN",
        ],
        "D000 MAPINFO",
    )
    bank_path = args.bank or first_existing(
        [
            PROJECT_ROOT
            / "extracted_files/data/SCENE/01/SOUND/E1GACHAP.SND",
            PROJECT_ROOT
            / "extracted_files/data/SCENE/01/SOUND/E1GACHAP.SND",
        ],
        "Disc 1 E1GACHAP.SND",
    )
    motion_path = args.motion.resolve()
    mapinfo = mapinfo_path.read_bytes()
    bank = bank_path.read_bytes()
    motion = motion_path.read_bytes()
    failures: list[str] = []

    for label, actual, expected in (
        ("MAPINFO", sha256(mapinfo), EXPECTED_MAPINFO_SHA256),
        ("E1GACHAP", sha256(bank), EXPECTED_BANK_SHA256),
        ("M_GACH", sha256(motion), EXPECTED_MOTION_SHA256),
    ):
        if actual != expected:
            failures.append(f"{label} SHA-256 changed: {actual}")

    data, static_base, dispatch_calls, _ = mapinfo_dispatch_calls(
        mapinfo_path,
        args.objdump,
    )
    scn3 = data.find(b"SCN3")
    code_start = scn3 + 0x30
    starts = function_starts(data, code_start, static_base)
    instructions = [
        row
        for row in disassemble(mapinfo_path, args.objdump)
        if code_start <= row[0] < static_base
    ]
    edges = direct_call_edges(instructions, starts, code_start, static_base)
    launches = coroutine_launches(
        instructions,
        dispatch_calls,
        starts,
        scn3,
        code_start,
        static_base,
    )
    launches_by_key = {
        (
            launch["source"],
            launch["target"],
            launch["call"],
            launch["argumentCount"],
        ): launch
        for launch in launches
    }
    for expected in EXPECTED_LAUNCHES:
        if expected not in launches_by_key:
            failures.append(
                "missing coroutine launch "
                + " -> ".join(hx(value) for value in expected[:3])
            )

    calls_by_offset = {
        int(call["callFileOffset"], 16): call for call in dispatch_calls
    }
    sounds = []
    for call_offset, expected_function, expected_command in EXPECTED_SOUNDS:
        call = calls_by_offset.get(call_offset)
        function = containing_function(starts, call_offset)
        command = (
            native_command_hex(call["arguments"][0]["value"])
            if call
            and call.get("operationId") == SOUND_OPERATION
            and call.get("arguments")
            and isinstance(call["arguments"][0].get("value"), int)
            else None
        )
        if function != expected_function or command != expected_command:
            failures.append(
                f"sound call {hx(call_offset)} resolved to "
                f"{hx(function) if function is not None else None}/{command}"
            )
        path = shortest_launch_path(
            ROOT_FUNCTION,
            expected_function,
            launches,
        )
        sounds.append({
            "callFileOffset": hx(call_offset),
            "functionFileOffset": hx(expected_function),
            "operationHex": "0x006c",
            "commandHex": command,
            "launchPath": [compact_launch(item) for item in path],
        })

    root_gates = []
    for frame, literal_offset, call_offset, child in ROOT_GATES:
        actual_frame = struct.unpack_from("<f", mapinfo, literal_offset)[0]
        launch = launches_by_key.get(
            next(
                (
                    key
                    for key in launches_by_key
                    if key[0] == ROOT_FUNCTION
                    and key[1] == child
                    and key[2] == call_offset
                ),
                (-1, -1, -1, -1),
            )
        )
        if actual_frame != frame or launch is None:
            failures.append(
                f"root gate {hx(call_offset)} did not resolve to frame {frame:g}"
            )
        root_gates.append({
            "motionFrame": int(frame),
            "floatLiteralFileOffset": hx(literal_offset),
            "launchCallFileOffset": hx(call_offset),
            "childFunctionFileOffset": hx(child),
        })

    frame_query = calls_by_offset.get(0x537FA)
    frame_360 = struct.unpack_from("<f", mapinfo, 0x53830)[0]
    if (
        frame_query is None
        or frame_query.get("operationId") != RYO_FRAME_OPERATION
        or frame_query.get("argumentCount") != 1
        or frame_query["arguments"][0].get("ascii") != "AKIR"
        or frame_360 != 360.0
    ):
        failures.append("A904:02 Ryo-frame-360 gate changed")

    bank_offset = mapinfo.find(b"e1gachap.snd\0")
    resource_offset = mapinfo.find(b"HI_GACH\0", bank_offset)
    if bank_offset != 0xACAF6 or resource_offset != 0xACB13:
        failures.append("D000 gacha resource-cluster offsets changed")

    for sound in sounds:
        if sound["commandHex"] == "a9040200":
            sound["timing"] = {
                "status": "verified-motion-frame",
                "motion": "AKI_ASOBU_GATYA",
                "motionFrame": 360,
                "frameQueryOperationCallFileOffset": "0x537fa",
                "frameThresholdLiteralFileOffset": "0x53830",
                "reason": (
                    "The owning coroutine polls AKIR through operation 0x002b, "
                    "yields while the returned frame is below 360, then calls "
                    "operation 0x006c without another yield."
                ),
            }
        else:
            sound["timing"] = {
                "status": "unresolved-child-coroutine-timing",
                "reason": (
                    "Reachability is exact, but the sound occurs inside a "
                    "launched child. Its scheduler/yield completion has not "
                    "been converted to an authored Ryo motion frame."
                ),
            }

    report = {
        "schema": "new-yokosuka-d000-gacha-audio-v1",
        "status": "verified" if not failures else "failed",
        "generatedBy": "tools/audio/extract_d000_gacha_audio.py",
        "source": {
            "mapinfo": file_evidence(
                mapinfo_path,
                mapinfo,
                ".disc-work/exact/d000/MAPINFO.BIN",
            ),
            "bank": file_evidence(
                bank_path,
                bank,
                "extracted_files/data/SCENE/01/SOUND/E1GACHAP.SND",
            ),
            "motion": file_evidence(
                motion_path,
                motion,
                "play/assets/dobuita/M_GACH.MOTN",
            ),
        },
        "resourceCluster": {
            "soundBank": {
                "name": "e1gachap.snd",
                "fileOffset": hx(bank_offset),
            },
            "highDetailResource": {
                "name": "HI_GACH",
                "fileOffset": hx(resource_offset),
            },
        },
        "authoredMotion": {
            "sequence": "AKI_ASOBU_GATYA",
            "durationFrames": 540,
            "sourceFramesPerGameTick": 1,
            "embeddedSoundCueCount": 0,
        },
        "orchestration": {
            "rootFunctionFileOffset": hx(ROOT_FUNCTION),
            "rootMotionFrameGates": root_gates,
            "relevantCoroutineLaunches": [
                compact_launch(launches_by_key[item])
                for item in EXPECTED_LAUNCHES
                if item in launches_by_key
            ],
            "directCallEdgeCount": len(edges),
            "coroutineLaunchCount": len(launches),
        },
        "sounds": sounds,
        "runtimeBoundary": {
            "verifiedCueCommands": ["a9040200"],
            "packagedButUnwiredCommands": [
                "a9040000",
                "a9040100",
                "a9040300",
                "a9040400",
                "a9040500",
            ],
            "policy": (
                "Only cues with a mechanically proven authored-motion frame "
                "may be wired. Command identity or audition alone is not "
                "sufficient."
            ),
        },
        "failures": failures,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"{report['status']}: recovered {len(sounds)} A904 gacha commands; "
        "1 has an exact authored-motion frame"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
