import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/cutscenes/build_native_activity_preview_programs.py"
SPEC = importlib.util.spec_from_file_location("activity_previews", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildNativeActivityPreviewProgramsTest(unittest.TestCase):
    def test_single_activity_retains_existing_canonical_shape(self):
        function = MODULE.activity_preview_function([(1, 2, 3)])

        self.assertEqual(function["id"], "$activity-preview")
        self.assertEqual(function["entryBlock"], "$activity-preview:bind")
        self.assertEqual(len(function["blocks"]), 5)
        self.assertEqual(
            function["blocks"][3]["successors"],
            ["$activity-preview:wait", "$activity-preview:return"],
        )

    def test_sequence_repeats_exact_bindings_under_one_function(self):
        function = MODULE.activity_preview_function([
            (0, 0x81492, 0x81497),
            (1, 0x814A2, 0x814A7),
            (1, 0x814A2, 0x814A7),
            (2, 0x814C2, 0x814C7),
        ])

        self.assertEqual(function["id"], "$activity-sequence")
        self.assertEqual(function["entryBlock"], "$activity-sequence:0:bind")
        self.assertEqual(len(function["blocks"]), 17)
        starts = [
            action["arguments"][0]["value"]
            for block in function["blocks"]
            for action in block["actions"]
            if action.get("callFileOffset", "").endswith(":0050-start")
        ]
        self.assertEqual(starts, [0, 1, 1, 2])
        self.assertEqual(
            function["blocks"][3]["successors"],
            ["$activity-sequence:0:wait", "$activity-sequence:1:bind"],
        )
        self.assertEqual(
            function["blocks"][15]["successors"],
            ["$activity-sequence:3:wait", "$activity-sequence:return"],
        )

    def test_embedded_activity_sequence_uses_preinstalled_map_slots(self):
        function = MODULE.activity_preview_function([
            (0, None, None),
            (1, None, None),
        ])
        actions = [
            action
            for block in function["blocks"]
            for action in block["actions"]
        ]
        self.assertFalse(any(action.get("operationHex") == "0x013e" for action in actions))
        self.assertEqual(
            [
                action["arguments"][0]["value"]
                for action in actions
                if action.get("callFileOffset", "").endswith(":0050-start")
            ],
            [0, 1],
        )


if __name__ == "__main__":
    unittest.main()
