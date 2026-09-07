import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_light_preset_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("light_preset_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class LightPresetOperationEvidenceTest(unittest.TestCase):
    def test_report_matches_native_lght_selector_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["slotCount"], 24)
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 317)
        self.assertEqual(
            report["allDiscInventory"]["argumentKinds"],
            {"constant": 311, "frame-field": 6},
        )
        self.assertEqual(
            [call["presetIndex"] for call in report["allDiscInventory"]["op02Calls"]],
            [1, 0, 0],
        )


if __name__ == "__main__":
    unittest.main()
