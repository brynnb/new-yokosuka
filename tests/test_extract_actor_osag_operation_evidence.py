#!/usr/bin/env python3

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class ActorOsagOperationEvidenceTests(unittest.TestCase):
    def test_committed_report_preserves_exact_native_contract(self):
        report = json.loads((
            ROOT / "tools/evidence/actor-osag-operation-evidence.json"
        ).read_text())
        operation = report["operation"]
        inventory = report["allDiscInventory"]
        self.assertEqual(operation["handlerAddress"], "0x0c131ab6")
        self.assertEqual(operation["argumentCount"], 1)
        self.assertEqual(operation["osagNodeRoute"], {
            "recordTag": "OSAG",
            "headPointerOffset": "0x01f0",
            "nodeStateByteOffset": "0x0f",
            "nodeStatePreserveMask": "0x0f",
            "nodeStateSetMask": "0x80",
            "nextNodePointerOffset": "0x0104",
        })
        self.assertEqual(inventory["authoredCallCount"], 368)
        self.assertEqual(inventory["provenCallCount"], 368)
        self.assertEqual(inventory["dialogueRegionCallCount"], 69)
        self.assertEqual(inventory["areaCount"], 43)


if __name__ == "__main__":
    unittest.main()
