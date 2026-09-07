import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.build_dialogue_voice_pack import select_voices  # noqa: E402


MANIFEST = {
    "voices": [
        {
            "voiceId": "F0001A001",
            "actorCodes": ["AKIR", "TEST"],
        },
        {
            "voiceId": "F0001B001",
            "actorCodes": ["TEST"],
        },
        {
            "voiceId": "F0002A001",
            "actorCodes": ["OTHR"],
        },
    ]
}


class DialogueVoicePackTests(unittest.TestCase):
    def test_selects_complete_actor_pack(self):
        selected = select_voices(
            MANIFEST,
            actor_codes={"test"},
            voice_ids=set(),
            include_all=False,
        )
        self.assertEqual(
            [voice["voiceId"] for voice in selected],
            ["F0001A001", "F0001B001"],
        )

    def test_selects_an_exact_voice_and_rejects_missing_values(self):
        selected = select_voices(
            MANIFEST,
            actor_codes=set(),
            voice_ids={"f0002a001.str"},
            include_all=False,
        )
        self.assertEqual(selected, [MANIFEST["voices"][2]])
        with self.assertRaises(ValueError):
            select_voices(
                MANIFEST,
                actor_codes={"NONE"},
                voice_ids=set(),
                include_all=False,
            )

    def test_requires_an_explicit_bounded_selection(self):
        with self.assertRaises(ValueError):
            select_voices(
                MANIFEST,
                actor_codes=set(),
                voice_ids=set(),
                include_all=False,
            )


if __name__ == "__main__":
    unittest.main()
