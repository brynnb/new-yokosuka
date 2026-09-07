import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_bounded_random_integer_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_bounded_random_integer_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractBoundedRandomIntegerOperationEvidenceTest(unittest.TestCase):
    def test_build_report_recovers_proven_mode_inventories(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x004f")
        self.assertEqual(report["operation"]["mode"], 6)
        self.assertEqual(report["allDiscInventory"]["callCount"], 248)
        self.assertEqual(
            report["operation"]["sharedRandomFunction"],
            "0x0c1ce210",
        )
        self.assertEqual(
            report["floatToIntegerTruncation"]["mode"],
            4,
        )
        self.assertEqual(
            report["modeFourAllDiscInventory"]["callCount"],
            804,
        )
        self.assertEqual(
            report["binaryAngleFromFloatPair"]["mode"],
            5,
        )
        self.assertEqual(
            report["modeFiveAllDiscInventory"]["callCount"],
            300,
        )

    def test_other_modes_are_not_selected(self):
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "functions": [{
                    "id": "0x10",
                    "blocks": [{
                        "actions": [{
                            "kind": "engineOperation",
                            "operationId": 79,
                            "arguments": [
                                {"kind": "constant", "value": 5},
                                {"kind": "constant", "value": 10},
                            ],
                            "callFileOffset": "0x12",
                        }],
                    }],
                }],
            }],
        }
        self.assertEqual(MODULE.mode_six_calls(event_ir), [])
        self.assertEqual(MODULE.mode_calls(event_ir, 4), [])


if __name__ == "__main__":
    unittest.main()
