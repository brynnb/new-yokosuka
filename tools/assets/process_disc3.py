#!/usr/bin/env python3
"""Stage Shenmue Disc 3 models without rebuilding Disc 1/2 assets.

The default command reads only ``extracted_disc3_v2``, writes only beneath
``.disc-work/disc3-processed``, and treats ``public/models`` and
``public/models.json`` as read-only comparison inputs.  An explicit ``--merge``
performs an additive, preflighted copy after the Disc 3 catalog and audit have
been generated.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import struct
import tempfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Sequence


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DEFAULT_DISC_ROOT = PROJECT_ROOT / "extracted_disc3_v2" / "data"
DEFAULT_STAGE_ROOT = PROJECT_ROOT / ".disc-work" / "disc3-processed"
DEFAULT_CATALOG = PROJECT_ROOT / "public" / "models.json"
DEFAULT_PUBLIC_MODELS = PROJECT_ROOT / "public" / "models"

DISC3_PREFIX = "S3_"
MODEL_EXTENSIONS = frozenset({".mt5", ".mapm", ".map", ".prop", ".chrm"})
GLOBAL_PREFIXES = {
    "CHARA": "G_CHARA_",
    "OBJECT": "G_OBJ_",
    "ITEM": "G_ITEM_",
}
ANIMATION_PREFIXES = (
    "CYCLEMAN",
    "EN_",
    "HMOT",
    "M_",
    "SEQDATA",
)
STAGE_MARKER = ".disc3-processing-stage"


@dataclass(frozen=True)
class ArchiveEntry:
    name: str
    extension: str
    data: bytes


@dataclass(frozen=True)
class ModelCandidate:
    canonical_name: str
    data: bytes
    source: str
    source_label: str
    loose: bool


@dataclass(frozen=True)
class ResolvedModel:
    output_name: str
    data: bytes
    sha256: str
    sources: tuple[str, ...]
    canonical_name: str
    is_variant: bool


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_binary(path: Path) -> bytes:
    data = path.read_bytes()
    if data.startswith(b"\x1f\x8b"):
        return gzip.decompress(data)
    return data


def clean_component(value: str) -> str:
    """Return a stable, catalog-safe uppercase filename component."""

    cleaned = re.sub(r"[^A-Za-z0-9_-]+", "_", value.strip())
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    if not cleaned:
        raise ValueError(f"empty asset name after sanitizing {value!r}")
    return cleaned.upper()


def scene_model_name(zone: str, member_name: str) -> str:
    stem = Path(member_name.strip()).stem
    return f"{DISC3_PREFIX}{clean_component(zone)}_{clean_component(stem)}.MT5"


def global_model_name(category: str, source_name: str) -> str:
    category_key = category.upper()
    if category_key not in GLOBAL_PREFIXES:
        raise ValueError(f"unsupported global MODEL category: {category}")
    return (
        f"{GLOBAL_PREFIXES[category_key]}"
        f"{clean_component(Path(source_name).stem)}.MT5"
    )


def merge_catalog_entries(
    existing_entries: Sequence[str],
    disc3_entries: Iterable[str],
) -> list[str]:
    """Append new names while preserving every existing entry and its order."""

    merged = list(existing_entries)
    seen = set(existing_entries)
    for entry in sorted(set(disc3_entries), key=str.casefold):
        if entry not in seen:
            merged.append(entry)
            seen.add(entry)
    return merged


def iter_ipac_entries(data: bytes) -> Iterator[ArchiveEntry]:
    """Yield validated members from an IPAC, PAKS, or PAKF buffer."""

    ipac = data
    if data[:4] in (b"PAKS", b"PAKF"):
        if len(data) < 8:
            return
        offset = struct.unpack_from("<I", data, 4)[0]
        if offset > len(data) - 16:
            return
        ipac = data[offset:]

    if len(ipac) < 16 or ipac[:4] != b"IPAC":
        return

    dictionary_offset, file_count = struct.unpack_from("<II", ipac, 4)
    if file_count > 100_000:
        return
    dictionary_end = dictionary_offset + (file_count * 20)
    if dictionary_offset < 16 or dictionary_end > len(ipac):
        return

    for index in range(file_count):
        entry_offset = dictionary_offset + (index * 20)
        name_raw, extension_raw, offset, size = struct.unpack_from(
            "<8s4sII",
            ipac,
            entry_offset,
        )
        if offset > len(ipac) or size > len(ipac) - offset:
            continue
        name = name_raw.rstrip(b"\0 ").decode("ascii", errors="replace")
        extension = extension_raw.rstrip(b"\0 ").decode(
            "ascii",
            errors="replace",
        )
        if not name:
            continue
        yield ArchiveEntry(
            name=name,
            extension=extension,
            data=ipac[offset : offset + size],
        )


def extract_texture_records(data: bytes) -> list[tuple[bytes, bytes]]:
    """Extract texture IDs and PVRT payloads using the existing pack format."""

    records: list[tuple[bytes, bytes]] = []

    for entry in iter_ipac_entries(data):
        payload = entry.data
        if payload[:4] == b"TEXN" and len(payload) >= 16:
            texture_id = payload[8:16]
            pvrt_start = payload.find(b"PVRT", 16)
            if pvrt_start >= 0:
                records.append((texture_id, payload[pvrt_start:]))
                name_id = entry.name.encode("ascii", errors="replace")[:8]
                records.append((name_id.ljust(8, b"\0"), payload[pvrt_start:]))
        elif payload[:4] == b"PVRT":
            name_id = entry.name.encode("ascii", errors="replace")[:8]
            records.append((name_id.ljust(8, b"\0"), payload))

    position = 0
    while True:
        position = data.find(b"TEXN", position)
        if position < 0:
            break
        if position + 16 > len(data):
            break
        size = struct.unpack_from("<I", data, position + 4)[0]
        end = position + size
        if 16 < size < 0x02000000 and end <= len(data):
            texture_id = data[position + 8 : position + 16]
            pvrt_start = data.find(b"PVRT", position + 16, end)
            if pvrt_start >= 0:
                records.append((texture_id, data[pvrt_start:end]))
        position += 4

    return records


def pack_texture_records(records: dict[bytes, bytes]) -> bytes:
    output = bytearray()
    for texture_id in sorted(records):
        texture_data = records[texture_id]
        output.extend(texture_id[:8].ljust(8, b"\0"))
        output.extend(struct.pack("<I", len(texture_data)))
        output.extend(texture_data)
    return bytes(output)


def texture_time_index(filename: str) -> int | None:
    upper = Path(filename).stem.upper()
    # MAP0..MAP3 are the authored time-of-day texture archives. Numbered
    # geometry such as MAP01.MT5 and MAP12.MT5 must remain in the base pack.
    match = re.fullmatch(r"MAP([0-3])", upper)
    if match:
        return int(match.group(1))
    if upper.startswith("YORU"):
        return 3
    return None


def is_animation_candidate(path: Path) -> bool:
    upper = path.name.upper()
    return (
        path.suffix.upper() == ".BIN"
        and upper != "MAPINFO.BIN"
        and upper.startswith(ANIMATION_PREFIXES)
    )


def _candidate_sort_key(candidate: ModelCandidate) -> tuple[object, ...]:
    return (
        0 if candidate.loose else 1,
        candidate.source.casefold(),
        candidate.source_label.casefold(),
    )


def _variant_name(candidate: ModelCandidate) -> str:
    canonical = Path(candidate.canonical_name).stem
    namespace, zone, member = canonical.split("_", 2)
    label = clean_component(candidate.source_label)
    return f"{namespace}_{zone}_{label}_{member}.MT5"


def resolve_model_candidates(
    candidates: Iterable[ModelCandidate],
) -> tuple[list[ResolvedModel], list[dict[str, object]], int]:
    """Deduplicate identical models and retain byte-different name collisions."""

    by_name: dict[str, list[ModelCandidate]] = defaultdict(list)
    for candidate in candidates:
        by_name[candidate.canonical_name].append(candidate)

    resolved: list[ResolvedModel] = []
    conflicts: list[dict[str, object]] = []
    identical_duplicates = 0
    used_names: set[str] = set()

    for canonical_name in sorted(by_name, key=str.casefold):
        named_candidates = sorted(
            by_name[canonical_name],
            key=_candidate_sort_key,
        )
        by_hash: dict[str, list[ModelCandidate]] = defaultdict(list)
        hash_order: list[str] = []
        for candidate in named_candidates:
            digest = sha256_bytes(candidate.data)
            if digest not in by_hash:
                hash_order.append(digest)
            by_hash[digest].append(candidate)

        identical_duplicates += sum(
            max(0, len(matches) - 1) for matches in by_hash.values()
        )
        conflict_rows: list[dict[str, object]] = []
        for index, digest in enumerate(hash_order):
            matches = by_hash[digest]
            representative = matches[0]
            if index == 0:
                output_name = canonical_name
            else:
                output_name = _variant_name(representative)
                if output_name in used_names:
                    stem = Path(output_name).stem
                    output_name = f"{stem}_{digest[:8]}.MT5"
            used_names.add(output_name)
            sources = tuple(match.source for match in matches)
            resolved.append(
                ResolvedModel(
                    output_name=output_name,
                    data=representative.data,
                    sha256=digest,
                    sources=sources,
                    canonical_name=canonical_name,
                    is_variant=index > 0,
                ),
            )
            conflict_rows.append(
                {
                    "output": output_name,
                    "sha256": digest,
                    "sources": list(sources),
                },
            )

        if len(hash_order) > 1:
            conflicts.append(
                {
                    "canonicalName": canonical_name,
                    "variants": conflict_rows,
                },
            )

    return resolved, conflicts, identical_duplicates


def read_catalog(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or not all(
        isinstance(entry, str) for entry in data
    ):
        raise ValueError(f"{path} is not a string-array model catalog")
    return data


def json_sha256(value: object) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    return sha256_bytes(encoded)


def extension_counts(root: Path) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for path in root.rglob("*"):
        if path.is_file():
            counts[path.suffix.upper() or "[NONE]"] += 1
    return dict(sorted(counts.items()))


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def inventory_disc(
    disc_root: Path,
    existing_catalog: Sequence[str],
) -> dict[str, object]:
    scene_root = disc_root / "SCENE" / "03"
    if not scene_root.is_dir():
        raise FileNotFoundError(f"Disc 3 scene root is missing: {scene_root}")

    zone_dirs = sorted(
        {
            path.parent
            for path in scene_root.rglob("MAPINFO.BIN")
            if path.is_file() and path.parent.parent == scene_root
        },
        key=lambda path: path.name.casefold(),
    )
    loose_paths: list[Path] = []
    archive_paths: list[Path] = []
    mapinfo_paths: list[Path] = []
    animation_paths: list[Path] = []

    for zone_dir in zone_dirs:
        for path in sorted(zone_dir.iterdir(), key=lambda item: item.name.casefold()):
            if not path.is_file():
                continue
            if path.suffix.lower() in MODEL_EXTENSIONS:
                loose_paths.append(path)
            if path.suffix.lower() in {".pks", ".pkf", ".ipac"}:
                archive_paths.append(path)
            if path.name.upper() == "MAPINFO.BIN":
                mapinfo_paths.append(path)
            elif is_animation_candidate(path):
                animation_paths.append(path)

    catalog_names = {entry.upper() for entry in existing_catalog}
    loose_without_counterpart: list[str] = []
    loose_with_counterpart: list[dict[str, object]] = []
    for path in loose_paths:
        zone = path.parent.name.upper()
        stem = clean_component(path.stem)
        counterparts = [
            name
            for name in (f"S1_{zone}_{stem}.MT5", f"S2_{zone}_{stem}.MT5")
            if name in catalog_names
        ]
        relative = _relative(path, scene_root)
        if counterparts:
            loose_with_counterpart.append(
                {
                    "path": relative,
                    "catalogCounterparts": counterparts,
                },
            )
        else:
            loose_without_counterpart.append(relative)

    global_root = disc_root / "MODEL"
    global_paths = (
        sorted(
            (
                path
                for path in global_root.rglob("*")
                if path.is_file() and path.suffix.lower() == ".mt5"
            ),
            key=lambda path: path.as_posix().casefold(),
        )
        if global_root.is_dir()
        else []
    )
    scene_model_root = scene_root / "MODEL"
    scene_model_paths = (
        sorted(
            (
                path
                for path in scene_model_root.rglob("*")
                if path.is_file() and path.suffix.lower() == ".mt5"
            ),
            key=lambda path: path.as_posix().casefold(),
        )
        if scene_model_root.is_dir()
        else []
    )

    all_extracted_files = [
        path for path in disc_root.rglob("*") if path.is_file()
    ]
    return {
        "discRoot": str(disc_root),
        "extractedFileCount": len(all_extracted_files),
        "extractedByteCount": sum(path.stat().st_size for path in all_extracted_files),
        "scene03": {
            "directoryCount": sum(
                1
                for path in scene_root.iterdir()
                if path.is_dir()
            ),
            "zoneCount": len(zone_dirs),
            "zones": [path.name for path in zone_dirs],
            "extensionCounts": extension_counts(scene_root),
            "looseModelPathCount": len(loose_paths),
            "looseModelPaths": [
                _relative(path, scene_root) for path in loose_paths
            ],
            "looseModelsWithoutDisc12CatalogCounterpartCount": len(
                loose_without_counterpart
            ),
            "looseModelsWithoutDisc12CatalogCounterpart": (
                loose_without_counterpart
            ),
            "looseModelsWithDisc12CatalogCounterpartCount": len(
                loose_with_counterpart
            ),
            "looseModelsWithDisc12CatalogCounterpart": loose_with_counterpart,
            "archiveCount": len(archive_paths),
            "pksCount": sum(
                path.suffix.lower() == ".pks" for path in archive_paths
            ),
            "pkfCount": sum(
                path.suffix.lower() == ".pkf" for path in archive_paths
            ),
            "archivePaths": [
                _relative(path, scene_root) for path in archive_paths
            ],
            "mapinfoCount": len(mapinfo_paths),
            "mapinfoPaths": [
                _relative(path, scene_root) for path in mapinfo_paths
            ],
            "animationCandidateCount": len(animation_paths),
            "animationCandidatePaths": [
                _relative(path, scene_root) for path in animation_paths
            ],
            "sceneModelMt5Count": len(scene_model_paths),
            "sceneModelMt5Paths": [
                _relative(path, scene_root) for path in scene_model_paths
            ],
        },
        "globalModel": {
            "mt5Count": len(global_paths),
            "extensionCounts": (
                extension_counts(global_root) if global_root.is_dir() else {}
            ),
            "mt5Paths": [
                _relative(path, global_root) for path in global_paths
            ],
        },
    }


def process_zone(
    zone_dir: Path,
    scene_root: Path,
) -> tuple[list[ResolvedModel], list[tuple[str, bytes]], dict[str, object]]:
    candidates: list[ModelCandidate] = []
    base_textures: dict[bytes, bytes] = {}
    time_textures: dict[int, dict[bytes, bytes]] = {
        0: {},
        1: {},
        2: {},
        3: {},
    }
    archive_model_entries = 0
    archive_entries = 0

    for path in sorted(zone_dir.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix not in MODEL_EXTENSIONS | {".pks", ".pkf", ".ipac"}:
            continue

        data = load_binary(path)
        upper_name = path.name.upper()
        if not upper_name.startswith("OMG"):
            target = (
                time_textures[texture_time_index(path.name)]
                if texture_time_index(path.name) is not None
                else base_textures
            )
            for texture_id, texture_data in extract_texture_records(data):
                target[texture_id] = texture_data

        if suffix in MODEL_EXTENSIONS:
            candidates.append(
                ModelCandidate(
                    canonical_name=scene_model_name(zone_dir.name, path.name),
                    data=data,
                    source=_relative(path, scene_root),
                    source_label="LOOSE",
                    loose=True,
                ),
            )
            continue

        for entry in iter_ipac_entries(data):
            archive_entries += 1
            member_suffix = f".{entry.extension.strip().lower()}"
            if member_suffix not in MODEL_EXTENSIONS:
                continue
            archive_model_entries += 1
            member_name = f"{entry.name}.{entry.extension.strip()}"
            candidates.append(
                ModelCandidate(
                    canonical_name=scene_model_name(
                        zone_dir.name,
                        member_name,
                    ),
                    data=entry.data,
                    source=(
                        f"{_relative(path, scene_root)}"
                        f"::{member_name}"
                    ),
                    source_label=path.stem,
                    loose=False,
                ),
            )

    resolved, conflicts, identical_duplicates = resolve_model_candidates(
        candidates,
    )
    texture_files: list[tuple[str, bytes]] = []
    zone_prefix = f"{DISC3_PREFIX}{clean_component(zone_dir.name)}"
    if base_textures:
        texture_files.append(
            (
                f"{zone_prefix}_textures.bin",
                pack_texture_records(base_textures),
            ),
        )
    for index, records in time_textures.items():
        if records:
            texture_files.append(
                (
                    f"{zone_prefix}_textures_{index}.bin",
                    pack_texture_records(records),
                ),
            )

    report = {
        "zone": zone_dir.name,
        "looseModelCount": sum(candidate.loose for candidate in candidates),
        "archiveEntryCount": archive_entries,
        "archiveModelEntryCount": archive_model_entries,
        "modelCandidateCount": len(candidates),
        "processedModelCount": len(resolved),
        "identicalModelDuplicatesRemoved": identical_duplicates,
        "byteDifferentVariantCount": sum(
            len(conflict["variants"]) - 1 for conflict in conflicts
        ),
        "byteDifferentNameCollisions": conflicts,
        "baseTextureCount": len(base_textures),
        "timeTextureCounts": {
            str(index): len(records)
            for index, records in time_textures.items()
        },
        "texturePackCount": len(texture_files),
    }
    return resolved, texture_files, report


def compare_global_models(
    disc_root: Path,
    existing_catalog: Sequence[str],
    public_models: Path,
) -> tuple[list[ResolvedModel], dict[str, object]]:
    catalog_names = set(existing_catalog)
    global_root = disc_root / "MODEL"
    candidates: list[ModelCandidate] = []

    if global_root.is_dir():
        for category, prefix in GLOBAL_PREFIXES.items():
            category_root = global_root / category
            if not category_root.is_dir():
                continue
            for path in sorted(
                category_root.rglob("*"),
                key=lambda item: item.as_posix().casefold(),
            ):
                if not path.is_file() or path.suffix.lower() != ".mt5":
                    continue
                candidates.append(
                    ModelCandidate(
                        canonical_name=global_model_name(category, path.name),
                        data=load_binary(path),
                        source=_relative(path, global_root),
                        source_label=category,
                        loose=True,
                    ),
                )

    existing_identical: list[dict[str, object]] = []
    existing_different: list[dict[str, object]] = []
    existing_unverified: list[dict[str, object]] = []
    new_candidates: list[ModelCandidate] = []

    for candidate in candidates:
        source_hash = sha256_bytes(candidate.data)
        row = {
            "source": candidate.source,
            "catalogName": candidate.canonical_name,
            "disc3Sha256": source_hash,
        }
        if candidate.canonical_name not in catalog_names:
            new_candidates.append(candidate)
            continue
        public_path = public_models / candidate.canonical_name
        if not public_path.is_file():
            existing_unverified.append(row)
            continue
        public_hash = sha256_file(public_path)
        row["existingSha256"] = public_hash
        if public_hash == source_hash:
            existing_identical.append(row)
        else:
            existing_different.append(row)

    resolved_new, new_conflicts, identical_new_duplicates = (
        resolve_model_candidates(new_candidates)
    )
    report = {
        "disc3GlobalModelCount": len(candidates),
        "existingCatalogNameCount": (
            len(existing_identical)
            + len(existing_different)
            + len(existing_unverified)
        ),
        "byteIdenticalExistingCount": len(existing_identical),
        "byteIdenticalExisting": existing_identical,
        "byteDifferentExistingCount": len(existing_different),
        "byteDifferentExisting": existing_different,
        "catalogMatchesWithoutLocalBinaryCount": len(existing_unverified),
        "catalogMatchesWithoutLocalBinary": existing_unverified,
        "newGlobalModelCount": len(resolved_new),
        "newGlobalModels": [
            {
                "output": model.output_name,
                "sha256": model.sha256,
                "sources": list(model.sources),
            }
            for model in resolved_new
        ],
        "newGlobalNameCollisions": new_conflicts,
        "identicalNewGlobalDuplicatesRemoved": identical_new_duplicates,
    }
    return resolved_new, report


def _write_json(path: Path, value: object) -> None:
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def _assert_stage_target(stage_root: Path) -> None:
    resolved = stage_root.resolve()
    if resolved in {Path("/"), PROJECT_ROOT.resolve()}:
        raise ValueError(f"refusing unsafe stage path: {stage_root}")


def _prepare_stage(stage_root: Path, replace_stage: bool) -> Path:
    _assert_stage_target(stage_root)
    marker = stage_root / STAGE_MARKER
    if stage_root.exists():
        if not replace_stage:
            raise FileExistsError(
                f"stage already exists: {stage_root}; use --replace-stage",
            )
        if not marker.is_file() or marker.read_text(encoding="utf-8") != (
            "shenmue-disc3-processing-stage-v1\n"
        ):
            raise ValueError(
                "refusing to replace a directory that was not created by "
                f"this Disc 3 processor: {stage_root}",
            )
        shutil.rmtree(stage_root)
    stage_root.mkdir(parents=True)
    marker.write_text(
        "shenmue-disc3-processing-stage-v1\n",
        encoding="utf-8",
    )
    return stage_root


def build_disc3_stage(
    disc_root: Path = DEFAULT_DISC_ROOT,
    stage_root: Path = DEFAULT_STAGE_ROOT,
    catalog_path: Path = DEFAULT_CATALOG,
    public_models: Path = DEFAULT_PUBLIC_MODELS,
    *,
    replace_stage: bool = False,
) -> dict[str, object]:
    """Build a Disc 3-only stage and return its audit."""

    disc_root = Path(disc_root)
    stage_root = Path(stage_root)
    catalog_path = Path(catalog_path)
    public_models = Path(public_models)
    scene_root = disc_root / "SCENE" / "03"
    if not scene_root.is_dir():
        raise FileNotFoundError(f"Disc 3 scene root is missing: {scene_root}")

    existing_catalog_bytes = catalog_path.read_bytes()
    existing_catalog = read_catalog(catalog_path)
    existing_catalog_hash = sha256_bytes(existing_catalog_bytes)
    inventory = inventory_disc(disc_root, existing_catalog)

    stage_resolved = stage_root.resolve()
    public_resolved = public_models.resolve()
    catalog_resolved = catalog_path.resolve()
    if (
        stage_resolved == public_resolved
        or stage_resolved.is_relative_to(public_resolved)
        or public_resolved.is_relative_to(stage_resolved)
        or stage_resolved == catalog_resolved.parent
    ):
        raise ValueError(
            "Disc 3 staging must be separate from public assets and catalogs",
        )
    _prepare_stage(stage_root, replace_stage)
    models_dir = stage_root / "models"
    models_dir.mkdir()

    all_models: list[ResolvedModel] = []
    all_texture_files: list[tuple[str, bytes]] = []
    zone_reports: list[dict[str, object]] = []
    zone_names = inventory["scene03"]["zones"]
    for zone_name in zone_names:
        zone_models, texture_files, report = process_zone(
            scene_root / zone_name,
            scene_root,
        )
        all_models.extend(zone_models)
        all_texture_files.extend(texture_files)
        zone_reports.append(report)

    global_models, global_report = compare_global_models(
        disc_root,
        existing_catalog,
        public_models,
    )
    all_models.extend(global_models)

    output_names: set[str] = set()
    model_manifest: list[dict[str, object]] = []
    for model in sorted(all_models, key=lambda item: item.output_name.casefold()):
        if model.output_name in output_names:
            raise ValueError(f"duplicate staged output name: {model.output_name}")
        output_names.add(model.output_name)
        output_path = models_dir / model.output_name
        output_path.write_bytes(model.data)
        model_manifest.append(
            {
                "name": model.output_name,
                "byteCount": len(model.data),
                "sha256": model.sha256,
                "sources": list(model.sources),
                "canonicalName": model.canonical_name,
                "isByteDifferentVariant": model.is_variant,
            },
        )

    texture_manifest: list[dict[str, object]] = []
    for name, data in sorted(
        all_texture_files,
        key=lambda item: item[0].casefold(),
    ):
        if name in output_names:
            raise ValueError(f"duplicate staged output name: {name}")
        output_names.add(name)
        (models_dir / name).write_bytes(data)
        texture_manifest.append(
            {
                "name": name,
                "byteCount": len(data),
                "sha256": sha256_bytes(data),
            },
        )

    disc3_catalog = [model["name"] for model in model_manifest]
    _write_json(stage_root / "disc3-models.json", disc3_catalog)

    processed = {
        "zoneModelCandidateCount": sum(
            report["modelCandidateCount"] for report in zone_reports
        ),
        "archiveModelEntryCount": sum(
            report["archiveModelEntryCount"] for report in zone_reports
        ),
        "identicalZoneModelDuplicatesRemoved": sum(
            report["identicalModelDuplicatesRemoved"]
            for report in zone_reports
        ),
        "byteDifferentZoneVariantCount": sum(
            report["byteDifferentVariantCount"] for report in zone_reports
        ),
        "sceneModelOutputCount": (
            len(model_manifest) - global_report["newGlobalModelCount"]
        ),
        "newGlobalModelOutputCount": global_report["newGlobalModelCount"],
        "modelOutputCount": len(model_manifest),
        "texturePackOutputCount": len(texture_manifest),
        "generatedFileCount": len(model_manifest) + len(texture_manifest),
        "generatedByteCount": sum(
            row["byteCount"] for row in model_manifest + texture_manifest
        ),
    }
    audit = {
        "schema": "shenmue-disc3-processing-audit-v1",
        "prefix": DISC3_PREFIX,
        "stageRoot": str(stage_root),
        "catalogBaseline": {
            "path": str(catalog_path),
            "entryCount": len(existing_catalog),
            "sha256": existing_catalog_hash,
            "normalizedSha256": json_sha256(existing_catalog),
        },
        "inventory": inventory,
        "processed": processed,
        "zones": zone_reports,
        "globalComparison": global_report,
        "modelFiles": model_manifest,
        "texturePacks": texture_manifest,
    }
    _write_json(stage_root / "disc3-audit.json", audit)

    final_catalog_bytes = catalog_path.read_bytes()
    if final_catalog_bytes != existing_catalog_bytes:
        raise RuntimeError(
            "existing catalog changed while building the Disc 3 stage",
        )
    return audit


def merge_disc3_stage(
    stage_root: Path,
    catalog_path: Path = DEFAULT_CATALOG,
    public_models: Path = DEFAULT_PUBLIC_MODELS,
) -> dict[str, object]:
    """Add a completed stage without deleting or overwriting existing assets."""

    stage_root = Path(stage_root)
    catalog_path = Path(catalog_path)
    public_models = Path(public_models)
    audit_path = stage_root / "disc3-audit.json"
    disc3_catalog_path = stage_root / "disc3-models.json"
    if not audit_path.is_file() or not disc3_catalog_path.is_file():
        raise FileNotFoundError("Disc 3 stage is missing its catalog or audit")

    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    staged_rows = audit["modelFiles"] + audit["texturePacks"]
    stage_models = stage_root / "models"
    existing_catalog = read_catalog(catalog_path)
    baseline = audit["catalogBaseline"]
    if len(existing_catalog) != baseline["entryCount"]:
        raise RuntimeError(
            "public model catalog entry count changed after the Disc 3 audit; "
            "restage first",
        )
    if sha256_bytes(catalog_path.read_bytes()) != baseline["sha256"]:
        raise RuntimeError(
            "public model catalog changed after the Disc 3 audit; restage first",
        )

    preflight: list[tuple[Path, Path, str]] = []
    identical_existing = 0
    for row in staged_rows:
        source = stage_models / row["name"]
        destination = public_models / row["name"]
        if not source.is_file() or sha256_file(source) != row["sha256"]:
            raise RuntimeError(f"staged file failed hash validation: {source}")
        if destination.exists():
            if not destination.is_file():
                raise RuntimeError(f"merge destination is not a file: {destination}")
            if sha256_file(destination) != row["sha256"]:
                raise FileExistsError(
                    f"refusing to overwrite byte-different asset: {destination}",
                )
            identical_existing += 1
            continue
        preflight.append((source, destination, row["sha256"]))

    disc3_catalog = read_catalog(disc3_catalog_path)
    merged_catalog = merge_catalog_entries(existing_catalog, disc3_catalog)
    if merged_catalog[: len(existing_catalog)] != existing_catalog:
        raise RuntimeError("catalog merge would modify existing entries")

    public_models.mkdir(parents=True, exist_ok=True)
    for source, destination, _digest in preflight:
        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=destination.parent,
            prefix=f".{destination.name}.",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            with source.open("rb") as source_handle:
                shutil.copyfileobj(source_handle, temporary)
        os.replace(temporary_path, destination)

    catalog_text = json.dumps(merged_catalog, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=catalog_path.parent,
        prefix=f".{catalog_path.name}.",
        delete=False,
    ) as temporary:
        temporary.write(catalog_text)
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, catalog_path)

    result = {
        "schema": "shenmue-disc3-merge-audit-v1",
        "copiedFileCount": len(preflight),
        "identicalExistingFileCount": identical_existing,
        "existingCatalogEntryCount": len(existing_catalog),
        "addedCatalogEntryCount": len(merged_catalog) - len(existing_catalog),
        "mergedCatalogEntryCount": len(merged_catalog),
        "existingCatalogEntriesPreserved": (
            merged_catalog[: len(existing_catalog)] == existing_catalog
        ),
    }
    _write_json(stage_root / "disc3-merge-audit.json", result)
    return result


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Stage only Shenmue Disc 3 assets under S3_ without rebuilding "
            "Disc 1/2."
        ),
    )
    parser.add_argument(
        "--disc-root",
        type=Path,
        default=DEFAULT_DISC_ROOT,
        help="extracted Disc 3 data directory",
    )
    parser.add_argument(
        "--stage",
        type=Path,
        default=DEFAULT_STAGE_ROOT,
        help="isolated output directory",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG,
        help="existing model catalog (read-only unless --merge)",
    )
    parser.add_argument(
        "--public-models",
        type=Path,
        default=DEFAULT_PUBLIC_MODELS,
        help="existing processed assets (read-only unless --merge)",
    )
    parser.add_argument(
        "--replace-stage",
        action="store_true",
        help="replace only the selected staging directory",
    )
    parser.add_argument(
        "--merge",
        action="store_true",
        help="add the audited stage to public/models and append catalog entries",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    audit = build_disc3_stage(
        disc_root=args.disc_root,
        stage_root=args.stage,
        catalog_path=args.catalog,
        public_models=args.public_models,
        replace_stage=args.replace_stage,
    )
    processed = audit["processed"]
    scene = audit["inventory"]["scene03"]
    global_report = audit["globalComparison"]
    print(f"Disc 3 stage: {args.stage}")
    print(
        "Extracted: "
        f"{audit['inventory']['extractedFileCount']} files, "
        f"{audit['inventory']['extractedByteCount']} bytes",
    )
    print(
        "Scene 03: "
        f"{scene['zoneCount']} zones, "
        f"{scene['looseModelPathCount']} loose models, "
        f"{scene['archiveCount']} PKS/PKF/IPAC archives, "
        f"{scene['mapinfoCount']} MAPINFO files, "
        f"{scene['animationCandidateCount']} animation candidates",
    )
    print(
        "Processed: "
        f"{processed['modelOutputCount']} models, "
        f"{processed['texturePackOutputCount']} texture packs, "
        f"{processed['generatedByteCount']} bytes",
    )
    print(
        "Global MODEL: "
        f"{global_report['disc3GlobalModelCount']} inspected, "
        f"{global_report['newGlobalModelCount']} new, "
        f"{global_report['byteDifferentExistingCount']} byte-different",
    )
    print(
        "Catalog baseline unchanged: "
        f"{audit['catalogBaseline']['entryCount']} entries, "
        f"{audit['catalogBaseline']['sha256']}",
    )

    if args.merge:
        merged = merge_disc3_stage(
            args.stage,
            catalog_path=args.catalog,
            public_models=args.public_models,
        )
        print(
            "Merged additively: "
            f"{merged['copiedFileCount']} files copied, "
            f"{merged['addedCatalogEntryCount']} catalog entries appended",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
