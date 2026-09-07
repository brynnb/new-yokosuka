import importlib.util
import copy
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/cutscenes/build_native_activity_preview_programs.py"
SPEC = importlib.util.spec_from_file_location("activity_previews", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class BuildNativeActivityPreviewProgramsTest(unittest.TestCase):
    def op02_source(self):
        program = json.loads((ROOT / "play/assets/introduction/op02/cutscene-program.generated.json").read_text())
        manifest = json.loads((ROOT / "play/assets/introduction/op02/manifest.json").read_text())
        return program, manifest["ownerAudioCommands"]

    def test_startup_music_preserves_original_commands_once_before_first_shot(self):
        program, routes = self.op02_source()
        commands = MODULE.startup_sound_actions(program, "0x7c", ["0x192", "0x1aa"], routes)
        self.assertEqual([arg["value"] for arg in commands[0]["arguments"]], [0x2BA8, 0, 0])
        function = MODULE.activity_preview_function([(0, None, None), (1, None, None)], commands)
        self.assertEqual(function["blocks"][0]["actions"][:2], commands)
        self.assertEqual(function["blocks"][0]["actions"][2]["operationId"], 0x50)
        self.assertEqual(len(function["blocks"][4]["actions"]), 1)
        self.assertEqual([a["callFileOffset"] for b in function["blocks"] for a in b["actions"]
                          if a.get("semanticId") == "sound-command-dispatch"], ["0x192", "0x1aa"])

    def test_later_or_unresolved_sound_is_not_guessed_as_startup(self):
        program, routes = self.op02_source()
        with self.assertRaisesRegex(ValueError, "unconditional owner prefix"):
            MODULE.startup_sound_actions(program, "0x7c", ["0x192", "0x1aa", "0x1892"], routes)
        with self.assertRaisesRegex(ValueError, "unresolved startup"):
            MODULE.startup_sound_actions(program, "0x7c", ["0x192", "0x1aa"], [])
        changed = copy.deepcopy(program)
        owner = next(fn for fn in changed["functions"] if fn["id"] == "0x7c")
        owner["blocks"][0]["successors"].append("0x17e")
        with self.assertRaisesRegex(ValueError, "unconditional owner prefix"):
            MODULE.startup_sound_actions(changed, "0x7c", ["0x192", "0x1aa"], routes)

    def test_dynamic_startup_command_is_rejected(self):
        program, routes = self.op02_source()
        owner = next(fn for fn in program["functions"] if fn["id"] == "0x7c")
        action = next(a for b in owner["blocks"] for a in b["actions"]
                      if a.get("callFileOffset") == "0x192")
        action["arguments"][0]["kind"] = "frameField"
        with self.assertRaisesRegex(ValueError, "constant arguments"):
            MODULE.startup_sound_actions(program, "0x7c", ["0x192", "0x1aa"], routes)

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
