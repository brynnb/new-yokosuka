#!/usr/bin/env python3
"""Extract and summarize Shenmue I's characterized OSAG node handlers.

This complements the type-0x78 collision-profile extractor.  In particular,
it records that type 0x81 is a separate bounded-angular surface handler and
does not route through the type-0x78 humanoid collision dispatcher.
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
TYPE_81_HANDLER = 0x0C135BEC
TYPE_81_END = 0x0C136172
TYPE_78_COLLISION_DISPATCHER = 0x0C094934
MGR_WORD = int.from_bytes(b"MGR\0", "little")

MODEL_TAG_LITERALS = (
    0x0C135C5C,
    0x0C135C60,
    0x0C135C64,
    0x0C135C68,
    0x0C135C6C,
    0x0C135C70,
)

CODE_RANGES = (
    ("recordInitializer", 0x0C13161C, 0x0C131806),
    ("type81Handler", TYPE_81_HANDLER, TYPE_81_END),
    ("recordParentResolver", 0x0C13687C, 0x0C1368A4),
    ("bodyPoseInitializer", 0x0C1368A4, 0x0C1368CE),
    ("angularStateIntegrator", 0x0C1368CE, 0x0C136A00),
    ("boundedPairApproach", 0x0C136A00, 0x0C136A54),
    ("boundedAngularApproach", 0x0C136A54, 0x0C136B08),
    ("type79Handler", 0x0C133B84, 0x0C134380),
    ("type7aHandler", 0x0C134380, 0x0C134874),
    ("type7bHandler", 0x0C134874, 0x0C135158),
    ("type7cHandler", 0x0C135158, 0x0C135352),
    ("type7dHandler", 0x0C135352, 0x0C135714),
    ("type7eHandler", 0x0C135714, 0x0C135900),
    ("type83Handler", 0x0C13672C, 0x0C13687C),
)

# The default angular branches, not model-specific HGC/REN overrides. The
# browser uses their phase/scale constants with a bounded motion-driven
# approximation; it does not claim to reproduce the native inertial/collision
# history or the global wind integrator. Keep that distinction in the evidence.
ANGULAR_HANDLERS = {
    "0x7a": (0x0C134380, 0x0C132D28, {
        "primaryMotionScale": 0x0C13455C, "secondaryMotionScale": 0x0C134560,
        "maximumAmplitudeDegrees": 0x0C134558, "amplitudeDecay": 0x0C134564,
        "primaryPhaseStepDegrees": 0x0C134570, "secondaryPhaseStepDegrees": 0x0C13456C}),
    "0x7b": (0x0C134874, 0x0C132D2C, {
        "primaryMotionScale": 0x0C1349A8, "secondaryMotionScale": 0x0C1349AC,
        "maximumAmplitudeDegrees": 0x0C1349A4, "amplitudeDecay": 0x0C1349B0,
        "primaryPhaseStepDegrees": 0x0C134AD4, "secondaryPhaseStepDegrees": 0x0C134AD0}),
    "0x7c": (0x0C135158, 0x0C132D30, {
        "angularApproachDegrees": 0x0C1352B8,
        "primaryPhaseStepDegrees": 0x0C1352C4, "secondaryPhaseStepDegrees": 0x0C1352C0}),
    "0x7d": (0x0C135352, 0x0C132D34, {
        "primaryMotionScale": 0x0C135434, "secondaryMotionScale": 0x0C135438,
        "angularApproachDegrees": 0x0C135424,
        "primaryPhaseStepDegrees": 0x0C135444, "secondaryPhaseStepDegrees": 0x0C135440}),
    "0x7e": (0x0C135714, 0x0C132D38, {
        "primaryMotionScale": 0x0C135818, "secondaryMotionScale": 0x0C135818,
        "angularApproachDegrees": 0x0C13581C,
        "primaryPhaseStepDegrees": 0x0C1358F4, "secondaryPhaseStepDegrees": 0x0C1358F0}),
}

CONSTANTS = {
    "ownerMagnitudeActivationThreshold": (0x0C135D14, 1.0e-6),
    "ownerMagnitudeScale": (0x0C135D18, 30.0),
    "mgrPrimaryAngularScale": (0x0C135D1C, 2.0),
    "mgrSecondaryAngularScale": (0x0C135D20, 3.0),
    "angularApproachStep": (0x0C136184, 0.2),
    "secondaryPhaseStepDegrees": (0x0C136188, -15.0),
    "primaryPhaseStepDegrees": (0x0C13618C, 10.0),
    "turnUnitsPerDegree": (0x0C136194, 8192.0),
    "kokChildScaleBase": (0x0C135E3C, 0.2),
    "kokChildScaleRetention": (0x0C135E40, 0.8),
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_bytes(executable: bytes, address: int, size: int) -> bytes:
    offset = address - LOAD_ADDRESS
    if offset < 0 or offset + size > len(executable):
        raise ValueError(f"address 0x{address:08x} is outside the executable")
    return executable[offset:offset + size]


def read_u32(executable: bytes, address: int) -> int:
    return struct.unpack("<I", read_bytes(executable, address, 4))[0]


def read_f32(executable: bytes, address: int) -> float:
    return struct.unpack("<f", read_bytes(executable, address, 4))[0]


def summarize_runtime_capture(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    capture = json.loads(raw)
    if capture.get("targetActorTag") != "MGR":
        raise ValueError("type-0x81 runtime evidence must target MGR")
    native = capture.get("native", {})
    if int(native.get("handler", "0"), 16) != TYPE_81_HANDLER:
        raise ValueError("runtime capture does not target the type-0x81 handler")
    samples = capture.get("samples")
    if not isinstance(samples, list) or not samples:
        raise ValueError("runtime capture contains no samples")

    record_addresses: set[str] = set()
    modes: set[int] = set()
    changed_offsets: set[int] = set()
    angular_amplitudes: set[float] = set()
    angular_biases: set[float] = set()
    for sample in samples:
        model_word = int(sample["modelWord"], 16)
        if model_word != MGR_WORD:
            raise ValueError("runtime sample is not owned by MGR")
        record_addresses.add(
            sample.get("recordAddress") or sample["nodeAddress"]
        )
        mode_byte = sample.get("recordModeByte", sample.get("nodeModeByte"))
        modes.add(int(mode_byte) & 0x1F)
        before = bytes.fromhex(sample["beforeRawHex"])
        after = bytes.fromhex(sample["afterRawHex"])
        if len(before) != len(after):
            raise ValueError("runtime before/after record sizes differ")
        for offset in range(0, len(before), 4):
            if before[offset:offset + 4] != after[offset:offset + 4]:
                changed_offsets.add(offset)
        angular_amplitudes.update(round(struct.unpack_from("<f", after, offset)[0], 6)
                                  for offset in (0x94, 0x98))
        angular_biases.update(round(struct.unpack_from("<f", after, offset)[0], 6)
                              for offset in (0xAC, 0xB0))

    return {
        "sourcePath": str(path),
        "sourceSha256": sha256_bytes(raw),
        "saveStateSha256": capture["source"]["saveStateSha256"],
        "guestWrites": capture["source"]["guestWrites"],
        "artificialHandlerCalls": capture["source"]["artificialHandlerCalls"],
        "sampleCount": len(samples),
        "recordAddresses": sorted(record_addresses),
        "observedModes": sorted(modes),
        "settledAngularAmplitudesDegrees": sorted(angular_amplitudes),
        "angularBiasesDegrees": sorted(angular_biases),
        "changedRecordOffsets": [f"0x{offset:03x}" for offset in sorted(changed_offsets)],
    }


def extract(executable_path: Path, runtime_capture: Path) -> dict[str, object]:
    executable = executable_path.read_bytes()
    executable_hash = sha256_bytes(executable)
    if executable_hash != EXPECTED_EXECUTABLE_SHA256:
        raise ValueError(
            f"unsupported 1ST_READ.BIN SHA-256 {executable_hash}"
        )

    for node_type, (target, dispatch, _) in ANGULAR_HANDLERS.items():
        if read_u32(executable, dispatch) != target:
            raise ValueError(f"OSAG dispatch target changed for {node_type}")
    if (read_u32(executable, 0x0C1340CC) != 0x0C136A00
            or read_u32(executable, 0x0C1341E4) != 0x0C136A54):
        raise ValueError("type-0x79 angular-helper links changed")
    if read_u32(executable, 0x0C132DF8) != 0x0C13672C:
        raise ValueError("OSAG vertex projection dispatch changed")

    model_tags = []
    for address in MODEL_TAG_LITERALS:
        raw = read_u32(executable, address)
        model_tags.append(raw.to_bytes(4, "little").rstrip(b"\0").decode("ascii"))
    if "MGR" not in model_tags:
        raise ValueError("type-0x81 handler no longer contains the MGR branch")

    constants = {}
    for name, (address, expected) in CONSTANTS.items():
        actual = read_f32(executable, address)
        if abs(actual - expected) > max(1.0e-9, abs(expected) * 1.0e-7):
            raise ValueError(
                f"type-0x81 constant {name} changed: {actual} != {expected}"
            )
        constants[name] = {
            "address": f"0x{address:08x}",
            "value": actual,
        }

    if read_u32(executable, 0x0C135D28) != int.from_bytes(b"KOK\0", "little"):
        raise ValueError("type-0x81 KOK branch changed")

    # The call before the control-axis rotations consumes the render node's
    # authored XYZ angles. Mistaking it for translation discards bind rotation.
    if read_u32(executable, 0x0C1361A0) != 0x0C091868:
        raise ValueError("type-0x81 authored rotation helper changed")
    if read_u32(executable, 0x0C1369E8) != 0x0C1D28E0:
        raise ValueError("type-0x81 body-pose translation helper changed")

    closure = b"".join(
        read_bytes(executable, start, end - start)
        for name, start, end in CODE_RANGES
        if name not in {"type79Handler", "type7aHandler", "type7bHandler",
                        "type7cHandler", "type7dHandler", "type7eHandler", "type83Handler"}
    )
    collision_pointer = struct.pack("<I", TYPE_78_COLLISION_DISPATCHER)
    if collision_pointer in closure:
        raise ValueError(
            "type-0x81 handler closure unexpectedly references type-0x78 collision"
        )

    return {
        "schema": "new-yokosuka-shenmue1-secondary-motion-handler-evidence-v1",
        "source": {
            "executable": str(executable_path),
            "executableSha256": executable_hash,
        },
        "handlers": {
            "0x79": {
                "address": "0x0c133b84", "dispatcher": "0x0c132a58",
                "role": "angular-surface-with-model-owned-inputs",
                "angularHelpers": ["0x0c136a00", "0x0c136a54"],
                "browserFidelity": "ordinary owner motion uses a shared bounded approximation with 0x7c default phases; MGR opening wind retains captured parameters",
            },
            **{node_type: {
                "address": f"0x{target:08x}",
                "dispatchLiteral": f"0x{dispatch:08x}",
                "role": "motion-driven-angular-surface",
                "constants": {name: {"address": f"0x{address:08x}",
                                     "value": read_f32(executable, address)}
                              for name, address in fields.items()},
                "browserFidelity": "native phase/scale constants; bounded shared owner-motion approximation, not native collision/wind history",
            } for node_type, (target, dispatch, fields) in ANGULAR_HANDLERS.items()
              if read_u32(executable, dispatch) == target},
            "0x83": {
                "address": "0x0c13672c", "role": "vertex-radial-projection",
                "ownerSphereOffset": "0x28", "ownerRadiusOffset": "0x34",
                "sourceVertexCopyOffset": "0xf8",
                "lengthFloor": read_f32(executable, 0x0C136878),
                "normalPolicy": "retain original normals",
            },
            "0x81": {
                "address": f"0x{TYPE_81_HANDLER:08x}",
                "role": "cyclic-angular-articulated-surface",
                "observedModelFamilies": model_tags,
                "type78CollisionDispatcher": None,
                "collisionConclusion": (
                    "The characterized handler/helper closure contains no "
                    "reference to FUN_0c094934. MGR sleeve containment is "
                    "owned by angular state and limits, not the KOK body proxy."
                ),
                "constants": constants,
                "controlledSurface": {
                    "modelFamily": "KOK",
                    "modeByteOffset": "0x0e",
                    "channelSelection": "bind-world-x-positive-selects-channel-1",
                    "channelSelectionInstructions": ["0x0c131670", "0x0c13167a"],
                    "childMode": "same-type-parent-mode-plus-one",
                    "childModeInstructions": ["0x0c1317e6", "0x0c1317ea"],
                    "globalModes": {"scaleY": [0, 1], "rotationX": [10, 11],
                                    "rotationZ": [20, 21], "rotationY": [30, 31]},
                    "rotationCalls": ["0x0c1d25c0", "0x0c1d2340", "0x0c1d2500"],
                    "authoredRotationCall": {"instruction": "0x0c136124",
                                             "target": "0x0c091868",
                                             "renderNodeOffsets": ["0x08", "0x0c", "0x10"]},
                    "rowTransformOrder": "control-scale * control-Y * control-X * control-Z * authored-rotation * translation * parent",
                    "scope": "constant scripted control branch; unforced KOK inertia remains unimplemented",
                },
                "runtimeObservation": summarize_runtime_capture(runtime_capture),
            },
        },
        "code": {
            name: {
                "start": f"0x{start:08x}",
                "endExclusive": f"0x{end:08x}",
                "sha256": sha256_bytes(read_bytes(executable, start, end - start)),
            }
            for name, start, end in CODE_RANGES
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--executable",
        type=Path,
        default=Path(".disc-work/exact/1ST_READ.BIN"),
    )
    parser.add_argument(
        "--runtime-capture",
        type=Path,
        default=Path(".disc-work/op02-mgr-osag-81-runtime-capture.json"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(
            "tools/evidence/shenmue1-secondary-motion-handlers.json"
        ),
    )
    parser.add_argument("--web-output", type=Path,
                        default=Path("play/data/native-articulated-surface.web.js"))
    args = parser.parse_args()
    evidence = extract(args.executable, args.runtime_capture)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + "\n")
    constants = evidence["handlers"]["0x81"]["constants"]
    profile = {"activationThreshold": constants["ownerMagnitudeActivationThreshold"]["value"],
               "childScaleBase": constants["kokChildScaleBase"]["value"],
               "childScaleRetention": constants["kokChildScaleRetention"]["value"],
               "fixedTurnUnitsPer45Degrees": constants["turnUnitsPerDegree"]["value"]}
    args.web_output.parent.mkdir(parents=True, exist_ok=True)
    args.web_output.write_text(
        "// Generated by tools/animation/extract_secondary_motion_handler_evidence.py.\n"
        "// Pinned 1ST_READ.BIN; see tools/evidence/shenmue1-secondary-motion-handlers.json.\n"
        "export const NATIVE_CONTROLLED_SURFACE_PROFILE = Object.freeze("
        + json.dumps(profile, indent=2) + ");\n"
        + "export const NATIVE_ANGULAR_MOTION_PARAMETERS = Object.freeze("
        + json.dumps({key: {name: field["value"] for name, field in handler["constants"].items()}
                      for key, handler in evidence["handlers"].items() if key in ANGULAR_HANDLERS}, indent=2)
        + ");\nexport const NATIVE_RADIAL_SURFACE_LENGTH_FLOOR = "
        + json.dumps(evidence["handlers"]["0x83"]["lengthFloor"]) + ";\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
