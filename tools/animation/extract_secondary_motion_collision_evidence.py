#!/usr/bin/env python3
"""Extract Shenmue I's native humanoid/OSAG collision profile.

The executable owns both the generic 28-point controller binding and the
model-profile bytes selected by the live actor.  This extractor deliberately
does not infer a body shape from rendered geometry or video frames.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


LOAD_ADDRESS = 0x0C010000
EXPECTED_EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)

CONTROLLER_TYPE_TABLE = 0x0C297D30
CONTROLLER_TYPE_COUNT = 28
KOK_PROFILE = 0x0C297F98
POINT_SCALE_LITERAL = 0x0C132890
POINT_SCALE = 0.01

SPANS = (
    (0x000, 2),
    (0x020, 2),
    (0x040, 4),
    (0x080, 2),
    (0x0A0, 2),
    (0x0C0, 2),
    (0x0E0, 2),
    (0x100, 2),
    (0x120, 2),
    (0x140, 4),
    (0x180, 2),
    (0x1A0, 2),
)

CODE_RANGES = (
    ("actorCollisionBuilder", 0x0C132708, 0x0C132880),
    ("secondaryMotionHandler", 0x0C132E14, 0x0C133B4C),
    ("collisionSpanDispatcher", 0x0C094934, 0x0C094A92),
    ("collisionCorrection", 0x0C094B34, 0x0C094B70),
    ("variableRadiusPolyline", 0x0C094B78, 0x0C094C60),
)


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_offset(address: int, size: int, executable: bytes) -> int:
    offset = address - LOAD_ADDRESS
    if offset < 0 or offset + size > len(executable):
        raise ValueError(f"address {hx(address)} is outside the executable")
    return offset


def read_bytes(executable: bytes, address: int, size: int) -> bytes:
    offset = file_offset(address, size, executable)
    return executable[offset:offset + size]


def read_u32(executable: bytes, address: int) -> int:
    return struct.unpack("<I", read_bytes(executable, address, 4))[0]


def read_f32(executable: bytes, address: int) -> float:
    return struct.unpack("<f", read_bytes(executable, address, 4))[0]


def assert_literal(executable: bytes, address: int, expected: int) -> None:
    actual = read_u32(executable, address)
    if actual != expected:
        raise ValueError(
            f"literal {hx(address)} is {hx(actual)}, expected {hx(expected)}"
        )


def extract(executable_path: Path) -> dict[str, object]:
    executable = executable_path.read_bytes()
    executable_hash = sha256_bytes(executable)
    if executable_hash != EXPECTED_EXECUTABLE_SHA256:
        raise ValueError(
            "unsupported 1ST_READ.BIN SHA-256 "
            f"{executable_hash}; expected {EXPECTED_EXECUTABLE_SHA256}"
        )

    # FUN_0c132058 loads the shared controller-type table and 0.01 scale.
    assert_literal(executable, 0x0C13288C, CONTROLLER_TYPE_TABLE)
    if abs(read_f32(executable, POINT_SCALE_LITERAL) - POINT_SCALE) > 1e-9:
        raise ValueError("native collision point scale is no longer 0.01")

    # FUN_0c132e14's collision call and FUN_0c094934's primitive/correction
    # targets are pinned so regenerated metadata cannot silently outlive code.
    assert_literal(executable, 0x0C133048, 0x004B4F4B)
    assert_literal(executable, 0x0C133B60, 0x0C094934)
    assert_literal(executable, 0x0C094B70, 0x0C094B74)
    assert_literal(executable, 0x0C094BFC, 0x0C094C60)

    controller_types = list(struct.unpack(
        f"<{CONTROLLER_TYPE_COUNT}h",
        read_bytes(executable, CONTROLLER_TYPE_TABLE, CONTROLLER_TYPE_COUNT * 2),
    ))
    raw_profile = read_bytes(executable, KOK_PROFILE, CONTROLLER_TYPE_COUNT * 4)
    point_bytes = [
        list(struct.unpack_from("<4b", raw_profile, index * 4))
        for index in range(CONTROLLER_TYPE_COUNT)
    ]
    points = [
        {
            "controllerType": controller_types[index],
            "localPosition": [
                round(component * POINT_SCALE, 8)
                for component in point_bytes[index][:3]
            ],
            "radius": round(point_bytes[index][3] * POINT_SCALE, 8),
            "sourceBytes": point_bytes[index],
        }
        for index in range(CONTROLLER_TYPE_COUNT)
    ]

    return {
        "schema": "new-yokosuka-shenmue1-secondary-motion-collision-v1",
        "source": {
            "executable": str(executable_path),
            "executableSha256": executable_hash,
            "runtimeObservation": {
                "actorTag": "KOK",
                "actorAddress": "0x0c736e48",
                "actorProfilePointerOffset": "0x20",
                "actorProfilePointer": hx(KOK_PROFILE),
                "collisionCall": "0x0c133aa2",
                "observedFrames": 12,
                "osagChainRecordCount": 14,
                "osagChainRecordStride": "0x140",
                "osagSourcePointerOffset": "0x08",
                "osagModeOffset": "0x0e",
                "osagModes": list(range(14)),
                "saveStateSha256": (
                    "5b57c010537c11ed893610ac6b848b90468a3d6348bc9fdf19f2127f8f3a98bb"
                ),
            },
        },
        "native": {
            "actorCollisionBuilder": "0x0c132058",
            "controllerResolver": "0x0c10c442",
            "controllerRecordLookup": "0x0c092ea0",
            "pointTransform": "0x0c1d28e0",
            "pointWriter": "0x0c1d14a0",
            "collisionSpanDispatcher": "0x0c094934",
            "variableRadiusPolyline": "0x0c094b78",
            "collisionCorrection": "0x0c094b34",
            "secondaryMotionHandler": "0x0c132e14",
            "controllerTypeTable": hx(CONTROLLER_TYPE_TABLE),
            "pointScaleLiteral": hx(POINT_SCALE_LITERAL),
            "pointScale": POINT_SCALE,
            "spanLayout": [
                {"offset": f"0x{offset:03x}", "pointCount": count}
                for offset, count in SPANS
            ],
            "projection": {
                "endpointBias": read_f32(executable, 0x0C094C60),
                "interiorLow": read_f32(executable, 0x0C094C64),
                "interiorHigh": read_f32(executable, 0x0C094C68),
                "segmentLengthSquaredFloor": read_f32(
                    executable,
                    0x0C094C6C,
                ),
                "normalLengthFloor": read_f32(executable, 0x0C094B74),
            },
            "nodeCollision": {
                "sourceVectorOffset": "0x20",
                "runtimeModeOffset": "0x0e",
                "runtimeModeMask": "0x1f",
                "sourceSelection": "childSourceOrSelf",
                "runtimeModeDerivation": "chainOrdinalLowFiveBits",
                "radiusLengthScaleByMode": {
                    "0": read_f32(executable, 0x0C132FFC),
                    "1": 1.0,
                    "2": read_f32(executable, 0x0C133194),
                    "default": read_f32(executable, 0x0C133000),
                },
                "clearanceByMode": {
                    "0": read_f32(executable, 0x0C13318C),
                    "default": read_f32(executable, 0x0C133008),
                },
            },
        },
        "profiles": {
            "KOK": {
                "sourceAddress": hx(KOK_PROFILE),
                "sourceSha256": sha256_bytes(raw_profile),
                "motion": {
                    "retainedDisplacement": read_f32(
                        executable,
                        0x0C133188,
                    ),
                    "downwardStepByMode": {
                        "0": read_f32(executable, 0x0C133004),
                        "1": read_f32(executable, 0x0C133004),
                        "2": read_f32(executable, 0x0C133190),
                        "3": read_f32(executable, 0x0C133278),
                        "default": read_f32(executable, 0x0C133004),
                    },
                },
                "points": points,
            },
        },
        "code": {
            name: {
                "start": hx(start),
                "endExclusive": hx(end),
                "sha256": sha256_bytes(read_bytes(executable, start, end - start)),
            }
            for name, start, end in CODE_RANGES
        },
    }


def js_number(value: float | int) -> str:
    if isinstance(value, int):
        return str(value)
    return format(value, ".9g")


def render_web_module(evidence: dict[str, object]) -> str:
    native = evidence["native"]
    profile = evidence["profiles"]["KOK"]
    lines = [
        "// Generated by tools/animation/extract_secondary_motion_collision_evidence.py.",
        "// Do not hand-edit; values come from the original Shenmue executable.",
        "",
        "const KOK_POINTS = Object.freeze([",
    ]
    for point in profile["points"]:
        xyz = ", ".join(js_number(value) for value in point["localPosition"])
        lines.append(
            "  Object.freeze({ controllerType: "
            f"{point['controllerType']}, localPosition: Object.freeze([{xyz}]), "
            f"radius: {js_number(point['radius'])} }}),"
        )
    lines.extend([
        "]);",
        "",
        "const NATIVE_SPANS = Object.freeze([",
    ])
    point_index = 0
    for span in native["spanLayout"]:
        count = span["pointCount"]
        lines.append(
            "  Object.freeze({ pointIndex: "
            f"{point_index}, pointCount: {count} }}),"
        )
        point_index += count
    projection = native["projection"]
    node_collision = native["nodeCollision"]
    motion = profile["motion"]
    lines.extend([
        "]);",
        "",
        "export const NATIVE_SECONDARY_MOTION_MODEL_PROFILES = Object.freeze({",
        "  KOK: Object.freeze({",
        "    retainedDisplacement: "
        f"{js_number(motion['retainedDisplacement'])},",
        "    downwardStepByMode: Object.freeze({",
        "      0: "
        f"{js_number(motion['downwardStepByMode']['0'])},",
        "      1: "
        f"{js_number(motion['downwardStepByMode']['1'])},",
        "      2: "
        f"{js_number(motion['downwardStepByMode']['2'])},",
        "      3: "
        f"{js_number(motion['downwardStepByMode']['3'])},",
        "      default: "
        f"{js_number(motion['downwardStepByMode']['default'])},",
        "    }),",
        "  }),",
        "});",
        "",
        "export const NATIVE_SECONDARY_MOTION_COLLISION_PROFILES = Object.freeze({",
        "  KOK: Object.freeze({",
        f"    sourceAddress: \"{profile['sourceAddress']}\",",
        f"    sourceSha256: \"{profile['sourceSha256']}\",",
        "    nodeCollision: Object.freeze({",
        "      sourceVectorOffset: "
        f"\"{node_collision['sourceVectorOffset']}\",",
        "      runtimeModeOffset: "
        f"\"{node_collision['runtimeModeOffset']}\",",
        "      runtimeModeMask: "
        f"\"{node_collision['runtimeModeMask']}\",",
        "      sourceSelection: "
        f"\"{node_collision['sourceSelection']}\",",
        "      runtimeModeDerivation: "
        f"\"{node_collision['runtimeModeDerivation']}\",",
        "      radiusLengthScaleByMode: Object.freeze({",
        "        0: "
        f"{js_number(node_collision['radiusLengthScaleByMode']['0'])},",
        "        1: "
        f"{js_number(node_collision['radiusLengthScaleByMode']['1'])},",
        "        2: "
        f"{js_number(node_collision['radiusLengthScaleByMode']['2'])},",
        "        default: "
        f"{js_number(node_collision['radiusLengthScaleByMode']['default'])},",
        "      }),",
        "      clearanceByMode: Object.freeze({",
        "        0: "
        f"{js_number(node_collision['clearanceByMode']['0'])},",
        "        default: "
        f"{js_number(node_collision['clearanceByMode']['default'])},",
        "      }),",
        "    }),",
        "    points: KOK_POINTS,",
        "    spans: NATIVE_SPANS,",
        "    projection: Object.freeze({",
        f"      endpointBias: {js_number(projection['endpointBias'])},",
        f"      interiorLow: {js_number(projection['interiorLow'])},",
        f"      interiorHigh: {js_number(projection['interiorHigh'])},",
        "      segmentLengthSquaredFloor: "
        f"{js_number(projection['segmentLengthSquaredFloor'])},",
        f"      normalLengthFloor: {js_number(projection['normalLengthFloor'])},",
        "    }),",
        "  }),",
        "});",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable",
        type=Path,
        default=Path(".disc-work/exact/1ST_READ.BIN"),
    )
    parser.add_argument(
        "--evidence-output",
        type=Path,
        default=Path(
            "tools/evidence/shenmue1-secondary-motion-collision.json"
        ),
    )
    parser.add_argument(
        "--web-output",
        type=Path,
        default=Path(
            "play/data/native-secondary-motion-collision.web.js"
        ),
    )
    args = parser.parse_args()
    evidence = extract(args.executable)
    args.evidence_output.parent.mkdir(parents=True, exist_ok=True)
    args.evidence_output.write_text(json.dumps(evidence, indent=2) + "\n")
    args.web_output.parent.mkdir(parents=True, exist_ok=True)
    args.web_output.write_text(render_web_module(evidence))
    print(f"wrote {args.evidence_output}")
    print(f"wrote {args.web_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
