import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_object_link_field_evidence.py"
SPEC = importlib.util.spec_from_file_location("object_link_field", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractObjectLinkFieldEvidenceTest(unittest.TestCase):
    def test_recovers_complete_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 887)
        self.assertEqual(inventory["provenCallCount"], 880)
        self.assertEqual(inventory["malformedCallCount"], 7)
        self.assertEqual(inventory["dialogueRegionCallCount"], 27)
        self.assertEqual(inventory["malformedDialogueRegionCallCount"], 0)
        self.assertEqual(inventory["areaCount"], 43)
        self.assertEqual(inventory["targetRouteCounts"], {
            "null": 297,
            "indexedSlot": 19,
            "resolvedObject": 277,
            "runtime": 287,
        })
        self.assertEqual(
            inventory["observedConstantSlotCounts"],
            {"0": 3, "31": 16},
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
