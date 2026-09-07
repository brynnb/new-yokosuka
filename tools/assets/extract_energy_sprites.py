#!/usr/bin/env python3
"""Extract Shenmue's ENERGY.SPR TEXN records as browser-ready PNG files."""

from __future__ import annotations

import argparse
import struct
from pathlib import Path

from tools.assets.pvr_decoder import decode_pvr


def extract_energy_sprites(source: Path, output_directory: Path) -> list[Path]:
    data = source.read_bytes()
    output_directory.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []
    offset = 0

    while offset < len(data):
        if data[offset : offset + 4] != b"TEXN":
            raise ValueError(f"Expected TEXN at 0x{offset:x}")
        chunk_size = struct.unpack_from("<I", data, offset + 4)[0]
        chunk_end = offset + chunk_size
        if chunk_size < 24 or chunk_end > len(data):
            raise ValueError(f"Invalid TEXN size 0x{chunk_size:x} at 0x{offset:x}")

        texture_name = (
            data[offset + 8 : offset + 16]
            .split(b"\0", 1)[0]
            .decode("ascii")
        )
        pvr_offset = data.find(b"GBIX", offset + 16, chunk_end)
        if pvr_offset < 0:
            pvr_offset = data.find(b"PVRT", offset + 16, chunk_end)
        if pvr_offset < 0:
            raise ValueError(f"No PVR payload in TEXN {texture_name}")

        image, _metadata = decode_pvr(data[pvr_offset:chunk_end])
        output_path = output_directory / f"{texture_name}.png"
        image.save(output_path)
        outputs.append(output_path)
        offset = chunk_end

    if offset != len(data):
        raise ValueError("ENERGY.SPR contains trailing non-TEXN data")
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_directory", type=Path)
    arguments = parser.parse_args()
    for output in extract_energy_sprites(
        arguments.source,
        arguments.output_directory,
    ):
        print(output)


if __name__ == "__main__":
    main()
