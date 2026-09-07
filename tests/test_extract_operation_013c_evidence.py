import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_013c_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_013c", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation013cEvidenceTest(unittest.TestCase):
    def test_recovers_ten_exact_routes_and_every_dialogue_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(
            report["allDiscInventory"]["provenCallCount"],
            1701,
        )
        self.assertEqual(
            report["allDiscInventory"]["provenDialogueRegionCallCount"],
            43,
        )
        self.assertEqual(
            report["allDiscInventory"]["unresolvedCallCount"],
            50,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
