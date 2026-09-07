#!/usr/bin/env python3
"""Verify operation 0x00f1's tagged TELM-object resolution core."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_MAPINFO = (
    PROJECT_ROOT.parent
    / "new-yokosuka"
    / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/tagged-telm-control-operation-evidence.json"
)
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def i16(data: bytes, address: int) -> int:
    return struct.unpack("<h", runtime_slice(data, address, 2))[0]


def u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", runtime_slice(data, address, 2))[0]


def f32(data: bytes, address: int) -> float:
    return struct.unpack("<f", runtime_slice(data, address, 4))[0]


def branch_target(data: bytes, address: int) -> int:
    instruction = u16(data, address)
    if instruction & 0xF000 not in {0xA000, 0xB000}:
        raise ValueError(f"expected BRA or BSR at 0x{address:08x}")
    displacement = instruction & 0x0FFF
    if displacement & 0x0800:
        displacement -= 0x1000
    return address + 4 + displacement * 2


def movw_literal(data: bytes, address: int) -> int:
    instruction = u16(data, address)
    if instruction & 0xF000 != 0x9000:
        raise ValueError(f"expected MOV.W literal at 0x{address:08x}")
    literal_address = address + 4 + (instruction & 0xFF) * 2
    return u16(data, literal_address)


def operation_calls(event_ir: dict) -> list[dict]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x00F1
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def build_report(
    executable: bytes,
    mapinfo: bytes,
    event_ir: dict | None = None,
) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if digest(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected D000 MAPINFO.BIN")

    ranges = {
        "handler": runtime_slice(executable, 0x0C1703B8, 560),
        "tagResolver": runtime_slice(executable, 0x0C153956, 60),
        "associatedRecordLookup": runtime_slice(
            executable,
            0x0C0AAD5A,
            52,
        ),
        "mode0": runtime_slice(executable, 0x0C170444, 26),
        "mode1": runtime_slice(executable, 0x0C17045E, 22),
        "mode0Helper": runtime_slice(executable, 0x0C16FBF4, 62),
        "mode1Helper": runtime_slice(executable, 0x0C16FC32, 42),
        "bindingConsumer": runtime_slice(executable, 0x0C16BB8C, 812),
        "receiverSetup": runtime_slice(executable, 0x0C16B9E0, 420),
        "hierarchyControlLookup": runtime_slice(
            executable,
            0x0C0924A0,
            52,
        ),
        "mode4": runtime_slice(executable, 0x0C170494, 24),
        "mode10": runtime_slice(executable, 0x0C170524, 10),
        "mode11": runtime_slice(executable, 0x0C17052E, 30),
        "mode12": runtime_slice(executable, 0x0C17054C, 26),
        "controllerStateLoadAndDispatch": runtime_slice(
            executable,
            0x0C16D4B8,
            454,
        ),
        "state21Handler": runtime_slice(
            executable,
            0x0C16F8A8,
            222,
        ),
        "controllerStateWriteback": runtime_slice(
            executable,
            0x0C16FB50,
            104,
        ),
        "d000ContextSetup": mapinfo[0x2C5C0:0x2C5DC],
        "d000OperationConsumer": mapinfo[0x2CB7A:0x2CB90],
        "d000LaunchWrapper": mapinfo[0x2C684:0x2C6D8],
        "d000LiteralCaller": mapinfo[0x8DA90:0x8DAB0],
    }
    expected = {
        "handler": "80a354c95c59ff41ba47f03f0c035986c2aee13aaa0ff5ccc4f75e649ee90748",
        "tagResolver": "9f17c0e1e76d43fadc6671985324c0d702b079d170f73aa16e3fdc58d4534d09",
        "associatedRecordLookup": "14abed9a9089fed352b450240afd7cf7dd112eca734db9e98d97a45a47aa05eb",
        "mode0": "1d658ca3d865dd94de67bf8d3102ac805a095281a3ad30fd8196a052cacf7819",
        "mode1": "7a35dfa08584187a7946ebdb92b0e2dc70fd74653821df14f687f6a2fc5eec7c",
        "mode0Helper": "5090465b96c8ea5be78089e7cd823417582213d886d1807a60bd37a4c340b5ab",
        "mode1Helper": "147cf879cbd20e8aff7b06ea32ef6097466ce0574d3351a5f4104175dd6b200d",
        "bindingConsumer": "f3a960d3968e7533ddb2ef13c41d4898d71542ce2d99bceb8a04c33a20fcee93",
        "receiverSetup": "9002b331df5cc6dc0d11a23ad5017bc9c1d582005d0f9febb9b4c9451264a78c",
        "hierarchyControlLookup": "3e9c30b5de9c342c690ca8e0d9adb5f27af22426518a1d6ff7528cba5ca007c6",
        "mode4": "d3a5751c4e6a02ed30820a0f96edd8ab75f27a39fab5859a2fb2dfcc72d6dde7",
        "mode10": "b3b154ff5eaa4ffe61967d48e2689008e0099334892f970a5990c24fb85196ea",
        "mode11": "55ee15c27d225852d6b5aa3f23d5f47354c8b48bf3dae620bf2c7f464979b4c9",
        "mode12": "b6e4431cc1b5d3bcdbee13ab9a426aece2889177bb89b708c837785a92c6c70b",
        "controllerStateLoadAndDispatch": "6b42a9351ef8527432edde85810c15a131a84734059459543551b3f88ebb8e6f",
        "state21Handler": "c81c9d4cd684b9376f7dd58a1834be16ca27a2847973813b7824aa932ed1a9ee",
        "controllerStateWriteback": "d971c7442c28363e77bf15d65eef7ed11c940471cc15fda23692a0c82068291e",
        "d000ContextSetup": "40868eedc181f7f0999881308e6f902630c9ba7a6da4d66ce585a376afa54387",
        "d000OperationConsumer": "1a675748b6ff50e899db57e5db512bd18464beadafdb61d59ca76c70a63db5ce",
        "d000LaunchWrapper": "68f251ff516b26bd57afed52ef31487cb0b1a09d2529f8638f3d590f10583a65",
        "d000LiteralCaller": "18ccbf8a9b75a329cbdff4ad1b55133f0fbf9db180b9fa6d31b567cc6e96fb93",
    }
    actual = {name: digest(value) for name, value in ranges.items()}
    if actual != expected:
        raise ValueError(f"verified code ranges changed: {actual}")

    # The handler reads the second VM argument, resolves that four-character
    # tag through the scene registry, then resolves the associated TELM record
    # before dispatching its mode table.
    if u32(executable, 0x0C17040C) != 0x0C153956:
        raise ValueError("operation tag resolver changed")
    if u32(executable, 0x0C170410) != int.from_bytes(b"TELM", "little"):
        raise ValueError("associated TELM tag changed")
    if u32(executable, 0x0C170414) != 0x0C0AAD5A:
        raise ValueError("associated-record lookup changed")
    if u32(executable, 0x0C153A34) != 0x0C08CC44:
        raise ValueError("four-character registry lookup changed")

    mode_dispatch_base = 0x0C17040A
    mode_targets = [
        mode_dispatch_base + i16(executable, 0x0C170420 + index * 2)
        for index in range(18)
    ]
    expected_mode_targets = [
        0x0C170444,
        0x0C17045E,
        0x0C170474,
        0x0C17048A,
        0x0C170494,
        0x0C1704AC,
        0x0C1704CA,
        0x0C1704DE,
        0x0C1704E2,
        0x0C170516,
        0x0C170524,
        0x0C17052E,
        0x0C17054C,
        0x0C170566,
        0x0C17056E,
        0x0C1705B0,
        0x0C1705CA,
        0x0C1705DA,
    ]
    if mode_targets != expected_mode_targets:
        raise ValueError("operation mode dispatch changed")

    if branch_target(executable, 0x0C17045A) != 0x0C16FBF4:
        raise ValueError("mode 0 binding helper changed")
    if branch_target(executable, 0x0C170470) != 0x0C16FC32:
        raise ValueError("mode 1 binding helper changed")
    if (
        u32(executable, 0x0C16FC70) != 0x0C153956
        or u32(executable, 0x0C16FC74) != int.from_bytes(b"TELM", "little")
        or u32(executable, 0x0C16FC78) != 0x0C0AAD5A
        or u16(executable, 0x0C16FC68) != 0x00A8
        or u16(executable, 0x0C16FC6A) != 0x00AC
    ):
        raise ValueError("mode 0/1 binding resolution or fields changed")

    # The TELM update consumer resolves render controls 0 and 3 on the
    # telephone model. When the adjacent +0xa8/+0xac binding is populated,
    # it follows the bound actor's model hierarchy, selects signed render key
    # -66 for authored binding value 3 (-65 otherwise), and installs the
    # resulting matrix on telephone control 3. These are direct instruction
    # and literal assertions in addition to the complete-range hashes above.
    if u32(executable, 0x0C16BC80) != 0x0C0AAD5A:
        raise ValueError("TELM consumer associated-record lookup changed")
    if u32(executable, 0x0C16BC8C) != 0x0C0924A0:
        raise ValueError("TELM hierarchy control lookup changed")
    if (
        u16(executable, 0x0C16BBC4) != 0xE500
        or u16(executable, 0x0C16BBD0) != 0xE503
        or u16(executable, 0x0C16BBC8) != 0x4A0B
        or u16(executable, 0x0C16BBD2) != 0x4A0B
    ):
        raise ValueError("telephone render-control selection changed")
    if (
        movw_literal(executable, 0x0C16BBF2) != 0x00AC
        or movw_literal(executable, 0x0C16BBFA) != 0x00A8
        or u16(executable, 0x0C16BBFE) != 0x7004
        or u16(executable, 0x0C16BC02) != 0x7440
        or u16(executable, 0x0C16BC04) != 0x8803
        or u16(executable, 0x0C16BC0C) != 0xE5BE
        or u16(executable, 0x0C16BC0E) != 0xE5BF
        or u16(executable, 0x0C16BC10) != 0x4A0B
        or u16(executable, 0x0C16BC18) != 0x535E
        or u16(executable, 0x0C16BDA4) != 0x1C3E
    ):
        raise ValueError("TELM actor binding consumer changed")
    hand_correction = [
        f32(executable, 0x0C16BCA0),
        f32(executable, 0x0C16BCA4),
        0.0,
    ]
    if hand_correction != [0.02499999850988388, 0.07499999552965164, 0.0]:
        raise ValueError("telephone hand correction translation changed")
    if (
        movw_literal(executable, 0x0C16BC44) != 0x4000
        or u32(executable, 0x0C16BCA8) != 0x0C1D28E0
        or u32(executable, 0x0C16BCAC) != 0x0C1D25C0
    ):
        raise ValueError("telephone hand correction transform changed")
    mode11_field_offsets = [
        movw_literal(executable, address)
        for address in (0x0C170530, 0x0C17053C, 0x0C170546)
    ]
    mode12_first_field_offset = movw_literal(executable, 0x0C17054E)
    mode12_field_offsets = [
        mode12_first_field_offset + offset for offset in (0, 4, 8)
    ]
    if mode11_field_offsets != [0x07BC, 0x07C0, 0x07C4]:
        raise ValueError("mode 11 TELM vector fields changed")
    if mode12_field_offsets != [0x07C8, 0x07CC, 0x07D0]:
        raise ValueError("mode 12 TELM vector fields changed")

    controller_dispatch_base = 0x0C16D67E
    controller_state_targets = [
        controller_dispatch_base
        + i16(executable, 0x0C16D6A4 + index * 2)
        for index in range(22)
    ]
    if controller_state_targets[21] != 0x0C16F8A8:
        raise ValueError("TELM controller state 21 dispatch changed")

    inventory = None
    if event_ir is not None:
        calls = operation_calls(event_ir)
        proven_modes = {0, 1, 4, 10, 11, 12}
        selected = [
            call for call in calls
            if (
                call["arguments"]
                and call["arguments"][0].get("kind") == "constant"
                and call["arguments"][0].get("value") in proven_modes
            )
        ]
        if len(calls) != 341 or len(selected) != 297:
            raise ValueError("operation-0x00f1 authored inventory changed")
        mode_counts = Counter(
            call["arguments"][0]["value"] for call in selected
        )
        dialogue_mode_counts = Counter(
            call["arguments"][0]["value"]
            for call in selected
            if call["dialogueRegion"]
        )
        argument_shape_counts = Counter(
            (
                call["arguments"][0]["value"],
                tuple(argument["kind"] for argument in call["arguments"]),
            )
            for call in selected
        )
        if mode_counts != {0: 29, 1: 32, 4: 55, 10: 77, 11: 52, 12: 52}:
            raise ValueError("operation-0x00f1 mode inventory changed")
        if dialogue_mode_counts != {4: 44, 10: 55}:
            raise ValueError("operation-0x00f1 dialogue inventory changed")
        if argument_shape_counts != {
            (0, ("constant", "constant", "constant", "constant")): 18,
            (0, ("constant", "scene-field", "constant", "constant")): 11,
            (1, ("constant", "constant")): 21,
            (1, ("constant", "scene-field")): 11,
            (4, ("constant", "scene-field")): 55,
            (10, ("constant", "scene-field")): 77,
            (11, ("constant", "constant", "frame-address")): 24,
            (11, ("constant", "scene-field", "frame-address")): 22,
            (11, ("constant", "constant", "static-pointer")): 6,
            (12, ("constant", "constant", "frame-address")): 24,
            (12, ("constant", "scene-field", "frame-address")): 22,
            (12, ("constant", "constant", "static-pointer")): 6,
        }:
            raise ValueError("operation-0x00f1 argument shapes changed")
        inventory = {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "remainingUnresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "modeCounts": {
                str(mode): count
                for mode, count in sorted(mode_counts.items())
            },
            "dialogueRegionModeCounts": {
                str(mode): count
                for mode, count in sorted(dialogue_mode_counts.items())
            },
            "argumentShapeCounts": {
                f"{mode}:{','.join(kinds)}": count
                for (mode, kinds), count in sorted(argument_shape_counts.items())
            },
        }

    report = {
        "schema": "new-yokosuka-tagged-telm-control-operation-evidence-v5",
        "status": (
            "exact-target-resolution-modes-0-1-4-10-11-12-all-disc-inventory"
            "-binding-consumer-and-d000-dataflow"
        ),
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 241,
            "operationHex": "0x00f1",
            "handlerAddress": "0x0c1703b8",
            "handlerSha256": actual["handler"],
            "targetArgumentIndex": 1,
            "targetResolverAddress": "0x0c153956",
            "targetResolverSha256": actual["tagResolver"],
            "associatedRecordTag": "TELM",
            "associatedRecordLookupAddress": "0x0c0aad5a",
            "associatedRecordLookupSha256": actual[
                "associatedRecordLookup"
            ],
            "provenBehavior": (
                "The handler resolves argument 1 as a four-character scene "
                "object tag, then resolves that object's associated TELM "
                "record before dispatching the numeric control mode."
            ),
            "modeDispatch": {
                "modeCount": len(mode_targets),
                "tableAddress": "0x0c170420",
                "dispatchBaseAddress": "0x0c17040a",
                "targets": [
                    {
                        "mode": index,
                        "targetAddress": f"0x{target:08x}",
                    }
                    for index, target in enumerate(mode_targets)
                ],
            },
            "mode0": {
                "targetAddress": "0x0c170444",
                "verifiedRangeSha256": actual["mode0"],
                "helperAddress": "0x0c16fbf4",
                "helperSha256": actual["mode0Helper"],
                "controllerHandleFieldOffset": "0x0014",
                "resolvedBindingObjectArgumentIndex": 2,
                "bindingSelectorArgumentIndex": 3,
                "bindingObjectFieldOffset": "0x00a8",
                "bindingSelectorFieldOffset": "0x00ac",
                "provenBehavior": (
                    "Mode 0 resolves argument 1's TEL_ object through the "
                    "TELM controller, resolves argument 2's AKIR object "
                    "through that same controller, finds TEL_'s associated "
                    "TELM record, and stores the resolved AKIR pointer at "
                    "offset 0x00a8 and authored selector 3 at 0x00ac."
                ),
                "semanticBoundary": (
                    "The operation is an exact object-to-actor visual binding; "
                    "the separate controller vectors remain low-level fields."
                ),
            },
            "mode1": {
                "targetAddress": "0x0c17045e",
                "verifiedRangeSha256": actual["mode1"],
                "helperAddress": "0x0c16fc32",
                "helperSha256": actual["mode1Helper"],
                "controllerHandleFieldOffset": "0x0014",
                "clearedBindingValues": [0, -1],
                "provenBehavior": (
                    "Mode 1 calls the verified helper for the resolved TELM "
                    "record. The helper resolves the same indexed binding "
                    "record through the controller handle at offset 0x0014 "
                    "and clears its adjacent fields to 0 and -1."
                ),
                "semanticBoundary": (
                    "The consumer proof establishes this as the corresponding "
                    "visual binding detach."
                ),
            },
            "bindingConsumer": {
                "updateAddress": "0x0c16bb8c",
                "updateSha256": actual["bindingConsumer"],
                "receiverSetupAddress": "0x0c16b9e0",
                "receiverSetupSha256": actual["receiverSetup"],
                "hierarchyControlLookupAddress": "0x0c0924a0",
                "hierarchyControlLookupSha256": actual[
                    "hierarchyControlLookup"
                ],
                "telephoneReceiverRenderControl": 3,
                "telephoneSecondaryRenderControl": 0,
                "actorBindingFieldOffset": "0x00a8",
                "actorSelectorFieldOffset": "0x00ac",
                "selectorRoutes": {
                    "3": {
                        "actorRenderKey": -66,
                        "ryoRuntimeMatrixIndex": 30,
                        "bodySide": "left",
                    },
                    "otherNonNegative": {
                        "actorRenderKey": -65,
                        "ryoRuntimeMatrixIndex": 36,
                        "bodySide": "right",
                    },
                },
                "handCorrection": {
                    "translation": hand_correction,
                    "rotationAxis": "z",
                    "rotationFixedTurnRaw": 0x4000,
                    "rotationDegrees": 90,
                    "translationRoutineAddress": "0x0c1d28e0",
                    "rotationZRoutineAddress": "0x0c1d25c0",
                },
                "provenBehavior": (
                    "The TELM updater resolves telephone render control 3, "
                    "reads the actor pointer and selector stored by mode 0, "
                    "and follows the actor model hierarchy. Selector 3 chooses "
                    "signed render key -66 (Ryo runtime matrix 30, the left "
                    "arm endpoint); other nonnegative selectors choose -65 "
                    "(matrix 36, the right arm endpoint). It composes native "
                    "translation (0.025, 0.075, 0), then a +0x4000 fixed-turn "
                    "Z rotation, with that actor control matrix and installs "
                    "the result on telephone control 3."
                ),
                "semanticBoundary": (
                    "This proves the receiver-to-hand matrix route. It does "
                    "not assign higher-level meanings to every TELM state or "
                    "to the mode-11/mode-12 controller vectors."
                ),
            },
            "mode4": {
                "targetAddress": "0x0c170494",
                "verifiedRangeSha256": actual["mode4"],
                "primaryLinkFieldOffset": "0x0000",
                "provenBehavior": (
                    "Mode 4 returns the resolved TELM record's 32-bit "
                    "primary-link field at offset zero through the native "
                    "operation result writer."
                ),
            },
            "mode10": {
                "targetAddress": "0x0c170524",
                "verifiedRangeSha256": actual["mode10"],
                "primaryLinkFieldOffset": "0x0000",
                "primaryLinkValue": -1,
                "controllerStateFieldOffset": "0x013c",
                "controllerStateValue": 21,
                "controllerUpdateDispatchAddress": "0x0c16d666",
                "controllerStateCount": len(controller_state_targets),
                "controllerState21HandlerAddress": "0x0c16f8a8",
                "controllerState21HandlerSha256": actual[
                    "state21Handler"
                ],
                "provenBehavior": (
                    "Mode 10 clears the resolved TELM record's primary "
                    "link to -1 and writes controller state 21 at offset "
                    "0x013c. The controller update routine reads that exact "
                    "field, dispatches 22 states, sends state 21 to the "
                    "dedicated handler at 0x0c16f8a8, and writes the "
                    "resulting state back to offset 0x013c."
                ),
                "evidenceSha256": {
                    "stateLoadAndDispatch": actual[
                        "controllerStateLoadAndDispatch"
                    ],
                    "stateWriteback": actual[
                        "controllerStateWriteback"
                    ],
                },
                "semanticBoundary": (
                    "The numeric transition and controller dataflow are "
                    "exact. A higher-level name such as enable, disable, "
                    "reset, or register is not assigned until state 21's "
                    "observable role is independently proven."
                ),
            },
            "mode11": {
                "targetAddress": "0x0c17052e",
                "verifiedRangeSha256": actual["mode11"],
                "sourceArgumentIndex": 2,
                "destinationFieldOffsets": [
                    f"0x{offset:04x}" for offset in mode11_field_offsets
                ],
                "provenBehavior": (
                    "Mode 11 copies the three source words from argument 2, "
                    "without numeric conversion, into TELM fields 0x07bc, "
                    "0x07c0, and 0x07c4."
                ),
                "semanticBoundary": (
                    "The exact bit-preserving copy is proven; the vector's "
                    "coordinate space and visual role remain unnamed."
                ),
            },
            "mode12": {
                "targetAddress": "0x0c17054c",
                "verifiedRangeSha256": actual["mode12"],
                "sourceArgumentIndex": 2,
                "destinationFieldOffsets": [
                    f"0x{offset:04x}" for offset in mode12_field_offsets
                ],
                "provenBehavior": (
                    "Mode 12 copies the three source words from argument 2, "
                    "without numeric conversion, into TELM fields 0x07c8, "
                    "0x07cc, and 0x07d0."
                ),
                "semanticBoundary": (
                    "The exact bit-preserving copy is proven; the vector's "
                    "coordinate space and visual role remain unnamed."
                ),
            },
            "unresolved": [
                "The other 12 numeric mode behaviors are not yet individually named or adapted.",
                "Modes 11 and 12 have exact low-level copies but their complete controller semantics remain unresolved.",
                "Controller state 21 has exact low-level dataflow but no inferred high-level action name.",
                "This target resolution proves object identity at operation-0x00f1 consumers, not that every upstream launch tag is itself the player's clickable trigger.",
            ],
        },
        "d000Dataflow": {
            "contextSetupFunctionFileOffset": "0x2c5c0",
            "contextTargetSlot": "r9+0x02e8",
            "incomingTargetArgumentIndex": 0,
            "operationConsumerCallFileOffset": "0x2cb8a",
            "operationConsumerMode": 10,
            "launchWrapperFunctionFileOffset": "0x2c684",
            "literalCallerFileOffset": "0x8daaa",
            "literalTargetTag": "TEL0",
            "literalSelector": 9998,
            "literalPlacementFloat32": [
                38.53300094604492,
                0.9700000286102295,
                9.520999908447266,
                256.497802734375,
            ],
            "proof": (
                "The exact caller passes TEL0 to wrapper argument 0. The "
                "wrapper's setup helper stores it at r9+0x02e8, and the "
                "later operation-0x00f1 call passes that slot as native "
                "target argument 1."
            ),
            "verifiedRangeSha256": {
                "contextSetup": actual["d000ContextSetup"],
                "operationConsumer": actual["d000OperationConsumer"],
                "launchWrapper": actual["d000LaunchWrapper"],
                "literalCaller": actual["d000LiteralCaller"],
            },
        },
        "evidenceBoundary": [
            "The native handler proves operation-0x00f1 argument 1 is a tagged scene object with an associated TELM record.",
            "The D000 byte ranges prove TEL0 reaches that target argument through exact generated state and wrapper dataflow.",
            "Modes 0 and 1 exactly attach and detach TEL_ render control 3 through the resolved actor binding; modes 11 and 12 exactly copy two three-word parameter vectors.",
            "The TELM consumer proves selector 3 uses Ryo render key -66/runtime matrix 30 with the exact native hand correction, while other nonnegative selectors use -65/matrix 36.",
            "Mode 4 exactly returns the primary link; mode 10 clears it and enters controller state 21.",
            "The other 12 numeric mode behaviors, the proven vectors' complete controller interpretation, and the higher-level player interaction trigger remain unresolved rather than inferred.",
        ],
    }
    if inventory is not None:
        report["allDiscInventory"] = inventory
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
