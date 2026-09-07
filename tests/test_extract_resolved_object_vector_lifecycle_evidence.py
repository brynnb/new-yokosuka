import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT
    / "tools/scripting/operations/extract_resolved_object_vector_lifecycle_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_resolved_object_vector_lifecycle_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractResolvedObjectVectorLifecycleEvidenceTest(unittest.TestCase):
    def test_recovers_exact_authored_contracts(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(
            report["initializer"]["inventory"]["callCount"],
            4349,
        )
        self.assertEqual(
            report["initializer"]["inventory"]["dialogueRegionCallCount"],
            359,
        )
        self.assertEqual(
            report["baseVectorQuery"]["inventory"]["callCount"],
            4042,
        )
        self.assertEqual(
            report["baseVectorQuery"]["inventory"][
                "dialogueRegionCallCount"
            ],
            139,
        )
        self.assertEqual(
            report["indexedVectorQuery"]["inventory"]["callCount"],
            721,
        )
        self.assertEqual(
            report["indexedVectorQuery"]["inventory"][
                "dialogueRegionCallCount"
            ],
            148,
        )
        self.assertEqual(
            report["indexedVectorQuery"]["unselectedMalformedCallCount"],
            28,
        )
        self.assertEqual(
            report["frameSelectorVectorQuery"]["inventory"]["callCount"],
            480,
        )
        self.assertEqual(
            report["zeroFallbackVectorQuery"]["inventory"]["callCount"],
            672,
        )
        self.assertEqual(
            report["nativeContract"]["indexedQuery"]["recordTag"],
            "0x4d544f4d",
        )

    def test_selects_only_exact_indexed_queries_and_known_flags(self):
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "functions": [{
                    "id": "0x100",
                    "dialogueRegion": None,
                    "blocks": [{
                        "actions": [
                            {
                                "kind": "engineOperation",
                                "operationId": 24,
                                "callFileOffset": "0x104",
                                "arguments": [
                                    {"kind": "constant", "value": 0},
                                    {"kind": "constant", "value": 1},
                                    {"kind": "constant", "value": 0},
                                ],
                            },
                            {
                                "kind": "engineOperation",
                                "operationId": 25,
                                "callFileOffset": "0x108",
                                "arguments": [
                                    {"kind": "constant", "value": 0},
                                    {"kind": "constant", "value": 4},
                                    {"kind": "constant", "value": 0},
                                    {"kind": "constant", "value": 0},
                                ],
                            },
                        ],
                    }],
                }],
            }],
        }
        self.assertEqual(MODULE.initializer_calls(event_ir), [])
        self.assertEqual(MODULE.base_query_calls(event_ir), [])
        self.assertEqual(MODULE.frame_selector_query_calls(event_ir), [])
        self.assertEqual(MODULE.zero_fallback_query_calls(event_ir), [])
        self.assertEqual(
            [
                call["callFileOffset"]
                for call in MODULE.indexed_query_calls(event_ir)
            ],
            ["0x108"],
        )

    def test_compiled_ir_promotes_all_well_formed_indexed_queries(self):
        event_ir = json.loads(
            (
                PROJECT_ROOT / "tools/evidence/native-event-ir.json"
            ).read_text()
        )
        summary = event_ir["summary"]
        self.assertEqual(
            summary["semanticIds"][
                "resolved-object-indexed-vector-query"
            ],
            1873,
        )
        self.assertEqual(summary["unresolvedOperationIds"]["0x0019"], 28)
        effects = json.loads(
            (
                PROJECT_ROOT
                / "tools/evidence/dialogue-gameplay-effects.json"
            ).read_text()
        )
        self.assertNotIn(
            "0x0019",
            effects["summary"]["unresolvedOperationCounts"],
        )


if __name__ == "__main__":
    unittest.main()
