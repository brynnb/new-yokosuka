import json
import tempfile
import unittest
from pathlib import Path

from tools.cutscenes.extract_native_aseq_callback_ir import read_native_map


class NativeCallbackIrExtractionTest(unittest.TestCase):
    def test_selects_exact_map_across_chunks_and_escaped_strings(self):
        first = {"disc": 1, "area": "MEND", "entryFunction": "0x100",
                 "functions": ["} , { \"maps\": [ " + "x" * (1024 * 1024)]}
        selected = {"disc": 3, "area": "MEND", "entryFunction": "0x153a0",
                    "functions": [{"id": "0xa0fc", "blocks": []}]}
        with tempfile.TemporaryDirectory(dir="/var/tmp") as directory:
            path = Path(directory) / "source.json"
            path.write_text(json.dumps({"maps": [first, selected]}, indent=2))
            self.assertEqual(read_native_map(path, 3, "mend", "0x153A0"), selected)
            self.assertEqual(read_native_map(path, 1, "MEND", "0x100"), first)
            with self.assertRaisesRegex(RuntimeError, "absent"):
                read_native_map(path, 3, "MEND", "0x999")

    def test_missing_and_truncated_arrays_are_errors(self):
        with tempfile.TemporaryDirectory(dir="/var/tmp") as directory:
            path = Path(directory) / "source.json"
            for source in ['{}', '{\n  "maps": [', '{\n  "maps": [\n    {"disc": 3']:
                path.write_text(source)
                with self.assertRaises((RuntimeError, json.JSONDecodeError)):
                    read_native_map(path, 3, "MEND", "0x1")


if __name__ == "__main__":
    unittest.main()
