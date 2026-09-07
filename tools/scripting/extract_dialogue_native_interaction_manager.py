#!/usr/bin/env python3
"""Recover the executable consumer of generated room interaction tables.

The generated MAPINFO setup identified by
``extract_dialogue_interaction_registration.py`` forwards fourteen values
through its runtime-context callback at ``+0x58``.  In the verified US
executable that callback dispatches selector zero to the native interaction
manager initializer.

This extractor verifies that complete callback path, records the initializer's
argument-to-manager layout, and uses the native descriptor initializer to
decode the first static input as a sentinel-terminated array of 52-byte
records.  Numeric fields whose gameplay meaning is not yet proven remain
numeric.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_REGISTRATIONS = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-interaction-registration.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/native-interaction-manager.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-native-interaction-manager.json"
)

RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
DESCRIPTOR_SIZE = 52
DESCRIPTOR_WORDS = DESCRIPTOR_SIZE // 4
RUNTIME_SLOT_COUNT = 16
RUNTIME_SLOT_SIZE = 24
HARD_CANDIDATE_CAPACITY = 10
INDIRECT_RECORD_SIZE = 36
INDIRECT_RECORD_WORDS = INDIRECT_RECORD_SIZE // 4

VERIFIED_RANGES = {
    "contextConstructor": (
        0x0C0BB124,
        130,
        "f43dd3d0f719b4f17ab8b6df5ee92cc8ace74a384bb0e97f0b0b0e0019d47871",
    ),
    "dispatchWrapper": (
        0x0C0BB6BE,
        14,
        "72156bac00ed014a0ffb0106dbb03258675f7ec1d882bc44fc4e2571888cc11b",
    ),
    "selectorDispatcher": (
        0x0C160918,
        48,
        "9e0be555668022780e0216cb9d2f42c3b3ecdf0eeb34c3a364467394c89a1a90",
    ),
    "managerInitialize": (
        0x0C15DBCC,
        284,
        "7dbd60fd8c59695a681afc5228c67f3ede28accdfe43dd1cd3528c4b7b4a68d2",
    ),
    "managerPartialReset": (
        0x0C15DCE8,
        82,
        "a41fa2a00e57147e4ba493588f1bcdb1247af58941b01ae5bc11184b4d76739c",
    ),
    "managerCommandDispatch": (
        0x0C15DD4C,
        322,
        "a0c6b8c022a0350cbc4d3be3240519b62b356e28ec62b74abf435bfb73bc21f0",
    ),
    "descriptorInitialize": (
        0x0C15E5AC,
        136,
        "8ac7593126664a31246cd16520458e19b4ec0b6ce40e2ba42a747b91e1350519",
    ),
    "candidateScratchInitialize": (
        0x0C15E634,
        56,
        "85a2e96dd948edc8d582943c56b5126480cf25aeaeea2b7058b966756bf4349d",
    ),
    "indirectIndexLookup": (
        0x0C15F018,
        72,
        "974e1a773237af47fd6b6708ea1365bd68cc14f9bfffa21b00777ff2004a7d5b",
    ),
    "dispatchEntry3": (
        0x0C15F388,
        60,
        "aaf4e11aed229229bd89d7fbfc5efdeb6d3190ef6c498c23425555e04242cee3",
    ),
    "dispatchEntry4": (
        0x0C15F3C4,
        36,
        "d5bc978b50dfcc4b615914fd5402f46cb92a8a8b2f868ec0c629c9254caba800",
    ),
    "dispatchEntry5": (
        0x0C15F3E8,
        66,
        "88d94e59b8d08e74dcb7d7ecde9d418d1ede63004d15a256d8164b71ca066086",
    ),
}

DISPATCH_TABLE_ADDRESS = 0x0C281278
EXPECTED_DISPATCH_TABLE = [
    0x0C15DBCC,
    0x0C15DD4C,
    0x0C15DCE8,
    0x0C15F388,
    0x0C15F3C4,
    0x0C15F3E8,
    0x0C097A48,
    0x0C0BB6CC,
    0x0C0BB6CC,
]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:x}"


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start : start + size]


def u32_runtime(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def verify_executable(executable: bytes) -> dict[str, Any]:
    actual_executable_sha = sha256(executable)
    if actual_executable_sha != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")

    ranges = {}
    for name, (address, size, expected_sha) in VERIFIED_RANGES.items():
        actual_sha = sha256(runtime_slice(executable, address, size))
        if actual_sha != expected_sha:
            raise ValueError(
                f"verified native range {name} changed: {actual_sha}"
            )
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": actual_sha,
        }

    context_callbacks = {
        "operationDispatcherAtContextPlus80": u32_runtime(
            executable, 0x0C0BB250
        ),
        "callbackAtContextPlus84": u32_runtime(executable, 0x0C0BB254),
        "selectorCallbackAtContextPlus88": u32_runtime(
            executable, 0x0C0BB258
        ),
    }
    expected_callbacks = {
        "operationDispatcherAtContextPlus80": 0x0C0BB69C,
        "callbackAtContextPlus84": 0x0C0BB6A8,
        "selectorCallbackAtContextPlus88": 0x0C0BB6BE,
    }
    if context_callbacks != expected_callbacks:
        raise ValueError(f"runtime context callback wiring changed: {context_callbacks}")

    wrapper_target = u32_runtime(executable, 0x0C0BB780)
    if wrapper_target != 0x0C160918:
        raise ValueError(f"selector wrapper target changed: 0x{wrapper_target:08x}")

    dispatcher_table = u32_runtime(executable, 0x0C16094C)
    if dispatcher_table != DISPATCH_TABLE_ADDRESS:
        raise ValueError(
            f"selector dispatch table changed: 0x{dispatcher_table:08x}"
        )
    table = [
        u32_runtime(executable, DISPATCH_TABLE_ADDRESS + index * 4)
        for index in range(len(EXPECTED_DISPATCH_TABLE))
    ]
    if table != EXPECTED_DISPATCH_TABLE:
        raise ValueError(f"selector dispatch entries changed: {table}")

    return {
        "executable": "1ST_READ.BIN",
        "runtimeBase": hx(RUNTIME_BASE),
        "sha256": actual_executable_sha,
        "verifiedCodeRanges": ranges,
        "runtimeContextCallbacks": {
            key: hx(value) for key, value in context_callbacks.items()
        },
        "selectorWrapperTarget": hx(wrapper_target),
        "selectorDispatchTableAddress": hx(dispatcher_table),
        "selectorDispatchEntries": [
            {"selector": index, "runtimeAddress": hx(address)}
            for index, address in enumerate(table)
        ],
    }


def descriptor_records(
    data: bytes,
    start: int,
    upper_bound: int,
) -> tuple[list[dict[str, Any]], int]:
    records = []
    offset = start
    while offset + 4 <= upper_bound:
        first = struct.unpack_from("<I", data, offset)[0]
        if first == 0xFFFFFFFF:
            return records, offset
        if offset + DESCRIPTOR_SIZE > len(data):
            break
        words = list(
            struct.unpack_from(f"<{DESCRIPTOR_WORDS}I", data, offset)
        )
        records.append(
            {
                "index": len(records),
                "fileOffset": hx(offset),
                "words": words,
                "wordsHex": [f"0x{word:08x}" for word in words],
            }
        )
        offset += DESCRIPTOR_SIZE
    raise ValueError(
        f"no aligned descriptor sentinel between {hx(start)} and "
        f"{hx(upper_bound)}"
    )


def indirect_record_graph(
    data: bytes,
    descriptors: list[dict[str, Any]],
    index_table_start: int,
    index_table_upper_bound: int,
    record_table_start: int,
) -> tuple[list[list[int]], list[dict[str, Any]]]:
    descriptor_indices = []
    referenced = {}
    for descriptor in descriptors:
        sequence_offset = (
            index_table_start + descriptor["words"][0] * 4
        )
        if not index_table_start <= sequence_offset < index_table_upper_bound:
            raise ValueError(
                f"descriptor {descriptor['index']} indirect sequence begins "
                f"outside static input 2 at {hx(sequence_offset)}"
            )
        indices = []
        cursor = sequence_offset
        while cursor + 4 <= index_table_upper_bound:
            value = struct.unpack_from("<I", data, cursor)[0]
            cursor += 4
            if value == 0xFFFFFFFF:
                break
            record_offset = record_table_start + value * INDIRECT_RECORD_SIZE
            if record_offset + INDIRECT_RECORD_SIZE > len(data):
                raise ValueError(
                    f"indirect record {value} lies outside MAPINFO at "
                    f"{hx(record_offset)}"
                )
            words = list(
                struct.unpack_from(
                    f"<{INDIRECT_RECORD_WORDS}I",
                    data,
                    record_offset,
                )
            )
            prior = referenced.get(value)
            if prior is not None and prior["words"] != words:
                raise ValueError(f"indirect record {value} changed in one room")
            referenced[value] = {
                "index": value,
                "fileOffset": hx(record_offset),
                "type": words[0],
                "words": words,
                "wordsHex": [f"0x{word:08x}" for word in words],
            }
            indices.append(value)
        else:
            raise ValueError(
                f"descriptor {descriptor['index']} indirect sequence has no "
                "sentinel before static input 3"
            )
        descriptor_indices.append(indices)
    return descriptor_indices, [referenced[key] for key in sorted(referenced)]


def registration_schema(entry: dict[str, Any]) -> dict[str, Any]:
    source = Path(entry["source"])
    data = source.read_bytes()
    first = int(entry["staticInputs"][0]["fileOffset"], 16)
    second = int(entry["staticInputs"][1]["fileOffset"], 16)
    third = int(entry["staticInputs"][2]["fileOffset"], 16)
    fourth = int(entry["staticInputs"][3]["fileOffset"], 16)
    records, sentinel = descriptor_records(data, first, second)
    descriptor_indices, indirect_records = indirect_record_graph(
        data,
        records,
        second,
        third,
        fourth,
    )
    indirect_by_index = {
        record["index"]: record for record in indirect_records
    }
    type_two_counts = []
    for record, indices in zip(records, descriptor_indices, strict=True):
        record["indirectRecordIndices"] = indices
        record["indirectRecordTypes"] = [
            indirect_by_index[index]["type"] for index in indices
        ]
        type_two_counts.append(record["indirectRecordTypes"].count(2))

    probes = entry["staticInputs"][0]["provenSetupRead"]["probes"]
    comparable_count = min(len(probes), len(records))
    probe_values = [
        probe["value"] for probe in probes[:comparable_count]
    ]
    record_values = [
        record["words"][0] for record in records[:comparable_count]
    ]
    if probe_values != record_values:
        raise ValueError(
            f"{entry['disc']}:{entry['area']} setup probes do not match "
            "native descriptor records"
        )

    control = entry["controlArgument5"]
    if control["kind"] != "constant":
        raise ValueError(
            f"{entry['disc']}:{entry['area']} control argument is unresolved"
        )
    control_value = control["value"]
    table_end = sentinel + 4
    return {
        "disc": entry["disc"],
        "area": entry["area"],
        "source": entry["source"],
        "mapinfoSha256": entry["mapinfoSha256"],
        "setupFunction": entry["setupFunction"],
        "callFileOffset": entry["callFileOffset"],
        "ownerTag": entry["ownerTag"],
        "controlArgument": control,
        "descriptorTable": {
            "fileOffset": hx(first),
            "recordSizeBytes": DESCRIPTOR_SIZE,
            "wordCountPerRecord": DESCRIPTOR_WORDS,
            "recordCount": len(records),
            "sentinelFileOffset": hx(sentinel),
            "serializedByteLengthThroughSentinel": table_end - first,
            "sha256ThroughSentinel": sha256(data[first:table_end]),
            "records": records,
        },
        "indirectIndexTable": {
            "fileOffset": hx(second),
            "upperBoundFileOffset": hx(third),
            "elementSizeBytes": 4,
            "sequenceTerminator": "0xffffffff",
            "referenceCount": sum(len(indices) for indices in descriptor_indices),
        },
        "indirectRecordTable": {
            "fileOffset": hx(fourth),
            "recordSizeBytes": INDIRECT_RECORD_SIZE,
            "wordCountPerRecord": INDIRECT_RECORD_WORDS,
            "referencedRecordCount": len(indirect_records),
            "type2RecordsPerDescriptorHistogram": {
                str(key): value
                for key, value in sorted(Counter(type_two_counts).items())
            },
            "typeHistogram": {
                str(key): value
                for key, value in sorted(
                    Counter(
                        record["type"] for record in indirect_records
                    ).items()
                )
            },
            "records": indirect_records,
        },
        "nativeDerivedCounts": {
            "descriptorCountStoredAtManagerPlus44": len(records),
            "controlLimitStoredAtManagerPlus64": min(
                control_value, len(records)
            ),
            "candidateCapacityStoredAtManagerPlus72": min(
                HARD_CANDIDATE_CAPACITY, len(records)
            ),
        },
    }


def build_report(
    executable: bytes,
    registrations: dict[str, Any],
) -> dict[str, Any]:
    source = verify_executable(executable)
    decoded = [
        registration_schema(entry)
        for entry in registrations["registrations"]
    ]
    descriptor_counts = Counter(
        entry["descriptorTable"]["recordCount"] for entry in decoded
    )
    indirect_type_counts = Counter(
        record["type"]
        for entry in decoded
        for record in entry["indirectRecordTable"]["records"]
    )
    return {
        "schema": "new-yokosuka-dialogue-native-interaction-manager-v1",
        "status": "exact-native-consumer-and-descriptor-layout",
        "source": source,
        "callbackPath": [
            {
                "step": "generated runtime context selector callback",
                "contextOffset": "0x58",
                "runtimeAddress": "0x0c0bb6be",
            },
            {
                "step": "native selector dispatcher",
                "runtimeAddress": "0x0c160918",
                "selectorTable": "0x0c281278",
            },
            {
                "step": "selector zero manager initializer",
                "runtimeAddress": "0x0c15dbcc",
            },
        ],
        "initializerArgumentMapping": [
            {"nativeArgument": 0, "managerOffset": "0x00", "source": "staticInput1"},
            {"nativeArgument": 1, "managerOffset": "0x04", "source": "staticInput2"},
            {"nativeArgument": 2, "managerOffset": "0x08", "source": "staticInput3"},
            {"nativeArgument": 3, "managerOffset": "0x0c", "source": "staticInput4"},
            {"nativeArgument": 13, "managerOffset": "0x10", "source": "sceneBindingFinal"},
            {"nativeArgument": 4, "managerOffset": "0x14", "source": "sceneBinding1"},
            {"nativeArgument": 5, "managerOffset": "0x18", "source": "sceneBinding2"},
            {"nativeArgument": 6, "managerOffset": "0x1c", "source": "sceneBinding3"},
            {"nativeArgument": 7, "managerOffset": "0x20", "source": "sceneBinding4"},
            {"nativeArgument": 8, "managerOffset": "0x24", "source": "sceneBinding5"},
            {"nativeArgument": 11, "managerOffset": "0x28", "source": "additionalStaticInput1"},
            {"nativeArgument": 12, "managerOffset": "0x2c", "source": "additionalStaticInput2"},
            {"nativeArgument": 9, "managerOffset": "0x30", "source": "resolvedOwnerObject"},
            {"nativeArgument": 9, "managerOffset": "0x34", "source": "rawOwnerObject"},
            {"nativeArgument": 10, "managerOffset": "0x40", "source": "callerControlArgument"},
        ],
        "managerLayout": {
            "descriptorTablePointer": "0x00",
            "indirectIndexTablePointer": "0x04",
            "staticInput3Pointer": "0x08",
            "candidateRecordTablePointer": "0x0c",
            "resolvedOwnerObject": "0x30",
            "rawOwnerObject": "0x34",
            "descriptorCount": "0x44",
            "candidateCapacity": "0x48",
            "candidateScratch": {
                "offset": "0x4c",
                "recordCount": 10,
                "recordSizeBytes": 20,
            },
            "runtimeSlots": {
                "offset": "0x114",
                "recordCount": RUNTIME_SLOT_COUNT,
                "recordSizeBytes": RUNTIME_SLOT_SIZE,
                "initialWords": [0, 0, 0xFFFFFFFF, 0xFFFFFFFD, 0, 5],
            },
        },
        "descriptorSchema": {
            "recordSizeBytes": DESCRIPTOR_SIZE,
            "wordCount": DESCRIPTOR_WORDS,
            "terminator": "first dword == 0xffffffff",
            "nativeInitializer": "0x0c15e5ac",
            "initializerWrites": {
                "word1": 0,
                "word3": 0,
                "word4": 0,
                "word5": 0,
                "word6": 0,
                "words7Through12": "0xffffffff",
            },
            "provenIndirectLookup": (
                "descriptor word 0 indexes a dword sequence in static input "
                "2; that sequence terminates at 0xffffffff. Each sequence "
                "value indexes a 36-byte record in static input 4, whose "
                "word 0 is compared with the requested numeric key."
            ),
            "indirectRecordSizeBytes": INDIRECT_RECORD_SIZE,
            "indirectRecordWordCount": INDIRECT_RECORD_WORDS,
        },
        "summary": {
            "registrationCount": len(decoded),
            "exactDescriptorTableCount": len(decoded),
            "gapCount": 0,
            "descriptorRecordCount": sum(
                entry["descriptorTable"]["recordCount"] for entry in decoded
            ),
            "minimumDescriptorCount": min(descriptor_counts),
            "maximumDescriptorCount": max(descriptor_counts),
            "descriptorCountHistogram": {
                str(key): value for key, value in sorted(descriptor_counts.items())
            },
            "indirectReferenceCount": sum(
                entry["indirectIndexTable"]["referenceCount"]
                for entry in decoded
            ),
            "referencedIndirectRecordCount": sum(
                entry["indirectRecordTable"]["referencedRecordCount"]
                for entry in decoded
            ),
            "indirectRecordTypeHistogram": {
                str(key): value
                for key, value in sorted(indirect_type_counts.items())
            },
            "runtimeSlotCountPerManager": RUNTIME_SLOT_COUNT,
            "hardCandidateCapacity": HARD_CANDIDATE_CAPACITY,
        },
        "registrations": decoded,
        "evidenceBoundary": [
            (
                "The callback wiring, selector table, native manager field "
                "writes, 52-byte descriptor stride, sentinel, counts, "
                "initialization writes, and indirect lookup chain are exact."
            ),
            (
                "The gameplay meanings of unresolved descriptor words and "
                "static inputs 3 and 4 remain numeric; this report does not "
                "infer actor identities, dialogue branches, or proximity "
                "semantics from their values."
            ),
        ],
    }


def summary_report(report: dict[str, Any], full_report: Path) -> dict[str, Any]:
    anchors = [
        entry
        for entry in report["registrations"]
        if entry["disc"] == 1 and entry["area"] == "D000"
    ]
    return {
        "schema": report["schema"],
        "status": report["status"],
        "source": report["source"],
        "callbackPath": report["callbackPath"],
        "initializerArgumentMapping": report["initializerArgumentMapping"],
        "managerLayout": report["managerLayout"],
        "descriptorSchema": report["descriptorSchema"],
        "summary": report["summary"],
        "verifiedAnchors": anchors,
        "coverage": [
            {
                "disc": entry["disc"],
                "area": entry["area"],
                "descriptorTableFileOffset": entry["descriptorTable"][
                    "fileOffset"
                ],
                "descriptorCount": entry["descriptorTable"]["recordCount"],
                "sentinelFileOffset": entry["descriptorTable"][
                    "sentinelFileOffset"
                ],
                "controlArgument": entry["controlArgument"]["value"],
                "nativeDerivedCounts": entry["nativeDerivedCounts"],
                "indirectReferenceCount": entry["indirectIndexTable"][
                    "referenceCount"
                ],
                "indirectRecordTypeHistogram": entry[
                    "indirectRecordTable"
                ]["typeHistogram"],
            }
            for entry in report["registrations"]
        ],
        "evidenceBoundary": report["evidenceBoundary"],
        "fullReport": str(full_report.relative_to(PROJECT_ROOT)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument(
        "--registrations", type=Path, default=DEFAULT_REGISTRATIONS
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.registrations.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary_report(report, args.output), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['descriptorRecordCount']} descriptors across "
        f"{report['summary']['registrationCount']} registrations"
    )


if __name__ == "__main__":
    main()
