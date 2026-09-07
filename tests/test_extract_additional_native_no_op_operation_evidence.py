import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_additional_native_no_op_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("additional_no_ops", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class AdditionalNativeNoOpEvidenceTest(unittest.TestCase):
    def test_recovers_every_additional_exact_no_op(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(
            [(entry["operationHex"], entry["authoredCallCount"])
             for entry in report["operations"]],
            [("0x00cd", 8), ("0x0141", 6), ("0x0182", 8)],
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
