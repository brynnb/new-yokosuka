import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_actor_look_point_update_operation_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_actor_look_point_update_operation_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractActorLookPointUpdateOperationEvidenceTest(unittest.TestCase):
    def test_recovers_exact_optimized_update_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        operation = report["operation"]
        self.assertEqual(operation["recordTag"], {
            "ascii": "LKPT",
            "littleEndian": "0x54504b4c",
        })
        self.assertIn("+0x260", operation["optimizedAdmission"])
        self.assertIn("+0x1ec", operation["optimizedBehavior"])
        self.assertEqual(operation["matrixConsumer"], {
            "controllerTraversalAddress": "0x0c104954",
            "controllerTypeCompareAddress": "0x0c104d62",
            "requiredControllerType": 4,
            "callbackCallAddress": "0x0c104ef8",
            "callbackAddress": "0x0c107338",
            "actorAngularWordOffsets": ["0x86", "0x90"],
            "behavior": (
                "The native controller traversal calls the LKPT angular "
                "update only from its exact controller-type-four branch. "
                "The callback derives and limits the two target angles, "
                "writes actor words +0x86 and +0x90, then composes those "
                "angles into the current type-four controller matrix. "
                "Controller type four occurs exactly once in every one "
                "of the executable's 21 authored controller families."
            ),
        })
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 290)
        self.assertEqual(inventory["dialogueRegionCallCount"], 143)
        self.assertEqual(inventory["areaCount"], 48)
        self.assertEqual(inventory["constantModeCounts"], {
            "0": 128,
            "1": 52,
            "2": 108,
        })

    def test_compiled_ir_promotes_every_well_formed_update_call(self):
        event_ir = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/native-event-ir.json"
            ).read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"]["actor-look-point-update-control"],
            290,
        )
        self.assertNotIn("0x016c", summary["unresolvedOperationIds"])
        effects = json.loads(
            (
                PROJECT_ROOT
                / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertNotIn(
            "0x016c",
            effects["summary"]["unresolvedOperationCounts"],
        )


if __name__ == "__main__":
    unittest.main()
