#!/usr/bin/env python3
"""Recover the native free-conversation manager and operation 0x0051 ABI.

This extractor verifies the relevant US 1ST_READ.BIN routines byte-for-byte,
records the exact room-person record copy performed by the native loader, and
inventories every operation-0x0051 call in the 64 extracted MAPINFO programs.
Names are limited to behavior proven directly by the executable; unresolved
fields remain offsets or numeric selectors.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.build_scripted_world_state_inventory import scn3_ranges
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.lib.portable_paths import portable_project_path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_INDEX = (
    PROJECT_ROOT / "tools/evidence/scripted-world-state-inventory.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/native-free-conversation.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-native-free-conversation.json"
)
DEFAULT_SOURCE_ROOT = PROJECT_ROOT

RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
OPERATION_ID = 0x0051
RUNTIME_PERSON_SIZE = 0x78
ROOM_PERSON_CAPACITY = 12
DYNAMIC_PERSON_CAPACITY = 24

VERIFIED_RANGES = {
    "operationDispatch": (
        0x0C1592E0,
        434,
        "5da821441088ac545333c4ccc3649fe32504c1c866c780d762fba32d31a28228",
    ),
    "personPropertyQuery": (
        0x0C159492,
        236,
        "291598eb4becd73de183af34f630888d3b0fade19974198d7881e23cef245d2c",
    ),
    "forcePerson": (
        0x0C1595C8,
        196,
        "c05829efd91049339003b2b8dfdc34d38df1ed008846d9e109b79201f8e39e3f",
    ),
    "configurePersonSelector": (
        0x0C15968C,
        80,
        "953750e094806988401863d75df94367b68cf982fbf7d0ded1cef6ef5a8f75d1",
    ),
    "resetCurrentPerson": (
        0x0C159700,
        86,
        "69c3e8d05a0170e8e8c562c7d21f208803501e828a14ab7e5a27c69bb62e997b",
    ),
    "allocateRuntimePerson": (
        0x0C159780,
        66,
        "28d7b783954f3de45a2707fc15080626b8087256a98d6d47bde3b651e23bde11",
    ),
    "findRuntimePerson": (
        0x0C1597C2,
        102,
        "86762e1e6863d57cfc6a58d24ceddb64bceacb91825af39aad4ed5963857496e",
    ),
    "initializePersonRecord": (
        0x0C159850,
        136,
        "0a467950667e8739e1305285e21789997f8359e606c5f1dfacc6aef66953c664",
    ),
    "loadRoomPersonRecords": (
        0x0C1598E0,
        386,
        "8d9e079f15ad9a910f4ff13d09a6c048eb0f5b169d9a29d57d148a151bae300f",
    ),
    "updateManager": (
        0x0C159B68,
        382,
        "639823ad6f6b3d3f8d73398472ee5a54f3b4181de4a08f2772d43f4c1df5c0ca",
    ),
    "selectEligiblePerson": (
        0x0C159CE6,
        402,
        "eea3c18838e95a1f24b5b1316398ff5543eafb8f5d2ac747a3f83151ebceabb7",
    ),
    "updatePersonState": (
        0x0C159E78,
        360,
        "f3f62bbb3d0f92ff0c1157dd860cc5d99b8172d25b4cb00f9d4d9588e4022867",
    ),
    "reloadDynamicRecords": (
        0x0C15A520,
        728,
        "00040a54008f46ecf132cb3fcb46ad121eb88d3d08c9247ab08d6b57698e9c76",
    ),
    "stateBankRead": (
        0x0C15AEF8,
        76,
        "54f703003755706a8e17903adaa9ce5145e1c248d8d7f1ecf7af8d550368b49b",
    ),
    "stateBankWrite": (
        0x0C15AF44,
        60,
        "8f24e255c1e6f2447d06da1861b72d938c8561b99db2a9682e7479dcc68ce613",
    ),
    "operationStateBankRead": (
        0x0C15AF80,
        54,
        "d62fd24bfeebb59832559223e1ae3d052498b7e1b07c2dfe595f77eadb7c4733",
    ),
    "operationStateBankWrite": (
        0x0C15AFB6,
        58,
        "29d65d02e0dd00ec47472dd30e8c1370ba8442247f08d47b4e0c933154a14d5a",
    ),
    "conversationStateMachine": (
        0x0C15C158,
        2974,
        "e4e55cd84316c3744415b487aa6275ff7dd08bd154b45b7e623f8cc3a1f242c5",
    ),
}

SUBOPERATIONS = {
    0: "shut down and clear the free-conversation manager",
    1: "load the current room's authored person records",
    2: "mark free conversation initialized or resumed",
    6: "set or clear manager flag byte +0x0f bit 0",
    7: "force the current person by exact actor identity and a 16-bit value",
    8: "release the current person and reset its native state",
    9: "configure a person's signed selector and optional 16-bit range",
    10: "write one indexed native float slot",
    11: "read state bank 2 at a 16-bit index",
    12: "write state bank 2 at a 16-bit index",
    13: "read state bank 3 at a 16-bit index",
    14: "write state bank 3 at a 16-bit index",
    15: "read state bank 4 at a 16-bit index",
    16: "write state bank 4 at a 16-bit index",
    17: "query property selector 0 on the current person",
    18: "query a property selector on an exact person identity",
    19: "query an indexed property selector on an exact person identity",
    20: "request the native state-8 transition for a person",
    21: "query manager flag byte +0x0e bit 7",
    22: "reset the manager and all native person records",
    23: "drain the manager command queue",
    24: "build the native person-related identity list",
    25: "return false",
    26: "query selected-person runtime flag +0x1d bit 1",
    27: "set or clear manager flag byte +0x0e bit 4",
    28: "query the native free-conversation availability guard",
    29: "clear the manager's auxiliary global word",
    30: "write the manager's auxiliary global word",
}

STATIC_TO_RUNTIME_FIELDS = [
    {"source": "+0x00 dword", "runtime": "+0x04", "meaning": "person identity"},
    {"source": "+0x08 byte", "runtime": "+0x16", "meaning": "numeric field"},
    {"source": "+0x09 byte", "runtime": "+0x14", "meaning": "numeric field"},
    {"source": "+0x0a byte", "runtime": "+0x15", "meaning": "numeric field"},
    {"source": "+0x0b byte", "runtime": "+0x17", "meaning": "numeric field"},
    {"source": "+0x10 relative dword", "runtime": "+0x38", "meaning": "relative table"},
    {"source": "+0x14 relative dword", "runtime": "+0x40", "meaning": "relative table"},
    {"source": "+0x18 relative dword", "runtime": "+0x44", "meaning": "relative table"},
    {"source": "+0x20 relative dword", "runtime": "+0x28", "meaning": "relative table"},
    {"source": "+0x24 relative dword", "runtime": "+0x30", "meaning": "relative table"},
    {"source": "+0x28 relative dword", "runtime": "+0x2c", "meaning": "relative table"},
    {"source": "+0x2c relative dword", "runtime": "+0x3c", "meaning": "relative table"},
]


def hx(value: int) -> str:
    return f"0x{value:x}"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range {hx(address)}+{size} is unavailable")
    return data[start : start + size]


def constant_argument(call: dict[str, Any], index: int) -> int | None:
    arguments = call.get("arguments", [])
    if index >= len(arguments):
        return None
    argument = arguments[index]
    if argument.get("kind") != "constant":
        return None
    value = argument.get("value")
    return value if isinstance(value, int) else None


def compact_argument(argument: dict[str, Any]) -> dict[str, Any]:
    return {
        key: argument[key]
        for key in ("kind", "value", "hex", "ascii", "source")
        if key in argument
    }


def verify_executable(data: bytes) -> dict[str, Any]:
    actual = sha256(data)
    if actual != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    ranges = {}
    for name, (address, size, expected) in VERIFIED_RANGES.items():
        digest = sha256(runtime_slice(data, address, size))
        if digest != expected:
            raise ValueError(f"verified native range {name} changed: {digest}")
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": digest,
        }
    return {
        "filename": "1ST_READ.BIN",
        "runtimeBase": hx(RUNTIME_BASE),
        "sha256": actual,
        "verifiedCodeRanges": ranges,
    }


def inventory_map(
    item: dict[str, Any],
    objdump: str,
    source_root: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    source = Path(item["source"])
    if not source.is_absolute():
        source = source_root / source
    data = source.read_bytes()
    expected_sha = item.get("mapinfoSha256", item.get("sourceSha256"))
    if sha256(data) != expected_sha:
        raise ValueError(f"{source}: source hash changed")
    _, code_start, _, static_base = scn3_ranges(data)
    instructions = [
        instruction
        for instruction in disassemble(source, objdump)
        if code_start <= instruction[0] < static_base
    ]
    calls = [
        call
        for call in extract_dispatch_calls(instructions, static_base)
        if call["operationId"] == OPERATION_ID
    ]
    subcommands = Counter(constant_argument(call, 0) for call in calls)
    compact_calls = [
        {
            "callFileOffset": call["callFileOffset"],
            "arguments": [
                compact_argument(argument) for argument in call["arguments"]
            ],
        }
        for call in calls
    ]
    return (
        {
            "disc": item.get("disc", item.get("scene")),
            "area": item["area"],
            "source": portable_project_path(source),
            "mapinfoSha256": expected_sha,
            "callCount": len(calls),
            "constantSuboperationCounts": {
                "runtime" if key is None else str(key): value
                for key, value in sorted(
                    subcommands.items(),
                    key=lambda pair: (pair[0] is None, pair[0] or 0),
                )
            },
        },
        compact_calls,
    )


def build_report(
    executable: bytes,
    index: dict[str, Any],
    objdump: str,
    source_root: Path = DEFAULT_SOURCE_ROOT,
) -> dict[str, Any]:
    maps = []
    all_calls = []
    global_counts: Counter[int | None] = Counter()
    usage_by_suboperation: dict[int, set[tuple[int, str]]] = defaultdict(set)
    for item in index["maps"]:
        map_summary, calls = inventory_map(item, objdump, source_root)
        maps.append(map_summary)
        for call in calls:
            subcommand = None
            if call["arguments"]:
                first = call["arguments"][0]
                if first.get("kind") == "constant":
                    subcommand = first.get("value")
            global_counts[subcommand] += 1
            if isinstance(subcommand, int):
                usage_by_suboperation[subcommand].add(
                    (item.get("disc", item.get("scene")), item["area"])
                )
            all_calls.append({
                "disc": item.get("disc", item.get("scene")),
                "area": item["area"],
                **call,
            })

    observed = []
    for suboperation, description in SUBOPERATIONS.items():
        observed.append({
            "suboperation": suboperation,
            "description": description,
            "callCount": global_counts[suboperation],
            "roomCount": len(usage_by_suboperation[suboperation]),
        })
    runtime_count = global_counts[None]
    return {
        "schema": "new-yokosuka-native-free-conversation-v1",
        "evidenceBoundary": [
            "Operation identity, dispatch cases, code hashes, capacities, copied field offsets, and MAPINFO call arguments are exact.",
            "The native subsystem is identified as free conversation by its executable debug strings and its complete person-selection and conversation state machine.",
            "Numeric fields, property selectors, state values, and relative tables remain unnamed where their higher-level meaning is not yet proven.",
            "This manager is distinct from the general spatial door/object interaction manager.",
        ],
        "executableEvidence": verify_executable(executable),
        "operation": {
            "operationId": OPERATION_ID,
            "operationHex": f"0x{OPERATION_ID:04x}",
            "handlerAddress": hx(0x0C1592E0),
            "suboperations": observed,
            "runtimeValuedSuboperationCallCount": runtime_count,
        },
        "managerSchema": {
            "roomPersonCapacity": ROOM_PERSON_CAPACITY,
            "dynamicPersonCapacity": DYNAMIC_PERSON_CAPACITY,
            "runtimePersonRecordSize": RUNTIME_PERSON_SIZE,
            "runtimePersonArrayOffset": hx(0x4C),
            "roomPersonCountOffset": hx(0x40),
            "dynamicPersonCountOffset": hx(0x44),
            "selectedPersonPointerOffset": hx(0x48),
            "requestedPersonIdentityOffset": hx(0x20),
            "previousPersonIdentityOffset": hx(0x24),
            "staticToRuntimeFields": STATIC_TO_RUNTIME_FIELDS,
        },
        "summary": {
            "mapinfoCount": len(maps),
            "operationCallCount": len(all_calls),
            "constantSuboperationCounts": {
                "runtime" if key is None else str(key): value
                for key, value in sorted(
                    global_counts.items(),
                    key=lambda pair: (pair[0] is None, pair[0] or 0),
                )
            },
            "mapsWithCalls": sum(item["callCount"] > 0 for item in maps),
        },
        "maps": maps,
        "calls": all_calls,
    }


def compact_summary(report: dict[str, Any], full_report: Path) -> dict[str, Any]:
    calls = report["calls"]
    representatives = []
    seen = set()
    for call in calls:
        arguments = call["arguments"]
        first = arguments[0] if arguments else {}
        key = (
            first.get("value")
            if first.get("kind") == "constant"
            else "runtime"
        )
        if key in seen:
            continue
        seen.add(key)
        representatives.append(call)
    return {
        "schema": report["schema"],
        "evidenceBoundary": report["evidenceBoundary"],
        "executableEvidence": report["executableEvidence"],
        "operation": report["operation"],
        "managerSchema": report["managerSchema"],
        "summary": report["summary"],
        "representativeCalls": representatives,
        "fullReport": portable_project_path(full_report),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help="root containing extracted_files and extracted_disc*_v2",
    )
    parser.add_argument("--objdump", default="sh4-linux-gnu-objdump")
    args = parser.parse_args()

    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.index.read_text()),
        args.objdump,
        args.source_root,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(compact_summary(report, args.output), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: {report['summary']['operationCallCount']} "
        "operation-0x0051 calls"
    )


if __name__ == "__main__":
    main()
