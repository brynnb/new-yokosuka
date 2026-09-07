#!/usr/bin/env python3
"""Inventory authored Shenmue motion banks without converting their data.

The Dreamcast scene trees contain loose HMOT files and MOTN members packed
inside IPAC/PAKS/PAKF archives.  This tool records their provenance, hashes,
sequence names, and likely locomotion clips so animation research can refer to
the original area assets instead of guessing from the global Ryo motion bank.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOTS = (
    (1, PROJECT_ROOT / "extracted_files" / "data" / "SCENE" / "01"),
    (2, PROJECT_ROOT / "extracted_disc2_v2" / "data" / "SCENE" / "02"),
    (3, PROJECT_ROOT / "extracted_disc3_v2" / "data" / "SCENE" / "03"),
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools" / "evidence" / "npc-motion-bank-inventory.json"
)
LOCOMOTION_WORDS = ("WALK", "RUN", "STAND", "TATI", "SIT", "LP")


@dataclass(frozen=True)
class ArchiveMember:
    name: str
    extension: str
    data: bytes


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def decode_ascii(raw: bytes) -> str:
    return raw.rstrip(b"\0 ").decode("ascii", errors="replace")


def archive_members(data: bytes) -> Iterator[ArchiveMember]:
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
    dictionary_offset, count = struct.unpack_from("<II", ipac, 4)
    if count > 100_000 or dictionary_offset < 16:
        return
    if dictionary_offset + count * 20 > len(ipac):
        return
    for index in range(count):
        entry = dictionary_offset + index * 20
        name_raw, ext_raw, offset, size = struct.unpack_from(
            "<8s4sII", ipac, entry
        )
        if offset > len(ipac) or size > len(ipac) - offset:
            continue
        yield ArchiveMember(
            decode_ascii(name_raw),
            decode_ascii(ext_raw),
            ipac[offset : offset + size],
        )


def c_string(data: bytes, offset: int) -> str | None:
    if offset < 0 or offset >= len(data):
        return None
    end = data.find(b"\0", offset)
    if end < 0:
        return None
    raw = data[offset:end]
    if not raw or any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def motn_sequence_names(data: bytes) -> list[str] | None:
    if len(data) < 16:
        return None
    index_offset, string_table, motion_data = struct.unpack_from("<III", data)
    stored_count = data[12]
    candidate_counts = [stored_count, max(0, stored_count - 1)]
    if (
        index_offset < 16
        or string_table < 16
        or motion_data < 16
        or index_offset >= len(data)
        or string_table >= len(data)
        or motion_data >= len(data)
    ):
        return None
    best: list[str] = []
    for count in candidate_counts:
        if count <= 0 or count > 4096 or string_table + count * 4 > len(data):
            continue
        names: list[str] = []
        for index in range(count):
            pointer = struct.unpack_from("<I", data, string_table + index * 4)[0]
            name = c_string(data, pointer)
            if name is None:
                break
            names.append(name)
        if len(names) > len(best):
            best = names
    return best or None


def printable_hmn_names(data: bytes) -> list[str]:
    names: list[str] = []
    cursor = 0
    while cursor < len(data):
        start = data.find(b"HMN_", cursor)
        if start < 0:
            break
        name = c_string(data, start)
        if name and name not in names:
            names.append(name)
        cursor = start + 4
    return names


def likely_locomotion(names: list[str]) -> list[str]:
    return [
        name
        for name in names
        if any(word in name.upper() for word in LOCOMOTION_WORDS)
    ]


def source_record(
    *,
    disc: int,
    area: str,
    path: Path,
    member: ArchiveMember | None,
    data: bytes,
) -> dict[str, object] | None:
    motn_names = motn_sequence_names(data)
    is_hmot = (
        (member and member.name.upper().startswith("HMOT"))
        or path.name.upper().startswith("HMOT")
    )
    hmot_names = printable_hmn_names(data) if is_hmot else []
    if not motn_names and not hmot_names:
        return None
    filename = (
        f"{member.name}.{member.extension}" if member else path.name
    )
    return {
        "disc": disc,
        "area": area,
        "source": relative(path),
        "archiveMember": filename if member else None,
        "format": "MOTN" if motn_names else "HMOT",
        "byteLength": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "sequenceCount": len(motn_names or hmot_names),
        "sequenceNames": motn_names or hmot_names,
        "likelyLocomotionSequences": likely_locomotion(
            motn_names or hmot_names
        ),
    }


def inventory(roots: tuple[tuple[int, Path], ...]) -> dict[str, object]:
    records: list[dict[str, object]] = []
    archive_count = 0
    for disc, root in roots:
        if not root.is_dir():
            continue
        for area_path in sorted(path for path in root.iterdir() if path.is_dir()):
            area = area_path.name.upper()
            for path in sorted(area_path.iterdir()):
                if not path.is_file():
                    continue
                upper = path.name.upper()
                if upper.startswith("HMOT") and path.suffix.upper() == ".BIN":
                    record = source_record(
                        disc=disc,
                        area=area,
                        path=path,
                        member=None,
                        data=path.read_bytes(),
                    )
                    if record:
                        records.append(record)
                if path.suffix.upper() not in (".PKS", ".PKF"):
                    continue
                archive_count += 1
                data = path.read_bytes()
                for member in archive_members(data):
                    if member.extension.upper() != "MOTN":
                        continue
                    record = source_record(
                        disc=disc,
                        area=area,
                        path=path,
                        member=member,
                        data=member.data,
                    )
                    if record:
                        records.append(record)

    records.sort(
        key=lambda item: (
            item["disc"],
            item["area"],
            item["source"],
            item["archiveMember"] or "",
        )
    )
    hashes = {record["sha256"] for record in records}
    motn_records = [record for record in records if record["format"] == "MOTN"]
    hmot_records = [record for record in records if record["format"] == "HMOT"]
    locomotion_records = [
        record for record in motn_records if record["likelyLocomotionSequences"]
    ]
    return {
        "schema": "new-yokosuka-npc-motion-bank-inventory-v1",
        "evidenceBoundary": (
            "Sequence names and archive provenance are exact. A locomotion "
            "name is not by itself proof that a scheduler state selects it; "
            "controller-state-to-sequence mappings require runtime or "
            "relocation-aware executable evidence."
        ),
        "roots": [
            {"disc": disc, "path": relative(root), "available": root.is_dir()}
            for disc, root in roots
        ],
        "summary": {
            "archiveCountScanned": archive_count,
            "sourceRecordCount": len(records),
            "uniqueBankCount": len(hashes),
            "motnRecordCount": len(motn_records),
            "hmotRecordCount": len(hmot_records),
            "locomotionBankRecordCount": len(locomotion_records),
            "motnSequenceCountIncludingDiscRepeats": sum(
                int(record["sequenceCount"]) for record in motn_records
            ),
        },
        "banks": records,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = inventory(DEFAULT_ROOTS)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {relative(args.out)}: "
        f"{summary['sourceRecordCount']} records, "
        f"{summary['uniqueBankCount']} unique banks, "
        f"{summary['locomotionBankRecordCount']} locomotion candidates."
    )


if __name__ == "__main__":
    main()
