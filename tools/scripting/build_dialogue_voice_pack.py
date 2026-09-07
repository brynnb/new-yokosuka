#!/usr/bin/env python3
"""Decode a selected native actor-dialogue voice pack for the browser."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_voice import extract_member, normalize_voice_id


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCES = (
    ROOT / ".disc-work" / "dialogue"
    / "actor-dialogue-voice-sources.json"
)


def select_voices(
    manifest: dict[str, Any],
    *,
    actor_codes: set[str],
    voice_ids: set[str],
    include_all: bool,
) -> list[dict[str, Any]]:
    normalized_actors = {value.upper() for value in actor_codes}
    normalized_voices = {
        normalize_voice_id(value) for value in voice_ids
    }
    if not include_all and not normalized_actors and not normalized_voices:
        raise ValueError(
            "select at least one --actor or --voice-id, or pass --all"
        )
    selected = []
    for voice in manifest["voices"]:
        if (
            include_all
            or voice["voiceId"] in normalized_voices
            or normalized_actors.intersection(voice["actorCodes"])
        ):
            selected.append(voice)
    missing_actors = normalized_actors.difference(
        actor
        for voice in selected
        for actor in voice["actorCodes"]
    )
    missing_voices = normalized_voices.difference(
        voice["voiceId"] for voice in selected
    )
    if missing_actors or missing_voices:
        details = []
        if missing_actors:
            details.append(
                f"actors: {', '.join(sorted(missing_actors))}"
            )
        if missing_voices:
            details.append(
                f"voices: {', '.join(sorted(missing_voices))}"
            )
        raise ValueError("selection was not found (" + "; ".join(details) + ")")
    return selected


def transcode_aac(
    payload: bytes,
    output: Path,
    *,
    vgmstream_cli: str,
    ffmpeg: str,
    bitrate: int,
    sample_rate: int,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        temporary_dir = Path(temporary)
        native_path = temporary_dir / "voice.str"
        wav_path = temporary_dir / "voice.wav"
        encoded_path = temporary_dir / "voice.m4a"
        native_path.write_bytes(payload)
        subprocess.run(
            [vgmstream_cli, "-o", str(wav_path), str(native_path)],
            check=True,
            stdout=subprocess.DEVNULL,
        )
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(wav_path),
                "-map_metadata",
                "-1",
                "-vn",
                "-ac",
                "1",
                "-ar",
                str(sample_rate),
                "-c:a",
                "aac",
                "-b:a",
                f"{bitrate}k",
                "-movflags",
                "+faststart",
                str(encoded_path),
            ],
            check=True,
        )
        shutil.move(encoded_path, output)


def build_pack(
    selected: list[dict[str, Any]],
    output_dir: Path,
    *,
    base_url: str,
    vgmstream_cli: str,
    ffmpeg: str,
    bitrate: int = 32,
    sample_rate: int = 16000,
    filename_mode: str = "voice-id",
    jobs: int = 1,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    if bitrate <= 0:
        raise ValueError("bitrate must be positive")
    if sample_rate <= 0:
        raise ValueError("sample rate must be positive")
    if jobs <= 0:
        raise ValueError("jobs must be positive")
    if filename_mode not in {"voice-id", "content-hash"}:
        raise ValueError(f"unsupported filename mode {filename_mode!r}")

    encode_jobs: dict[Path, dict[str, Any]] = {}
    lines = []
    for voice in selected:
        variant = voice["variants"][0]
        native_sha = variant["sha256"]
        if filename_mode == "voice-id":
            if not re.fullmatch(r"[A-Z0-9]+", voice["voiceId"]):
                raise ValueError(
                    f"unsafe voice ID filename {voice['voiceId']!r}"
                )
            encoded = output_dir / f"{voice['voiceId']}.m4a"
        else:
            encoded = output_dir / f"{native_sha}.m4a"
        encode_jobs.setdefault(encoded, voice)
        lines.append(
            {
                "voiceId": voice["voiceId"],
                "actorCodes": voice["actorCodes"],
                "nativeSha256": native_sha,
                "nativeByteLength": variant["nativeByteLength"],
                "url": (
                    f"{base_url.rstrip('/')}/{encoded.name}"
                    if base_url
                    else encoded.name
                ),
            }
        )

    def encode_voice(encoded: Path, voice: dict[str, Any]) -> bool:
        if encoded.exists():
            return False
        variant = voice["variants"][0]
        native_sha = variant["sha256"]
        payload = extract_member(variant["sources"][0])
        if len(payload) != variant["nativeByteLength"]:
            raise ValueError(
                f"native length changed for {voice['voiceId']}"
            )
        if hashlib.sha256(payload).hexdigest() != native_sha:
            raise ValueError(
                f"native hash changed for {voice['voiceId']}"
            )
        transcode_aac(
            payload,
            encoded,
            vgmstream_cli=vgmstream_cli,
            ffmpeg=ffmpeg,
            bitrate=bitrate,
            sample_rate=sample_rate,
        )
        return True

    completed = 0
    encoded_now = 0
    with ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = {
            executor.submit(encode_voice, output, voice): output
            for output, voice in encode_jobs.items()
        }
        for future in as_completed(futures):
            if future.result():
                encoded_now += 1
            completed += 1
            if completed % 100 == 0 or completed == len(futures):
                print(
                    f"\rEncoded {completed}/{len(futures)} "
                    f"(new: {encoded_now})",
                    end="\n" if completed == len(futures) else "",
                    flush=True,
                )

    return {
        "schema": "new-yokosuka-dialogue-voice-pack-v1",
        "encoding": {
            "container": "MPEG-4",
            "codec": "AAC-LC",
            "channels": 1,
            "sampleRate": sample_rate,
            "targetBitrate": bitrate * 1000,
            "filenameMode": filename_mode,
        },
        "summary": {
            "voiceIdCount": len(lines),
            "encodedFileCount": len(encode_jobs),
            "encodedByteLength": sum(
                path.stat().st_size for path in encode_jobs
            ),
        },
        "lines": lines,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    parser.add_argument("--actor", action="append", default=[])
    parser.add_argument("--voice-id", action="append", default=[])
    parser.add_argument(
        "--all",
        action="store_true",
        help="explicitly build every recoverable actor voice",
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    parser.add_argument("--base-url", default="")
    parser.add_argument(
        "--bitrate",
        type=int,
        default=32,
        help="AAC target bitrate in kilobits per second (default: 32)",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=16000,
        help="output sample rate in Hz (default: 16000)",
    )
    parser.add_argument(
        "--filename-mode",
        choices=("voice-id", "content-hash"),
        default="voice-id",
        help="address output by voice ID for direct lazy loading",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=1,
        help="parallel decoder/transcoder jobs (default: 1)",
    )
    parser.add_argument(
        "--vgmstream-cli",
        default=shutil.which("vgmstream-cli"),
    )
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    if not args.vgmstream_cli:
        parser.error("--vgmstream-cli is required")
    if not args.ffmpeg:
        parser.error("--ffmpeg is required")

    sources = json.loads(args.sources.read_text())
    try:
        selected = select_voices(
            sources,
            actor_codes=set(args.actor),
            voice_ids=set(args.voice_id),
            include_all=args.all,
        )
    except ValueError as error:
        parser.error(str(error))
    pack = build_pack(
        selected,
        args.output_dir.resolve(),
        base_url=args.base_url,
        vgmstream_cli=args.vgmstream_cli,
        ffmpeg=args.ffmpeg,
        bitrate=args.bitrate,
        sample_rate=args.sample_rate,
        filename_mode=args.filename_mode,
        jobs=args.jobs,
    )
    args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_output.write_text(
        json.dumps(pack, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote {pack['summary']['voiceIdCount']} voice IDs as "
        f"{pack['summary']['encodedFileCount']} encoded files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
