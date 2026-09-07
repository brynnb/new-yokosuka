import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_ccow_mask_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_ccow_mask_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractCcowMaskOperationEvidenceTest(unittest.TestCase):
    def test_recovers_all_ten_authored_ccow_mask_modes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 1182)
        self.assertEqual(inventory["dialogueRegionCallCount"], 142)
        self.assertEqual(
            inventory["dialogueRegionModeCounts"],
            {"1": 51, "2": 78, "3": 3, "4": 6, "6": 4},
        )
        self.assertEqual(
            [mode["action"] for mode in report["operation"]["modes"]],
            [
                "set",
                "clear",
                "set",
                "clear",
                "set",
                "clear",
                "query",
                "query",
                "set",
                "clear",
            ],
        )
        self.assertEqual(report["operation"]["recordTag"], "CCOW")
        fixed = report["fixedBitAllDiscInventory"]
        self.assertEqual(fixed["callCount"], 311)
        self.assertEqual(fixed["dialogueRegionCallCount"], 9)
        self.assertEqual(fixed["modeCounts"], {"0": 8, "1": 189, "2": 114})
        self.assertEqual(
            [mode["action"] for mode in report["fixedBitOperation"]["modes"]],
            ["no-op", "set", "clear"],
        )


if __name__ == "__main__":
    unittest.main()
