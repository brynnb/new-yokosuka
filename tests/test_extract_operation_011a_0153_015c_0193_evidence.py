#!/usr/bin/env python3
"""Regression tests for the independent OP00 native-control evidence."""

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_011a_0153_015c_0193_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_015x_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class EvidenceTest(unittest.TestCase):
    def test_exact_executable_and_full_inventory(self) -> None:
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()),
        )
        self.assertEqual(len(report["operations"]), 4)
        self.assertEqual(
            report["allDiscInventory"]["0x0193"]["authoredCallCount"],
            387,
        )


if __name__ == "__main__":
    unittest.main()
