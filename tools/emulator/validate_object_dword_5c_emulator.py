#!/usr/bin/env python3
"""Observe operation 0x00f7 in a live Flycast process through its GDB stub.

The probe is deliberately read-only with respect to game state. It places
software breakpoints at the proven handler and bit-write routine, records the
resolved object's dword at +0x5c before and after the native write, removes all
breakpoints, and resumes emulation.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


HANDLER_ADDRESS = 0x0C15836A
BIT_WRITE_ADDRESS = 0x0C0AB3E0
BIT_WRITE_RETURN_ADDRESS = 0x0C0AB3FC
# Flycast's software-breakpoint table keys entries by the exact SH-4 PC.
# Shenmue executes these RAM-backed routines through their cached P1 mirrors,
# even though the handler table stores the equivalent P0 addresses.
HANDLER_BREAKPOINT_ADDRESS = HANDLER_ADDRESS | 0x80000000
BIT_WRITE_BREAKPOINT_ADDRESS = BIT_WRITE_ADDRESS | 0x80000000
BIT_WRITE_RETURN_BREAKPOINT_ADDRESS = BIT_WRITE_RETURN_ADDRESS | 0x80000000
CONTROL_MASK = 0x00000040


@dataclass(frozen=True)
class Observation:
    handler_address: str
    handler_breakpoint_address: str
    argument_array_address: str
    object_reference_argument: str
    command_argument: int
    resolved_object_address: str
    dword_5c_before: str
    dword_5c_after: str
    bit_6_before: int
    bit_6_after: int
    expected_bit_6_after: int
    non_control_bits_preserved: bool
    native_transition_matches: bool


def observe(remote: FlycastRemote) -> Observation:
    installed: list[int] = []
    resumed = False
    try:
        remote.command("?")
        remote.add_breakpoint(HANDLER_BREAKPOINT_ADDRESS)
        installed.append(HANDLER_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()

        # SH-4 registers r0..r15 occupy GDB register numbers 0..15.
        argument_array = remote.read_register(5)
        object_reference_argument = remote.read_u32(argument_array)
        command_argument = remote.read_u32(argument_array + 4)

        remote.add_breakpoint(BIT_WRITE_BREAKPOINT_ADDRESS)
        installed.append(BIT_WRITE_BREAKPOINT_ADDRESS)
        remote.step_over_breakpoint(HANDLER_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()

        resolved_object = remote.read_register(4)
        native_command = remote.read_register(5)
        if native_command != command_argument:
            raise RemoteProtocolError(
                "Handler argument changed before the native bit write: "
                f"{command_argument} -> {native_command}"
            )
        if resolved_object == 0:
            raise RemoteProtocolError(
                "Observed a missing-object call; no live dword transition exists"
            )
        before = remote.read_u32(resolved_object + 0x5C)

        remote.add_breakpoint(BIT_WRITE_RETURN_BREAKPOINT_ADDRESS)
        installed.append(BIT_WRITE_RETURN_BREAKPOINT_ADDRESS)
        remote.step_over_breakpoint(BIT_WRITE_BREAKPOINT_ADDRESS)
        remote.continue_until_stop()
        after = remote.read_u32(resolved_object + 0x5C)

        before_bit = int(bool(before & CONTROL_MASK))
        after_bit = int(bool(after & CONTROL_MASK))
        if command_argument == 0:
            expected_after_bit = 0
        elif command_argument == 1:
            expected_after_bit = 1
        else:
            expected_after_bit = before_bit
        non_control_bits_preserved = (
            before & ~CONTROL_MASK
        ) == (after & ~CONTROL_MASK)

        return Observation(
            handler_address=f"0x{HANDLER_ADDRESS:08x}",
            handler_breakpoint_address=(
                f"0x{HANDLER_BREAKPOINT_ADDRESS:08x}"
            ),
            argument_array_address=f"0x{argument_array:08x}",
            object_reference_argument=f"0x{object_reference_argument:08x}",
            command_argument=command_argument,
            resolved_object_address=f"0x{resolved_object:08x}",
            dword_5c_before=f"0x{before:08x}",
            dword_5c_after=f"0x{after:08x}",
            bit_6_before=before_bit,
            bit_6_after=after_bit,
            expected_bit_6_after=expected_after_bit,
            non_control_bits_preserved=non_control_bits_preserved,
            native_transition_matches=(
                after_bit == expected_after_bit and non_control_bits_preserved
            ),
        )
    finally:
        for address in reversed(installed):
            try:
                remote.remove_breakpoint(address)
            except (OSError, RemoteProtocolError):
                pass
        try:
            remote.detach()
            resumed = True
        except (OSError, RemoteProtocolError):
            pass
        if not resumed:
            print("warning: emulator was not resumed", flush=True)


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
    timeout_message: str | None = None
    try:
        try:
            observation = observe(remote)
        except TimeoutError as error:
            timeout_message = str(error)
    finally:
        remote.close()

    payload = {
        "schema": "new-yokosuka-live-object-dword-5c-validation-v1",
        "status": "observed" if observation is not None else "not-observed",
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": "live SH-4 registers and Dreamcast RAM",
        },
        "operationId": "0x00f7",
        "elapsedSeconds": round(time.time() - started_at, 3),
        "observation": (
            asdict(observation) if observation is not None else None
        ),
    }
    if timeout_message is not None:
        payload["notObservedReason"] = (
            "No natural 0x00f7 execution reached the armed breakpoint "
            f"within {args.timeout:g} seconds"
        )
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    if observation is None:
        return 2
    return 0 if observation.native_transition_matches else 1


if __name__ == "__main__":
    raise SystemExit(main())
