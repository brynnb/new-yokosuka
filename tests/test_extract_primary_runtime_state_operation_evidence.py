import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_primary_runtime_state_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_primary_runtime_state_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractPrimaryRuntimeStateOperationEvidenceTest(unittest.TestCase):
    def test_build_report_recovers_hato_modes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_MAPINFO.read_bytes(),
            json.loads(
                MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")
            ),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x002d")
        self.assertEqual(
            [mode["mode"] for mode in report["operation"]["provenModes"]],
            [0, 1, 2, 8, 7, 9, 11, 12, 13, 14, 15, 16, 17, 18],
        )
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 2150)
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 2150)
        self.assertEqual(
            report["allDiscInventory"]["unresolvedDialogueRegionCallCount"],
            0,
        )
        self.assertEqual(report["hatoConversation"]["prelude"]["mode"], 0)
        self.assertEqual(
            report["hatoConversation"]["controlCleanup"]["mode"],
            1,
        )

    def test_modified_executable_is_rejected(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(
                bytes(executable),
                MODULE.DEFAULT_MAPINFO.read_bytes(),
                {},
            )


if __name__ == "__main__":
    unittest.main()
