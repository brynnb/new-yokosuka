import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_018a_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_018a", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class Operation018aEvidenceTest(unittest.TestCase):
    def test_report_matches_exact_executable_and_full_corpus(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()),
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c16b150")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 111)
        self.assertEqual(report["allDiscInventory"]["modeCounts"], {
            "0": 56, "1": 28, "2": 24, "3": 3,
        })


if __name__ == "__main__":
    unittest.main()
