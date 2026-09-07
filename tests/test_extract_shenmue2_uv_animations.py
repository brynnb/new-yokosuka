import importlib.util
import struct
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "tools" / "animation/extract_shenmue2_uv_animations.py"
SPEC = importlib.util.spec_from_file_location("extract_shenmue2_uv_animations", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ExtractShenmue2UvAnimationsTest(unittest.TestCase):
    def _ev1(self, words, literals):
        data = bytearray(0x100)
        struct.pack_into(f"<{len(words)}H", data, 0, *words)
        for offset, value in literals.items():
            struct.pack_into("<f", data, offset, value)
        directory = Path(self.temp.name) / "01" / "TEST"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / "TEST.EV1"
        path.write_bytes(data)
        return path

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp.cleanup()

    def test_extracts_zero_u_and_literal_v_form(self):
        words = [
            0xC70F, 0xF508, 0x518D, 0x410B, 0xF4CC,
            0xD90E, 0x519B, 0x410B, 0xE411,
            0x518F, 0x410B, 0x6403,
        ]
        result = MODULE.scan_ev1(self._ev1(words, {0x40: 0.055}))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].room_id, "TEST")
        self.assertEqual(result[0].model_index, 17)
        self.assertEqual(result[0].source_u_per_update, 0.0)
        self.assertAlmostEqual(result[0].source_v_per_update, 0.055)

    def test_extracts_adjacent_v_and_u_literals(self):
        words = [
            0xC70F, 0xF509, 0x518D, 0x410B, 0xF408,
            0x519B, 0x410B, 0xE410,
            0x518F, 0x410B, 0x6403,
        ]
        result = MODULE.scan_ev1(
            self._ev1(words, {0x40: 0.0001, 0x44: 0.00015})
        )
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].model_index, 16)
        self.assertAlmostEqual(result[0].source_u_per_update, 0.00015)
        self.assertAlmostEqual(result[0].source_v_per_update, 0.0001)

    def test_rejects_an_unrelated_indirect_call(self):
        words = [0xC70F, 0xF508, 0x518D, 0x410B, 0xF4CC] + [0] * 8
        self.assertEqual(MODULE.scan_ev1(self._ev1(words, {0x40: 0.1})), [])


if __name__ == "__main__":
    unittest.main()
