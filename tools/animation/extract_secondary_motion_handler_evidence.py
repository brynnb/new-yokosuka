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
    ("type81Handler", TYPE_81_HANDLER, TYPE_81_END),
    ("recordParentResolver", 0x0C13687C, 0x0C1368A4),
    ("bodyPoseInitializer", 0x0C1368A4, 0x0C1368CE),
    ("angularStateIntegrator", 0x0C1368CE, 0x0C136A00),
    ("boundedPairApproach", 0x0C136A00, 0x0C136A54),
    ("boundedAngularApproach", 0x0C136A54, 0x0C136B08),
)

CONSTANTS = {
    "ownerMagnitudeActivationThreshold": (0x0C135D14, 1.0e-6),
    "ownerMagnitudeScale": (0x0C135D18, 30.0),
    "mgrPrimaryAngularScale": (0x0C135D1C, 2.0),
    "mgrSecondaryAngularScale": (0x0C135D20, 3.0),
    "angularApproachStep": (0x0C136184, 0.2),
    "secondaryPhaseStepDegrees": (0x0C136188, -15.0),
    "primaryPhaseStepDegrees": (0x0C13618C, 10.0),
    "turnUnitsPerDegree": (0x0C136194, 8192.0),
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

    closure = b"".join(
        read_bytes(executable, start, end - start)
        for _, start, end in CODE_RANGES
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
    args = parser.parse_args()
    evidence = extract(args.executable, args.runtime_capture)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
