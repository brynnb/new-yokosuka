#!/usr/bin/env python3
"""Observe a natural dialogue participant-control request in Flycast.

The probe is read-only with respect to guest state. It follows the verified
0x032..0x03b dialogue command handler to its native actor motion-point request
and records the actual participant table, actor object, target point, and
control words supplied by the game.
"""

from __future__ import annotations

import argparse
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


HANDLER_ADDRESS = 0x0C16175C
MOTION_REQUEST_CALL_ADDRESS = 0x0C161810
MOTION_REQUEST_RETURN_ADDRESS = 0x0C161814
HANDLER_EPILOGUE_ADDRESS = 0x0C161828
ACTIVE_PARTICIPANT_TABLE_ADDRESS = 0x0C224270
PARTICIPANT_ENABLED_FLAGS_ADDRESS = 0x0C224401
SELECTED_PARTICIPANT_TABLE_ADDRESS = 0x0C22437C
PARTICIPANT_CONTROL_FLAGS_ADDRESS = 0x0C22435C


def breakpoint(address: int) -> int:
    return address | 0x80000000


def hx(value: int) -> str:
    return f"0x{value:08x}"


def fourcc(value: int) -> str | None:
    raw = struct.pack("<I", value)
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def read_u32_array(
    remote: FlycastRemote,
    address: int,
    count: int,
) -> list[int]:
    return list(struct.unpack(
        f"<{count}I",
        remote.read_memory(address, count * 4),
    ))


def read_float3(remote: FlycastRemote, address: int) -> list[float]:
    return list(struct.unpack("<3f", remote.read_memory(address, 12)))


def observe(remote: FlycastRemote) -> dict[str, object]:
    handler_breakpoint = breakpoint(HANDLER_ADDRESS)
    request_breakpoint = breakpoint(MOTION_REQUEST_CALL_ADDRESS)
    return_breakpoint = breakpoint(MOTION_REQUEST_RETURN_ADDRESS)
    epilogue_breakpoint = breakpoint(HANDLER_EPILOGUE_ADDRESS)
    installed: list[int] = []
    try:
        remote.command("?")
        remote.add_breakpoint(handler_breakpoint)
        installed.append(handler_breakpoint)
        remote.continue_until_stop()

        target_word = remote.read_register(4)
        participant_words = read_u32_array(
            remote,
            ACTIVE_PARTICIPANT_TABLE_ADDRESS,
            8,
        )
        enabled_before = list(remote.read_memory(
            PARTICIPANT_ENABLED_FLAGS_ADDRESS,
            8,
        ))

        remote.add_breakpoint(request_breakpoint)
        installed.append(request_breakpoint)
        remote.step_over_breakpoint(handler_breakpoint)
        remote.continue_until_stop()

        actor_object = remote.read_register(4)
        target_pointer = remote.read_register(5)
        control_word = remote.read_register(6)
        control_flags = remote.read_register(7)
        actor_position = read_float3(remote, actor_object + 8)
        target_point = read_float3(remote, target_pointer)

        remote.add_breakpoint(return_breakpoint)
        installed.append(return_breakpoint)
        remote.step_over_breakpoint(request_breakpoint)
        remote.continue_until_stop()

        selected_after = read_u32_array(
            remote,
            SELECTED_PARTICIPANT_TABLE_ADDRESS,
            8,
        )
        control_flags_after = list(remote.read_memory(
            PARTICIPANT_CONTROL_FLAGS_ADDRESS,
            8,
        ))
        enabled_at_request_return = list(remote.read_memory(
            PARTICIPANT_ENABLED_FLAGS_ADDRESS,
            8,
        ))
        actor_position_after = read_float3(remote, actor_object + 8)

        remote.add_breakpoint(epilogue_breakpoint)
        installed.append(epilogue_breakpoint)
        remote.step_over_breakpoint(return_breakpoint)
        remote.continue_until_stop()
        enabled_at_handler_epilogue = list(remote.read_memory(
            PARTICIPANT_ENABLED_FLAGS_ADDRESS,
            8,
        ))
        target_delta = [
            target_point[index] - actor_position[index]
            for index in range(3)
        ]
        matched_slots = [
            index
            for index, value in enumerate(participant_words)
            if value == target_word
        ]

        return {
            "handlerAddress": hx(HANDLER_ADDRESS),
            "motionRequestCallAddress": hx(MOTION_REQUEST_CALL_ADDRESS),
            "motionRequestTargetAddress": hx(0x0C0FEF0E),
            "targetParticipantWord": hx(target_word),
            "targetParticipantFourcc": fourcc(target_word),
            "activeParticipantWords": [hx(value) for value in participant_words],
            "activeParticipantFourccs": [
                fourcc(value) for value in participant_words
            ],
            "matchedParticipantSlots": matched_slots,
            "participantEnabledFlagsBefore": enabled_before,
            "participantEnabledFlagsAtRequestReturn": (
                enabled_at_request_return
            ),
            "participantEnabledFlagsAtHandlerEpilogue": (
                enabled_at_handler_epilogue
            ),
            "selectedParticipantWordsAfter": [
                hx(value) for value in selected_after
            ],
            "selectedParticipantFourccsAfter": [
                fourcc(value) for value in selected_after
            ],
            "participantControlFlagsAfter": control_flags_after,
            "actorObjectAddress": hx(actor_object),
            "actorPositionBefore": actor_position,
            "actorPositionAfter": actor_position_after,
            "motionTargetPointer": hx(target_pointer),
            "motionTargetPoint": target_point,
            "motionTargetDeltaFromActor": target_delta,
            "motionControlWord": hx(control_word),
            "motionControlFlags": hx(control_flags),
            "matchesStaticSelfOffsetContract": (
                abs(target_delta[0] + 0.001) < 0.00001
                and abs(target_delta[1]) < 0.00001
                and abs(target_delta[2]) < 0.00001
            ),
            "actorPositionPreservedAcrossRequest": (
                actor_position_after == actor_position
            ),
        }
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
    parser.add_argument("--port", type=int, default=3264)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    observation = None
    not_observed_reason = None
    try:
        try:
            observation = observe(remote)
        except TimeoutError:
            not_observed_reason = (
                "No natural dialogue participant-control request reached "
                f"the armed handler within {args.timeout:g} seconds"
            )
    finally:
        remote.close()

    payload = {
        "schema": (
            "new-yokosuka-live-dialogue-participant-control-validation-v1"
        ),
        "status": "observed" if observation is not None else "not-observed",
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": (
                "live SH-4 registers and Dreamcast RAM during natural dialogue"
            ),
            "guestWrites": False,
            "artificialHandlerCalls": False,
        },
        "elapsedSeconds": round(time.time() - started_at, 3),
        "observation": observation,
    }
    if not_observed_reason is not None:
        payload["notObservedReason"] = not_observed_reason
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    if observation is None:
        return 2
    return 0 if observation["matchesStaticSelfOffsetContract"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
