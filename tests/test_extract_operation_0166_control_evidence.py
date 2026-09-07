import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0166_control_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0166_control", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0166ControlEvidenceTest(unittest.TestCase):
    def test_recovers_ten_exact_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 3085)
        self.assertEqual(inventory["provenCallCount"], 1479)
        self.assertEqual(inventory["dialogueRegionCallCount"], 38)
        self.assertEqual(inventory["modeArgumentCountCounts"], {
            "2/2": 462,
            "3/1": 43,
            "4/3": 266,
            "5/2": 215,
            "6/2": 149,
            "7/2": 128,
            "8/2": 54,
            "13/3": 40,
            "18/1": 108,
            "27/2": 14,
        })
        self.assertEqual(
            inventory["dialogueModeCounts"],
            {
                "2": 11,
                "4": 6,
                "5": 6,
                "6": 3,
                "7": 3,
                "8": 3,
                "13": 3,
                "18": 3,
            },
        )
        self.assertEqual(inventory["resultComparisonCount"], 245)
        self.assertEqual(inventory["resultTargetCount"], 227)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
