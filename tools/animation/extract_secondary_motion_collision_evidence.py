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
YAB_PROFILE = 0x0C2989A8
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
    ("modelProfileSelector", 0x0C131CBC, 0x0C132054),
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


def resolve_native_profile(executable: bytes, tag: bytes) -> int:
    """Execute the original integer-only model-profile selector, FUN_0c131cbc.

    Retain its default case too. This translates the whole decision table from
    source instructions instead of hand-maintaining bindings for every model.
    No general SH-4 emulation or game-code execution is involved.
    """
    registers = [0] * 16
    registers[4] = int.from_bytes(tag.ljust(4, b"\0"), "little")
    equal = False

    def move(address: int, instruction: int) -> None:
        destination = (instruction >> 8) & 15
        if instruction >> 12 == 0xD:
            registers[destination] = read_u32(executable, ((address + 4) & ~3) + (instruction & 255) * 4)
        elif instruction & 0xF00F == 0x6003:
            registers[destination] = registers[(instruction >> 4) & 15]
        elif instruction == 9:
            pass
        else:
            raise ValueError(f"uncharacterized profile-selector instruction {instruction:04x} at {hx(address)}")

    pc = 0x0C131CBC
    for _ in range(512):
        if not 0x0C131CBC <= pc < 0x0C132054:
            raise ValueError("native profile selector left its characterized function")
        instruction = struct.unpack("<H", read_bytes(executable, pc, 2))[0]
        if instruction & 0xF00F == 0x3000:
            equal = registers[(instruction >> 8) & 15] == registers[(instruction >> 4) & 15]
            pc += 2
        elif instruction >> 8 in (0x89, 0x8B):
            taken = equal if instruction >> 8 == 0x89 else not equal
            displacement = struct.unpack("<b", bytes([instruction & 255]))[0]
            pc = pc + 4 + displacement * 2 if taken else pc + 2
        elif instruction >> 12 == 0xA or instruction == 0x000B:
            delay = struct.unpack("<H", read_bytes(executable, pc + 2, 2))[0]
            move(pc + 2, delay)
            if instruction == 0x000B:
                return registers[0]
            displacement = instruction & 0xFFF
            if displacement & 0x800:
                displacement -= 0x1000
            pc += 4 + displacement * 2
        else:
            move(pc, instruction)
            pc += 2
    raise ValueError("native model-profile selector did not return")


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
    # FUN_0c131cbc selects this profile from the YAB model tag. Type 0x83
    # consumes only its first sphere, at OSAG owner +0x28..+0x34.
    assert_literal(executable, 0x0C131E98, int.from_bytes(b"YAB\0", "little"))
    assert_literal(executable, 0x0C132190, YAB_PROFILE)

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
    tags = {read_bytes(executable, address, 4) for start, end in
            ((0x0C131E7C, 0x0C131F2C), (0x0C1320E0, 0x0C132124))
            for address in range(start, end, 4)}
    tags.add(b"???\0")  # Original selector's explicit default return.
    radial_profiles = {}
    for tag in sorted(tags):
        address = resolve_native_profile(executable, tag)
        raw = read_bytes(executable, address, 4)
        x, y, z, radius = struct.unpack("<4b", raw)
        if radius < 0:
            raise ValueError(f"negative native first-sphere radius for {tag!r}")
        radial_profiles[tag.rstrip(b"\0").decode("ascii")] = {
            "sourceAddress": hx(address), "sourceSha256": sha256_bytes(raw),
            "points": [{"controllerType": controller_types[0],
                        "localPosition": [round(value * POINT_SCALE, 8) for value in (x, y, z)],
                        "radius": round(radius * POINT_SCALE, 8)}],
            "spans": [], "projection": {"segmentLengthSquaredFloor": read_f32(executable, 0x0C094C6C),
                                          "normalLengthFloor": read_f32(executable, 0x0C094B74)},
        }
    if radial_profiles["YAB"]["sourceAddress"] != hx(YAB_PROFILE) or radial_profiles["KOK"]["sourceAddress"] != hx(KOK_PROFILE):
        raise ValueError("native selector disagrees with retained YAB/KOK binding evidence")

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
        "radialSurfaceProfiles": radial_profiles,
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
    # All type-0x83 profiles use the same native first-point controller and
    # projection constants. Keep the generated model table to sphere data;
    # duplicating a whole collision pipeline per model obscures the contract.
    profiles = evidence["radialSurfaceProfiles"]
    first = next(iter(profiles.values()))
    if any(profile["points"][0]["controllerType"] != first["points"][0]["controllerType"]
           or profile["projection"] != first["projection"] or profile["spans"]
           for profile in profiles.values()):
        raise ValueError("radial surface profiles no longer share the first-sphere contract")
    lines.append("const RADIAL_SPHERES_BY_MODEL = {")
    for tag, profile in profiles.items():
        point = profile["points"][0]
        lines.append(f"  {json.dumps(tag)}: {{ sourceAddress: {json.dumps(profile['sourceAddress'])}, "
                     f"sourceSha256: {json.dumps(profile['sourceSha256'])}, "
                     f"localPosition: {json.dumps(point['localPosition'])}, radius: {js_number(point['radius'])} }},")
    lines.extend([
        "};",
        "const RADIAL_PROJECTION = Object.freeze(" + json.dumps(first["projection"]) + ");",
        "export const NATIVE_RADIAL_SURFACE_COLLISION_PROFILES = Object.freeze(Object.fromEntries(",
        "  Object.entries(RADIAL_SPHERES_BY_MODEL).map(([tag, sphere]) => [tag, Object.freeze({",
        "    sourceAddress: sphere.sourceAddress, sourceSha256: sphere.sourceSha256,",
        f"    points: Object.freeze([Object.freeze({{ controllerType: {first['points'][0]['controllerType']},",
        "      localPosition: Object.freeze(sphere.localPosition), radius: sphere.radius })]),",
        "    spans: Object.freeze([]), projection: RADIAL_PROJECTION,",
        "  })]),",
        "));",
    ])
    return "\n".join(lines) + "\n"


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
