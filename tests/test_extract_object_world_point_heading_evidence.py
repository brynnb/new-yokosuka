#!/usr/bin/env python3

import json
import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_object_world_point_heading_evidence import (  # noqa: E402
    DEFAULT_CONTROL_FLOW,
    DEFAULT_EXECUTABLE,
    build_report,
)


class ExtractObjectWorldPointHeadingEvidenceTest(unittest.TestCase):
    def test_recovers_exact_handler_and_all_authored_calls(self):
        report = build_report(
            DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(DEFAULT_CONTROL_FLOW.read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x001e")
        self.assertEqual(report["allDiscInventory"]["callCount"], 58)
        self.assertEqual(report["operation"]["operationResult"], 0)
        self.assertEqual(report["allDiscInventory"]["targetKindCounts"], {
            "frame-address": 54,
            "scene-address": 2,
            "static-pointer": 2,
        })
        self.assertEqual(
            report["cataDirectEntry"]["callFileOffset"],
            "0x2bf3a",
        )
        self.assertEqual(
            report["operation"]["directPositionOffsets"],
            ["+0x08", "+0x0c", "+0x10"],
        )
        self.assertEqual(
            report["operation"]["directSecondaryOffsets"],
            ["+0x14", "+0x18", "+0x1c"],
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
