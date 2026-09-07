import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_01c7_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_01c7", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation01c7EvidenceTest(unittest.TestCase):
    def test_recovers_every_route_and_all_authored_calls(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x01c7")
        self.assertEqual(len(report["operation"]["routes"]), 4)
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 690)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            62,
        )
        self.assertEqual(
            report["allDiscInventory"]["routeCounts"],
            {
                "mode-0": 55,
                "mode-1": 55,
                "mode-2": 263,
                "mode-3-submode-0": 120,
                "mode-3-submode-1": 195,
                "mode-3-submode-2": 1,
                "mode-3-submode-3": 1,
            },
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
