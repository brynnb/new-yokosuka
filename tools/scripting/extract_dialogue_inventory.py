#!/usr/bin/env python3
"""Inventory Shenmue dialogue subtitles and voice streams from native AFS files.

The STREAM archives use a standard AFS member table.  Their SRF members are a
sequence of three length-prefixed blocks: speaker ID, subtitle text, and
authored timing/control data.  Voice STR members and SRF records are associated
only when their counts and archive order establish a one-to-one relationship.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mmap
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = PROJECT_ROOT / ".disc-work" / "dialogue" / "inventory.json"
AFS_ALIGNMENT = 0x800
AFS_DIRECTORY_ENTRY_SIZE = 0x30


class DialogueFormatError(ValueError):
    """Raised when an archive or subtitle member violates its native format."""


@dataclass(frozen=True)
class AfsMember:
    index: int
    name: str
    offset: int
    size: int


@dataclass(frozen=True)
class SrfRecord:
    index: int
    offset: int
    byte_length: int
    speaker_id: str
    source_text: str
    display_text: str
    text_encoding: str
    timing_byte_length: int
    timing_sha256: str
    timing_cues: tuple[tuple[int, int], ...]


SRF_TIMING_RECORD_BYTE_LENGTH = 8
SRF_TIMING_TERMINATOR = b"\xff\xff\xff\xff"


def parse_srf_timing(data: bytes | memoryview) -> tuple[tuple[int, int], ...]:
    """Parse the native mouth-cue stream in an SRF timing block.

    Speech records contain zero or more ``<hhhh>`` records followed by the
    four-byte ``-1,-1`` terminator. Some non-speech SRFs use an empty block;
    that is retained as an empty cue list instead of being treated as speech.
    The second and fourth halfwords are invariant across the complete local
    Shenmue I corpus and are validated so unrelated control data cannot be
    silently reinterpreted as lip sync.
    """
    raw = bytes(data)
    if not raw:
        return ()
    if (
        len(raw) < len(SRF_TIMING_TERMINATOR)
        or raw[-4:] != SRF_TIMING_TERMINATOR
        or (len(raw) - 4) % SRF_TIMING_RECORD_BYTE_LENGTH
    ):
        raise DialogueFormatError("invalid SRF mouth-cue stream layout")
    cues: list[tuple[int, int]] = []
    for offset in range(0, len(raw) - 4, SRF_TIMING_RECORD_BYTE_LENGTH):
        shape, channel, duration_ticks, reserved = struct.unpack_from(
            "<hhhh", raw, offset
        )
        if shape not in range(6):
            raise DialogueFormatError(f"invalid SRF mouth shape {shape}")
        if channel != 2 or duration_ticks <= 0 or reserved != 0:
            raise DialogueFormatError(
                "invalid SRF mouth-cue channel, duration, or reserved field"
            )
        cues.append((shape, duration_ticks))
    return tuple(cues)


def align(value: int, alignment: int = AFS_ALIGNMENT) -> int:
    return (value + alignment - 1) & ~(alignment - 1)


def decode_c_string(raw: bytes) -> str:
    return raw.split(b"\0", 1)[0].decode("ascii", errors="replace").strip()


def decode_dialogue_text(raw: bytes) -> tuple[str, str]:
    payload = raw.rstrip(b"\0")
    if all(byte < 0x80 for byte in payload):
        return payload.decode("ascii"), "ascii"
    # Shenmue's native SRF text uses EUC-JP. CP932 remains a defensive
    # fallback for localized or modified archives.
    for encoding in ("euc_jp", "cp932"):
        try:
            return payload.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return payload.decode("cp932", errors="replace"), "cp932-replace"


def normalize_dialogue_text(source_text: str) -> str:
    """Render known SRF control glyphs without altering the source value."""
    return source_text.replace("＆", "\n").replace("=@", "...")


def parse_afs(data: bytes | mmap.mmap | memoryview) -> list[AfsMember]:
    if len(data) < 8 or data[:4] != b"AFS\0":
        raise DialogueFormatError("not an AFS archive")
    count = struct.unpack_from("<I", data, 4)[0]
    table_end = 8 + count * 8
    if count > 1_000_000 or table_end > len(data):
        raise DialogueFormatError(f"invalid AFS member count: {count}")

    extents: list[tuple[int, int]] = []
    for index in range(count):
        offset, size = struct.unpack_from("<II", data, 8 + index * 8)
        if offset > len(data) or size > len(data) - offset:
            raise DialogueFormatError(
                f"AFS member {index} exceeds the archive bounds"
            )
        extents.append((offset, size))

    directory_offset = align(max((offset + size for offset, size in extents), default=0))
    directory_size = count * AFS_DIRECTORY_ENTRY_SIZE
    has_directory = directory_offset + directory_size <= len(data)
    members: list[AfsMember] = []
    for index, (offset, size) in enumerate(extents):
        name = f"member_{index:05d}.bin"
        if has_directory:
            entry = directory_offset + index * AFS_DIRECTORY_ENTRY_SIZE
            candidate = decode_c_string(bytes(data[entry : entry + 32]))
            if candidate:
                name = candidate
        members.append(AfsMember(index, name, offset, size))
    return members


def parse_srf(data: bytes | memoryview) -> list[SrfRecord]:
    view = memoryview(data)
    records: list[SrfRecord] = []
    cursor = 0

    def read_block(at: int, label: str) -> tuple[memoryview, int]:
        if at + 4 > len(view):
            raise DialogueFormatError(
                f"truncated {label} block length at SRF offset 0x{at:x}"
            )
        block_length = struct.unpack_from("<I", view, at)[0]
        if block_length < 4 or block_length % 4:
            raise DialogueFormatError(
                f"invalid {label} block length {block_length} "
                f"at SRF offset 0x{at:x}"
            )
        end = at + block_length
        if end > len(view):
            raise DialogueFormatError(
                f"{label} block at SRF offset 0x{at:x} exceeds the member"
            )
        return view[at + 4 : end], end

    while cursor < len(view):
        # Conversation groups can be sector-aligned inside one SRF member.
        # Final sector padding is also retained by some archives.
        if not any(view[cursor:]):
            break
        if cursor + 4 <= len(view) and struct.unpack_from("<I", view, cursor)[0] == 0:
            next_sector = align(cursor)
            if next_sector == cursor:
                next_sector += AFS_ALIGNMENT
            if next_sector > len(view) or any(view[cursor:next_sector]):
                raise DialogueFormatError(
                    f"unexpected zero block at SRF offset 0x{cursor:x}"
                )
            cursor = next_sector
            continue
        record_offset = cursor
        speaker_raw, cursor = read_block(cursor, "speaker")
        text_raw, cursor = read_block(cursor, "text")
        timing_raw, cursor = read_block(cursor, "timing")
        speaker_bytes = bytes(speaker_raw).rstrip(b"\0 ")
        if any(
            byte < 0x20 or byte > 0x7E for byte in speaker_bytes
        ):
            raise DialogueFormatError(
                f"invalid speaker ID at SRF offset 0x{record_offset:x}"
            )
        source_text, encoding = decode_dialogue_text(bytes(text_raw))
        timing_bytes = bytes(timing_raw)
        records.append(
            SrfRecord(
                index=len(records),
                offset=record_offset,
                byte_length=cursor - record_offset,
                speaker_id=speaker_bytes.decode("ascii"),
                source_text=source_text,
                display_text=normalize_dialogue_text(source_text),
                text_encoding=encoding,
                timing_byte_length=len(timing_raw),
                timing_sha256=hashlib.sha256(timing_bytes).hexdigest(),
                timing_cues=parse_srf_timing(timing_bytes),
            )
        )
    return records


def member_extension(name: str) -> str:
    return Path(name).suffix.upper()


def archive_record(
    path: Path,
    *,
    disc: int,
    scene: str,
    include_text: bool,
) -> dict[str, object]:
    with path.open("rb") as stream:
        with mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as data:
            members = parse_afs(data)
            voices = [
                member
                for member in members
                if member_extension(member.name) == ".STR"
            ]
            subtitles = [
                member
                for member in members
                if member_extension(member.name) == ".SRF"
            ]
            subtitle_sets = []
            pending_voices: list[AfsMember] = []
            for member in members:
                extension = member_extension(member.name)
                if extension == ".STR":
                    pending_voices.append(member)
                    continue
                if extension != ".SRF":
                    continue
                subtitle = member
                payload = bytes(data[
                    subtitle.offset : subtitle.offset + subtitle.size
                ])
                records = parse_srf(payload)
                line_records: list[dict[str, object]] = []
                exact_voice_alignment = len(pending_voices) == len(records)
                for record in records:
                    line: dict[str, object] = {
                        "index": record.index,
                        "recordOffset": record.offset,
                        "recordByteLength": record.byte_length,
                        "speakerId": record.speaker_id,
                        "timingByteLength": record.timing_byte_length,
                        "timingSha256": record.timing_sha256,
                        "lipSync": {
                            "format": "shenmue-srf-mouth-cues-v1",
                            "tickRate": 60,
                            "cues": [
                                {
                                    "shape": shape,
                                    "durationTicks": duration_ticks,
                                }
                                for shape, duration_ticks in record.timing_cues
                            ],
                        },
                        "voiceMember": (
                            pending_voices[record.index].name
                            if exact_voice_alignment
                            else None
                        ),
                    }
                    if include_text:
                        line["sourceText"] = record.source_text
                        line["displayText"] = record.display_text
                        line["textEncoding"] = record.text_encoding
                    line_records.append(line)
                subtitle_sets.append(
                    {
                        "member": subtitle.name,
                        "memberIndex": subtitle.index,
                        "byteLength": subtitle.size,
                        "sha256": hashlib.sha256(payload).hexdigest(),
                        "recordCount": len(records),
                        "precedingVoiceMemberCount": len(pending_voices),
                        "exactVoiceAlignment": exact_voice_alignment,
                        "voiceAlignmentEvidence": (
                            "same native AFS member group and exact ordered count"
                            if exact_voice_alignment
                            else None
                        ),
                        "records": line_records,
                    }
                )
                pending_voices = []

    speakers = sorted(
        {
            record["speakerId"]
            for subtitle in subtitle_sets
            for record in subtitle["records"]
        }
    )
    return {
        "disc": disc,
        "scene": scene,
        "source": str(path),
        "archive": path.name,
        "byteLength": path.stat().st_size,
        "memberCount": len(members),
        "voiceMemberCount": len(voices),
        "subtitleMemberCount": len(subtitles),
        "subtitleRecordCount": sum(
            subtitle["recordCount"] for subtitle in subtitle_sets
        ),
        "speakerIds": speakers,
        "subtitles": subtitle_sets,
    }


def find_archives(root: Path) -> Iterator[tuple[str, Path]]:
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.upper() == ".AFS":
            relative = path.relative_to(root)
            scene = relative.parts[0].upper() if len(relative.parts) > 1 else ""
            yield scene, path


def build_inventory(
    roots: Sequence[tuple[int, Path]],
    *,
    include_text: bool = True,
) -> dict[str, object]:
    archives: list[dict[str, object]] = []
    missing_roots: list[dict[str, object]] = []
    for disc, root in roots:
        if not root.is_dir():
            missing_roots.append({"disc": disc, "path": str(root)})
            continue
        for scene, path in find_archives(root):
            archives.append(
                archive_record(
                    path,
                    disc=disc,
                    scene=scene,
                    include_text=include_text,
                )
            )

    archives.sort(
        key=lambda record: (
            record["disc"],
            record["scene"],
            record["archive"],
            record["source"],
        )
    )
    subtitle_archives = [
        archive for archive in archives if archive["subtitleMemberCount"]
    ]
    aligned = sum(
        all(
            subtitle["exactVoiceAlignment"]
            for subtitle in archive["subtitles"]
        )
        for archive in subtitle_archives
    )
    return {
        "schema": "new-yokosuka-dialogue-inventory-v1",
        "evidenceBoundary": [
            "AFS member extents, directory names, SRF blocks, speaker IDs, and subtitle text are parsed directly from original disc data.",
            "A voiceMember is assigned only when one SRF member and the ordered STR members have exactly matching record counts.",
            "No speaker names, conversation grouping, interaction conditions, translations, animations, or script relationships are inferred by this inventory.",
            "The generated inventory contains copyrighted dialogue text when includeText is true and belongs in ignored local research storage, not source control.",
        ],
        "includeText": include_text,
        "roots": [
            {"disc": disc, "path": str(root)}
            for disc, root in roots
        ],
        "missingRoots": missing_roots,
        "summary": {
            "archiveCount": len(archives),
            "subtitleArchiveCount": len(subtitle_archives),
            "exactVoiceAlignedArchiveCount": aligned,
            "voiceMemberCount": sum(
                archive["voiceMemberCount"] for archive in archives
            ),
            "subtitleMemberCount": sum(
                archive["subtitleMemberCount"] for archive in archives
            ),
            "subtitleRecordCount": sum(
                archive["subtitleRecordCount"] for archive in archives
            ),
            "speakerIdCount": len(
                {
                    speaker
                    for archive in archives
                    for speaker in archive["speakerIds"]
                }
            ),
        },
        "archives": archives,
    }


def parse_disc_root(value: str) -> tuple[int, Path]:
    try:
        disc_text, path_text = value.split(":", 1)
        disc = int(disc_text)
    except (ValueError, TypeError) as error:
        raise argparse.ArgumentTypeError(
            "disc roots must use DISC:/absolute/or/relative/path"
        ) from error
    if disc <= 0 or not path_text:
        raise argparse.ArgumentTypeError(
            "disc roots must use a positive disc and a non-empty path"
        )
    return disc, Path(path_text).expanduser().resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--disc-root",
        action="append",
        type=parse_disc_root,
        required=True,
        help="repeatable DISC:path containing STREAM AFS files",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"output JSON (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--without-text",
        action="store_true",
        help="record structure and hashes without copyrighted subtitle text",
    )
    args = parser.parse_args()
    report = build_inventory(
        args.disc_root,
        include_text=not args.without_text,
    )
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {output}: {summary['subtitleRecordCount']} subtitle records, "
        f"{summary['voiceMemberCount']} voice members, "
        f"{summary['speakerIdCount']} speaker IDs"
    )


if __name__ == "__main__":
    main()
