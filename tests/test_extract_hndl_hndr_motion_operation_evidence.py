import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_hndl_hndr_motion_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_hndl_hndr_motion_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractHndlHndrMotionOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_shared_motion_contract_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        request = report["operations"]["request"]
        control = report["operations"]["control"]
        self.assertEqual(request["argumentCount"], 9)
        self.assertEqual(
            request["fields"]["motionSelector"],
            "argument two signed low word",
        )
        self.assertIn("0", control["modes"])
        self.assertIn("1", control["modes"])
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["request"]["callCount"], 331)
        self.assertEqual(inventory["request"]["areaCount"], 40)
        self.assertEqual(inventory["control"]["callCount"], 57)
        self.assertEqual(inventory["control"]["areaCount"], 15)
        self.assertEqual(inventory["control"]["constantModeCounts"], {
            "0": 50,
            "1": 7,
        })
        self.assertEqual(inventory["op00RequestCount"], 4)
        self.assertEqual(inventory["op00ControlCount"], 16)


if __name__ == "__main__":
    unittest.main()
