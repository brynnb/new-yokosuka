import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0166_mode28_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0166_mode28", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0166Mode28EvidenceTest(unittest.TestCase):
    def test_recovers_exact_global_clear_and_all_disc_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["globalAddress"], "0x0c224428")
        self.assertEqual(report["operation"]["writtenValue"], 0)
        self.assertEqual(report["operation"]["returnValue"], 0)
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 85)
        self.assertEqual(report["allDiscInventory"]["resultTargetCount"], 0)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
