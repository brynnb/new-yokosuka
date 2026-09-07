import importlib.util
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_global_byte_state_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_global_byte_state_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGlobalByteStateOperationEvidenceTest(unittest.TestCase):
    def test_build_report_recovers_direct_write_and_hato_value(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_MAPINFO.read_bytes(),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x00ac")
        self.assertEqual(
            report["operation"]["destinationAddress"],
            "0x0c225340",
        )
        self.assertEqual(report["hatoConversation"]["value"], 1)

    def test_modified_mapinfo_is_rejected(self):
        mapinfo = bytearray(MODULE.DEFAULT_MAPINFO.read_bytes())
        mapinfo[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected D000"):
            MODULE.build_report(
                MODULE.DEFAULT_EXECUTABLE.read_bytes(),
                bytes(mapinfo),
            )


if __name__ == "__main__":
    unittest.main()
