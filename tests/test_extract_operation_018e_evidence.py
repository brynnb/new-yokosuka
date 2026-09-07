import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_018e_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_018e", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation018eEvidenceTest(unittest.TestCase):
    def test_recovers_fixed_byte_write_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 124)
        self.assertEqual(inventory["provenCallCount"], 124)
        self.assertEqual(inventory["dialogueRegionCallCount"], 30)
        self.assertEqual(inventory["areaCount"], 20)
        self.assertEqual(inventory["valueCounts"], {"0": 55, "1": 69})
        self.assertEqual(
            inventory["dialogueValueCounts"],
            {"0": 15, "1": 15},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
