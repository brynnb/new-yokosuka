import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_face_record_control_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_face_record_control_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFaceRecordControlOperationEvidenceTest(unittest.TestCase):
    def test_recovers_all_mode_specific_face_record_writes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 914)
        self.assertEqual(inventory["dialogueRegionCallCount"], 179)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 507, "1": 2, "2": 405},
        )
        self.assertEqual(
            inventory["dialogueRegionModeCounts"],
            {"0": 76, "2": 103},
        )
        self.assertEqual(report["operation"]["recordTag"], "FACE")
        self.assertEqual(
            report["operation"]["recordWrites"]["modeByteOffset"],
            "record+0x52",
        )


if __name__ == "__main__":
    unittest.main()
