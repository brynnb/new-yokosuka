import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_osag_float_parameter_evidence",
    ROOT / "tools/scripting/operations/extract_osag_float_parameter_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOsagFloatParameterEvidenceTest(unittest.TestCase):
    def test_checked_in_evidence_is_reproducible(self):
        actual = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        expected = json.loads(MODULE.DEFAULT_OUTPUT.read_text(encoding="utf-8"))
        self.assertEqual(actual, expected)

    def test_exact_native_field_contract(self):
        evidence = json.loads(MODULE.DEFAULT_OUTPUT.read_text(encoding="utf-8"))
        operation = evidence["operation"]
        self.assertEqual(operation["handlerAddress"], "0x0c131b44")
        self.assertEqual(operation["componentTag"], "OSAG")
        self.assertEqual(operation["floatWordOffset"], "0x01e8")
        self.assertEqual(
            evidence["allDiscInventory"]["argumentKindCounts"]["0"],
            {"constant": 14, "frame-field": 1},
        )


if __name__ == "__main__":
    unittest.main()
