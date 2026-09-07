#!/usr/bin/env python3
"""Distill pointer-free CLTH contracts from focused Flycast captures."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path


EXPECTED_EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
VERTEX_STATE_SIZE = 0x18
CONSTRAINT_RECORD_SIZE = 0x54
RENDER_MAP_RECORD_SIZE = 0x08
BODY_COLLISION_RECORD_SIZE = 0x14
CLOSED_RING_CONTROL_TYPES = {-0x46, -0x4B, -0x4C, -0x4D, -0x4E}
MEASURED_RING_MAXIMUM_BODY_RADIUS_SCALE = 2.0
NEIGHBOR_FIELDS = (
    ("rowPrevious", 0x14),
    ("rowNext", 0x24),
    ("columnPrevious", 0x34),
    ("columnNext", 0x44),
)


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def address(value: str) -> int:
    return int(value, 16)


def pointer_for(base: int, index: int) -> int:
    return (base + index * VERTEX_STATE_SIZE) & 0xFFFFFFFF


def position_bytes(raw: bytes) -> bytes:
    return b"".join(
        raw[offset : offset + 12]
        for offset in range(0, len(raw), VERTEX_STATE_SIZE)
    )


def positions(raw: bytes) -> list[tuple[float, float, float]]:
    return [
        struct.unpack_from("<3f", raw, offset)
        for offset in range(0, len(raw), VERTEX_STATE_SIZE)
    ]


def decode_topology(group: dict[str, object]) -> list[dict[str, object]]:
    raw = bytes.fromhex(str(group["constraintRecordsRawHex"]))
    vertex_count = int(group["controlVertexCount"])
    current = address(str(group["currentStateAddress"]))
    previous = address(str(group["previousStateAddress"]))
    if len(raw) != vertex_count * CONSTRAINT_RECORD_SIZE:
        raise ValueError("constraint-record length does not match vertex count")

    topology = []
    for lattice_index in range(vertex_count):
        record = raw[
            lattice_index * CONSTRAINT_RECORD_SIZE:
            (lattice_index + 1) * CONSTRAINT_RECORD_SIZE
        ]
        source_index = struct.unpack_from("<h", record, 0)[0]
        if not 0 <= source_index < vertex_count:
            raise ValueError(f"invalid lattice source index {source_index}")
        if struct.unpack_from("<I", record, 0x0C)[0] != pointer_for(
            current,
            source_index,
        ):
            raise ValueError("current-state pointer does not match source index")
        if struct.unpack_from("<I", record, 0x10)[0] != pointer_for(
            previous,
            source_index,
        ):
            raise ValueError("previous-state pointer does not match source index")

        neighbors: dict[str, object] = {}
        for name, offset in NEIGHBOR_FIELDS:
            neighbor = struct.unpack_from("<h", record, offset)[0]
            rest_length = struct.unpack_from("<f", record, offset + 4)[0]
            expected_current = pointer_for(current, neighbor)
            expected_previous = pointer_for(previous, neighbor)
            if struct.unpack_from("<I", record, offset + 8)[0] != expected_current:
                raise ValueError(f"{name} current pointer does not match index")
            if struct.unpack_from("<I", record, offset + 12)[0] != expected_previous:
                raise ValueError(f"{name} previous pointer does not match index")
            if neighbor == -1 and rest_length != 0:
                raise ValueError(f"absent {name} has nonzero rest length")
            if neighbor != -1 and not math.isfinite(rest_length):
                raise ValueError(f"present {name} has invalid rest length")
            neighbors[name] = {
                "sourceVertexIndex": neighbor,
                "restLength": rest_length,
            }
        topology.append({
            "latticeIndex": lattice_index,
            "sourceVertexIndex": source_index,
            "anchorBinding": record[8],
            "neighbors": neighbors,
        })
    return topology


def decode_render_map(group: dict[str, object]) -> list[int] | None:
    pair = group["renderPair"]
    if pair is None:
        return None
    assert isinstance(pair, dict)
    raw = bytes.fromhex(str(pair["mapRawHex"]))
    render_count = int(pair["renderVertexCount"])
    render_state = address(str(pair["renderStateAddress"]))
    if len(raw) != render_count * RENDER_MAP_RECORD_SIZE:
        raise ValueError("render-map length does not match render vertex count")
    result = []
    for index in range(render_count):
        record = raw[
            index * RENDER_MAP_RECORD_SIZE:
            (index + 1) * RENDER_MAP_RECORD_SIZE
        ]
        source_index = record[0]
        if source_index >= render_count:
            raise ValueError("render map references an invalid render vertex")
        if struct.unpack_from("<I", record, 4)[0] != pointer_for(
            render_state,
            source_index,
        ):
            raise ValueError("render-map pointer does not match render index")
        result.append(source_index)
    return result


def decode_anchor_selectors(group: dict[str, object]) -> list[int]:
    raw = bytes.fromhex(str(group["groupRawHex"]))
    rows = int(group["latticeRowCount"])
    return list(struct.unpack_from(f"<{rows}h", raw, 0x48))


def closed_ring_spacing_state(
    samples: list[dict[str, object]],
) -> dict[str, object] | None:
    first = samples[0]
    if int(first["controlType"]) not in CLOSED_RING_CONTROL_TYPES:
        return None
    row_count = int(first["latticeRowCount"])
    owner_minimums = [
        struct.unpack_from(
            "<f",
            bytes.fromhex(str(sample["ownerRawHex"])),
            0x30,
        )[0]
        for sample in samples
    ]
    minimum_radius = owner_minimums[0]
    if any(abs(value - minimum_radius) > 1e-7 for value in owner_minimums):
        raise ValueError("owner minimum body-collision radius changed")
    collision_minimums = [
        min(record["radius"] for record in decode_body_collisions(sample))
        for sample in samples
    ]
    if any(abs(value - minimum_radius) > 1e-7 for value in collision_minimums):
        raise ValueError("owner minimum radius does not match collision state")

    row_spacings = []
    maximum = minimum_radius * MEASURED_RING_MAXIMUM_BODY_RADIUS_SCALE
    for row in range(1, row_count):
        values = [
            struct.unpack_from(
                "<f",
                bytes.fromhex(str(sample["groupRawHex"])),
                0x5C + row * 4,
            )[0]
            for sample in samples
        ]
        if any(not math.isfinite(value) or value < 0 for value in values):
            raise ValueError("captured closed-ring spacing is invalid")
        if any(value > maximum + 1e-6 for value in values):
            raise ValueError("captured closed-ring spacing exceeds native cap")
        row_spacings.append({
            "row": row,
            "minimum": min(values),
            "maximum": max(values),
        })

    pass_disable_words = set()
    collision_indices = set()
    for sample in samples:
        raw = bytes.fromhex(str(sample["constraintRecordsRawHex"]))
        count = int(sample["controlVertexCount"])
        for index in range(count):
            offset = index * CONSTRAINT_RECORD_SIZE
            pass_disable_words.add(struct.unpack_from("<I", raw, offset + 4)[0])
            collision_indices.add(raw[offset + 2])
    return {
        "ownerMinimumBodyCollisionRadius": minimum_radius,
        "maximumBodyRadiusScale": MEASURED_RING_MAXIMUM_BODY_RADIUS_SCALE,
        "maximumSpacing": maximum,
        "dynamicRows": row_spacings,
        "constraintPassDisableWordValues": sorted(pass_disable_words),
        "observedCollisionIndices": sorted(collision_indices),
    }


def decode_body_collisions(group: dict[str, object]) -> list[dict[str, object]]:
    raw = bytes.fromhex(str(group["bodyCollisionStateRawHex"]))
    count = int(group["bodyCollisionCount"])
    if len(raw) != count * BODY_COLLISION_RECORD_SIZE:
        raise ValueError("body-collision length does not match collision count")
    return [
        {
            "center": list(struct.unpack_from("<3f", raw, offset)),
            "radius": struct.unpack_from("<f", raw, offset + 12)[0],
            "mask": f"0x{struct.unpack_from('<I', raw, offset + 16)[0]:08x}",
        }
        for offset in range(0, len(raw), BODY_COLLISION_RECORD_SIZE)
    ]


def sample_motion(group: dict[str, object]) -> dict[str, object]:
    current_raw = bytes().join(
        struct.pack("<6f", *entry["position"], *entry["auxiliary"])
        for entry in group["currentState"]
    )
    previous_raw = bytes().join(
        struct.pack("<6f", *entry["position"], *entry["auxiliary"])
        for entry in group["previousState"]
    )
    current_positions = positions(current_raw)
    previous_positions = positions(previous_raw)
    steps = [
        math.dist(current, previous)
        for current, previous in zip(current_positions, previous_positions)
    ]
    collision_raw = bytes.fromhex(str(group["bodyCollisionStateRawHex"]))
    return {
        "currentPositionSha256": sha256_bytes(position_bytes(current_raw)),
        "previousPositionSha256": sha256_bytes(position_bytes(previous_raw)),
        "bodyCollisionStateSha256": sha256_bytes(collision_raw),
        "maximumPositionStep": max(steps, default=0),
        "meanPositionStep": sum(steps) / len(steps) if steps else 0,
    }


def subtract(
    left: tuple[float, float, float] | list[float],
    right: tuple[float, float, float] | list[float],
) -> tuple[float, float, float]:
    return tuple(left[axis] - right[axis] for axis in range(3))


def cross(
    left: tuple[float, float, float],
    right: tuple[float, float, float],
) -> tuple[float, float, float]:
    return (
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    )


def dot(
    left: tuple[float, float, float],
    right: tuple[float, float, float],
) -> float:
    return sum(left[axis] * right[axis] for axis in range(3))


def normalized(value: tuple[float, float, float]) -> tuple[float, float, float]:
    length = math.sqrt(dot(value, value))
    if length <= 1e-12:
        raise ValueError("captured CLTH surface vector is degenerate")
    return tuple(component / length for component in value)


def surface_auxiliary_validation(
    samples: list[dict[str, object]],
    topology: list[dict[str, object]],
    column_count: int,
) -> dict[str, object]:
    alignments = []
    lengths = []
    for group in samples:
        current = group["currentState"]
        for lattice_index in range(column_count, len(topology)):
            constraint = topology[lattice_index]
            index = int(constraint["sourceVertexIndex"])
            neighbors = constraint["neighbors"]
            parent_index = int(neighbors["rowPrevious"]["sourceVertexIndex"])
            previous_column = int(
                neighbors["columnPrevious"]["sourceVertexIndex"]
            )
            next_column = int(neighbors["columnNext"]["sourceVertexIndex"])
            has_previous_column = previous_column >= 0
            horizontal_index = (
                previous_column if has_previous_column else next_column
            )
            point = current[index]["position"]
            parent = current[parent_index]["position"]
            horizontal = current[horizontal_index]["position"]
            expected = cross(
                subtract(parent, point),
                subtract(horizontal, point),
            )
            if not has_previous_column:
                expected = tuple(-component for component in expected)
            parent_normal = subtract(
                current[parent_index]["auxiliary"],
                parent,
            )
            if dot(expected, parent_normal) < 0:
                expected = tuple(-component for component in expected)
            expected = normalized(expected)
            observed = subtract(current[index]["auxiliary"], point)
            lengths.append(math.sqrt(dot(observed, observed)))
            alignments.append(dot(expected, normalized(observed)))
    minimum_alignment = min(alignments)
    if minimum_alignment < 0.99999:
        raise ValueError(
            "captured CLTH surface auxiliaries do not match FUN_0c0b0512"
        )
    return {
        "dynamicPointSampleCount": len(alignments),
        "minimumDirectionDot": minimum_alignment,
        "meanDirectionDot": sum(alignments) / len(alignments),
        "minimumLength": min(lengths),
        "maximumLength": max(lengths),
    }


def summarize_capture(path: Path) -> dict[str, object]:
    capture = json.loads(path.read_text())
    source = capture["source"]
    if source["executableSha256"] != EXPECTED_EXECUTABLE_SHA256:
        raise ValueError(f"unsupported executable in {path}")
    capture_return = capture["native"].get(
        "surfaceAuxiliaryReturn",
        capture["native"].get("finalConstraintReturn"),
    )
    if capture_return != "0x0c0aea20":
        raise ValueError(f"capture {path} is not at the final CLTH boundary")

    groups: dict[int, list[dict[str, object]]] = {}
    for sample in capture["samples"]:
        group = sample["group"]
        groups.setdefault(int(group["controlType"]), []).append(group)

    group_summaries = []
    for control_type, samples in sorted(groups.items()):
        first = samples[0]
        topology = decode_topology(first)
        render_map = decode_render_map(first)
        anchors = decode_anchor_selectors(first)
        topology_json = json.dumps(
            topology,
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
        for sample in samples[1:]:
            if decode_topology(sample) != topology:
                raise ValueError("constraint topology changed across capture")
            if decode_render_map(sample) != render_map:
                raise ValueError("render map changed across capture")
            if decode_anchor_selectors(sample) != anchors:
                raise ValueError("anchor selectors changed across capture")

        source_raw = bytes.fromhex(str(first["sourceStateRawHex"]))
        pair = first["renderPair"]
        group_summaries.append({
            "controlType": control_type,
            "controlVertexCount": first["controlVertexCount"],
            "lattice": {
                "rows": first["latticeRowCount"],
                "columns": first["latticeColumnCount"],
                "sourceVertexOrder": [
                    item["sourceVertexIndex"] for item in topology
                ],
            },
            "anchorSelectors": anchors,
            "anchorBindings": [item["anchorBinding"] for item in topology],
            "constraintTopologySha256": sha256_bytes(topology_json),
            "constraints": topology,
            "controlRestStateSha256": sha256_bytes(source_raw),
            "renderPair": None if pair is None else {
                "renderType": pair["renderType"],
                "renderVertexCount": pair["renderVertexCount"],
                "latticeToRenderVertexMap": render_map,
                "renderRestStateSha256": sha256_bytes(
                    bytes.fromhex(str(pair["sourceRawHex"]))
                ),
            },
            "profile": {
                "index": first["ownerProfileIndex"],
                "runtimeMode": first["ownerRuntimeMode"],
                "collisionCount": first["bodyCollisionCount"],
                "collisionMask": first["collisionMask"],
            },
            "firstFrameBodyCollisions": decode_body_collisions(first),
            "surfaceAuxiliaryValidation": surface_auxiliary_validation(
                samples,
                topology,
                int(first["latticeColumnCount"]),
            ),
            "closedRingSpacingState": closed_ring_spacing_state(samples),
            "frames": [sample_motion(sample) for sample in samples],
        })

    return {
        "capturePath": str(path),
        "captureSha256": sha256_path(path),
        "saveStateSha256": source["saveStateSha256"],
        "modelCode": capture["targetModelCode"],
        "sampleCount": len(capture["samples"]),
        "groups": group_summaries,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("captures", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    payload = {
        "schema": "new-yokosuka-shenmue1-native-cloth-runtime-evidence-v1",
        "status": "captured-and-pointer-free",
        "source": {
            "executableSha256": EXPECTED_EXECUTABLE_SHA256,
            "emulator": "Flycast built-in GDB remote stub",
            "guestClothStateWrites": False,
            "artificialFunctionCalls": False,
        },
        "nativeUpdateOrder": [
            {"address": "0x0c0aeca4", "role": "body-anchor transform"},
            {"address": "0x0c0af35e", "role": "position, constraint, and collision solve"},
            {"address": "0x0c0b0512", "role": "surface auxiliary endpoint update"},
            {"address": "0x0c0aede8", "role": "inverse body transform"},
            {"address": "0x0c0b11e4", "role": "render-pair projection"},
        ],
        "captures": [summarize_capture(path) for path in args.captures],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
