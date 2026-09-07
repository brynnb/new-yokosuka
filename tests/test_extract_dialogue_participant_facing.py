import importlib.util
import json
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_participant_facing",
    ROOT / "tools/scripting/extract_dialogue_participant_facing.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueParticipantFacingExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(
                MODULE.DEFAULT_ACTOR_RESOURCES.read_text(encoding="utf-8")
            ),
            json.loads(MODULE.DEFAULT_BODY_ROUTES.read_text(encoding="utf-8")),
        )

    def test_face_controller_path_is_verified(self):
        evidence = self.report["executableEvidence"]
        self.assertEqual(
            evidence["faceControllerTypeLiteral"]["value"],
            "FACE",
        )
        self.assertEqual(
            evidence["faceControllerWriterPointer"]["value"],
            "0xc0bc784",
        )

    def test_both_command_families_select_facing_target_ordinals(self):
        families = self.report["nativeHandler"]["families"]
        self.assertEqual(
            [family["indexExpression"] for family in families],
            ["commandWord - 0x14", "commandWord - 0x78"],
        )
        self.assertEqual(
            [family["appliesControlStateTransition"] for family in families],
            [True, False],
        )

    def test_facing_target_corpus_is_complete(self):
        summary = self.report["summary"]
        self.assertEqual(summary["resourceWithFacingTargetsCount"], 34)
        self.assertEqual(summary["facingTargetCount"], 65)
        self.assertGreater(summary["nativeFacingCommandSiteCount"], 200)


if __name__ == "__main__":
    unittest.main()
