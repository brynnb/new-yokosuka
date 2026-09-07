#!/usr/bin/env python3
"""Prove native operation 0x006c's exact sound-command forwarding contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    ROOT.parent / "new-yokosuka" / ".disc-work" / "exact" / "1ST_READ.BIN"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/sound-command-operation-evidence.json"
DEFAULT_AICA_DRIVER = (
    ROOT.parent / "new-yokosuka" / "extracted_files" / "data/SOUND/AICADRV.BIN"
)
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RUNTIME_BASE = 0x0C010000
HANDLER_ADDRESS = 0x0C16B110
SOUND_DISPATCH_ADDRESS = 0x0C17A91C
HANDLER_SIZE = 16
HANDLER_BYTES = bytes.fromhex(
    "e62f536ee26443d3e256e1552b43f66e"
)
DISPATCHER_SIZE = 0xD4
DISPATCHER_SHA256 = (
    "1ac3cdcc487ca9bb3ed1bd10e967b90f2be4ca2792258dbe74ac05ff6cbc5d7f"
)
DIRECT_QUEUE_THRESHOLD_ADDRESS = 0x0C17A9FA
DIRECT_QUEUE_THRESHOLD = 0x00A8
PARAMETERIZED_THRESHOLD_ADDRESS = 0x0C17A9FC
PARAMETERIZED_THRESHOLD = 0x00A5
PARAMETERIZED_HANDLER_POINTER_ADDRESS = 0x0C17AA14
PARAMETERIZED_HANDLER_ADDRESS = 0x0C1D4770
DIRECT_QUEUE_POINTER_ADDRESS = 0x0C17AA20
DIRECT_QUEUE_ADDRESS = 0x0C1D4B18
AICA_DRIVER_SHA256 = (
    "3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915"
)
AICA_INGEST_OFFSET = 0x0710
AICA_INGEST_SIZE = 0xD0
AICA_INGEST_SHA256 = (
    "0d4d1aea5295a916943c639ab4391b275cd0284a7b0650942a49373e0e095fb2"
)
AICA_DISPATCH_PREFIX_OFFSET = 0x41C4
AICA_DISPATCH_PREFIX = bytes.fromhex(
    "e0008ce5201ea0e1080051e38e00003a071001e2"
)
AICA_IGNORED_RETURN_OFFSET = 0x4410
AICA_IGNORED_RETURN = bytes.fromhex("0080bde8")
PARAMETERIZED_HANDLER_SIZE = 0x108
PARAMETERIZED_HANDLER_SHA256 = (
    "fd391c1cbee2149434ee9334a8903b9d0364db8faa0486d976281281b9f52eaf"
)


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[offset:offset + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def u16(data: bytes, address: int) -> int:
    return struct.unpack("<H", runtime_slice(data, address, 2))[0]


def parameterized_fast_path(command_word: int, argument_one: int) -> dict:
    """Evaluate the executable's no-0xff00 fast path at 0x0c1d4780."""
    if argument_one & 0xFF00:
        raise ValueError("sound command does not use the verified fast path")
    queued_word = ((command_word & 0xF) << 24) + argument_one
    driver_word = int.from_bytes(queued_word.to_bytes(4, "little"), "big")
    return {
        "constructedQueueWord": f"0x{queued_word:08x}",
        "byteReversedDriverWord": f"0x{driver_word:08x}",
        "driverTopNibble": driver_word >> 28,
        "playerVisibleEffect": "none" if driver_word >> 28 < 8 else "unresolved",
    }


