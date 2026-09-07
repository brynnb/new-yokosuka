#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_camera_state_mode_operation_evidence import (  # noqa: E402
    DEFAULT_EXECUTABLE,
    build_report,
)


class ExtractCameraStateModeOperationEvidenceTest(unittest.TestCase):
    def test_recovers_shared_camera_selector(self):
        report = build_report(DEFAULT_EXECUTABLE.read_bytes())
        self.assertEqual(report["operation"]["operationHex"], "0x000e")
        self.assertEqual(
            report["operation"]["cameraStateModeSelectorAddress"],
            "0x0c09f4c6",
        )
        self.assertEqual(report["hatoConversation"]["requestedMode"], 0)

    def test_rejects_unverified_executable(self):
        executable = bytearray(DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            build_report(bytes(executable))


if __name__ == "__main__":
    unittest.main()
