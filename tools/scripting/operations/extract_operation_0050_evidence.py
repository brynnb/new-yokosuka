#!/usr/bin/env python3
"""Verify operation 0x0050 and D000's exact DRAUTH activity bindings."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = PROJECT_ROOT / ".disc-work"
DEFAULT_EXECUTABLE = SOURCE_ROOT / "exact/1ST_READ.BIN"
DEFAULT_MAPINFO = SOURCE_ROOT / "mapinfo/disc1/SCENE/01/D000/MAPINFO.BIN"
DEFAULT_ARCHIVE = SOURCE_ROOT / "exact/d000/archives/DRAUTH.PKS"
DEFAULT_PROGRAM_PACK = PROJECT_ROOT / "play/data/events/nativeEventPrograms.generated.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools/evidence/operation-0050-evidence.json"
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
MAPINFO_SHA256 = (
    "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e"
)
ARCHIVE_SHA256 = (
    "90ba0829312f0fc3c38a99b501c5362950ff2b6915226a5260cc2ceffd7e3537"
)
EXECUTABLE_RANGES = {
    "handler": (
        0x0C155194,
        376,
        "596ceaba2cef2a6e5267b8d36271e18b6ae1028ec3bcb9bb7591ddbf1fd37426",
    ),
    "activityStart": (
        0x0C155054,
        114,
        "afbb8f7000f45f3e0f609b16e61b4f5a6bf2e7b563b8ad4182e4a7185b958477",
    ),
    "activityPreStop": (
        0x0C1549F6,
        42,
        "3d75f2a586c9a421292e41ef09365a498a70bd9245f379c1cb11b4ab7519af48",
    ),
    "activityStop": (
        0x0C154A20,
        60,
        "63affe789d315a41ae41e9602bcbfced138ed466b6dd4b2f379641503ca68ba8",
    ),
    "slotInstall": (
        0x0C1553B0,
        332,
        "15f8607ba7372b2b7c959d0be9d65e8455dcd526ef35d24b54230d1814439fa5",
    ),
    "indexedAuthResolver": (
        0x0C1399FA,
        122,
        "97a043f2f0d6c1ccccff480e898afcf51e63a19c0c6345e5900d99a4def78bc1",
    ),
    "archiveMemberLookup": (
        0x0C139588,
        116,
        "34ba130b3a892f400d28519c4df991f790eee9b46a9d750b6c4813b41dd8ff89",
    ),
    "resultWriter": (
        0x0C0BB342,
        8,
        "c4c730e9f1762326de0349eef6a7a6fd5456051e3402a13418961a497360e47b",
    ),
    "motionCommand": (
        0x0C15400E,
        530,
        "ffad9b5eb939291b5e226231930f4c60aec8abef3aead56b03b6a8a230cc0ec8",
    ),
    "splineFrameTiming": (
        0x0C154A78,
        538,
        "79765333e817622e5bcbd51e424b4ace0b2c0dbdaa15f9d2c9bbdbbb7d53d4ef",
    ),
    "activityFrameUpdater": (
        0x0C154DB0,
        560,
        "8a0ef0d34f5a174b815188727439f701d162dfc3b333cb631bcefbd9a7f14d8c",
    ),
    "activityUpdateDriver": (
        0x0C154CA4,
        236,
        "6881b9b74b2b4189a093c3eccab7e008259cb8f5d66d99eaaf769732c563303c",
    ),
    "commandDispatchTable": (
        0x0C299F40,
        28,
        "3767e33eb20758ede3cbc11dad35567ae0e221b6e07367fd0dc7c3f8c6ff8a76",
    ),
}
MAPINFO_RANGES = {
    "activityCalls": (
        0x8391A,
        48,
        "8f422747b22c80ca812d3009d510d6f8dced8ec6100e19f740e59ac122e67e5b",
    ),
    "resourceBindings": (
        0x8596C,
        70,
        "960e4a26b17a7dd0de91faaddbc112168088b6229d302d6139846badb41a347a",
    ),
}
EXPECTED_MEMBERS = [
    (
        "M_01REV.MOTN",
        166960,
        "6b34ada14a17959da702129589e120ea070e37cef81ad0e97b8c797cada37211",
    ),
    (
        "M_ZAKO.MOTN",
        168080,
        "0562507487c808d2e1ad80f5e2fd2a3527172e01fd79501c64134db1ffccac3d",
    ),
    (
        "SEQDATA1.AUTH",
        10232,
        "1e4a1c1ce0151c59fec79d9bfc706e14990ee75edf78698713fc28d6065e3357",
    ),
    (
        "SEQDATA2.AUTH",
        7564,
        "a410bfb4d1a82db5bf09cdb05398ad55fc078fe3f31126033f6c20b52e7c83da",
    ),
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require_hash(data: bytes, expected: str, label: str) -> None:
    if sha256(data) != expected:
        raise ValueError(f"unexpected {label}")


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def c_string(data: bytes, offset: int) -> str:
    end = data.find(b"\0", offset)
    if end < 0:
        raise ValueError(f"unterminated string at 0x{offset:x}")
    return data[offset:end].decode("ascii")


def parse_archive(data: bytes) -> list[dict[str, Any]]:
    if data[:4] != b"PAKS" or len(data) < 32:
        raise ValueError("DRAUTH.PKS is not a PAKS container")
    ipac_offset = struct.unpack_from("<I", data, 4)[0]
    if data[ipac_offset:ipac_offset + 4] != b"IPAC":
        raise ValueError("DRAUTH.PKS has no IPAC dictionary")
    dictionary_relative, count = struct.unpack_from("<II", data, ipac_offset + 4)
    dictionary_offset = ipac_offset + dictionary_relative
    if count > 1000 or dictionary_offset + count * 20 > len(data):
        raise ValueError("DRAUTH.PKS dictionary is invalid")
    members = []
    for index in range(count):
        entry = dictionary_offset + index * 20
        raw_name, raw_extension, relative, size = struct.unpack_from(
            "<8s4sII", data, entry
        )
        name = raw_name.rstrip(b"\0 ").decode("ascii")
        extension = raw_extension.rstrip(b"\0 ").decode("ascii")
        offset = ipac_offset + relative
        if offset > len(data) or size > len(data) - offset:
            raise ValueError(f"DRAUTH member {index} exceeds its archive")
        payload = data[offset:offset + size]
        members.append({
            "index": index,
            "name": f"{name}.{extension}",
            "extension": extension,
            "offset": offset,
            "byteLength": size,
            "sha256": sha256(payload),
        })
    return members


def find_actions(program: dict[str, Any], offsets: set[str]) -> dict[str, Any]:
    actions = {}
    for function in program["functions"]:
        for block in function["blocks"]:
            for action in block["actions"]:
                offset = action.get("callFileOffset")
                if offset in offsets:
                    actions[offset] = action
    if set(actions) != offsets:
        raise ValueError("D000 activity call inventory changed")
    return actions


def build_report(
    executable: bytes,
    mapinfo: bytes,
    archive: bytes,
    program_pack: dict[str, Any],
) -> dict[str, Any]:
    require_hash(executable, EXECUTABLE_SHA256, "1ST_READ.BIN")
    require_hash(mapinfo, MAPINFO_SHA256, "D000 MAPINFO.BIN")
    require_hash(archive, ARCHIVE_SHA256, "DRAUTH.PKS")
    for label, (address, size, digest) in EXECUTABLE_RANGES.items():
        require_hash(runtime_slice(executable, address, size), digest, label)
    for label, (offset, size, digest) in MAPINFO_RANGES.items():
        require_hash(mapinfo[offset:offset + size], digest, label)

    literals = {
        "slotTable": (0x0C1551D8, 0x0C222588),
        "activeActivity": (0x0C1551DC, 0x0C222B00),
        "resultWriter": (0x0C1551E0, 0x0C0BB342),
        "installSlotTable": (0x0C1554BC, 0x0C222588),
        "installAuthTag": (0x0C1554E4, 0x48545541),
        "installIndexedResolver": (0x0C1554EC, 0x0C1399FA),
        "indexedResolverAuthTag": (0x0C139A88, 0x48545541),
        "memberLookupAuthTag": (0x0C139BC8, 0x48545541),
    }
    for label, (address, expected) in literals.items():
        actual = struct.unpack_from(
            "<I", executable, address - RUNTIME_BASE
        )[0]
        if actual != expected:
            raise ValueError(f"operation-0x0050 literal {label} changed")

    frame_rate = struct.unpack_from(
        "<f", executable, 0x0C154B88 - RUNTIME_BASE
    )[0]
    if frame_rate != 30.0:
        raise ValueError("AUTH spline frame-rate literal changed")
    dispatch_handlers = struct.unpack_from(
        "<7I", executable, 0x0C299F40 - RUNTIME_BASE
    )
    expected_dispatch_handlers = (
        0x0C153ACA,
        0x0C153AE4,
        0x0C153B30,
        0x0C15400E,
        0x0C154220,
        0x0C154260,
        0x0C15453A,
    )
    if dispatch_handlers != expected_dispatch_handlers:
        raise ValueError("AUTH command dispatch table changed")
    negative_mode_offsets = struct.unpack_from(
        "<12h", executable, 0x0C1551E4 - RUNTIME_BASE
    )
    expected_negative_mode_offsets = (
        164, 212, 204, 160, 130, 126, 102, 98, 92, 86, 80, 36,
    )
    if negative_mode_offsets != expected_negative_mode_offsets:
        raise ValueError("operation-0x0050 negative-mode jump table changed")
    negative_mode_targets = {
        mode: 0x0C1551D8 + negative_mode_offsets[mode + 12]
        for mode in range(-12, 0)
    }
    expected_op00_negative_targets = {
        -12: 0x0C15527C,
        -10: 0x0C1552A4,
        -9: 0x0C155278,
        -6: 0x0C15523E,
    }
    for mode, expected in expected_op00_negative_targets.items():
        if negative_mode_targets[mode] != expected:
            raise ValueError(
                f"operation-0x0050 mode {mode} route changed"
            )

    program = next(
        (
            item for item in program_pack["programs"]
            if item["id"] == "disc1-d000-selector-18-0x84b60"
        ),
        None,
    )
    if program is None or program.get("mapinfoSha256") != MAPINFO_SHA256:
        raise ValueError("D000 selector-18 program changed")
    actions = find_actions(
        program,
        {
            "0x83926", "0x83940", "0x83d6a",
            "0x8598a", "0x859ae", "0x85af6",
        },
    )
    expected_arguments = {
        "0x83926": [("frame-field", None, 16)],
        "0x83940": [("constant", 0xFFFFFFFF, None)],
        "0x83d6a": [("constant", 0xFFFFFFF9, None)],
        "0x8598a": [
            ("constant", 0, None),
            ("constant", 0, None),
            ("static-pointer", 0xB138A, None),
            ("static-pointer", 0xB1391, None),
        ],
        "0x859ae": [
            ("constant", 0, None),
            ("constant", 1, None),
            ("static-pointer", 0xB1392, None),
            ("static-pointer", 0xB1399, None),
        ],
        "0x85af6": [("constant", 0, None)],
    }
    for offset, expected in expected_arguments.items():
        actual = [
            (argument["kind"], argument.get("value"), argument.get("offset"))
            for argument in actions[offset]["arguments"]
        ]
        if actual != expected:
            raise ValueError(f"D000 arguments at {offset} changed")
    if (
        actions["0x83926"]["operationId"] != 0x0050
        or actions["0x83940"]["operationId"] != 0x0050
        or actions["0x8598a"]["operationId"] != 0x013E
        or actions["0x859ae"]["operationId"] != 0x013E
        or actions["0x85af6"].get("targetFileOffset") != "0x836d8"
        or actions["0x83940"].get("resultComparison", {}).get("constant") != 0
        or actions["0x83d6a"]["operationId"] != 0x0050
        or actions["0x83d6a"].get("resultComparison", {}).get("constant") != 0
    ):
        raise ValueError("D000 activity operation route changed")

    bindings = [
        {"slot": 0, "primaryPointer": 0xB138A, "secondaryPointer": 0xB1391},
        {"slot": 1, "primaryPointer": 0xB1392, "secondaryPointer": 0xB1399},
    ]
    for binding in bindings:
        if (
            c_string(mapinfo, binding["primaryPointer"]) != "DRAUTH"
            or c_string(mapinfo, binding["secondaryPointer"]) != ""
        ):
            raise ValueError("D000 DRAUTH pointer identity changed")

    members = parse_archive(archive)
    actual_members = [
        (member["name"], member["byteLength"], member["sha256"])
        for member in members
    ]
    if actual_members != EXPECTED_MEMBERS:
        raise ValueError("DRAUTH.PKS member dictionary changed")
    auth_members = [member for member in members if member["extension"] == "AUTH"]
    if [member["name"] for member in auth_members] != [
        "SEQDATA1.AUTH", "SEQDATA2.AUTH"
    ]:
        raise ValueError("DRAUTH AUTH member order changed")

    resource_slots = []
    for binding, member in zip(bindings, auth_members, strict=True):
        resource_slots.append({
            **binding,
            "resourceName": "DRAUTH",
            "variant": "",
            "authOrdinal": binding["slot"],
            "archiveMember": member["name"],
            "archiveMemberSha256": member["sha256"],
        })

    return {
        "schema": "new-yokosuka-operation-0050-evidence-v1",
        "status": "exact-d000-start-poll-and-indexed-auth-resource-binding",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "mapinfo": "disc1/SCENE/01/D000/MAPINFO.BIN",
            "mapinfoSha256": MAPINFO_SHA256,
            "archive": "disc1/SCENE/01/D000/DRAUTH.PKS",
            "archiveSha256": ARCHIVE_SHA256,
            "programPack": "play/data/events/nativeEventPrograms.generated.json",
        },
        "operation": {
            "operationId": 0x0050,
            "operationHex": "0x0050",
            "handlerAddress": "0x0c155194",
            "slotCount": 70,
            "slotTableAddress": "0x0c222588",
            "activeActivityAddress": "0x0c222b00",
            "provenModes": [
                {
                    "range": "0..69",
                    "behavior": (
                        "stops any current activity, selects the exact installed "
                        "slot, initializes ASEQ/ACAM/AMOV/ASTR/ALIP ownership, "
                        "and marks the activity active"
                    ),
                },
                {
                    "mode": -1,
                    "behavior": (
                        "performs native terminal cleanup when applicable and "
                        "returns zero when no activity is active, otherwise the "
                        "active activity state byte"
                    ),
                },
                {
                    "mode": -7,
                    "behavior": (
                        "returns the retained delayed-stop latch at activity "
                        "record offset 0x3c; a normal start resets it to zero, "
                        "and normal terminal cleanup leaves that zero intact"
                    ),
                },
                {
                    "mode": -12,
                    "argumentCount": 3,
                    "dispatchTarget": "0x0c15527c",
                    "behavior": (
                        "validates argument one as a slot from zero through 69 "
                        "and writes the booleanized argument two to that slot "
                        "record's dword at +0x10"
                    ),
                },
                {
                    "mode": -10,
                    "argumentCount": 1,
                    "dispatchTarget": "0x0c1552a4",
                    "behavior": (
                        "returns active activity dword +0x40 only while its "
                        "state byte is one, and otherwise returns zero"
                    ),
                },
                {
                    "mode": -9,
                    "argumentCount": 3,
                    "dispatchTarget": "0x0c155278",
                    "behavior": (
                        "branches directly to the common return without "
                        "reading either trailing argument or mutating activity state"
                    ),
                },
                {
                    "mode": -6,
                    "argumentCount": 1,
                    "dispatchTarget": "0x0c15523e",
                    "behavior": (
                        "runs the native pre-stop and terminal-stop sequence "
                        "for the current activity"
                    ),
                },
            ],
            "d000Route": {
                "startCall": "0x83926",
                "startArgument": 0,
                "pollCall": "0x83940",
                "pollMode": -1,
                "completionComparison": 0,
                "postActivityLatchCall": "0x83d6a",
                "postActivityLatchMode": -7,
                "postActivityLatchComparison": 0,
            },
            "verifiedRanges": {
                label: {
                    "address": f"0x{address:08x}",
                    "length": size,
                    "sha256": digest,
                }
                for label, (address, size, digest) in EXECUTABLE_RANGES.items()
            },
            "frameRuntime": {
                "updaterAddress": "0x0c154db0",
                "currentFrameOffset": 44,
                "advancePerUpdate": 1,
                "splineTimeAddress": "0x0c154a78",
                "framesPerSecond": frame_rate,
                "currentTimeExpression": "currentFrame / 30.0",
                "nextTimeExpression": "(currentFrame + 1) / 30.0",
                "commandConsumption": (
                    "after advancing the current frame, consumes every authored "
                    "ASEQ record whose frame is at or before the current frame"
                ),
            },
            "commandDispatch": [
                {
                    "type": command_type,
                    "name": name,
                    "handlerAddress": f"0x{handler:08x}",
                    "lifecycleModes": {"start": 0, "update": 1, "cleanup": 2},
                }
                for command_type, (name, handler) in enumerate(zip(
                    ("unknown-0", "camera", "move", "motion", "effect", "voice", "sound"),
                    dispatch_handlers,
                    strict=True,
                ))
            ],
            "motionInterval": {
                "handlerAddress": "0x0c15400e",
                "authoredStartAdjustment": -1,
                "authoredEndAdjustment": -1,
                "updateCountExpression": "endFrame - startFrame",
            },
        },
        "resourceBinding": {
            "installOperation": "0x013e",
            "archiveName": "DRAUTH",
            "selectionRule": (
                "when the variant string is empty, the native indexed resolver "
                "iterates AUTH-extension members exactly slot-index times"
            ),
            "slots": resource_slots,
            "archiveMembers": members,
        },
        "evidenceBoundary": [
            "Slot zero and slot one are bound by exact authored operation-0x013e calls; no actor or proximity selects them.",
            "SEQDATA1.AUTH and SEQDATA2.AUTH follow from the hash-pinned native AUTH-extension iterator and exact IPAC dictionary order, not a filename guess.",
            "D000's start mode zero, completion poll mode minus one, and exact post-activity delayed-stop-latch query mode minus seven are promoted here.",
            "The hash-pinned negative-mode jump table proves OP00's minus-twelve slot flag write, minus-ten active dword query, minus-nine exact no-op, and minus-six explicit stop routes; other unpromoted negative controls remain unresolved.",
            "The hash-pinned update driver proves offset 0x3c is set to one only when the separate offset-0x38 delayed-stop countdown expires; ordinary terminal cleanup does not set or clear it.",
            "This evidence proves activity lifecycle and resource identity, not yet every presentation adapter needed to execute each ASEQ command.",
            "Hash-pinned native updater and spline ranges prove one authored frame per update and an exact 30.0-frame-per-second spline clock; this is not inferred from emulator cadence.",
            "The command dispatch table and lifecycle modes prove command ownership boundaries, while engine-specific camera, transform, rig, and audio adaptation remains Babylon presentation work.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--mapinfo", type=Path, default=DEFAULT_MAPINFO)
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE)
    parser.add_argument("--program-pack", type=Path, default=DEFAULT_PROGRAM_PACK)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
        args.archive.read_bytes(),
        json.loads(args.program_pack.read_text(encoding="utf-8")),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.out}: "
        f"{len(report['resourceBinding']['slots'])} exact DRAUTH slots"
    )


if __name__ == "__main__":
    main()
