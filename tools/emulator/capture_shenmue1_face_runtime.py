#!/usr/bin/env python3
"""Capture naturally executed Shenmue I FACE/TALK evaluation in Flycast.

This probe is read-only with respect to Dreamcast RAM. It observes the native
FACE pose builder and its TALK curve/FTBL helpers, retaining raw registers,
stack words, face-state bytes, and pointed-to RAM so the browser evaluator can
be tested against the original executable instead of inferred visually.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


FACE_POSE_BUILD = 0x0C0BD128
TALK_CONTROL_BUILD = 0x0C090188
FTBL_VERTEX_ACCUMULATE = 0x0C08FEA0
FACE_POSE_BEGIN = 0x0C0902F8
FACE_POSE_APPLY = 0x0C0903EC
FACE_WORK_OFFSET = 0xD0
FACE_STATE_SIZE = 0xD0
RAM_START = 0x0C000000
RAM_END = 0x0D000000
# A TALK evaluation emits 25 three-float control deltas (300 bytes). Retain
# the complete aligned working block so captures can be used as an exact
# regression oracle for the browser evaluator, rather than only sampling the
# first few controls.
POINTER_SNAPSHOT_SIZE = 384

BREAKPOINTS = {
    FACE_POSE_BUILD: "face-pose-build",
    TALK_CONTROL_BUILD: "talk-control-build",
    FTBL_VERTEX_ACCUMULATE: "ftbl-vertex-accumulate",
    FACE_POSE_BEGIN: "face-pose-begin",
    FACE_POSE_APPLY: "face-pose-apply",
}

CAPTURE_STAGES = {
    "discovery": (FACE_POSE_BUILD,),
    "pose": (
        FACE_POSE_BUILD,
        TALK_CONTROL_BUILD,
        FTBL_VERTEX_ACCUMULATE,
        FACE_POSE_BEGIN,
    ),
    "full": tuple(BREAKPOINTS),
}


def breakpoint(address: int) -> int:
    return address | 0x80000000


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def cstring(data: bytes) -> str:
    return data.split(b"\0", 1)[0].decode("ascii", "replace")


def face_state(data: bytes, address: int) -> dict[str, object]:
    return {
        "address": hx(address),
        "modelName": cstring(data[0x00:0x10]),
        "tableName": cstring(data[0x10:0x20]),
        "modelRecord": hx(struct.unpack_from("<I", data, 0x20)[0]),
        "modelResource": hx(struct.unpack_from("<I", data, 0x24)[0]),
        "talkFamily": struct.unpack_from("<I", data, 0x28)[0],
        "clipBase": struct.unpack_from("<h", data, 0x2C)[0],
        "clipDuration": struct.unpack_from("<h", data, 0x2E)[0],
        "active": data[0x30],
        "slot": data[0x31],
        "command": data[0x44],
        "transitionState": data[0x45],
        "poseSelector": data[0x46],
        "poseLaneCount": data[0x47],
        "blinkTimer": struct.unpack_from("<h", data, 0x48)[0],
        "transitionDuration": struct.unpack_from("<h", data, 0x4A)[0],
        "nextBlinkTimer": struct.unpack_from("<h", data, 0x4C)[0],
        "neutralPose": struct.unpack_from("<h", data, 0x4E)[0],
        "blinkPose": struct.unpack_from("<h", data, 0x50)[0],
        "mode": data[0x52],
        "rawHex": data.hex(),
    }


def ram_pointer(value: int) -> bool:
    return RAM_START <= value <= RAM_END - POINTER_SNAPSHOT_SIZE


def pointer_snapshots(
    remote: FlycastRemote,
    registers: list[int],
    stack: bytes,
) -> list[dict[str, str]]:
    sources: list[tuple[str, int]] = [
        (f"r{index}", value) for index, value in enumerate(registers[:16])
    ]
    sources.extend(
        (f"stack+0x{offset:02x}", struct.unpack_from("<I", stack, offset)[0])
        for offset in range(0, len(stack), 4)
    )
    result: list[dict[str, str]] = []
    seen: set[int] = set()
    for source, address in sources:
        if address in seen or not ram_pointer(address):
            continue
        seen.add(address)
        try:
            value = remote.read_memory(address, POINTER_SNAPSHOT_SIZE)
        except (OSError, RemoteProtocolError):
            continue
        result.append({
            "source": source,
            "address": hx(address),
            "dataHex": value.hex(),
        })
    return result


def capture(
    remote: FlycastRemote,
    active_breakpoints: tuple[int, ...],
    event_count: int,
    target_model: str | None,
    target_event_count: int,
) -> tuple[list[dict[str, object]], bool, bool]:
    installed: list[int] = []
    events: list[dict[str, object]] = []
    current_face_address: int | None = None
    current_face: dict[str, object] | None = None
    target_events = 0
    timed_out = False
    interrupted = False
    try:
        remote.command("?")
        for address in active_breakpoints:
            installed_address = breakpoint(address)
            remote.add_breakpoint(installed_address)
            installed.append(installed_address)
        print("Armed native FACE/TALK pipeline", flush=True)

        while len(events) < event_count:
            try:
                remote.continue_until_stop()
            except TimeoutError:
                timed_out = True
                break
            except KeyboardInterrupt:
                interrupted = True
                break
            stopped = remote.read_register(16) | 0x80000000
            canonical = stopped & 0x0FFFFFFF
            if canonical not in BREAKPOINTS:
                raise RemoteProtocolError(
                    f"Stopped outside FACE/TALK pipeline at {hx(stopped)}"
                )
            registers = [remote.read_register(index) for index in range(41)]
            stack = remote.read_memory(registers[15], 64)

            if canonical == FACE_POSE_BUILD:
                candidate = (registers[6] - FACE_WORK_OFFSET) & 0xFFFFFFFF
                raw_state = remote.read_memory(candidate, FACE_STATE_SIZE)
                current_face_address = candidate
                current_face = face_state(raw_state, candidate)
            elif current_face_address is not None:
                raw_state = remote.read_memory(
                    current_face_address,
                    FACE_STATE_SIZE,
                )
                current_face = face_state(raw_state, current_face_address)

            event = {
                "sequence": len(events),
                "function": BREAKPOINTS[canonical],
                "address": hx(canonical),
                "returnAddress": hx(registers[17]),
                "gpr": [hx(value) for value in registers[:16]],
                "fpulWord": hx(registers[23]),
                "fpscrWord": hx(registers[24]),
                "frWords": [hx(value) for value in registers[25:41]],
                "stackAddress": hx(registers[15]),
                "stackHex": stack.hex(),
                "face": current_face,
                "pointerSnapshots": pointer_snapshots(
                    remote,
                    registers,
                    stack,
                ),
            }
            events.append(event)
            model_name = current_face["modelName"] if current_face else "?"
            print(
                f"{event['sequence']:03d} {event['function']} "
                f"{model_name} r4={event['gpr'][4]} r5={event['gpr'][5]}",
                flush=True,
            )
            if target_model is not None and model_name == target_model:
                target_events += 1
                if target_events >= target_event_count:
                    remote.step_over_breakpoint(stopped)
                    break
            remote.step_over_breakpoint(stopped)
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
    return events, timed_out, interrupted


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3264)
    parser.add_argument("--timeout", type=float, default=120.0)
    parser.add_argument(
        "--stage",
        choices=tuple(CAPTURE_STAGES),
        default="pose",
        help=(
            "discovery observes only face ownership changes; pose also "
            "captures TALK/FTBL construction; full includes per-frame apply"
        ),
    )
    parser.add_argument("--event-count", type=int, default=128)
    parser.add_argument("--target-model")
    parser.add_argument("--target-event-count", type=int, default=16)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--emulator", type=Path)
    parser.add_argument("--disc", type=Path)
    parser.add_argument("--state", type=Path)
    parser.add_argument("--state-index", type=int)
    args = parser.parse_args()
    if args.event_count < 1:
        parser.error("--event-count must be positive")
    if args.target_event_count < 1:
        parser.error("--target-event-count must be positive")

    started_at = time.time()
    remote = FlycastRemote(args.host, args.port, args.timeout)
    try:
        events, timed_out, interrupted = capture(
            remote,
            CAPTURE_STAGES[args.stage],
            args.event_count,
            args.target_model,
            args.target_event_count,
        )
    finally:
        remote.close()

    payload = {
        "schema": "new-yokosuka-s1-native-face-runtime-trace-v1",
        "status": "observed" if events else "not-observed",
        "source": {
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "observationType": "natural SH-4 FACE/TALK execution",
            "guestWrites": False,
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
                if args.state is not None and args.state_index is not None
                else None
            ),
        },
        "captureStage": args.stage,
        "breakpoints": {
            BREAKPOINTS[address]: hx(address)
            for address in CAPTURE_STAGES[args.stage]
        },
        "requestedEventCount": args.event_count,
        "targetModel": args.target_model,
        "targetEventCount": args.target_event_count,
        "observationCount": len(events),
        "timedOut": timed_out,
        "interrupted": interrupted,
        "elapsedSeconds": round(time.time() - started_at, 3),
        "events": events,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        f"Wrote {len(events)} FACE/TALK events to {args.output}",
        flush=True,
    )
    return 0 if events else 2


if __name__ == "__main__":
    raise SystemExit(main())
