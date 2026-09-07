#!/usr/bin/env python3
"""Recover native actor-dialogue predicate value sources and comparisons."""

from __future__ import annotations

import argparse
import json
import math
import struct
from collections import Counter
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_actor_entry_routes import extract_resources
from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_EXECUTABLE,
    DEFAULT_HUMANS,
    EXECUTABLE_SHA256,
    HUMANS_SHA256,
    RUNTIME_BASE,
    hx,
    sha256,
    write_json,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    ROOT / "tools" / "evidence" / "dialogue-predicate-values.json"
)

VERIFIED_RANGES = {
    "typedValueResolver": (0x0C15AEF8, 0x4C),
    "typedValueWriter": (0x0C15AF44, 0x3C),
    "expressionEvaluator": (0x0C15B10A, 0x2C6),
    "stateBank2Reader": (0x0C15904C, 0x2A),
    "stateBank2Writer": (0x0C159076, 0x5E),
    "stateBank3Reader": (0x0C1590F4, 0x2A),
    "stateBank3Writer": (0x0C15911E, 0x36),
    "stateBank4Reader": (0x0C159154, 0x14),
    "stateBank4Writer": (0x0C159168, 0x0E),
    "runtimeComponentReader": (0x0C15AFF0, 0x78),
    "persistentValueReader": (0x0C1513CC, 0x68),
    "persistentValueWriter": (0x0C151434, 0x66),
    "scriptPersistentValueReader": (0x0C16B5F6, 0x1C),
    "scriptPersistentValueWriter": (0x0C16B612, 0x10),
    "dateTimeAdvance": (0x0C181FB4, 0xB6),
    "dateTimeWeekday": (0x0C1820F8, 0x6C),
    "dateTimeSet": (0x0C182164, 0x4A),
    "dateTimeCopy": (0x0C1821AE, 0x20),
    "actorRuntimeValueReader": (0x0C119888, 0x44),
    "actorRuntimeIdentityResolver": (0x0C15AE76, 0x74),
    "actorRuntimeIdentityTable": (0x0C278D08, 301 * 4),
    "scheduledActorRuntimeValueWriter": (0x0C119622, 0x0E),
    "nativeSpatialValueReader": (0x0C15B088, 0x82),
    "stateBankDescriptor": (0x0C158C72, 0x1E),
    "stateBankReset": (0x0C159290, 0x42),
    "stateBankSaveExport": (0x0C09C854, 0x36),
    "stateBankSaveImport": (0x0C09C8B4, 0x36),
}

NATIVE_SPATIAL_TABLE_ADDRESS = 0x0C2791C0
NATIVE_SPATIAL_RECORD_COUNT = 13
NATIVE_SPATIAL_RECORD_SIZE = 0x14
ACTOR_IDENTITY_TABLE_ADDRESS = 0x0C278D08
ACTOR_IDENTITY_TABLE_COUNT = 301

NATIVE_STATE_BANKS = {
    2: {
        "runtimeAddress": 0x0C223EF8,
        "capacity": 1024,
        "byteLength": 0x80,
        "saveOffset": 0x130,
        "reader": 0x0C15904C,
        "writer": 0x0C159076,
        "descriptorLiteral": 0x0C158D04,
        "resetLiteral": 0x0C1592D8,
        "saveDescriptorLiteral": 0x0C15A330,
    },
    3: {
        "runtimeAddress": 0x0C223EF0,
        "capacity": 64,
        "byteLength": 0x08,
        "saveOffset": 0x128,
        "reader": 0x0C1590F4,
        "writer": 0x0C15911E,
        "descriptorLiteral": 0x0C158D08,
        "resetLiteral": 0x0C1592D4,
        "saveDescriptorLiteral": 0x0C15A32C,
    },
    4: {
        "runtimeAddress": 0x0C223F78,
        "capacity": 32,
        "byteLength": 0x20,
        "saveOffset": 0x230,
        "reader": 0x0C159154,
        "writer": 0x0C159168,
        "descriptorLiteral": 0x0C158D0C,
        "resetLiteral": 0x0C1592DC,
        "saveDescriptorLiteral": 0x0C15A334,
    },
}


class PredicateValueError(ValueError):
    """Predicate evidence does not match the exact native inputs."""


