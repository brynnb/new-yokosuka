import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_actor_field_7c_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("extract_actor_field_7c", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorField7cOperationEvidenceTest(unittest.TestCase):
    def test_recovers_only_exact_two_argument_routes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 435)
        self.assertEqual(inventory["compiledTwoArgumentCallCount"], 402)
        self.assertEqual(inventory["uncompiledOtherShapeCount"], 33)
        self.assertEqual(inventory["dialogueRegionCallCount"], 6)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 110, "1": 2, "2": 16, "4": 265, "8": 3, "9": 3, "11": 3},
        )


if __name__ == "__main__":
    unittest.main()
