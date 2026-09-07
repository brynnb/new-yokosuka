import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_indexed_controller_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("indexed_controller", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractIndexedControllerOperationEvidenceTest(unittest.TestCase):
    def test_recovers_eight_exact_selectors(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(
            report["operation"]["provenSelectors"],
            [0, 2, 4, 5, 6, 8, 10, 11],
        )
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 840)
        self.assertEqual(
            report["allDiscInventory"]["provenDialogueRegionCallCount"],
            57,
        )
        self.assertEqual(report["allDiscInventory"]["unresolvedCallCount"], 47)
        self.assertEqual(
            report["allDiscInventory"]["argumentKindCounts"]["2"]
                ["frame-field"],
            20,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