def executable_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise PredicateValueError(
            f"executable range {hx(address)}+{size} is unavailable"
        )
    return data[offset : offset + size]


def executable_u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", executable_slice(data, address, 2))[0]


def executable_u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", executable_slice(data, address, 4))[0]


def extract_native_state_banks(executable: bytes) -> list[dict[str, Any]]:
    banks = []
    for bank, definition in NATIVE_STATE_BANKS.items():
        runtime_address = definition["runtimeAddress"]
        for literal_name in (
            "descriptorLiteral",
            "resetLiteral",
            "saveDescriptorLiteral",
        ):
            literal = definition[literal_name]
            actual = executable_u32(executable, literal)
            if actual != runtime_address:
                raise PredicateValueError(
                    f"state bank {bank} {literal_name} points to "
                    f"{hx(actual)}, expected {hx(runtime_address)}"
                )
        banks.append({
            "bank": bank,
            "storage": "bitfield" if bank in (2, 3) else "byte array",
            "runtimeAddress": hx(runtime_address),
            "capacity": definition["capacity"],
            "byteLength": definition["byteLength"],
            "reader": hx(definition["reader"]),
            "writer": hx(definition["writer"]),
            "initialValue": 0,
            "resetRoutine": hx(0x0C159290),
            "saveOffset": definition["saveOffset"],
            "saveOffsetHex": hx(definition["saveOffset"]),
        })

    if executable_u16(executable, 0x0C158CE0) != 0x400:
        raise PredicateValueError("state bank 2 descriptor capacity changed")
    if executable_u16(executable, 0x0C09C892) != 0x80:
        raise PredicateValueError("state bank 2 save byte length changed")
    return banks


def walk_ast(node: Any, kinds: Counter, operations: Counter) -> None:
    if not isinstance(node, dict):
        return
    kind = node.get("kind")
    if kind:
        kinds[kind] += 1
    operation = node.get("operation")
    if operation:
        operations[operation] += 1
    for value in node.values():
        if isinstance(value, dict):
            walk_ast(value, kinds, operations)
        elif isinstance(value, list):
            for item in value:
                    walk_ast(item, kinds, operations)


def ast_native_spatial_indexes(node: Any) -> list[int]:
    indexes = []
    if not isinstance(node, dict):
        return indexes
    if node.get("kind") == "nativeSpatialResult":
        indexes.append(node["value"])
    for value in node.values():
        if isinstance(value, dict):
            indexes.extend(ast_native_spatial_indexes(value))
        elif isinstance(value, list):
            for item in value:
                indexes.extend(ast_native_spatial_indexes(item))
    return indexes


def ast_actor_runtime_indexes(node: Any) -> list[int]:
    indexes = []
    if not isinstance(node, dict):
        return indexes
    if node.get("kind") == "actorRuntimeIdentity":
        indexes.append(node["value"])
    for value in node.values():
        if isinstance(value, dict):
            indexes.extend(ast_actor_runtime_indexes(value))
        elif isinstance(value, list):
            for item in value:
                indexes.extend(ast_actor_runtime_indexes(item))
    return indexes


def extract_actor_identity_table(executable: bytes) -> list[str | None]:
    data = executable_slice(
        executable,
        ACTOR_IDENTITY_TABLE_ADDRESS,
        ACTOR_IDENTITY_TABLE_COUNT * 4,
    )
    identities = []
    for index in range(ACTOR_IDENTITY_TABLE_COUNT):
        encoded = data[index * 4 : index * 4 + 4]
        if encoded == b"\x00\x00\x00\x00":
            identities.append(None)
            continue
        if any(value < 0x20 or value > 0x7e for value in encoded):
            raise PredicateValueError(
                f"invalid actor identity bytes at index {index}: "
                f"{encoded.hex()}"
            )
        identities.append(encoded.decode("ascii"))
    return identities


