import binascii
import importlib.util
import json
import os
from pathlib import Path
import struct
import shutil
import subprocess
import tempfile
import unittest
import wave
import zlib

spec = importlib.util.spec_from_file_location("archive", Path(__file__).parents[1] / "tools/audio/render_shenmue2_audio.py")
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


def bank(command=0xa8000000, tracks=2):
    data = bytearray(96)
    data[:4] = b"DTPK"
    struct.pack_into("<II", data, 4, 1, len(data))
    struct.pack_into("<I", data, 44, 64)
    struct.pack_into("<III", data, 64, 0, command | 8, tracks - 1)
    return bytes(data)


class ArchiveTests(unittest.TestCase):
    def test_s1_titles_distinguish_disc_collisions_and_preserve_subsongs(self):
        labels = json.loads((Path(__file__).parents[1] / 'tools/data/shenmue1-audio-labels.json').read_text())
        def entry(label):
            e = next(e for e in labels['entries'] if e['label'] == label)
            return {'label': 'unidentified', 'source': {'bankSha256': e['sha256'], 'group': e['group'], 'track': e['track']}}
        manifest = {'tracks': {label: entry(label) for label in ['FREE 6', 'Old Warehouse No. 8', 'Spotted', 'FREE 1d']}, 'coverage': {}}
        archive.apply_s1_titles(manifest)
        for label in ['FREE 6', 'Old Warehouse No. 8', 'Spotted', 'FREE 1d']:
            self.assertEqual(manifest['tracks'][label]['label'], label)
        self.assertEqual(manifest['coverage']['supplementalTracks'], 4)
        self.assertIn('shenmue-main-menu', manifest['tracks'])
        archive.apply_s1_titles(manifest)
        self.assertEqual(manifest['tracks']['FREE 6']['label'], 'FREE 6')

    def test_s1_inventory_uses_s1_driver_and_keeps_same_name_different_banks(self):
        with tempfile.TemporaryDirectory(dir='/var/tmp') as temporary:
            roots = []
            for disc in (1, 2, 3):
                root = Path(temporary) / str(disc)
                (root / 'SOUND').mkdir(parents=True)
                (root / 'SOUND/AICADRV.BIN').write_bytes(bytes(64))
                sound = root / f'SCENE/0{disc}/SOUND'
                sound.mkdir(parents=True)
                data = bytearray(bank())
                if disc == 2:
                    data[-1] = 1
                (sound / 'FRE1100.SND').write_bytes(data)
                roots.append((disc, root))
            tracks, omitted = archive.inventory(roots, 'shenmue1')
            self.assertEqual(len(tracks), 4)
            self.assertEqual(omitted, [])
            self.assertEqual([c['disc'] for c in tracks[0]['copies']], [1, 3])
            self.assertEqual(len({t['id'] for t in tracks}), 4)

    def test_community_titles_match_subsongs_without_guessing(self):
        def entry(file, track=0, group=0, offset=0):
            return {"source": {"file": file + ".SND", "track": track, "group": group, "offset": offset}}
        tracks = {"known": entry("0001_002"), "first": entry("0002_012"),
            "second": entry("0002_012", 1), "unknown": entry("0001_002", 7),
            "ambiguous": entry("0008_002"), "placeholder": entry("0024_009"),
            "group": entry("0001_002", group=1), "embedded": entry("0001_002", offset=16)}
        manifest = {"tracks": tracks}
        archive.apply_titles(manifest)
        self.assertEqual(tracks["known"]["label"], "Hong Kong Battle")
        self.assertEqual(tracks["first"]["label"], "Xiuying Ability Test")
        self.assertEqual(tracks["second"]["label"], "Xiuying Battle")
        for key in ("unknown", "ambiguous", "placeholder", "group", "embedded"):
            self.assertNotIn("titleMapping", tracks[key])
        archive.apply_titles(manifest)
        self.assertEqual(tracks["known"]["label"], "Hong Kong Battle")

    @unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is required for encoding")
    def test_encoding_is_repeatable(self):
        with tempfile.TemporaryDirectory(dir="/var/tmp") as directory:
            root = Path(directory)
            wav = root / "test.wav"
            with wave.open(str(wav), "wb") as audio:
                audio.setparams((2, 2, 44100, 0, "NONE", "not compressed"))
                audio.writeframes(struct.pack("<hhhh", -4000, -4000, 4000, 4000) * 22050)
            for codec in ("ogg", "mp3"):
                left, right = root / f"left.{codec}", root / f"right.{codec}"
                archive.encode(wav, left, codec)
                archive.encode(wav, right, codec)
                self.assertEqual(left.read_bytes(), right.read_bytes())

    @unittest.skipUnless(os.environ.get("SHENMUE2_AUDIO_DATA"), "Original disc-2 audio is optional")
    def test_original_driver_known_pcm(self):
        root = Path(os.environ["SHENMUE2_AUDIO_DATA"])
        driver = (root / "MISC/AICADRV.BIN").read_bytes()
        bank_data = (root / "SCENE/02/SOUND/0001_002.SND").read_bytes()
        self.assertEqual(archive.digest(driver), "b775b13ab0df29a93cf98f8aff3beb1b7637c1952018dab706e2b3ad4d5f9887")
        self.assertEqual(archive.digest(bank_data), "6681ac93f08a69e076a1fb2749314df1315559a9dfd22de4a8c0c4ebddcac2c8")
        with tempfile.TemporaryDirectory(dir="/var/tmp") as directory:
            dsf, wav = Path(directory) / "track.dsf", Path(directory) / "track.wav"
            dsf.write_bytes(archive.make_dsf(driver, bank_data, 0, 0))
            renderer = os.environ.get("SHENMUE_AUDIO_RENDERER", ".audio-tools/dsf-renderer/dsf-renderer")
            subprocess.run([renderer, str(dsf), str(wav), "10"], check=True, capture_output=True, timeout=60)
            with wave.open(str(wav)) as audio:
                self.assertEqual(archive.digest(audio.readframes(audio.getnframes())),
                    "3ba84e1bd01dd32acf1553531f2983068482be0c05c21c985ac094cfe4eb3595")

    def test_wrappers_and_truncation(self):
        for tag in [b"AMSS", b"AMBS", b"SGTS"]:
            self.assertEqual(archive.banks(tag + bytes(12) + bank()), [(16, bank())])
        self.assertEqual(archive.groups(bank()), [(0xa8000000, 2)])
        for invalid in [bank()[:-1], b"DTPK", b"???" + bank(), b"AMSS" + bytes(80)]:
            with self.assertRaises(ValueError):
                archive.banks(invalid)

    def test_dsf_layout_and_sequence_validation(self):
        dsf = archive.make_dsf(bytes(64), bank(), 0, 1)
        self.assertEqual(dsf[:4], b"PSF\x12")
        self.assertEqual(struct.unpack_from("<I", dsf, 12)[0], binascii.crc32(dsf[16:]))
        ram = zlib.decompress(dsf[16:])[4:]
        self.assertEqual(struct.unpack_from(">II", ram, 0x400), (0xa0001100, 0xa8000100))
        self.assertEqual(ram[0x10000:], bank())
        for group, track in [(1, 0), (0, -1), (0, 2)]:
            with self.assertRaises(ValueError):
                archive.make_dsf(bytes(64), bank(), group, track)
        with self.assertRaises(ValueError):
            archive.make_dsf(bytes(64), bank(0xa9000000), 0, 0)

    def test_disc_dedup_preserves_every_sequence_and_source(self):
        with tempfile.TemporaryDirectory(dir="/var/tmp") as temporary:
            roots = []
            for disc in (1, 2):
                root = Path(temporary) / str(disc)
                (root / "MISC").mkdir(parents=True)
                (root / "MISC/AICADRV.BIN").write_bytes(bytes(64))
                sound = root / f"SCENE/0{disc}/SOUND"
                sound.mkdir(parents=True)
                (sound / "MUSIC.SND").write_bytes(bank())
                (sound / "EFFECT.SND").write_bytes(bank(0xa9000000))
                roots.append((disc, root))
            tracks, omitted = archive.inventory(roots)
            self.assertEqual(len(tracks), 2)
            self.assertEqual(len(omitted), 2)
            self.assertEqual([c["disc"] for c in tracks[0]["copies"]], [1, 2])
            self.assertNotEqual(tracks[0]["id"], tracks[1]["id"])
            self.assertNotIn(str(temporary), str(tracks[0]["copies"]))


if __name__ == "__main__":
    unittest.main()
