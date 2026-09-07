import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0194_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0194", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0194EvidenceTest(unittest.TestCase):
    def test_recovers_exact_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 112)
        self.assertEqual(inventory["provenCallCount"], 112)
        self.assertEqual(inventory["dialogueRegionCallCount"], 28)
        self.assertEqual(inventory["areaCount"], 14)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 20, "1": 22, "2": 70},
        )
        self.assertEqual(
            inventory["dialogueModeCounts"],
            {"0": 3, "1": 11, "2": 14},
        )
        self.assertEqual(
            inventory["resultComparisonCountsByMode"],
            {"2": 20},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
