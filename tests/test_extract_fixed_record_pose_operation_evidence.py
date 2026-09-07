import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_fixed_record_pose_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("fixed_record_pose", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FixedRecordPoseEvidenceTest(unittest.TestCase):
    def test_report_matches_pinned_native_sources(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x00ae")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 47)
        self.assertEqual(report["allDiscInventory"]["areaCount"], 6)
        self.assertEqual(report["allDiscInventory"]["recordIndices"], list(range(11)))


if __name__ == "__main__":
    unittest.main()
