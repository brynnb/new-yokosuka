#!/usr/bin/env python3
"""Prove JOMO's native telephone cadence and location-scoped cue route.

This extractor deliberately retains low-level timing and state names.  It
does not assign every TELM-controller sound to a phone merely because one
phone route uses the shared controller.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_call_graph import direct_call_edges, function_starts
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MAPINFO = (
    PROJECT_ROOT.parent
    / "new-yokosuka"
    / "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN"
)
DEFAULT_SYSTEM1 = (
    PROJECT_ROOT.parent
    / "new-yokosuka"
    / "extracted_files/data/SOUND/SYSTEM1.SND"
)
DEFAULT_LOCATION_BANK = (
    PROJECT_ROOT.parent
    / "new-yokosuka"
    / "extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND"
)
DEFAULT_DISPATCH_EVIDENCE = (
    PROJECT_ROOT / "tools/evidence/jomo-shared-object-dispatch.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/jomo-telephone-audio.json"
)

MAPINFO_SHA256 = (
    "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
)
SYSTEM1_SHA256 = (
    "d25eb40cdfc129a09f380922752891bd47e6e1714a0ddb4556fea6875dad2f59"
)
LOCATION_BANK_SHA256 = (
    "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb"
)

RING_ROUTINE = 0x1D524
RING_ROUTINE_END = 0x1D77A
CONTROL_ROUTINE = 0x1E104
CONTROL_ROUTINE_END = 0x1FF4C
LITERAL_PHONE_EVENT = 0x6DFE4
LITERAL_PHONE_EVENT_END = 0x6E62C
EXPECTED_RANGE_HASHES = {
    "cadenceRoutine": (
        "3b92341a0985b691aa8cc6e8d7ad3b850ab7f7ad86ad89f0f1ec73e376f374fe"
    ),
    "controlRoutine": (
        "9b03b53c98bdd44cc355e25a8b89ec58d9192e38215a009eb6e0838a3bb18d4b"
    ),
    "literalPhoneEvent": (
        "f5665268e2263bea9402feed61c5d52f5d0b38e611436e75b3b31d53ec763191"
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:x}"


def public_operation(call: dict[str, Any]) -> dict[str, Any]:
    return {
        "callFileOffset": call["callFileOffset"],
        "operationId": call["operationId"],
        "operationHex": call["operationHex"],
        "arguments": call["arguments"],
    }


def operation_at(
    calls: list[dict[str, Any]],
    offset: int,
    operation_id: int,
) -> dict[str, Any]:
    matches = [
        call
        for call in calls
        if int(call["callFileOffset"], 16) == offset
        and call["operationId"] == operation_id
    ]
    if len(matches) != 1:
        raise ValueError(
            f"expected operation {hx(operation_id)} at {hx(offset)}, "
            f"found {len(matches)}"
        )
    return matches[0]


def constant_hex(call: dict[str, Any], argument: int) -> str:
    value = call["arguments"][argument]
    if value["kind"] != "constant":
        raise ValueError(
            f"{call['callFileOffset']} argument {argument} is not constant"
        )
    return value["hex"]


def build_report(
    mapinfo_path: Path,
    system1_path: Path,
    location_bank_path: Path,
    dispatch_evidence_path: Path,
    objdump: str,
) -> dict[str, Any]:
    mapinfo = mapinfo_path.read_bytes()
    system1 = system1_path.read_bytes()
    location_bank = location_bank_path.read_bytes()
    if digest(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected Disc 1 JOMO MAPINFO.BIN")
    if digest(system1) != SYSTEM1_SHA256:
        raise ValueError("unexpected SYSTEM1.SND")
    if digest(location_bank) != LOCATION_BANK_SHA256:
        raise ValueError("unexpected F1OMOYAA.SND")

    data, static_base, calls, _targets = mapinfo_dispatch_calls(
        mapinfo_path,
        objdump,
    )
    _scn3, code_start, _entry, static_check = scn3_ranges(data)
    if static_base != static_check:
        raise ValueError("SCN3 static boundary changed")
    starts = function_starts(data, code_start, static_base)
    for start, end in [
        (RING_ROUTINE, RING_ROUTINE_END),
        (CONTROL_ROUTINE, CONTROL_ROUTINE_END),
        (LITERAL_PHONE_EVENT, LITERAL_PHONE_EVENT_END),
    ]:
        index = starts.index(start)
        if starts[index + 1] != end:
            raise ValueError(
                f"function boundary changed at {hx(start)}: "
                f"{hx(starts[index + 1])}"
            )

    ranges = {
        "cadenceRoutine": data[RING_ROUTINE:RING_ROUTINE_END],
        "controlRoutine": data[CONTROL_ROUTINE:CONTROL_ROUTINE_END],
        "literalPhoneEvent": data[
            LITERAL_PHONE_EVENT:LITERAL_PHONE_EVENT_END
        ],
    }
    actual_range_hashes = {
        name: digest(value) for name, value in ranges.items()
    }
    if actual_range_hashes != EXPECTED_RANGE_HASHES:
        raise ValueError(
            f"verified JOMO function ranges changed: {actual_range_hashes}"
        )

    instructions = [
        row
        for row in disassemble(mapinfo_path, objdump)
        if code_start <= row[0] < static_base
    ]
    edges = direct_call_edges(
        instructions,
        starts,
        code_start,
        static_base,
    )
    cadence_callers = [
        edge for edge in edges if edge["target"] == RING_ROUTINE
    ]
    expected_edges = [
        {
            "source": CONTROL_ROUTINE,
            "target": RING_ROUTINE,
            "call": 0x1F0CC,
        },
        {
            "source": CONTROL_ROUTINE,
            "target": RING_ROUTINE,
            "call": 0x1F446,
        },
    ]
    if cadence_callers != expected_edges:
        raise ValueError(f"cadence-routine callers changed: {cadence_callers}")

    start_call = operation_at(calls, 0x1D552, 0x006C)
    first_wait = operation_at(calls, 0x1D56C, 0x0031)
    stop_call = operation_at(calls, 0x1D61E, 0x006C)
    second_wait = operation_at(calls, 0x1D664, 0x0031)
    if constant_hex(start_call, 0) != "0x000405ab":
        raise ValueError("cadence start command changed")
    if constant_hex(stop_call, 0) != "0x000505ab":
        raise ValueError("cadence stop command changed")
    for wait in (first_wait, second_wait):
        if constant_hex(wait, 0) != "0x00000001":
            raise ValueError("scheduler wait argument changed")

    literal_stop = operation_at(calls, 0x6E0B2, 0x006C)
    location_cue = operation_at(calls, 0x6E0CA, 0x006C)
    mode11 = operation_at(calls, 0x6E1B0, 0x00F1)
    mode12 = operation_at(calls, 0x6E1CA, 0x00F1)
    mode0 = operation_at(calls, 0x6E1E6, 0x00F1)
    if constant_hex(literal_stop, 0) != "0x000505ab":
        raise ValueError("literal phone-event stop command changed")
    if constant_hex(location_cue, 0) != "0x000106ab":
        raise ValueError("literal phone-event location cue changed")
    for call, mode in [(mode11, 11), (mode12, 12), (mode0, 0)]:
        if constant_hex(call, 0) != f"0x{mode:08x}":
            raise ValueError(f"TEL_ mode {mode} changed")
        if constant_hex(call, 1) != "0x5f4c4554":
            raise ValueError(f"TEL_ target for mode {mode} changed")

    dispatch_evidence_bytes = dispatch_evidence_path.read_bytes()
    dispatch_evidence = json.loads(dispatch_evidence_bytes)
    group = next(
        (
            item
            for item in dispatch_evidence["groups"]
            if item["index"] == 12
        ),
        None,
    )
    if group is None or group["objectTags"] != ["DDFP"]:
        raise ValueError("JOMO group 12 DDFP route changed")
    callback = next(
        (
            item
            for item in group["callbackTokens"]
            if item.get("selector") == 63
        ),
        None,
    )
    if callback is None or callback["functionFileOffset"] != "0x1e104":
        raise ValueError("DDFP selector 63 callback changed")

    return {
        "schema": "new-yokosuka-jomo-telephone-audio-v1",
        "status": "exact-native-cadence-and-literal-phone-event",
        "source": {
            "mapinfo": "Disc 1 SCENE/01/JOMO/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
            "sharedBank": "SOUND/SYSTEM1.SND",
            "sharedBankSha256": SYSTEM1_SHA256,
            "locationBank": "SCENE/01/SOUND/F1OMOYAA.SND",
            "locationBankSha256": LOCATION_BANK_SHA256,
            "objectDispatchEvidence": str(
                dispatch_evidence_path.relative_to(PROJECT_ROOT)
            ),
            "objectDispatchEvidenceSha256": digest(
                dispatch_evidence_bytes
            ),
        },
        "cadenceRoutine": {
            "functionFileOffset": hx(RING_ROUTINE),
            "functionEndFileOffsetExclusive": hx(RING_ROUTINE_END),
            "verifiedRangeSha256": actual_range_hashes["cadenceRoutine"],
            "directCallers": [
                {
                    "sourceFunctionFileOffset": hx(edge["source"]),
                    "callFileOffset": hx(edge["call"]),
                }
                for edge in cadence_callers
            ],
            "start": {
                "nativeOperation": public_operation(start_call),
                "commandHex": "ab050400",
                "bankScope": "shared-system1",
            },
            "audibilityWait": {
                "nativeOperation": public_operation(first_wait),
                "completionValue": "0x00000200",
                "counterInitialValue": 0,
                "counterIncrement": 1,
                "schedulerYieldWhileCounterAtMost": 45,
                "schedulerYieldsPerPass": 1,
            },
            "stop": {
                "nativeOperation": public_operation(stop_call),
                "commandHex": "ab050500",
                "bankScope": "shared-system1",
                "controlOnly": True,
            },
            "silenceWait": {
                "nativeOperation": public_operation(second_wait),
                "completionValue": "0x00000200",
                "counterInitialValue": 0,
                "counterIncrement": 1,
                "schedulerYieldWhileCounterAtMost": 45,
                "schedulerYieldsPerPass": 1,
            },
            "repeatControl": {
                "repeatCounterInitialValue": 0,
                "repeatCounterIncrement": 1,
                "repeatLimitSource": "incoming routine argument 0",
                "constantRepeatInvocation": {
                    "callFileOffset": "0x1f446",
                    "repeatLimit": 6,
                },
                "runtimeRepeatInvocation": {
                    "callFileOffset": "0x1f0cc",
                    "repeatLimitSource": "control-routine local byte 27",
                },
            },
            "provenBehavior": (
                "The routine starts AB05:4, waits for operation 0x0031 to "
                "report 0x0200, increments from 0 and yields while the "
                "counter is at most 45 for the authored on "
                "interval, issues the zero-volume AB05:5 mate, yields through "
                "the corresponding off interval, and repeats until its "
                "incoming repeat limit is reached. One native caller passes "
                "literal 6."
            ),
        },
        "owningControlRoute": {
            "functionFileOffset": hx(CONTROL_ROUTINE),
            "functionEndFileOffsetExclusive": hx(CONTROL_ROUTINE_END),
            "verifiedRangeSha256": actual_range_hashes["controlRoutine"],
            "staticInteractionGroup": 12,
            "staticInteractionTag": "DDFP",
            "callbackSelector": 63,
            "callbackFunctionFileOffset": hx(CONTROL_ROUTINE),
            "voiceResourcePrefix": "E1032",
            "semanticBoundary": (
                "The DDFP callback owns both cadence invocations and an "
                "E1032 dialogue route. DDFP is not relabeled as the telephone "
                "object, and the cadence is not generalized to every TELM "
                "interaction."
            ),
        },
        "literalPhoneEvent": {
            "functionFileOffset": hx(LITERAL_PHONE_EVENT),
            "functionEndFileOffsetExclusive": hx(
                LITERAL_PHONE_EVENT_END
            ),
            "verifiedRangeSha256": actual_range_hashes["literalPhoneEvent"],
            "guard": {
                "operationFileOffset": "0x6e06e",
                "localStateRequired": 30,
            },
            "orderedOperations": [
                public_operation(literal_stop),
                public_operation(location_cue),
                public_operation(mode11),
                public_operation(mode12),
                public_operation(mode0),
            ],
            "sharedStopCommandHex": "ab050500",
            "locationCue": {
                "commandHex": "ab060100",
                "bankScope": "map-named-location",
                "bank": "F1OMOYAA.SND",
            },
            "targetTag": "TEL_",
            "linkedActorTag": "AKIR",
            "provenBehavior": (
                "Under local state 30 this independent generated function "
                "stops AB05:4 through its AB05:5 mate, dispatches JOMO-local "
                "AB06:1, then supplies two authored vectors and an AKIR link "
                "to literal object TEL_."
            ),
        },
        "runtimePolicy": {
            "sharedAudibleAsset": (
                "public/audio/world/system1/ab050400.webm"
            ),
            "sharedStopHasNoAsset": True,
            "implemented": False,
            "reason": (
                "The authentic cadence and the literal telephone event are "
                "proven, but the browser does not yet implement the owning "
                "E1032 incoming-call state. Playing this on ordinary TEL0 or "
                "TEL_ inspection would invent a trigger absent from the "
                "native route."
            ),
        },
        "evidenceBoundary": [
            "AB05:4 and AB05:5 are an exact native start/stop pair in a timed repeating coroutine.",
            "A separate literal TEL_ route stops that pair and immediately dispatches JOMO-local AB06:1 before configuring TEL_ and AKIR.",
            "The exact low-level route supports a telephone cadence classification, but does not assign the other AB05 or AB06 controller tracks to telephone phases.",
            "No browser playback hook is added until the E1032 incoming-call trigger/state is implemented.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--system1", type=Path, default=DEFAULT_SYSTEM1)
    parser.add_argument(
        "--location-bank",
        type=Path,
        default=DEFAULT_LOCATION_BANK,
    )
    parser.add_argument(
        "--dispatch-evidence",
        type=Path,
        default=DEFAULT_DISPATCH_EVIDENCE,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(
        args.mapinfo,
        args.system1,
        args.location_bank,
        args.dispatch_evidence,
        args.objdump,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
