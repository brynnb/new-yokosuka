#!/usr/bin/env python3
"""Prove what JOMO's drawer callback does *not* establish about audio.

The wardrobe drawers are members of JOMO shared-object group zero. That group
advertises selector 11, whose generated routine conditionally dispatches
logical-record word 9 through operation 0x006c. A synchronized native JOMO
RAM capture lets us inspect the installed context and all 18 live logical
records instead of assuming that immutable 0xffffffff values were filled at
runtime.

Every live record still has 0xffffffff in words 9..12 in three independent
full-RAM checkpoints. This rules out that particular script-level sound path
for the captured drawer session. It does not prove that the original drawer
is silent: a cue could be owned by Ryo's motion metadata, the engine object
action, or another dynamically selected route.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


EXPECTED_MAPINFO_SHA256 = (
    "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
)
EXPECTED_RAM_SHA256 = {
    147: "a11e95a3f55dfc3399d0973c80c85753792c22713bd5c2a174663565e92cd2db",
    156: "3807fb7e887425f382be75d7a1c6ebe160c198a45ef9fda031e11a36ce99cf79",
    160: "05789d4dc72d6cabc7223f8438f6c86a2b105c2fe27a2dc84b038f601dfc338f",
}

SCN3_FILE_OFFSET = 0x8
LOGICAL_RECORDS_FILE_OFFSET = 0x92660
LOGICAL_MAPPING_FILE_OFFSET = 0x92A08
MODEL_AUDIO_ROWS_FILE_OFFSET = 0x92AD8
DOOR_PLACEMENTS_FILE_OFFSET = 0x92B48
LOGICAL_RECORD_COUNT = 18
LOGICAL_RECORD_WORDS = 13
SOUND_WORD_INDICES = (9, 10, 11, 12)

ATS1_RECORD_FILE_OFFSET = 0x9B1C0
GROUP_ZERO_FILE_OFFSET = 0x9B700
SELECTOR_11_FUNCTION = 0x11F50
SELECTOR_11_SOUND_READS = (0x12794, 0x128E0)
SELECTOR_11_SOUND_CALLS = (0x1280E, 0x1295A)

ATS1_TASK_ADDRESS = 0x0C810C40
ATS1_TAG = 0x31535441
ATS1_ACTION_ID = 40
SCRIPT_CONTEXT_POINTER_OFFSETS = {
    0xC0: LOGICAL_RECORDS_FILE_OFFSET,
    0xC4: LOGICAL_MAPPING_FILE_OFFSET,
    0xC8: MODEL_AUDIO_ROWS_FILE_OFFSET,
    0xCC: DOOR_PLACEMENTS_FILE_OFFSET,
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:08x}"


def words(data: bytes, offset: int, count: int) -> tuple[int, ...]:
    end = offset + count * 4
    if offset < 0 or end > len(data):
        raise ValueError(f"word range 0x{offset:x}..0x{end:x} is invalid")
    return struct.unpack_from(f"<{count}I", data, offset)


def ram_index(address: int) -> int:
    if not 0x0C000000 <= address < 0x0D000000:
        raise ValueError(f"{hx(address)} is not in the 16 MiB RAM alias")
    return address - 0x0C000000


def find_module_base(mapinfo: bytes, ram: bytes) -> int:
    # The SCN3 payload begins at MAPINFO + 8 and is copied without relocation.
    needle = mapinfo[SCN3_FILE_OFFSET:SCN3_FILE_OFFSET + 0x100]
    hits = []
    cursor = 0
    while True:
        found = ram.find(needle, cursor)
        if found < 0:
            break
        hits.append(found - SCN3_FILE_OFFSET)
        cursor = found + 1
    if len(hits) != 1:
        raise ValueError(f"expected one loaded JOMO module, found {len(hits)}")
    return 0x0C000000 + hits[0]


def find_script_context(ram: bytes, module_base: int) -> int:
    expected = {
        field: module_base + file_offset
        for field, file_offset in SCRIPT_CONTEXT_POINTER_OFFSETS.items()
    }
    first = struct.pack("<I", expected[0xC0])
    contexts = []
    cursor = 0
    while True:
        found = ram.find(first, cursor)
        if found < 0:
            break
        candidate_index = found - 0xC0
        if candidate_index >= 0 and all(
            words(ram, candidate_index + field, 1)[0] == value
            for field, value in expected.items()
        ) and words(ram, candidate_index + 0x1A8, 10) == tuple(
            0x30726F64 + index * 0x01000000
            for index in range(10)
        ):
            contexts.append(0x0C000000 + candidate_index)
        cursor = found + 1
    if len(contexts) != 1:
        raise ValueError(
            f"expected one installed JOMO script context, found {len(contexts)}"
        )
    return contexts[0]


def validate_static_routes(mapinfo: bytes) -> dict[str, Any]:
    ats1 = words(mapinfo, ATS1_RECORD_FILE_OFFSET, 8)
    if ats1[0] != ATS1_TAG or ats1[6] != ATS1_ACTION_ID:
        raise ValueError("ATS1 shared-object record changed")
    group = words(mapinfo, GROUP_ZERO_FILE_OFFSET, 24)
    if group[0] != 0xFFFFFFFF or group[1:5] != (
        0x000B05A9,
        0,
        0x000A05A9,
        0x006405A9,
    ):
        raise ValueError("JOMO shared-object group zero callbacks changed")
    if ATS1_TAG not in group[5:]:
        raise ValueError("ATS1 is no longer in shared-object group zero")

    expected_instructions = {
        0x12794: bytes.fromhex("0ed09e07"),
        0x128E0: bytes.fromhex("0ed09e07"),
        0x12808: bytes.fromhex("6ce58a508d540b40"),
        0x12954: bytes.fromhex("6ce58a508d540b40"),
    }
    for offset, expected in expected_instructions.items():
        if mapinfo[offset:offset + len(expected)] != expected:
            raise ValueError(f"selector-11 evidence changed at 0x{offset:x}")

    return {
        "objectTag": "ATS1",
        "objectRecordFileOffset": f"0x{ATS1_RECORD_FILE_OFFSET:x}",
        "logicalActionId": ATS1_ACTION_ID,
        "sharedObjectGroup": 0,
        "groupFileOffset": f"0x{GROUP_ZERO_FILE_OFFSET:x}",
        "groupCallbackTokens": [
            {
                "rawHex": "0x000b05a9",
                "selector": 11,
                "functionFileOffset": f"0x{SELECTOR_11_FUNCTION:x}",
            },
            {"rawHex": "0x00000000", "selector": 0},
            {
                "rawHex": "0x000a05a9",
                "selector": 10,
                "functionFileOffset": "0x11ce0",
            },
            {
                "rawHex": "0x006405a9",
                "selector": 100,
                "functionFileOffset": "0x58464",
            },
        ],
        "runtimeTaskAddress": hx(ATS1_TASK_ADDRESS),
        "model": "S1_JOMO_TANM4W3G.MT5",
    }


def inspect_frame(
    mapinfo: bytes,
    ram: bytes,
    frame: int,
    source_name: str,
) -> dict[str, Any]:
    expected_hash = EXPECTED_RAM_SHA256[frame]
    if sha256(ram) != expected_hash:
        raise ValueError(f"unexpected RAM SHA-256 for frame {frame}")
    module_base = find_module_base(mapinfo, ram)
    context = find_script_context(ram, module_base)
    record_base = module_base + LOGICAL_RECORDS_FILE_OFFSET

    logical_records = []
    for index in range(LOGICAL_RECORD_COUNT):
        address = record_base + index * LOGICAL_RECORD_WORDS * 4
        record = words(ram, ram_index(address), LOGICAL_RECORD_WORDS)
        sound_words = [record[word] for word in SOUND_WORD_INDICES]
        logical_records.append({
            "recordIndex": index,
            "runtimeAddress": hx(address),
            "logicalActionId": (
                None if record[0] == 0xFFFFFFFF else record[0]
            ),
            "soundWords": [hx(value) for value in sound_words],
        })
    non_sentinel = [
        record for record in logical_records
        if any(value != "0xffffffff" for value in record["soundWords"])
    ]
    if non_sentinel:
        raise ValueError(f"frame {frame} has populated logical sound words")

    task = words(ram, ram_index(ATS1_TASK_ADDRESS), 0x170 // 4)
    if task[0x168 // 4] != ATS1_TAG:
        raise ValueError(f"frame {frame} ATS1 TASK identity changed")

    context_pointers = {
        f"+0x{field:x}": hx(
            words(ram, ram_index(context + field), 1)[0]
        )
        for field in SCRIPT_CONTEXT_POINTER_OFFSETS
    }
    return {
        "frameCount": frame,
        "source": source_name,
        "ramSha256": expected_hash,
        "moduleRuntimeBase": hx(module_base),
        "scriptContextRuntimeAddress": hx(context),
        "installedContextPointers": context_pointers,
        "ats1TaskTag": struct.pack(
            "<I", task[0x168 // 4]
        ).decode("ascii"),
        "logicalRecords": logical_records,
        "nonSentinelLogicalSoundRecordCount": len(non_sentinel),
    }


def build_evidence(
    mapinfo: bytes,
    ram_frames: list[tuple[int, bytes, str]],
    mapinfo_source: str,
) -> dict[str, Any]:
    if sha256(mapinfo) != EXPECTED_MAPINFO_SHA256:
        raise ValueError("unexpected JOMO MAPINFO.BIN SHA-256")
    if mapinfo[SCN3_FILE_OFFSET:SCN3_FILE_OFFSET + 4] != b"SCN3":
        raise ValueError("JOMO SCN3 signature moved")
    if [frame for frame, _, _ in ram_frames] != sorted(EXPECTED_RAM_SHA256):
        raise ValueError("all three pinned RAM frames are required")

    registration = validate_static_routes(mapinfo)
    captures = [
        inspect_frame(mapinfo, ram, frame, source)
        for frame, ram, source in ram_frames
    ]
    return {
        "schema": "new-yokosuka-jomo-drawer-audio-scope-v1",
        "generatedBy": "tools/audio/extract_jomo_drawer_audio_scope.py",
        "source": {
            "mapinfo": mapinfo_source,
            "mapinfoSha256": EXPECTED_MAPINFO_SHA256,
            "captureSchema": "flycast-pvr-frame-v2",
            "capturedObjectRecording": (
                "captures/objects/drawer-open-1784865219.csv"
            ),
        },
        "drawerRegistration": registration,
        "selector11SoundRoute": {
            "functionFileOffset": f"0x{SELECTOR_11_FUNCTION:x}",
            "logicalRecordWord": 9,
            "sentinel": "0xffffffff",
            "readAndCallSites": [
                {
                    "readFileOffset": f"0x{read:x}",
                    "callFileOffset": f"0x{call:x}",
                    "operationId": "0x006c",
                }
                for read, call in zip(
                    SELECTOR_11_SOUND_READS,
                    SELECTOR_11_SOUND_CALLS,
                )
            ],
            "condition": (
                "operation 0x006c is reached only when the fetched word is "
                "not 0xffffffff"
            ),
        },
        "captures": captures,
        "summary": {
            "captureCount": len(captures),
            "logicalRecordCountPerCapture": LOGICAL_RECORD_COUNT,
            "logicalSoundWordCountPerRecord": len(SOUND_WORD_INDICES),
            "inspectedLogicalSoundWordCount": (
                len(captures)
                * LOGICAL_RECORD_COUNT
                * len(SOUND_WORD_INDICES)
            ),
            "nonSentinelLogicalSoundWordCount": 0,
            "runtimePolicy": "logical-record-path-empty",
        },
        "semanticBoundary": {
            "proven": [
                (
                    "ATS1 is the captured top wardrobe drawer and is a "
                    "member of shared-object group zero."
                ),
                (
                    "Group zero contains selector 11, whose exact generated "
                    "sound path reads logical-record word 9 before operation "
                    "0x006c."
                ),
                (
                    "All 18 installed logical records retain 0xffffffff in "
                    "words 9..12 in each of three native RAM checkpoints."
                ),
            ],
            "rejected": [
                (
                    "Fixed AB05 calls in nearby STAN or scheduled-actor "
                    "functions are not promoted to drawer sounds."
                ),
                (
                    "The JOMO door model/audio pairs are not reused for "
                    "drawers without an exact native dataflow edge."
                ),
            ],
            "unresolved": [
                (
                    "This proves only that selector 11's logical-record "
                    "word-9 route is empty in the pinned captures. It does "
                    "not classify the raw group phase words after they reach "
                    "the shared typed-command dispatcher."
                ),
                (
                    "The independent object-phase evidence now resolves the "
                    "group-zero phase words as F1OMOYAA A905 commands; exact "
                    "opening/closing phase labels remain a separate boundary."
                ),
            ],
        },
    }


def default_mapinfo() -> Path:
    repo = Path(__file__).resolve().parents[2]
    candidates = [
        repo / "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
        repo.parent / "new-yokosuka/extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
        repo / ".disc-work/mapinfo/disc1/SCENE/01/JOMO/MAPINFO.BIN",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def default_capture_root() -> Path:
    repo = Path(__file__).resolve().parents[2]
    candidates = [
        repo / "captures/pvr",
        repo.parent / "new-yokosuka/captures/pvr",
    ]
    required = [
        Path(f"20260723-205340-frame-{frame}/ram.bin")
        for frame in sorted(EXPECTED_RAM_SHA256)
    ]
    return next(
        (
            path for path in candidates
            if all((path / relative).is_file() for relative in required)
        ),
        candidates[0],
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mapinfo", nargs="?", type=Path, default=default_mapinfo())
    parser.add_argument(
        "--capture-root",
        type=Path,
        default=default_capture_root(),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/jomo-drawer-audio-scope.json"),
    )
    args = parser.parse_args()

    frames = []
    for frame in sorted(EXPECTED_RAM_SHA256):
        relative = Path(f"20260723-205340-frame-{frame}/ram.bin")
        path = args.capture_root / relative
        frames.append((frame, path.read_bytes(), f"captures/pvr/{relative}"))
    evidence = build_evidence(
        args.mapinfo.read_bytes(),
        frames,
        "SCENE/01/JOMO/MAPINFO.BIN",
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{evidence['summary']['inspectedLogicalSoundWordCount']} live "
        "logical sound words inspected; none populated"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
