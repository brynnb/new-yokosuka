#!/usr/bin/env python3

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools.scripting.operations.extract_native_prelude_presentation_state_evidence import (  # noqa: E402
    DEFAULT_CONTROL_FLOW,
    DEFAULT_EXECUTABLE,
    build_report,
)


class NativePreludePresentationStateEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = build_report(
            DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(DEFAULT_CONTROL_FLOW.read_text(encoding="utf-8")),
        )

    def test_exact_all_disc_inventories(self):
        self.assertEqual(
            self.report["operations"]["0x0049"]["sourceKindCounts"],
            {"static-pointer": 106, "frame-address": 1},
        )
        self.assertEqual(
            self.report["operations"]["0x006f-mode-0"]["allModeCounts"],
            {"0": 92, "2": 16, "4": 3},
        )
        self.assertEqual(
            self.report["operations"]["0x0173-mode-0"]["allModeCounts"],
            {"0": 7, "1": 3, "2": 3, "3": 1, "4": 1, "5": 96},
        )

    def test_exact_cata_payloads(self):
        cata = self.report["cataDirectEntry"]
        self.assertEqual(cata["fogCall"], "0x26c26")
        self.assertEqual(
            cata["fogWords"],
            [0x4161999A, 0x44480000, 0x3EF5C28F, 0x7F9FD1FF],
        )
        self.assertEqual(cata["scrollColorCall"], "0x26c3e")
        self.assertEqual(
            cata["scrollColorWords"],
            [0, 0, 0xBB00663C, 0xBB00663C],
        )
        self.assertEqual(
            cata["cameraAuxiliaryResetCalls"],
            ["0x2c092", "0x353fe"],
        )


if __name__ == "__main__":
    unittest.main()
