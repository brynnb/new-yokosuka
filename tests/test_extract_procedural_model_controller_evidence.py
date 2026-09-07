import importlib.util
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
PATH = ROOT / "tools/scripting/operations/extract_procedural_model_controller_evidence.py"
SPEC = importlib.util.spec_from_file_location("procedural_model_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractProceduralModelControllerEvidenceTest(unittest.TestCase):
    def test_recovers_shared_controller_and_exact_op00_surface_contract(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
            MODULE.DEFAULT_OP00_MAPINFO.read_bytes(),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x0163")
        self.assertEqual(report["operation"]["slotCount"], 2)
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 305)
        self.assertEqual(report["allDiscInventory"]["mapCount"], 12)
        self.assertEqual(report["op00"]["authoredCallCount"], 34)
        self.assertEqual(report["op00"]["surfaceHeightQueryCount"], 21)
        self.assertEqual(
            {target["offset"] for target in report["op00"]["surfaceHeightResultTargets"]},
            {20},
        )
        self.assertEqual(report["op00"]["create"]["model"], "trsea025.mt6")
        self.assertEqual(report["op00"]["gridResource"]["name"], "grid025.bin")

    def test_rejects_modified_handler(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[MODULE.HANDLER_ADDRESS - MODULE.RUNTIME_BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(
                bytes(executable),
                {},
                MODULE.DEFAULT_OP00_MAPINFO.read_bytes(),
            )


if __name__ == "__main__":
    unittest.main()
