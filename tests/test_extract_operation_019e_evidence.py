#!/usr/bin/env python3

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_019e_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_019e", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation019eEvidenceTest(unittest.TestCase):
    def test_all_authored_routes_match_executable_evidence(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((
                ROOT / ".disc-work/dialogue/native-event-ir.json"
            ).read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 569)
        self.assertEqual(inventory["modeCounts"], {"2": 15, "4": 554})
        self.assertEqual(inventory["interleaved019cResultCallCount"], 56)
        self.assertEqual(inventory["sentinelScheduleCount"], 490)


if __name__ == "__main__":
    unittest.main()
