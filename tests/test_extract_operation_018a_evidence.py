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
from tools.scripting.compile_native_event_ir import semantic_applies


class Operation018aEvidenceTest(unittest.TestCase):
    def test_report_matches_exact_executable_and_full_corpus(self):
        event_ir = json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text())
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            event_ir,
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c16b150")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 111)
        self.assertEqual(report["allDiscInventory"]["modeCounts"], {
            "0": 56, "1": 28, "2": 24, "3": 3,
        })
        self.assertEqual(report, json.loads(MODULE.DEFAULT_OUTPUT.read_text()))
        self.assertEqual(report["roomPool"]["allocationBytes"], 704)
        self.assertEqual(report["recordWrite"]["inventory"]["callCount"], 482)
        self.assertEqual(report["recordWrite"]["inventory"]["mapCount"], 35)
        self.assertEqual(report["recordWrite"]["preservesOffsets"], [32, 36, 40])
        semantics = json.loads((ROOT / "tools/evidence/native-operation-semantics.json").read_text())["operations"]
        writer = next(s for s in semantics if s["operationId"] == 0x018B)
        for call in MODULE.calls(event_ir, 0x018B):
            self.assertTrue(semantic_applies(writer, call))
        bad = {"arguments": [{"kind": "constant", "value": 1}] * 8}
        self.assertFalse(semantic_applies(writer, bad), "missing pointer provenance must stay unresolved")

    def test_rejects_changed_native_ownership_and_pointer_provenance(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0x0C17B4FC - MODULE.RUNTIME_BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.verify_executable(bytes(executable))


if __name__ == "__main__":
    unittest.main()
