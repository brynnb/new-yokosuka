#!/usr/bin/env python3
"""Regression tests for the native presentation-controller family evidence."""

from __future__ import annotations

import copy
import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "tools/scripting/operations/extract_native_presentation_controller_family_evidence.py"
SPEC = importlib.util.spec_from_file_location("presentation_controller_evidence", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativePresentationControllerFamilyEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.executable = (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes()
        cls.event_ir = json.loads(
            (ROOT / ".disc-work/dialogue/native-event-ir.json").read_text(
                encoding="utf-8"
            )
        )

    def test_report_covers_every_op00_call(self) -> None:
        report = MODULE.build_report(self.executable, self.event_ir)
        self.assertEqual(report["summary"], {
            "authoredCallCount": 1163,
            "supportedCallCount": 950,
            "unresolvedCallCount": 213,
            "op00CallCount": 56,
            "op00UnresolvedCallCount": 0,
        })
        operations = {
            item["operationHex"]: item for item in report["operations"]
        }
        self.assertEqual(
            operations["0x0178"]["inventory"]["op00ModeCounts"],
            {"1": 2, "6": 5, "7": 14, "10": 1},
        )
        self.assertTrue(next(
            route for route in operations["0x0178"]["routes"]
            if route["mode"] == 6
        )["returnsHandle"])
        operation_0179 = operations["0x0179"]
        self.assertEqual(operation_0179["inventory"]["supportedCallCount"], 278)
        self.assertEqual(operation_0179["inventory"]["unresolvedCallCount"], 0)
        mode_38 = next(
            route for route in operation_0179["routes"]
            if route["mode"] == 38
        )
        self.assertEqual(mode_38["helperAddresses"], [
            "0x0c1bb738", "0x0c1bba4a", "0x0c1bbd6c",
        ])

    def test_inventory_drift_fails_closed(self) -> None:
        changed = copy.deepcopy(self.event_ir)
        removed = False
        for item in changed["maps"]:
            for function in item["functions"]:
                for block in function["blocks"]:
                    for action in block["actions"]:
                        if action.get("operationId") == 0x0175:
                            action["operationId"] = 0xffff
                            removed = True
                            break
                    if removed:
                        break
                if removed:
                    break
            if removed:
                break
        self.assertTrue(removed)
        with self.assertRaisesRegex(ValueError, "0x0175 authored inventory changed"):
            MODULE.build_report(self.executable, changed)


if __name__ == "__main__":
    unittest.main()
