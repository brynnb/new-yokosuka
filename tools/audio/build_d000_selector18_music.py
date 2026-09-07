#!/usr/bin/env python3
"""Render D000 selector 18's exact BGM013 AICA sequence reproducibly."""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE_RELATIVE = Path("data/SCENE/01/SOUND/BGM013.SND")
DRIVER_RELATIVE = Path("data/SOUND/AICADRV.BIN")
SOURCE_SHA256 = "0c5250def8570bef8982a1634d3eef79781960a4b8a2c745d56593a314d07cb0"
DRIVER_SHA256 = "3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915"
RENDERER_SHA256 = "0ee5530466ebe91945a530bad4c1dd8f39b68e93959a8bb420220cacace71c39"
TRACK_ID = "dobuita-selector-18"
GROUP_INDEX = 0
TRACK_INDEX = 0
COMMAND = 0xA8250000
RENDER_SECONDS = 180.0


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def u32le(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"DTPK read at 0x{offset:x} is outside the source")
    return struct.unpack_from("<I", data, offset)[0]


def sequence_groups(dtpk: bytes) -> list[tuple[int, int]]:
    if dtpk[:4] != b"DTPK":
        raise ValueError("BGM013 source does not start with DTPK")
    table = u32le(dtpk, 0x2C)
    count = u32le(dtpk, table) + 1
    if not 1 <= count <= 256:
        raise ValueError("BGM013 has an invalid sequence-group count")
    groups: list[tuple[int, int]] = []
    for index in range(count):
        entry = u32le(dtpk, table + 4 + index * 4)
        command = entry & 0xFFFF0000
        track_count = u32le(dtpk, table + (entry & 0xFFFF)) + 1
        groups.append((command, track_count))
    return groups


def make_dsf(driver: bytes, dtpk: bytes) -> bytes:
    groups = sequence_groups(dtpk)
    if groups != [(COMMAND, 1)]:
        raise ValueError(f"BGM013 sequence table changed: {groups!r}")
    if len(driver) > 0x10000:
        raise ValueError("AICA driver exceeds its 64 KiB load region")
    ram = bytearray(0x10000)
    ram[:len(driver)] = driver
    ram.extend(dtpk)
    if len(ram) > 0x1FE000:
        struct.pack_into("<I", ram, 0x50, 0x200)
    struct.pack_into("<I", ram, 0x60, u32le(dtpk, 4))
    struct.pack_into(">I", ram, 0x400, 0xA0001100)
    struct.pack_into(">I", ram, 0x404, COMMAND | (TRACK_INDEX << 8))
    compressed = zlib.compress(struct.pack("<I", 0) + ram, level=9)
    return (
        b"PSF\x12"
        + struct.pack("<I", 0)
        + struct.pack("<I", len(compressed))
        + struct.pack("<I", binascii.crc32(compressed) & 0xFFFFFFFF)
        + compressed
    )


def ogg_crc(page: bytes) -> int:
    crc = 0
    for value in page:
        crc ^= value << 24
        for _ in range(8):
            crc = ((crc << 1) ^ 0x04C11DB7) & 0xFFFFFFFF if crc & 0x80000000 else (crc << 1) & 0xFFFFFFFF
    return crc


def canonicalize_ogg(data: bytes) -> bytes:
    """Replace FFmpeg's random stream serial and recompute every page CRC."""
    output = bytearray(data)
    cursor = 0
    serial = int.from_bytes(hashlib.sha256(TRACK_ID.encode()).digest()[:4], "little")
    pages = 0
    while cursor < len(output):
        if output[cursor:cursor + 4] != b"OggS" or cursor + 27 > len(output):
            raise ValueError(f"invalid Ogg page at byte {cursor}")
        segment_count = output[cursor + 26]
        header_end = cursor + 27 + segment_count
        if header_end > len(output):
            raise ValueError("truncated Ogg segment table")
        page_end = header_end + sum(output[cursor + 27:header_end])
        if page_end > len(output):
            raise ValueError("truncated Ogg page payload")
        output[cursor + 14:cursor + 18] = serial.to_bytes(4, "little")
        output[cursor + 22:cursor + 26] = b"\0\0\0\0"
        checksum = ogg_crc(output[cursor:page_end])
        output[cursor + 22:cursor + 26] = checksum.to_bytes(4, "little")
        cursor = page_end
        pages += 1
    if pages == 0:
        raise ValueError("rendered Ogg contains no pages")
    return bytes(output)


def require_hash(path: Path, expected: str, label: str) -> bytes:
    data = path.read_bytes()
    actual = sha256_bytes(data)
    if actual != expected:
        raise ValueError(f"{label} SHA-256 changed: {actual}")
    return data


def build(args: argparse.Namespace) -> dict:
    source_path = args.disc_root / SOURCE_RELATIVE
    driver_path = args.disc_root / DRIVER_RELATIVE
    source = require_hash(source_path, SOURCE_SHA256, "BGM013.SND")
    driver = require_hash(driver_path, DRIVER_SHA256, "AICADRV.BIN")
    require_hash(args.renderer, RENDERER_SHA256, "DSF renderer")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="new-yokosuka-selector18-music-") as temporary:
        directory = Path(temporary)
        dsf = directory / f"{TRACK_ID}.dsf"
        wav = directory / f"{TRACK_ID}.wav"
        ogg = directory / f"{TRACK_ID}.ogg"
        dsf.write_bytes(make_dsf(driver, source))
        subprocess.run(
            [str(args.renderer), str(dsf), str(wav), str(RENDER_SECONDS)],
            check=True,
        )
        subprocess.run(
            [
                str(args.ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
                "-fflags", "+bitexact", "-i", str(wav), "-map_metadata", "-1",
                "-c:a", "libvorbis", "-flags:a", "+bitexact", "-q:a", "4",
                str(ogg),
            ],
            check=True,
        )
        rendered = canonicalize_ogg(ogg.read_bytes())
        args.output.write_bytes(rendered)

    evidence = {
        "schema": "new-yokosuka-d000-selector18-music-v1",
        "evidenceBoundary": [
            "The D000 event installs BGM013.SND and dispatches exact AICA sequence command A8250000.",
            "The original AICADRV.BIN renders group zero, track zero; no replacement soundtrack or guessed command mapping is used.",
            "The 180-second browser render is a bounded presentation asset, not a claim about the native stop/fade commands that follow.",
        ],
        "source": {
            "disc": 1,
            "path": str(SOURCE_RELATIVE),
            "sha256": SOURCE_SHA256,
            "driverPath": str(DRIVER_RELATIVE),
            "driverSha256": DRIVER_SHA256,
            "rendererSha256": RENDERER_SHA256,
        },
        "track": {
            "id": TRACK_ID,
            "group": GROUP_INDEX,
            "track": TRACK_INDEX,
            "commandHex": f"{COMMAND:08X}",
            "durationSeconds": RENDER_SECONDS,
            "output": str(args.output.relative_to(ROOT)),
            "byteLength": len(rendered),
            "sha256": sha256_bytes(rendered),
        },
    }
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    return evidence


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disc-root", type=Path, required=True)
    parser.add_argument("--renderer", type=Path, required=True)
    parser.add_argument("--ffmpeg", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path,
        default=ROOT / "public/music/dobuita-selector-18.ogg",
    )
    parser.add_argument(
        "--evidence", type=Path,
        default=ROOT / "tools/evidence/d000-selector18-music.json",
    )
    return parser.parse_args()


if __name__ == "__main__":
    result = build(parse_args())
    print(json.dumps(result["track"], indent=2))
