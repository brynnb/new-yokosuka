import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_actor_momt_float_pair_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("actor_momt_float_pair", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorMomtFloatPairOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_native_contract_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x004e")
        self.assertEqual(
            report["operation"]["floatWordOffsets"],
            ["0x00f0", "0x0128"],
        )
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 701)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            67,
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
