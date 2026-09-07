import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_fixed_global_float4_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("fixed_global_float4", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractFixedGlobalFloat4OperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_copy_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_CONTROL_FLOW.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["destinationAddress"], "0x0c220330")
        self.assertEqual(report["operation"]["wordCount"], 4)
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 58)
        self.assertEqual(report["allDiscInventory"]["operandKindCounts"], {
            "frame-address": 3,
            "static-pointer": 55,
        })

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
