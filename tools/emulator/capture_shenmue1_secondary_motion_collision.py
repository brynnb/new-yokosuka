#!/usr/bin/env python3
"""Capture native Shenmue I OSAG actor-collision inputs from Flycast.

The probe stops immediately before FUN_0c094934 is called by the native
type-0x78 secondary-motion handler. It does not write guest memory or invoke
game functions artificially. Each retained sample contains the actor-local
collision descriptor exactly as the game supplied it for that animated pose.
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


COLLISION_CALL = 0x0C133AA2
COLLISION_CALL_BREAKPOINT = COLLISION_CALL | 0x80000000
ACTOR_DESCRIPTOR_OFFSET = 0x28
ACTOR_DESCRIPTOR_SIZE = 0x1C0
ACTOR_SNAPSHOT_SIZE = ACTOR_DESCRIPTOR_OFFSET + ACTOR_DESCRIPTOR_SIZE
NODE_SNAPSHOT_SIZE = 0x90
STACK_SNAPSHOT_SIZE = 0x60


def actor_tag_word(value: str) -> tuple[str, int]:
    normalized = value.strip().upper()
    if not normalized or len(normalized) > 4 or not normalized.isascii():
        raise argparse.ArgumentTypeError(
            "actor tag must contain one to four ASCII characters"
        )
    try:
        encoded = normalized.encode("ascii")
    except UnicodeEncodeError as error:
        raise argparse.ArgumentTypeError(
            "actor tag must contain one to four ASCII characters"
        ) from error
    return normalized, int.from_bytes(encoded.ljust(4, b"\0"), "little")

# FUN_0c094934 submits these descriptor spans to FUN_0c094b78 in order.
# Every point is four float32 values; the fourth value is the point radius.
COLLISION_SPANS = (
    (0x000, 2),
    (0x020, 2),
    (0x040, 4),
    (0x080, 2),
    (0x0A0, 2),
    (0x0C0, 2),
    (0x0E0, 2),
    (0x100, 2),
    (0x120, 2),
    (0x140, 4),
    (0x180, 2),
    (0x1A0, 2),
)


def hx(value: int) -> str:
    return f"0x{value:08x}"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def decode_descriptor(raw: bytes) -> list[dict[str, object]]:
    spans: list[dict[str, object]] = []
    for offset, point_count in COLLISION_SPANS:
        points = [
            list(struct.unpack_from("<4f", raw, offset + index * 0x10))
            for index in range(point_count)
        ]
        spans.append({
            "offset": f"0x{offset:03x}",
            "pointCount": point_count,
            "points": points,
        })
    return spans


def word_as_f32(value: int) -> float:
    return struct.unpack("<f", struct.pack("<I", value))[0]


def capture_samples(
    host: str,
    port: int,
    timeout: float,
    sample_count: int,
    target_tag_word: int,
    target_tag: str,
) -> tuple[list[dict[str, object]], int, int]:
    remote = FlycastRemote(host, port, timeout)
    installed = False
    stopped_at_breakpoint = False
    rejected_hits = 0
    other_chain_node_hits = 0
    target_node: int | None = None
    samples: list[dict[str, object]] = []
    try:
        remote.command("?")
        remote.add_breakpoint(COLLISION_CALL_BREAKPOINT)
        installed = True
        while len(samples) < sample_count:
            remote.continue_until_stop()
            stopped = remote.read_register(16) | 0x80000000
            if stopped != COLLISION_CALL_BREAKPOINT:
                raise RemoteProtocolError(
                    f"stopped outside OSAG collision call at {hx(stopped)}"
                )
            stopped_at_breakpoint = True
            actor = remote.read_register(10)
            tag = remote.read_u32(actor)
            if tag != target_tag_word:
                rejected_hits += 1
            else:
                node = remote.read_register(14)
                if target_node is None:
                    target_node = node
                if node == target_node:
                    registers = [
                        remote.read_register(index) for index in range(41)
                    ]
                    actor_raw = remote.read_memory(
                        actor,
                        ACTOR_SNAPSHOT_SIZE,
                    )
                    descriptor_raw = actor_raw[
                        ACTOR_DESCRIPTOR_OFFSET:
                        ACTOR_DESCRIPTOR_OFFSET + ACTOR_DESCRIPTOR_SIZE
                    ]
                    stack = registers[15]
                    node_raw = remote.read_memory(node, NODE_SNAPSHOT_SIZE)
                    source_node = registers[8]
                    source_vector = list(struct.unpack(
                        "<3f",
                        remote.read_memory(source_node + 0x20, 12),
                    ))
                    source_length = math.sqrt(sum(
                        component * component for component in source_vector
                    ))
                    node_radius = word_as_f32(registers[40])
                    sample = {
                        "sequence": len(samples),
                        "capturedAtUnixSeconds": time.time(),
                        "callAddress": hx(COLLISION_CALL),
                        "actorAddress": hx(actor),
                        "actorTag": actor_raw[:4]
                            .rstrip(b"\0")
                            .decode("ascii", "replace"),
                        "nodeAddress": hx(node),
                        "nodeModeLowFiveBits": node_raw[0x0E] & 0x1F,
                        "radiusSourceNodeAddress": hx(source_node),
                        "radiusSourceVector": source_vector,
                        "radiusSourceLength": source_length,
                        "nodeRadius": node_radius,
                        "observedRadiusScale": (
                            node_radius / source_length
                            if source_length > 0
                            else None
                        ),
                        "stackAddress": hx(stack),
                        "gpr": [hx(value) for value in registers[:16]],
                        "fpulWord": hx(registers[23]),
                        "fpscrWord": hx(registers[24]),
                        "frWords": [
                            hx(value) for value in registers[25:41]
                        ],
                        "actorRawHex": actor_raw.hex(),
                        "descriptorRawHex": descriptor_raw.hex(),
                        "descriptorSpans": decode_descriptor(descriptor_raw),
                        "nodeRawHex": node_raw.hex(),
                        "stackRawHex": remote.read_memory(
                            stack,
                            STACK_SNAPSHOT_SIZE,
                        ).hex(),
                    }
                    samples.append(sample)
                    print(
                        f"captured {target_tag} collision frame "
                        f"{len(samples)}/{sample_count} "
                        f"actor={sample['actorAddress']} "
                        f"node={sample['nodeAddress']}",
                        flush=True,
                    )
                else:
                    other_chain_node_hits += 1
            remote.step_over_breakpoint(COLLISION_CALL_BREAKPOINT)
            stopped_at_breakpoint = False
        return samples, rejected_hits, other_chain_node_hits
    finally:
        if stopped_at_breakpoint:
            try:
                remote.step_over_breakpoint(COLLISION_CALL_BREAKPOINT)
            except (OSError, RemoteProtocolError):
                pass
        if installed:
            try:
                remote.remove_breakpoint(COLLISION_CALL_BREAKPOINT)
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
    parser.add_argument(
        "--actor-tag",
        type=actor_tag_word,
        default=actor_tag_word("KOK"),
    )
    parser.add_argument("--executable", type=Path, required=True)
    parser.add_argument("--save-state", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples must be positive")
    started = time.time()
    target_tag, target_tag_word = args.actor_tag
    samples, rejected_hits, other_chain_node_hits = capture_samples(
        args.host,
        args.port,
        args.timeout,
        args.samples,
        target_tag_word,
        target_tag,
    )

    payload = {
        "schema": "new-yokosuka-shenmue1-osag-collision-capture-v1",
        "status": "captured",
        "source": {
            "executable": str(args.executable),
            "executableSha256": sha256(args.executable),
            "saveState": str(args.save_state),
            "saveStateSha256": sha256(args.save_state),
            "emulator": "Flycast",
            "transport": "built-in GDB remote stub",
            "guestWrites": False,
            "artificialHandlerCalls": False,
        },
        "native": {
            "secondaryMotionHandler": "0x0c132e14",
            "collisionCall": hx(COLLISION_CALL),
            "collisionFunction": "0x0c094934",
            "primitiveFunction": "0x0c094b78",
            "correctionFunction": "0x0c094b34",
            "actorDescriptorOffset": f"0x{ACTOR_DESCRIPTOR_OFFSET:x}",
            "actorDescriptorSize": f"0x{ACTOR_DESCRIPTOR_SIZE:x}",
            "spanLayout": [
                {"offset": f"0x{offset:03x}", "pointCount": count}
                for offset, count in COLLISION_SPANS
            ],
        },
        "targetActorTag": target_tag,
        "elapsedSeconds": round(time.time() - started, 3),
        "rejectedNonTargetHits": rejected_hits,
        "otherTargetChainNodeHits": other_chain_node_hits,
        "samples": samples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
