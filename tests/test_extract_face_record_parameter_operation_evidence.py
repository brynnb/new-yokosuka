import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_face_record_parameter_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_face_record_parameter_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFaceRecordParameterOperationEvidenceTest(unittest.TestCase):
    def test_recovers_all_guarded_face_parameter_writes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 1013)
        self.assertEqual(inventory["dialogueRegionCallCount"], 160)
        self.assertEqual(inventory["areaCount"], 64)
        self.assertEqual(
            inventory["argumentKindCounts"]["2"],
            {"constant": 1013},
        )
        self.assertEqual(
            report["operation"]["nativeContract"]["stateTableAddress"],
            "0x0c2200f8",
        )
        self.assertEqual(
            [write["offset"] for write in report["operation"]["recordWrites"]],
            ["FACE+0x30", "FACE+0x2c", "FACE+0x2e", "FACE+0x45"],
        )


if __name__ == "__main__":
    unittest.main()
