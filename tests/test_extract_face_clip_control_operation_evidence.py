import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_face_clip_control_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("face_clip_control", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFaceClipControlOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_record_writes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 1066)
        self.assertEqual(inventory["dialogueRegionCallCount"], 38)
        self.assertEqual(inventory["areaCount"], 35)
        self.assertEqual(inventory["unresolvedMalformedCallCount"], 1)
        contract = report["operation"]["recordContract"]
        self.assertEqual(
            [write["offset"] for write in contract["faceWrites"]],
            ["0x2c", "0x2e", "0x45", "0x4a"],
        )
        self.assertEqual(
            [write["offset"] for write in contract["clipWrites"]],
            ["0x10", "0x16", "0x1c"],
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
