import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_actor_figp_byte_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("actor_figp_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def load_inputs():
    return (
        (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
        json.loads((ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()),
    )


class ExtractActorFigpByteOperationEvidenceTest(unittest.TestCase):
    def test_actor_figp_contract_is_exact_and_corpus_wide(self):
        report = MODULE.build_report(*load_inputs())
        operation = report["operation"]
        self.assertEqual(operation["operationHex"], "0x00c8")
        self.assertEqual(operation["associatedRecordTag"], "FIGP")
        self.assertEqual(operation["recordByteOffset"], "0x10")
        self.assertEqual(operation["writeWidth"], 1)
        self.assertEqual(operation["authoredCallCount"], 132)
        self.assertEqual(operation["dialogueRegionCallCount"], 20)
        self.assertEqual(operation["mapCount"], 21)
        self.assertEqual(operation["constantModeCounts"], {
            "0": 67, "1": 16, "2": 13, "3": 1,
            "4": 4, "5": 4, "6": 7, "7": 3,
        })
        self.assertIn("Missing actors", operation["provenBehavior"])

    def test_actor_figp_contract_rejects_modified_executable(self):
        executable, event_ir = load_inputs()
        modified = bytearray(executable)
        modified[0x0C09BC5A - MODULE.RUNTIME_BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ.BIN"):
            MODULE.build_report(bytes(modified), event_ir)


if __name__ == "__main__":
    unittest.main()
