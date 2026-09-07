import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_controller_input_query_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("controller_query_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ControllerInputQueryOperationEvidenceTest(unittest.TestCase):
    def test_report_matches_native_controller_query(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["recordCount"], 4)
        self.assertEqual(report["operation"]["recordStride"], 20)
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 35)
        self.assertEqual(
            report["allDiscInventory"]["op02Calls"][0]["fieldSelector"],
            0,
        )


if __name__ == "__main__":
    unittest.main()
