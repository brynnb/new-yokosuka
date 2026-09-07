#!/usr/bin/env python3
"""Classify every Shenmue I SCN3 container from binary structure.

The native control-flow index intentionally recognizes generated SH-4 only.
This extractor proves what an unindexed SCN3 actually contains before corpus
diagnostics decide whether it is empty data, a missed nested token, malformed
native code, or a distinct executable encoding.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_INVENTORY = (
    ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json"
)
DEFAULT_CONTROL_FLOW = (
    ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/scn3-container-encoding-evidence.json"
DEFAULT_ROOTS = {
    1: ROOT / "extracted_files/data/SCENE/01",
    2: ROOT / "extracted_disc2_v2/data/SCENE/02",
    3: ROOT / "extracted_disc3_v2/data/SCENE/03",
}

SCHEMA = "new-yokosuka-scn3-container-encoding-evidence-v1"
EXECUTABLE_RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
CONSTRUCTOR_ADDRESS = 0x0C0BB1D6
CONSTRUCTOR_LENGTH = 0x11A
CONSTRUCTOR_SHA256 = (
    "1d1bc5f99b736ea47a6db8fcaeacc231d7a0308267d149bbebc45eb18dfbe62e"
)
PROGRAM_LOADER_ADDRESS = 0x0C0BB474
PROGRAM_LOADER_LENGTH = 0x6C
PROGRAM_LOADER_SHA256 = (
    "18cc0ca6f214c98cdd368cd5ce04e40eed4a122a01ffd575e2dc7be9bc33e70c"
)
DISCRIMINATOR_LOAD_ADDRESS = 0x0C0BB1FE
DISCRIMINATOR_LOAD_BYTES = bytes.fromhex("c153d3643a8408202b8d")
NATIVE_PATH_ADDRESS = 0x0C0BB208
LEGACY_PATH_ADDRESS = 0x0C0BB260
LEGACY_PATH_BYTES = bytes.fromhex(
    "f252222e99939992cc3348332c333361311e321e"
)
NATIVE_MARKER = 0x00020000
LEGACY_MARKER = 0x00000100
NATIVE_THUNK_LENGTH = 38
NATIVE_THUNK_SHA256 = (
    "ddb0c40666ba92a203ed3a5e0fe3e4c65eefe8d2ec7113398639c575dc1a6fb5"
)
GENERATED_FUNCTION_PROLOGUE = bytes.fromhex("e62d224d")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def runtime_slice(executable: bytes, address: int, length: int) -> bytes:
    start = address - EXECUTABLE_RUNTIME_BASE
    if start < 0 or start + length > len(executable):
        raise ValueError(f"runtime slice 0x{address:08x}+0x{length:x} is absent")
    return executable[start:start + length]


def prove_constructor(executable: bytes) -> dict[str, Any]:
    if sha256_bytes(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    constructor = runtime_slice(
        executable, CONSTRUCTOR_ADDRESS, CONSTRUCTOR_LENGTH
    )
    if sha256_bytes(constructor) != CONSTRUCTOR_SHA256:
        raise ValueError("SCN3 coroutine constructor changed")
    loader = runtime_slice(
        executable, PROGRAM_LOADER_ADDRESS, PROGRAM_LOADER_LENGTH
    )
    if sha256_bytes(loader) != PROGRAM_LOADER_SHA256:
        raise ValueError("SCN3 program loader changed")
    discriminator = runtime_slice(
        executable,
        DISCRIMINATOR_LOAD_ADDRESS,
        len(DISCRIMINATOR_LOAD_BYTES),
    )
    if discriminator != DISCRIMINATOR_LOAD_BYTES:
        raise ValueError("SCN3 encoding discriminator changed")
    # 0x8d2b is bt/s +43: PC+4+(43*2) = 0x0c0bb260.
    branch_word = struct.unpack_from("<H", discriminator, 8)[0]
    displacement = branch_word & 0xFF
    if displacement & 0x80:
        displacement -= 0x100
    branch_target = DISCRIMINATOR_LOAD_ADDRESS + 8 + 4 + displacement * 2
    if branch_word >> 8 != 0x8D or branch_target != LEGACY_PATH_ADDRESS:
        raise ValueError("SCN3 zero-discriminator branch target changed")
    if runtime_slice(
        executable, LEGACY_PATH_ADDRESS, len(LEGACY_PATH_BYTES)
    ) != LEGACY_PATH_BYTES:
        raise ValueError("SCN3 legacy constructor path changed")
    return {
        "programLoader": {
            "address": f"0x{PROGRAM_LOADER_ADDRESS:08x}",
            "length": PROGRAM_LOADER_LENGTH,
            "sha256": PROGRAM_LOADER_SHA256,
            "headerBindings": {
                "entryTarget": "token base + uint32 at token +0x0c",
                "staticData": "token base + uint32 at token +0x10",
                "runtimeData": "token base + uint32 at token +0x20",
            },
            "provenBehavior": (
                "construct and schedule the SCN3 initial target without "
                "discarding the zero-discriminator encoding"
            ),
        },
        "constructor": {
            "address": f"0x{CONSTRUCTOR_ADDRESS:08x}",
            "length": CONSTRUCTOR_LENGTH,
            "sha256": CONSTRUCTOR_SHA256,
        },
        "discriminator": {
            "loadAddress": f"0x{DISCRIMINATOR_LOAD_ADDRESS:08x}",
            "tokenByteOffset": "0x0a",
            "loadTestBranchBytes": discriminator.hex(),
            "zeroBranchTarget": f"0x{branch_target:08x}",
            "nonzeroPathAddress": f"0x{NATIVE_PATH_ADDRESS:08x}",
            "zeroPathAddress": f"0x{LEGACY_PATH_ADDRESS:08x}",
            "provenBehavior": (
                "load SCN3 token byte +0x0a, test it, and branch to a "
                "distinct scenario-context construction path when it is zero"
            ),
        },
    }


def occurrences(data: bytes, needle: bytes) -> list[int]:
    result = []
    start = 0
    while True:
        found = data.find(needle, start)
        if found < 0:
            return result
        result.append(found)
        start = found + 1


def classify_container(data: bytes) -> dict[str, Any]:
    scn3_offsets = occurrences(data, b"SCN3")
    if not scn3_offsets:
        return {
            "classification": "asset-only-no-scn3-program",
            "scn3TokenCount": 0,
        }
    if len(scn3_offsets) != 1:
        outer = scn3_offsets[0]
        outer_size = (
            struct.unpack_from("<I", data, outer + 4)[0]
            if outer + 8 <= len(data)
            else 0
        )
        outer_end = outer + outer_size
        nested = [
            offset for offset in scn3_offsets[1:]
            if outer + 8 <= offset < outer_end <= len(data)
        ]
        return {
            "classification": (
                "nested-scn3-container"
                if nested
                else "multiple-top-level-scn3-containers"
            ),
            "scn3TokenCount": len(scn3_offsets),
            "scn3FileOffsets": [f"0x{offset:x}" for offset in scn3_offsets],
            "nestedScn3FileOffsets": [
                f"0x{offset:x}" for offset in nested
            ],
        }

    scn3 = scn3_offsets[0]
    if scn3 + 0x30 > len(data):
        return {
            "classification": "malformed-scn3-container",
            "scn3TokenCount": 1,
            "scn3FileOffset": f"0x{scn3:x}",
            "reason": "truncated-header",
        }
    token_size = struct.unpack_from("<I", data, scn3 + 4)[0]
    marker = struct.unpack_from("<I", data, scn3 + 8)[0]
    entry_relative = struct.unpack_from("<I", data, scn3 + 0x0C)[0]
    static_relative = struct.unpack_from("<I", data, scn3 + 0x10)[0]
    token_end = scn3 + token_size
    entry = scn3 + entry_relative
    static = scn3 + static_relative
    bounds_valid = (
        scn3 + 0x30 <= entry < static <= token_end <= len(data)
    )
    if not bounds_valid:
        classification = "malformed-scn3-container"
    else:
        thunk = data[scn3 + 0x30:scn3 + 0x30 + NATIVE_THUNK_LENGTH]
        entry_prefix = data[entry:entry + len(GENERATED_FUNCTION_PROLOGUE)]
        native_thunk = sha256_bytes(thunk) == NATIVE_THUNK_SHA256
        native_entry = entry_prefix == GENERATED_FUNCTION_PROLOGUE
        if marker == NATIVE_MARKER and native_thunk and native_entry:
            classification = "native-sh4-scn3-program"
        elif (
            marker == LEGACY_MARKER
            and data[scn3 + 0x0A] == 0
            and entry < static
            and not native_thunk
            and not native_entry
        ):
            classification = "legacy-instruction-stream-scn3-program"
        elif marker == NATIVE_MARKER:
            classification = "native-scn3-extraction-anomaly"
        else:
            classification = "unknown-scn3-encoding"

    entry_bytes = data[entry:min(entry + 16, len(data))] if bounds_valid else b""
    nested = [
        offset for offset in scn3_offsets[1:]
        if scn3 < offset < token_end
    ]
    return {
        "classification": classification,
        "scn3TokenCount": 1,
        "scn3FileOffset": f"0x{scn3:x}",
        "tokenByteLength": token_size,
        "tokenEndFileOffset": f"0x{token_end:x}",
        "encodingMarker": f"0x{marker:08x}",
        "encodingDiscriminatorByte": data[scn3 + 0x0A],
        "entryRelativeOffset": f"0x{entry_relative:x}",
        "entryFileOffset": f"0x{entry:x}",
        "staticDataRelativeOffset": f"0x{static_relative:x}",
        "staticDataFileOffset": f"0x{static:x}",
        "programByteLength": static - entry if bounds_valid else None,
        "entryBytes": entry_bytes.hex(),
        "entryBytesSha256": sha256_bytes(entry_bytes),
        "generatedNativeThunk": (
            bounds_valid
            and sha256_bytes(
                data[
                    scn3 + 0x30:scn3 + 0x30 + NATIVE_THUNK_LENGTH
                ]
            ) == NATIVE_THUNK_SHA256
        ),
        "generatedNativeEntryPrologue": (
            bounds_valid
            and data[entry:entry + len(GENERATED_FUNCTION_PROLOGUE)]
            == GENERATED_FUNCTION_PROLOGUE
        ),
        "nestedScn3FileOffsets": [f"0x{offset:x}" for offset in nested],
        "boundsValid": bounds_valid,
    }


def source_path(disc: int, area: str, roots: dict[int, Path]) -> Path:
    try:
        root = roots[disc]
    except KeyError as error:
        raise ValueError(f"no source root for disc {disc}") from error
    return root / area / "MAPINFO.BIN"


def build_report(
    executable: bytes,
    inventory: dict[str, Any],
    control_flow: dict[str, Any],
    roots: dict[int, Path],
) -> dict[str, Any]:
    if inventory.get("schema") != (
        "new-yokosuka-shenmue1-scripted-scene-inventory-v1"
    ):
        raise ValueError("unsupported scripted-scene inventory")
    if control_flow.get("schema") != (
        "new-yokosuka-scripted-event-control-flow-index-v1"
    ):
        raise ValueError("unsupported control-flow index")
    proof = prove_constructor(executable)
    indexed = {
        (item["disc"], item["area"], item["mapinfoSha256"]): item
        for item in control_flow["maps"]
    }
    records = []
    for item in sorted(
        inventory["mapinfoPrograms"],
        key=lambda value: (value["disc"], value["area"], value["sha256"]),
    ):
        path = source_path(item["disc"], item["area"], roots)
        if not path.is_file() or sha256_path(path) != item["sha256"]:
            raise ValueError(f"MAPINFO source identity changed: {path}")
        identity = (item["disc"], item["area"], item["sha256"])
        flow = indexed.get(identity)
        if flow is None:
            raise ValueError(f"control-flow record is absent: {identity}")
        container = classify_container(path.read_bytes())
        records.append({
            "id": f"d{item['disc']}:{item['area']}:{item['sha256'][:12]}",
            "disc": item["disc"],
            "area": item["area"],
            "sourcePath": item["sourcePath"],
            "mapinfoByteLength": item["byteLength"],
            "mapinfoSha256": item["sha256"],
            "nativeControlFlowFunctionCount": len(
                flow["scriptedEventFunctions"]
            ),
            **container,
        })

    classifications = Counter(item["classification"] for item in records)
    if classifications != Counter({
        "native-sh4-scn3-program": 119,
        "legacy-instruction-stream-scn3-program": 17,
    }):
        raise ValueError(f"SCN3 encoding inventory changed: {classifications}")
    legacy = [
        item for item in records
        if item["classification"]
        == "legacy-instruction-stream-scn3-program"
    ]
    if any(
        item["nativeControlFlowFunctionCount"] != 0
        or item["programByteLength"] <= 0
        or item["scn3TokenCount"] != 1
        or item["nestedScn3FileOffsets"]
        for item in legacy
    ):
        raise ValueError("legacy SCN3 structural classification changed")
    return {
        "schema": SCHEMA,
        "status": "exact-container-and-native-loader-classification",
        "generatedBy": "tools/scripting/extract_scn3_container_encoding_evidence.py",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": f"0x{EXECUTABLE_RUNTIME_BASE:08x}",
            "executableSha256": EXECUTABLE_SHA256,
            "inventory": "tools/evidence/shenmue1-scripted-scene-inventory.json",
            "controlFlow": (
                ".disc-work/dialogue/"
                "scripted-event-control-flow-index.json"
            ),
        },
        "evidenceBoundary": [
            "Classification follows exact SCN3 token bounds and the original executable's encoding-discriminator branch; it does not infer execution format from a missing decompiler result.",
            "A legacy instruction-stream record remains an unsupported executable program, not an asset-only MAPINFO and not a compiled native program.",
            "Nested-container status requires an additional literal SCN3 token inside the bounded outer token; none of the 136 MAPINFO records has one.",
        ],
        "nativeLoader": proof,
        "summary": {
            "mapinfoCount": len(records),
            "classificationCounts": dict(sorted(classifications.items())),
            "assetOnlyCount": classifications["asset-only-no-scn3-program"],
            "nestedContainerCount": classifications["nested-scn3-container"],
            "multipleTopLevelContainerCount": classifications[
                "multiple-top-level-scn3-containers"
            ],
            "nativeExtractionAnomalyCount": classifications[
                "native-scn3-extraction-anomaly"
            ],
            "legacyInstructionStreamCount": len(legacy),
        },
        "legacyInstructionStreamPrograms": legacy,
        "records": records,
    }


def parse_roots(values: Iterable[str]) -> dict[int, Path]:
    roots = dict(DEFAULT_ROOTS)
    for value in values:
        disc_text, separator, path_text = value.partition("=")
        if not separator:
            raise ValueError("--root must use DISC=PATH")
        roots[int(disc_text)] = Path(path_text)
    return roots


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--control-flow", type=Path, default=DEFAULT_CONTROL_FLOW)
    parser.add_argument(
        "--root",
        action="append",
        default=[],
        metavar="DISC=PATH",
        help="override an extracted MAPINFO disc root",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.inventory.read_text()),
        json.loads(args.control_flow.read_text()),
        parse_roots(args.root),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {args.output}: "
        f"{summary['classificationCounts']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
