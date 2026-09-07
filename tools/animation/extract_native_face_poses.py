#!/usr/bin/env python3
"""Evaluate Shenmue I TALK poses with the original SH-4 implementation.

This is an offline asset-generation tool, not a runtime dependency.  It calls
the game's TALK control builder in a disposable Flycast session, supplies each
exact *_FTBL.BIN control table, and records the resulting 25 three-float
control deltas.  The browser can therefore replay authored poses without
shipping an SH-4 interpreter or approximating the native inverse-kinematics
step.

Flycast must be paused at its GDB server after freshly auto-loading the pinned
save-state fixture.  The tool restores all memory and exposed registers that it
uses, but the emulator process should still be treated as disposable.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

from tools.emulator.flycast_gdb_remote import FlycastRemote, RemoteProtocolError


REPO_ROOT = Path(__file__).resolve().parents[2]
FACE_SOURCE_DIRECTORY = (
    REPO_ROOT / "extracted_files/data/SCENE/01/MODEL/FACE"
)
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "play/assets/cutscenes/native-faces/native-talk-poses.generated.json"
)

TALK_CONTROL_BUILD = 0x0C090188
RUNTIME_TALK_BASE = 0x0C355700
RUNTIME_UPPER_ROUTE = 0x0C360E58
RUNTIME_MOUTH_ROUTE = 0x0C360F84
CONTROL_COUNT = 25
CONTROL_RECORD_SIZE = 0x30
CONTROL_BYTES = CONTROL_COUNT * CONTROL_RECORD_SIZE
DELTA_BYTES = CONTROL_COUNT * 3 * 4
EXPECTED_TALK_POSE_DURATION = 79

EXPECTED_EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
EXPECTED_TALK_SHA256 = (
    "030bdecc443913a2518502d53356782b6f66df6d0f8181d8d5e345fa44b98359"
)
EXPECTED_YKC_TABLE_SHA256 = (
    "1b0f9d6317bcda987476eb99043e203575eed68920c93a0adf91482d918abd67"
)

FACE_BINDINGS = {
    "AKIR": ("YKC", "YKC_FTBL.BIN"),
    "SMTH": ("GIB", "GIB_FTBL.BIN"),
    "TONY": ("GIJ", "GIJ_FTBL.BIN"),
    "FUKU": ("FUK", "FUK_FTBL.BIN"),
    "INE_": ("INE", "INE_FTBL.BIN"),
    "IWAO": ("IWA", "IWA_FTBL.BIN"),
    "JAKR": ("JKA", "JKA_FTBL.BIN"),
    "SORY": ("KOK", "KOK_FTBL.BIN"),
    "HRSK": ("NZM", "NZM_FTBL.BIN"),
    "YAMA": ("YMG", "YMG_FTBL.BIN"),
    # OP02's opening vision carries a scene-local high-detail Shenhua face.
    # The table path is supplied explicitly with --binding when evaluated.
    "SINF": ("MGR", "MGR_FTBL.BIN"),
}

# Independent live trace of YKB/YKC lane 2 pose 1 from save slot 3.  These are
# deliberately sparse: they validate the call ABI and route selection without
# turning captured output into the pose source.
YKC_POSE_ONE_ORACLE = {
    0: (-0.0016194581985473633, 1.642678881808024e-09, -0.0032559186220169067),
    4: (-0.00010854005813598633, -7.987022399902344e-06, 0.0005072616040706635),
}


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def pinned_file(path: Path, expected_sha256: str | None = None) -> bytes:
    value = path.read_bytes()
    actual = sha256(value)
    if expected_sha256 is not None and actual != expected_sha256:
        raise RuntimeError(f"pinned source changed: {path} ({actual})")
    return value


def parse_control_records(value: bytes, label: str) -> bytes:
    if len(value) < 0x30 + CONTROL_BYTES:
        raise RuntimeError(f"{label} does not contain 25 FACE controls")
    payload_offset = struct.unpack_from("<I", value, 0x04)[0]
    control_end = struct.unpack_from("<I", value, 0x28)[0]
    if payload_offset != 0x30 or control_end - payload_offset != CONTROL_BYTES:
        raise RuntimeError(f"{label} FACE control section is not canonical")
    result = value[payload_offset:control_end]
    for index in range(CONTROL_COUNT):
        marker = struct.unpack_from(
            "<I", result, index * CONTROL_RECORD_SIZE + 0x0C
        )[0]
        if marker not in (1, 2):
            raise RuntimeError(f"{label} control {index} marker is unsupported")
    return result


def finite_float_list(value: bytes) -> list[float]:
    result = list(struct.unpack("<75f", value))
    if not all(math.isfinite(entry) and abs(entry) < 1 for entry in result):
        raise RuntimeError("native TALK evaluator returned invalid control data")
    return result


class NativeTalkOracle:
    def __init__(self, remote: FlycastRemote) -> None:
        self.remote = remote
        self.registers = [remote.read_register(index) for index in range(41)]
        self.original_pc = self.registers[16]
        original_sp = self.registers[15]
        self.call_stack = (original_sp - 0x8000) & 0xFFFFFFFF
        self.control_address = (original_sp - 0x5000) & 0xFFFFFFFF
        self.output_address = (original_sp - 0x4000) & 0xFFFFFFFF
        self.stack_start = self.call_stack - 0x200
        self.stack_size = 0x500
        self.saved_stack = remote.read_memory(self.stack_start, self.stack_size)
        self.saved_controls = remote.read_memory(
            self.control_address, CONTROL_BYTES
        )
        self.saved_output = remote.read_memory(self.output_address, DELTA_BYTES)
        self.breakpoint = self.original_pc | 0x80000000
        remote.add_breakpoint(self.breakpoint)
        self.closed = False

    def evaluate(
        self,
        controls: bytes,
        *,
        route: int,
        pose: int,
    ) -> list[float]:
        if self.closed:
            raise RuntimeError("native TALK oracle is closed")
        if len(controls) != CONTROL_BYTES or route not in (
            RUNTIME_UPPER_ROUTE,
            RUNTIME_MOUTH_ROUTE,
        ) or not 0 <= pose <= EXPECTED_TALK_POSE_DURATION:
            raise ValueError("invalid native TALK evaluation request")

        self.remote.write_memory(self.control_address, controls)
        self.remote.write_memory(self.output_address, bytes(DELTA_BYTES))
        self.remote.write_memory(
            self.call_stack,
            struct.pack(
                "<III",
                RUNTIME_TALK_BASE,
                route,
                self.output_address,
            ) + bytes(52),
        )
        # The native function preserves its callee-saved registers and starts
        # both control matrices from identity. Set only its documented ABI
        # inputs here; the complete original machine state is restored once in
        # close().
        for index, value in (
            (4, pose),
            (5, CONTROL_COUNT),
            (6, self.control_address),
            (7, self.control_address),
            (15, self.call_stack),
            (17, self.original_pc),
            (16, TALK_CONTROL_BUILD),
        ):
            self.remote.write_register(index, value)
        # Use the RSP continue-at-address form. Flycast routes that through
        # DebugAgent::doContinue(address), which installs the injected PC and
        # schedules the interpreter atomically. A preceding `P10=...` followed
        # by `s` can acknowledge the step without scheduling a freshly written
        # PC on some Flycast builds.
        stopped_pc = self.remote.continue_until_register(
            16,
            self.original_pc,
            timeout=self.remote.socket.gettimeout() or 15,
            start_address=TALK_CONTROL_BUILD,
        )
        if stopped_pc != self.original_pc:
            raise RuntimeError(
                f"native TALK call stopped at unexpected PC 0x{stopped_pc:08x}"
            )
        return finite_float_list(
            self.remote.read_memory(self.output_address, DELTA_BYTES)
        )

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        errors: list[Exception] = []
        for action in (
            lambda: self.remote.remove_breakpoint(self.breakpoint),
            lambda: self.remote.write_memory(self.stack_start, self.saved_stack),
            lambda: self.remote.write_memory(
                self.control_address, self.saved_controls
            ),
            lambda: self.remote.write_memory(self.output_address, self.saved_output),
        ):
            try:
                action()
            except (OSError, RemoteProtocolError) as error:
                errors.append(error)
        for index, value in enumerate(self.registers):
            try:
                self.remote.write_register(index, value)
            except (OSError, RemoteProtocolError) as error:
                errors.append(error)
        if errors:
            raise ExceptionGroup("could not restore native TALK oracle", errors)


def assert_oracle(deltas: list[float]) -> None:
    for control_index, expected in YKC_POSE_ONE_ORACLE.items():
        actual = deltas[control_index * 3 : control_index * 3 + 3]
        for channel, (left, right) in enumerate(zip(actual, expected)):
            if struct.pack("<f", left) != struct.pack("<f", right):
                raise RuntimeError(
                    "native TALK ABI validation failed at "
                    f"control {control_index} channel {channel}: {left} != {right}"
                )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3264)
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--actors",
        nargs="+",
        choices=tuple(FACE_BINDINGS),
        help="Regenerate only these actors and retain the other existing records",
    )
    parser.add_argument(
        "--binding",
        action="append",
        default=[],
        metavar="ACTOR=FACE:FTBL",
        help=(
            "Evaluate an exact alternate FACE table, for example "
            "JAKR=JKB:/path/to/JKB_FTBL.BIN. Alternate bindings replace the "
            "built-in binding for that actor and are suitable for archive-local variants."
        ),
    )
    args = parser.parse_args()

    executable_path = REPO_ROOT / ".disc-work/exact/1ST_READ.BIN"
    executable = pinned_file(executable_path, EXPECTED_EXECUTABLE_SHA256)
    talk_path = FACE_SOURCE_DIRECTORY / "TALK_N00.BIN"
    talk = pinned_file(talk_path, EXPECTED_TALK_SHA256)
    pose_duration = struct.unpack_from("<I", talk, 0x08)[0]
    if pose_duration != EXPECTED_TALK_POSE_DURATION:
        raise RuntimeError(
            f"pinned TALK pose duration changed: {pose_duration}"
        )
    bindings: dict[str, tuple[str, Path]] = {
        actor_tag: (face_code, FACE_SOURCE_DIRECTORY / filename)
        for actor_tag, (face_code, filename) in FACE_BINDINGS.items()
    }
    alternate_actor_tags: set[str] = set()
    for specification in args.binding:
        try:
            actor_tag, value = specification.split("=", 1)
            face_code, table_value = value.split(":", 1)
        except ValueError as error:
            raise RuntimeError(
                f"invalid alternate FACE binding {specification!r}"
            ) from error
        actor_tag = actor_tag.strip().upper()
        face_code = face_code.strip().upper()
        table_path = Path(table_value).expanduser().resolve()
        if not actor_tag or not face_code or not table_path.is_file():
            raise RuntimeError(
                f"invalid alternate FACE binding {specification!r}"
            )
        bindings[actor_tag] = (face_code, table_path)
        alternate_actor_tags.add(actor_tag)
    tables: dict[str, tuple[str, bytes, bytes]] = {}
    selected_actor_tags = set(args.actors or alternate_actor_tags or bindings)
    unknown_actor_tags = selected_actor_tags - bindings.keys()
    if unknown_actor_tags:
        raise RuntimeError(
            "unknown FACE actor binding(s): " + ", ".join(sorted(unknown_actor_tags))
        )
    for actor_tag, (face_code, table_path) in bindings.items():
        if actor_tag not in selected_actor_tags:
            continue
        table = pinned_file(table_path)
        tables[actor_tag] = (
            face_code,
            table,
            parse_control_records(table, table_path.name),
        )

    remote = FlycastRemote(args.host, args.port, args.timeout)
    oracle: NativeTalkOracle | None = None
    try:
        remote.command("?")
        runtime_talk = remote.read_memory(RUNTIME_TALK_BASE, len(talk))
        if runtime_talk != talk:
            raise RuntimeError(
                "Flycast state does not contain the pinned TALK_N00.BIN"
            )
        oracle = NativeTalkOracle(remote)
        validation_table = pinned_file(
            FACE_SOURCE_DIRECTORY / "YKC_FTBL.BIN",
            EXPECTED_YKC_TABLE_SHA256,
        )
        assert_oracle(oracle.evaluate(
            parse_control_records(validation_table, "YKC_FTBL.BIN"),
            route=RUNTIME_MOUTH_ROUTE,
            pose=1,
        ))
        actors: dict[str, object] = {}
        if args.actors and args.output.exists():
            prior = json.loads(args.output.read_text(encoding="utf-8"))
            if prior.get("schema") != "new-yokosuka-native-talk-control-poses-v2":
                raise RuntimeError("existing TALK pose output has an unsupported schema")
            actors.update(prior.get("actors", {}))
        for actor_tag, (face_code, table, controls) in tables.items():
            upper = [
                oracle.evaluate(controls, route=RUNTIME_UPPER_ROUTE, pose=pose)
                for pose in range(pose_duration + 1)
            ]
            mouth = [
                oracle.evaluate(controls, route=RUNTIME_MOUTH_ROUTE, pose=pose)
                for pose in range(pose_duration + 1)
            ]
            actors[actor_tag] = {
                "faceCode": face_code,
                "tableSha256": sha256(table),
                "upperPoses": upper,
                "mouthPoses": mouth,
            }
            print(
                f"Evaluated {actor_tag}/{face_code}: "
                f"{len(upper)} upper + {len(mouth)} mouth poses"
            )
    finally:
        if oracle is not None:
            oracle.close()
        try:
            remote.detach()
        except (OSError, RemoteProtocolError):
            pass
        remote.close()

    result = {
        "schema": "new-yokosuka-native-talk-control-poses-v2",
        "generatedBy": "tools/animation/extract_native_face_poses.py",
        "controlCount": CONTROL_COUNT,
        "channelsPerControl": 3,
        "poseDuration": pose_duration,
        "source": {
            "executable": {
                "path": ".disc-work/exact/1ST_READ.BIN",
                "sha256": sha256(executable),
                "function": "0x0c090188",
            },
            "talk": {
                "path": "extracted_files/data/SCENE/01/MODEL/FACE/TALK_N00.BIN",
                "byteLength": len(talk),
                "sha256": sha256(talk),
                "upperRouteOffset": struct.unpack_from("<I", talk, 0)[0],
                "mouthRouteOffset": struct.unpack_from("<I", talk, 4)[0],
            },
            "validation": {
                "fixture": "save-slot-3 YKB/YKC live TALK trace",
                "mouthPose": 1,
                "controls": {
                    str(index): list(value)
                    for index, value in YKC_POSE_ONE_ORACLE.items()
                },
            },
        },
        "actors": actors,
    }
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RemoteProtocolError, RuntimeError) as error:
        print(f"FACE pose extraction failed: {error}", file=sys.stderr)
        raise SystemExit(1)
