#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_fixo_attachment_operation_evidence",
    ROOT / "tools/scripting/operations/extract_fixo_attachment_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FixoAttachmentOperationEvidenceTests(unittest.TestCase):
    def test_committed_report_preserves_exact_native_contract(self):
        report = json.loads((
            ROOT / "tools/evidence/fixo-attachment-operation-evidence.json"
        ).read_text())
        operation = report["operation"]
        inventory = report["allDiscInventory"]
        self.assertEqual(operation["handlerAddress"], "0x0c1577fe")
        self.assertEqual(operation["argumentCount"], 5)
        self.assertEqual(
            [item["offset"] for item in operation["fieldWrites"]],
            ["0x00", "0x0c", "0x18", "0x24", "0x30", "0x30", "0x4c", "0x50"],
        )
        self.assertEqual(inventory["authoredCallCount"], 569)
        self.assertEqual(inventory["provenCallCount"], 563)
        self.assertEqual(inventory["incompleteCallCount"], 6)
        self.assertEqual(inventory["dialogueRegionCallCount"], 70)
        self.assertEqual(inventory["areaCount"], 51)


if __name__ == "__main__":
    unittest.main()
