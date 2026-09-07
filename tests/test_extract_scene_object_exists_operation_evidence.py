import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_scene_object_exists_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_scene_object_exists_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractSceneObjectExistsEvidenceTest(unittest.TestCase):
    def test_recovers_mode_one_contract_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x0166")
        self.assertEqual(report["operation"]["mode"], 1)
        self.assertEqual(report["operation"]["returnValues"], [0, 1])
        self.assertEqual(report["allDiscInventory"]["callCount"], 1181)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            279,
        )

    def test_other_modes_are_not_selected(self):
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "functions": [{
                    "id": "0x100",
                    "dialogueRegion": None,
                    "blocks": [{
                        "actions": [{
                            "kind": "engineOperation",
                            "operationId": 358,
                            "callFileOffset": "0x104",
                            "arguments": [
                                {"kind": "constant", "value": 2},
                                {"kind": "constant", "value": 0},
                            ],
                        }],
                    }],
                }],
            }],
        }
        self.assertEqual(MODULE.mode_one_calls(event_ir), [])


if __name__ == "__main__":
    unittest.main()
