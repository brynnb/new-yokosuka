import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_001c_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_001c", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation001cEvidenceTest(unittest.TestCase):
    def test_recovers_four_exact_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 1361)
        self.assertEqual(inventory["provenCallCount"], 1360)
        self.assertEqual(inventory["unresolvedDynamicFlagCount"], 1)
        self.assertEqual(inventory["dialogueRegionCallCount"], 37)
        self.assertEqual(inventory["flagCounts"], {
            "0x00000000": 911,
            "0x02000000": 60,
            "0x40000000": 152,
            "0x42000000": 237,
        })
        self.assertEqual(inventory["dialogueFlagCounts"], {
            "0x00000000": 20,
            "0x42000000": 17,
        })
        self.assertEqual(inventory["exactAddressDestinationCount"], 1340)
        self.assertEqual(inventory["resolvedPointerDestinationCount"], 20)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
