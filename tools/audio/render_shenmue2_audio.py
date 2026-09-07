#!/usr/bin/env python3
"""Render original Shenmue II music banks with the existing headless DSF renderer.

The driver RAM layout follows the project's Shenmue I renderer and
kingshriek's dsfdtpk (2008): https://www.snesmusic.org/hoot/kingshriek/ssf/
Only A8 sequenced music is played; SFX commands are not music tracks.
"""
import argparse
import array
import binascii
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import wave
import zlib


def digest(data):
    return hashlib.sha256(data).hexdigest()


def apply_titles(manifest):
    """Apply a pinned community index, never guessing ambiguous banks/subsongs."""
    catalog = json.loads((Path(__file__).resolve().parents[1] / "data/shenmue2-music-titles.json").read_text())
    index = {}
    for entry in catalog["entries"]:
        key = (entry["file"].upper(), entry["subsong"] or 0)
        index.setdefault(key, set()).add(entry["title"])
    for track in manifest["tracks"].values():
        source = track["source"]
        stem = Path(source["file"]).stem
        track["label"] = f"{stem} · sequence {source['track'] + 1}"
        track.pop("titleMapping", None)
        # The wiki indexes standalone banks, not embedded banks or group IDs.
        if source["offset"] != 0 or source["group"] != 0:
            continue
        titles = index.get((stem.upper(), source["track"]), set())
        if len(titles) != 1:
            continue
        title = next(iter(titles))
        if title.upper().startswith(stem.upper()):
            continue  # A filename placeholder is not an identified title.
        track["label"] = title.replace("Qr.", "Quarter").replace("Bldg.", "Building")
        track["titleMapping"] = {"title": title, "source": catalog["source"],
            "kind": "community-description" if "[" in title or "?" in title or "unused" in title.lower()
            else "community-title"}
    manifest["titleCredits"] = {key: catalog[key] for key in ("source", "credit")}


def write_json(path, value):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def u32(data, offset):
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"Truncated DTPK field at {offset:#x}")
    return struct.unpack_from("<I", data, offset)[0]


def banks(data):
    """Return size-checked DTPKs, including those inside S2 sound wrappers."""
    container = data[:4].decode("ascii")
    if container not in ("DTPK", "AMBS", "AMSS", "SGTS"):
        raise ValueError(f"Unsupported sound container {container!r}")
    offset = 0
    found = []
    while (offset := data.find(b"DTPK", offset)) >= 0:
        size = u32(data, offset + 8)
        if size < 0x30 or offset + size > len(data):
            raise ValueError(f"Invalid DTPK size {size} at {offset:#x}")
        found.append((offset, data[offset:offset + size]))
        offset += size
    if not found:
        raise ValueError(f"{container} contains no DTPK")
    return found


def groups(bank):
    table = u32(bank, 0x2c)
    if not table:
        return []
    count = u32(bank, table) + 1
    if count > 256:
        raise ValueError(f"Invalid sequence group count {count}")
    result = []
    for index in range(count):
        entry = u32(bank, table + 4 + index * 4)
        tracks = u32(bank, table + (entry & 0xffff)) + 1
        if tracks > 256:
            raise ValueError(f"Invalid track count {tracks}")
        result.append((entry & 0xffff0000, tracks))
    return result


def make_dsf(driver, bank, group, track):
    commands = groups(bank)
    if not 0 <= group < len(commands):
        raise ValueError("Invalid sequence group")
    command, count = commands[group]
    if command >> 24 != 0xa8 or not 0 <= track < count:
        raise ValueError("Not a valid music sequence")
    if not 0 < len(driver) <= 0x10000 or len(bank) + 0x10000 > 0x200000:
        raise ValueError("Bank/driver exceeds Dreamcast sound RAM")
    ram = bytearray(0x10000)
    ram[:len(driver)] = driver
    ram.extend(bank)
    struct.pack_into("<I", ram, 0x60, u32(bank, 4))
    struct.pack_into(">II", ram, 0x400, 0xa0001100, command | (track << 8))
    compressed = zlib.compress(struct.pack("<I", 0) + ram, 9)
    return b"PSF\x12" + struct.pack("<III", 0, len(compressed), binascii.crc32(compressed)) + compressed


