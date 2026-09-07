#!/usr/bin/env python3
"""Extract an exact native Shenmue voice member and optionally decode to WAV."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from tools.scripting.extract_dialogue_inventory import parse_afs


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INVENTORY = PROJECT_ROOT / ".disc-work" / "dialogue" / "inventory.json"


def normalize_voice_id(value: str) -> str:
    return Path(value).stem.upper()


def find_voice_source(
    inventory: dict[str, object],
    identifier: str,
    *,
    disc: int | None = None,
) -> dict[str, object]:
    target = normalize_voice_id(identifier)
    matches = []
    for archive in inventory["archives"]:
        if disc is not None and archive["disc"] != disc:
            continue
        for subtitle in archive["subtitles"]:
            for record in subtitle["records"]:
                member = record.get("voiceMember")
                if member and normalize_voice_id(member) == target:
                    matches.append(
                        {
                            "disc": archive["disc"],
                            "archivePath": archive["source"],
                            "archive": archive["archive"],
                            "member": member,
                            "subtitleMember": subtitle["member"],
                            "recordIndex": record["index"],
                            "speakerId": record["speakerId"],
                            "timingSha256": record["timingSha256"],
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
    if not matches:
        raise ValueError(f"voice ID {target} was not found in the inventory")
    if len(matches) > 1:
        sources = ", ".join(
            f"disc {match['disc']} {match['archive']}"
            for match in matches
        )
        raise ValueError(
            f"voice ID {target} is ambiguous ({sources}); specify --disc"
        )
    return matches[0]


def extract_member(source: dict[str, object]) -> bytes:
    archive_path = Path(source["archivePath"])
    data = archive_path.read_bytes()
    target = source["member"].upper()
    matches = [
        member for member in parse_afs(data) if member.name.upper() == target
    ]
    if len(matches) != 1:
        raise ValueError(
            f"{archive_path} contains {len(matches)} members named "
            f"{source['member']}"
        )
    member = matches[0]
    payload = data[member.offset : member.offset + member.size]
    if len(payload) < 0x40 or payload[:4] != b"SPSD":
        raise ValueError(f"{source['member']} is not a native SPSD stream")
    return payload


def decode_wav(payload: bytes, output: Path, vgmstream_cli: str) -> None:
    with tempfile.TemporaryDirectory() as temporary:
        source = Path(temporary) / "voice.str"
        source.write_bytes(payload)
        subprocess.run(
            [vgmstream_cli, "-o", str(output), str(source)],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("voice_id")
    parser.add_argument("--disc", type=int)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--vgmstream-cli",
        default=shutil.which("vgmstream-cli"),
        help="required when output has a .wav extension",
    )
    parser.add_argument(
        "--provenance-output",
        type=Path,
        help="optional JSON record without embedding source audio",
    )
    args = parser.parse_args()
    inventory_path = args.inventory.expanduser().resolve()
    inventory = json.loads(inventory_path.read_text())
    source = find_voice_source(
        inventory,
        args.voice_id,
        disc=args.disc,
    )
    payload = extract_member(source)
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".wav":
        if not args.vgmstream_cli:
            parser.error("--vgmstream-cli is required for WAV output")
        decode_wav(payload, output, args.vgmstream_cli)
    else:
        output.write_bytes(payload)
    if args.provenance_output:
        provenance = args.provenance_output.expanduser().resolve()
        provenance.parent.mkdir(parents=True, exist_ok=True)
        provenance.write_text(
            json.dumps(
                {
                    "schema": "new-yokosuka-dialogue-voice-provenance-v1",
                    "voiceId": normalize_voice_id(args.voice_id),
                    "source": source,
                    "nativeByteLength": len(payload),
                    "output": str(output),
                    "decoder": (
                        "vgmstream"
                        if output.suffix.lower() == ".wav"
                        else "none"
                    ),
                },
                indent=2,
                ensure_ascii=False,
            )
            + "\n"
        )
    print(f"Wrote {output} from {source['member']} ({len(payload)} native bytes)")


if __name__ == "__main__":
    main()
