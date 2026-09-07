#!/usr/bin/env python3
"""Capture native Shenmue I CLTH state from an unmodified game update.

The probe stops immediately after FUN_0c0b0512 returns to the CLTH update
routine. At that point body anchors, positional constraints, collision, and
the surface auxiliary endpoints have been updated, but the control lattice
has not yet been copied to its previous-frame buffer or submitted through the
render pair. The tool never alters CLTH data or calls a game function
artificially.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


SURFACE_AUXILIARY_RETURN = 0x0C0AEA20
SURFACE_AUXILIARY_RETURN_BREAKPOINT = SURFACE_AUXILIARY_RETURN | 0x80000000
GROUP_SIZE = 0x88
OWNER_SIZE = 0x44
CONSTRAINT_RECORD_SIZE = 0x54
VERTEX_STATE_SIZE = 0x18
RENDER_PAIR_SIZE = 0x40
RENDER_MAP_RECORD_SIZE = 0x08
BODY_COLLISION_RECORD_SIZE = 0x14
MAX_VERTEX_COUNT = 4096


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def u32(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<I", raw, offset)[0]


def s16(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<h", raw, offset)[0]


def model_word(text: str) -> int | None:
    if text.upper() in {"ANY", "*"}:
        return None
    encoded = text.upper().encode("ascii")
    if not 1 <= len(encoded) <= 4:
        raise argparse.ArgumentTypeError("model code must contain 1-4 ASCII characters")
    # Native CHRM/profile identities are four-byte, space-padded codes.
    return int.from_bytes(encoded.ljust(4, b" "), "little")


def decode_model_word(value: int) -> str:
    return value.to_bytes(4, "little").rstrip(b"\0 ").decode("ascii", "replace")


def require_count(label: str, value: int) -> int:
    if not 0 < value <= MAX_VERTEX_COUNT:
        raise RemoteProtocolError(f"implausible {label} {value}")
    return value


def decode_vertex_states(raw: bytes) -> list[dict[str, object]]:
    result = []
    for offset in range(0, len(raw), VERTEX_STATE_SIZE):
        words = struct.unpack_from("<6f", raw, offset)
        result.append({
            "position": list(words[:3]),
            "auxiliary": list(words[3:]),
        })
    return result


def read_blob(remote: FlycastRemote, pointer: int, size: int) -> bytes:
    if pointer == 0:
        return b""
    return remote.read_memory(pointer, size)


def capture_group(remote: FlycastRemote, group: int) -> dict[str, object]:
    group_raw = remote.read_memory(group, GROUP_SIZE)
    owner = u32(group_raw, 0x80)
    owner_raw = remote.read_memory(owner, OWNER_SIZE)
    vertex_count = require_count("control vertex count", u32(group_raw, 0x08))
    current = u32(group_raw, 0x0C)
    previous = u32(group_raw, 0x10)
    source = u32(group_raw, 0x14)
    constraint_records = u32(group_raw, 0x44)
    render_pair = u32(group_raw, 0x84)
    body_collision_count = owner_raw[2]
    body_collision_state = u32(owner_raw, 0x10)
    state_bytes = vertex_count * VERTEX_STATE_SIZE

    result: dict[str, object] = {
        "groupAddress": hx(group),
        "ownerAddress": hx(owner),
        "ownerModelWord": hx(u32(owner_raw, 0x2C)),
        "ownerModelCode": decode_model_word(u32(owner_raw, 0x2C)),
        "ownerProfileIndex": struct.unpack_from("<H", owner_raw, 0x40)[0],
        "ownerRuntimeMode": owner_raw[6],
        "bodyCollisionCount": body_collision_count,
        "bodyCollisionStateAddress": hx(body_collision_state),
        "bodyCollisionProfileAddress": hx(u32(owner_raw, 0x14)),
        "bodyCollisionStateRawHex": read_blob(
            remote,
            body_collision_state,
            body_collision_count * BODY_COLLISION_RECORD_SIZE,
        ).hex(),
        "flags": group_raw[0],
        "latticeRowCount": group_raw[1],
        "latticeColumnCount": group_raw[2],
        "controlType": s16(group_raw, 0x04),
        "collisionMask": s16(group_raw, 0x06) & 0xFFFF,
        "controlVertexCount": vertex_count,
        "currentStateAddress": hx(current),
        "previousStateAddress": hx(previous),
        "sourceStateAddress": hx(source),
        "controlNodeAddress": hx(u32(group_raw, 0x40)),
        "constraintRecordsAddress": hx(constraint_records),
        "renderPairAddress": hx(render_pair),
        "groupRawHex": group_raw.hex(),
        "ownerRawHex": owner_raw.hex(),
        "currentState": decode_vertex_states(read_blob(remote, current, state_bytes)),
        "previousState": decode_vertex_states(read_blob(remote, previous, state_bytes)),
        "sourceStateRawHex": read_blob(remote, source, state_bytes).hex(),
        "constraintRecordsRawHex": read_blob(
            remote,
            constraint_records,
            vertex_count * CONSTRAINT_RECORD_SIZE,
        ).hex(),
    }

    if render_pair:
        render_raw = remote.read_memory(render_pair, RENDER_PAIR_SIZE)
        render_count = require_count("render vertex count", u32(render_raw, 0x04))
        render_state = u32(render_raw, 0x08)
        render_source = u32(render_raw, 0x0C)
        render_map = u32(render_raw, 0x3C)
        result["renderPair"] = {
            "renderType": s16(render_raw, 0x38),
            "renderVertexCount": render_count,
            "renderStateAddress": hx(render_state),
            "renderSourceAddress": hx(render_source),
            "renderNodeAddress": hx(u32(render_raw, 0x10)),
            "renderMapAddress": hx(render_map),
            "rawHex": render_raw.hex(),
            "stateRawHex": read_blob(
                remote,
                render_state,
                render_count * VERTEX_STATE_SIZE,
            ).hex(),
            "sourceRawHex": read_blob(
                remote,
                render_source,
                render_count * VERTEX_STATE_SIZE,
            ).hex(),
            "mapRawHex": read_blob(
                remote,
                render_map,
                render_count * RENDER_MAP_RECORD_SIZE,
            ).hex(),
        }
    else:
        result["renderPair"] = None
    return result


def capture_samples(
    host: str,
    port: int,
    timeout: float,
    sample_count: int,
    target_model: int | None,
) -> tuple[list[dict[str, object]], int]:
    remote = FlycastRemote(host, port, timeout)
    installed = False
    stopped_at_breakpoint = False
    rejected_hits = 0
    samples: list[dict[str, object]] = []
    try:
        remote.command("?")
        remote.add_breakpoint(SURFACE_AUXILIARY_RETURN_BREAKPOINT)
        installed = True
        while len(samples) < sample_count:
            # CLTH groups update consecutively. Flycast can therefore reach
            # this breakpoint before its GDB thread has finished sending the
            # continue ACK and drop S05. Polling PC observes the stopped guest
            # without re-running either native update.
            remote.continue_until_register(
                16,
                SURFACE_AUXILIARY_RETURN,
                timeout=timeout,
            )
            stopped_at_breakpoint = True
            group = remote.read_register(14)
            group_raw = remote.read_memory(group, GROUP_SIZE)
            owner = u32(group_raw, 0x80)
            observed_model = remote.read_u32(owner + 0x2C)
            if target_model is None or observed_model == target_model:
                sample = {
                    "sequence": len(samples),
                    "capturedAtUnixSeconds": time.time(),
                    "surfaceAuxiliaryReturnAddress": hx(SURFACE_AUXILIARY_RETURN),
                    "group": capture_group(remote, group),
                }
                samples.append(sample)
                print(
                    f"captured {decode_model_word(observed_model)} CLTH update "
                    f"{len(samples)}/{sample_count} "
                    f"type={sample['group']['controlType']} "
                    f"vertices={sample['group']['controlVertexCount']}",
                    flush=True,
                )
            else:
                rejected_hits += 1
            remote.step_over_breakpoint(SURFACE_AUXILIARY_RETURN_BREAKPOINT)
            stopped_at_breakpoint = False
        return samples, rejected_hits
    finally:
        if stopped_at_breakpoint:
            try:
                remote.step_over_breakpoint(SURFACE_AUXILIARY_RETURN_BREAKPOINT)
            except (OSError, RemoteProtocolError):
                pass
        if installed:
            try:
                remote.remove_breakpoint(SURFACE_AUXILIARY_RETURN_BREAKPOINT)
            except (OSError, RemoteProtocolError):
                pass
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass
        remote.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--timeout", type=float, default=300.0)
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--model", type=model_word, default=model_word("KOK"))
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--save-state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples must be positive")

    started = time.time()
    samples, rejected_hits = capture_samples(
        args.host,
        args.port,
        args.timeout,
        args.samples,
        args.model,
    )
    payload = {
        "schema": "new-yokosuka-shenmue1-native-cloth-runtime-capture-v2",
        "status": "captured",
        "source": {
            "executable": str(args.executable),
            "executableSha256": sha256(args.executable),
            "saveState": str(args.save_state),
            "saveStateSha256": sha256(args.save_state),
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "clothStateWrites": False,
            "artificialFunctionCalls": False,
        },
        "native": {
            "groupUpdate": "0x0c0ae916",
            "bodyAnchorUpdate": "0x0c0aeca4",
            "positionConstraintAndCollisionSolve": "0x0c0af35e",
            "surfaceAuxiliaryUpdate": "0x0c0b0512",
            "surfaceAuxiliaryReturn": hx(SURFACE_AUXILIARY_RETURN),
            "groupSize": GROUP_SIZE,
            "constraintRecordSize": CONSTRAINT_RECORD_SIZE,
            "vertexStateSize": VERTEX_STATE_SIZE,
            "renderPairSize": RENDER_PAIR_SIZE,
            "renderMapRecordSize": RENDER_MAP_RECORD_SIZE,
            "bodyCollisionRecordSize": BODY_COLLISION_RECORD_SIZE,
        },
        "targetModelCode": (
            decode_model_word(args.model) if args.model is not None else None
        ),
        "targetModelWord": hx(args.model) if args.model is not None else None,
        "elapsedSeconds": round(time.time() - started, 3),
        "rejectedNonTargetHits": rejected_hits,
        "samples": samples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
