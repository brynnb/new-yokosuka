import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_hndl_hndr_controller_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_hndl_hndr_controller_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractHndlHndrControllerOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_controller_contract_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        operation = report["operation"]
        self.assertEqual(operation["modeByteOffset"], "record+0x0a68")
        self.assertEqual(operation["enabledByteOffset"], "record+0x0a69")
        self.assertEqual(operation["recordFieldsClearedOnAdmission"], [
            "record+0x49 byte",
            "record+0x4a word",
            "record+0x0a4c dword",
        ])
        self.assertEqual(
            operation["selectedConfigurationMapping"][
                "selected+0x20 dword"
            ],
            "controller length dword",
        )
        self.assertEqual(
            operation["selectedConfigurationMapping"][
                "selected+0x24 low word"
            ],
            "controller secondary parameter word",
        )
        self.assertEqual(
            operation["selectedConfigurationMapping"][
                "selected+0x28 address"
            ],
            "controller continuation pointer",
        )
        self.assertEqual(operation["recordTags"], {
            "zeroSideSelector": "HNDL",
            "nonzeroSideSelector": "HNDR",
        })
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["selectedCallCount"], 2303)
        self.assertEqual(inventory["malformedCallCount"], 2)
        self.assertEqual(inventory["dialogueRegionCallCount"], 228)
        self.assertEqual(inventory["totalDialogueRegionCallCount"], 229)
        self.assertEqual(inventory["areaCount"], 62)

    def test_compiled_ir_promotes_only_well_formed_calls(self):
        event_ir = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/native-event-ir.json"
            ).read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"][
                "resolved-object-hndl-hndr-controller-request"
            ],
            2303,
        )
        self.assertEqual(summary["unresolvedOperationIds"]["0x00df"], 2)
        effects = json.loads(
            (
                PROJECT_ROOT
                / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertEqual(
            effects["summary"]["unresolvedOperationCounts"]["0x00df"],
            1,
        )


if __name__ == "__main__":
    unittest.main()
