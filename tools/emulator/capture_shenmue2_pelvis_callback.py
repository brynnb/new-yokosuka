#!/usr/bin/env python3
"""Capture naturally executed S2 pelvis-callback inputs through Flycast GDB."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


CALLBACK_ADDRESS = 0x0C0E7F00
CALLBACK_BREAKPOINT = CALLBACK_ADDRESS | 0x80000000
CALLER_RETURN_ADDRESS = 0x0C1D188C
CALLER_RETURN_BREAKPOINT = CALLER_RETURN_ADDRESS | 0x80000000
PRIMARY_SAVED_ADDRESS = 0x0C1D1932
PRIMARY_SAVED_BREAKPOINT = PRIMARY_SAVED_ADDRESS | 0x80000000
CURRENT_CURVE_TIME = 0x8C308348
DIRECTION_BLEND_END = 0x8C308350
CURRENT_ACTOR = 0x8C24E628
CURRENT_ACTOR_MODE_ENABLED = 0x8C24E7E0
FALLBACK_MODE = 0x8C308334
CALLBACK_FLAGS = 0x8C30834C


def words(data: bytes) -> list[int]:
    return list(struct.unpack(f"<{len(data) // 4}I", data))


def floats(data: bytes) -> list[float]:
    return list(struct.unpack(f"<{len(data) // 4}f", data))


def hex_address(value: int) -> str:
    return f"0x{value:08x}"


def active_float_registers(remote: FlycastRemote) -> dict[str, object]:
    raw = [remote.read_register(25 + index) for index in range(16)]
    return {
        "fpscrWordHex": hex_address(remote.read_register(24)),
        "wordHex": [hex_address(value) for value in raw],
        "float32": [struct.unpack("<f", struct.pack("<I", value))[0] for value in raw],
        "note": (
            "Flycast GDB exposes the active SH-4 FR bank, not the separate "
            "XF/XMTRX bank"
        ),
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def resolve_actor_records(
    remote: FlycastRemote,
    controllers: set[int],
) -> dict[int, dict[str, object]]:
    """Find native ordinary-actor records which duplicate a controller ptr."""
    unresolved = set(controllers)
    result: dict[int, dict[str, object]] = {}
    heap_start = 0x8C700000
    heap_end = 0x8D000000
    chunk_size = 0x40000
    overlap = 0x28
    controller_bytes = {
        controller: struct.pack("<I", controller)
        for controller in controllers
    }
    for address in range(heap_start, heap_end, chunk_size):
        if not unresolved:
            break
        length = min(chunk_size + overlap, heap_end - address)
        data = remote.read_memory(address, length)
        for controller in list(unresolved):
            needle = controller_bytes[controller]
            offset = -1
            while True:
                offset = data.find(needle, offset + 1)
                if offset < 0:
                    break
                record_offset = offset - 8
                if (
                    record_offset < 0
                    or (address + record_offset) & 3
                    or record_offset + 0x28 > len(data)
                    or data[record_offset + 0x24 : record_offset + 0x28]
                    != needle
                ):
                    continue
                actor_code_bytes = data[record_offset : record_offset + 4]
                try:
                    actor_code = actor_code_bytes.decode("ascii")
                except UnicodeDecodeError:
                    continue
                if (
                    len(actor_code) != 4
                    or not all(character.isupper() or character.isdigit()
                               or character == "_" for character in actor_code)
                ):
                    continue
                result[controller] = {
                    "actorCode": actor_code,
                    "recordAddress": hex_address(address + record_offset),
                    "method": (
                        "native actor code plus duplicate controller pointers "
                        "at +0x08/+0x24"
                    ),
                }
                unresolved.remove(controller)
                break
    return result


def observe(
    remote: FlycastRemote,
    count: int,
    controllers: set[int],
    resolve_actors: bool,
) -> tuple[list[dict[str, object]], bool]:
    observations: list[dict[str, object]] = []
    installed: list[int] = []
    timed_out = False
    try:
        remote.command("?")
        remote.add_breakpoint(CALLBACK_BREAKPOINT)
        installed.append(CALLBACK_BREAKPOINT)
        remote.add_breakpoint(CALLER_RETURN_BREAKPOINT)
        installed.append(CALLER_RETURN_BREAKPOINT)
        while len(observations) < count:
            while True:
                try:
                    remote.continue_until_stop()
                except TimeoutError:
                    timed_out = True
                    break
                reported_pc = remote.read_register(16)
                breakpoint_address = reported_pc | 0x80000000
                if breakpoint_address == CALLBACK_BREAKPOINT:
                    break
                if breakpoint_address == CALLER_RETURN_BREAKPOINT:
                    # Most slot-zero solvers have no callback installed and
                    # reach this shared continuation directly. Skip those
                    # natural calls while waiting for a callback entry.
                    remote.step_over_breakpoint(breakpoint_address)
                    continue
                raise RemoteProtocolError(
                    "Stopped outside the callback trace points: "
                    f"0x{reported_pc:08x}"
                )
            if timed_out:
                break
            controller = remote.read_register(13) - 8
            context = remote.read_register(4)
            context_data = remote.read_memory(context, 20)
            context_words = words(context_data)
            first_axis_descriptor = context_words[0]
            descriptor_data = remote.read_memory(first_axis_descriptor, 64)
            source_descriptor_data = [
                remote.read_memory(address, 64)
                for address in context_words[1:3]
            ]
            direction_blend_address = context_words[3]
            direction_blend_data = remote.read_memory(
                direction_blend_address,
                0x30,
            )
            direction_blend_values = floats(direction_blend_data)
            curve_time_data = remote.read_memory(CURRENT_CURVE_TIME, 4)
            direction_blend_end_data = remote.read_memory(
                DIRECTION_BLEND_END,
                4,
            )
            blend_data = remote.read_memory(context_words[4], 4)
            current_actor = remote.read_u32(CURRENT_ACTOR)
            current_actor_mode_enabled = (
                remote.read_u32(CURRENT_ACTOR_MODE_ENABLED) != 0
            )
            mode = remote.read_u32(
                current_actor + 0x88
                if current_actor_mode_enabled
                else FALLBACK_MODE
            )
            current_actor_data = (
                remote.read_memory(current_actor, 0x100)
                if 0x8C000000 <= current_actor <= 0x8CFFFF00
                else b""
            )
            force_complete = (
                remote.read_u32(CALLBACK_FLAGS) & 0x00010000
            ) != 0
            before = active_float_registers(remote)

            remote.step_over_breakpoint(CALLBACK_BREAKPOINT)
            remote.continue_until_stop()
            return_pc = remote.read_register(16)
            if (return_pc | 0x80000000) != CALLER_RETURN_BREAKPOINT:
                raise RemoteProtocolError(
                    "Pelvis callback did not return to its native caller: "
                    f"0x{return_pc:08x}"
                )
            after = active_float_registers(remote)

            remote.add_breakpoint(PRIMARY_SAVED_BREAKPOINT)
            installed.append(PRIMARY_SAVED_BREAKPOINT)
            remote.step_over_breakpoint(CALLER_RETURN_BREAKPOINT)
            remote.continue_until_stop()
            saved_pc = remote.read_register(16)
            if (saved_pc | 0x80000000) != PRIMARY_SAVED_BREAKPOINT:
                raise RemoteProtocolError(
                    "Pelvis callback did not reach the native primary save: "
                    f"0x{saved_pc:08x}"
                )
            root_matrix = floats(remote.read_memory(controller + 0x08, 64))
            primary_matrix = floats(
                remote.read_memory(controller + 0x230, 64)
            )

            if not controllers or controller in controllers:
                observation = {
                    "sequence": len(observations),
                    "controllerAddress": hex_address(controller),
                    "contextAddress": hex_address(context),
                    "contextWords": [hex_address(value) for value in context_words],
                    "currentCurveTime": floats(curve_time_data)[0],
                    "capturedBlendAmount": floats(blend_data)[0],
                    "forceComplete": force_complete,
                    "mode": mode,
                    "modeSource": (
                        "current-actor+0x88"
                        if current_actor_mode_enabled
                        else "global-fallback"
                    ),
                    "currentActorAddress": hex_address(current_actor),
                    "currentActorWords": [
                        hex_address(value) for value in words(current_actor_data)
                    ],
                    "firstAxisDescriptorAtCall": {
                        "address": hex_address(first_axis_descriptor),
                        "wordHex": [
                            hex_address(value) for value in words(descriptor_data)
                        ],
                        "float32": floats(descriptor_data),
                    },
                    "installedRemainingAxisDescriptors": [
                        {
                            "address": hex_address(address),
                            "wordHex": [
                                hex_address(value) for value in words(data)
                            ],
                            "float32": floats(data),
                        }
                        for address, data in zip(
                            context_words[1:3],
                            source_descriptor_data,
                            strict=True,
                        )
                    ],
                    "directionBlendAtCall": {
                        "address": hex_address(direction_blend_address),
                        "wordHex": [
                            hex_address(value)
                            for value in words(direction_blend_data)
                        ],
                        "targetForward": direction_blend_values[0:3],
                        "targetUp": direction_blend_values[3:6],
                        "sourceForward": direction_blend_values[6:9],
                        "sourceUp": direction_blend_values[9:12],
                        "currentFrame": floats(curve_time_data)[0],
                        "blendEndFrame": floats(direction_blend_end_data)[0],
                        "note": (
                            "FUN_8c1d53a0 consumes this structure only when "
                            "the callback selects mode 1"
                        ),
                    },
                    "activeFrRegistersBefore": before,
                    "activeFrRegistersAfter": after,
                    "actorRootMatrix": root_matrix,
                    "pelvisPrimaryWorldMatrixAfter": primary_matrix,
                }
                observations.append(observation)
                print(
                    f"{observation['sequence']:03d} controller="
                    f"{observation['controllerAddress']} "
                    f"time={observation['currentCurveTime']:.6f}",
                    flush=True,
                )
            remote.step_over_breakpoint(PRIMARY_SAVED_BREAKPOINT)
            remote.remove_breakpoint(PRIMARY_SAVED_BREAKPOINT)
            installed.remove(PRIMARY_SAVED_BREAKPOINT)
        if resolve_actors and observations:
            bindings = resolve_actor_records(remote, {
                int(observation["controllerAddress"], 0)
                for observation in observations
            })
            for observation in observations:
                binding = bindings.get(int(observation["controllerAddress"], 0))
                observation["actorBinding"] = binding
        return observations, timed_out
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
    parser.add_argument("--count", type=int, default=32)
    parser.add_argument(
        "--controller",
        action="append",
        default=[],
        help="capture only this controller address; may be repeated",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--emulator", type=Path)
    parser.add_argument("--disc", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--state-index", type=int)
    parser.add_argument(
        "--resolve-actors",
        action="store_true",
        help="scan the runtime heap for exact actor-record/controller bindings",
    )
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")
    try:
        controllers = {int(value, 0) for value in args.controller}
    except ValueError as error:
        parser.error(f"invalid --controller: {error}")

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        observations, timed_out = observe(
            remote,
            args.count,
            controllers,
            args.resolve_actors,
        )
    finally:
        remote.close()
    payload = {
        "schema": "new-yokosuka-s2-native-pelvis-callback-trace-v1",
        "status": (
            "complete"
            if len(observations) == args.count
            else "partial"
            if observations
            else "not-observed"
        ),
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": (
                "natural callback execution, live SH-4 registers, and RAM"
            ),
            "emulatorExecutable": (
                {
                    "path": str(args.emulator),
                    "sha256": sha256(args.emulator),
                }
                if args.emulator
                else None
            ),
            "discImage": (
                {"path": str(args.disc), "sha256": sha256(args.disc)}
                if args.disc
                else None
            ),
            "saveState": (
                {
                    "path": str(args.state),
                    "sha256": sha256(args.state),
                    "zeroBasedIndex": args.state_index,
                    "displayedSlot": (
                        args.state_index + 1
                        if args.state_index is not None
                        else None
                    ),
                }
                if args.state
                else None
            ),
        },
        "callbackAddress": hex_address(CALLBACK_ADDRESS),
        "callbackBreakpointAddress": hex_address(CALLBACK_BREAKPOINT),
        "callerReturnAddress": hex_address(CALLER_RETURN_ADDRESS),
        "primarySavedAddress": hex_address(PRIMARY_SAVED_ADDRESS),
        "requestedObservationCount": args.count,
        "observationCount": len(observations),
        "timedOut": timed_out,
        "elapsedSeconds": round(time.time() - started_at, 3),
        "controllerFilter": [hex_address(value) for value in sorted(controllers)],
        "observations": observations,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2))
    return 0 if observations else 2


if __name__ == "__main__":
    raise SystemExit(main())
