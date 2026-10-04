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
    "environmentColdState": (0x0C1BA710, 0x1ea, "12ce27eefc99574ca72634dc304481501523361d46ff5ee2e0b08341343d3d10"),
    "environmentCreateRelease": (0x0C1BADBC, 0x140, "ece04fb73b64e71a738d8c428b5f474ac995a0c61d56c585c4fdb9bb59c59862"),
    "environmentTableBinding": (0x0C1BC04A, 0x6a, "0ee667085ced8e010ec011be3130db1c6130953aa451bee42f04ba2c410671ed"),
    "environmentOwnerAndMask": (0x0C1BC5EE, 0x296, "2299cb9f69b8478922d3acbfbc97a31c6374b5ce8fb8b9d6ef3a9cc35d23ef0a"),
    "environmentApplicationAndSky": (0x0C1BC884, 0x478, "bc7f40d3e42a26ab795ede7afb557d15c3e22dce5536caaabd222d8942c12b49"),
    "environmentSamplingAndBlend": (0x0C1BD160, 0x392, "15539b711787ed9b7d48a31ea33b0a8af4f0ff3863ce8b5aeaad208087040738"),
    "environmentColorAndClock": (0x0C1BD4F2, 0x152, "0d0579725df1adb67dafc81224eb7977e95175f57238ff8f3080cc1ff53ffa37"),
    "environmentTables": (0x0C2A0490, 0xfe6, "8bf2bcfb8e4ccdfcb0b1c0efed794ee48965b01d10919603df1fe0083d77c468"),
    "auxiliaryCurveBinding": (0x0C1C116E, 0xe8, "fcde64536db03c0d0340d1180598ddabdaffb2b951895f7b49be2b5c4bbb34ce"),
    "auxiliaryCurve": (0x0C2A1664, 8, "bf3dee965fa0c9fb6fd9a06c2a9f9502e9c7423355c5ac66c91f2a34a4965d35"),
    "environmentTick": (0x0C1BAF84, 0xbe, "842bf6521c9472f9a32d7273824ceac583f5ef4f51d5d54a0175c8a2eaf1cf86"),
    "skyHysteresis": (0x0C1BCBC2, 0x16e, "d8259bb736f66094caf4f312fdb74d8c76d07562d6c83c89a257178eab6fc54b"),
    "colorInterpolation": (0x0C0ECF2C, 0xaa, "3221c99b6406a6c6db4f1a2679afa603aed31a1ec4c1184dec054a5b425280b8"),
}
SKY_HASHES = {
    "SCROLL60": "4557d28efa8240a0edc0d0a32b31db45b523b6c5db3c61df3b34137fa0896ecb",
    "SCROLL61": "84f73788eae11cfe8fbd45b39e7828230406ebf845946e619919a53920ae0d1b",
    "SCROLL66": "12b880bdb2c20120d268b119b18f93941debc296747389a120fab8f65a8afb07",
    "SCROLL63": "82cf03d083775dc3728b0ecb06571d68cc4b2b50a026e4215ec9561b2bc60fca",
    "SCROLL64": "45a0e99f3adf4c22949a1e5c3a628a2a216c246ca3b4c2a5793fbbc4ee07e43d",
    "SCROLL65": "761e030aec4f93c5dd470510c9490e09f820f965f47d14f4902eb9ca720ee300",
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


def sky_record(name: str, data: bytes) -> dict:
    if digest(data) != SKY_HASHES[name]:
        raise ValueError(f"unexpected {name}.SPR")
    wrapped = data[:4] == b"SCRL"
    position = 8 if wrapped else 0
    tiles = []
    while position < len(data) - 8:
        if wrapped:
            if data[position:position + 4] != f"SCL{len(tiles)}".encode():
                raise ValueError(f"unexpected {name} tile order")
            position += 8
        span = struct.unpack_from("<I", data, position + 4)[0]
        if data[position:position + 4] != b"TEXN" or data[position + 28:position + 32] != b"PVRT":
            raise ValueError(f"unexpected {name} texture")
        texture = data[position + 8:position + 16].split(b"\0")[0].decode("ascii")
        width, height = struct.unpack_from("<HH", data, position + 40)
        tiles.append({"textureName": texture, "width": width, "height": height,
                      "imagePath": f"/textures/sky/{texture}.png"})
        position += span
    if position + 8 != len(data) or data[position:] != bytes(8):
        raise ValueError(f"unexpected {name} terminator")
    return {"resource": "SPRITE/" + name + ".SPR", "sha256": digest(data), "tiles": tiles}


def build_catalog(executable: bytes, weather: bytes, sprites: dict[str, bytes]) -> dict:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN; this proof is for the reviewed S1 executable")
    if digest(weather) != WEATHER_SHA256:
        raise ValueError("unexpected WEATHER.BIN; do not substitute WEAT_ORG.BIN")
    for name, (address, size, expected) in RANGES.items():
        if digest(executable[address - BASE:address - BASE + size]) != expected:
            raise ValueError(f"native weather {name} changed")
    tables = parse_weather(weather)
    environment_tables = []
    for index, channel in enumerate(("clear", "cloud", "rain", "snow")):
        address, count = struct.unpack_from("<II", executable, 0x0C2A1430 - BASE + index * 8)
        records = [list(struct.unpack_from("<25I", executable, address - BASE + i * 100)) for i in range(count)]
        if records[0][0] != 0 or records[-1][0] >= 86400 or any(a[0] >= b[0] for a, b in zip(records, records[1:])):
            raise ValueError(f"native environment {channel} time keys changed")
        environment_tables.append({"channel": channel, "address": hex(address), "recordWords": records})
    sprite_names = [executable[0x0C2A1450 - BASE + i * 9:0x0C2A1450 - BASE + i * 9 + 8].decode("ascii") for i in range(6)]
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
        "auxiliaryCurve": list(struct.unpack_from("<2I", executable, 0x0C2A1664 - BASE)),
        "environment": {
            "ownerTag": "WAIR", "ownerBytes": 100,
            "ownerPointer": "0x0c2262cc", "tableBinding": "0x0c226288",
            "maskAddress": "0x0c226350", "coldMask": 8191,
            "coldFlags": {"lighting": 1, "sky": 1, "effects": 1},
            "recordBytes": 100, "daySeconds": 86400,
            "floatWordIndices": list(range(1, 10)) + [13, 14, 15, 19, 20, 21],
            "colorWordIndices": [10, 11, 12, 16, 17, 18, 22, 23, 24],
            "lightColor": {"offset": 16, "order": "ARGB-float32", "mask": 2},
            "tables": environment_tables,
            "skyResources": ["SPRITE/" + name + ".SPR" for name in sprite_names],
            "skyResourceRecords": [sky_record(name, sprites[name]) for name in sprite_names],
            "skySelection": {"minuteBoundaries": [330, 450, 990, 1080],
                             "indices": [3, 0, 1, 2, 3], "precipitationThreshold": 0.1,
                             "cloudThreshold": 0.25, "precipitationExitThreshold": 0.05,
                             "cloudExitThreshold": 0.2},
        },
        "opaqueForecastWords": tables["FCAS"],
        "verifiedRanges": {name: {"address": hex(a), "length": n, "sha256": h}
                           for name, (a, n, h) in RANGES.items()},
        "evidenceBoundary": [
            "Source-backed calendar/curve lookup is separate from browser weather rendering and story-clock authority.",
            "WAIR state, time-table sampling and initial sky selection are separate from native solar rotation, fog-table application, particles and sprite transition timing.",
            "The browser sky dome uses the selected resource's primary image; the second cloud/rain strip and original sprite projection are not reproduced.",
            "Forecast pointer construction and explicit weather override modes 9-13 are not recovered by this catalog.",
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
        sprites = {name: disc.get_file("SPRITE/" + name + ".SPR") for name in SKY_HASHES}
    result = build_catalog(args.executable.read_bytes(), weather, sprites)
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
