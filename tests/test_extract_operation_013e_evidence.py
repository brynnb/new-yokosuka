import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_013e_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_013e", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation013eEvidenceTest(unittest.TestCase):
    def test_recovers_both_modes_and_all_authored_calls(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["slotCount"], 70)
        self.assertEqual(report["allDiscInventory"]["callCount"], 530)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            25,
        )
        self.assertEqual(
            report["allDiscInventory"]["modeCounts"],
            {"0": 306, "1": 224},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