def build_report(executable: bytes, aica_driver: bytes | None = None) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    handler = runtime_slice(executable, HANDLER_ADDRESS, HANDLER_SIZE)
    if handler != HANDLER_BYTES:
        raise ValueError("operation 0x006c handler signature changed")
    if u32(executable, 0x0C16B224) != SOUND_DISPATCH_ADDRESS:
        raise ValueError("operation 0x006c sound dispatch target changed")
    dispatcher = runtime_slice(
        executable,
        SOUND_DISPATCH_ADDRESS,
        DISPATCHER_SIZE,
    )
    if digest(dispatcher) != DISPATCHER_SHA256:
        raise ValueError("sound dispatcher signature changed")
    exact_values = (
        (DIRECT_QUEUE_THRESHOLD_ADDRESS, 2, DIRECT_QUEUE_THRESHOLD),
        (PARAMETERIZED_THRESHOLD_ADDRESS, 2, PARAMETERIZED_THRESHOLD),
        (
            PARAMETERIZED_HANDLER_POINTER_ADDRESS,
            4,
            PARAMETERIZED_HANDLER_ADDRESS,
        ),
        (DIRECT_QUEUE_POINTER_ADDRESS, 4, DIRECT_QUEUE_ADDRESS),
    )
    for address, width, expected in exact_values:
        actual = u16(executable, address) if width == 2 else u32(executable, address)
        if actual != expected:
            raise ValueError(f"sound dispatcher value at 0x{address:08x} changed")
    parameterized_handler = runtime_slice(
        executable,
        PARAMETERIZED_HANDLER_ADDRESS,
        PARAMETERIZED_HANDLER_SIZE,
    )
    if digest(parameterized_handler) != PARAMETERIZED_HANDLER_SHA256:
        raise ValueError("parameterized sound handler signature changed")
    if aica_driver is None:
        aica_driver = DEFAULT_AICA_DRIVER.read_bytes()
    if digest(aica_driver) != AICA_DRIVER_SHA256:
        raise ValueError("unexpected AICADRV.BIN")
    aica_ingest = aica_driver[
        AICA_INGEST_OFFSET:AICA_INGEST_OFFSET + AICA_INGEST_SIZE
    ]
    if digest(aica_ingest) != AICA_INGEST_SHA256:
        raise ValueError("AICA command ingest signature changed")
    if (
        aica_driver[
            AICA_DISPATCH_PREFIX_OFFSET:
            AICA_DISPATCH_PREFIX_OFFSET + len(AICA_DISPATCH_PREFIX)
        ]
        != AICA_DISPATCH_PREFIX
    ):
        raise ValueError("AICA command dispatcher signature changed")
    if (
        aica_driver[
            AICA_IGNORED_RETURN_OFFSET:
            AICA_IGNORED_RETURN_OFFSET + len(AICA_IGNORED_RETURN)
        ]
        != AICA_IGNORED_RETURN
    ):
        raise ValueError("AICA ignored-command return changed")
    return {
        "schema": "new-yokosuka-sound-command-operation-evidence-v2",
        "evidenceBoundary": [
            "The verified operation 0x006c handler is a tail-call wrapper.",
            "It forwards native arguments zero, one, and two unchanged as r4, r5, and r6 to 0x0c17a91c.",
            "The verified dispatcher compares the command's unsigned low byte with 0xA8 and sends values at or above that threshold directly to the AICA command queue at 0x0c1d4b18.",
            "Low-byte values below 0xA5 take a separate parameter-building handler at 0x0c1d4770 before reaching that queue.",
            "The MA00 authored start/stop command pairs independently establish that the target is the native sound-command dispatcher.",
            "The thresholds and queue routes do not establish player-visible meanings for individual A0-family commands; those remain numeric unless separately evidenced.",
            "For parameterized commands whose argument one has no 0xff00 bits, the verified fast path constructs (command low nibble << 24) + argument one; the AICA driver byte-reverses that word and ignores a resulting top nibble below eight.",
        ],
        "executable": {
            "filename": "1ST_READ.BIN",
            "runtimeBase": f"0x{RUNTIME_BASE:08x}",
            "sha256": digest(executable),
        },
        "operation": {
            "operationId": 0x006C,
            "operationHex": "0x006c",
            "semanticId": "sound-command-dispatch",
            "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
            "handlerSize": HANDLER_SIZE,
            "handlerSha256": digest(handler),
            "dispatchAddress": f"0x{SOUND_DISPATCH_ADDRESS:08x}",
            "forwardedArguments": [0, 1, 2],
            "returnBehavior": "tail-call return value is forwarded unchanged",
        },
        "dispatcher": {
            "address": f"0x{SOUND_DISPATCH_ADDRESS:08x}",
            "size": DISPATCHER_SIZE,
            "sha256": digest(dispatcher),
            "commandClassification": "unsigned low byte of argument zero",
            "directQueue": {
                "minimumInclusive": DIRECT_QUEUE_THRESHOLD,
                "minimumInclusiveHex": f"0x{DIRECT_QUEUE_THRESHOLD:02x}",
                "targetAddress": f"0x{DIRECT_QUEUE_ADDRESS:08x}",
                "behavior": "forwards the complete command word unchanged",
            },
            "parameterizedRoute": {
                "maximumExclusive": PARAMETERIZED_THRESHOLD,
                "maximumExclusiveHex": f"0x{PARAMETERIZED_THRESHOLD:02x}",
                "targetAddress": f"0x{PARAMETERIZED_HANDLER_ADDRESS:08x}",
                "behavior": "constructs a queued command from all three arguments",
                "individualCommandMeanings": "unresolved",
            },
        },
        "aicaDriver": {
            "filename": "AICADRV.BIN",
            "sha256": digest(aica_driver),
            "externalQueueIngest": {
                "fileOffset": f"0x{AICA_INGEST_OFFSET:04x}",
                "size": AICA_INGEST_SIZE,
                "sha256": digest(aica_ingest),
                "behavior": "consumes one nonzero external word, clears its slot, byte-reverses it, and dispatches the reversed word",
            },
            "commandDispatcher": {
                "fileOffset": f"0x{AICA_DISPATCH_PREFIX_OFFSET:04x}",
                "classification": "top nibble of byte-reversed queued word",
                "belowEightTarget": f"0x{AICA_IGNORED_RETURN_OFFSET:04x}",
                "belowEightBehavior": "returns without a sound-handler dispatch",
            },
            "provenIgnoredControls": [
                {
                    "area": area,
                    "nativeCommandWord": f"0x{command_word:08x}",
                    "dreamcastByteOrder": dreamcast,
                    "argumentsOneAndTwo": [argument_one, argument_two],
                    **parameterized_fast_path(command_word, argument_one),
                    "scope": "this exact command and argument tuple only",
                }
                for area, command_word, dreamcast, argument_one, argument_two in [
                    ("D000", 0x000004A0, "A0040000", 2, 115),
                    ("OP02", 0x000004A0, "A0040000", 2, 100),
                    ("OP02", 0x00000AA0, "A00A0000", 2, 30),
                ]
            ],
        },
        "authoredCorroboration": {
            "source": "docs/research/shenmue1/native-world-audio.md",
            "area": "MA00",
            "bank": "A904",
            "provenStartStopPairs": [[1, 2], [13, 14], [17, 18], [19, 20]],
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--aica-driver", type=Path, default=DEFAULT_AICA_DRIVER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.aica_driver.read_bytes(),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report["operation"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
