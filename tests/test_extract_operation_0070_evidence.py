import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0070_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0070_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class Operation0070EvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )

    def test_exact_momt_vector_slot_contract(self):
        operation = self.report["operation"]
        self.assertEqual(operation["handlerAddress"], "0x0c15761a")
        self.assertEqual(operation["recordTag"], "MOMT")
        self.assertEqual(operation["slotSelectors"], {
            "0": 0, "3": 1, "6": 2, "11": 3,
            "17": 4, "21": 5, "26": 6, "33": 7,
        })
        self.assertEqual(operation["vectorStorage"]["baseOffset"], "0x0368")
        self.assertEqual(operation["vectorStorage"]["strideBytes"], 12)
        self.assertIn("flags & 0x40000000", operation["flagRoutes"][0]["when"])

    def test_complete_corpus_and_op00_slice(self):
        inventory = self.report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 53)
        self.assertEqual(len(inventory["areaCounts"]), 20)
        self.assertEqual(inventory["flagCounts"], {
            "0x38000000": 15,
            "0x39000000": 19,
            "0x78000000": 19,
        })
        self.assertEqual(inventory["op00CallFileOffsets"], [
            "0x9d28", "0x9dce", "0xaa9c", "0xab42",
        ])
        self.assertEqual(inventory["resultComparisonCount"], 0)
        self.assertEqual(inventory["resultTargetCount"], 0)


if __name__ == "__main__":
    unittest.main()
