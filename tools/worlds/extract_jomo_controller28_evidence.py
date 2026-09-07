#!/usr/bin/env python3
"""Recover JOMO's selected-record controller-28 setup from retail bytes.

The selected shared-object routine configures engine controller 28 through
operations 0x006a and 0x0066.  Earlier notes incorrectly described one of its
static pointers as an interaction-motion string.  Both static pointers are
four-float controller parameter tables; the operation-0x0066 selector-2
handler visibly copies four floats from the supplied pointer into controller
fields.

This extractor pins the JOMO calls, parameter tables, operation handlers, and
controller initializer to source-hashed retail data.  It deliberately leaves
the selected Ryo motion unresolved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path
from typing import Any

from tools.worlds.extract_jomo_object_operations import (
    disassemble,
    extract_dispatch_calls,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
JOMO_SHA256 = (
    "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
)

SELECTED_SETUP_RANGE = (0x83780, 0x83840)
VECTOR_TABLE_RANGE = (0x9C670, 0x9C690)
OPERATION_0066_HANDLER = 0x0C1644DC
OPERATION_006A_HANDLER = 0x0C1645F6
CONTROLLER_INITIALIZER = 0x0C0EC3B0
CONTROLLER_VECTOR_SETTER = 0x0C0EB1D0

EXPECTED_CALLS = (
    (0x83798, 0x006A, (28, None, None)),
    (0x837B4, 0x0066, (28, 2, 0x9C670)),
    (0x837CC, 0x0066, (28, 4, 0x3F59999A)),
    (0x837E4, 0x0066, (28, 5, 0x40E00000)),
    (0x83800, 0x0066, (28, 6, 0x9C680)),
    (0x83818, 0x0066, (28, 10, 7500)),
)

WINDOWS = {
    "jomoSelectedRecordControllerSetup": (
        "mapinfo",
        0x83780,
        0x83840,
        "8d89a47d783ef72e6d49fca3d834788e5c1eb9e514583879c0c103d2a6eaacf4",
    ),
    "jomoControllerParameterTables": (
        "mapinfo",
        0x9C670,
        0x9C690,
        "32d181685389c249d2c5bb5522fbcb259235e8457b1e13199d9bf66154d751a3",
    ),
    "operation0066": (
        "executable",
        0x0C1644DC,
        0x0C1645AA,
        "42141c546b1359e4430c5712b6a4c934865b50f49b0aca5341f6ce3923aef87b",
    ),
    "operation006a": (
        "executable",
        0x0C1645F6,
        0x0C164606,
        "2c4a96c2ee28651f94c234d1de77adc0a209192f24b733c40e539efef8e3d7aa",
    ),
    "controllerInitializer": (
        "executable",
        0x0C0EC3B0,
        0x0C0EC3E4,
        "f137f40bf2693e37698829e06d07137dcb1350f2173d5b48a68cf1127a11d97d",
    ),
    "controllerVectorSetter": (
        "executable",
        0x0C0EB1D0,
        0x0C0EB292,
        "518835ed7d71c8abc7a40938f0edfdf284a811c63c7889f8c7270c13360fec8c",
    ),
}

SELECTOR_TARGETS = (
    0x0C0EB0DC,
    0x0C0EB1C8,
    0x0C0EB1D0,
    0x0C0EB390,
    0x0C0EB398,
    0x0C0EB4A8,
    0x0C0EB5A6,
    0x0C0EB63A,
    0x0C0EB714,
    0x0C0EB832,
    0x0C0EB848,
    0x0C0EB048,
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:08x}"


def executable_slice(data: bytes, start: int, end: int) -> bytes:
    return data[start - RUNTIME_BASE:end - RUNTIME_BASE]


def u32_runtime(data: bytes, address: int) -> int:
    return struct.unpack(
        "<I",
        executable_slice(data, address, address + 4),
    )[0]


def validate_windows(
    executable: bytes,
    mapinfo: bytes,
) -> list[dict[str, str]]:
    result = []
    for name, (source, start, end, expected) in WINDOWS.items():
        sample = (
            executable_slice(executable, start, end)
            if source == "executable"
            else mapinfo[start:end]
        )
        actual = digest(sample)
        if actual != expected:
            raise ValueError(f"{name} SHA-256 changed: {actual}")
        result.append({
            "name": name,
            "source": source,
            "start": hx(start),
            "endExclusive": hx(end),
            "sha256": actual,
        })
    return result


def extract_selected_calls(
    mapinfo_path: Path,
    mapinfo: bytes,
    objdump: str,
) -> list[dict[str, Any]]:
    scn3_offset = mapinfo.find(b"SCN3")
    static_data_base = scn3_offset + struct.unpack_from(
        "<I",
        mapinfo,
        scn3_offset + 0x10,
    )[0]
    if static_data_base != 0x8FDA4:
        raise ValueError("JOMO static-data base changed")
    instructions = [
        instruction
        for instruction in disassemble(mapinfo_path, objdump)
        if SELECTED_SETUP_RANGE[0] <= instruction[0] < SELECTED_SETUP_RANGE[1]
    ]
    calls = extract_dispatch_calls(instructions, static_data_base)
    by_offset = {
        int(call["callFileOffset"], 16): call
        for call in calls
        if call["operationId"] in {0x0066, 0x006A}
    }
    if set(by_offset) != {entry[0] for entry in EXPECTED_CALLS}:
        raise ValueError("selected-record controller call set changed")

    result = []
    for offset, operation, expected_values in EXPECTED_CALLS:
        call = by_offset[offset]
        values = tuple(argument.get("value") for argument in call["arguments"])
        if call["operationId"] != operation or values != expected_values:
            raise ValueError(f"controller call changed at 0x{offset:x}")
        encoded = {
            "callFileOffset": f"0x{offset:x}",
            "operationId": f"0x{operation:04x}",
            "controllerId": 28,
        }
        if operation == 0x006A:
            encoded["inputs"] = [
                {
                    "argumentIndex": 1,
                    "kind": "runtime-address",
                    "selectedSetupFrameOffset": 32,
                },
                {
                    "argumentIndex": 2,
                    "kind": "runtime-address",
                    "selectedSetupFrameOffset": 20,
                },
            ]
        else:
            selector = values[1]
            value = values[2]
            encoded["selector"] = selector
            encoded["valueWord"] = hx(value)
            if selector in {2, 6}:
                encoded["valueKind"] = "pointer-to-four-float-table"
                encoded["tableFileOffset"] = hx(value)
            elif selector in {4, 5}:
                encoded["valueKind"] = "float-bits"
                encoded["floatValue"] = struct.unpack(
                    "<f",
                    struct.pack("<I", value),
                )[0]
            else:
                encoded["valueKind"] = "integer"
                encoded["integerValue"] = value
        result.append(encoded)
    return result


def validate_handlers(executable: bytes) -> dict[str, Any]:
    selector_literals = tuple(
        u32_runtime(executable, 0x0C1647D4 + index * 4)
        for index in range(12)
    )
    if selector_literals != SELECTOR_TARGETS:
        raise ValueError("operation 0x0066 selector targets changed")
    if u32_runtime(executable, 0x0C164818) != CONTROLLER_INITIALIZER:
        raise ValueError("operation 0x006a target changed")
    if u32_runtime(executable, 0x0C0EC444) != SELECTOR_TARGETS[0]:
        raise ValueError("controller initializer field-0 target changed")
    if u32_runtime(executable, 0x0C0EC448) != 0x0C0EAF8E:
        raise ValueError("controller activation target changed")

    return {
        "operation0066": {
            "handlerAddress": hx(OPERATION_0066_HANDLER),
            "descriptorLayout": [
                "word 0: controller ID",
                "word 1: selector",
                "word 2: value or value pointer",
            ],
            "selectorTargets": [
                {
                    "selector": selector,
                    "targetAddress": hx(target),
                }
                for selector, target in enumerate(SELECTOR_TARGETS)
            ],
            "selector2Semantics": {
                "targetAddress": hx(CONTROLLER_VECTOR_SETTER),
                "source": "four consecutive float words at supplied pointer",
                "primaryControllerDestinationOffsets": [
                    "0x08",
                    "0x0c",
                    "0x10",
                    "0x14",
                ],
                "secondaryController": "same four values are mirrored",
            },
        },
        "operation006a": {
            "handlerAddress": hx(OPERATION_006A_HANDLER),
            "forwardTargetAddress": hx(CONTROLLER_INITIALIZER),
            "forwardedArguments": [
                "descriptor word 0 as r4",
                "descriptor word 1 as r5",
                "descriptor word 2 as r6",
            ],
        },
        "controllerInitializer": {
            "address": hx(CONTROLLER_INITIALIZER),
            "steps": [
                {
                    "action": "initialize-controller",
                    "targetAddress": "0x0c0eb988",
                },
                {
                    "action": "set-selector-0",
                    "value": 4,
                    "targetAddress": hx(SELECTOR_TARGETS[0]),
                },
                {
                    "action": "set-selector-7",
                    "source": "operation argument 1",
                    "targetAddress": hx(SELECTOR_TARGETS[7]),
                },
                {
                    "action": "set-selector-8",
                    "source": "operation argument 2",
                    "targetAddress": hx(SELECTOR_TARGETS[8]),
                },
                {
                    "action": "activate-controller",
                    "value": 1,
                    "targetAddress": "0x0c0eaf8e",
                },
            ],
        },
    }


def parameter_tables(mapinfo: bytes) -> list[dict[str, Any]]:
    result = []
    for offset, selector in ((0x9C670, 2), (0x9C680, 6)):
        words = struct.unpack_from("<4I", mapinfo, offset)
        result.append({
            "fileOffset": hx(offset),
            "usedBySelector": selector,
            "words": [hx(word) for word in words],
            "floats": [
                struct.unpack("<f", struct.pack("<I", word))[0]
                for word in words
            ],
            "classification": "four-float-controller-parameter-table",
        })
    return result


def build_report(
    executable: bytes,
    mapinfo_path: Path,
    mapinfo: bytes,
    objdump: str,
) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN SHA-256")
    if digest(mapinfo) != JOMO_SHA256:
        raise ValueError("unexpected JOMO MAPINFO.BIN SHA-256")
    windows = validate_windows(executable, mapinfo)
    calls = extract_selected_calls(mapinfo_path, mapinfo, objdump)
    handlers = validate_handlers(executable)
    tables = parameter_tables(mapinfo)
    return {
        "schema": "new-yokosuka-jomo-controller28-evidence-v1",
        "status": "exact-native-controller-configuration-boundary",
        "generatedBy": "tools/worlds/extract_jomo_controller28_evidence.py",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": hx(RUNTIME_BASE),
            "executableSha256": EXECUTABLE_SHA256,
            "jomoMapinfo": "SCENE/01/JOMO/MAPINFO.BIN",
            "jomoMapinfoSha256": JOMO_SHA256,
            "verifiedWindows": windows,
        },
        "selectedRecordSetup": {
            "fileRange": [
                hx(SELECTED_SETUP_RANGE[0]),
                hx(SELECTED_SETUP_RANGE[1]),
            ],
            "controllerId": 28,
            "calls": calls,
            "parameterTables": tables,
        },
        "engine": handlers,
        "motionBoundary": {
            "correction": (
                "Neither 0x0009c670 nor 0x0009c680 is a string pointer. "
                "Both point to four-float controller parameter tables."
            ),
            "proven": (
                "The selected JOMO record configures and activates controller "
                "28 with runtime addresses, two four-float tables, scalar "
                "parameters, and integer 7500."
            ),
            "unresolved": (
                "These calls do not identify Ryo's selected interaction "
                "motion or establish a motion-owned audio cue."
            ),
            "policy": "do-not-infer-motion-or-audio-from-debug-strings",
        },
    }


def default_executable() -> Path:
    candidates = [
        PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN",
        PROJECT_ROOT.parent / "new-yokosuka/.disc-work/exact/1ST_READ.BIN",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def default_mapinfo() -> Path:
    candidates = [
        PROJECT_ROOT / ".disc-work/exact/jomo/MAPINFO.BIN",
        PROJECT_ROOT.parent
        / "new-yokosuka/.disc-work/exact/jomo/MAPINFO.BIN",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=default_executable())
    parser.add_argument("--mapinfo", type=Path, default=default_mapinfo())
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROJECT_ROOT
        / "tools/evidence/jomo-controller28-evidence.json",
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo,
        args.mapinfo.read_bytes(),
        args.objdump,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {len(report['selectedRecordSetup']['calls'])} "
        "controller-28 calls; motion identity remains unresolved"
    )


if __name__ == "__main__":
    main()
