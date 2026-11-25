"""Replay MS8S's five lean callbacks against the original Disc 2 AICA driver."""
import hashlib
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import wave
import zlib

ROOT = Path(__file__).resolve().parents[1]
DISC = Path(os.environ.get("SHENMUE_DISC2_EXTRACTED_ROOT", ROOT / "extracted_disc2_v2")) / "data"
DRIVER = DISC / "SOUND/AICADRV.BIN"
BANK = DISC / "SCENE/02/SOUND/F1NEW8SO.SND"
MAP = DISC / "SCENE/02/MS8S/MAPINFO.BIN"
RENDERER = ROOT / ".audio-tools/dsf-renderer/dsf-renderer"


def word(data, offset):
    return struct.unpack_from("<I", data, offset)[0]


def replay(driver, bank, commands, directory):
    # Use the same RAM image and boot command as the archive music renderer.
    # Here the queue can also be empty or carry an A9 sound-effect command.
    ram = bytearray(0x10000)
    ram[:len(driver)] = driver
    ram.extend(bank)
    struct.pack_into("<I", ram, 0x60, word(bank, 4))
    for index, command in enumerate([0xA0001100, *commands]):
        struct.pack_into(">I", ram, 0x400 + 4 * index, command)
    packed = zlib.compress(struct.pack("<I", 0) + ram)
    dsf = directory / "test.dsf"
    dsf.write_bytes(b"PSF\x12" + struct.pack("<III", 0, len(packed), zlib.crc32(packed)) + packed)
    wav = directory / "test.wav"
    subprocess.run([RENDERER, dsf, wav, "3"], check=True, timeout=30, capture_output=True)
    with wave.open(str(wav)) as audio:
        assert audio.getparams()[:4] == (2, 2, 44100, 132300)
        return audio.readframes(audio.getnframes())


@unittest.skipUnless(all(path.is_file() for path in [DRIVER, BANK, MAP]), "requires original Disc 2")
class WarehouseOfficeSound(unittest.TestCase):
    def test_source_callbacks_reach_the_driver_return(self):
        driver, bank, director = (path.read_bytes() for path in [DRIVER, BANK, MAP])
        self.assertEqual(hashlib.sha256(driver).hexdigest(), "3f88553a52a6d1af0b988ea3f41800178988350721bd7422a570dc3e4e369915")
        self.assertEqual(hashlib.sha256(bank).hexdigest(), "fe32ed95919c92b7f4d3eaee7c07de3a055469411f9ddd2fef07e3268447e3a8")
        for offset in [0x26FF8, 0x270A8, 0x27158, 0x27208, 0x27280]:
            self.assertEqual(word(director, offset), 0x000705A9)
        group_table = word(bank, 0x2C)
        group = word(bank, group_table + 4)
        self.assertEqual(group >> 16, 0xA905)
        track_offset = word(bank, group_table + (group & 0xFFFF) + 4 + 7 * 4)
        track = group_table + (track_offset & 0xFFFF)
        self.assertEqual(bank[track:track + 5], bytes.fromhex("c0 a0 00 80 ff"))

        # Driver trace: input bytes at 0x103f4-6 become 0xa0000080 in
        # the internal command queue (0x2814). Follow its three zero selectors.
        top = word(driver, 0x4828)
        self.assertEqual(word(driver, top + 2 * 4), 0x420C)
        for literal, handler in [(0x4830, 0x424C), (0x4834, 0x4350), (0x4850, 0x4410)]:
            table = word(driver, literal)
            self.assertEqual(table + struct.unpack_from("<H", driver, table)[0], handler)
        self.assertEqual(word(driver, 0x4410), 0xE8BD8000)  # ldm sp!, {pc}

    @unittest.skipUnless(RENDERER.is_file(), "requires the local DSF renderer")
    def test_room_command_is_silent_and_room_sample_plays(self):
        driver, bank = DRIVER.read_bytes(), BANK.read_bytes()
        with tempfile.TemporaryDirectory(prefix="ms8s-office-sound-") as temp:
            directory = Path(temp)
            reference = replay(driver, bank, [], directory)
            self.assertEqual(reference, bytes(132300 * 4))
            self.assertEqual(replay(driver, bank, [0xA9050700] * 5, directory), reference)
            for command in [0xA9051100, 0xA9051200]:
                self.assertNotEqual(replay(driver, bank, [command], directory), reference)
