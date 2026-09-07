import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_global_controller_byte_selection_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_global_controller_byte_selection_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGlobalControllerByteSelectionEvidenceTest(unittest.TestCase):
    def test_recovers_only_exact_selector_zero_calls(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 482)
        self.assertEqual(inventory["provenCallCount"], 476)
        self.assertEqual(inventory["remainingUnresolvedCallCount"], 6)
        self.assertEqual(inventory["dialogueRegionCallCount"], 75)
        self.assertEqual(
            inventory["selectorCounts"],
            {"0": 476, "1": 1, "5": 2, "7": 3},
        )
        self.assertEqual(inventory["secondaryValueCounts"], {"0": 476})


if __name__ == "__main__":
    unittest.main()
