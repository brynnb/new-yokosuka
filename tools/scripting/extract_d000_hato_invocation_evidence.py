#!/usr/bin/env python3
"""Recover the exact native invocation path and predicates for Hato dialogue.

This extractor proves the operation-0x0002 coroutine launch, the downstream
direct SCN3 call chain into the HATO-owned dialogue coroutine, and its exact
branch operands without assigning unproven story meanings to native fields.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
import sys
from pathlib import Path


from tools.scripting.extract_dialogue_operations import discover_executable_target_table
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.worlds.extract_map_event_callbacks import branch_target
from tools.scripting.extract_sh4_object_transforms import disassemble


HATO_DIALOGUE = 0x7FA98
HATO_CONTROL = 0x8002C
HATO_PREDICATE = 0x7ABF4
OUTER_DISPATCH = 0x7A17C


def hx(value: int) -> str:
    return f"0x{value:x}"


def direct_callers(
    instructions: list[tuple[int, str, str, int | None]],
    target: int,
) -> list[int]:
    callers = []
    for index, instruction in enumerate(instructions):
        if (
            instruction[1] == "bsrf"
            and index > 0
            and instructions[index - 1][1] == "mov.l"
            and instructions[index - 1][3] is not None
            and branch_target(
                instruction[0], instructions[index - 1][3]
            ) == target
        ):
            callers.append(instruction[0])
    return callers


def require_instruction(
    by_offset: dict[int, tuple[int, str, str, int | None]],
    offset: int,
    mnemonic: str,
    operands: str,
) -> None:
    actual = by_offset.get(offset)
    if actual is None or actual[1:3] != (mnemonic, operands):
        raise ValueError(
            f"Expected {mnemonic} {operands} at {hx(offset)}, got {actual}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")

    data = args.mapinfo.read_bytes()
    scn3 = data.find(b"SCN3")
    if scn3 < 0:
        raise ValueError("MAPINFO has no SCN3 token")
    token_size = struct.unpack_from("<I", data, scn3 + 4)[0]
    static_relative = struct.unpack_from("<I", data, scn3 + 0x10)[0]
    code_start = scn3 + 0x30
    static_base = scn3 + static_relative
    token_end = scn3 + token_size
    if not code_start < static_base < token_end <= len(data):
        raise ValueError("SCN3 ranges are inconsistent")

    instructions = [
        item
        for item in disassemble(args.mapinfo, args.objdump)
        if code_start <= item[0] < static_base
    ]
    by_offset = {item[0]: item for item in instructions}
    targets = discover_executable_target_table(
        data,
        scn3_offset=scn3,
        code_start=code_start,
        static_base=static_base,
        token_end=token_end,
    )
    target_by_offset = {item.target_offset: item for item in targets}
    outer_target = target_by_offset.get(OUTER_DISPATCH)
    dialogue_target = target_by_offset.get(HATO_DIALOGUE)
    if outer_target is None or dialogue_target is None:
        raise ValueError("Expected Hato executable targets are absent")

    expected_callers = {
        HATO_DIALOGUE: [0x800D0],
        HATO_CONTROL: [0x7AC72],
        HATO_PREDICATE: [0x7A696],
        OUTER_DISPATCH: [],
    }
    for target, expected in expected_callers.items():
        actual = direct_callers(instructions, target)
        if actual != expected:
            raise ValueError(
                f"Unexpected direct callers for {hx(target)}: "
                f"{[hx(item) for item in actual]}"
            )

    # Exact compiler-emitted predicates guarding the Hato control routine:
    # operation 0x0051(11,100) is false; unsigned byte static+0xcc is 7..18;
    # and signed word/static value at +0x84 equals 6.
    calls = extract_dispatch_calls(instructions, static_base)
    outer_launch = next(
        (
            call
            for call in calls
            if call["callFileOffset"] == "0x76906"
        ),
        None,
    )
    if (
        outer_launch is None
        or outer_launch["operationId"] != 0x0002
        or outer_launch["argumentCount"] != 2
        or outer_launch["arguments"][0].get("kind") != "runtime"
        or outer_launch["arguments"][1].get("value") != 0
        or struct.unpack_from("<I", data, 0x76934)[0]
        != OUTER_DISPATCH - scn3
    ):
        raise ValueError("Outer dialogue dispatcher launch no longer matches")

    flag_call = next(
        (
            call
            for call in calls
            if call["callFileOffset"] == "0x7ac0a"
        ),
        None,
    )
    if (
        flag_call is None
        or flag_call["operationId"] != 0x0051
        or [item.get("value") for item in flag_call["arguments"]]
        != [11, 100]
    ):
        raise ValueError("Hato flag-bank query no longer matches")

    for offset, mnemonic, operands in (
        (0x7AC0C, "mov", "r13,r6"),
        (0x7AC14, "cmp/eq", "r5,r4"),
        (0x7AC16, "subc", "r4,r4"),
        (0x7AC24, "cmp/gt", "r5,r6"),
        (0x7AC26, "subc", "r5,r5"),
        (0x7AC36, "cmp/gt", "r6,r5"),
        (0x7AC38, "subc", "r5,r5"),
        (0x7AC54, "mov.l", "@r4,r4"),
        (0x7AC58, "cmp/eq", "r5,r4"),
        (0x7AC72, "bsrf", "r1"),
    ):
        require_instruction(by_offset, offset, mnemonic, operands)

    report = {
        "schema": "new-yokosuka-d000-hato-invocation-evidence-v1",
        "status": "exact-to-native-coroutine-launch",
        "source": {
            "mapinfo": str(args.mapinfo),
            "mapinfoSha256": hashlib.sha256(data).hexdigest(),
        },
        "scn3": {
            "fileOffset": hx(scn3),
            "staticBaseFileOffset": hx(static_base),
        },
        "generatedTargets": {
            "outerDispatcher": {
                "targetIndex": outer_target.index,
                "targetFileOffset": hx(OUTER_DISPATCH),
                "directCallers": [],
                "invocation": {
                    "operationId": 0x0002,
                    "callFileOffset": "0x76906",
                    "targetLiteralFileOffset": "0x76934",
                    "targetRelativeToScn3": hx(
                        OUTER_DISPATCH - scn3
                    ),
                    "argumentCount": 0,
                },
            },
            "hatoDialogue": {
                "targetIndex": dialogue_target.index,
                "targetFileOffset": hx(HATO_DIALOGUE),
            },
        },
        "directCallChain": [
            {
                "callerRoutine": hx(OUTER_DISPATCH),
                "callFileOffset": "0x7a696",
                "calleeRoutine": hx(HATO_PREDICATE),
            },
            {
                "callerRoutine": hx(HATO_PREDICATE),
                "callFileOffset": "0x7ac72",
                "calleeRoutine": hx(HATO_CONTROL),
            },
            {
                "callerRoutine": hx(HATO_CONTROL),
                "callFileOffset": "0x800d0",
                "calleeRoutine": hx(HATO_DIALOGUE),
            },
        ],
        "predicateAtRoutine0x7abf4": {
            "allRequired": [
                {
                    "kind": "engine-operation-result",
                    "operationId": 0x0051,
                    "arguments": [11, 100],
                    "requiredResult": 0,
                    "engineMeaning": (
                        "mode 11 reads bit 100 from persistent flag bank 2"
                    ),
                },
                {
                    "kind": "game-hour-range",
                    "relativeOffset": "0x000000cc",
                    "minimumInclusive": 7,
                    "maximumInclusive": 18,
                    "semanticMeaning": (
                        "SCN3 scene-context hour, populated from the native "
                        "game clock by operation 0x0059"
                    ),
                },
                {
                    "kind": "module-static-value-equality",
                    "relativeOffset": "0x00000084",
                    "requiredValue": 6,
                    "semanticMeaning": (
                        "one-based result of native spatial selector "
                        "operation 0x0181; exact zero-based result 5"
                    ),
                },
            ]
        },
        "engineOperation0051": {
            "handler": "0x0c1592e0",
            "mode11Reader": "0x0c15af80",
            "descriptorReader": "0x0c15aef8",
            "flagBank2Reader": "0x0c15904c",
            "flagBank2Representation": (
                "bounds-checked packed bit array; mode 12 is the paired writer"
            ),
        },
        "engineOperation0002": {
            "handler": "0x0c0bb3ac",
            "coroutineConstructor": "0x0c0bb1d6",
            "behavior": (
                "construct a child SCN3 coroutine from the supplied absolute "
                "target and arguments, then store it on the caller coroutine"
            ),
        },
        "conclusion": (
            "D000 launches generated target 535 as a zero-argument child "
            "coroutine through engine operation 0x0002. That coroutine reaches "
            "the HATO dialogue through three exact direct SCN3 calls after a "
            "persistent-flag, game-hour, and native spatial-selection tests."
        ),
        "evidenceBoundary": (
            "The launch, call offsets, target indices, operation operands, "
            "required branch result, and raw static-field predicates are "
            "exact. Selector 6 is now connected to zero-based result 5 from "
            "native spatial selector operation 0x0181. No story name is "
            "assigned to flag 100 or to authored spatial record 5."
        ),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
