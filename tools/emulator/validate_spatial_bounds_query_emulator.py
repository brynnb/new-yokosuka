#!/usr/bin/env python3
"""Observe a natural operation-0x000a execution in live Flycast."""

from __future__ import annotations

import argparse
import json
import struct
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


HANDLER_ADDRESS = 0x0C155878
RESULT_WRITER_ADDRESS = 0x0C0BB358
RESULT_WRITER_RETURN_ADDRESS = 0x0C0BB36C
HANDLER_BREAKPOINT_ADDRESS = HANDLER_ADDRESS | 0x80000000
RESULT_WRITER_BREAKPOINT_ADDRESS = RESULT_WRITER_ADDRESS | 0x80000000
RESULT_WRITER_RETURN_BREAKPOINT_ADDRESS = (
    RESULT_WRITER_RETURN_ADDRESS | 0x80000000
)


def hex_words(data: bytes) -> list[str]:
    return [
        f"0x{value:08x}"
        for value in struct.unpack(f"<{len(data) // 4}I", data)
    ]


def vector(remote: FlycastRemote, address: int) -> dict[str, object]:
    raw = remote.read_memory(address, 12)
    return {
        "address": f"0x{address:08x}",
        "wordHex": hex_words(raw),
        "float32": list(struct.unpack("<3f", raw)),
    }


@dataclass(frozen=True)
class Observation:
    handler_address: str
    handler_breakpoint_address: str
    argument_array_address: str
    argument_words: list[str]
    object_reference_argument: str
    translation_reference_argument: str
    source_vector_a: dict[str, object]
    source_vector_b: dict[str, object]
    resolved_object_address: str
    translation_vector: list[float]
    normalized_xz_minimum: list[float]
    normalized_xz_maximum: list[float]
    object_position: list[float]
    native_result_argument: int
    expected_result_argument: int
    result_argument_matches: bool
    result_slot_address: str
    result_slot_before: str
    result_slot_after: str
    expected_result_slot_after: str
    result_slot_matches: bool


def observe(remote: FlycastRemote) -> Observation:
    installed: list[int] = []
    try:
        remote.command("?")
        remote.add_breakpoint(HANDLER_BREAKPOINT_ADDRESS)
        installed.append(HANDLER_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()

        context = remote.read_register(4)
        argument_array = remote.read_register(5)
        raw_arguments = remote.read_memory(argument_array, 16)
        arguments = struct.unpack("<4I", raw_arguments)
        source_a = vector(remote, arguments[1])
        source_b = vector(remote, arguments[2])

        remote.add_breakpoint(RESULT_WRITER_BREAKPOINT_ADDRESS)
        installed.append(RESULT_WRITER_BREAKPOINT_ADDRESS)
        remote.step_over_breakpoint(HANDLER_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()

        result_context = remote.read_register(4)
        if result_context != context:
            raise RemoteProtocolError(
                "Operation context changed before result write: "
                f"0x{context:08x} -> 0x{result_context:08x}"
            )
        native_result = remote.read_register(5)
        stack_pointer = remote.read_register(15)
        stack = remote.read_memory(stack_pointer, 52)
        resolved_object = struct.unpack_from("<I", stack, 0)[0]
        translation = list(struct.unpack_from("<3f", stack, 4))
        maximum = [
            struct.unpack_from("<f", stack, 16)[0],
            struct.unpack_from("<f", stack, 24)[0],
        ]
        minimum = [
            struct.unpack_from("<f", stack, 28)[0],
            struct.unpack_from("<f", stack, 36)[0],
        ]
        object_position = list(struct.unpack_from("<3f", stack, 40))
        expected_result = int(
            minimum[0] <= object_position[0] <= maximum[0]
            and minimum[1] <= object_position[2] <= maximum[1]
        )

        result_record = remote.read_u32(context + 4)
        if result_record == 0:
            raise RemoteProtocolError("Operation result record is null")
        result_slot = result_record + 12
        result_before = remote.read_u32(result_slot)

        remote.add_breakpoint(RESULT_WRITER_RETURN_BREAKPOINT_ADDRESS)
        installed.append(RESULT_WRITER_RETURN_BREAKPOINT_ADDRESS)
        remote.step_over_breakpoint(RESULT_WRITER_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()
        result_after = remote.read_u32(result_slot)
        expected_slot_after = 0xFFFFFFFF if native_result else 0

        return Observation(
            handler_address=f"0x{HANDLER_ADDRESS:08x}",
            handler_breakpoint_address=(
                f"0x{HANDLER_BREAKPOINT_ADDRESS:08x}"
            ),
            argument_array_address=f"0x{argument_array:08x}",
            argument_words=hex_words(raw_arguments),
            object_reference_argument=f"0x{arguments[0]:08x}",
            translation_reference_argument=f"0x{arguments[3]:08x}",
            source_vector_a=source_a,
            source_vector_b=source_b,
            resolved_object_address=f"0x{resolved_object:08x}",
            translation_vector=translation,
            normalized_xz_minimum=minimum,
            normalized_xz_maximum=maximum,
            object_position=object_position,
            native_result_argument=native_result,
            expected_result_argument=expected_result,
            result_argument_matches=native_result == expected_result,
            result_slot_address=f"0x{result_slot:08x}",
            result_slot_before=f"0x{result_before:08x}",
            result_slot_after=f"0x{result_after:08x}",
            expected_result_slot_after=f"0x{expected_slot_after:08x}",
            result_slot_matches=result_after == expected_slot_after,
        )
    finally:
        for address in reversed(installed):
            try:
                remote.remove_breakpoint(address)
            except (OSError, RemoteProtocolError):
                pass
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3263)
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    observation: Observation | None = None
    try:
        try:
            observation = observe(remote)
        except TimeoutError:
            pass
    finally:
        remote.close()

    status = "not-observed"
    if observation is not None:
        status = (
            "passed"
            if observation.result_argument_matches
            and observation.result_slot_matches
            else "failed"
        )
    payload = {
        "schema": "new-yokosuka-live-spatial-bounds-query-validation-v1",
        "status": status,
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": (
                "natural handler execution, live SH-4 registers, and RAM"
            ),
        },
        "operationId": "0x000a",
        "elapsedSeconds": round(time.time() - started_at, 3),
        "observation": (
            asdict(observation) if observation is not None else None
        ),
    }
    if observation is None:
        payload["notObservedReason"] = (
            "No natural 0x000a execution reached the armed breakpoint "
            f"within {args.timeout:g} seconds"
        )
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    if observation is None:
        return 2
    return 0 if status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
