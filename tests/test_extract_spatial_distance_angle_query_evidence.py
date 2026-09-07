import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_spatial_distance_angle_query_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "spatial_distance_angle_query", PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractSpatialDistanceAngleQueryEvidenceTest(unittest.TestCase):
    def test_recovers_exact_predicate_and_conservative_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 352)
        self.assertEqual(inventory["provenCallCount"], 289)
        self.assertEqual(inventory["blockedCallCount"], 63)
        self.assertEqual(inventory["areaCount"], 98)
        self.assertEqual(inventory["provenResultComparisonCount"], 261)
        self.assertEqual(report["operation"]["boundaries"], {
            "distance": "inclusive (magnitude <= threshold)",
            "angle": "exclusive (wrapped difference < tolerance)",
        })

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
