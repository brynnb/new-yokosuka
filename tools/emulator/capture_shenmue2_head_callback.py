#!/usr/bin/env python3
"""Capture naturally executed S2 controller-12 head callbacks in Flycast."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

from tools.emulator.capture_shenmue2_pelvis_callback import resolve_actor_records
from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


CALLBACK = 0x8C0E7A40
CALLBACK_RETURN = 0x8C1D4206
SOURCE_MATRIX_SAVED = 0x8C0E7B5A
HEAD_OUTPUT_SAVED = 0x8C1D44F4
CURRENT_CONTROLLER = 0x8C24E628
CURRENT_ACTOR_MODE_ENABLED = 0x8C24E7E0
FALLBACK_MODE = 0x8C308334
CURRENT_CURVE_TIME = 0x8C308348
BLEND_END = 0x8C308350
CALLBACK_FLAGS = 0x8C30834C


def hex_address(value: int) -> str:
    return f"0x{value:08x}"


def floats(data: bytes) -> list[float]:
    return list(struct.unpack(f"<{len(data) // 4}f", data))


def words(data: bytes) -> list[int]:
    return list(struct.unpack(f"<{len(data) // 4}I", data))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stopped_at(remote: FlycastRemote) -> int:
    return remote.read_register(16) | 0x80000000


def observe(
    remote: FlycastRemote,
    count: int,
    controllers: set[int],
    resolve_actors: bool,
) -> tuple[list[dict[str, object]], bool]:
    observations: list[dict[str, object]] = []
    breakpoints = [CALLBACK, CALLBACK_RETURN, SOURCE_MATRIX_SAVED, HEAD_OUTPUT_SAVED]
    timed_out = False
    try:
        remote.command("?")
        for address in breakpoints:
            remote.add_breakpoint(address)
        while len(observations) < count:
            while True:
                try:
                    remote.continue_until_stop()
                except TimeoutError:
                    timed_out = True
                    break
                address = stopped_at(remote)
                if address == CALLBACK:
                    break
                if address in (CALLBACK_RETURN, HEAD_OUTPUT_SAVED):
                    # Ordinary slot-2 solvers reach both shared continuation
                    # points without installing the callback we are tracing.
                    remote.step_over_breakpoint(address)
                    continue
                raise RemoteProtocolError(
                    f"Stopped outside head callback entry: {hex_address(address)}"
                )
            if timed_out:
                break

            controller = remote.read_u32(CURRENT_CONTROLLER)
            context = remote.read_register(4)
            context_data = remote.read_memory(context, 20)
            context_words = words(context_data)
            gate_enabled = remote.read_u32(CURRENT_ACTOR_MODE_ENABLED) != 0
            mode = remote.read_u32(
                controller + 0x11A8 if gate_enabled else FALLBACK_MODE
            )
            entry = {
                "controllerAddress": hex_address(controller),
                "contextAddress": hex_address(context),
                "contextWords": [hex_address(value) for value in context_words],
                "controllerMode": remote.read_u32(controller),
                "basisVariantWord": remote.read_u32(controller + 4),
                "headSlotMode": remote.read_u32(controller + 0x11A8),
                "currentActorModeEnabled": gate_enabled,
                "selectedCallbackMode": mode,
                "blendAmount": floats(remote.read_memory(controller + 0x26C0, 4))[0],
                "currentCurveTime": floats(remote.read_memory(CURRENT_CURVE_TIME, 4))[0],
                "blendEndFrame": floats(remote.read_memory(BLEND_END, 4))[0],
                "forceComplete": (
                    remote.read_u32(CALLBACK_FLAGS) & 0x00010000
                ) != 0,
            }

            remote.step_over_breakpoint(CALLBACK)
            remote.continue_until_stop()
            source_matrix = None
            if stopped_at(remote) == SOURCE_MATRIX_SAVED:
                source_matrix = floats(remote.read_memory(remote.read_register(14), 64))
                remote.step_over_breakpoint(SOURCE_MATRIX_SAVED)
                remote.continue_until_stop()
            address = stopped_at(remote)
            if address not in (CALLBACK_RETURN, HEAD_OUTPUT_SAVED):
                raise RemoteProtocolError(
                    "Head callback did not return to controller 12: "
                    f"{hex_address(address)}"
                )
            # Some Flycast GDB runs report the callback return breakpoint;
            # others resume through that address and next report the final
            # head save. Both paths are natural execution of the same caller.
            if address == CALLBACK_RETURN:
                remote.step_over_breakpoint(CALLBACK_RETURN)
                remote.continue_until_stop()
            if stopped_at(remote) != HEAD_OUTPUT_SAVED:
                raise RemoteProtocolError(
                    "Head solver did not save its output: "
                    f"{hex_address(stopped_at(remote))}"
                )
            head_slot = controller + 0x11A8
            output = floats(remote.read_memory(controller + 0x1508, 64))

            if not controllers or controller in controllers:
                observation = {
                    "sequence": len(observations),
                    **entry,
                    "callbackSourceMatrix": source_matrix,
                    "headAimVector": floats(
                        remote.read_memory(head_slot + 0x20, 12)
                    ),
                    "torsoWorldMatrix": floats(
                        remote.read_memory(controller + 0x1168, 64)
                    ),
                    "headOutputWorldMatrix": output,
                }
                observations.append(observation)
                print(
                    f"{observation['sequence']:03d} controller="
                    f"{observation['controllerAddress']} mode={mode} "
                    f"blend={observation['blendAmount']:.6f}",
                    flush=True,
                )
            remote.step_over_breakpoint(HEAD_OUTPUT_SAVED)

        if resolve_actors and observations:
            bindings = resolve_actor_records(remote, {
                int(observation["controllerAddress"], 0)
                for observation in observations
            })
            for observation in observations:
                observation["actorBinding"] = bindings.get(
                    int(observation["controllerAddress"], 0)
                )
        return observations, timed_out
    finally:
        for address in reversed(breakpoints):
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
    parser.add_argument("--controller", action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--emulator", type=Path)
    parser.add_argument("--disc", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--state-index", type=int)
    parser.add_argument("--resolve-actors", action="store_true")
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
            remote, args.count, controllers, args.resolve_actors
        )
    finally:
        remote.close()
    payload = {
        "schema": "new-yokosuka-s2-native-head-callback-trace-v1",
        "status": (
            "complete" if len(observations) == args.count
            else "partial" if observations else "not-observed"
        ),
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": "natural SH-4 callback execution",
            "emulatorExecutable": (
                {"path": str(args.emulator), "sha256": sha256(args.emulator)}
                if args.emulator else None
            ),
            "discImage": (
                {"path": str(args.disc), "sha256": sha256(args.disc)}
                if args.disc else None
            ),
            "saveState": (
                {
                    "path": str(args.state),
                    "sha256": sha256(args.state),
                    "zeroBasedIndex": args.state_index,
                    "displayedSlot": args.state_index + 1,
                }
                if args.state and args.state_index is not None else None
            ),
        },
        "callbackAddress": hex_address(CALLBACK),
        "sourceMatrixSavedAddress": hex_address(SOURCE_MATRIX_SAVED),
        "headOutputSavedAddress": hex_address(HEAD_OUTPUT_SAVED),
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
