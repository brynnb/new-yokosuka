import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_indexed_binary_record_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_indexed_binary_record_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractIndexedBinaryRecordOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_binary_write(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 426)
        self.assertEqual(inventory["dialogueRegionCallCount"], 82)
        self.assertEqual(inventory["valueCounts"], {"0": 237, "1": 189})
        self.assertEqual(
            inventory["dialogueRegionIndexArgumentKindCounts"],
            {"constant": 80, "runtime": 2},
        )
        operation = report["operation"]
        self.assertEqual(operation["indexLimit"], 128)
        self.assertEqual(operation["mirrorIndexLimit"], 32)
        self.assertEqual(operation["callbackClassBit"], 3)

    def test_compiled_ir_promotes_the_exact_authored_family(self):
        event_ir = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/native-event-ir.json"
            ).read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"]["indexed-binary-record-write"],
            426,
        )
        self.assertNotIn("0x0065", summary["unresolvedOperationIds"])

        effects = json.loads(
            (
                PROJECT_ROOT
                / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertNotIn(
            "0x0065",
            effects["summary"]["unresolvedOperationCounts"],
        )


if __name__ == "__main__":
    unittest.main()
