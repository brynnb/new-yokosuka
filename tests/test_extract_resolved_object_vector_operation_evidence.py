#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_resolved_object_vector_operation_evidence import (  # noqa: E402
    DEFAULT_EXECUTABLE,
    DEFAULT_MAPINFO,
    build_report,
)


class ExtractResolvedObjectVectorOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_hato_vector_operation(self):
        report = build_report(
            DEFAULT_EXECUTABLE.read_bytes(),
            DEFAULT_MAPINFO.read_bytes(),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x001d")
        self.assertEqual(report["hatoConversation"]["actorCode"], "AKIR")
        self.assertEqual(report["hatoConversation"]["flags"], "0x78000000")
        self.assertEqual(
            report["hatoConversation"]["vectorSource"]["offset"],
            "0x00ec",
        )

    def test_rejects_unverified_mapinfo(self):
        mapinfo = bytearray(DEFAULT_MAPINFO.read_bytes())
        mapinfo[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected D000"):
            build_report(DEFAULT_EXECUTABLE.read_bytes(), bytes(mapinfo))


if __name__ == "__main__":
    unittest.main()
