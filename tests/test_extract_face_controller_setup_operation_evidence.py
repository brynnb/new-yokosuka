import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_face_controller_setup_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("face_controller_setup", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FaceControllerSetupEvidenceTest(unittest.TestCase):
    def test_report_matches_pinned_native_sources(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((
                ROOT / ".disc-work/dialogue/native-event-ir.json"
            ).read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x0094")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 511)
        self.assertEqual(report["allDiscInventory"]["areaCount"], 43)
        self.assertIn("60, 70, 80, or 90", report["operation"]["provenBehavior"])


if __name__ == "__main__":
    unittest.main()
