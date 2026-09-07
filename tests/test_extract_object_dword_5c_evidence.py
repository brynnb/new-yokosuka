import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_object_dword_5c_evidence.py"
SPEC = importlib.util.spec_from_file_location("object_dword_5c", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractObjectDword5cEvidenceTest(unittest.TestCase):
    def test_recovers_complete_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 332)
        self.assertEqual(inventory["provenCallCount"], 332)
        self.assertEqual(inventory["dialogueRegionCallCount"], 25)
        self.assertEqual(inventory["areaCount"], 102)
        self.assertEqual(
            inventory["constantCommandCounts"],
            {"0": 170, "1": 161},
        )
        self.assertEqual(
            inventory["dialogueCommandCounts"],
            {"0": 12, "1": 13},
        )
        low_flags = report["lowFlagOperation"]
        self.assertEqual(low_flags["operationHex"], "0x004d")
        self.assertEqual(
            low_flags["allDiscInventory"]["authoredCallCount"],
            142,
        )
        self.assertEqual(
            low_flags["allDiscInventory"]["authoredCommandCounts"],
            {"1": 142},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
