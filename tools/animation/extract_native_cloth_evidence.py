#!/usr/bin/env python3
"""Extract Shenmue I's executable-owned native CLTH profiles.

The output deliberately retains raw control bytes alongside the fields whose
consumers have been proven. Unknown control values are evidence, not an
invitation to assign visual meanings from observation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


LOAD_ADDRESS = 0x0C010000
EXPECTED_EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)

PROFILE_REGISTRY = 0x0C285248
NAMED_PROFILE_COUNT = 140
PROFILE_STRIDE = 0x10
FALLBACK_PROFILE_INDEX = NAMED_PROFILE_COUNT
COLLISION_RECORD_STRIDE = 0x0A
COLLISION_POINT_SCALE = 0.001

SOLVER_VELOCITY_DAMPING = {
    "default": {
        "values": [0.5, 0.5, 0.5],
        "literalAddresses": [0x0C0AF3E0, 0x0C0AF3E0, 0x0C0AF3E0],
    },
    "1": {
        "values": [0.8, 0.65, 0.8],
        "literalAddresses": [0x0C0AFB28, 0x0C0AFB2C, 0x0C0AFB28],
    },
    "2": {
        "values": [0.2, 0.1, 0.2],
        "literalAddresses": [0x0C0AF8CC, 0x0C0AFB24, 0x0C0AF8CC],
    },
    "3": {
        "values": [1.0, 1.0, 1.0],
        "literalAddresses": [None, None, None],
    },
}

SOLVER_FORCE_MAGNITUDE = 0.05444444715976715
SOLVER_FORCE_MAGNITUDE_ADDRESSES = (0x0C0AF648, 0x0C0AF7A4)
SOLVER_FIXED_DOWNWARD_ADDRESS = 0x0C0AF3EC
SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET = -2.0
SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET_ADDRESS = 0x0C0AF640
SOLVER_RING_AUTHORED_SPACING_SCALE = 0.3
SOLVER_RING_AUTHORED_SPACING_SCALE_ADDRESS = 0x0C0AF8D0
SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE = 2.0
SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE_ADDRESS = 0x0C0AFE68
SOLVER_TELEPORT_DISTANCE = 1.8
SOLVER_TELEPORT_DISTANCE_ADDRESS = 0x0C0AF8C8
SOLVER_GROUND_CLEARANCE = 0.02
SOLVER_GROUND_CLEARANCE_ADDRESS = 0x0C0B04C4
SOLVER_FIXED_DOWNWARD_MODEL_WORD = 0x2054414E  # "NAT "
SOLVER_FIXED_DOWNWARD_MODEL_WORD_ADDRESS = 0x0C0AF3E8
SOLVER_RUNTIME_MODE_4_FIELD_ADDRESS = 0x0C281E2C
SOLVER_RUNTIME_MODE_4_FIELD_ROWS = 8
SOLVER_RUNTIME_MODE_4_FIELD_COLUMNS = 20

SOLVER_PROFILE_FIELD_POINTERS = {
    0x0C0AF3E4: PROFILE_REGISTRY + 0x0A,
    0x0C0AF500: PROFILE_REGISTRY + 0x0A,
    0x0C0AF79C: PROFILE_REGISTRY + 0x0B,
    0x0C0AFF68: PROFILE_REGISTRY + 0x0D,
}

RUNTIME_MODE_OVERRIDES = {
    1: 0x0C281B78,
    2: 0x0C281C0E,
    4: 0x0C281CA4,
    6: 0x0C281D26,
    7: 0x0C281DBC,
}

CONTROL_TO_RENDER_NODE_TYPE = {
    -0x47: 0x56,
    -0x48: 0x57,
    -0x49: 0x58,
    -0x4A: 0x59,
    -0x46: 0x5A,
    -0x4B: 0x92,
    -0x4C: 0x93,
    -0x4D: 0x94,
    -0x4E: 0x95,
}

CODE_RANGES = (
    ("profileSelection", 0x0C0AE002, 0x0C0AE100),
    ("clothOwnerInitialization", 0x0C0AE100, 0x0C0AE220),
    ("clothGroupConstruction", 0x0C0AE220, 0x0C0AE560),
    ("clothLifecycleAndUpdate", 0x0C0AE67C, 0x0C0AEB1A),
    ("bodyCollisionRecordBuilder", 0x0C0AEB5E, 0x0C0AEC30),
    ("constraintInitialization", 0x0C0AEE94, 0x0C0AF35E),
    ("clothSolver", 0x0C0AF35E, 0x0C0B0512),
)


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_bytes(executable: bytes, address: int, size: int) -> bytes:
    offset = address - LOAD_ADDRESS
    if offset < 0 or offset + size > len(executable):
        raise ValueError(f"address {hx(address)} is outside the executable")
    return executable[offset:offset + size]


def read_u16(executable: bytes, address: int) -> int:
    return struct.unpack("<H", read_bytes(executable, address, 2))[0]


def read_u32(executable: bytes, address: int) -> int:
    return struct.unpack("<I", read_bytes(executable, address, 4))[0]


def read_f32(executable: bytes, address: int) -> float:
    return struct.unpack("<f", read_bytes(executable, address, 4))[0]


def read_f32_matrix(
    executable: bytes,
    address: int,
    rows: int,
    columns: int,
) -> list[list[float]]:
    raw = read_bytes(executable, address, rows * columns * 4)
    values = struct.unpack(f"<{rows * columns}f", raw)
    return [
        list(values[row * columns:(row + 1) * columns])
        for row in range(rows)
    ]


def assert_u32(executable: bytes, address: int, expected: int) -> None:
    actual = read_u32(executable, address)
    if actual != expected:
        raise ValueError(
            f"literal {hx(address)} is {hx(actual)}, expected {hx(expected)}"
        )


def collision_profile(executable: bytes, address: int) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    source_offset = 0
    while True:
        raw = read_bytes(
            executable,
            address + source_offset,
            COLLISION_RECORD_STRIDE,
        )
        x, y, z, radius, controller_type, collision_mask_shift = (
            struct.unpack("<4hBB", raw)
        )
        if collision_mask_shift == 0xFF:
            if (x, y, z, radius) != (0, 0, 0, 0):
                raise ValueError(
                    f"collision profile {hx(address)} has a nonempty sentinel"
                )
            sentinel = {
                "controllerType": controller_type,
                "collisionMaskShift": collision_mask_shift,
                "sourceBytes": list(raw),
            }
            source_offset += COLLISION_RECORD_STRIDE
            break
        if collision_mask_shift >= 16:
            raise ValueError(
                f"collision mask shift {collision_mask_shift} is unsupported"
            )
        records.append({
            "localPosition": [
                round(component * COLLISION_POINT_SCALE, 9)
                for component in (x, y, z)
            ],
            "radius": round(radius * COLLISION_POINT_SCALE, 9),
            "controllerType": controller_type,
            "collisionMaskShift": collision_mask_shift,
            "collisionMaskBit": 1 << collision_mask_shift,
            "sourceValues": [
                x,
                y,
                z,
                radius,
                controller_type,
                collision_mask_shift,
            ],
        })
        source_offset += COLLISION_RECORD_STRIDE
        if len(records) > 255:
            raise ValueError(f"collision profile {hx(address)} has no sentinel")
    source = read_bytes(executable, address, source_offset)
    return {
        "sourceAddress": hx(address),
        "sourceByteLength": len(source),
        "sourceSha256": sha256_bytes(source),
        "recordCount": len(records),
        "records": records,
        "sentinel": sentinel,
    }


def registry_row(executable: bytes, index: int) -> dict[str, Any]:
    address = PROFILE_REGISTRY + index * PROFILE_STRIDE
    source = read_bytes(executable, address, PROFILE_STRIDE)
    model_word, collision_address = struct.unpack_from("<II", source)
    control_bytes = list(source[8:16])
    if control_bytes[6:] != [0, 0]:
        raise ValueError(f"profile row {index} has nonzero trailing padding")
    if index == FALLBACK_PROFILE_INDEX:
        if model_word != 0xFFFFFFFF:
            raise ValueError("native cloth fallback row is unavailable")
        model_code = None
    else:
        code_bytes = source[:4]
        try:
            model_code = code_bytes.decode("ascii").rstrip(" ")
        except UnicodeDecodeError as error:
            raise ValueError(f"profile row {index} has a non-ASCII model code") from error
        if len(model_code) != 3 or code_bytes[3] != 0x20:
            raise ValueError(f"profile row {index} has an invalid model code")
    return {
        "profileIndex": index,
        "sourceAddress": hx(address),
        "modelCode": model_code,
        "bodyCollisionProfileAddress": hx(collision_address),
        "rawControlBytes": control_bytes,
        "controlByteConsumers": {
            "0x08": "constraint-layout branch in FUN_0c0aee94",
            "0x09": "anchored-column selection in FUN_0c0aee94",
            "0x0a": "primary force/controller selector in FUN_0c0af35e",
            "0x0b": "secondary force/controller selector in FUN_0c0af35e",
            "0x0c": "secondary-force first row in FUN_0c0af35e",
            "0x0d": "per-axis advection damping selector in FUN_0c0af35e",
        },
    }


def build_evidence(executable_path: Path) -> dict[str, Any]:
    executable = executable_path.read_bytes()
    executable_hash = sha256_bytes(executable)
    if executable_hash != EXPECTED_EXECUTABLE_SHA256:
        raise ValueError(
            "unsupported 1ST_READ.BIN SHA-256 "
            f"{executable_hash}; expected {EXPECTED_EXECUTABLE_SHA256}"
        )

    assert_u32(executable, 0x0C0AE078, PROFILE_REGISTRY)
    for index, mode in enumerate((1, 2, 4, 6, 7)):
        assert_u32(executable, 0x0C0AE07C + index * 4, RUNTIME_MODE_OVERRIDES[mode])
    if read_u16(executable, 0x0C0AE0E8) != 0x00FF:
        raise ValueError("native collision profile sentinel changed")
    if abs(read_f32(executable, 0x0C0AEC44) - COLLISION_POINT_SCALE) > 1e-10:
        raise ValueError("native cloth collision-point scale changed")
    for mode, damping in SOLVER_VELOCITY_DAMPING.items():
        for value, address in zip(
            damping["values"],
            damping["literalAddresses"],
            strict=True,
        ):
            if address is None:
                continue
            if abs(read_f32(executable, address) - value) > 1e-6:
                raise ValueError(
                    f"native cloth damping mode {mode} literal changed"
                )
    for address in SOLVER_FORCE_MAGNITUDE_ADDRESSES:
        if abs(read_f32(executable, address) - SOLVER_FORCE_MAGNITUDE) > 1e-7:
            raise ValueError(
                f"native cloth force magnitude at {hx(address)} changed"
            )
    if abs(
        read_f32(executable, SOLVER_FIXED_DOWNWARD_ADDRESS)
        + SOLVER_FORCE_MAGNITUDE
    ) > 1e-7:
        raise ValueError("native cloth fixed downward force changed")
    for address, expected, label in (
        (
            SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET_ADDRESS,
            -SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET,
            "fixed-downward controller Y offset",
        ),
        (
            SOLVER_RING_AUTHORED_SPACING_SCALE_ADDRESS,
            SOLVER_RING_AUTHORED_SPACING_SCALE,
            "authored ring spacing scale",
        ),
        (
            SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE_ADDRESS,
            SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE,
            "measured ring maximum body-radius scale",
        ),
        (
            SOLVER_TELEPORT_DISTANCE_ADDRESS,
            SOLVER_TELEPORT_DISTANCE,
            "teleport distance",
        ),
        (
            SOLVER_GROUND_CLEARANCE_ADDRESS,
            SOLVER_GROUND_CLEARANCE,
            "ground clearance",
        ),
    ):
        if abs(read_f32(executable, address) - expected) > 1e-6:
            raise ValueError(f"native cloth {label} changed")
    assert_u32(
        executable,
        SOLVER_FIXED_DOWNWARD_MODEL_WORD_ADDRESS,
        SOLVER_FIXED_DOWNWARD_MODEL_WORD,
    )
    for pointer_address, expected in SOLVER_PROFILE_FIELD_POINTERS.items():
        assert_u32(executable, pointer_address, expected)

    expected_tags = {
        0x0C0AE0F4: b"CLCB",
        0x0C0AE3BC: b"CLTH",
        0x0C0AE3CC: b"CLID",
        0x0C0AE484: b"CLVB",
        0x0C0AE488: b"CLVO",
        0x0C0AE54C: b"CLUR",
        0x0C0AE554: b"CLVB",
        0x0C0AE55C: b"CLUI",
    }
    for address, expected in expected_tags.items():
        actual = read_bytes(executable, address, 4)
        if actual != expected:
            raise ValueError(
                f"native allocation tag at {hx(address)} is {actual!r}"
            )

    for address, expected in (
        (0x0C0AE47C, 0x92),
        (0x0C0AE47E, 0x93),
        (0x0C0AE480, 0x94),
        (0x0C0AE482, 0x95),
    ):
        if read_u16(executable, address) != expected:
            raise ValueError(f"native cloth node mapping at {hx(address)} changed")

    rows = [
        registry_row(executable, index)
        for index in range(NAMED_PROFILE_COUNT + 1)
    ]
    named_rows = rows[:NAMED_PROFILE_COUNT]
    if len({row["modelCode"] for row in named_rows}) != NAMED_PROFILE_COUNT:
        raise ValueError("native cloth registry contains duplicate model codes")

    profile_addresses = {
        int(row["bodyCollisionProfileAddress"], 16)
        for row in rows
    }
    profile_addresses.update(RUNTIME_MODE_OVERRIDES.values())
    collision_profiles = {
        hx(address): collision_profile(executable, address)
        for address in sorted(profile_addresses)
    }
    code = {
        name: {
            "start": hx(start),
            "endExclusive": hx(end),
            "byteLength": end - start,
            "sha256": sha256_bytes(read_bytes(executable, start, end - start)),
        }
        for name, start, end in CODE_RANGES
    }
    registry_source = read_bytes(
        executable,
        PROFILE_REGISTRY,
        (NAMED_PROFILE_COUNT + 1) * PROFILE_STRIDE,
    )
    return {
        "schema": "new-yokosuka-shenmue1-native-cloth-evidence-v1",
        "source": {
            "executable": str(executable_path),
            "executableSha256": executable_hash,
        },
        "evidenceBoundary": [
            "Registry rows, pointers, control bytes, collision records, and node mappings are read directly from the supported Shenmue I executable.",
            "Collision record position/radius scaling and controller/mask consumers are proven by FUN_0c0aeb5e.",
            "Profile bytes +0x0a through +0x0d are recovered from the complete positional-solver control flow; trailing bytes remain raw padding.",
            "Runtime mode overrides are native FUN_0c0ae002 branches and are separate from character-default profiles.",
        ],
        "native": {
            "profileRegistry": {
                "address": hx(PROFILE_REGISTRY),
                "namedProfileCount": NAMED_PROFILE_COUNT,
                "fallbackProfileIndex": FALLBACK_PROFILE_INDEX,
                "rowStride": PROFILE_STRIDE,
                "sourceByteLength": len(registry_source),
                "sourceSha256": sha256_bytes(registry_source),
            },
            "runtimeModeOverrideProfiles": {
                str(mode): hx(address)
                for mode, address in RUNTIME_MODE_OVERRIDES.items()
            },
            "controlToRenderNodeType": {
                str(control): render
                for control, render in CONTROL_TO_RENDER_NODE_TYPE.items()
            },
            "collisionRecord": {
                "stride": COLLISION_RECORD_STRIDE,
                "pointScale": COLLISION_POINT_SCALE,
                "layout": "s16 x, s16 y, s16 z, s16 radius, u8 controllerType, u8 collisionMaskShift",
                "sentinelCollisionMaskShift": 0xFF,
            },
            "solver": {
                "fixedFramesPerSecond": 30,
                "pinnedAnchorHighNibble": 0x10,
                "firstDynamicRow": 1,
                "force": {
                    "magnitude": SOLVER_FORCE_MAGNITUDE,
                    "literalAddresses": [
                        hx(address)
                        for address in SOLVER_FORCE_MAGNITUDE_ADDRESSES
                    ],
                    "fixedDownwardLiteralAddress": hx(
                        SOLVER_FIXED_DOWNWARD_ADDRESS
                    ),
                    "fixedDownwardProfileByte0x0a": [4],
                    "fixedDownwardRuntimeModes": [1, 2, 5],
                    "fixedDownwardModelRules": [
                        {
                            "modelCode": "NAT",
                            "exceptControlTypes": [-0x46],
                            "literalAddress": hx(
                                SOLVER_FIXED_DOWNWARD_MODEL_WORD_ADDRESS
                            ),
                        },
                    ],
                    "primaryControllerPairByProfileByte0x0a": {
                        "1": [0x22, 0x1B],
                        "2": [0x1F, 0x18],
                        "3": [0x20, 0x19],
                    },
                    "fixedDownwardConstruction": {
                        "controllerPair": [0x00, 0x00],
                        "midpointYOffset": SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET,
                    },
                    "fixedDownwardControllerYOffsetLiteralAddress": hx(
                        SOLVER_FIXED_DOWNWARD_CONTROLLER_Y_OFFSET_ADDRESS
                    ),
                    "secondaryControllerPairByProfileByte0x0b": {
                        "1": [0x22, 0x1B],
                        "2": [0x1F, 0x18],
                        "3": [0x20, 0x19],
                    },
                    "controlTypeControllerPairs": {
                        "-78": [0x1B, 0x00],
                        "-77": [0x22, 0x00],
                        "-76": [0x0C, 0x0A],
                        "-75": [0x12, 0x10],
                    },
                },
                "openPanelControlTypes": [-0x47, -0x48, -0x49, -0x4A],
                "closedRingControlTypes": [-0x46, -0x4B, -0x4C, -0x4D, -0x4E],
                "closedRingAuthoredSpacingScale": (
                    SOLVER_RING_AUTHORED_SPACING_SCALE
                ),
                "closedRingAuthoredSpacingScaleLiteralAddress": hx(
                    SOLVER_RING_AUTHORED_SPACING_SCALE_ADDRESS
                ),
                "closedRingMeasuredMaximumBodyRadiusScale": (
                    SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE
                ),
                "closedRingMeasuredMaximumBodyRadiusScaleLiteralAddress": hx(
                    SOLVER_RING_MEASURED_MAXIMUM_BODY_RADIUS_SCALE_ADDRESS
                ),
                "teleportDistance": SOLVER_TELEPORT_DISTANCE,
                "teleportDistanceLiteralAddress": hx(
                    SOLVER_TELEPORT_DISTANCE_ADDRESS
                ),
                "groundClearance": SOLVER_GROUND_CLEARANCE,
                "groundClearanceLiteralAddress": hx(
                    SOLVER_GROUND_CLEARANCE_ADDRESS
                ),
                "runtimeMode4AdvectionField": {
                    "sourceAddress": hx(SOLVER_RUNTIME_MODE_4_FIELD_ADDRESS),
                    "rows": SOLVER_RUNTIME_MODE_4_FIELD_ROWS,
                    "columns": SOLVER_RUNTIME_MODE_4_FIELD_COLUMNS,
                    "coefficients": read_f32_matrix(
                        executable,
                        SOLVER_RUNTIME_MODE_4_FIELD_ADDRESS,
                        SOLVER_RUNTIME_MODE_4_FIELD_ROWS,
                        SOLVER_RUNTIME_MODE_4_FIELD_COLUMNS,
                    ),
                },
                "positionUpdateFunction": "0x0c0af35e",
                "surfaceAuxiliaryUpdateFunction": "0x0c0b0512",
                "velocityDampingByProfileByte0x0d": {
                    mode: {
                        "values": damping["values"],
                        "literalAddresses": [
                            hx(address) if address is not None else "SH4 fldi1"
                            for address in damping["literalAddresses"]
                        ],
                    }
                    for mode, damping in SOLVER_VELOCITY_DAMPING.items()
                },
            },
            "allocationTags": {
                hx(address): value.decode("ascii")
                for address, value in expected_tags.items()
            },
        },
        "summary": {
            "namedCharacterProfileCount": len(named_rows),
            "fallbackProfileCount": 1,
            "uniqueBodyCollisionProfileCount": len({
                row["bodyCollisionProfileAddress"] for row in rows
            }),
            "totalCollisionProfileCount": len(collision_profiles),
            "minimumCollisionRecordCount": min(
                profile["recordCount"] for profile in collision_profiles.values()
            ),
            "maximumCollisionRecordCount": max(
                profile["recordCount"] for profile in collision_profiles.values()
            ),
        },
        "characterProfiles": named_rows,
        "fallbackProfile": rows[FALLBACK_PROFILE_INDEX],
        "bodyCollisionProfiles": collision_profiles,
        "code": code,
    }


def production_data(evidence: dict[str, Any]) -> dict[str, Any]:
    profiles = evidence["bodyCollisionProfiles"]

    def runtime_collision_profile(profile: dict[str, Any]) -> dict[str, Any]:
        return {
            "sourceAddress": profile["sourceAddress"],
            "sourceSha256": profile["sourceSha256"],
            "records": [
                {
                    "localPosition": record["localPosition"],
                    "radius": record["radius"],
                    "controllerType": record["controllerType"],
                    "collisionMaskBit": record["collisionMaskBit"],
                }
                for record in profile["records"]
            ],
        }

    def runtime_character_profile(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "profileIndex": row["profileIndex"],
            "bodyCollisionProfileAddress": row["bodyCollisionProfileAddress"],
            "rawControlBytes": row["rawControlBytes"],
        }

    return {
        "characterProfiles": {
            row["modelCode"]: runtime_character_profile(row)
            for row in evidence["characterProfiles"]
        },
        "fallbackProfile": runtime_character_profile(evidence["fallbackProfile"]),
        "bodyCollisionProfiles": {
            address: runtime_collision_profile(profile)
            for address, profile in profiles.items()
        },
        "runtimeModeOverrideProfiles": evidence["native"][
            "runtimeModeOverrideProfiles"
        ],
        "solver": {
            key: value
            for key, value in evidence["native"]["solver"].items()
            if key != "velocityDampingByProfileByte0x0d"
        } | {
            "velocityDampingByProfileByte0x0d": {
                mode: damping["values"]
                for mode, damping in evidence["native"]["solver"][
                    "velocityDampingByProfileByte0x0d"
                ].items()
            },
        },
    }


def javascript_source(evidence: dict[str, Any]) -> str:
    data = json.dumps(production_data(evidence), indent=2)
    return f"""// Generated by tools/animation/extract_native_cloth_evidence.py.
