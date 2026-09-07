import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_fixo_reset_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_fixo_reset_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFixoResetOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_operation_0x001b_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 470)
        self.assertEqual(inventory["provenCallCount"], 470)
        self.assertEqual(inventory["dialogueRegionCallCount"], 77)
        self.assertEqual(inventory["areaCount"], 47)
        self.assertEqual(
            inventory["dialogueActorArgumentKindCounts"],
            {"constant": 76, "scene-field": 1},
        )
        operation = report["operation"]
        self.assertEqual(operation["recordTag"], "FIXO")
        self.assertEqual(operation["zeroFields"], {
            "floatWords": ["0x18", "0x1c", "0x20"],
            "dwords": ["0x24", "0x28", "0x2c"],
            "words": ["0x30", "0x32"],
        })


if __name__ == "__main__":
    unittest.main()