def extract_native_spatial_records(executable: bytes) -> list[dict[str, Any]]:
    data = executable_slice(
        executable,
        NATIVE_SPATIAL_TABLE_ADDRESS,
        NATIVE_SPATIAL_RECORD_COUNT * NATIVE_SPATIAL_RECORD_SIZE,
    )
    records = []
    for record_index in range(NATIVE_SPATIAL_RECORD_COUNT):
        offset = record_index * NATIVE_SPATIAL_RECORD_SIZE
        map_bytes, x, y, z, radius_squared = struct.unpack_from(
            "<4sffff",
            data,
            offset,
        )
        try:
            map_identity = map_bytes.decode("ascii")
        except UnicodeDecodeError as error:
            raise PredicateValueError(
                f"spatial record {record_index + 1} has invalid map identity"
            ) from error
        if not all(
            math.isfinite(value)
            for value in (x, y, z, radius_squared)
        ):
            raise PredicateValueError(
                f"spatial record {record_index + 1} has non-finite data"
            )
        if radius_squared < 0:
            raise PredicateValueError(
                f"spatial record {record_index + 1} has a negative radius"
            )
        records.append({
            "index": record_index + 1,
            "mapIdentity": map_identity,
            "runtimePosition": [x, y, z],
            "browserPosition": [-x, y, z],
            "radiusSquared": radius_squared,
            "radius": math.sqrt(radius_squared),
        })
    return records