def inventory(roots):
    tracks, omitted = {}, []
    for disc, root in roots:
        driver_path = root / "MISC/AICADRV.BIN"
        driver_hash = digest(driver_path.read_bytes())
        sources = sorted(root.glob("SCENE/*/SOUND/*.SND"))
        if not sources:
            raise ValueError(f"No scene sound banks in disc {disc}")
        for path in sources:
            data = path.read_bytes()
            source = {"disc": disc, "path": path.relative_to(root).as_posix(), "sha256": digest(data)}
            music = False
            try:
                parsed = [(offset, bank, groups(bank)) for offset, bank in banks(data)]
            except ValueError as error:
                print(f"Excluded disc {disc} {source['path']}: {error}", flush=True)
                omitted.append({**source, "reason": str(error)})
                continue
            for offset, bank, sequences in parsed:
                for group, (command, count) in enumerate(sequences):
                    if command >> 24 != 0xa8:
                        continue
                    music = True
                    for track in range(count):
                        # Identical banks with identical drivers share a render, not just a filename.
                        key = digest(f"{driver_hash}:{digest(bank)}:{group}:{track}".encode())
                        if key not in tracks:
                            tracks[key] = {"id": key, "file": path.name, "container": data[:4].decode(),
                                "bankSha256": digest(bank), "offset": offset, "group": group,
                                "track": track, "groupCommand": f"{command:08X}",
                                "driverSha256": driver_hash, "copies": [], "_path": path,
                                "_driver": driver_path}
                        tracks[key]["copies"].append(source)
            if not music:
                omitted.append({**source, "reason": "No A8 music sequences"})
    return list(tracks.values()), omitted


def encode(wav, output, codec):
    options = ["-c:a", "libvorbis", "-q:a", "4"] if codec == "ogg" else ["-c:a", "libmp3lame", "-q:a", "2"]
    # The muxer flag must follow -i; as an input option it does NOT fix Ogg's random serial.
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(wav), "-fflags", "+bitexact", "-map_metadata", "-1", "-flags:a", "+bitexact", *options, str(output)],
        check=True, capture_output=True, timeout=120)


