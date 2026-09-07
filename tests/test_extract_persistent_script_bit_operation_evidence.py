import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_persistent_script_bit_operation_evidence",
    ROOT / "tools/scripting/operations/extract_persistent_script_bit_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class PersistentScriptBitEvidenceTest(unittest.TestCase):
    def test_exact_native_handler_and_corpus_inventory(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads(
                (ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()
            ),
        )
        self.assertEqual(report["operation"]["nativeSaveByteOffset"], "0x059c")
        self.assertEqual(report["operation"]["capacityBits"], 256)
        self.assertEqual(report["allDiscInventory"]["callCount"], 2080)
        self.assertEqual(
            report["allDiscInventory"]["indexArgumentKinds"],
            {"constant": 64, "frame-field": 2016},
        )
        self.assertEqual(
            report["allDiscInventory"]["valueArgumentKinds"],
            {"constant": 1888, "frame-field": 192},
        )
        self.assertEqual(
            report["allDiscInventory"]["valueCounts"],
            {"0": 425, "1": 1463},
        )


if __name__ == "__main__":
    unittest.main()
