import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0128_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0128", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0128EvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.executable = MODULE.DEFAULT_EXECUTABLE.read_bytes()
        cls.event_ir = json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8"))

    def test_recovers_all_authored_preset_routes(self):
        report = MODULE.build_report(self.executable, self.event_ir)
        self.assertEqual(report["allDiscInventory"], {
            "authoredCallCount": 82,
            "areaCount": 70,
            "presetIndexCounts": {"0": 80, "1": 2},
            "dialogueRegionCallCount": 0,
            "resultConsumerCount": 0,
        })
        self.assertEqual(report["operation"]["recordStrideBytes"], 80)
        self.assertEqual(report["operation"]["nestedTags"], ["FOG ", "BACK"])

    def test_inventory_drift_fails_closed(self):
        changed = copy.deepcopy(self.event_ir)
        call = next(
            action
            for item in changed["maps"]
            for function in item["functions"]
            for block in function["blocks"]
            for action in block["actions"]
            if action.get("operationId") == 0x0128
        )
        call["operationId"] = 0xffff
        with self.assertRaisesRegex(ValueError, "authored inventory changed"):
            MODULE.build_report(self.executable, changed)


if __name__ == "__main__":
    unittest.main()
