import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "tools/scripting/operations/extract_actor_mhnd_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "extract_actor_mhnd_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorMhndOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_authored_routes_and_native_table(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["operation"]["recordTag"]["ascii"], "MHND")
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 796)
        self.assertEqual(inventory["dialogueRegionCallCount"], 114)
        self.assertEqual(inventory["areaCount"], 64)
        self.assertEqual(inventory["routeCounts"], {
            "immediate-duration-one": 2,
            "reset-minus-one": 198,
            "timed-controller": 596,
        })
        self.assertEqual(inventory["dialogueRouteCounts"], {
            "reset-minus-one": 24,
            "timed-controller": 90,
        })
        self.assertEqual(report["targetTable"]["rowIndices"], list(range(-1, 15)))

    def test_compiled_ir_promotes_every_well_formed_call(self):
        event_ir = json.loads(
            (PROJECT_ROOT / "tools/evidence/native-event-ir.json").read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"]["actor-mhnd-controller-request"],
            796,
        )
        self.assertNotIn("0x0081", summary["unresolvedOperationIds"])
        effects = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertNotIn(
            "0x0081",
            effects["summary"]["unresolvedOperationCounts"],
        )


if __name__ == "__main__":
    unittest.main()
