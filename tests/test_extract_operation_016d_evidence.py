import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_016d_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_016d", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation016dEvidenceTest(unittest.TestCase):
    def test_recovers_all_five_exact_authored_routes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 1256)
        self.assertEqual(inventory["dialogueRegionCallCount"], 40)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 989, "1": 67, "2": 70, "3": 63, "4": 67},
        )
        self.assertEqual(
            inventory["resultComparisonModeCounts"],
            {"0": 2, "2": 70},
        )
        self.assertEqual(inventory["unresolvedMalformedCallCount"], 2)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
