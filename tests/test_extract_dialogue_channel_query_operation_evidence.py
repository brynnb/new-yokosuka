import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_dialogue_channel_query_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_dialogue_channel_query_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractDialogueChannelQueryEvidenceTest(unittest.TestCase):
    def test_recovers_optional_handle_contract_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x00b2")
        self.assertEqual(report["operation"]["returnValues"], [0, 1])
        self.assertEqual(report["allDiscInventory"]["callCount"], 10322)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            10196,
        )
        self.assertEqual(
            report["allDiscInventory"][
                "previouslyUnresolvedDialogueRegionCallCount"
            ],
            8580,
        )
        self.assertGreater(
            report["allDiscInventory"]["argumentKindCounts"]["runtime"],
            0,
        )

    def test_inventory_retains_runtime_handle_operands(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        runtime_call = next(
            call
            for call in report["allDiscInventory"]["calls"]
            if call["handleArgument"]["kind"] == "runtime"
        )
        self.assertIn("source", runtime_call["handleArgument"])


if __name__ == "__main__":
    unittest.main()
