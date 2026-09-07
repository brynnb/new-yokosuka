#!/usr/bin/env python3
"""Extract authored player entry points from every MAPINFO.BIN.

MAPINFO serializes each entry as three consecutive typed properties:

    Entry    type 0x21, float entry ID
    Position type 0x49, three floats
    Angle    type 0x01, one float

Each property name is a self-relative pointer into STRG.  Matching those
names and types makes this independent of the block's absolute file offset
and avoids treating arbitrary float sequences as player spawns.

Some small interiors do not serialize an Entry table.  They instead serialize
Ryo himself as the ``AKIR`` Character in CHRS.  JHD0 and JOMO independently
contain both representations, and their AKIR Position/Angle values are
bit-identical to typed Entry 0.  This extractor therefore also emits an exact
default-player placement for AKIR records.  It deliberately does not promote
partial-body records such as ``YKUR`` or infer an origin for maps with no AKIR.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from typing import Any, Iterable


DEFAULT_ROOTS = [
    Path("extracted_files/data/SCENE/01"),
    Path("extracted_disc2_v2/data/SCENE/02"),
    Path("extracted_disc3_v2/data/SCENE/03"),
]

FULL_TURN = 0x10000


def u32(data: bytes, offset: int) -> int:
    return struct.unpack_from("<I", data, offset)[0]


def f32(data: bytes, offset: int) -> float:
    return struct.unpack_from("<f", data, offset)[0]


def relative_cstring(data: bytes, offset: int) -> str | None:
    target = offset + u32(data, offset)
    if not (0 <= target < len(data)):
        return None
    end = data.find(b"\0", target, min(len(data), target + 128))
    if end < 0:
        return None
    try:
        return data[target:end].decode("ascii")
    except UnicodeDecodeError:
        return None


def token(data: bytes, signature: bytes, start: int = 0) -> tuple[int, int] | None:
    offset = data.find(signature, start)
    while offset >= 0:
        if offset + 8 <= len(data):
            size = u32(data, offset + 4)
            if size >= 8 and offset + size <= len(data):
                return offset, offset + size
        offset = data.find(signature, offset + 1)
    return None


def extract_map_direction(data: bytes) -> dict[str, Any] | None:
    """Decode CHRD/DIRT using the native loader's exact conversion.

    1ST_READ.BIN 0x0c0f26e0 reads the uint32 at DIRT+8 and converts it to
    Shenmue's 16-bit turn units as ``degrees * 8192 / 45`` before storing it
    through 0x0c0f138a.  Keep both representations so the evidence retains
    the serialized value and the engine value rather than recomputing either
    from browser coordinates.
    """
    dirt = token(data, b"DIRT")
    if dirt is None or dirt[1] - dirt[0] < 12:
        return None
    degrees = u32(data, dirt[0] + 8)
    native_turn_units = (degrees << 13) // 45
    return {
        "degrees": degrees,
        "nativeTurnUnits": native_turn_units & (FULL_TURN - 1),
        "recordOffset": f"0x{dirt[0]:x}",
        "loaderFunctionAddress": "0x0c0f26e0",
        "setterFunctionAddress": "0x0c0f138a",
    }


def browser_projection(
    position: list[float],
    facing_degrees: float,
) -> dict[str, Any]:
    """Project native map-local coordinates into Babylon's handedness.

    Runtime placement captures independently establish the same transform:
    native X and native yaw are reflected, while Y and Z are retained.  DIRT
    is a map-wide direction offset used by native heading consumers; it does
    not translate or rotate map-local geometry and therefore is deliberately
    not folded into an authored Entry placement.
    """
    reflected_degrees = -facing_degrees
    return {
        "position": [-position[0], position[1], position[2]],
        "yawDegrees": reflected_degrees,
        "yawRadians": math.radians(reflected_degrees),
    }


def relative_string_in(
    data: bytes,
    word_offset: int,
    string_start: int,
    string_end: int,
) -> tuple[str, int] | None:
    if not (0 <= word_offset <= len(data) - 4):
        return None
    target = word_offset + u32(data, word_offset)
    if not (string_start <= target < string_end):
        return None
    end = data.find(b"\0", target, string_end)
    if end <= target:
        return None
    try:
        value = data[target:end].decode("ascii")
    except UnicodeDecodeError:
        return None
    if not all(0x20 <= byte <= 0x7E for byte in data[target:end]):
        return None
    return value, target


def character_property(
    data: bytes,
    record_offset: int,
    record_end: int,
    name: str,
    string_start: int,
    string_end: int,
) -> dict[str, Any] | None:
    for offset in range(record_offset + 8, record_end - 7, 4):
        label = relative_string_in(
            data, offset, string_start, string_end
        )
        if label is None or label[0] != name:
            continue
        value_type = u32(data, offset + 4)
        if name == "Position" and value_type == 0x49:
            value = list(struct.unpack_from("<fff", data, offset + 8))
        elif name == "Angle" and value_type == 0x49:
            value = list(struct.unpack_from("<fff", data, offset + 8))
        elif name == "Angle" and value_type == 0x01:
            value = [0.0, f32(data, offset + 8), 0.0]
        else:
            continue
        if all(math.isfinite(component) for component in value):
            return {
                "type": f"0x{value_type:02x}",
                "value": value,
                "recordOffset": f"0x{offset:x}",
            }
    return None


def extract_default_player_placement(data: bytes) -> dict[str, Any] | None:
    chrs = token(data, b"CHRS")
    strings = token(data, b"STRG", chrs[1] if chrs else 0)
    if chrs is None or strings is None:
        return None
    chrs_start, chrs_end = chrs
    string_start, string_end = strings[0] + 8, strings[1]

    starts: list[dict[str, Any]] = []
    for offset in range(chrs_start + 8, chrs_end - 7, 4):
        if offset < 12:
            continue
        object_tag = data[offset : offset + 4]
        if not all(
            byte == 0x5F or 0x30 <= byte <= 0x39 or 0x41 <= byte <= 0x5A
            for byte in object_tag
        ):
            continue
        model = relative_string_in(
            data, offset - 12, string_start, string_end
        )
        character = relative_string_in(
            data, offset - 8, string_start, string_end
        )
        if (
            character is None
            or character[0] != "Character"
            or u32(data, offset - 4) != 0x22
        ):
            continue
        resolved_model = (
            model[0].lstrip("$@")
            if model is not None and model[0].upper().endswith(".MT5")
            else None
        )
        # Ordinary CHRS objects always embed their model expression.  AKIR
        # may deliberately leave that expression null so the engine assembles
        # the active Ryo variant; its typed Position/Angle remain authoritative.
        if resolved_model is None and object_tag != b"AKIR":
            continue
        property_count = u32(data, offset + 4)
        if not 1 <= property_count <= 0x100:
            continue
        starts.append(
            {
                "offset": offset,
                "objectTag": object_tag.decode("ascii"),
                "model": resolved_model,
                "modelStringOffset": model[1] if resolved_model else None,
                "propertyCount": property_count,
            }
        )

    # Multiple AKIR records would require native selection logic.  Retain the
    # ambiguity instead of picking the first record.
    player_starts = [
        (index, start)
        for index, start in enumerate(starts)
        if start["objectTag"] == "AKIR"
    ]
    if len(player_starts) != 1:
        return None
    player_index, start = player_starts[0]
    record_end = (
        starts[player_index + 1]["offset"]
        if player_index + 1 < len(starts)
        else chrs_end
    )
    position = character_property(
        data,
        start["offset"],
        record_end,
        "Position",
        string_start,
        string_end,
    )
    angle = character_property(
        data,
        start["offset"],
        record_end,
        "Angle",
        string_start,
        string_end,
    )
    if position is None:
        return None
    return {
        "entry": 0,
        "position": position["value"],
        "facingDegrees": (
            angle["value"][1] if angle is not None else 0.0
        ),
        "browserProjection": browser_projection(
            position["value"],
            angle["value"][1] if angle is not None else 0.0,
        ),
        "sourceKind": "CHRS Character AKIR",
        "recordOffset": f"0x{start['offset']:x}",
        "model": start["model"],
        "evidence": {
            "modelStringOffset": (
                f"0x{start['modelStringOffset']:x}"
                if start["modelStringOffset"] is not None
                else None
            ),
            "positionPropertyOffset": position["recordOffset"],
            "anglePropertyOffset": (
                angle["recordOffset"] if angle is not None else None
            ),
            "propertyCount": start["propertyCount"],
        },
    }


def extract_entries(data: bytes) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for offset in range(0, len(data) - 0x30 + 1, 4):
        if (
            u32(data, offset + 0x04) != 0x21
            or u32(data, offset + 0x14) != 0x49
            or u32(data, offset + 0x28) != 0x01
        ):
            continue
        if (
            relative_cstring(data, offset) != "Entry"
            or relative_cstring(data, offset + 0x10) != "Position"
            or relative_cstring(data, offset + 0x24) != "Angle"
        ):
            continue
        entry_float = f32(data, offset + 0x08)
        position = list(struct.unpack_from("<fff", data, offset + 0x18))
        angle = f32(data, offset + 0x2C)
        if (
            not math.isfinite(entry_float)
            or entry_float != int(entry_float)
            or not all(math.isfinite(value) for value in position)
            or not math.isfinite(angle)
        ):
            continue
        entries.append(
            {
                "entry": int(entry_float),
                "position": position,
                "facingDegrees": angle,
                "browserProjection": browser_projection(position, angle),
                "recordOffset": f"0x{offset:x}",
            }
        )
    return entries


def mapinfos(roots: Iterable[Path]) -> Iterable[tuple[int, str, Path]]:
    for root in roots:
        try:
            scene = int(root.name)
        except ValueError:
            continue
        for path in sorted(root.glob("*/MAPINFO.BIN")):
            yield scene, path.parent.name, path


def build_report(roots: list[Path]) -> dict[str, Any]:
    maps = []
    for scene, area, path in mapinfos(roots):
        data = path.read_bytes()
        entries = extract_entries(data)
        default_player_placement = extract_default_player_placement(data)
        map_direction = extract_map_direction(data)
        maps.append(
            {
                "scene": scene,
                "area": area,
                "source": str(path),
                "sourceSha256": hashlib.sha256(data).hexdigest(),
                "mapDirection": map_direction,
                "entries": entries,
                "defaultPlayerPlacement": default_player_placement,
            }
        )
    typed_entry_zero_matches = 0
    for item in maps:
        entry_zero = next(
            (entry for entry in item["entries"] if entry["entry"] == 0),
            None,
        )
        placement = item["defaultPlayerPlacement"]
        if (
            entry_zero is not None
            and placement is not None
            and entry_zero["position"] == placement["position"]
            and entry_zero["facingDegrees"] == placement["facingDegrees"]
        ):
            typed_entry_zero_matches += 1
    return {
        "schema": "new-yokosuka-map-entry-points-v3",
        "recordLayout": {
            "size": 48,
            "properties": [
                {"name": "Entry", "type": "0x21", "value": "float32"},
                {
                    "name": "Position",
                    "type": "0x49",
                    "value": "float32[3]",
                },
                {"name": "Angle", "type": "0x01", "value": "float32"},
            ],
            "stringEncoding": "self-relative pointers into STRG",
        },
        "summary": {
            "mapCount": len(maps),
            "mapWithEntriesCount": sum(bool(item["entries"]) for item in maps),
            "entryCount": sum(len(item["entries"]) for item in maps),
            "defaultPlayerPlacementCount": sum(
                item["defaultPlayerPlacement"] is not None for item in maps
            ),
            "typedEntryZeroExactChrsMatchCount": typed_entry_zero_matches,
            "mapDirectionCount": sum(
                item["mapDirection"] is not None for item in maps
            ),
        },
        "coordinateProjection": {
            "position": "[-nativeX, nativeY, nativeZ]",
            "yawDegrees": "-nativeFacingDegrees",
            "basis": (
                "Babylon handedness conversion independently observed in "
                "runtime task placement captures"
            ),
            "mapDirection": (
                "CHRD/DIRT is retained separately; it is a native map-wide "
                "heading offset, not a map-local position transform"
            ),
        },
        "maps": maps,
        "evidenceBoundary": (
            "Typed entries and uniquely serialized CHRS Character AKIR "
            "placements are reported separately. AKIR is accepted as the "
            "authored default player placement because maps containing both "
            "representations have bit-exact Entry 0 agreement. Partial-body "
            "records such as YKUR and maps with no AKIR remain unresolved."
            " Each exact placement includes the deterministic Babylon "
            "handedness projection used by runtime model placements. CHRD/DIRT "
            "is decoded with the native 0x0c0f26e0 conversion and retained "
            "separately."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "roots",
        nargs="*",
        type=Path,
        default=DEFAULT_ROOTS,
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/map-entry-points.json"),
    )
    args = parser.parse_args()
    report = build_report(args.roots)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: {report['summary']['entryCount']} entries "
        f"across {report['summary']['mapWithEntriesCount']} maps"
    )


if __name__ == "__main__":
    main()
