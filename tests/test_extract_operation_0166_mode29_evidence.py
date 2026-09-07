import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0166_mode29_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0166_mode29", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0166Mode29EvidenceTest(unittest.TestCase):
    def test_recovers_bounded_poll_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        operation = report["operation"]
        self.assertEqual(operation["counterAddress"], "0x0c224428")
        self.assertEqual(operation["activeDwordAddress"], "0x0c21bd04")
        self.assertEqual(operation["behavior"]["maximumBusyCountExclusive"], 60)
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 82)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
