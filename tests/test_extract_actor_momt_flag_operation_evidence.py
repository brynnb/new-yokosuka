#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_actor_momt_flag_operation_evidence import (  # noqa: E402
    DEFAULT_EXECUTABLE,
    DEFAULT_MAPINFO,
    build_report,
)


class ExtractActorMOMTFlagOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_handler_and_hato_actor(self):
        report = build_report(
            DEFAULT_EXECUTABLE.read_bytes(),
            DEFAULT_MAPINFO.read_bytes(),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x0042")
        self.assertEqual(report["operation"]["momtTagAscii"], "MOMT")
        self.assertEqual(
            report["hatoConversation"]["actorCode"],
            "AKIR",
        )
        self.assertEqual(report["hatoConversation"]["flagValue"], 1)

    def test_rejects_unverified_executable(self):
        executable = bytearray(DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            build_report(bytes(executable), DEFAULT_MAPINFO.read_bytes())


if __name__ == "__main__":
    unittest.main()
