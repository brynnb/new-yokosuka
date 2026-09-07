#!/usr/bin/env python3
"""Stage Shenmue II Dreamcast MT7 models without modifying public assets."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
import shutil
import struct
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


MODEL_EXTENSIONS = {"CHRM", "MAPM", "PROP", "MT7"}
MODEL_SIGNATURES = {b"MDC7", b"MDL7", b"MDO7", b"MDP7"}


@dataclass(frozen=True)
class IpacMember:
    name: str
    extension: str
    data: bytes


def source_bytes(path: Path) -> bytes:
    data = path.read_bytes()
    return gzip.decompress(data) if data[:2] == b"\x1f\x8b" else data


def ipac_members(path: Path) -> list[IpacMember]:
    data = source_bytes(path)
    if data[:4] in {b"PAKS", b"PAKF"}:
        if len(data) < 8:
            raise ValueError(f"truncated PAK header: {path}")
        ipac_offset = struct.unpack_from("<I", data, 4)[0]
        data = data[ipac_offset:]
    if len(data) < 16 or data[:4] != b"IPAC":
        raise ValueError(f"archive has no IPAC table: {path}")
    dictionary_offset, count = struct.unpack_from("<II", data, 4)
    table_end = dictionary_offset + count * 20
    if table_end > len(data):
        raise ValueError(f"IPAC table exceeds archive: {path}")
    result = []
    for index in range(count):
        entry = dictionary_offset + index * 20
        name, extension, offset, size = struct.unpack_from("<8s4sII", data, entry)
        if offset > len(data) or size > len(data) - offset:
            raise ValueError(f"IPAC member {index} exceeds archive: {path}")
        result.append(
            IpacMember(
                name.rstrip(b"\0").decode("ascii", errors="replace"),
                extension.rstrip(b"\0").decode("ascii", errors="replace").upper(),
                data[offset : offset + size],
            )
        )
    return result


def clean_component(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return cleaned.upper() or "UNNAMED"


def texture_records(path: Path) -> list[tuple[bytes, bytes]]:
    """Read nested TEXN records in authored file order.

    Shenmue II PKF IPAC members such as CHRT contain the TEXN children rather
    than listing each texture directly in the outer IPAC dictionary.
    """
    data = source_bytes(path)
    records: list[tuple[bytes, bytes]] = []
    cursor = 0
    while True:
        cursor = data.find(b"TEXN", cursor)
        if cursor < 0:
            break
        if cursor + 16 > len(data):
            break
        token_size = struct.unpack_from("<I", data, cursor + 4)[0]
        token_end = min(len(data), cursor + token_size)
        pvr_offset = data.find(b"PVRT", cursor + 16, token_end)
        if pvr_offset >= 0 and pvr_offset + 8 <= token_end:
            pvr_size = 8 + struct.unpack_from("<I", data, pvr_offset + 4)[0]
            if pvr_offset + pvr_size <= token_end:
                records.append((data[cursor + 8 : cursor + 16], data[pvr_offset : pvr_offset + pvr_size]))
        cursor += 4
    return records


def write_texture_pack(path: Path, source: Path) -> list[str]:
    records = texture_records(source)
    if not records:
        return []
    with path.open("wb") as output:
        for texture_id, payload in records:
            output.write(texture_id)
            output.write(struct.pack("<I", len(payload)))
            output.write(payload)
    return [texture_id.hex() for texture_id, _ in records]


def stage_models(disc_root: Path, output: Path, namespace: str) -> dict[str, object]:
    data_root = disc_root / "data" if (disc_root / "data").is_dir() else disc_root
    if not data_root.is_dir():
        raise ValueError(f"disc root does not exist: {disc_root}")
    scene_directory = data_root / "SCENE"
    if not scene_directory.is_dir():
        raise ValueError(f"Shenmue II SCENE directory was not found under {data_root}")
    scene_roots = sorted(path for path in scene_directory.iterdir() if path.is_dir())
    if not scene_roots:
        raise ValueError(f"Shenmue II scene directories were not found under {data_root}")
    disc_match = re.fullmatch(r"S2DC_D([1-4])", namespace)
    disc = int(disc_match[1]) if disc_match else None

    with tempfile.TemporaryDirectory(prefix="shenmue2-models-", dir=output.parent) as temporary:
        staging = Path(temporary)
        models_directory = staging / "models"
        textures_directory = staging / "textures"
        models_directory.mkdir(parents=True)
        textures_directory.mkdir(parents=True)
        models: list[dict[str, object]] = []
        texture_packs: list[dict[str, object]] = []
        core_texture_packs: dict[str, set[str]] = {}

        def model_core_hash(data: bytes) -> str:
            if len(data) < 8:
                return hashlib.sha256(data).hexdigest()
            declared_size = struct.unpack_from("<I", data, 4)[0]
            core_size = min(len(data), max(8, declared_size))
            return hashlib.sha256(data[:core_size]).hexdigest()

        def stage_archive(source: Path, location: str, *, scene=None, area=None, group=None) -> None:
            members = ipac_members(source)
            model_members = [
                member for member in members
                if member.extension in MODEL_EXTENSIONS and member.data[:4] in MODEL_SIGNATURES
            ]
            if not model_members:
                return
            archive = clean_component(source.stem)
            texture_pack_name = None
            texture_ids: list[str] = []
            companion = source.with_suffix(".PKF")
            if companion.is_file():
                texture_pack_name = f"{namespace}_{location}_{archive}_textures.bin"
                texture_ids = write_texture_pack(
                    textures_directory / texture_pack_name,
                    companion,
                )
                if not texture_ids:
                    texture_pack_name = None
                else:
                    texture_pack_path = textures_directory / texture_pack_name
                    texture_pack_data = texture_pack_path.read_bytes()
                    texture_packs.append({
                        "filename": texture_pack_name,
                        "source": str(companion),
                        "textureCount": len(texture_ids),
                        "textureIds": texture_ids,
                        "byteLength": len(texture_pack_data),
                        "sha256": hashlib.sha256(texture_pack_data).hexdigest(),
                    })
            names = Counter(clean_component(member.name) for member in model_members)
            for member_index, member in enumerate(members):
                if member.extension not in MODEL_EXTENSIONS or member.data[:4] not in MODEL_SIGNATURES:
                    continue
                member_name = clean_component(member.name)
                # IPAC dictionaries can contain distinct models with the same
                # name: Disc 3 / 0250 / MPK00 has two MAP.MAPM entries.
                if names[member_name] > 1:
                    member_name += f"_ENTRY{member_index:04d}"
                filename = (
                    f"{namespace}_{location}_{archive}_"
                    f"{member_name}.MT7"
                )
                destination = models_directory / filename
                if destination.exists():
                    raise ValueError(f"duplicate staged model name: {filename}")
                destination.write_bytes(member.data)
                if texture_pack_name:
                    core_texture_packs.setdefault(
                        model_core_hash(member.data), set()
                    ).add(texture_pack_name)
                models.append({
                    "filename": filename,
                    "disc": disc,
                    "scene": scene,
                    "area": area or "ARCHIVE",
                    "archive": group or archive,
                    "sourceMemberIndex": member_index,
                    "duplicateMemberName": names[clean_component(member.name)] > 1,
                    "kind": member.extension,
                    "signature": member.data[:4].decode("ascii"),
                    "source": str(source),
                    "sourceMember": f"{member.name}.{member.extension}",
                    "sha256": hashlib.sha256(member.data).hexdigest(),
                    "byteLength": len(member.data),
                    "texturePack": texture_pack_name,
                })

        for scene_root in scene_roots:
            for source in sorted(scene_root.rglob("*.PKS")):
                relative_parent = source.parent.relative_to(scene_root)
                location = clean_component(relative_parent.as_posix())
                # Preserve established Disc 1 URLs. Multi-scenario images need
                # an additional namespace to keep repeated area archives apart.
                if len(scene_roots) > 1:
                    location = f"S{clean_component(scene_root.name)}_{location}"
                stage_archive(source, location, scene=scene_root.name,
                              area=relative_parent.parts[0] if relative_parent.parts else "MISC",
                              group=clean_component("_".join((*relative_parent.parts[1:], source.stem))))

        # Disc-wide archives outside SCENE contain shared character models.
        # Keep their relative location in the staged name to avoid collisions.
        for source in sorted(data_root.rglob("*.PKS")):
            if scene_directory in source.parents:
                continue
            relative_parent = source.parent.relative_to(data_root).as_posix()
            stage_archive(source, f"ARCHIVE_{clean_component(relative_parent)}")

        model_root = data_root / "MODEL"
        # Loose MT7 resources may be transparently gzip-compressed despite
        # retaining the .MT7 extension. Scan the whole data tree so shared
        # MISC models are included alongside MODEL/*.
        for source in sorted(data_root.rglob("*.MT7")):
            data = source_bytes(source)
            if data[:4] not in MODEL_SIGNATURES:
                continue
            if model_root in source.parents:
                relative = source.relative_to(model_root)
                location = clean_component(relative.parent.as_posix())
            else:
                relative = source.relative_to(data_root)
                location = clean_component(relative.parent.as_posix())
            filename = (
                f"{namespace}_GLOBAL_{location}_"
                f"{clean_component(source.stem)}.MT7"
            )
            matching_packs = core_texture_packs.get(model_core_hash(data), set())
            texture_pack_name = next(iter(matching_packs)) if len(matching_packs) == 1 else None
            (models_directory / filename).write_bytes(data)
            models.append({
                "filename": filename,
                "disc": disc,
                "scene": None,
                "area": "GLOBAL",
                "archive": location,
                "kind": "MT7",
                "signature": data[:4].decode("ascii"),
                "source": str(source),
                "sourceMember": None,
                "sha256": hashlib.sha256(data).hexdigest(),
                "byteLength": len(data),
                # A loose self-contained copy can still reference slots from a
                # shared companion pack. Reuse it only when this exact declared
                # model core occurs with one unambiguous authored pack.
                "texturePack": texture_pack_name,
            })

        summary = {
            "modelCount": len(models),
            "sceneModelCount": sum(
                not item["filename"].startswith((f"{namespace}_GLOBAL_", f"{namespace}_ARCHIVE_"))
                for item in models
            ),
            "sharedArchiveModelCount": sum(
                item["filename"].startswith(f"{namespace}_ARCHIVE_") for item in models
            ),
            "globalModelCount": sum(item["filename"].startswith(f"{namespace}_GLOBAL_") for item in models),
            "texturePackCount": len(texture_packs),
            "textureCount": sum(item["textureCount"] for item in texture_packs),
        }
        manifest = {
            "schema": "new-yokosuka-shenmue2-models-v1",
            "discRoot": str(disc_root.resolve()),
            "namespace": namespace,
            "summary": summary,
            "models": models,
            "texturePacks": texture_packs,
        }
        (staging / "models.json").write_text(json.dumps(manifest, indent=2) + "\n")
        viewer_manifest = {
            "schema": "new-yokosuka-shenmue2-viewer-models-v1",
            "namespace": namespace,
            "summary": summary,
            "models": [
                {
                    key: item.get(key)
                    for key in (
                        "filename",
                        "disc",
                        "scene",
                        "area",
                        "archive",
                        "sourceMemberIndex",
                        "duplicateMemberName",
                        "kind",
                        "signature",
                        "sourceMember",
                        "byteLength",
                        "texturePack",
                    )
                }
                for item in models
            ],
        }
        (staging / "viewer-models.json").write_text(
            json.dumps(viewer_manifest, indent=2) + "\n"
        )
        if output.exists():
            shutil.rmtree(output)
        shutil.move(staging, output)
        return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disc-root", required=True, type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(".disc-work/shenmue2-disc1-models"),
    )
    parser.add_argument("--namespace", default="S2DC_D1")
    args = parser.parse_args()
    args.out.parent.mkdir(parents=True, exist_ok=True)
    report = stage_models(args.disc_root, args.out, clean_component(args.namespace))
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
