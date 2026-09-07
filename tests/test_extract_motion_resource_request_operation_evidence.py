#!/usr/bin/env python3
"""Regression tests for operation 0x0084 motion request evidence."""

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/scripting/operations/extract_motion_resource_request_operation_evidence.py"


class MotionResourceRequestOperationEvidenceTest(unittest.TestCase):
    def test_exact_contract_and_inventory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "evidence.json"
            subprocess.run(
                ["python3", str(SCRIPT), "--out", str(output)],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )
            report = json.loads(output.read_text(encoding="utf-8"))

        self.assertEqual(report["operation"]["operationId"], 0x0084)
        self.assertEqual(
            report["operation"]["nativeContract"]["sceneDirectoryFormat"],
            "scene/%02d/%c%c%c%c",
        )
        self.assertEqual(
            report["operation"]["nativeContract"]["resourceTypeWord"],
            "0x49544f4d",
        )
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 245)
        self.assertEqual(report["allDiscInventory"]["exactOperandCallCount"], 245)
        self.assertEqual(
            report["allDiscInventory"]["unresolvedWrapperCallCount"],
            0,
        )
        self.assertEqual(
            report["allDiscInventory"]["currentSceneResultCallCount"],
            134,
        )
        self.assertEqual(
            report["allDiscInventory"]["op00"]["callFileOffsets"],
            ["0x15476", "0x15492", "0x154ca", "0x154e6"],
        )

    def test_rejects_wrong_executable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            executable = Path(directory) / "1ST_READ.BIN"
            executable.write_bytes(b"not Shenmue")
            result = subprocess.run(
                ["python3", str(SCRIPT), "--executable", str(executable)],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unexpected 1ST_READ.BIN", result.stderr)


if __name__ == "__main__":
    unittest.main()
