import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_fixed_global_dword_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_fixed_global_dword_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFixedGlobalDwordOperationEvidenceTest(unittest.TestCase):
    def test_recovers_only_exact_selector_four_and_five_writes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 558)
        self.assertEqual(inventory["provenCallCount"], 67)
        self.assertEqual(inventory["remainingUnresolvedCallCount"], 491)
        self.assertEqual(inventory["dialogueRegionCallCount"], 23)
        self.assertEqual(
            inventory["dialogueRegionSelectorCounts"],
            {"4": 16, "5": 7},
        )
        self.assertEqual(
            report["operation"]["selectors"],
            [
                {
                    "selector": 4,
                    "address": "0x0c22478c",
                    "width": 4,
                    "result": -1,
                },
                {
                    "selector": 5,
                    "address": "0x0c22483c",
                    "width": 4,
                    "result": -1,
                },
            ],
        )


if __name__ == "__main__":
    unittest.main()
