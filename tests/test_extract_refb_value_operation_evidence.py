import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_refb_value_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_refb_value_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractRefbValueOperationEvidenceTest(unittest.TestCase):
    def test_recovers_all_well_formed_refb_writes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 1326)
        self.assertEqual(inventory["provenCallCount"], 1324)
        self.assertEqual(inventory["unresolvedMalformedCallCount"], 2)
        self.assertEqual(inventory["dialogueRegionCallCount"], 138)
        self.assertEqual(
            inventory["constantValueCounts"],
            {"0": 158, "1": 736, "2": 427, "3": 2},
        )
        self.assertEqual(report["operation"]["recordTag"], "REFB")
        self.assertEqual(
            report["operation"]["zeroClearDwordOffset"],
            "record+0x18",
        )


if __name__ == "__main__":
    unittest.main()
