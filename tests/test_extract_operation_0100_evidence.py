import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0100_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0100", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0100EvidenceTest(unittest.TestCase):
    def test_recovers_exact_yd01_routes_and_pins_full_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c15f74c")
        self.assertEqual(report["operation"]["slotCount"], 16)
        self.assertEqual(report["operation"]["controllerSelector"], 0)
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 557)
        self.assertEqual(report["allDiscInventory"]["areaCount"], 18)
        self.assertEqual(report["yd01Inventory"]["authoredCallCount"], 9)
        self.assertEqual(
            set(report["operation"]["yd01Routes"]),
            {"0", "1", "2", "3", "7", "8", "9", "11", "12"},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
