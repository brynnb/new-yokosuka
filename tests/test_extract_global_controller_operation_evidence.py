import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_global_controller_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_global_controller_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGlobalControllerOperationEvidenceTest(unittest.TestCase):
    def test_recovers_only_exact_selectors_zero_two_and_three(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 558)
        self.assertEqual(inventory["provenCallCount"], 407)
        self.assertEqual(inventory["remainingUnresolvedCallCount"], 84)
        self.assertEqual(inventory["dialogueRegionCallCount"], 87)
        self.assertEqual(
            inventory["dialogueRegionSelectorCounts"],
            {"1": 20, "2": 70, "3": 17, "4": 16, "5": 7},
        )
        self.assertEqual(
            [
                selector["semanticId"]
                for selector in report["operation"]["selectors"]
            ],
            [
                "global-runtime-controller-initialize",
                "global-runtime-controller-reset",
                "global-runtime-controller-status-query",
            ],
        )


if __name__ == "__main__":
    unittest.main()
