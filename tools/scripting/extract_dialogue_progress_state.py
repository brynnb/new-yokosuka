#!/usr/bin/env python3
"""Recover the native free-conversation progress table and resume rules.

Conversation bytecode can yield while text, animation, or an event is
running. The game stores the offsets needed to resume those programs in a
325-entry global table. Treating a yielded instruction as ordinary
fallthrough produces false opcodes and false dialogue lines.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_EXECUTABLE,
    EXECUTABLE_SHA256,
    RUNTIME_BASE,
    hx,
    sha256,
    write_json,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = ROOT / "tools" / "evidence" / "dialogue-progress-state.json"
TABLE_ADDRESS = 0x0C222F40
TABLE_RECORD_COUNT = 325
TABLE_RECORD_SIZE = 12
IDENTITY_INDEX_ADDRESS = 0x0C278D08
IDENTITY_INDEX_COUNT = 301
DYNAMIC_INDEX_COUNT = TABLE_RECORD_COUNT - IDENTITY_INDEX_COUNT
DYNAMIC_CURSOR_ADDRESS = 0x0C223E8C
DYNAMIC_IDENTITIES_ADDRESS = 0x0C223E90
INITIAL_METRIC_THRESHOLD_ADDRESS = 0x0C158BF0
INITIAL_METRIC_THRESHOLD_BITS = 0x41100000
INITIAL_METRIC_THRESHOLD = 9.0

VERIFIED_RANGES = {
    "progressTableInitializer": (0x0C158A6C, 0x13A),
    "progressMetricThresholdLiteral": (
        INITIAL_METRIC_THRESHOLD_ADDRESS,
        4,
    ),
    "progressIndexAllocator": (0x0C15A39A, 0xD6),
    "fixedIdentityIndexLookup": (0x0C15AE76, 0x74),
    "fixedIdentityIndexTable": (
        IDENTITY_INDEX_ADDRESS,
        IDENTITY_INDEX_COUNT * 4,
    ),
    "conversationStartPointerSelector": (0x0C15CCF6, 0x1CE),
    "lowOpcodeAndProgressHandler": (0x0C15CECC, 0x2D4),
    "conversationUpdateProgressWrites": (0x0C15C8DE, 0x106),
    "state5DeferredContinuationCompletion": (0x0C15CBF6, 0xBC),
}


class ProgressStateError(ValueError):
    """The executable does not match the recovered progress-state evidence."""


def executable_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ProgressStateError(
            f"executable range {hx(address)}+{size} is unavailable"
        )
    return data[offset : offset + size]


def build_report(executable: bytes) -> dict[str, Any]:
    digest = sha256(executable)
    if digest != EXECUTABLE_SHA256:
        raise ProgressStateError(f"unexpected 1ST_READ.BIN SHA-256: {digest}")

    ranges = {}
    for name, (address, size) in VERIFIED_RANGES.items():
        code = executable_slice(executable, address, size)
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": sha256(code),
        }
    threshold_bits = int.from_bytes(
        executable_slice(executable, INITIAL_METRIC_THRESHOLD_ADDRESS, 4),
        "little",
    )
    if threshold_bits != INITIAL_METRIC_THRESHOLD_BITS:
        raise ProgressStateError(
            "unexpected native dialogue metric threshold literal "
            f"{threshold_bits:#010x}"
        )
    identity_bytes = executable_slice(
        executable,
        IDENTITY_INDEX_ADDRESS,
        IDENTITY_INDEX_COUNT * 4,
    )
    identities = []
    for index in range(IDENTITY_INDEX_COUNT):
        encoded = identity_bytes[index * 4 : index * 4 + 4]
        if encoded == b"\x00\x00\x00\x00":
            identities.append(None)
            continue
        if any(value < 0x20 or value > 0x7E for value in encoded):
            raise ProgressStateError(
                f"invalid progress identity bytes at index {index}: "
                f"{encoded.hex()}"
            )
        identities.append(encoded.decode("ascii"))
    named_identities = [identity for identity in identities if identity]
    if len(set(named_identities)) != len(named_identities):
        raise ProgressStateError("native progress identity table has duplicates")

    return {
        "schema": "new-yokosuka-dialogue-progress-state-v1",
        "evidenceBoundary": [
            "All code claims are tied to SHA-256-verified ranges in the exact Disc 1 executable.",
            "Field names describe observed pointer/offset use only; unknown game semantics are not invented.",
            "The table is runtime state, not authored dialogue content. It must be modeled to resume yielded bytecode without linear scanning.",
            "External animation, presentation, and player-input completion conditions remain separate from bytecode control flow.",
        ],
        "executableEvidence": {
            "filename": "1ST_READ.BIN",
            "runtimeBase": hx(RUNTIME_BASE),
            "sha256": digest,
            "verifiedCodeRanges": ranges,
        },
        "nativeTable": {
            "runtimeAddress": hx(TABLE_ADDRESS),
            "recordCount": TABLE_RECORD_COUNT,
            "recordSize": TABLE_RECORD_SIZE,
            "byteLength": TABLE_RECORD_COUNT * TABLE_RECORD_SIZE,
            "indexSource": "runtime person record signed halfword +0x18",
            "initialization": (
                "the first eight bytes are zeroed and the final float is "
                "initialized from the verified 9.0 literal"
            ),
            "fields": [
                {
                    "offset": "0x0",
                    "size": 2,
                    "observedUse": "selected entry offset from runtime routing base +0x40",
                },
                {
                    "offset": "0x2",
                    "size": 2,
                    "observedUse": "continuation/start offset used by conversation resume selection",
                },
                {
                    "offset": "0x4",
                    "size": 2,
                    "observedUse": "authored progress boundary offset",
                },
                {
                    "offset": "0x6",
                    "size": 2,
                    "observedUse": "latest/resume offset within the routing stream",
                },
                {
                    "offset": "0x8",
                    "size": 4,
                    "type": "little-endian float32",
                    "initialValue": INITIAL_METRIC_THRESHOLD,
                    "initialBits": f"0x{INITIAL_METRIC_THRESHOLD_BITS:08x}",
                    "observedUse": "per-record metric threshold compared during native person selection",
                },
            ],
        },
        "nativeIdentityIndex": {
            "runtimeAddress": hx(IDENTITY_INDEX_ADDRESS),
            "recordSize": 4,
            "fixedIndexCount": IDENTITY_INDEX_COUNT,
            "namedIdentityCount": len(named_identities),
            "emptyFixedSlotCount": identities.count(None),
            "dynamicIndexStart": IDENTITY_INDEX_COUNT,
            "dynamicIndexCount": DYNAMIC_INDEX_COUNT,
            "dynamicCursorAddress": hx(DYNAMIC_CURSOR_ADDRESS),
            "dynamicIdentitiesAddress": hx(DYNAMIC_IDENTITIES_ADDRESS),
            "dynamicCursorInitialValue": DYNAMIC_INDEX_COUNT - 1,
            "dynamicIdentityInitialValue": "0xffffffff",
            "entries": [
                {"index": index, "identity": identity}
                for index, identity in enumerate(identities)
            ],
            "observedBehavior": (
                "native lookup 0x0c15ae76 maps an actor identity to its "
                "fixed index; identities absent from this table use the "
                "24-slot runtime pool at indices 301 through 324; existing "
                "dynamic identities retain their slot, while a new identity "
                "increments and wraps the cursor before replacing that slot"
            ),
            "zeroIndexBehavior": (
                "the allocator treats fixed lookup result zero as unresolved, "
                "so AKIR follows the dynamic-pool path in this routine"
            ),
        },
        "runtimePersonFields": [
            {"offset": "0x9", "size": 1, "observedUse": "conversation execution state"},
            {"offset": "0x18", "size": 2, "observedUse": "signed progress-table record index"},
            {"offset": "0x40", "size": 4, "observedUse": "routing bytecode base pointer"},
            {"offset": "0x58", "size": 4, "observedUse": "current/yielded bytecode pointer"},
            {"offset": "0x5c", "size": 4, "observedUse": "deferred continuation pointer"},
            {"offset": "0x60", "size": 4, "observedUse": "one-shot branch continuation pointer"},
            {"offset": "0x64", "size": 4, "observedUse": "24-bit branch continuation pointer"},
        ],
        "verifiedResumeRules": [
            {
                "instruction": "F2",
                "initialReturn": "opcode + 1 unless byte at opcode + 4 is class 0x90",
                "yieldState": 5,
                "progressWrite": "record +0 receives (opcode + 1) minus routing base when persistence flags permit",
                "completion": {
                    "ordinary": "advance runtime +0x58 by three bytes",
                    "deferredGuard": "runtime flags +0x1e bit 0 is set and bit 6 is clear",
                    "operand": "read a big-endian signed 24-bit displacement at routing base + record +0x02",
                    "zeroDisplacement": "clear runtime +0x5c and set +0x58 to operand end",
                    "nonzeroDisplacement": "set runtime +0x5c to operand end, set +0x58 to operand end plus displacement, and set flags +0x1e bit 7",
                    "finalMutation": "clear flags +0x1e bit 0 after either deferred result",
                },
                "effectiveStructuralContinuation": "opcode + 4",
                "note": "The four-byte continuation is a two-stage native transition, not ordinary instruction fallthrough.",
            },
            {
                "instructionClass": "0x10",
                "observedBehavior": [
                    "records the current offset in record +6 when execution has moved away from the selected entry",
                    "clears record +4 after recording that resume offset",
                    "may redirect to record +6, record +4 minus two, or record +2 depending current progress ordering",
                ],
            },
            {
                "instructionClass": "0x80",
                "observedBehavior": "stores opcode +2 in runtime +0x60 before following its signed 12-bit branch",
            },
            {
                "instruction": "F5",
                "observedBehavior": "stores its signed 24-bit branch target in runtime +0x64",
            },
            {
                "instruction": "F9",
                "observedBehavior": "resumes through runtime +0x60 or +0x5c according to native flags and consumes or updates the selected continuation",
                "staticLimit": "paths depending on an externally populated +0x5c pointer must remain explicitly dynamic",
            },
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--stdout", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(args.executable.read_bytes())
    write_json(args.output, report)
    if args.stdout:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
