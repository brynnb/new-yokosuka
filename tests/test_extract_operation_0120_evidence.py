import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0120_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0120", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0120EvidenceTest(unittest.TestCase):
    def test_recovers_three_exact_record_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        operation = report["operation"]
        inventory = report["allDiscInventory"]
        self.assertEqual(operation["recordCount"], 32)
        self.assertEqual(operation["recordStride"], 20)
        self.assertEqual(operation["writtenFieldOffset"], 8)
        self.assertEqual(
            report["schema"],
            "new-yokosuka-operation-0120-evidence-v2",
        )
        self.assertEqual(
            operation["clipLayerContract"]["resourceTag"],
            "CLIP",
        )
        self.assertEqual(
            operation["nativeContract"]["mapLayerRecordTable"],
            "0x0c21c768",
        )
        self.assertEqual(inventory["authoredCallCount"], 220)
        self.assertEqual(inventory["provenCallCount"], 220)
        self.assertEqual(inventory["dialogueRegionCallCount"], 37)
        self.assertEqual(
            inventory["modeCounts"],
            {"0": 173, "1": 35, "2": 12},
        )
        self.assertEqual(
            inventory["valueCounts"],
            {"0": 111, "1": 107, "4294967295": 2},
        )
        self.assertEqual(
            inventory["dialogueValueCounts"],
            {"0": 19, "1": 18},
        )
        self.assertEqual(inventory["resultComparisonCount"], 3)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