def render(task, args):
    source = {key: value for key, value in task.items() if not key.startswith("_")}
    directory = args.output / "shenmue2"
    directory.mkdir(parents=True, exist_ok=True)
    stem = f"{task['file'][:-4].lower()}-{task['id'][:16]}-{args.seconds}s"
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    receipt = args.cache_dir / f"{stem}.json"
    # Resume only hash-verified output from this exact renderer and settings.
    signature = {"rendererSha256": args.renderer_hash, "seconds": args.seconds, "revision": 2}
    if receipt.exists():
        cached = json.loads(receipt.read_text())
        if cached.get("signature") == signature and all(
            (directory / name).exists() and digest((directory / name).read_bytes()) == sha
            for name, sha in cached.get("outputs", {}).items()
        ):
            return {**cached, "source": source}
    data = task["_path"].read_bytes()
    driver = task["_driver"].read_bytes()
    if digest(data) != task["copies"][0]["sha256"] or digest(driver) != task["driverSha256"]:
        raise ValueError(f"Source changed during rendering: {task['file']}")
    bank = dict(banks(data))[task["offset"]]
    with tempfile.TemporaryDirectory(prefix="ny-audio-", dir=args.work_dir) as temporary:
        work = Path(temporary)
        dsf, wav = work / "track.dsf", work / "track.wav"
        dsf.write_bytes(make_dsf(driver, bank, task["group"], task["track"]))
        subprocess.run([str(args.renderer), str(dsf), str(wav), str(args.seconds)],
            check=True, capture_output=True, timeout=max(120, args.seconds * 2))
        with wave.open(str(wav)) as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (2, 2, 44100):
                raise ValueError("Renderer did not produce 44.1 kHz stereo PCM16")
            if audio.getnframes() != args.seconds * 44100:
                raise ValueError("Renderer produced an incomplete track")
            pcm = audio.readframes(audio.getnframes())
        samples = array.array("h", pcm)
        peak = max(abs(min(samples)), abs(max(samples)))
        result = {"source": source, "signature": signature, "pcmSha256": digest(pcm),
                  "peak": peak, "outputs": {}, "status": "silent" if peak == 0 else "rendered"}
        if peak:
            for codec in ("ogg", "mp3"):
                name = f"{stem}.{codec}"
                encode(wav, directory / name, codec)
                result["outputs"][name] = digest((directory / name).read_bytes())
        write_json(receipt, result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--disc", action="append", help="NUMBER=/path/to/extracted/data")
    parser.add_argument("--renderer", type=Path)
    parser.add_argument("--relabel-manifest", type=Path, help="Update titles only; no audio rendering")
    parser.add_argument("--output", type=Path, default=Path("public/music"))
    parser.add_argument("--work-dir", type=Path, default=Path("/var/tmp"))
    parser.add_argument("--cache-dir", type=Path, default=Path(".audio-tools/archive-cache/shenmue2"))
    parser.add_argument("--seconds", type=int, default=180)
    parser.add_argument("--workers", type=int, choices=range(1, 7), default=4)
    args = parser.parse_args()
    if args.relabel_manifest:
        manifest = json.loads(args.relabel_manifest.read_text())
        if manifest.get("game") != "shenmue2":
            parser.error("Only Shenmue II catalogs can use this title mapping")
        apply_titles(manifest)
        write_json(args.relabel_manifest, manifest)
        return
    if not args.disc or not args.renderer:
        parser.error("Rendering requires --disc and --renderer")
    if not 1 <= args.seconds <= 600:
        parser.error("seconds must be between 1 and 600")
    try:
        roots = [(int(value.split("=", 1)[0]), Path(value.split("=", 1)[1])) for value in args.disc]
    except (ValueError, IndexError):
        parser.error("Each --disc must be NUMBER=/path/to/extracted/data")
    if len({disc for disc, _ in roots}) != len(roots) or any(disc not in range(1, 5) for disc, _ in roots):
        parser.error("Use unique disc numbers 1–4")
    args.renderer = args.renderer.resolve()
    args.renderer_hash = digest(args.renderer.read_bytes())
    ffmpeg_version = subprocess.run(["ffmpeg", "-version"], check=True, capture_output=True,
        text=True, timeout=10).stdout.splitlines()[0]
    tasks, omitted = inventory(sorted(roots))
    print(f"Rendering {len(tasks)} distinct sequences from {len(roots)} discs ({args.workers} workers)", flush=True)
    results = []
    with ThreadPoolExecutor(args.workers) as pool:
        for result in pool.map(lambda task: render(task, args), tasks):
            results.append(result)
            if len(results) % 20 == 0:
                print(f"Completed {len(results)}/{len(tasks)}", flush=True)
    tracks = {}
    for result in results:
        if result["status"] != "rendered":
            omitted.append({**result["source"], "reason": "Digital silence for the complete render window"})
            continue
        source = result["source"]
        stem = source["file"][:-4]
        category = "ambient" if source["container"] in ("AMBS", "AMSS") else (
            "event" if source["container"] == "SGTS" else "music")
        tracks[source["id"]] = {"label": f"{stem} · sequence {source['track'] + 1}",
            "category": category, "durationSeconds": args.seconds, "loop": False,
            "discs": sorted({copy['disc'] for copy in source['copies']}),
            "source": source, "pcmSha256": result["pcmSha256"],
            **{f"{Path(name).suffix[1:]}_url": f"/music/shenmue2/{name}" for name in result['outputs']}}
    manifest = {"schema": "new-yokosuka-asset-viewer-music-v1", "game": "shenmue2",
        "render": {"durationSeconds": args.seconds, "sampleRate": 44100,
            "rendererSha256": args.renderer_hash, "ffmpegVersion": ffmpeg_version},
        "tracks": tracks,
        "coverage": {"discs": sorted(disc for disc, _ in roots), "musicSequences": len(tasks),
            "audibleSequences": len(tracks), "omitted": omitted}}
    apply_titles(manifest)
    args.output.mkdir(parents=True, exist_ok=True)
    write_json(args.output / "shenmue2-asset-viewer-manifest.json", manifest)
    print(f"Archive ready: {len(tracks)} audible tracks; {len(tasks) - len(tracks)} silent sequences", flush=True)


if __name__ == "__main__":
    main()
