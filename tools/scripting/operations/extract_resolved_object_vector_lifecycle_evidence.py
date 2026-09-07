#!/usr/bin/env python3
"""Verify the authored 0x0018 and 0x0019 object-vector contracts."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/resolved-object-vector-lifecycle-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLERS = {
    0x0018: (
        0x0C157530,
        234,
        "37fa8af0f26b2617d25e231afbaaa0a85b9abab65719272789d75328d63a1a6d",
    ),
    0x0019: (
        0x0C157678,
        208,
        "58185d168fd3ef71fa0f3a732616dfc3a321aa664d9a230b95cb81d0eac273c1",
    ),
}
INITIALIZER_FLAGS = {
    0x28000000,
    0x38000000,
    0x78000000,
    0xA8000000,
    0xB8000000,
}
BASE_QUERY_SELECTOR = 0xFFFFFFFF
BASE_QUERY_FLAGS = {0, 0x40000000}
ZERO_FALLBACK_QUERY_FLAG = 0x01000000
INDEXED_QUERY_SELECTORS = {
    0, 2, 4, 5, 6, 9, 11, 12, 17, 18, 20, 25, 26, 27, 33,
}
INDEXED_QUERY_HELPERS = {
    "directIndexedHelper": (
        0x0C113C3C,
        108,
        "dbca637bf748ddcdc87e390713c06efd1c5b07a8a3e6e065fe2adcd99f03c4af",
    ),
    "associatedIndexedHelper": (
        0x0C113CA8,
        64,
        "d68d3aac5c4042260b8dc17b15b07fbf2e2402e9378104e16134f1be1d2b2baf",
    ),
    "indexedVectorLookup": (
        0x0C10C400,
        66,
        "ff0ea81a1bccb07e5e581a9c486d511e980fd1a87e0960a0fd669873ba9ea666",
    ),
    "directPointInverseTransform": (
        0x0C08D5A0,
        156,
        "d4b6f2bddbd419c770a4c89e87b596a783d5f37a8202b5df81c400e94159025c",
    ),
    "directZeroFallbackIndexedHelper": (
        0x0C113D08,
        88,
        "4be40178f35bbcc47913ed837a64c68db952d8dacb4dac4dcaba759a2aab33c2",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def operation_calls(
    event_ir: dict[str, Any],
    operation_id: int,
) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != operation_id
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def constant_argument(call: dict[str, Any], index: int) -> int | None:
    arguments = call["arguments"]
    if index >= len(arguments) or arguments[index].get("kind") != "constant":
        return None
    return arguments[index].get("value")


def initializer_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        call
        for call in operation_calls(event_ir, 0x0018)
        if (
            len(call["arguments"]) == 3
            and constant_argument(call, 1) in INITIALIZER_FLAGS
        )
    ]


def base_query_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        call
        for call in operation_calls(event_ir, 0x0019)
        if (
            len(call["arguments"]) == 4
            and constant_argument(call, 1) == BASE_QUERY_SELECTOR
            and constant_argument(call, 3) in BASE_QUERY_FLAGS
        )
    ]


def indexed_query_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        call
        for call in operation_calls(event_ir, 0x0019)
        if (
            len(call["arguments"]) == 4
            and constant_argument(call, 1) in INDEXED_QUERY_SELECTORS
            and constant_argument(call, 3) in BASE_QUERY_FLAGS
        )
    ]


def frame_selector_query_calls(
    event_ir: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        call
        for call in operation_calls(event_ir, 0x0019)
        if (
            len(call["arguments"]) == 4
            and call["arguments"][1].get("kind") == "frame-field"
            and constant_argument(call, 3) in BASE_QUERY_FLAGS
        )
    ]


def zero_fallback_query_calls(
    event_ir: dict[str, Any],
) -> list[dict[str, Any]]:
    return [
        call
        for call in operation_calls(event_ir, 0x0019)
        if (
            len(call["arguments"]) == 4
            and call["arguments"][1].get("kind") in {
                "constant", "frame-field",
            }
            and constant_argument(call, 3) == ZERO_FALLBACK_QUERY_FLAG
        )
    ]


def compact_inventory(calls: list[dict[str, Any]], flag_index: int) -> dict:
    return {
        "callCount": len(calls),
        "dialogueRegionCallCount": sum(
            call["dialogueRegion"] for call in calls
        ),
        "areaCount": len({
            (call["disc"], call["area"])
            for call in calls
        }),
        "flagCounts": {
            f"0x{value:08x}": count
            for value, count in sorted(Counter(
                constant_argument(call, flag_index)
                for call in calls
            ).items())
        },
        "objectArgumentKindCounts": dict(sorted(Counter(
            call["arguments"][0]["kind"]
            for call in calls
        ).items())),
    }


def verify_native_contract(executable: bytes) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for operation_id, (address, length, digest) in HANDLERS.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(
                f"operation-0x{operation_id:04x} handler changed"
            )
    for name, (address, length, digest) in INDEXED_QUERY_HELPERS.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0019 {name} changed")
    initializer_literals = {
        "objectResolver": u32(executable, 0x0C157764),
        "associatedVectorRead": u32(executable, 0x0C15776C),
        "directVectorRead": u32(executable, 0x0C157770),
        "zComponentMask": u32(executable, 0x0C157774),
        "yComponentMask": u32(executable, 0x0C157778),
        "xComponentMask": u32(executable, 0x0C15777C),
        "replaceMask": u32(executable, 0x0C157780),
        "associatedVectorWrite": u32(executable, 0x0C157784),
        "directVectorWrite": u32(executable, 0x0C157788),
        "activationWrite": u32(executable, 0x0C15778C),
    }
    if initializer_literals != {
        "objectResolver": 0x0C153956,
        "associatedVectorRead": 0x0C0AB02E,
        "directVectorRead": 0x0C0AAF10,
        "zComponentMask": 0x08000000,
        "yComponentMask": 0x10000000,
        "xComponentMask": 0x20000000,
        "replaceMask": 0x80000000,
        "associatedVectorWrite": 0x0C0AB052,
        "directVectorWrite": 0x0C0AAF32,
        "activationWrite": 0x0C0AB1F0,
    }:
        raise ValueError("operation-0x0018 dependencies changed")
    query_literals = {
        "directIndexedQuery": u32(executable, 0x0C1577B8),
        "associatedIndexedQuery": u32(executable, 0x0C1577A8),
    }
    if query_literals != {
        "directIndexedQuery": 0x0C113C3C,
        "associatedIndexedQuery": 0x0C113CA8,
    }:
        raise ValueError("operation-0x0019 dependencies changed")
    indexed_query_literals = {
        "recordTag": u32(executable, 0x0C113CEC),
        "associatedRecordResolver": u32(executable, 0x0C113CF0),
        "indexedVectorLookup": u32(executable, 0x0C113CF4),
        "directTransformAccessor": u32(executable, 0x0C113CF8),
        "directPointInverseTransform": u32(executable, 0x0C113CFC),
        "directBaseFallback": u32(executable, 0x0C113D00),
        "associatedBaseFallback": u32(executable, 0x0C113D04),
        "selectorListLookup": u32(executable, 0x0C10C518),
    }
    if indexed_query_literals != {
        "recordTag": 0x4D544F4D,
        "associatedRecordResolver": 0x0C0AAD5A,
        "indexedVectorLookup": 0x0C10C400,
        "directTransformAccessor": 0x0C0AB0E2,
        "directPointInverseTransform": 0x0C08D5A0,
        "directBaseFallback": 0x0C0AAF10,
        "associatedBaseFallback": 0x0C0AB02E,
        "selectorListLookup": 0x0C092EA0,
    }:
        raise ValueError("operation-0x0019 indexed dependencies changed")
    return {
        "initializer": initializer_literals,
        "baseQuery": {
            "directVectorRead": "0x0c0aaf10",
            "associatedVectorRead": "0x0c0ab02e",
            **{
                name: f"0x{value:08x}"
                for name, value in query_literals.items()
            },
        },
        "indexedQuery": {
            **{
                name: f"0x{value:08x}"
                for name, value in indexed_query_literals.items()
            },
            "verifiedRanges": {
                name: {
                    "address": f"0x{address:08x}",
                    "length": length,
                    "sha256": digest,
                }
                for name, (address, length, digest)
                in INDEXED_QUERY_HELPERS.items()
            },
        },
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    all_initializer = operation_calls(event_ir, 0x0018)
    initializers = initializer_calls(event_ir)
    all_queries = operation_calls(event_ir, 0x0019)
    base_queries = base_query_calls(event_ir)
    indexed_queries = indexed_query_calls(event_ir)
    frame_selector_queries = frame_selector_query_calls(event_ir)
    zero_fallback_queries = zero_fallback_query_calls(event_ir)
    if (len(all_initializer), len(initializers)) != (4349, 4349):
        raise ValueError("operation-0x0018 authored inventory changed")
    if (len(all_queries), len(base_queries)) != (5943, 4042):
        raise ValueError("operation-0x0019 authored inventory changed")
    if len(indexed_queries) != 721:
        raise ValueError("operation-0x0019 indexed inventory changed")
    if len(frame_selector_queries) != 480:
        raise ValueError("operation-0x0019 frame-selector inventory changed")
    if len(zero_fallback_queries) != 672:
        raise ValueError("operation-0x0019 zero-fallback inventory changed")
    return {
        "schema": "new-yokosuka-resolved-object-vector-lifecycle-v1",
        "status": "exact-native-handlers-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "nativeContract": native_contract,
        "initializer": {
            "operationId": 0x0018,
            "operationHex": "0x0018",
            "handlerAddress": "0x0c157530",
            "handlerLength": HANDLERS[0x0018][1],
            "handlerSha256": HANDLERS[0x0018][2],
            "provenBehavior": (
                "Resolves argument zero as an object; reads either its direct "
                "or associated three-float vector according to flag bit "
                "0x40000000; replaces selected components when bit "
                "0x80000000 is set or adds them otherwise; selects X, Y, and "
                "Z with bits 0x20000000, 0x10000000, and 0x08000000; writes "
                "the vector through the matching path; then writes one to "
                "the resolved object's word at byte offset 0x84."
            ),
            "inventory": compact_inventory(initializers, 1),
            "unselectedMalformedCallCount": (
                len(all_initializer) - len(initializers)
            ),
        },
        "baseVectorQuery": {
            "operationId": 0x0019,
            "operationHex": "0x0019",
            "handlerAddress": "0x0c157678",
            "handlerLength": HANDLERS[0x0019][1],
            "handlerSha256": HANDLERS[0x0019][2],
            "selector": "0xffffffff",
            "provenBehavior": (
                "When argument one is -1, resolves argument zero and copies "
                "its direct three-float vector to the destination supplied "
                "by argument two; argument-three bit 0x40000000 selects the "
                "associated-object transform path instead."
            ),
            "inventory": compact_inventory(base_queries, 3),
            "remainingIndexedOrUnresolvedCallCount": (
                len(all_queries) - len(base_queries)
            ),
        },
        "indexedVectorQuery": {
            "operationId": 0x0019,
            "operationHex": "0x0019",
            "handlerAddress": "0x0c157678",
            "recordTag": "MOTM",
            "selectors": sorted(INDEXED_QUERY_SELECTORS),
            "flags": ["0x00000000", "0x40000000"],
            "provenBehavior": (
                "For a nonnegative authored selector, resolves the object's "
                "literal MOTM record and scans its 72-byte component list "
                "until the matching signed selector byte or -1 sentinel. A "
                "match copies the selected matrix translation at offsets "
                "+0x30/+0x34/+0x38. The direct flag-zero route then applies "
                "the object's exact inverse point transform when its pointer "
                "is present; the associated route keeps the copied vector. "
                "A missing MOTM record or selector match falls back to the "
                "same direct or associated base-vector read used by selector "
                "-1."
            ),
            "inventory": compact_inventory(indexed_queries, 3),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(Counter(
                    constant_argument(call, 1)
                    for call in indexed_queries
                ).items())
            },
            "unselectedMalformedCallCount": (
                len(all_queries)
                - len(base_queries)
                - len(indexed_queries)
                - len(frame_selector_queries)
                - len(zero_fallback_queries)
            ),
        },
        "frameSelectorVectorQuery": {
            "operationId": 0x0019,
            "operationHex": "0x0019",
            "handlerAddress": "0x0c157678",
            "selectorSource": "coroutine-frame dword",
            "flags": ["0x00000000", "0x40000000"],
            "provenBehavior": (
                "Reads the signed selector from the exact coroutine frame. "
                "A value of -1 takes the matching direct or associated base "
                "vector path; every other value takes the same MOTM lookup "
                "and native fallback path as a constant selector."
            ),
            "inventory": compact_inventory(frame_selector_queries, 3),
        },
        "zeroFallbackVectorQuery": {
            "operationId": 0x0019,
            "operationHex": "0x0019",
            "handlerAddress": "0x0c157678",
            "helperAddress": "0x0c113d08",
            "flag": "0x01000000",
            "provenBehavior": (
                "Selector -1 copies the direct base vector. Every other "
                "selector resolves the associated MOTM component, applies "
                "the direct inverse point transform on a match, and writes "
                "three float32 zero words when the record or selector is "
                "absent."
            ),
            "inventory": compact_inventory(zero_fallback_queries, 3),
        },
        "evidenceBoundary": [
            "Only exact three-argument 0x0018 calls using the five authored flag words receive the initializer semantic.",
            "Only four-argument 0x0019 calls with selector -1 and an exact authored direct/associated flag receive the base-query semantic.",
            "All 721 well-formed constant-indexed and 480 exact frame-selector 0x0019 calls use the two proven direct/associated paths.",
            "All 672 exact 0x01000000 calls use the separately pinned zero-fallback direct-space helper.",
            "Twenty-eight calls with incomplete operands remain unresolved.",
            "MOTM remains a literal native record tag; individual selector meanings are not named.",
            "An exact MOTM record/list result and, for a direct matched component, exact object-transform state are runtime prerequisites.",
            "No object-specific story label is inferred from a four-byte tag.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['initializer']['inventory']['callCount']} initializers, "
        f"{report['baseVectorQuery']['inventory']['callCount']} base queries, "
        f"{report['indexedVectorQuery']['inventory']['callCount']} indexed "
        "queries, "
        f"{report['frameSelectorVectorQuery']['inventory']['callCount']} "
        "frame-selector queries, "
        f"{report['zeroFallbackVectorQuery']['inventory']['callCount']} "
        "zero-fallback queries"
    )


if __name__ == "__main__":
    main()
