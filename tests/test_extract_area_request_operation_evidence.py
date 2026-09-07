import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_area_request_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("area_request_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class AreaRequestOperationEvidenceTest(unittest.TestCase):
    def test_report_matches_native_writer_and_authored_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 15)
        self.assertEqual(report["allDiscInventory"]["areaCount"], 8)
        self.assertEqual(
            [call["words"][3] for call in report["allDiscInventory"]["op02Calls"]],
            [49, 0],
        )
        self.assertEqual(
            report["operation"]["pendingFlag"],
            {"offset": "0xcc", "orMask": "0x00000001"},
        )


if __name__ == "__main__":
    unittest.main()
