import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_refb_vector_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("refb_vector", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractRefbVectorOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_record_write_and_all_calls(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x015b")
        self.assertEqual(report["operation"]["recordTag"], "REFB")
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 605)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            58,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
