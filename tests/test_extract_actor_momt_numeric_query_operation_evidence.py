import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_actor_momt_numeric_query_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("actor_momt_numeric_query", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorMomtNumericQueryOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_helper_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x002b")
        self.assertEqual(report["operation"]["recordFloatWordOffsets"], {
            "base": "0x00f0",
            "control": "0x00dc",
        })
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 622)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            66,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
