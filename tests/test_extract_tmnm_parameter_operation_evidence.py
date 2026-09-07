import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_tmnm_parameter_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("tmnm_parameter", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractTmnmParameterOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_complete_call_and_dialogue_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 177)
        self.assertEqual(inventory["provenDialogueRegionCallCount"], 41)
        self.assertEqual(inventory["unresolvedCallCount"], 1)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
