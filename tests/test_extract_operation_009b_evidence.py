import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/scripting/operations/extract_operation_009b_evidence.py"


class Operation009bEvidenceTest(unittest.TestCase):
    def test_rebuilds_checked_in_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "evidence.json"
            subprocess.run(
                [sys.executable, str(SCRIPT), "--output", str(output)],
                cwd=ROOT,
                check=True,
            )
            expected = json.loads((ROOT / "tools/evidence/operation-009b-evidence.json").read_text())
            self.assertEqual(json.loads(output.read_text()), expected)


if __name__ == "__main__":
    unittest.main()
