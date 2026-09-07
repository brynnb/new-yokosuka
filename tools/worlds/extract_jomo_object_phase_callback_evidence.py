#!/usr/bin/env python3
"""Recover JOMO's object-action phase sound boundary from retail bytes.

Operation 0x0139 mode 21 does not itself play a sound.  It forwards two
32-bit values to the object-action engine, which stores them as one-shot
phase commands.  The selector-10/11 per-frame manager later submits each
nonzero value to the shared native typed-command dispatcher and clears it.

The same four bytes can be read as an SCN3 opcode/selector pair or as a DTPK
command.  At this boundary the destination is decisive: the native dispatcher
routes low byte 0xA9 to the sound-command queue.  JOMO's group-zero and
group-one values are playable A905 commands in its exact F1OMOYAA location
bank.  This extractor pins that route, the bank, and every playback/sample
join so the result remains reproducible without an emulator or Ghidra.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import struct
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
JOMO_SHA256 = (
    "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
)
LOCATION_BANK_SHA256 = (
    "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb"
)
DRAWER_PHASE_TRACE_SHA256 = (
    "df6f64a19956647a7a803f73e4de2e24c8bec96fc59dca793e68997b314cf9c7"
)
ARCHIVED_STATE_SHA256 = (
    "847992cb6b6f4dd3a19673d13520e9587c7750ef70c7e6e39d9f82cd80ac66a7"
)

OPERATION_0139_HANDLER = 0x0C165544
OPERATION_0139_MODE_TABLE = 0x0C165578
OPERATION_0139_DISPATCH_BASE = 0x0C165572
MODE_21_ENTRY = 0x0C16566E
MODE_21_FORWARD = 0x0C165670
PHASE_LINK = 0x0C0CCB14
PHASE_ONE_SLOT = 0x0C2164E8
PHASE_TWO_SLOT = 0x0C2164EC
TYPED_COMMAND_DISPATCHER = 0x0C17A91C
SELECTOR_10_11_MANAGER = (0x0C0CB3B8, 0x0C0CB884)

JOMO_COROUTINE_RANGE = (0x81720, 0x81780)
JOMO_MODE_21_CALL = 0x8174A
JOMO_GROUPS = (
    (0, 0x9B700, 0x9B780),
    (1, 0x9B780, 0x9B800),
)
CALLBACK_TOKEN = 0x000B05A9
SOUND_QUEUE = 0x0C1D4B18

WINDOWS = {
    "operation0139": (
        0x0C165544,
        0x0C165690,
        "14ce3eaf4dbed8ee8fa93b4a4b386b32804e831b4821303cadea70677cb18884",
    ),
    "phaseLink": (
        0x0C0CCB14,
        0x0C0CCB28,
        "49161b2c239f5d5548cd3da0fad112273556b41a5a0a9e19f142f66a085132c1",
    ),
    "selector10And11Manager": (
        0x0C0CB3B8,
        0x0C0CB884,
        "c0f65a84fd930f4b93f302017cda9858b4db3a106fcec712164dd81671071bc3",
    ),
    "typedCommandDispatcherSample": (
        0x0C17A91C,
        0x0C17A9F0,
        "1ac3cdcc487ca9bb3ed1bd10e967b90f2be4ca2792258dbe74ac05ff6cbc5d7f",
    ),
}

JOMO_WINDOWS = {
    "groupCoroutine": (
        0x81720,
        0x81780,
        "a138e963dcbf855ff1a73d92298af49f83e96afc733ee501c11fb9bb6243f4f9",
    ),
    "group0": (
        0x9B700,
        0x9B780,
        "dc56689a1f4a0bc497fc0f04e91c4874066da4095f9c9a9c47a2f56a2fe698bb",
    ),
    "group1Prefix": (
        0x9B780,
        0x9B7C0,
        "2746d63c5bd3e08dc9ef24b8feb2b1661cda107582e188688d79f60bbac55209",
    ),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:08x}"


def executable_slice(data: bytes, start: int, end: int) -> bytes:
    first = start - RUNTIME_BASE
    last = end - RUNTIME_BASE
    if first < 0 or last > len(data) or end <= start:
        raise ValueError(f"invalid executable range {hx(start)}..{hx(end)}")
    return data[first:last]


def u16_runtime(data: bytes, address: int) -> int:
    return struct.unpack("<H", executable_slice(data, address, address + 2))[0]


def i16_runtime(data: bytes, address: int) -> int:
    return struct.unpack("<h", executable_slice(data, address, address + 2))[0]


def u32_runtime(data: bytes, address: int) -> int:
    return struct.unpack("<I", executable_slice(data, address, address + 4))[0]


def u32_file(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def u16_file(data: bytes, offset: int) -> int:
    return struct.unpack_from("<H", data, offset)[0]


def u16_be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">H", data, offset)[0]


def translate_dtpk_rate(rate: int) -> int | None:
    pairs = (
        (4000, 0xD61D), (6000, 0xDD1E), (6500, 0xDE36),
        (7000, 0xE008), (8000, 0xE21D), (8012, 0xE21E),
        (8500, 0xE320), (9000, 0xE41F), (9500, 0xE51C),
        (10500, 0xE70A), (11025, 0xE800), (12000, 0xE91E),
        (12500, 0xEA0B), (13000, 0xEA36), (14000, 0xEC08),
        (15000, 0xED15), (16000, 0xEE1D), (17000, 0xEF20),
        (18000, 0xF01F), (19000, 0xF11C), (20000, 0xF214),
        (21000, 0xF30A), (22050, 0xF400), (23000, 0xF42F),
        (24000, 0xF4F6), (25000, 0xF600), (26000, 0xF71D),
        (28000, 0xF800), (30000, 0xF900), (32000, 0xFA13),
        (34000, 0xFB00), (35000, 0xFC1D), (38000, 0xFD15),
        (40000, 0xFE1D), (42000, 0xFF00),
    )
    for sample_rate, dtpk_rate in pairs:
        if rate == dtpk_rate or rate < dtpk_rate + 0x20:
            return sample_rate
    return None


def parse_location_sfx(bank: bytes) -> dict[str, dict[str, Any]]:
    if bank[:4] != b"DTPK" or u32_file(bank, 8) != len(bank):
        raise ValueError("unexpected F1OMOYAA DTPK header")
    sequence_offset = u32_file(bank, 0x2C)
    playback_offset = u32_file(bank, 0x30)
    samples_offset = u32_file(bank, 0x3C)
    group_count = u32_file(bank, sequence_offset) + 1
    descriptors = [
        u32_file(bank, sequence_offset + 4 + index * 4)
        for index in range(group_count)
    ]
    playback_count = u16_file(bank, playback_offset + 0x10) + 1
    sample_count = u32_file(bank, samples_offset) + 1
    result: dict[str, dict[str, Any]] = {}

    for group_index, descriptor_word in enumerate(descriptors):
        descriptor = descriptor_word >> 16
        if descriptor not in (0xA905, 0xAB02):
            continue
        group_relative = descriptor_word & 0xFFFF
        next_relative = (
            descriptors[group_index + 1] & 0xFFFF
            if group_index + 1 < len(descriptors)
            else playback_offset - sequence_offset
        )
        group_offset = sequence_offset + group_relative
        track_count = u32_file(bank, group_offset) + 1
        track_offsets = [
            u32_file(bank, group_offset + 4 + track * 4)
            for track in range(track_count)
        ]
        for track, relative in enumerate(track_offsets):
            start = sequence_offset + relative
            end = (
                sequence_offset + track_offsets[track + 1]
                if track + 1 < track_count
                else sequence_offset + next_relative
            )
            while end > start and bank[end - 1] == 0:
                end -= 1
            composition = bank[start:end]
            if not composition:
                continue
            cursor = 1
            if cursor < len(composition) and composition[cursor] <= 0x7F:
                cursor += 2
            entries = []
            while (
                cursor + 2 < len(composition)
                and composition[cursor] in (0xDC, 0xDD, 0xDE, 0xDF)
            ):
                entry_type = composition[cursor]
                playback_id = composition[cursor + 1]
                volume = composition[cursor + 2]
                cursor += 3
                while (
                    cursor < len(composition)
                    and composition[cursor] != 0xFF
                    and composition[cursor] not in (0xDC, 0xDD, 0xDE, 0xDF)
                    and composition[cursor] != 0xA0
                ):
                    cursor += 1
                if playback_id >= playback_count:
                    raise ValueError("F1OMOYAA playback ID exceeds table")
                playback = playback_offset + 0x50 + playback_id * 0x40
                sample_id = bank[playback + 2]
                if sample_id >= sample_count:
                    raise ValueError("F1OMOYAA sample ID exceeds table")
                definition = samples_offset + 4 + sample_id * 0x10
                location_and_format = u32_file(bank, definition)
                sample_offset = location_and_format & 0x007FFFFF
                sample_length = u32_file(bank, definition + 12)
                channels = 2 if u32_file(bank, definition + 8) == 0x80 else 1
                sample_bytes = sample_length * channels
                entries.append({
                    "entryType": f"0x{entry_type:02x}",
                    "playbackId": playback_id,
                    "volume": volume,
                    "sampleId": sample_id,
                    "sampleOffset": f"0x{sample_offset:x}",
                    "sampleBytes": sample_bytes,
                    "sampleSha256": digest(
                        bank[sample_offset:sample_offset + sample_bytes]
                    ),
                    "dtpkRate": f"0x{u16_be(bank, playback + 10):04x}",
                    "sampleRate": translate_dtpk_rate(
                        u16_be(bank, playback + 10)
                    ),
                })
            if entries and cursor < len(composition) and composition[cursor] == 0xFF:
                command = bytes((
                    descriptor >> 8,
                    descriptor & 0xFF,
                    track,
                    0,
                )).hex()
                result[command] = {
                    "descriptor": f"{descriptor:04x}",
                    "track": track,
                    "compositionOffset": f"0x{start:x}",
                    "compositionHex": composition.hex(),
                    "entries": entries,
                }
    return result


def assert_bytes(
    data: bytes,
    start: int,
    expected_hex: str,
    *,
    runtime: bool = True,
) -> None:
    expected = bytes.fromhex(expected_hex)
    actual = (
        executable_slice(data, start, start + len(expected))
        if runtime
        else data[start:start + len(expected)]
    )
    if actual != expected:
        kind = "runtime address" if runtime else "file offset"
        raise ValueError(f"evidence changed at {kind} {hx(start)}")


def validate_windows(
    data: bytes,
    windows: dict[str, tuple[int, int, str]],
    *,
    runtime: bool,
) -> list[dict[str, str]]:
    result = []
    for name, (start, end, expected) in windows.items():
        sample = (
            executable_slice(data, start, end)
            if runtime
            else data[start:end]
        )
        actual = digest(sample)
        if actual != expected:
            raise ValueError(f"{name} SHA-256 changed: {actual}")
        result.append({
            "name": name,
            "start": hx(start),
            "endExclusive": hx(end),
            "sha256": actual,
        })
    return result


def decode_token(
    value: int,
    location_commands: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    raw = struct.pack("<I", value)
    command_hex = raw.hex()
    resolved = location_commands.get(command_hex)
    return {
        "word": hx(value),
        "littleEndianBytes": command_hex,
        "opcode": f"0x{value & 0xffff:04x}",
        "selector": (value >> 16) & 0xffff,
        "classification": (
            "empty"
            if value == 0
            else "location-bank-sfx-command"
            if resolved is not None
            else "other-native-command"
        ),
        "locationBankResolution": resolved,
    }


def validate_operation_handler(executable: bytes) -> dict[str, Any]:
    relative = i16_runtime(executable, OPERATION_0139_MODE_TABLE + 21 * 2)
    entry = OPERATION_0139_DISPATCH_BASE + relative
    if relative != 0xFC or entry != MODE_21_ENTRY:
        raise ValueError("operation 0x0139 mode-21 jump-table entry changed")

    # mov.l literal,r2; mov.l @r12,r5; jsr @r2; mov.l @r14,r4
    assert_bytes(executable, MODE_21_FORWARD, "3ad2c2650b42e264")
    if u32_runtime(executable, 0x0C16575C) != PHASE_LINK:
        raise ValueError("operation 0x0139 mode 21 no longer calls phase link")

    # Load slot one, store r4; load slot two; rts; store r5 in delay slot.
    assert_bytes(executable, PHASE_LINK, "34d3422334d20b005222")
    if u32_runtime(executable, 0x0C0CCBE8) != PHASE_ONE_SLOT:
        raise ValueError("phase-one slot literal changed")
    if u32_runtime(executable, 0x0C0CCBEC) != PHASE_TWO_SLOT:
        raise ValueError("phase-two slot literal changed")

    return {
        "operationId": "0x0139",
        "mode": 21,
        "handlerAddress": hx(OPERATION_0139_HANDLER),
        "modeTableAddress": hx(OPERATION_0139_MODE_TABLE),
        "modeTableRelativeValue": "0x00fc",
        "modeEntryAddress": hx(entry),
        "forwardCallAddress": hx(MODE_21_FORWARD + 4),
        "forwardTargetAddress": hx(PHASE_LINK),
        "arguments": [
            {
                "descriptorIndex": 1,
                "sourceRegister": "r14",
                "destinationRegister": "r4",
                "storedAt": hx(PHASE_ONE_SLOT),
            },
            {
                "descriptorIndex": 2,
                "sourceRegister": "r12",
                "destinationRegister": "r5",
                "storedAt": hx(PHASE_TWO_SLOT),
            },
        ],
        "behavior": (
            "Stores the two descriptor values unchanged in the engine's "
            "one-shot object-action phase slots."
        ),
    }


def validate_phase_sites(executable: bytes) -> list[dict[str, Any]]:
    sites = [
        (0x0C0CB4FE, PHASE_ONE_SLOT, 0x0C0CB506, 0x0C0CB514),
        (0x0C0CB566, PHASE_TWO_SLOT, 0x0C0CB56E, 0x0C0CB57C),
        (0x0C0CB770, PHASE_ONE_SLOT, 0x0C0CB778, 0x0C0CB784),
        (0x0C0CB7FE, PHASE_TWO_SLOT, 0x0C0CB806, 0x0C0CB812),
    ]
    expected_blocks = {
        0x0C0CB4FE: "13d332611821078912d200e663650b4232640e",
        0x0C0CB566: "41d332611821078940d200e663650b4232643c",
        0x0C0CB770: "1bd11264482406891ad200e60b42636517d200e33222",
        0x0C0CB7FE: "3bd11264482406893ad200e60b42636537d200e33222",
    }
    result = []
    for check, slot, call, clear in sites:
        assert_bytes(executable, check, expected_blocks[check])
        dispatcher_literal = (
            0x0C0CB550
            if call == 0x0C0CB506
            else 0x0C0CB670
            if call == 0x0C0CB56E
            else 0x0C0CB7E4
            if call == 0x0C0CB778
            else 0x0C0CB8F0
        )
        if u32_runtime(executable, dispatcher_literal) != TYPED_COMMAND_DISPATCHER:
            raise ValueError(f"dispatcher target changed at {hx(call)}")
        result.append({
            "slotAddress": hx(slot),
            "nonzeroCheckAddress": hx(check),
            "dispatcherCallAddress": hx(call),
            "dispatcherAddress": hx(TYPED_COMMAND_DISPATCHER),
            "clearAddress": hx(clear),
            "semantics": "dispatch once when nonzero, then clear to zero",
        })
    return result


def validate_sound_dispatch(executable: bytes) -> dict[str, Any]:
    # The command's first byte is the low byte of r4. Values >= 0xA8 branch
    # to the queue target loaded at 0x0c17aa20; A905 therefore takes this
    # path. This is a different interpretation boundary from SCN3 bytecode.
    assert_bytes(
        executable,
        0x0C17A94E,
        (
            "5491ec6412344289519002340889592cd364c366f66c2bd2e365f66d2b42"
            "f66e0fe2263d39894391e36000e51030088d53643e91103006893c911030"
            "058905a0090003a001e401a002e403e448240e891ed3d36008400c334c33"
            "3062c03206891ad3d36008400c333c34c02453644824138b15d1d3600840"
            "1c0001880d8bc366f66cd36412d2f66de3652b42f66ef66ce3640fd3f66d"
            "2b43f66e"
        ),
    )
    if u32_runtime(executable, 0x0C17AA20) != SOUND_QUEUE:
        raise ValueError("A8+ sound-queue target changed")
    return {
        "commandByteRegister": "r4",
        "commandTypeByte": "low byte",
        "a8OrHigherBranchAddress": hx(0x0C17A954),
        "queueJumpAddress": hx(0x0C17A9E4),
        "queueAddress": hx(SOUND_QUEUE),
        "jomoA905TakesSoundQueue": True,
    }


def validate_jomo(
    mapinfo: bytes,
    operation_trace: dict[str, Any],
    location_commands: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    # The generic coroutine pushes mode 21 and the values from context +0x3c
    # and +0x38 into operation 0x0139 at file call site 0x8174a.
    assert_bytes(
        mapinfo,
        0x81738,
        "ee54ef5515e6462d562d662d14d58a508d540b40",
        runtime=False,
    )
    call = next(
        (
            entry for entry in operation_trace["objectActionCalls"]
            if int(entry["callFileOffset"], 16) == JOMO_MODE_21_CALL
        ),
        None,
    )
    if call is None or [arg.get("value") for arg in call["arguments"]] != [
        21,
        None,
        None,
    ]:
        raise ValueError("JOMO generic mode-21 operation evidence changed")
    if [arg["source"] for arg in call["arguments"][1:]] != [
        "@(60,r14) at 0x8173a",
        "@(56,r14) at 0x81738",
    ]:
        raise ValueError("JOMO mode-21 context inputs changed")

    groups = []
    for index, start, end in JOMO_GROUPS:
        if u32_file(mapinfo, start) != 0xFFFFFFFF:
            raise ValueError(f"JOMO group {index} marker changed")
        tokens = [u32_file(mapinfo, start + 4 + offset * 4) for offset in range(4)]
        if tokens[0] != CALLBACK_TOKEN:
            raise ValueError(f"JOMO group {index} primary callback changed")
        tags = []
        cursor = start + 20
        while cursor + 4 <= end:
            value = u32_file(mapinfo, cursor)
            if value in (0, 0xFFFFFFFF):
                break
            raw = mapinfo[cursor:cursor + 4]
            if not all(0x20 <= byte < 0x7F for byte in raw):
                break
            tags.append(raw.decode("ascii"))
            cursor += 4
        groups.append({
            "index": index,
            "fileOffset": f"0x{start:x}",
            "phaseTokens": [
                decode_token(value, location_commands)
                for value in tokens
            ],
            "objectTags": tags,
            "containsDrawerATS1": "ATS1" in tags,
        })
    if not groups[0]["containsDrawerATS1"]:
        raise ValueError("ATS1 no longer belongs to JOMO group zero")
    return {
        "genericCoroutine": {
            "range": [
                f"0x{JOMO_COROUTINE_RANGE[0]:x}",
                f"0x{JOMO_COROUTINE_RANGE[1]:x}",
            ],
            "operationCallFileOffset": f"0x{JOMO_MODE_21_CALL:x}",
            "mode": 21,
            "descriptorInputs": [
                {"contextOffset": "0x3c", "operationArgumentIndex": 1},
                {"contextOffset": "0x38", "operationArgumentIndex": 2},
            ],
        },
        "groups": groups,
    }


def validate_drawer_phase_trace(
    capture: bytes,
    location_commands: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if digest(capture) != DRAWER_PHASE_TRACE_SHA256:
        raise ValueError("JOMO ATS1 drawer phase trace SHA-256 changed")
    rows = list(csv.DictReader(io.StringIO(capture.decode("ascii"))))
    expected = [
        (
            "openingStart",
            "closed",
            165949853736,
            "0c0cb176",
            0x000B05A9,
        ),
        (
            "closingStart",
            "open",
            167748160768,
            "0c0cb2a2",
            0x000A05A9,
        ),
        (
            "closingImpact",
            "closing",
            167998610128,
            "0c0cb2e6",
            0x006405A9,
        ),
    ]
    if len(rows) != len(expected):
        raise ValueError("JOMO ATS1 drawer phase trace row count changed")
    events = []
    for row, (
        phase,
        visual_state,
        cycles,
        return_address,
        word,
    ) in zip(rows, expected, strict=True):
        command_hex = struct.pack("<I", word).hex()
        resolution = location_commands.get(command_hex)
        if (
            row["phase"] != phase
            or row["visualStateBefore"] != visual_state
            or int(row["cycles"]) != cycles
            or row["pc"] != f"{TYPED_COMMAND_DISPATCHER:08x}"
            or row["pr"] != return_address
            or int(row["r4"], 16) != word
            or resolution is None
        ):
            raise ValueError(f"JOMO ATS1 {phase} phase trace changed")
        events.append({
            "phase": phase,
            "visualStateBefore": visual_state,
            "emulatedCycles": cycles,
            "dispatcherAddress": hx(TYPED_COMMAND_DISPATCHER),
            "returnAddress": f"0x{return_address}",
            "r4Word": hx(word),
            "commandHex": command_hex,
            "playbackId": resolution["entries"][0]["playbackId"],
            "sampleId": resolution["entries"][0]["sampleId"],
        })
    return {
        "capture": (
            "tools/evidence/jomo-ats1-drawer-phase-dispatch.csv"
        ),
        "captureSha256": DRAWER_PHASE_TRACE_SHA256,
        "archivedStateSha256": ARCHIVED_STATE_SHA256,
        "target": {
            "area": "JOMO",
            "objectTag": "ATS1",
            "initialState": "closed",
        },
        "protocol": [
            (
                "Load the archived Hazuki wardrobe state with the retail "
                "Disc 1 data."
            ),
            (
                "Hold Dreamcast left trigger and positive analog X to focus "
                "the closed upper ATS drawer, then press A to open it."
            ),
            (
                "After the drawer visibly reaches its open state, press B "
                "to close it."
            ),
            (
                "Trace entries to 0x0c17a91c in SH-4 interpreter mode and "
                "label rows against the synchronized closed, open, and "
                "closing visual states."
            ),
        ],
        "events": events,
        "conclusion": (
            "A905:11 is opening-start, A905:10 is closing-start, and "
            "A905:100 is the later closing-impact phase. The zero second "
            "opening token means there is no opening-completion command."
        ),
    }


def build_report(
    executable: bytes,
    mapinfo: bytes,
    location_bank: bytes,
    operation_trace: dict[str, Any],
    drawer_phase_trace: bytes,
) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN SHA-256")
    if digest(mapinfo) != JOMO_SHA256:
        raise ValueError("unexpected JOMO MAPINFO.BIN SHA-256")
    if digest(location_bank) != LOCATION_BANK_SHA256:
        raise ValueError("unexpected F1OMOYAA.SND SHA-256")
    executable_windows = validate_windows(executable, WINDOWS, runtime=True)
    jomo_windows = validate_windows(mapinfo, JOMO_WINDOWS, runtime=False)
    operation = validate_operation_handler(executable)
    phase_sites = validate_phase_sites(executable)
    sound_dispatch = validate_sound_dispatch(executable)
    location_commands = parse_location_sfx(location_bank)
    jomo = validate_jomo(mapinfo, operation_trace, location_commands)
    runtime_phase_trace = validate_drawer_phase_trace(
        drawer_phase_trace,
        location_commands,
    )

    return {
        "schema": "new-yokosuka-jomo-object-phase-callbacks-v3",
        "status": "exact-native-phase-sounds-runtime-labeled",
        "generatedBy": "tools/worlds/extract_jomo_object_phase_callback_evidence.py",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": hx(RUNTIME_BASE),
            "executableSha256": EXECUTABLE_SHA256,
            "jomoMapinfo": "SCENE/01/JOMO/MAPINFO.BIN",
            "jomoMapinfoSha256": JOMO_SHA256,
            "locationBank": "SCENE/01/SOUND/F1OMOYAA.SND",
            "locationBankSha256": LOCATION_BANK_SHA256,
            "operationTrace": "tools/evidence/jomo-object-operation-trace.json",
            "drawerPhaseTrace": runtime_phase_trace["capture"],
            "drawerPhaseTraceSha256": DRAWER_PHASE_TRACE_SHA256,
            "verifiedWindows": executable_windows + jomo_windows,
        },
        "operation0139Mode21": operation,
        "enginePhaseDispatch": {
            "selectorFamily": [10, 11],
            "managerRange": [
                hx(SELECTOR_10_11_MANAGER[0]),
                hx(SELECTOR_10_11_MANAGER[1]),
            ],
            "slots": [hx(PHASE_ONE_SLOT), hx(PHASE_TWO_SLOT)],
            "typedCommandDispatcherAddress": hx(TYPED_COMMAND_DISPATCHER),
            "soundCommandRoute": sound_dispatch,
            "sites": phase_sites,
        },
        "jomo": jomo,
        "runtimePhaseTrace": runtime_phase_trace,
        "audioBoundary": {
            "proven": [
                (
                    "Operation 0x0139 mode 21 stores two opaque 32-bit phase "
                    "values; it does not directly call the audio engine."
                ),
                (
                    "The selector-10/11 object manager dispatches each "
                    "nonzero value once through the shared native typed-"
                    "command dispatcher, then clears its slot."
                ),
                (
                    "JOMO groups zero and one use 0x000b05a9: opcode 0x05a9 "
                    "and selector 11 under the SCN3 interpretation, but bytes "
                    "A9 05 0B 00 at this dispatcher are the playable "
                    "F1OMOYAA A905:11 sound command."
                ),
                (
                    "ATS1 belongs to group zero. Its nonzero phase values "
                    "resolve exactly to A905:11, A905:10, and A905:100 in "
                    "JOMO's source-hashed location bank."
                ),
                (
                    "A synchronized retail interpreter trace identifies "
                    "A905:11 at opening start, A905:10 at closing start, and "
                    "A905:100 later at the closing impact."
                ),
            ],
            "consequence": (
                "The engine phase route is an authentic object-audio mapping. "
                "The earlier generated-room-callback classification confused "
                "SCN3's word interpretation with the typed dispatcher's "
                "low-byte command interpretation."
            ),
            "policy": "phase-labels-dynamically-proven",
            "unresolved": [],
        },
    }


def default_executable() -> Path:
    candidates = [
        PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN",
        PROJECT_ROOT.parent / "new-yokosuka/.disc-work/exact/1ST_READ.BIN",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def default_mapinfo() -> Path:
    candidates = [
        PROJECT_ROOT / "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
        PROJECT_ROOT.parent
        / "new-yokosuka/extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def default_location_bank() -> Path:
    candidates = [
        PROJECT_ROOT
        / "extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND",
        PROJECT_ROOT.parent
        / "new-yokosuka/extracted_files/data/SCENE/01/SOUND/F1OMOYAA.SND",
    ]
    return next((path for path in candidates if path.is_file()), candidates[0])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=default_executable())
    parser.add_argument("--mapinfo", type=Path, default=default_mapinfo())
    parser.add_argument(
        "--location-bank",
        type=Path,
        default=default_location_bank(),
    )
    parser.add_argument(
        "--operation-trace",
        type=Path,
        default=PROJECT_ROOT
        / "tools/evidence/jomo-object-operation-trace.json",
    )
    parser.add_argument(
        "--drawer-phase-trace",
        type=Path,
        default=PROJECT_ROOT
        / "tools/evidence/jomo-ats1-drawer-phase-dispatch.csv",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROJECT_ROOT
        / "tools/evidence/jomo-object-phase-callbacks.json",
    )
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.mapinfo.read_bytes(),
        args.location_bank.read_bytes(),
        json.loads(args.operation_trace.read_text()),
        args.drawer_phase_trace.read_bytes(),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {len(report['enginePhaseDispatch']['sites'])} "
        "one-shot phase-dispatch sites; JOMO A905 phases runtime-labeled"
    )


if __name__ == "__main__":
    main()