// Do not hand-edit; values come from the original Shenmue I executable.

function deepFreeze(value) {{
  if (!value || typeof value !== \"object\" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}}

const DATA = deepFreeze({data});

export const NATIVE_CLOTH_CHARACTER_PROFILES = DATA.characterProfiles;
export const NATIVE_CLOTH_FALLBACK_PROFILE = DATA.fallbackProfile;
export const NATIVE_CLOTH_BODY_COLLISION_PROFILES = DATA.bodyCollisionProfiles;
export const NATIVE_CLOTH_RUNTIME_MODE_OVERRIDE_PROFILES = (
  DATA.runtimeModeOverrideProfiles
);
export const NATIVE_CLOTH_SOLVER_PROFILE = DATA.solver;
"""


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        current = path.read_text() if path.exists() else ""
        if current != content:
            raise ValueError(f"{path} is stale; regenerate native cloth evidence")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable",
        type=Path,
        default=Path(".disc-work/exact/1ST_READ.BIN"),
    )
    parser.add_argument(
        "--evidence-out",
        type=Path,
        default=Path("tools/evidence/shenmue1-native-cloth.json"),
    )
    parser.add_argument(
        "--web-out",
        type=Path,
        default=Path("play/data/native-cloth-profiles.web.js"),
    )
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    evidence = build_evidence(args.executable)
    evidence_source = json.dumps(evidence, indent=2) + "\n"
    web_source = javascript_source(evidence)
    write_or_check(args.evidence_out, evidence_source, args.check)
    write_or_check(args.web_out, web_source, args.check)
    if not args.check:
        print(
            f"Wrote {evidence['summary']['namedCharacterProfileCount']} named "
            f"cloth profiles and {evidence['summary']['totalCollisionProfileCount']} "
            "collision profiles"
        )


if __name__ == "__main__":
    main()
