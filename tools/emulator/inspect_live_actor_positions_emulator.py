#!/usr/bin/env python3
"""Read naturally resolved actor objects and positions from Flycast."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


ACTOR_RESOLVER = 0x0C153956
ACTOR_RESOLVER_RETURNS = (0x0C153984, 0x0C15398E)
RAM_BASE = 0x0C000000
ROOM_SCAN_START = 0x0C300000
ROOM_SCAN_LENGTH = 0x00300000
ROOM_SCAN_CHUNK = 0x4000
D000_INTERACTION_TABLE_RELATIVE = 0xD0FC
D000_INTERACTION_WIDTH_TABLE_RELATIVE = 0xD2B0
D000_INTERACTION_RECORD_COUNT = 18
D000_INTERACTION_ACTOR = b"AKIR"
D000_INTERACTION_FLAGS = 0x4000


def breakpoint(address: int) -> int:
    return address | 0x80000000


def fourcc(value: int) -> str | None:
    raw = struct.pack("<I", value)
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def scan_memory(
    remote: FlycastRemote,
    needle: bytes,
    start: int,
    length: int,
) -> list[int]:
    if not needle:
        raise ValueError("memory scan needle cannot be empty")
    matches: list[int] = []
    overlap = len(needle) - 1
    previous = b""
    cursor = start
    end = start + length
    while cursor < end:
        size = min(ROOM_SCAN_CHUNK, end - cursor)
        chunk = remote.read_memory(cursor, size)
        window = previous + chunk
        window_address = cursor - len(previous)
        search = 0
        while True:
            found = window.find(needle, search)
            if found < 0:
                break
            address = window_address + found
            if start <= address and address + len(needle) <= end:
                matches.append(address)
            search = found + 1
        previous = window[-overlap:] if overlap else b""
        cursor += size
    return matches


def inspect_d000_interaction_context(
    remote: FlycastRemote,
    mapinfo: bytes,
    actor_position_raw: bytes,
) -> dict[str, object]:
    scn3 = mapinfo.find(b"SCN3")
    if scn3 < 0 or scn3 + 0x40 > len(mapinfo):
        raise ValueError("room MAPINFO has no complete SCN3 identity")
    static_base = scn3 + struct.unpack_from("<I", mapinfo, scn3 + 0x10)[0]
    table_offset = static_base + D000_INTERACTION_TABLE_RELATIVE
    width_table_offset = (
        static_base + D000_INTERACTION_WIDTH_TABLE_RELATIVE
    )
    module_matches = scan_memory(
        remote,
        mapinfo[scn3:scn3 + 0x40],
        ROOM_SCAN_START,
        ROOM_SCAN_LENGTH,
    )
    result: dict[str, object] = {
        "moduleIdentityMatches": [
            f"0x{address:08x}" for address in module_matches
        ],
    }
    if len(module_matches) != 1:
        result["status"] = "room-module-absent-or-ambiguous"
        return result

    loaded_scn3 = module_matches[0]
    loaded_table = loaded_scn3 + table_offset - scn3
    loaded_width_table = loaded_scn3 + width_table_offset - scn3
    pointer_matches = scan_memory(
        remote,
        struct.pack("<I", loaded_table),
        ROOM_SCAN_START,
        ROOM_SCAN_LENGTH,
    )
    contexts: list[int] = []
    for pointer_address in pointer_matches:
        context = pointer_address - 0x70
        if context < ROOM_SCAN_START or context + 0xe0 > (
            ROOM_SCAN_START + ROOM_SCAN_LENGTH
        ):
            continue
        fields = remote.read_memory(context + 0x6c, 0x24)
        if (
            struct.unpack_from("<I", fields, 0x00)[0]
            == D000_INTERACTION_RECORD_COUNT
            and struct.unpack_from("<I", fields, 0x04)[0] == loaded_table
            and struct.unpack_from("<I", fields, 0x08)[0]
            == loaded_width_table
            and fields[0x14:0x18] == D000_INTERACTION_ACTOR
            and struct.unpack_from("<I", fields, 0x20)[0]
            == D000_INTERACTION_FLAGS
        ):
            contexts.append(context)
    result.update({
        "loadedScn3Address": f"0x{loaded_scn3:08x}",
        "loadedInteractionTableAddress": f"0x{loaded_table:08x}",
        "contextMatches": [
            f"0x{address:08x}" for address in contexts
        ],
    })
    if len(contexts) != 1:
        result["status"] = "interaction-context-absent-or-ambiguous"
        return result

    context = contexts[0]
    room_position_raw = remote.read_memory(context + 0xd4, 12)
    scene_byte_105 = remote.read_memory(context + 0x105, 1)[0]
    result.update({
        "status": "compared",
        "contextAddress": f"0x{context:08x}",
        "sceneByte105RelativeOffset": "0x105",
        "sceneByte105RawHex": f"0x{scene_byte_105:02x}",
        "sceneByte105": scene_byte_105,
        "roomVectorRelativeOffset": "0xd4",
        "roomVector": list(struct.unpack("<3f", room_position_raw)),
        "actorPosition": list(struct.unpack("<3f", actor_position_raw)),
        "floatWordsByteExact": room_position_raw == actor_position_raw,
        "roomVectorRawHex": room_position_raw.hex(),
        "actorPositionRawHex": actor_position_raw.hex(),
    })
    return result


def inspect(
    remote: FlycastRemote,
    targets: set[str],
    max_resolutions: int,
    room_mapinfo: bytes | None = None,
) -> tuple[dict[str, object], int]:
    entry = breakpoint(ACTOR_RESOLVER)
    returns = [breakpoint(address) for address in ACTOR_RESOLVER_RETURNS]
    installed: list[int] = []
    observations: dict[str, object] = {}
    resolution_count = 0
    try:
        remote.command("?")
        remote.add_breakpoint(entry)
        installed.append(entry)
        while resolution_count < max_resolutions and targets - observations.keys():
            remote.continue_until_stop()
            resolution_count += 1
            actor_code = fourcc(remote.read_register(5))
            if actor_code not in targets or actor_code in observations:
                remote.step_over_breakpoint(entry)
                continue
            for address in returns:
                remote.add_breakpoint(address)
                installed.append(address)
            remote.step_over_breakpoint(entry)
            remote.continue_until_stop()
            actor_object = remote.read_register(0)
            observation: dict[str, object] = {
                "actorCode": actor_code,
                "actorObjectAddress": f"0x{actor_object:08x}",
            }
            if actor_object:
                actor_position_raw = remote.read_memory(actor_object + 8, 12)
                observation["actorPosition"] = list(
                    struct.unpack("<3f", actor_position_raw)
                )
                if actor_code == "AKIR" and room_mapinfo is not None:
                    observation["d000InteractionContext"] = (
                        inspect_d000_interaction_context(
                            remote,
                            room_mapinfo,
                            actor_position_raw,
                        )
                    )
            observations[actor_code] = observation
            stopped_pc = remote.read_register(16)
            stopped_breakpoint = breakpoint(stopped_pc)
            for address in returns:
                remote.remove_breakpoint(address)
                installed.remove(address)
            remote.step_over_current_breakpoint()
            if stopped_breakpoint not in returns:
                raise RemoteProtocolError(
                    f"actor resolver stopped at unexpected 0x{stopped_pc:08x}"
                )
        return observations, resolution_count
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
    parser.add_argument("--max-resolutions", type=int, default=500)
    parser.add_argument("--actor", action="append")
    parser.add_argument("--room-mapinfo", type=Path)
    parser.add_argument("--profile")
    parser.add_argument("--disc", type=int)
    parser.add_argument("--savestate-index", type=int)
    parser.add_argument("--savestate-sha256")
    parser.add_argument("--executable-sha256")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    started_at = time.time()
    actors = args.actor or ["AKIR", "HATO"]
    room_mapinfo = (
        args.room_mapinfo.read_bytes()
        if args.room_mapinfo is not None
        else None
    )
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        observations, resolution_count = inspect(
            remote,
            set(actors),
            args.max_resolutions,
            room_mapinfo,
        )
    finally:
        remote.close()
    payload = {
        "schema": "new-yokosuka-live-actor-position-inspection-v3",
        "status": (
            "complete"
            if (
                set(actors) <= observations.keys()
                and (
                    room_mapinfo is None
                    or observations.get("AKIR", {})
                    .get("d000InteractionContext", {})
                    .get("status") == "compared"
                )
            )
            else "partial"
            if observations
            else "not-observed"
        ),
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": (
                "read-only live actor resolver results during natural gameplay"
            ),
            "guestWrites": False,
            "artificialHandlerCalls": False,
            **({"profile": args.profile} if args.profile else {}),
            **({"disc": args.disc} if args.disc is not None else {}),
            **({
                "savestateIndex": args.savestate_index,
            } if args.savestate_index is not None else {}),
            **({
                "savestateSha256": args.savestate_sha256,
            } if args.savestate_sha256 else {}),
            **({
                "executableSha256": args.executable_sha256,
            } if args.executable_sha256 else {}),
            **({
                "roomMapinfoSha256": hashlib.sha256(
                    room_mapinfo
                ).hexdigest(),
            } if room_mapinfo is not None else {}),
        },
        "elapsedSeconds": round(time.time() - started_at, 3),
        "resolverObservationCount": resolution_count,
        "actors": observations,
        "interpretationBoundary": [
            "The scene byte is a read-only observation from the exact resolved room context in this state.",
            "It does not establish a universal default or assign gameplay meaning to any bit.",
        ],
    }
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)
    print(rendered, end="")
    return 0 if payload["status"] == "complete" else 2


if __name__ == "__main__":
    raise SystemExit(main())
