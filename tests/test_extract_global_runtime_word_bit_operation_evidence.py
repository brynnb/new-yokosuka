import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_global_runtime_word_bit_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_global_runtime_word_bit_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGlobalRuntimeWordBitOperationEvidenceTest(unittest.TestCase):
    def test_recovers_both_authored_modes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["wordAddress"], "0x0c20c3d4")
        self.assertEqual(report["operation"]["mask"], "0x00000020")
        self.assertEqual(
            report["allDiscInventory"]["modeCounts"],
            {"0": 576, "1": 570},
        )
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            261,
        )


if __name__ == "__main__":
    unittest.main()
