#!/usr/bin/env python3
"""Extract JOMO's authored door-model audio phases and native dataflow.

The JOMO SCN3 static section contains four tables passed together to a shared
door-framework initializer:

* 18 thirteen-word logical interaction records;
* 18 two-word logical-record mappings;
* seven four-word model/audio rows;
* 18 nine-word placement rows.

The model/audio rows prove which two F1OMOYAA commands belong to each door
model.  Generated SH-4 consumers independently select table field 2 or 3
through the placement's model-row index.  Synchronized retail interpreter
traces prove that field 2 is submitted at opening start and field 3 at closing
start, closing the phase schema for every row without audition-based labels.
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


EXPECTED_MAPINFO_SHA256 = (
    "4af865fbb62a06e917d6625149f4bcf77fa6a6bba19b08b8433440f96712a2b9"
)
EXPECTED_LOCATION_BANK_SHA256 = (
    "41cdccd04ef8f4835a946f3f1ada404d4f1607adbae6c4bf8da5b825d23c9abb"
)
EXPECTED_PHASE_TRACE_SHA256 = (
    "995254a74123e9f6e37d2acef52d00b9646338c3dbc05a9b3aac09cf99eae036"
)
EXPECTED_PAIR_DATAFLOW_SHA256 = (
    "db6228a0e196c87d3c651aa730670118f9d8f3c7f38fdac8e319a28336f3395f"
)
ARCHIVED_STATE_SHA256 = (
    "847992cb6b6f4dd3a19673d13520e9587c7750ef70c7e6e39d9f82cd80ac66a7"
)
SCN3_FILE_OFFSET = 0x8
STATIC_DATA_FILE_OFFSET = 0x8FDA4
LOGICAL_RECORDS_OFFSET = 0x28BC
LOGICAL_MAPPING_OFFSET = 0x2C64
MODEL_AUDIO_ROWS_OFFSET = 0x2D34
PLACEMENTS_OFFSET = 0x2DA4
LOGICAL_RECORD_COUNT = 18
MODEL_AUDIO_ROW_COUNT = 7
PLACEMENT_COUNT = 18
LOGICAL_RECORD_WORDS = 13
PLACEMENT_WORDS = 9
NO_VALUE = 0xFFFFFFFF

# Exact generated SH-4 sites that establish how the tables are installed and
# consumed. Addresses are MAPINFO file offsets; runtime address = 0x0c3c5740
# + file offset for this JOMO SCN3 payload.
SHARED_INITIALIZER = 0x15AF0
MODEL_ACTION_LOOKUP = 0x16D82
MODEL_RESOURCE_LOOKUP = 0x17330
OPENING_COMMAND_READS = (
    0x5104,
    0x554C,
    0x7FB8,
    0x9E74,
    0xB4F4,
    0xE074,
    0x11694,
)
CLOSING_COMMAND_READS = (
    0x5AD2,
    0x8500,
    0xA11C,
    0xEDE8,
    0xFD08,
    0x11984,
)
SELECTOR_11_SOUND_READS = (0x12794, 0x128E0)
SELECTOR_11_SOUND_CALLS = (0x1280E, 0x1295A)
SELECTOR_12_SOUND_READS = (0x14694, 0x147D0)
SELECTOR_12_SOUND_CALLS = (0x143D6, 0x14716, 0x14852, 0x14C9E)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hex32(value: int) -> str:
    return f"0x{value & 0xFFFFFFFF:08x}"


def runtime_hex(file_offset: int) -> str:
    return f"0x{0x0C3C5740 + file_offset:08x}"


def command_hex(value: int) -> str:
    return value.to_bytes(4, "little").hex()


def read_c_string(data: bytes, offset: int) -> str:
    if not 0 <= offset < len(data):
        raise ValueError(f"string offset 0x{offset:x} lies outside MAPINFO")
    end = data.find(b"\0", offset)
    if end < 0:
        raise ValueError(f"string at 0x{offset:x} is not terminated")
    return data[offset:end].decode("ascii")


def words(data: bytes, offset: int, count: int) -> tuple[int, ...]:
    end = offset + count * 4
    if offset < 0 or end > len(data):
        raise ValueError(f"word range 0x{offset:x}..0x{end:x} is invalid")
    return struct.unpack_from(f"<{count}I", data, offset)


def fixed_turn_degrees(value: int) -> float:
    signed = value if value < 0x80000000 else value - 0x100000000
    return signed * 360.0 / 65536.0


def parse_model_audio_rows(
    data: bytes,
    static_base: int,
) -> list[dict[str, Any]]:
    rows = []
    base = static_base + MODEL_AUDIO_ROWS_OFFSET
    for index in range(MODEL_AUDIO_ROW_COUNT):
        offset = base + index * 16
        model_descriptor, action_type, first, second = words(data, offset, 4)
        # SCN3 strings use an eight-byte typed descriptor immediately before
        # the bytes. The descriptor pointer is what the generated 0x009a call
        # passes to the model-registration operation.
        model_code = read_c_string(data, model_descriptor + 8)
        if (
            len(model_code) != 8
            or not model_code.startswith("DR")
            or model_code[4] != "_"
        ):
            raise ValueError(f"model code {index} has an unexpected shape")
        commands = []
        for pair_index, value in enumerate((first, second)):
            if value == NO_VALUE or value & 0xFFFF != 0x02AB:
                raise ValueError(
                    f"row {index} command {pair_index} is not an AB02 command"
                )
            commands.append({
                "authoredPairIndex": pair_index,
                "word": hex32(value),
                "commandHex": command_hex(value),
                "group": "AB02",
                "track": value >> 16,
                "semanticRole": None,
            })
        rows.append({
            "rowIndex": index,
            "fileOffset": f"0x{offset:x}",
            "modelDescriptorFileOffset": f"0x{model_descriptor:x}",
            "modelCode": model_code,
            "model": f"S1_JOMO_{model_code}.MT5",
            "logicalActionType": action_type,
            "commands": commands,
        })
    return rows


def parse_logical_records(
    data: bytes,
    static_base: int,
) -> list[dict[str, Any]]:
    records = []
    base = static_base + LOGICAL_RECORDS_OFFSET
    for index in range(LOGICAL_RECORD_COUNT):
        offset = base + index * LOGICAL_RECORD_WORDS * 4
        record = words(data, offset, LOGICAL_RECORD_WORDS)
        records.append({
            "recordIndex": index,
            "fileOffset": f"0x{offset:x}",
            "logicalActionId": (
                None if record[0] == NO_VALUE else record[0]
            ),
            "packedObjectKeys": hex32(record[2]),
            "initialSoundWords": [hex32(value) for value in record[9:13]],
        })
    return records


def parse_logical_mapping(
    data: bytes,
    static_base: int,
) -> list[dict[str, Any]]:
    rows = []
    base = static_base + LOGICAL_MAPPING_OFFSET
    for index in range(LOGICAL_RECORD_COUNT):
        offset = base + index * 8
        mapped_record, sentinel = words(data, offset, 2)
        if sentinel != NO_VALUE:
            raise ValueError(f"logical mapping {index} lost its sentinel")
        rows.append({
            "mappingIndex": index,
            "fileOffset": f"0x{offset:x}",
            "mappedRecordIndex": mapped_record,
        })
    return rows


def parse_placements(
    data: bytes,
    static_base: int,
    model_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    placements = []
    base = static_base + PLACEMENTS_OFFSET
    for index in range(PLACEMENT_COUNT):
        offset = base + index * PLACEMENT_WORDS * 4
        record_type, model_index = words(data, offset, 2)
        scale = struct.unpack_from("<3f", data, offset + 8)
        position = struct.unpack_from("<3f", data, offset + 20)
        fixed_turn_y = words(data, offset + 32, 1)[0]
        if model_index >= len(model_rows):
            raise ValueError(
                f"placement {index} model row {model_index} is invalid"
            )
        placements.append({
            "placementIndex": index,
            "fileOffset": f"0x{offset:x}",
            "recordType": record_type,
            "modelAudioRowIndex": model_index,
            "modelCode": model_rows[model_index]["modelCode"],
            "scale": list(scale),
            "position": list(position),
            "fixedTurnY": hex32(fixed_turn_y),
            "rotationYDegrees": fixed_turn_degrees(fixed_turn_y),
        })
    return placements


def validate_instruction_bytes(data: bytes) -> None:
    expected = {
        # mov.l literal(c8),r0; mov.l @(r0,r9),r6
        MODEL_ACTION_LOOKUP: bytes.fromhex("18d09e06"),
        # mov.l literal(c8),r0; mov.l @(r0,r9),r6
        MODEL_RESOURCE_LOOKUP: bytes.fromhex("19d09e06"),
    }
    for offset, byte_string in expected.items():
        if data[offset:offset + len(byte_string)] != byte_string:
            raise ValueError(f"SH-4 evidence changed at 0x{offset:x}")
    logical_reads = {
        **{
            offset: bytes.fromhex("0ed09e07")
            for offset in SELECTOR_11_SOUND_READS
        },
        **{
            offset: bytes.fromhex("0fd09e07")
            for offset in SELECTOR_12_SOUND_READS
        },
    }
    for offset, byte_string in logical_reads.items():
        # Every retained site loads the c0 pointer through r9 immediately
        # before operation 0x009a reads logical-record word 9.
        if data[offset:offset + len(byte_string)] != byte_string:
            raise ValueError(f"logical sound read changed at 0x{offset:x}")
    for pair_index, offsets in (
        (0, OPENING_COMMAND_READS),
        (1, CLOSING_COMMAND_READS),
    ):
        table_word = pair_index + 2
        index_template = (
            bytes.fromhex("04e557041a04")
            + bytes((table_word, 0xE5))
            + bytes.fromhex("5c3404e5")
        )
        for offset in offsets:
            if (
                data[offset - len(index_template):offset] != index_template
                or data[offset + 2:offset + 4] != bytes.fromhex("9e06")
            ):
                raise ValueError(
                    f"model/audio member {pair_index} read changed "
                    f"at 0x{offset:x}"
                )
            literal_load = struct.unpack_from("<H", data, offset)[0]
            if literal_load >> 12 != 0xD or (literal_load >> 8) & 0xF:
                raise ValueError(
                    f"model/audio table load changed at 0x{offset:x}"
                )
            runtime_pc = 0x0C3C5740 + offset
            literal_runtime = (
                ((runtime_pc + 4) & ~3)
                + (literal_load & 0xFF) * 4
            )
            literal_offset = literal_runtime - 0x0C3C5740
            if words(data, literal_offset, 1)[0] != 0xC8:
                raise ValueError(
                    f"model/audio context field changed at 0x{offset:x}"
                )
    discovered = {2: set(), 3: set()}
    for offset in range(12, len(data) - 4, 2):
        literal_load = struct.unpack_from("<H", data, offset)[0]
        if (
            literal_load >> 12 != 0xD
            or (literal_load >> 8) & 0xF
            or data[offset + 2:offset + 4] != bytes.fromhex("9e06")
        ):
            continue
        runtime_pc = 0x0C3C5740 + offset
        literal_runtime = (
            ((runtime_pc + 4) & ~3)
            + (literal_load & 0xFF) * 4
        )
        literal_offset = literal_runtime - 0x0C3C5740
        if (
            literal_offset < 0
            or literal_offset + 4 > len(data)
            or words(data, literal_offset, 1)[0] != 0xC8
        ):
            continue
        prefix = data[offset - 12:offset]
        for table_word in discovered:
            template = (
                bytes.fromhex("04e557041a04")
                + bytes((table_word, 0xE5))
                + bytes.fromhex("5c3404e5")
            )
            if prefix == template:
                discovered[table_word].add(offset)
    expected_consumers = {
        2: set(OPENING_COMMAND_READS),
        3: set(CLOSING_COMMAND_READS),
    }
    if discovered != expected_consumers:
        raise ValueError(
            "model/audio phase-column consumer inventory changed: "
            f"{discovered}"
        )


def validate_pair_dataflow(
    capture: bytes,
    model_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    if sha256(capture) != EXPECTED_PAIR_DATAFLOW_SHA256:
        raise ValueError("JOMO DR23 model-pair dataflow trace SHA-256 changed")
    rows = list(csv.DictReader(io.StringIO(capture.decode("ascii"))))
    expected = [
        {
            "phase": "openingStart",
            "stateBefore": "closed",
            "emulatedCycles": "165602954544",
            "pc": "0c3cd768",
            "pr": "0c3cd70c",
            "modelAudioTableBase": "0c458218",
            "modelAudioElementIndex": "26",
            "modelAudioRowIndex": "6",
            "authoredPairIndex": "0",
            "selectedMemberAddress": "0c458280",
            "localFrameAddress": "0c498704",
            "localFieldOffset": "4",
            "commandHex": "ab020200",
        },
        {
            "phase": "closingStart",
            "stateBefore": "open",
            "emulatedCycles": "168045182976",
            "pc": "0c3d54b8",
            "pr": "0c3d545c",
            "modelAudioTableBase": "0c458218",
            "modelAudioElementIndex": "27",
            "modelAudioRowIndex": "6",
            "authoredPairIndex": "1",
            "selectedMemberAddress": "0c458284",
            "localFrameAddress": "0c498728",
            "localFieldOffset": "0",
            "commandHex": "ab020300",
        },
    ]
    if rows != expected:
        raise ValueError("JOMO DR23 model-pair dataflow rows changed")
    model_row = model_rows[6]
    table_base = 0x0C3C5740 + int(model_rows[0]["fileOffset"], 16)
    events = []
    for row in rows:
        pair_index = int(row["authoredPairIndex"])
        element_index = int(row["modelAudioElementIndex"])
        if (
            model_row["modelCode"] != "DR23_000"
            or element_index != 6 * 4 + 2 + pair_index
            or int(row["modelAudioTableBase"], 16) != table_base
            or int(row["selectedMemberAddress"], 16)
            != table_base + element_index * 4
            or row["commandHex"]
            != model_row["commands"][pair_index]["commandHex"]
        ):
            raise ValueError("JOMO DR23 model-pair address join changed")
        events.append({
            **row,
            "emulatedCycles": int(row["emulatedCycles"]),
            "modelAudioElementIndex": element_index,
            "modelAudioRowIndex": 6,
            "authoredPairIndex": pair_index,
            "localFieldOffset": int(row["localFieldOffset"]),
            "sourceReadFileOffset": (
                f"0x{OPENING_COMMAND_READS[2]:x}"
                if pair_index == 0
                else f"0x{CLOSING_COMMAND_READS[4]:x}"
            ),
        })
    return {
        "capture": (
            "tools/evidence/"
            "jomo-dr23-door-model-pair-dataflow.csv"
        ),
        "captureSha256": EXPECTED_PAIR_DATAFLOW_SHA256,
        "events": events,
        "conclusion": (
            "The opening controller computes row * 4 + 2 and the closing "
            "controller computes row * 4 + 3 against the same model/audio "
            "table. Those are table-wide phase columns, not DR23-only slots."
        ),
    }


def validate_phase_trace(
    capture: bytes,
    model_rows: list[dict[str, Any]],
    placements: list[dict[str, Any]],
) -> dict[str, Any]:
    if sha256(capture) != EXPECTED_PHASE_TRACE_SHA256:
        raise ValueError("JOMO DR23_000 phase trace SHA-256 changed")
    expected = [
        ("openingStart", "closed", 185214168064, "000202ab"),
        ("closingStart", "open", 186965756728, "000302ab"),
        ("openingStart", "closed", 188300311688, "000202ab"),
    ]
    rows = list(csv.DictReader(io.StringIO(capture.decode("ascii"))))
    if len(rows) != len(expected):
        raise ValueError("JOMO DR23_000 phase trace row count changed")
    placement = placements[17]
    model_row = model_rows[placement["modelAudioRowIndex"]]
    if (
        placement["modelCode"] != "DR23_000"
        or model_row["rowIndex"] != 6
        or [command["commandHex"] for command in model_row["commands"]]
        != ["ab020200", "ab020300"]
    ):
        raise ValueError("JOMO static door 17 model/audio join changed")

    events = []
    for row, (phase, state, cycles, r4) in zip(
        rows,
        expected,
        strict=True,
    ):
        if (
            row["phase"] != phase
            or row["stateBefore"] != state
            or int(row["emulatedCycles"]) != cycles
            or row["pc"] != "0c17a91c"
            or row["pr"] != "0c0bb71e"
            or row["r4"] != r4
            or int(row["placementIndex"]) != 17
            or row["modelCode"] != "DR23_000"
        ):
            raise ValueError(f"JOMO DR23_000 {phase} trace changed")
        events.append({
            "phase": phase,
            "stateBefore": state,
            "emulatedCycles": cycles,
            "dispatcherAddress": "0x0c17a91c",
            "returnAddress": "0x0c0bb71e",
            "r4Word": f"0x{r4}",
            "commandHex": bytes.fromhex(r4)[::-1].hex(),
        })

    model_row["commands"][0]["semanticRole"] = "openingStart"
    model_row["commands"][1]["semanticRole"] = "closingStart"
    return {
        "capture": "tools/evidence/jomo-dr23-door-phase-dispatch.csv",
        "captureSha256": EXPECTED_PHASE_TRACE_SHA256,
        "archivedStateSha256": ARCHIVED_STATE_SHA256,
        "target": {
            "placementIndex": 17,
            "modelAudioRowIndex": 6,
            "modelCode": "DR23_000",
            "model": "S1_JOMO_DR23_000.MT5",
            "position": placement["position"],
        },
        "protocol": [
            (
                "Load the archived Hazuki wardrobe state and reposition only "
                "Ryo beside static door placement 17; do not alter the door "
                "or object-action state."
            ),
            (
                "Use the retail left-trigger focus selector and press A from "
                "closed, then A from open, then A from closed again."
            ),
            (
                "Trace every entry to typed-command dispatcher 0x0c17a91c "
                "in SH-4 interpreter mode."
            ),
        ],
        "events": events,
        "conclusion": (
            "DR23_000 pair member zero is its opening-start command and pair "
            "member one is its closing-start command. The repeated third "
            "event proves the mapping across a complete open/close cycle."
        ),
    }


def build_evidence(
    mapinfo: bytes,
    source_name: str,
    phase_trace: bytes,
    pair_dataflow: bytes,
) -> dict[str, Any]:
    if sha256(mapinfo) != EXPECTED_MAPINFO_SHA256:
        raise ValueError("unexpected JOMO MAPINFO.BIN SHA-256")
    if mapinfo[SCN3_FILE_OFFSET:SCN3_FILE_OFFSET + 4] != b"SCN3":
        raise ValueError("JOMO SCN3 signature moved")
    static_relative = struct.unpack_from(
        "<I",
        mapinfo,
        SCN3_FILE_OFFSET + 0x10,
    )[0]
    static_base = SCN3_FILE_OFFSET + static_relative
    if static_base != STATIC_DATA_FILE_OFFSET:
        raise ValueError(
            f"JOMO static base changed to 0x{static_base:x}"
        )
    validate_instruction_bytes(mapinfo)
    model_rows = parse_model_audio_rows(mapinfo, static_base)
    logical_records = parse_logical_records(mapinfo, static_base)
    logical_mapping = parse_logical_mapping(mapinfo, static_base)
    placements = parse_placements(mapinfo, static_base, model_rows)
    runtime_phase_trace = validate_phase_trace(
        phase_trace,
        model_rows,
        placements,
    )
    runtime_pair_dataflow = validate_pair_dataflow(
        pair_dataflow,
        model_rows,
    )
    for model_row in model_rows:
        model_row["commands"][0]["semanticRole"] = "openingStart"
        model_row["commands"][1]["semanticRole"] = "closingStart"

    unique_commands = []
    for row in model_rows:
        for command in row["commands"]:
            if command["commandHex"] not in unique_commands:
                unique_commands.append(command["commandHex"])

    return {
        "schema": "new-yokosuka-jomo-door-audio-evidence-v3",
        "generatedBy": "tools/audio/extract_jomo_door_audio_evidence.py",
        "source": {
            "mapinfo": source_name,
            "mapinfoSha256": EXPECTED_MAPINFO_SHA256,
            "locationBank": "F1OMOYAA.SND",
            "locationBankSha256": EXPECTED_LOCATION_BANK_SHA256,
            "scn3FileOffset": f"0x{SCN3_FILE_OFFSET:x}",
            "staticDataFileOffset": f"0x{static_base:x}",
            "phaseTrace": runtime_phase_trace["capture"],
            "phaseTraceSha256": EXPECTED_PHASE_TRACE_SHA256,
            "pairDataflowTrace": runtime_pair_dataflow["capture"],
            "pairDataflowTraceSha256": EXPECTED_PAIR_DATAFLOW_SHA256,
        },
        "tableLayout": {
            "logicalRecords": {
                "staticOffset": f"0x{LOGICAL_RECORDS_OFFSET:x}",
                "fileOffset": f"0x{static_base + LOGICAL_RECORDS_OFFSET:x}",
                "count": LOGICAL_RECORD_COUNT,
                "wordsPerRecord": LOGICAL_RECORD_WORDS,
            },
            "logicalMapping": {
                "staticOffset": f"0x{LOGICAL_MAPPING_OFFSET:x}",
                "fileOffset": f"0x{static_base + LOGICAL_MAPPING_OFFSET:x}",
                "count": LOGICAL_RECORD_COUNT,
                "wordsPerRecord": 2,
            },
            "modelAudioRows": {
                "staticOffset": f"0x{MODEL_AUDIO_ROWS_OFFSET:x}",
                "fileOffset": f"0x{static_base + MODEL_AUDIO_ROWS_OFFSET:x}",
                "count": MODEL_AUDIO_ROW_COUNT,
                "wordsPerRecord": 4,
                "fields": [
                    "typed model-code descriptor",
                    "logical action type",
                    "authored audio command 0",
                    "authored audio command 1",
                ],
            },
            "placements": {
                "staticOffset": f"0x{PLACEMENTS_OFFSET:x}",
                "fileOffset": f"0x{static_base + PLACEMENTS_OFFSET:x}",
                "count": PLACEMENT_COUNT,
                "wordsPerRecord": PLACEMENT_WORDS,
                "fields": [
                    "record type",
                    "model/audio row index",
                    "scale X",
                    "scale Y",
                    "scale Z",
                    "position X",
                    "position Y",
                    "position Z",
                    "fixed-turn Y",
                ],
            },
        },
        "nativeDataflow": {
            "sharedInitializer": {
                "fileOffset": f"0x{SHARED_INITIALIZER:x}",
                "runtimeAddress": runtime_hex(SHARED_INITIALIZER),
                "installedContextPointers": {
                    "c0": "logical records",
                    "c4": "logical mapping",
                    "c8": "model/audio rows",
                    "cc": "placements",
                },
            },
            "modelActionLookup": {
                "fileOffset": f"0x{MODEL_ACTION_LOOKUP:x}",
                "runtimeAddress": runtime_hex(MODEL_ACTION_LOOKUP),
                "result": "model/audio row word 1",
            },
            "modelResourceLookup": {
                "fileOffset": f"0x{MODEL_RESOURCE_LOOKUP:x}",
                "runtimeAddress": runtime_hex(MODEL_RESOURCE_LOOKUP),
                "result": "model/audio row typed model descriptor",
            },
            "openingCommandReads": [
                {
                    "fileOffset": f"0x{offset:x}",
                    "runtimeAddress": runtime_hex(offset),
                    "modelAudioRowWord": 2,
                    "authoredPairIndex": 0,
                }
                for offset in OPENING_COMMAND_READS
            ],
            "closingCommandReads": [
                {
                    "fileOffset": f"0x{offset:x}",
                    "runtimeAddress": runtime_hex(offset),
                    "modelAudioRowWord": 3,
                    "authoredPairIndex": 1,
                }
                for offset in CLOSING_COMMAND_READS
            ],
            "selector11LogicalSoundReads": [
                {
                    "readFileOffset": f"0x{read:x}",
                    "callFileOffset": f"0x{call:x}",
                    "logicalRecordWord": 9,
                }
                for read, call in zip(
                    SELECTOR_11_SOUND_READS,
                    SELECTOR_11_SOUND_CALLS,
                )
            ],
            "selector12LogicalSoundReads": {
                "readFileOffsets": [
                    f"0x{offset:x}" for offset in SELECTOR_12_SOUND_READS
                ],
                "callFileOffsets": [
                    f"0x{offset:x}" for offset in SELECTOR_12_SOUND_CALLS
                ],
                "logicalRecordWord": 9,
                "note": (
                    "Four calls share two generated logical-word-9 read "
                    "blocks through branched state-machine paths."
                ),
            },
        },
        "summary": {
            "logicalRecordCount": len(logical_records),
            "modelAudioRowCount": len(model_rows),
            "placementCount": len(placements),
            "uniqueCommandCount": len(unique_commands),
            "uniqueCommands": unique_commands,
        },
        "modelAudioRows": model_rows,
        "logicalRecords": logical_records,
        "logicalMapping": logical_mapping,
        "placements": placements,
        "runtimePhaseTrace": runtime_phase_trace,
        "runtimePairDataflow": runtime_pair_dataflow,
        "semanticBoundary": {
            "proven": [
                (
                    "Each model/audio row owns its exact ordered pair of "
                    "F1OMOYAA AB02 commands."
                ),
                (
                    "Each placement selects one model/audio row by an exact "
                    "authored table index."
                ),
                (
                    "The shared initializer receives all four tables and the "
                    "generated room code retrieves model and action fields."
                ),
                (
                    "Every generated model/audio command consumer computes "
                    "row * 4 + 2 for pair member zero or row * 4 + 3 for "
                    "pair member one."
                ),
                (
                    "Synchronized retail traces label the shared field-2 "
                    "route as opening start and field-3 route as closing "
                    "start, so the phase schema applies to all seven rows."
                ),
            ],
            "unresolved": [
                (
                    "Selector-11/12 operation-0x006c calls read logical-record "
                    "word 9; the immutable records initialize words 9..12 to "
                    "0xffffffff and no static dataflow from the model/audio "
                    "pair into that slot has been established."
                ),
            ],
        },
        "runtimePolicy": {
            "implementedModels": [row["model"] for row in model_rows],
            "reason": (
                "The model table schema and all generated field-2/field-3 "
                "consumers are source-validated, and synchronized retail "
                "traces prove those fields are opening-start and "
                "closing-start respectively."
            ),
        },
    }


def default_mapinfo() -> Path:
    repo = Path(__file__).resolve().parents[2]
    candidates = [
        repo / "extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
        repo.parent / "new-yokosuka/extracted_files/data/SCENE/01/JOMO/MAPINFO.BIN",
        repo / ".disc-work/mapinfo/disc1/SCENE/01/JOMO/MAPINFO.BIN",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "mapinfo",
        nargs="?",
        type=Path,
        default=default_mapinfo(),
    )
    parser.add_argument(
        "--source-name",
        default="SCENE/01/JOMO/MAPINFO.BIN",
    )
    parser.add_argument(
        "--phase-trace",
        type=Path,
        default=Path("tools/evidence/jomo-dr23-door-phase-dispatch.csv"),
    )
    parser.add_argument(
        "--pair-dataflow",
        type=Path,
        default=Path(
            "tools/evidence/jomo-dr23-door-model-pair-dataflow.csv"
        ),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/jomo-door-audio.json"),
    )
    args = parser.parse_args()
    evidence = build_evidence(
        args.mapinfo.read_bytes(),
        args.source_name,
        args.phase_trace.read_bytes(),
        args.pair_dataflow.read_bytes(),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{evidence['summary']['modelAudioRowCount']} model/audio rows, "
        f"{evidence['summary']['placementCount']} placements"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
