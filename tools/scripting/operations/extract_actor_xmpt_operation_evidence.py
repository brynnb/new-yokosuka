#!/usr/bin/env python3
"""Verify native actor XMPT request and state-zero query operations."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_MAPINFO = PROJECT_ROOT / ".disc-work/mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/actor-xmpt-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def build_report(executable: bytes, mapinfo: bytes) -> dict:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    if sha256(mapinfo) != MAPINFO_SHA256:
        raise ValueError("unexpected D000 MAPINFO.BIN")
    ranges = {
        "requestHandler": (0x0C166A7C, 48),
        "queryHandler": (0x0C166ADC, 44),
        "requestCore": (0x0C0FEBC0, 432),
        "stateZeroQuery": (0x0C0FED8E, 52),
        "controllerUpdate": (0x0C0FD1FC, 2856),
        "controllerLookPointInstall": (0x0C0FDD24, 346),
        "controllerLookPointRelease": (0x0C0FDE7E, 82),
    }
    expected = {
        name: sha256(runtime_slice(executable, address, size))
        for name, (address, size) in ranges.items()
    }
    pinned = {
        "requestHandler": "d97e2febc1e7ab375177429216a189f909218ebfe6f6199d2ecb175204eb0384",
        "queryHandler": "c6353df9661e63a518fa9b6be2914f2082ed2ac88a1750b6051864c9015de221",
        "requestCore": "a1788568795b3b9e26cb339c0490d522c6509cfd60a54cb32413252d5bd52576",
        "stateZeroQuery": "85e01644213c1ee3017b3df6890aab66ed13369e0ea24700db3ee0739a9e8d5f",
        "controllerUpdate": "76a48e543b56631a4d1d32cbdbcc8702770d62c606600136c913e82a655bd946",
        "controllerLookPointInstall": "ef8fa2f349627b3b44900f4a9246012aa4884a4c2e84408c3187e18d4e547595",
        "controllerLookPointRelease": "6cb7a2a16cb424d1b921e69417873300d1c819e6d7ae22fddba783d08f25fa9f",
    }
    if expected != pinned:
        raise ValueError(f"verified actor XMPT ranges changed: {expected}")
    if u32(executable, 0x0C0FEE20) != 0x0C0FD1FC:
        raise ValueError("XMPT controller update dispatch changed")
    selector_zero_constants = {
        "nearTargetBoundary": u32(executable, 0x0C0FD334),
        "shortRouteBoundary": u32(executable, 0x0C0FD75C),
        "shortRouteOffset": u32(executable, 0x0C0FD760),
        "farRouteOffset": u32(executable, 0x0C0FD884),
        "maximumFacingStepRaw": u32(executable, 0x0C0FD984),
        "convergenceDistance": u32(executable, 0x0C0FDABC),
    }
    if selector_zero_constants != {
        "nearTargetBoundary": 0x3F333333,
        "shortRouteBoundary": 0x3D4CCCCC,
        "shortRouteOffset": 0xBDCCCCCC,
        "farRouteOffset": 0xBE4CCCCC,
        "maximumFacingStepRaw": 0x452AA000,
        "convergenceDistance": 0x3E999999,
    }:
        raise ValueError(
            f"native selector-zero constants changed: {selector_zero_constants}"
        )
    selector_table = [
        u32(executable, 0x0C29A400 + index * 4)
        for index in range(22)
    ]
    if selector_table != [
        0x1000,
        0x0800,
        0x0200,
        0x0080,
        0x0040,
        0x0020,
        0x1000,
        0x0800,
        0x8002,
        0x8003,
        0x8004,
        0x8006,
        0x8008,
        0x800A,
        0x0800,
        0x8066,
        0x8068,
        0x806C,
        0x0800,
        0x0800,
        0x8065,
        0x0800,
    ]:
        raise ValueError("native look-point selector table changed")
    cleanup = mapinfo[0x7FD94:0x7FE74]
    cleanup_hash = sha256(cleanup)
    if cleanup_hash != (
        "ecdb63ed1ddc5a4dcb87b6cf99bdd189fac98e8ad94be0a04b27e1cd4cc12fc3"
    ):
        raise ValueError(f"D000/Hato cleanup changed: {cleanup_hash}")
    return {
        "schema": "new-yokosuka-actor-xmpt-operation-evidence-v3",
        "status": (
            "exact-native-handlers-controller-state-machine-coupling-"
            "and-hato-dataflow"
        ),
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "Disc 1 D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
        },
        "requestOperation": {
            "operationId": 357,
            "operationHex": "0x0165",
            "handlerAddress": "0x0c166a7c",
            "handlerSha256": expected["requestHandler"],
            "requestCoreAddress": "0x0c0febc0",
            "requestCoreSha256": expected["requestCore"],
            "actorResolverAddress": "0x0c153956",
            "recordTag": "XMPT",
            "arguments": [
                {"index": 0, "meaning": "actor reference"},
                {
                    "index": 1,
                    "meaning": "optional pointer to an exact three-float vector",
                },
                {
                    "index": 2,
                    "meaning": "word copied unchanged to XMPT +0x88",
                },
                {
                    "index": 3,
                    "meaning": "dword copied unchanged to XMPT +0x20",
                },
                {
                    "index": 4,
                    "meaning": (
                        "optional pointer to 24 supplemental bytes copied "
                        "to XMPT +0x24 through +0x3b"
                    ),
                },
            ],
            "fixedRequestCoreArguments": {
                "selector": 0,
                "selectorSource": "handler-pushed literal zero",
            },
            "provenBehavior": (
                "Resolves the actor, installs or reuses its literal XMPT "
                "record, copies the supplied vector or the actor controller's "
                "native vector into XMPT +0x00/+0x04/+0x08, stores the exact "
                "word and dword request fields at +0x88 and +0x20, optionally "
                "copies 24 supplemental bytes to +0x24 through +0x3b, and "
                "dispatches fixed selector zero to the actor controller."
            ),
        },
        "stateZeroQueryOperation": {
            "operationId": 366,
            "operationHex": "0x016e",
            "handlerAddress": "0x0c166adc",
            "handlerSha256": expected["queryHandler"],
            "queryAddress": "0x0c0fed8e",
            "querySha256": expected["stateZeroQuery"],
            "provenReturnValue": (
                "one exactly when the actor has an XMPT record, XMPT +0x18 "
                "is nonzero, and XMPT +0x1c equals zero; otherwise zero"
            ),
        },
        "controllerUpdate": {
            "address": "0x0c0fd1fc",
            "sha256": expected["controllerUpdate"],
            "dispatchPointerAddress": "0x0c0fee20",
            "dispatchTarget": "0x0c0fd1fc",
            "stateFieldOffset": "0x18",
            "selectorFieldOffset": "0x1c",
            "initialStateBySelector": {
                "0": 3,
                "1": 1,
                "2": 6,
                "3": 1,
                "4": 1,
                "5": 3,
                "6": 6,
            },
            "lookPointCoupling": {
                "installHelperAddress": "0x0c0fdd24",
                "installHelperSha256": expected[
                    "controllerLookPointInstall"
                ],
                "releaseHelperAddress": "0x0c0fde7e",
                "releaseHelperSha256": expected[
                    "controllerLookPointRelease"
                ],
                "recordTag": "LKPT",
                "installSelector": 15,
                "installSelectorMappedWord": "0x8066",
                "releaseSelectorSigned": -15,
                "releaseSelectorMappedWord": "0x8066",
                "mode": 0,
                "admittedXmptSelectors": [1, 3, 4, 6],
            },
            "selectorZeroLifecycle": {
                "initialState": 3,
                "approachState": 3,
                "approachWaitState": 4,
                "facingConvergenceState": 5,
                "finalAlignmentState": 7,
                "finalAlignmentWaitState": 8,
                "cleanupState": 11,
                "terminalState": 0,
                "motionRequestSource": (
                    "low 16 bits of XMPT +0x20 request dword"
                ),
                "controllerRequestWordOffset": "actor +0x66",
                "nearTargetBoundary": 0.7,
                "shortRouteBoundary": 0.05,
                "shortRouteOffset": -0.1,
                "farRouteOffset": -0.2,
                "maximumFacingStepRaw": 2730,
                "convergenceDistance": 0.3,
                "provenSelectorZeroBehavior": (
                    "State three prepares the approach endpoint, writes it "
                    "through the actor transform setter, and starts the "
                    "approach motion. The far path used by Hato and D000 "
                    "selector 61 constructs an endpoint 0.2 native units "
                    "before the supplied target. State four waits for actor "
                    "+0x66 to clear and reads the actor transform back into "
                    "the XMPT record. State five performs bounded facing and exact "
                    "0.3-unit convergence work. State seven starts the final "
                    "motion against the original target and the request word "
                    "at XMPT +0x88; state eight again waits for actor +0x66 "
                    "to clear. State eleven then falls through native cleanup "
                    "to terminal state zero."
                ),
            },
            "provenBehavior": (
                "The request dispatches the literal XMPT record to the "
                "native update state machine. On its first update, selector "
                "zero enters state three; selectors one, three, and four "
                "enter state one; selectors two and six enter state six; "
                "selector five enters state three. The same controller owns "
                "an exact LKPT coupling path that installs selector 15 and "
                "releases selector -15 through the native look-point "
                "controller. Selector zero preserves the distinct approach, "
                "convergence, final-alignment, cleanup, and terminal phases "
                "listed above."
            ),
        },
        "hatoConversation": {
            "phase": "cleanup",
            "requestCallFileOffset": "0x7fdfc",
            "queryCallFileOffset": "0x7fe0c",
            "actorCode": "AKIR",
            "targetVector": [
                -121.16000366210938,
                -1.7999999523162842,
                77.94000244140625,
            ],
            "requestWord": 42143,
            "requestDword": "0x8000055e",
            "requestSelector": 0,
            "supplementalRecordPointer": 0,
            "firstControllerState": 3,
            "waitsWhileQueryReturnsOne": True,
            "exitsWhenQueryReturnsZero": True,
        },
        "evidenceBoundary": [
            (
                "XMPT is retained as the literal native record tag; a "
                "higher-level movement or path label is not inferred."
            ),
            (
                "The exact target vector, request fields, fixed selector, "
                "and status-loop polarity in Hato's cleanup are static data: "
                "the coroutine waits while operation 0x016e returns one and "
                "exits when it returns zero."
            ),
            (
                "The browser must not substitute proximity completion for "
                "the exact XMPT state-zero query."
            ),
            (
                "XMPT completion belongs to the recovered native controller "
                "state machine. Its state transitions, motion requests, "
                "orientation work, and exact LKPT coupling must not be "
                "collapsed into a timer, teleport, or distance threshold."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
