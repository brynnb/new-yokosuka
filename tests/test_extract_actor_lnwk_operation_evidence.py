import importlib.util
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_actor_lnwk_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_actor_lnwk_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorLnwkOperationEvidenceTest(unittest.TestCase):
    def test_build_report_recovers_all_native_commands(self):
        report = MODULE.build_report(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        self.assertEqual(report["operation"]["operationHex"], "0x004c")
        self.assertEqual(report["operation"]["associatedRecordTag"], "LNWK")
        self.assertEqual(
            [item["command"] for item in report["operation"]["commands"]],
            [0, 1, 2, 3, 4],
        )

    def test_modified_executable_is_rejected(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable))


if __name__ == "__main__":
    unittest.main()
