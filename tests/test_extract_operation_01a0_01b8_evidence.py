import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_01a0_01b8_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_01a0_01b8", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class Operation01a001b8EvidenceTest(unittest.TestCase):
    def test_recovers_exact_unrelated_contracts(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation01a0"]["recordTag"], "REFB")
        self.assertEqual(report["operation01a0"]["authoredModes"], [0, 2, 3, 5])
        self.assertEqual(report["operation01b8"]["slotCount"], 16)
        self.assertEqual(report["operation01b8"]["authoredModes"], {"0": 4, "1": 4})
        self.assertIn("not a shared subsystem", report["relationship"])


if __name__ == "__main__":
    unittest.main()
