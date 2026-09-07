import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_hndl_hndr_vector_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_hndl_hndr_vector_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractHndlHndrVectorOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_vector_install_and_authored_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        operation = report["operation"]
        self.assertEqual(operation["recordTags"], {
            "zeroSideSelector": "HNDL",
            "nonzeroSideSelector": "HNDR",
        })
        self.assertEqual(operation["vectorSlotCount"], 71)
        self.assertEqual(operation["sourceVectorCount"], 19)
        self.assertEqual(operation["activeByteOffset"], "record+0x49")
        self.assertEqual(operation["durationWordOffset"], "record+0x4a")
        self.assertEqual(operation["vectorSlotsOffset"], "record+0x4c")
        self.assertEqual(
            operation["installedSlotIndices"],
            MODULE.INSTALLED_SLOT_INDICES,
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["selectedCallCount"], 1496)
        self.assertEqual(inventory["malformedCallCount"], 2)
        self.assertEqual(inventory["dialogueRegionCallCount"], 84)
        self.assertEqual(inventory["areaCount"], 38)

    def test_compiled_ir_promotes_only_well_formed_calls(self):
        event_ir = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/native-event-ir.json"
            ).read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"][
                "resolved-object-hndl-hndr-vector-install"
            ],
            1496,
        )
        self.assertEqual(summary["unresolvedOperationIds"]["0x005e"], 2)
        effects = json.loads(
            (
                PROJECT_ROOT
                / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertNotIn(
            "0x005e",
            effects["summary"]["unresolvedOperationCounts"],
        )


if __name__ == "__main__":
    unittest.main()
