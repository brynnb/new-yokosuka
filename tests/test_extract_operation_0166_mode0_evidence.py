import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0166_mode0_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0166_mode0", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0166Mode0EvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.executable = MODULE.DEFAULT_EXECUTABLE.read_bytes()
        cls.event_ir = json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8"))

    def test_recovers_every_authored_scheduler_bootstrap(self):
        report = MODULE.build_report(self.executable, self.event_ir)
        self.assertEqual(report["allDiscInventory"], {
            "authoredCallCount": 126,
            "areaCount": 94,
            "discCallCounts": {"1": 39, "2": 44, "3": 43},
            "areaTagMatchesOwningAreaCount": 125,
            "dialogueRegionCallCount": 0,
            "resultConsumerCount": 0,
        })
        self.assertEqual(
            report["operation"]["dependencies"]["indexName"],
            "HUMANS.idx",
        )
        self.assertEqual(
            report["operation"]["dependencies"]["indexType"],
            "0x4a424f4d",
        )

    def test_authored_shape_drift_fails_closed(self):
        changed = copy.deepcopy(self.event_ir)
        call = next(
            action
            for item in changed["maps"]
            for function in item["functions"]
            for block in function["blocks"]
            for action in block["actions"]
            if (
                action.get("operationId") == 0x0166
                and action.get("arguments", [{}])[0].get("value") == 0
            )
        )
        call["arguments"][1]["kind"] = "constant"
        with self.assertRaisesRegex(ValueError, "authored inventory changed"):
            MODULE.build_report(self.executable, changed)


if __name__ == "__main__":
    unittest.main()
