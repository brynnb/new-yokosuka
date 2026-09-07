import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_spatial_bounds_query_evidence.py"
SPEC = importlib.util.spec_from_file_location("spatial_bounds_query", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractSpatialBoundsQueryEvidenceTest(unittest.TestCase):
    def test_recovers_complete_query_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 213)
        self.assertEqual(inventory["provenCallCount"], 213)
        self.assertEqual(inventory["dialogueRegionCallCount"], 27)
        self.assertEqual(inventory["areaCount"], 39)
        self.assertEqual(inventory["resultComparisonCount"], 92)
        self.assertEqual(inventory["dialogueResultComparisonCount"], 10)
        self.assertEqual(
            inventory["translationObjectCounts"],
            {"zero": 207, "POK2": 3, "HAKO": 3},
        )
        self.assertEqual(
            report["source"]["liveEmulatorEvidence"],
            "tools/evidence/live-spatial-bounds-emulator-evidence.json",
        )
        self.assertTrue(MODULE.LIVE_EMULATOR_EVIDENCE.is_file())

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