def build_report(executable: bytes, humans: bytes) -> dict[str, Any]:
    executable_digest = sha256(executable)
    humans_digest = sha256(humans)
    if executable_digest != EXECUTABLE_SHA256:
        raise PredicateValueError(
            f"unexpected 1ST_READ.BIN SHA-256: {executable_digest}"
        )
    if humans_digest != HUMANS_SHA256:
        raise PredicateValueError(
            f"unexpected HUMANS.AFS SHA-256: {humans_digest}"
        )

    resources = extract_resources(humans)
    unique_expressions = {}
    for resource in resources:
        for expression in resource["graph"]["expressions"]:
            unique_expressions[expression["id"]] = expression["ast"]
    kinds = Counter()
    operations = Counter()
    spatial_usage: dict[int, dict[str, Any]] = {
        index: {
            "index": index,
            "actorCodes": set(),
            "expressionIds": set(),
            "occurrenceCount": 0,
        }
        for index in range(1, NATIVE_SPATIAL_RECORD_COUNT + 1)
    }
    actor_runtime_usage: dict[int, dict[str, Any]] = {}
    for ast in unique_expressions.values():
        walk_ast(ast, kinds, operations)
    for resource in resources:
        for expression in resource["graph"]["expressions"]:
            indexes = ast_native_spatial_indexes(expression["ast"])
            for index in indexes:
                if index not in spatial_usage:
                    raise PredicateValueError(
                        f"predicate uses invalid spatial record {index}"
                    )
                usage = spatial_usage[index]
                usage["actorCodes"].add(resource["actorCode"])
                usage["expressionIds"].add(expression["id"])
                usage["occurrenceCount"] += len(expression["occurrences"])
            for index in ast_actor_runtime_indexes(expression["ast"]):
                usage = actor_runtime_usage.setdefault(index, {
                    "encodedIndex": index,
                    "actorCodes": set(),
                    "expressionIds": set(),
                    "occurrenceCount": 0,
                })
                usage["actorCodes"].add(resource["actorCode"])
                usage["expressionIds"].add(expression["id"])
                usage["occurrenceCount"] += len(expression["occurrences"])

    native_spatial_records = extract_native_spatial_records(executable)
    native_spatial_data = executable_slice(
        executable,
        NATIVE_SPATIAL_TABLE_ADDRESS,
        NATIVE_SPATIAL_RECORD_COUNT * NATIVE_SPATIAL_RECORD_SIZE,
    )
    native_state_banks = extract_native_state_banks(executable)
    actor_identities = extract_actor_identity_table(executable)
    for index, usage in actor_runtime_usage.items():
        if index >= ACTOR_IDENTITY_TABLE_COUNT:
            raise PredicateValueError(
                f"actor-runtime predicate uses invalid identity index {index}"
            )
        usage["resolvedIdentity"] = (
            "currentConversationActor" if index == 0
            else actor_identities[index]
        )
        if usage["resolvedIdentity"] is None:
            raise PredicateValueError(
                f"actor-runtime predicate uses empty identity index {index}"
            )

    return {
        "schema": "new-yokosuka-dialogue-predicate-values-v6",
        "evidenceBoundary": [
            "Value families and comparison directions come from the exact native evaluator and SHA-256-verified callees.",
            "The three persistent state banks have exact runtime addresses, zero-reset behavior, and native-save offsets; they retain their numeric bank names because story meanings for individual indexes are not invented.",
            "Runtime component modes 0 through 5 are proven by the native seven-byte calendar update, setter, copier, and Gregorian weekday routines.",
            "Runtime component mode 6 is persistent yen: the same selector 2 is read and written by native script operations 0x005f/0x0060, and the vending and capsule-toy payment paths subtract their authored yen prices through it.",
            "Actor-runtime type 5 uses zero for the current conversation actor and nonzero values as indexes into the verified 301-entry actor identity table, then returns that resident actor's field +0x90.",
            "Scheduled-actor descriptor operation 0x0f is the exact producer of actor field +0x90. Its numeric values remain unlabeled unless a script consumer proves their meaning.",
            "Native spatial type 6 indexes an exact executable-resident table of thirteen map-scoped X/Z circles; the browser X coordinate is the native X coordinate negated.",
        ],
        "executableEvidence": {
            "filename": "1ST_READ.BIN",
            "runtimeBase": hx(RUNTIME_BASE),
            "sha256": executable_digest,
            "verifiedCodeRanges": {
                name: {
                    "runtimeAddress": hx(address),
                    "size": size,
                    "sha256": sha256(
                        executable_slice(executable, address, size)
                    ),
                }
                for name, (address, size) in VERIFIED_RANGES.items()
            },
        },
        "archiveEvidence": {
            "filename": "HUMANS.AFS",
            "sha256": humans_digest,
            "byteLength": len(humans),
        },
        "nativeStateBanks": {
            "resetRoutine": hx(0x0C159290),
            "descriptorRoutine": hx(0x0C158C72),
            "saveExportRoutine": hx(0x0C09C854),
            "saveImportRoutine": hx(0x0C09C8B4),
            "defaultState": "all bytes zero",
            "banks": native_state_banks,
        },
        "nativeValueTypes": [
            {
                "type": 1,
                "encodedGroup": "0x60",
                "source": "signed 12-bit literal",
                "writable": False,
            },
            {
                "type": 2,
                "encodedGroup": "0x00",
                "source": "state bank 2 bit",
                "capacity": 1024,
                "writable": True,
                "operation0051ReadSuboperation": 11,
                "operation0051WriteSuboperation": 12,
            },
            {
                "type": 3,
                "encodedGroup": "0x20",
                "source": "state bank 3 bit",
                "capacity": 64,
                "writable": True,
                "operation0051ReadSuboperation": 13,
                "operation0051WriteSuboperation": 14,
            },
            {
                "type": 4,
                "encodedGroup": "0x40",
                "source": "state bank 4 byte",
                "capacity": 32,
                "writable": True,
                "operation0051ReadSuboperation": 15,
                "operation0051WriteSuboperation": 16,
                "specialEncoding": "0xfff becomes literal -1",
            },
            {
                "type": 1,
                "encodedGroup": "0xa0",
                "source": "runtime component mode",
                "modes": {
                    "0": "year since 1900",
                    "1": "month, 1 through 12",
                    "2": "day of month, 1 through 31",
                    "3": "weekday, Sunday 0 through Saturday 6",
                    "4": "hour, 0 through 23",
                    "5": "minute, 0 through 59",
                    "6": "persistent yen balance",
                },
                "writable": False,
            },
            {
                "type": 5,
                "encodedGroup": "0xc0",
                "source": (
                    "current actor or fixed identity-table index resolved "
                    "to resident actor runtime field +0x90"
                ),
                "zeroIdentityRule": "use current conversation person's identity",
                "nonzeroIdentityRule": (
                    "index the 301-entry table at 0x0c278d08"
                ),
                "runtimeFieldProducer": (
                    "scheduled-actor descriptor operation 0x0f"
                ),
                "writable": False,
            },
            {
                "type": 6,
                "encodedGroup": "0xe0",
                "source": "native indexed spatial comparison result",
                "validIndexes": "1..13",
                "writable": False,
            },
        ],
        "nativeCalendar": {
            "runtimeAddress": hx(0x0C225228),
            "byteLength": 7,
            "fields": [
                {"offset": 0, "name": "yearSince1900"},
                {"offset": 1, "name": "month", "range": "1..12"},
                {"offset": 2, "name": "dayOfMonth", "range": "1..31"},
                {
                    "offset": 3,
                    "name": "weekday",
                    "range": "0..6",
                    "zeroValue": "Sunday",
                },
                {"offset": 4, "name": "hour", "range": "0..23"},
                {"offset": 5, "name": "minute", "range": "0..59"},
                {
                    "offset": 6,
                    "name": "subMinuteTick",
                    "predicateMode": None,
                },
            ],
            "weekdayFormula": (
                "(day + floor((13 * adjustedMonth + 8) / 5) + "
                "adjustedYear + floor(adjustedYear / 4) - "
                "floor(adjustedYear / 100) + "
                "floor(adjustedYear / 400)) mod 7"
            ),
            "weekdayAdjustment": (
                "for January and February, add 12 to month and subtract "
                "1 from year"
            ),
            "yearBase": 1900,
        },
        "nativeCurrency": {
            "runtimeStructureAddress": hx(0x0C220A20),
            "runtimeStructureOffset": hx(0x18),
            "persistentValueSelector": 2,
            "scriptReadOperation": "0x005f",
            "scriptWriteOperation": "0x0060",
            "unit": "JPY",
            "independentEvidence": [
                "The native capsule-toy payment routine reads persistent selector 2, subtracts immediate 100, and writes selector 2.",
                "The vending affordability and MONEY_LOCK paths independently use selector 2 as their balance.",
            ],
        },
        "nativeActorRuntimeValues": {
            "identityTableAddress": hx(ACTOR_IDENTITY_TABLE_ADDRESS),
            "identityTableCount": ACTOR_IDENTITY_TABLE_COUNT,
            "zeroIdentityRule": "use current conversation actor identity",
            "nonzeroIdentityRule": (
                "use the encoded value as an index into fixedIdentities"
            ),
            "runtimeFieldOffset": hx(0x90),
            "runtimeFieldQuery": hx(0x0C119888),
            "runtimeFieldProducer": {
                "descriptorOperation": hx(0x0F),
                "handler": hx(0x0C119622),
                "effect": (
                    "copy the descriptor dword at +4 to actor runtime +0x90"
                ),
            },
            "numericMeaningPolicy": (
                "retain authored integer values until individual script "
                "consumers prove semantic labels"
            ),
            "fixedIdentities": actor_identities,
            "usage": [
                {
                    **usage,
                    "actorCodes": sorted(usage["actorCodes"]),
                    "expressionIds": sorted(usage["expressionIds"]),
                }
                for usage in actor_runtime_usage.values()
            ],
        },
        "nativeSpatialTable": {
            "runtimeAddress": hx(NATIVE_SPATIAL_TABLE_ADDRESS),
            "recordCount": NATIVE_SPATIAL_RECORD_COUNT,
            "recordSize": NATIVE_SPATIAL_RECORD_SIZE,
            "byteLength": len(native_spatial_data),
            "sha256": sha256(native_spatial_data),
            "recordFields": {
                "+0x00": "four-byte current-map identity",
                "+0x04": "center X",
                "+0x08": "stored middle coordinate; not compared",
                "+0x0c": "center Z",
                "+0x10": "squared radius",
            },
            "comparison": (
                "current map identity equals record map identity and "
                "(playerX-centerX)^2 + (playerZ-centerZ)^2 < radiusSquared"
            ),
            "boundaryRule": "strictly inside; the radius boundary is false",
            "records": native_spatial_records,
            "usage": [
                {
                    **usage,
                    "actorCodes": sorted(usage["actorCodes"]),
                    "expressionIds": sorted(usage["expressionIds"]),
                }
                for usage in spatial_usage.values()
            ],
        },
        "nativeOperators": {
            "0": "terminate",
            "1": "assign",
            "2": "increment",
            "3": "decrement",
            "4": "isZero",
            "5": "booleanAnd",
            "6": "booleanOr",
            "7": "equal",
            "8": "notEqual",
            "9": "greaterThan",
            "10": "greaterThanOrEqual",
            "11": "lessThan",
            "12": "lessThanOrEqual",
        },
        "corpus": {
            "resourceCount": len(resources),
            "uniqueExpressionCount": len(unique_expressions),
            "uniqueExpressionValueKindCounts": dict(sorted(kinds.items())),
            "uniqueExpressionOperatorCounts": dict(
                sorted(operations.items())
            ),
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.humans.read_bytes(),
    )
    write_json(args.output, report)
    print(json.dumps(report["corpus"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
