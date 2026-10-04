#!/usr/bin/env python3
"""Recover S1 weather curves from a user's disc, with bounded executable proof.

Run as a module: python3 -m tools.worlds.extract_shenmue1_weather.
FCAS is retained as opaque data, not misinterpreted as another intensity curve.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path

from tools.assets.gditools3 import GDIfile

ROOT = Path(__file__).resolve().parents[2]
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
WEATHER_SHA256 = "bef583bdc80a3b2e7ed8167afca006b7da51f25950f6a2ab94919bbbaeb184ef"
RANGES = {
    "refresh": (0x0C1BA8FA, 164, "a2f846774e6f3bf4d9ce067bf447ee6eb26762234a23177b3fcd2c36a02931a0"),
    "freeze": (0x0C1BAAE4, 8, "65c5a24b4de944a35988723803a278dfaceeec2e11547e4477d920f65439492d"),
    "calendar": (0x0C1C1256, 190, "70d6deb2a99a47e5a21f098ebdb3d7288eddacb15843911813d59531814e0521"),
    "datePacking": (0x0C1C1338, 84, "cad2b3b84de13a1e26a2cb93c6cd3bae591e33d77bb09bd2d4772bc4a765ef25"),
    "curveEvaluation": (0x0C1C138C, 166, "f137c1100b2586f3e62977ed717c16e528a217ba1556936356a5411559d492ee"),
    "interpolation": (0x0C0ECF06, 38, "cea1e20fb19d6c02580c22145676762621014c1fa06ee7cf8843e7e9b1838067"),
    "channelRead": (0x0C1C1432, 146, "f15a66681799667c8de080e712119771ad83144169dd5be34a39dab16be4f756"),
    "resourceBindings": (0x0C1C1060, 134, "e2e2e0facf5dbe2e71dc13bbc5864c49aa1950d285c94975158a34dba434c430"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_weather(data: bytes) -> dict[str, list[int]]:
    position = 0
    tables = {}
    while position + 4 <= len(data):
        tag_bytes = data[position:position + 4]
        if tag_bytes == bytes(4):
            if position + 4 != len(data):
                raise ValueError("weather has bytes after its terminator")
            break
        if position + 8 > len(data):
            raise ValueError("weather has a truncated chunk header")
        tag = tag_bytes.decode("ascii")
        size = struct.unpack_from("<I", data, position + 4)[0]
        if size < 8 or size % 4 or position + size > len(data):
            raise ValueError(f"weather {tag} has an invalid chunk size")
        if tag in tables:
            raise ValueError(f"weather repeats {tag}")
        tables[tag] = list(struct.unpack_from("<" + "I" * ((size - 8) // 4), data, position + 8))
        position += size
    else:
        raise ValueError("weather terminator is missing")
    if set(tables) != {"WDAT", "CLUD", "RAIN", "SNOW", "FCAS"} or tables["WDAT"]:
        raise ValueError("weather chunk layout is not the recovered WDAT layout")
    for tag in ("CLUD", "RAIN", "SNOW"):
        words = tables[tag]
        if len(words) < 2 or any((a & 0xffffff) >= (b & 0xffffff) for a, b in zip(words, words[1:])):
            raise ValueError(f"weather {tag} is not a strictly ordered curve")
    return tables


def build_catalog(executable: bytes, weather: bytes) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN; this proof is for the reviewed S1 executable")
    if digest(weather) != WEATHER_SHA256:
        raise ValueError("unexpected WEATHER.BIN; do not substitute WEAT_ORG.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(executable[address - BASE:address - BASE + size]) != expected:
            raise ValueError(f"native weather {name} changed")
    tables = parse_weather(weather)
    return {
        "schema": "new-yokosuka-shenmue1-native-weather-v1",
        "source": {
            "game": "shenmue1", "disc": 1,
            "discFile": "SPRITE/WEATHER.BIN", "sha256": WEATHER_SHA256,
            "executable": "1ST_READ.BIN", "executableSha256": EXECUTABLE_SHA256,
        },
        "nativeContract": {
            "operation": "0x0176", "mode": 1,
            "enabledDword": "0x0c2262a8", "frozenDword": "0x0c2262ac",
            "zeroBranch": "Clears frozen, evaluates WDAT at the native clock, updates cloud/rain/snow/auxiliary channels, then caches year/month/day/hour/minute.",
            "nonzeroBranch": "Writes frozen=1; does not sample the clock or clear existing channels.",
            "packedDate": "(clamped year offset from 1986 << 20) | (month << 16) | (day << 11) | (hour << 6) | minute",
            "curveWord": "Intensity in bits 24-31; packed date in bits 0-23. Interpolation uses the packed integer, not elapsed wall-clock minutes.",
            "intensityDivisor": 255, "epsilon": 2 ** -23,
            "tableChannels": {"CLUD": "cloud", "RAIN": "rain", "SNOW": "snow", "FCAS": "opaque-forecast-data"},
        },
        "curves": {tag: tables[tag] for tag in ("CLUD", "RAIN", "SNOW")},
        "opaqueForecastWords": tables["FCAS"],
        "verifiedRanges": {name: {"address": hex(a), "length": n, "sha256": h}
                           for name, (a, n, h) in RANGES.items()},
        "evidenceBoundary": [
            "Source-backed calendar/curve lookup is separate from browser weather rendering and story-clock authority.",
            "Forecast pointer construction, explicit weather override modes 9-13, native particles and renderer channel ownership are not recovered by this catalog.",
            "Cloud/rain/snow curve reads alone do not prove the entire 0x0176 refresh helper is implemented.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gdi", type=Path, default=ROOT / ".disc-work/disc1.gdi")
    parser.add_argument("--executable", type=Path, default=ROOT / ".disc-work/exact/1ST_READ.BIN")
    parser.add_argument("--out", type=Path, default=ROOT / "play/data/shenmue1-native-weather.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    with GDIfile(str(args.gdi)) as disc:
        weather = disc.get_file("SPRITE/WEATHER.BIN")
    result = build_catalog(args.executable.read_bytes(), weather)
    text = json.dumps(result, indent=2) + "\n"
    if args.check:
        if args.out.read_text() != text:
            raise SystemExit("native weather catalog is stale")
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    print("Verified S1 weather: " + ", ".join(f"{tag}={len(words)}" for tag, words in result["curves"].items()))


if __name__ == "__main__":
    main()
