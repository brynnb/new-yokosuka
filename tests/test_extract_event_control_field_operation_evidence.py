import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_event_control_field_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_event_control_field_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractEventControlFieldOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_operation_0x0031_query(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 727)
        self.assertEqual(inventory["provenCallCount"], 727)
        self.assertEqual(inventory["dialogueRegionCallCount"], 71)
        self.assertEqual(inventory["areaCount"], 59)
        self.assertEqual(
            inventory["dialogueSelectorCounts"],
            {"0": 38, "1": 33},
        )
        routes = report["operation"]["fieldRoutes"]
        self.assertEqual(len(routes), 8)
        self.assertEqual(
            [(route["offset"], route["width"]) for route in routes],
            [
                ("0x04", 2),
                ("0x08", 2),
                ("0x0a", 2),
                ("0x0c", 1),
                ("0x0d", 1),
                ("0x0e", 1),
                ("0x0f", 1),
                ("0x12", 2),
            ],
        )


if __name__ == "__main__":
    unittest.main()
