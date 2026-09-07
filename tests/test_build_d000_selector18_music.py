import importlib.util
import struct
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "build_d000_selector18_music",
    ROOT / "tools/audio/build_d000_selector18_music.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Selector18MusicBuilderTests(unittest.TestCase):
    def test_dsf_embeds_the_exact_sequence_command(self):
        source = (
            ROOT.parent
            / "new-yokosuka/extracted_files/data/SCENE/01/SOUND/BGM013.SND"
        ).read_bytes()
        driver = (
            ROOT.parent
            / "new-yokosuka/extracted_files/data/SOUND/AICADRV.BIN"
        ).read_bytes()
        self.assertEqual(MODULE.sha256_bytes(source), MODULE.SOURCE_SHA256)
        self.assertEqual(MODULE.sha256_bytes(driver), MODULE.DRIVER_SHA256)
        self.assertEqual(MODULE.sequence_groups(source), [(0xA8250000, 1)])
        dsf = MODULE.make_dsf(driver, source)
        self.assertEqual(dsf[:4], b"PSF\x12")
        self.assertEqual(struct.unpack_from("<I", dsf, 4)[0], 0)

    def test_ogg_canonicalization_is_idempotent(self):
        rendered = (ROOT / "public/music/dobuita-selector-18.ogg").read_bytes()
        self.assertEqual(MODULE.canonicalize_ogg(rendered), rendered)


if __name__ == "__main__":
    unittest.main()
