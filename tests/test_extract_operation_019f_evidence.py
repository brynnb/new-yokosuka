import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_019f_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_019f", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation019fEvidenceTest(unittest.TestCase):
    def test_recovers_exact_flag_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 74)
        self.assertEqual(inventory["provenCallCount"], 74)
        self.assertEqual(inventory["dialogueRegionCallCount"], 34)
        self.assertEqual(inventory["areaCount"], 13)
        self.assertEqual(inventory["modeCounts"], {"0": 36, "1": 38})
        self.assertEqual(
            inventory["dialogueModeCounts"],
            {"0": 18, "1": 16},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
