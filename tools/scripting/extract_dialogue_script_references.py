#!/usr/bin/env python3
"""Link exact MAPINFO string references to native dialogue inventory records.

Room scripts embed voice member IDs as null-terminated ASCII strings. This
tool intersects those exact strings with the voice IDs established by
extract_dialogue_inventory.py. It proves resource references only; it does not
infer which interaction, branch, or actor selects a referenced line.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterator, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INVENTORY = PROJECT_ROOT / ".disc-work" / "dialogue" / "inventory.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work" / "dialogue" / "script-references.json"
)
ASCII_TOKEN = re.compile(rb"[\x20-\x7e]{3,64}\0")


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


def voice_id(member_name: str) -> str:
    return Path(member_name).stem.upper()


def is_script_voice_id(identifier: str) -> bool:
    # Short members such as END, MEMO, and OPEN1 are archive-local assets and
    # collide with ordinary room-script tokens. Authored spoken-line IDs are
    # at least eight characters and contain both letters and digits.
    return (
        len(identifier) >= 8
        and any(character.isalpha() for character in identifier)
        and any(character.isdigit() for character in identifier)
    )


def build_voice_index(
    inventory: dict[str, object],
) -> dict[str, list[dict[str, object]]]:
    result: dict[str, list[dict[str, object]]] = defaultdict(list)
    for archive in inventory["archives"]:
        for subtitle in archive["subtitles"]:
            for record in subtitle["records"]:
                member = record.get("voiceMember")
                if not member:
                    continue
                identifier = voice_id(member)
                if not is_script_voice_id(identifier):
                    continue
                result[identifier].append(
                    {
                        "disc": archive["disc"],
                        "scene": archive["scene"],
                        "archive": archive["archive"],
                        "subtitleMember": subtitle["member"],
                        "recordIndex": record["index"],
                        "speakerId": record["speakerId"],
                        **(
                            {"sourceText": record["sourceText"]}
                            if "sourceText" in record
                            else {}
                        ),
                        **(
                            {"displayText": record["displayText"]}
                            if "displayText" in record
                            else {}
                        ),
                    }
                )
    return dict(result)


def iter_mapinfo(root: Path) -> Iterator[tuple[str, Path]]:
    for path in sorted(root.rglob("MAPINFO.BIN")):
        relative = path.relative_to(root)
        area = relative.parts[-2].upper() if len(relative.parts) > 1 else ""
        yield area, path


def scan_mapinfo(
    path: Path,
    known_voice_ids: set[str],
) -> list[tuple[int, str]]:
    data = path.read_bytes()
    references = []
    for match in ASCII_TOKEN.finditer(data):
        token = match.group()[:-1].decode("ascii").upper()
        if token in known_voice_ids:
            references.append((match.start(), token))
    return references


def build_report(
    inventory: dict[str, object],
    roots: Sequence[tuple[int, Path]],
    *,
    include_text: bool = True,
) -> dict[str, object]:
    voices = build_voice_index(inventory)
    known = set(voices)
    references: list[dict[str, object]] = []
    missing_roots = []
    for disc, root in roots:
        if not root.is_dir():
            missing_roots.append({"disc": disc, "path": str(root)})
            continue
        for area, path in iter_mapinfo(root):
            for offset, identifier in scan_mapinfo(path, known):
                candidates = voices[identifier]
                same_disc = [
                    candidate
                    for candidate in candidates
                    if candidate["disc"] == disc
                ]
                linked = same_disc or candidates
                if not include_text:
                    linked = [
                        {
                            key: value
                            for key, value in candidate.items()
                            if key not in {"sourceText", "displayText"}
                        }
                        for candidate in linked
                    ]
                references.append(
                    {
                        "disc": disc,
                        "area": area,
                        "mapinfo": str(path),
                        "fileOffset": offset,
                        "fileOffsetHex": f"0x{offset:x}",
                        "voiceId": identifier,
                        "dialogueRecords": linked,
                        "usedSameDiscRecords": bool(same_disc),
                    }
                )

    references.sort(
        key=lambda item: (
            item["disc"],
            item["area"],
            item["mapinfo"],
            item["fileOffset"],
        )
    )
    area_counts = Counter(
        (reference["disc"], reference["area"])
        for reference in references
    )
    return {
        "schema": "new-yokosuka-dialogue-script-references-v1",
        "evidenceBoundary": [
            "Every reference is an exact null-terminated MAPINFO ASCII string that equals a native AFS voice member ID.",
            "Dialogue records come from exact ordered STR-to-SRF alignment in the dialogue inventory.",
            "A reference establishes that a room program names a voice resource; it does not by itself prove the selecting interaction, condition, speaker actor, animation, or branch.",
        ],
        "includeText": include_text,
        "inventory": {
            "schema": inventory.get("schema"),
            "path": str(DEFAULT_INVENTORY),
        },
        "roots": [{"disc": disc, "path": str(root)} for disc, root in roots],
        "missingRoots": missing_roots,
        "summary": {
            "referenceCount": len(references),
            "uniqueVoiceIdCount": len(
                {reference["voiceId"] for reference in references}
            ),
            "areaCount": len(area_counts),
            "areas": [
                {
                    "disc": disc,
                    "area": area,
                    "referenceCount": count,
                    "uniqueVoiceIdCount": len(
                        {
                            reference["voiceId"]
                            for reference in references
                            if reference["disc"] == disc
                            and reference["area"] == area
                        }
                    ),
                }
                for (disc, area), count in sorted(area_counts.items())
            ],
        },
        "references": references,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument(
        "--disc-root",
        action="append",
        type=parse_disc_root,
        required=True,
        help="repeatable DISC:path containing area MAPINFO.BIN files",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--without-text",
        action="store_true",
        help="omit copyrighted subtitle text from linked records",
    )
    args = parser.parse_args()
    inventory_path = args.inventory.expanduser().resolve()
    inventory = json.loads(inventory_path.read_text())
    report = build_report(
        inventory,
        args.disc_root,
        include_text=not args.without_text,
    )
    report["inventory"]["path"] = str(inventory_path)
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {output}: {summary['referenceCount']} exact references, "
        f"{summary['uniqueVoiceIdCount']} unique voice IDs, "
        f"{summary['areaCount']} disc/area pairs"
    )


if __name__ == "__main__":
    main()
