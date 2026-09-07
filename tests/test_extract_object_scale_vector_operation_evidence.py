import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_object_scale_vector_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("object_scale_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractObjectScaleVectorOperationEvidenceTest(unittest.TestCase):
    def test_recovers_complete_authored_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 393)
        self.assertEqual(report["allDiscInventory"]["mapCount"], 102)
        self.assertEqual(report["operation"]["nativeContract"]["directObjectOffsets"], [
            "+0x34", "+0x38", "+0x3c",
        ])

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
