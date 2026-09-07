import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_actor_controller_word_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_actor_controller_word_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorControllerWordOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_operation_0x009c_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 631)
        self.assertEqual(inventory["provenCallCount"], 631)
        self.assertEqual(inventory["dialogueRegionCallCount"], 80)
        self.assertEqual(inventory["areaCount"], 50)
        self.assertEqual(
            inventory["dialogueArgumentKindCounts"]["0"],
            {"constant": 39, "frame-field": 38, "scene-field": 3},
        )
        operation = report["operation"]
        self.assertEqual(operation["controllerRecordTag"], "MOTM")
        self.assertEqual(operation["controllerWordOffset"], "0x007c")
        self.assertEqual(operation["controllerWordWidth"], 2)

    def test_recovers_every_authored_operation_0x009d_mode(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["modeControlAllDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 351)
        self.assertEqual(inventory["provenCallCount"], 351)
        self.assertEqual(inventory["dialogueRegionCallCount"], 1)
        self.assertEqual(inventory["areaCount"], 31)
        self.assertEqual(inventory["argumentKindCounts"], {
            "0": {"constant": 313, "frame-field": 38},
            "1": {"constant": 351},
        })
        self.assertEqual(inventory["modeValueCounts"], {
            "0x00000000": 64,
            "0x00000001": 4,
            "0x00000002": 3,
            "0x00000003": 5,
            "0xffffffff": 275,
        })
        operation = report["modeControlOperation"]
        self.assertEqual(operation["controllerFlagMask"], "0x00004000")
        self.assertEqual(operation["modeDwordOffset"], "0x01cc")
        self.assertEqual(
            operation["resetWordOffsets"],
            ["0x0086", "0x0090", "0x009a"],
        )


if __name__ == "__main__":
    unittest.main()
