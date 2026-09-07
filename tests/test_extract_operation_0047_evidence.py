import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0047_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0047", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0047EvidenceTest(unittest.TestCase):
    def test_recovers_all_exact_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c15feae")
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 102)
        self.assertEqual(inventory["dialogueRegionCallCount"], 0)
        self.assertEqual(inventory["areaCount"], 7)
        self.assertEqual(inventory["resultTargetCount"], 25)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 25, "1": 25, "2": 4, "3": 4, "6": 7,
             "7": 4, "10": 4, "13": 4, "15": 25},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
