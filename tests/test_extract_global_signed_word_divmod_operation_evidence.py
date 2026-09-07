import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_global_signed_word_divmod_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_global_signed_word_divmod_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGlobalSignedWordDivmodOperationEvidenceTest(unittest.TestCase):
    def test_recovers_both_authored_signed_divmod_modes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 528)
        self.assertEqual(inventory["dialogueRegionCallCount"], 144)
        self.assertEqual(inventory["modeCounts"], {"0": 201, "1": 327})
        self.assertEqual(
            inventory["dialogueRegionModeCounts"],
            {"0": 51, "1": 93},
        )
        self.assertEqual(
            report["operation"]["sourceWord"]["address"],
            "0x0c22020c",
        )


if __name__ == "__main__":
    unittest.main()
