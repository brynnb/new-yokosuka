#!/usr/bin/env python3
"""Extract native MT7 UV-scroll commands from Shenmue II EV1 overlays.

The room overlays call the engine's UV-delta setter, resolve a MAP model by
number, and then apply the generic recursive MT7 UV updater.  This extractor
recognizes the two compiler forms observed in the original SH-4 overlays:

* a zero U delta plus one literal V delta; and
* adjacent literal V/U deltas loaded through ``fmov @r0+``.

It intentionally matches the complete setter -> model lookup -> apply chain,
not isolated SH-4 opcodes, so unrelated indirect calls are not catalogued as
texture animation.
"""

from __future__ import annotations

import argparse
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class UvAnimation:
    scene_group: str
    room_id: str
    ev1_file: str
    instruction_offset: int
    model_index: int
    source_u_per_update: float
    source_v_per_update: float


def _mova_literal_offset(instruction_index: int, opcode: int) -> int:
    pc = instruction_index * 2
    return ((pc + 4) & ~3) + (opcode & 0xFF) * 4


def _float_at(data: bytes, offset: int) -> float:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"float literal at 0x{offset:x} is outside EV1")
    return struct.unpack_from("<f", data, offset)[0]


def scan_ev1(path: Path) -> list[UvAnimation]:
    data = path.read_bytes()
    words = struct.unpack(f"<{len(data) // 2}H", data[: len(data) // 2 * 2])
    results: list[UvAnimation] = []

    for index in range(len(words) - 12):
        mova = words[index]
        if mova & 0xFF00 != 0xC700:
            continue

        literal_offset = _mova_literal_offset(index, mova)
        cursor = index + 1
        source_u = None
        source_v = None

        # mova literal,r0; fmov @r0,fr5; ...; fmov fr12,fr4
        if words[cursor] == 0xF508:
            source_v = _float_at(data, literal_offset)
            source_u = 0.0
            cursor += 1
            setter_delay_slot = 0xF4CC
        # mova literal,r0; fmov @r0+,fr5; ...; fmov @r0,fr4
        elif words[cursor] == 0xF509:
            source_v = _float_at(data, literal_offset)
            source_u = _float_at(data, literal_offset + 4)
            cursor += 1
            setter_delay_slot = 0xF408
        else:
            continue

        if tuple(words[cursor : cursor + 3]) != (
            0x518D,  # mov.l @(0x34,r8),r1: UV-delta setter
            0x410B,  # jsr @r1
            setter_delay_slot,
        ):
            continue
        cursor += 3

        # The first use in a function loads the model API table into r9.
        if words[cursor] & 0xFF00 == 0xD900:
            cursor += 1

        if cursor + 6 > len(words):
            continue
        model_opcode = words[cursor + 2]
        if not (
            tuple(words[cursor : cursor + 2]) == (0x519B, 0x410B)
            and model_opcode & 0xFF00 == 0xE400
            and tuple(words[cursor + 3 : cursor + 6])
            == (0x518F, 0x410B, 0x6403)
        ):
            continue

        model_index = model_opcode & 0xFF
        if model_index & 0x80:
            model_index -= 0x100
        results.append(
            UvAnimation(
                scene_group=path.parent.parent.name.upper(),
                room_id=path.parent.name.upper(),
                ev1_file=path.name,
                instruction_offset=index * 2,
                model_index=model_index,
                source_u_per_update=source_u,
                source_v_per_update=source_v,
            )
        )

    return results


def scan_paths(paths: Iterable[Path]) -> list[UvAnimation]:
    ev1_files: set[Path] = set()
    for path in paths:
        if path.is_dir():
            ev1_files.update(
                candidate
                for candidate in path.rglob("*")
                if candidate.is_file() and candidate.suffix.upper() == ".EV1"
            )
        elif path.suffix.upper() == ".EV1":
            ev1_files.add(path)
    return sorted(
        (animation for path in sorted(ev1_files) for animation in scan_ev1(path)),
        key=lambda item: (
            item.scene_group,
            item.room_id,
            item.model_index,
            item.instruction_offset,
        ),
    )


def _json_records(animations: Iterable[UvAnimation]) -> list[dict[str, object]]:
    def authored_float(value: float) -> float:
        return float(f"{value:.7g}")

    return [
        {
            "sceneGroup": item.scene_group,
            "roomId": item.room_id,
            "ev1File": item.ev1_file,
            "instructionOffset": item.instruction_offset,
            "modelIndex": item.model_index,
            "sourceUPerUpdate": authored_float(item.source_u_per_update),
            "sourceVPerUpdate": authored_float(item.source_v_per_update),
        }
        for item in animations
    ]


def write_javascript(path: Path, animations: Iterable[UvAnimation]) -> None:
    records = "\n".join(
        f"  {line}" for line in json.dumps(_json_records(animations), indent=2).splitlines()
    )
    source = (
        "// Generated by tools/animation/extract_shenmue2_uv_animations.py.\n"
        "// Native deltas are per Shenmue II game update (30 updates/second).\n"
        "export const SHENMUE_II_NATIVE_UV_ANIMATIONS = Object.freeze(\n"
        f"{records}\n"
        "    .map((entry) => Object.freeze(entry)),\n"
        ");\n"
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(source, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path, help="EV1 files or roots")
    parser.add_argument("--js-out", type=Path, help="write a runtime JS registry")
    args = parser.parse_args()
    animations = scan_paths(args.paths)
    if args.js_out:
        write_javascript(args.js_out, animations)
    print(json.dumps(_json_records(animations), indent=2))


if __name__ == "__main__":
    main()
