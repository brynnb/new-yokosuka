import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_indexed_controller_subsystem_evidence.py"
SPEC = importlib.util.spec_from_file_location("indexed_controller_subsystem", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractIndexedControllerSubsystemEvidenceTest(unittest.TestCase):
    def test_recovers_exact_family_and_full_corpus(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["0x0062"]["callCount"], 73)
        self.assertEqual(inventory["0x0064"]["callCount"], 78)
        self.assertEqual(inventory["0x0068"]["callCount"], 29)
        self.assertEqual(inventory["0x0069"]["callCount"], 37)
        self.assertEqual(inventory["0x006a"]["callCount"], 42)
        self.assertEqual(report["operations"]["0x006a"]["vectorOffsets"], [
            "0x28", "0x34",
        ])

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
