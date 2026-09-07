import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_operation_0118_evidence.py"
SPEC = importlib.util.spec_from_file_location("extract_operation_0118", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0118EvidenceTest(unittest.TestCase):
    def test_recovers_all_exact_three_argument_routes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 433)
        self.assertEqual(inventory["compiledCallCount"], 431)
        self.assertEqual(inventory["uncompiledZeroArgumentCallCount"], 2)
        self.assertEqual(inventory["dialogueRegionCallCount"], 2)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 88, "1": 114, "2": 228, "3": 1},
        )


if __name__ == "__main__":
    unittest.main()
