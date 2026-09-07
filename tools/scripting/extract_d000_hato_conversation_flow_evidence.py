#!/usr/bin/env python3
"""Recover Hato's complete native conversation orchestration sequence.

The voice coroutine alone does not contain the surrounding actor/camera setup
and teardown.  This extractor follows the exact direct calls made by D000's
Hato control routine and retains every native operation in the four ordered
phases without assigning semantics to operations that have not been proven.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_call_graph import (
    direct_call_edges,
    function_starts,
)
from tools.scripting.extract_dialogue_operations import mapinfo_dispatch_calls
from tools.worlds.extract_map_transition_catalog import scn3_ranges
from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.lib.portable_paths import portable_project_path


CONTROL = 0x8002C
PHASES = [
    ("prelude", 0x7F864, 0x800CA),
    ("voice", 0x7FA98, 0x800D0),
    ("postlude", 0x7FB60, 0x800D6),
    ("cleanup", 0x7FD94, 0x80118),
]


def hx(value: int) -> str:
    return f"0x{value:x}"


def public_operation(call: dict[str, Any]) -> dict[str, Any]:
    return {
        "callFileOffset": call["callFileOffset"],
        "operationId": call["operationId"],
        "operationHex": call["operationHex"],
        "arguments": call["arguments"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        raise SystemExit("sh4-linux-gnu-objdump is required")

    data, static_base, dispatch_calls, _targets = mapinfo_dispatch_calls(
        args.mapinfo,
        args.objdump,
    )
    scn3, code_start, _initial_entry, static_check = scn3_ranges(data)
    if static_base != static_check:
        raise ValueError("SCN3 static-data boundary changed")
    starts = function_starts(data, code_start, static_base)
    instructions = [
        row
        for row in disassemble(args.mapinfo, args.objdump)
        if code_start <= row[0] < static_base
    ]
    edges = direct_call_edges(
        instructions,
        starts,
        code_start,
        static_base,
    )
    control_edges = [
        edge
        for edge in edges
        if edge["source"] == CONTROL
    ]
    for _name, target, call in PHASES:
        if not any(
            edge["target"] == target and edge["call"] == call
            for edge in control_edges
        ):
            raise ValueError(
                f"Expected control call {hx(call)} -> {hx(target)} is absent"
            )

    start_index = {start: index for index, start in enumerate(starts)}
    phases = []
    for name, start, call in PHASES:
        index = start_index.get(start)
        if index is None:
            raise ValueError(f"Expected {name} function {hx(start)} is absent")
        end = starts[index + 1] if index + 1 < len(starts) else static_base
        operations = [
            public_operation(item)
            for item in dispatch_calls
            if start <= int(item["callFileOffset"], 16) < end
        ]
        phases.append({
            "phase": name,
            "controlCallFileOffset": hx(call),
            "functionFileOffset": hx(start),
            "functionEndFileOffsetExclusive": hx(end),
            "nativeOperations": operations,
        })

    control_index = start_index[CONTROL]
    control_end = (
        starts[control_index + 1]
        if control_index + 1 < len(starts)
        else static_base
    )
    control_operations = [
        public_operation(item)
        for item in dispatch_calls
        if CONTROL <= int(item["callFileOffset"], 16) < control_end
    ]

    report = {
        "schema": "new-yokosuka-d000-hato-conversation-flow-v1",
        "status": "exact-native-four-phase-conversation-flow",
        "source": {
            "mapinfo": portable_project_path(args.mapinfo),
            "mapinfoSha256": hashlib.sha256(data).hexdigest(),
            "scn3FileOffset": hx(scn3),
        },
        "controlRoutine": {
            "functionFileOffset": hx(CONTROL),
            "functionEndFileOffsetExclusive": hx(control_end),
            "nativeOperations": control_operations,
        },
        "orderedPhases": phases,
        "conclusion": (
            "D000's Hato control routine calls an exact ordered prelude, "
            "voice, postlude, and cleanup sequence. The voice phase contains "
            "F1030B001; the surrounding phases retain the original actor and "
            "staging operation operands needed for later semantic recovery."
        ),
        "evidenceBoundary": [
            "The four functions, call sites, order, native operation IDs, and recoverable operands are exact.",
            "Operation 0x0028 is independently proven as an actor motion request and operation 0x0029 as its controller status-bit query; their exact handler evidence is recorded separately.",
            "Operation 0x002c is independently proven as native LKPT actor look-point control; its exact handler and Hato target-vector dataflow are recorded separately.",
            "Operation 0x0009 suboperation 0x10 and operation 0x0011 are independently proven as the normalized random-float source and authored event-camera request. Operation 0x000e forwards its numeric argument to the same native camera-state mode selector. Operation 0x001d is independently proven as a resolved-object three-vector operation, and exact local dataflow resolves Hato's postlude target to AKIR and source to room-VM r9 +0x00ec. Operation 0x002d modes 0 and 1 are independently proven as opposing primary-runtime state transitions, without inventing high-level names for those modes. Operation 0x0042 is independently proven as the actor-associated MOMT record's bit-zero setter, although that bit's consumer-side meaning remains unknown. Operation 0x00ac is independently proven as a direct global-byte write, while its owning subsystem remains unnamed.",
            "Exact local constant propagation resolves the recovered motion-request/status actor operands to AKIR. The LKPT affected joints/interpolation and ECAM binary/player adapter remain unresolved.",
        ],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{sum(len(item['nativeOperations']) for item in phases)} "
        "phase operations"
    )


if __name__ == "__main__":
    main()
