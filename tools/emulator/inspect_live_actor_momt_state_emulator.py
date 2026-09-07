#!/usr/bin/env python3
"""Read an actor's naturally resolved MOMT scale and position in Flycast."""

from __future__ import annotations

import argparse
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


ACTOR_RESOLVER = 0x0C153956
ACTOR_RESOLVER_RETURNS = (0x0C153984, 0x0C15398E)
MOMT_ACCESSOR = 0x0C113A76
MOMT_ACCESSOR_RECORD_RETURN = 0x0C113A8A
MOMT_ACCESSOR_NULL_RETURN = 0x0C113A92
ACTOR_PARENT_OFFSET = 0x04
ACTOR_POSITION_OFFSET = 0x28
MOMT_PAYLOAD_OFFSET = 0x14
MOMT_RECORD_SCALE_OFFSET = 0x194
MOMT_PAYLOAD_SCALE_OFFSET = MOMT_RECORD_SCALE_OFFSET - MOMT_PAYLOAD_OFFSET


def breakpoint(address: int) -> int:
    return address | 0x80000000


def fourcc(value: int) -> str | None:
    raw = struct.pack("<I", value)
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def remove_breakpoint(
    remote: FlycastRemote,
    installed: list[int],
    address: int,
) -> None:
    remote.remove_breakpoint(address)
    installed.remove(address)


def resolve_actor(
    remote: FlycastRemote,
    actor_code: str,
    max_resolutions: int,
    installed: list[int],
) -> tuple[int, int]:
    entry = breakpoint(ACTOR_RESOLVER)
    returns = [breakpoint(address) for address in ACTOR_RESOLVER_RETURNS]
    remote.add_breakpoint(entry)
    installed.append(entry)
    for resolution_count in range(1, max_resolutions + 1):
        remote.continue_until_stop()
        if fourcc(remote.read_register(5)) != actor_code:
            remote.step_over_breakpoint(entry)
            continue
        for address in returns:
            remote.add_breakpoint(address)
            installed.append(address)
        remote.step_over_breakpoint(entry)
        remote.continue_until_stop()
        actor_object = remote.read_register(0)
        stopped_pc = remote.read_register(16)
        for address in returns:
            remove_breakpoint(remote, installed, address)
        remote.step_over_current_breakpoint()
        if breakpoint(stopped_pc) not in returns:
            raise RemoteProtocolError(
                f"actor resolver stopped at unexpected 0x{stopped_pc:08x}"
            )
        remove_breakpoint(remote, installed, entry)
        return actor_object, resolution_count
    remove_breakpoint(remote, installed, entry)
    return 0, max_resolutions


def resolve_momt(
    remote: FlycastRemote,
    actor_object: int,
    max_accesses: int,
    installed: list[int],
) -> tuple[int, int]:
    entry = breakpoint(MOMT_ACCESSOR)
    record_return = breakpoint(MOMT_ACCESSOR_RECORD_RETURN)
    null_return = breakpoint(MOMT_ACCESSOR_NULL_RETURN)
    remote.add_breakpoint(entry)
    installed.append(entry)
    for access_count in range(1, max_accesses + 1):
        remote.continue_until_stop()
        if remote.read_register(4) != actor_object:
            remote.step_over_breakpoint(entry)
            continue
        remote.add_breakpoint(record_return)
        remote.add_breakpoint(null_return)
        installed.extend((record_return, null_return))
        remote.step_over_breakpoint(entry)
        remote.continue_until_stop()
        stopped_pc = remote.read_register(16)
        if stopped_pc == MOMT_ACCESSOR_RECORD_RETURN:
            momt_payload = remote.read_register(4) + MOMT_PAYLOAD_OFFSET
        elif stopped_pc == MOMT_ACCESSOR_NULL_RETURN:
            momt_payload = 0
        else:
            raise RemoteProtocolError(
                f"MOMT accessor stopped at unexpected 0x{stopped_pc:08x}"
            )
        remove_breakpoint(remote, installed, record_return)
        remove_breakpoint(remote, installed, null_return)
        remote.step_over_current_breakpoint()
        remove_breakpoint(remote, installed, entry)
        return momt_payload, access_count
    remove_breakpoint(remote, installed, entry)
    return 0, max_accesses


def inspect(
    remote: FlycastRemote,
    actor_code: str,
    max_resolutions: int,
    max_momt_accesses: int,
) -> dict[str, object]:
    installed: list[int] = []
    try:
        remote.command("?")
        actor_object, resolution_count = resolve_actor(
            remote,
            actor_code,
            max_resolutions,
            installed,
        )
        if not actor_object:
            return {
                "status": "actor-not-observed",
                "actorResolverObservationCount": resolution_count,
            }
        momt_payload, access_count = resolve_momt(
            remote,
            actor_object,
            max_momt_accesses,
            installed,
        )
        actor_position_raw = remote.read_memory(
            actor_object + ACTOR_POSITION_OFFSET,
            12,
        )
        result: dict[str, object] = {
            "status": "complete" if momt_payload else "momt-not-observed",
            "actorCode": actor_code,
            "actorObjectAddress": f"0x{actor_object:08x}",
            "actorResolverObservationCount": resolution_count,
            "momtAccessorObservationCount": access_count,
            "parentPointer": (
                f"0x{struct.unpack('<I', remote.read_memory(actor_object + ACTOR_PARENT_OFFSET, 4))[0]:08x}"
            ),
            "positionWordOffset": f"0x{ACTOR_POSITION_OFFSET:04x}",
            "positionWords": list(struct.unpack("<3I", actor_position_raw)),
            "position": list(struct.unpack("<3f", actor_position_raw)),
        }
        if momt_payload:
            scale_raw = remote.read_memory(
                momt_payload + MOMT_PAYLOAD_SCALE_OFFSET,
                12,
            )
            result.update({
                "momtPayloadAddress": f"0x{momt_payload:08x}",
                "momtRecordScaleWordOffset": (
                    f"0x{MOMT_RECORD_SCALE_OFFSET:04x}"
                ),
                "momtPayloadScaleWordOffset": (
                    f"0x{MOMT_PAYLOAD_SCALE_OFFSET:04x}"
                ),
                "momtScaleWords": list(struct.unpack("<3I", scale_raw)),
                "momtScale": list(struct.unpack("<3f", scale_raw)),
            })
        return result
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
    parser.add_argument("--timeout", type=float, default=60)
    parser.add_argument("--actor", default="AKIR")
    parser.add_argument("--max-resolutions", type=int, default=500)
    parser.add_argument("--max-momt-accesses", type=int, default=500)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if len(args.actor) != 4:
        parser.error("--actor must be a four-character code")
    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        observation = inspect(
            remote,
            args.actor,
            args.max_resolutions,
            args.max_momt_accesses,
        )
    finally:
        remote.close()
    payload = {
        "schema": "new-yokosuka-live-actor-momt-state-v1",
        "status": observation["status"],
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": (
                "read-only native actor/MOMT resolution during natural gameplay"
            ),
            "guestWrites": False,
            "artificialHandlerCalls": False,
        },
        "elapsedSeconds": round(time.time() - started_at, 3),
        "observation": observation,
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    return 0 if payload["status"] == "complete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
