#!/usr/bin/env python3
"""Extract the original Shenmue vending props and motion into browser assets."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path


DRINK_PACKAGES = {
    "COKE": "COKS5SHG.CHRM",
    "FATO": "FAOS5SHG.CHRM",
    "FATG": "FAGS5SHG.CHRM",
    "SPRT": "SPRS5SHG.CHRM",
    "CAFE": "GEOS5SHG.CHRM",
    "ATRK": "ATRS500G.CHRM",
}


def ipac_payload(data: bytes) -> bytes:
    if data[:4] in (b"PAKS", b"PAKF"):
        offset = struct.unpack_from("<I", data, 4)[0]
        data = data[offset:]
    if data[:4] != b"IPAC":
        raise ValueError("expected IPAC/PAKS/PAKF")
    return data


def ipac_members(data: bytes) -> dict[str, bytes]:
    data = ipac_payload(data)
    dictionary_offset, count = struct.unpack_from("<II", data, 4)
    members: dict[str, bytes] = {}
    for index in range(count):
        entry = dictionary_offset + index * 20
        raw_name, raw_ext, offset, size = struct.unpack_from(
            "<8s4sII", data, entry
        )
        name = raw_name.rstrip(b"\0").decode("ascii")
        ext = raw_ext.rstrip(b"\0").decode("ascii")
        members[f"{name}.{ext}"] = data[offset : offset + size]
    return members


def texture_entries(data: bytes) -> list[tuple[bytes, bytes]]:
    entries: list[tuple[bytes, bytes]] = []
    position = 0
    while True:
        position = data.find(b"TEXN", position)
        if position < 0:
            break
        if position + 16 > len(data):
            break
        size = struct.unpack_from("<I", data, position + 4)[0]
        end = position + size
        if 16 < size < 0x2000000 and end <= len(data):
            texture_id = data[position + 8 : position + 16]
            pvrt = data.find(b"PVRT", position + 16, end)
            if pvrt >= 0:
                entries.append((texture_id, data[pvrt:end]))
        position += 4
    unique: dict[bytes, bytes] = {}
    for texture_id, payload in entries:
        unique[texture_id] = payload
    return list(unique.items())


def write_texture_pack(filename: Path, entries: list[tuple[bytes, bytes]]) -> None:
    with filename.open("wb") as output:
        for texture_id, payload in entries:
            if len(texture_id) != 8 or payload[:4] != b"PVRT":
                raise ValueError("invalid texture entry")
            output.write(texture_id)
            output.write(struct.pack("<I", len(payload)))
            output.write(payload)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--scene-root",
        type=Path,
        required=True,
        help="Path to extracted SCENE/01",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("play/assets/vending"),
    )
    args = parser.parse_args()
    stream = args.scene_root / "STREAM"
    args.output.mkdir(parents=True, exist_ok=True)
    report: dict[str, object] = {"schema": "vending-assets-v1", "assets": []}

    for resource_code, model_name in DRINK_PACKAGES.items():
        model_package = (stream / f"{resource_code}.PKS").read_bytes()
        model = ipac_members(model_package)[model_name]
        if model[:4] != b"HRCM":
            raise ValueError(f"{model_name} is not HRCM")
        model_output = args.output / model_name
        model_output.write_bytes(model)

        texture_package = (stream / f"{resource_code}.PKF").read_bytes()
        textures = texture_entries(texture_package)
        if not textures:
            raise ValueError(f"{resource_code}.PKF has no textures")
        texture_output = args.output / f"{resource_code}_textures.bin"
        write_texture_pack(texture_output, textures)
        report["assets"].append(
            {
                "resourceCode": resource_code,
                "model": model_output.as_posix(),
                "modelSha256": sha256(model),
                "texturePack": texture_output.as_posix(),
                "textureCount": len(textures),
            }
        )

    vend_members = ipac_members((stream / "VEND.PKS").read_bytes())
    motion = vend_members["M_DJUC.MOTN"]
    motion_output = args.output / "M_DJUC.MOTN"
    motion_output.write_bytes(motion)
    report["motion"] = {
        "path": motion_output.as_posix(),
        "sha256": sha256(motion),
        "byteLength": len(motion),
    }
    high_detail = vend_members["JIHS5KNG.CHRM"]
    high_detail_output = args.output / "JIHS5KNG.CHRM"
    high_detail_output.write_bytes(high_detail)
    vend_textures = texture_entries((stream / "VEND.PKF").read_bytes())
    if not vend_textures:
        raise ValueError("VEND.PKF has no textures")
    vend_texture_output = args.output / "VEND_textures.bin"
    write_texture_pack(vend_texture_output, vend_textures)
    report["highDetailMachine"] = {
        "path": high_detail_output.as_posix(),
        "sha256": sha256(high_detail),
        "texturePack": vend_texture_output.as_posix(),
        "textureCount": len(vend_textures),
    }

    report_output = args.output / "manifest.json"
    report_output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {len(DRINK_PACKAGES)} can models and M_DJUC.MOTN "
        f"to {args.output}"
    )


if __name__ == "__main__":
    main()
