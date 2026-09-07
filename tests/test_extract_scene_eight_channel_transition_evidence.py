import importlib.util
import json
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = (
    PROJECT_ROOT / "tools/scripting/operations/extract_scene_eight_channel_transition_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "extract_scene_eight_channel_transition_evidence",
    MODULE_PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractSceneEightChannelTransitionEvidenceTest(unittest.TestCase):
    def test_recovers_write_and_query_forms_without_channel_labels(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["callCount"], 2096)
        self.assertEqual(inventory["formCounts"], {
            "active-query": 756,
            "transition-write": 1338,
            "unselected": 2,
        })
        self.assertEqual(inventory["dialogueRegionFormCounts"], {
            "active-query": 103,
            "transition-write": 145,
        })
        self.assertEqual(
            report["operation"]["writeForm"][
                "firstEndpointArgumentIndices"
            ],
            [1, 2, 3, 4],
        )
        self.assertEqual(
            report["operation"]["perTickUpdate"],
            "0x0c173b68",
        )
        self.assertIn(
            "snap current words",
            report["operation"]["writeForm"]["tickBehavior"],
        )


if __name__ == "__main__":
    unittest.main()
