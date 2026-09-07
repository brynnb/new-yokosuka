import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_actor_momt_scaled_offset_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("actor_momt_scaled_offset", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorMomtScaledOffsetOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_mode_zero_path_and_call_subset(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x002a")
        self.assertEqual(report["operation"]["provenMode"], 0)
        self.assertEqual(report["operation"]["recordTag"], "MOMT")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 112)
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 99)
        self.assertEqual(
            report["allDiscInventory"]["provenDialogueRegionCallCount"],
            57,
        )
        self.assertEqual(
            report["allDiscInventory"]["unresolvedModeOneCallCount"],
            13,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
