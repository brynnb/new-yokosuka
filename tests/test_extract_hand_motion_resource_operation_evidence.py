#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/scripting/operations/extract_hand_motion_resource_operation_evidence.py"


class HandMotionResourceOperationEvidenceTest(unittest.TestCase):
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
        self.assertEqual(report["operation"]["operationId"], 0x00DD)
        self.assertEqual(
            report["operation"]["nativeContract"]["resourceTypeWord"],
            "0x4d444e48",
        )
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 57)
        self.assertEqual(report["allDiscInventory"]["exactOperandCallCount"], 51)
        self.assertEqual(
            report["allDiscInventory"]["op00"]["filename"],
            "HMOT0102.BIN",
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
