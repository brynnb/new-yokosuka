import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_named_resource_residency_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_named_resource_residency_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractNamedResourceResidencyOperationEvidenceTest(unittest.TestCase):
    def test_recovers_both_authored_modes_and_pointer_kinds(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 1018)
        self.assertEqual(inventory["dialogueRegionCallCount"], 336)
        self.assertEqual(inventory["modeCounts"], {"0": 319, "1": 699})
        self.assertEqual(
            inventory["resourceArgumentKindCounts"],
            {"frame-field": 10, "static-pointer": 1008},
        )


if __name__ == "__main__":
    unittest.main()
