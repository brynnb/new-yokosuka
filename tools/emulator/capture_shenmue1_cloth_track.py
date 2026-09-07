#!/usr/bin/env python3
"""Capture or finalize a coordinate-aware native CLTH track from Flycast.

The probe stops at 0x0c0aea38, immediately after FUN_0c0aede8 has converted
the solved control lattice back into model-local output coordinates and before
FUN_0c0b11e4 projects it through the render pair. Samples are read-only and
stored as fixed-point positions plus auxiliary endpoints in native lattice
order. The preferred path injects a lightweight host callback at that exact
guest boundary while Flycast's dynarec remains enabled; the GDB path remains
as a slower research fallback. The compact track is suitable for deterministic
browser replay while the retained tool and provenance metadata permit recapture.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import time
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


LOCAL_OUTPUT_RETURN = 0x0C0AEA38
LOCAL_OUTPUT_BREAKPOINT = LOCAL_OUTPUT_RETURN | 0x80000000
ACTIVITY_FRAME_UPDATER = 0x0C154DB0
ACTIVITY_FRAME_BREAKPOINT = ACTIVITY_FRAME_UPDATER | 0x80000000
GROUP_SIZE = 0x88
OWNER_SIZE = 0x44
VERTEX_STATE_SIZE = 0x18
TRACK_MAGIC = b"NYCLTH01"
TRACK_VERSION = 2
TRACK_FPS = 30
TRACK_COMPONENT_COUNT = 6
TRACK_QUANTIZATION_SCALE = 1.0 / 8192.0
MAX_VERTEX_COUNT = 4096
ACTIVE_ACTIVITY_ADDRESS = 0x0C222B00
ACTIVITY_SLOT_TABLE_ADDRESS = 0x0C222588
ACTIVITY_SLOT_COUNT = 70
ACTIVITY_SLOT_RECORD_SIZE = 0x14
ACTIVITY_SLOT_RESOURCE_OFFSET = 0x04
ACTIVITY_RESOURCE_OFFSET = 0x0C
ACTIVITY_CURRENT_FRAME_OFFSET = 0x2C


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_word(text: str) -> int:
    encoded = text.upper().encode("ascii")
    if not 1 <= len(encoded) <= 4:
        raise argparse.ArgumentTypeError(
            "model code must contain 1-4 ASCII characters"
        )
    return int.from_bytes(encoded.ljust(4, b" "), "little")


def decode_model_word(value: int) -> str:
    return value.to_bytes(4, "little").rstrip(b"\0 ").decode("ascii", "replace")


def u32(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<I", raw, offset)[0]


def s16(raw: bytes, offset: int) -> int:
    return struct.unpack_from("<h", raw, offset)[0]


def quantize_state(raw: bytes) -> bytes:
    if len(raw) % 4 != 0:
        raise ValueError("native cloth state is not float32-aligned")
    values = struct.unpack(f"<{len(raw) // 4}f", raw)
    quantized: list[int] = []
    for index, value in enumerate(values):
        if not math.isfinite(value):
            raise ValueError(f"native cloth component {index} is not finite")
        encoded = round(value / TRACK_QUANTIZATION_SCALE)
        if not -32768 <= encoded <= 32767:
            raise ValueError(
                f"native cloth component {index} value {value} exceeds track range"
            )
        quantized.append(encoded)
    return struct.pack(f"<{len(quantized)}h", *quantized)


def build_track(
    *,
    frames: list[tuple[int, int, bytes]],
    vertex_count: int,
    control_type: int,
    row_count: int,
    column_count: int,
    owner_model_word: int,
) -> bytes:
    header = struct.pack(
        "<8sHHIIhHHHIf",
        TRACK_MAGIC,
        TRACK_VERSION,
        40,
        len(frames),
        vertex_count,
        control_type,
        row_count,
        column_count,
        TRACK_COMPONENT_COUNT,
        owner_model_word,
        TRACK_QUANTIZATION_SCALE,
    )
    records = b"".join(
        struct.pack("<HHI", slot, 0, activity_frame) + frame
        for slot, activity_frame, frame in frames
    )
    return header + bytes(40 - len(header)) + records


def inspect_track(
    raw: bytes,
    *,
    target_model_word: int,
) -> tuple[list[tuple[int, int]], dict[str, int]]:
    if len(raw) < 40:
        raise ValueError("native cloth track header is truncated")
    (
        magic,
        version,
        header_size,
        sample_count,
        vertex_count,
        control_type,
        row_count,
        column_count,
        component_count,
        owner_model_word,
        quantization_scale,
    ) = struct.unpack_from("<8sHHIIhHHHIf", raw)
    if magic != TRACK_MAGIC or version != TRACK_VERSION or header_size != 40:
        raise ValueError("native cloth track identity is invalid")
    if raw[36:40] != b"\0\0\0\0":
        raise ValueError("native cloth track reserved header bytes are nonzero")
    if (
        sample_count < 1
        or not 0 < vertex_count <= MAX_VERTEX_COUNT
        or row_count * column_count != vertex_count
        or component_count != TRACK_COMPONENT_COUNT
        or owner_model_word != target_model_word
        or not math.isclose(
            quantization_scale,
            TRACK_QUANTIZATION_SCALE,
            rel_tol=0,
            abs_tol=1e-12,
        )
    ):
        raise ValueError("native cloth track header fields are invalid")
    record_size = 8 + vertex_count * component_count * 2
    expected_size = header_size + sample_count * record_size
    if len(raw) != expected_size:
        raise ValueError(
            f"native cloth track length {len(raw)} does not match {expected_size}"
        )
    coordinates: list[tuple[int, int]] = []
    completed_slots: set[int] = set()
    for index in range(sample_count):
        offset = header_size + index * record_size
        slot, reserved, activity_frame = struct.unpack_from("<HHI", raw, offset)
        if reserved != 0:
            raise ValueError(
                f"native cloth track sample {index} reserved field is nonzero"
            )
        coordinate = (slot, activity_frame)
        if coordinates:
            previous_slot, previous_frame = coordinates[-1]
            if slot == previous_slot and activity_frame <= previous_frame:
                raise ValueError(
                    "native cloth track activity frames are not ordered"
                )
            if slot != previous_slot:
                completed_slots.add(previous_slot)
                if slot in completed_slots:
                    raise ValueError(
                        "native cloth track activity slot is discontiguous"
                    )
        coordinates.append(coordinate)
    return coordinates, {
        "ownerModelWord": owner_model_word,
        "controlType": control_type,
        "rowCount": row_count,
        "columnCount": column_count,
        "vertexCount": vertex_count,
    }


def activity_coordinate(remote: FlycastRemote) -> tuple[int, int]:
    active_address = u32(remote.read_memory(ACTIVE_ACTIVITY_ADDRESS, 4), 0)
    if active_address == 0:
        raise RemoteProtocolError("native cloth updated without an active AUTH")
    activity = remote.read_memory(
        active_address,
        ACTIVITY_CURRENT_FRAME_OFFSET + 4,
    )
    resource_address = u32(activity, ACTIVITY_RESOURCE_OFFSET)
    activity_frame = u32(activity, ACTIVITY_CURRENT_FRAME_OFFSET)
    slots = remote.read_memory(
        ACTIVITY_SLOT_TABLE_ADDRESS,
        ACTIVITY_SLOT_COUNT * ACTIVITY_SLOT_RECORD_SIZE,
    )
    matches = [
        slot
        for slot in range(ACTIVITY_SLOT_COUNT)
        if u32(
            slots,
            slot * ACTIVITY_SLOT_RECORD_SIZE + ACTIVITY_SLOT_RESOURCE_OFFSET,
        ) == resource_address
    ]
    if len(matches) != 1:
        raise RemoteProtocolError(
            f"native AUTH resource 0x{resource_address:08x} matched slots {matches}"
        )
    return matches[0], activity_frame


def capture_track(
    *,
    host: str,
    port: int,
    timeout: float,
    maximum_frames: int,
    minimum_frames: int,
    target_model_word: int,
    terminal_slot: int | None,
    terminal_frame: int | None,
) -> tuple[list[tuple[int, int, bytes]], dict[str, int], int, str]:
    remote = FlycastRemote(host, port, max(timeout, 10.0))
    installed_breakpoints: list[int] = []
    stopped_at_breakpoint = False
    frames: list[tuple[int, int, bytes]] = []
    identity: dict[str, int] | None = None
    rejected_hits = 0
    completion = "maximum-frames"
    try:
        remote.command("?")
        # Discover the exact runtime group from one real native CLTH update.
        # Keeping the AUTH updater breakpoint installed at the same time makes
        # Flycast drop the closely-spaced second stop packet, so discovery and
        # frame sampling intentionally use two sequential phases.
        remote.add_breakpoint(LOCAL_OUTPUT_BREAKPOINT)
        installed_breakpoints.append(LOCAL_OUTPUT_BREAKPOINT)
        group_address = None
        while group_address is None:
            remote.continue_until_register(16, LOCAL_OUTPUT_RETURN, timeout=timeout)
            stopped_at_breakpoint = True
            candidate_address = remote.read_register(14)
            candidate = remote.read_memory(candidate_address, GROUP_SIZE)
            owner_address = u32(candidate, 0x80)
            owner = remote.read_memory(owner_address, OWNER_SIZE)
            if u32(owner, 0x2C) == target_model_word:
                group_address = candidate_address
                vertex_count = u32(candidate, 0x08)
                identity = {
                    "ownerModelWord": target_model_word,
                    "controlType": s16(candidate, 0x04),
                    "rowCount": candidate[1],
                    "columnCount": candidate[2],
                    "vertexCount": vertex_count,
                }
                if (
                    not 0 < vertex_count <= MAX_VERTEX_COUNT
                    or identity["rowCount"] * identity["columnCount"] != vertex_count
                ):
                    raise RemoteProtocolError("native cloth lattice identity is invalid")
            else:
                rejected_hits += 1
            remote.step_over_breakpoint(LOCAL_OUTPUT_BREAKPOINT)
            stopped_at_breakpoint = False
        remote.remove_breakpoint(LOCAL_OUTPUT_BREAKPOINT)
        installed_breakpoints.remove(LOCAL_OUTPUT_BREAKPOINT)
        remote.add_breakpoint(ACTIVITY_FRAME_BREAKPOINT)
        installed_breakpoints.append(ACTIVITY_FRAME_BREAKPOINT)

        while len(frames) < maximum_frames:
            remote.continue_until_register(
                16, ACTIVITY_FRAME_UPDATER, timeout=timeout,
            )
            stopped_at_breakpoint = True
            group = remote.read_memory(group_address, GROUP_SIZE)
            owner_address = u32(group, 0x80)
            observed_model_word = 0
            if owner_address != 0:
                owner = remote.read_memory(owner_address, OWNER_SIZE)
                observed_model_word = u32(owner, 0x2C)
            coordinate = activity_coordinate(remote)
            if observed_model_word == target_model_word:
                vertex_count = u32(group, 0x08)
                observed = {
                    "ownerModelWord": observed_model_word,
                    "controlType": s16(group, 0x04),
                    "rowCount": group[1],
                    "columnCount": group[2],
                    "vertexCount": vertex_count,
                }
                if observed != identity:
                    raise RemoteProtocolError(
                        "target native cloth identity changed during capture"
                    )
                current_state = u32(group, 0x0C)
                raw = remote.read_memory(
                    current_state,
                    vertex_count * VERTEX_STATE_SIZE,
                )
                if (
                    frames
                    and coordinate[0] == frames[-1][0]
                    and coordinate[1] <= frames[-1][1]
                ):
                    raise RemoteProtocolError(
                        f"native cloth AUTH frame {coordinate} did not advance"
                    )
                frames.append((*coordinate, quantize_state(raw)))
                if len(frames) == 1 or len(frames) % TRACK_FPS == 0:
                    print(
                        f"captured {decode_model_word(observed_model_word)} "
                        f"CLTH sample {len(frames)} at "
                        f"AUTH {coordinate[0]}:{coordinate[1]} "
                        f"({len(frames) / TRACK_FPS:.1f}s)",
                        flush=True,
                    )
                if (
                    terminal_slot is not None
                    and terminal_frame is not None
                    and coordinate[0] == terminal_slot
                    and coordinate[1] >= terminal_frame
                ):
                    completion = "terminal-auth-frame"
            else:
                rejected_hits += 1
            terminal = (
                terminal_slot is not None
                and terminal_frame is not None
                and coordinate[0] == terminal_slot
                and coordinate[1] >= terminal_frame
            )
            remote.step_over_breakpoint(ACTIVITY_FRAME_BREAKPOINT)
            stopped_at_breakpoint = False
            if terminal:
                completion = "terminal-auth-frame"
                break
        if len(frames) < minimum_frames:
            raise RemoteProtocolError(
                f"captured only {len(frames)} native cloth frames"
            )
        return frames, identity, rejected_hits, completion
    finally:
        if stopped_at_breakpoint:
            try:
                current_pc = remote.read_register(16)
                breakpoint = (
                    LOCAL_OUTPUT_BREAKPOINT
                    if current_pc == LOCAL_OUTPUT_RETURN
                    else ACTIVITY_FRAME_BREAKPOINT
                )
                remote.step_over_breakpoint(breakpoint)
            except (OSError, RemoteProtocolError):
                pass
        for breakpoint in reversed(installed_breakpoints):
            try:
                remote.remove_breakpoint(breakpoint)
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
    parser.add_argument("--port", type=int)
    parser.add_argument(
        "--instrumented-track",
        type=Path,
        help="finalize a v2 track recorded by Flycast dynarec instrumentation",
    )
    parser.add_argument("--emulator-source-commit")
    parser.add_argument("--emulator-binary", type=Path)
    parser.add_argument("--instrumentation-patch", type=Path)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--maximum-frames", type=int, default=2400)
    parser.add_argument("--minimum-frames", type=int, default=300)
    parser.add_argument("--model", type=model_word, required=True)
    parser.add_argument("--terminal-slot", type=int)
    parser.add_argument("--terminal-frame", type=int)
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--save-state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata-output", type=Path)
    args = parser.parse_args()
    if not 1 <= args.minimum_frames <= args.maximum_frames:
        parser.error("frame bounds must satisfy 1 <= minimum <= maximum")
    if (args.terminal_slot is None) != (args.terminal_frame is None):
        parser.error("terminal slot and frame must be supplied together")
    for path in (args.executable, args.save_state):
        if not path.is_file():
            parser.error(f"required source is unavailable: {path}")
    if args.instrumented_track is None and args.port is None:
        parser.error("--port is required for GDB capture")
    if args.instrumented_track is not None and args.port is not None:
        parser.error("--instrumented-track and --port are mutually exclusive")
    if args.instrumented_track is not None:
        if not args.emulator_source_commit:
            parser.error(
                "--emulator-source-commit is required for instrumented capture"
            )
        if not args.emulator_binary or not args.emulator_binary.is_file():
            parser.error("--emulator-binary is required for instrumented capture")
        if not args.instrumentation_patch or not args.instrumentation_patch.is_file():
            parser.error(
                "--instrumentation-patch is required for instrumented capture"
            )

    started = time.time()
    if args.instrumented_track is not None:
        if not args.instrumented_track.is_file():
            parser.error(
                f"instrumented track is unavailable: {args.instrumented_track}"
            )
        track = args.instrumented_track.read_bytes()
        try:
            coordinates, identity = inspect_track(
                track,
                target_model_word=args.model,
            )
        except ValueError as error:
            parser.error(str(error))
        if not args.minimum_frames <= len(coordinates) <= args.maximum_frames:
            parser.error(
                "instrumented track sample count is outside configured bounds"
            )
        frames = [(slot, frame, b"") for slot, frame in coordinates]
        rejected_hits = 0
        completion = "terminal-auth-frame"
        if args.terminal_slot is not None:
            terminal = (args.terminal_slot, args.terminal_frame)
            if coordinates[-1] != terminal:
                parser.error(
                    "instrumented track does not end at the required terminal AUTH frame"
                )
        transport = "Flycast dynarec local-output instrumentation"
    else:
        frames, identity, rejected_hits, completion = capture_track(
            host=args.host,
            port=args.port,
            timeout=args.timeout,
            maximum_frames=args.maximum_frames,
            minimum_frames=args.minimum_frames,
            target_model_word=args.model,
            terminal_slot=args.terminal_slot,
            terminal_frame=args.terminal_frame,
        )
        track = build_track(
            frames=frames,
            vertex_count=identity["vertexCount"],
            control_type=identity["controlType"],
            row_count=identity["rowCount"],
            column_count=identity["columnCount"],
            owner_model_word=identity["ownerModelWord"],
        )
        transport = "built-in GDB remote stub"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(track)
    metadata_path = args.metadata_output or args.output.with_suffix(".json")
    activity_coverage = []
    activity_slots = list(dict.fromkeys(slot for slot, _, _ in frames))
    for slot in activity_slots:
        activity_frames = [
            activity_frame
            for activity_slot, activity_frame, _ in frames
            if activity_slot == slot
        ]
        activity_coverage.append({
            "slot": slot,
            "firstFrame": min(activity_frames),
            "lastFrame": max(activity_frames),
            "sampleCount": len(activity_frames),
        })
    source_metadata = {
        "executable": str(args.executable),
        "executableSha256": sha256_path(args.executable),
        "saveState": str(args.save_state),
        "saveStateSha256": sha256_path(args.save_state),
        "emulator": "Flycast",
        "transport": transport,
        "clothStateWrites": False,
        "artificialFunctionCalls": False,
    }
    if args.instrumented_track is not None:
        source_metadata.update({
            "emulatorSourceCommit": args.emulator_source_commit,
            "emulatorBinary": str(args.emulator_binary),
            "emulatorBinarySha256": sha256_path(args.emulator_binary),
            "instrumentationPatch": str(args.instrumentation_patch),
            "instrumentationPatchSha256": sha256_path(
                args.instrumentation_patch
            ),
        })
    metadata = {
        "schema": "new-yokosuka-native-cloth-track-v2",
        "status": "captured",
        "source": source_metadata,
        "native": {
            "groupUpdate": "0x0c0ae916",
            "inverseBodyTransform": "0x0c0aede8",
            "localOutputReturn": f"0x{LOCAL_OUTPUT_RETURN:08x}",
            "renderPairProjection": "0x0c0b11e4",
        },
        "track": {
            "path": str(args.output),
            "sha256": sha256_bytes(track),
            "byteLength": len(track),
            "frameRate": TRACK_FPS,
            "frameCount": len(frames),
            "sampleSeconds": len(frames) / TRACK_FPS,
            "formatVersion": TRACK_VERSION,
            "componentCount": TRACK_COMPONENT_COUNT,
            "coordinateKind": "native-auth-slot-frame",
            "sampleCount": len(frames),
            "firstCoordinate": list(frames[0][:2]),
            "lastCoordinate": list(frames[-1][:2]),
            "activityCoverage": activity_coverage,
            "quantizationScale": TRACK_QUANTIZATION_SCALE,
            "modelCode": decode_model_word(identity["ownerModelWord"]),
            "modelWord": f"0x{identity['ownerModelWord']:08x}",
            "controlType": identity["controlType"],
            "rowCount": identity["rowCount"],
            "columnCount": identity["columnCount"],
            "vertexCount": identity["vertexCount"],
            "completion": completion,
            "rejectedNonTargetHits": rejected_hits,
        },
        (
            "finalizationElapsedSeconds"
            if args.instrumented_track is not None
            else "captureElapsedSeconds"
        ): round(time.time() - started, 3),
    }
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"wrote {args.output} and {metadata_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
