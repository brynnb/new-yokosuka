import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dialogue_voice import find_voice_source  # noqa: E402


class DialogueVoiceTests(unittest.TestCase):
    def test_requires_exact_unambiguous_voice_id(self):
        inventory = {
            "archives": [
                {
                    "disc": 1,
                    "source": "/disc/FREE01.AFS",
                    "archive": "FREE01.AFS",
                    "subtitles": [
                        {
                            "member": "F1030.SRF",
                            "records": [
                                {
                                    "index": 9,
                                    "speakerId": "HATO",
                                    "voiceMember": "F1030B001.str",
                                    "timingSha256": "timing",
                                }
                            ],
                        }
                    ],
                }
            ]
        }

        source = find_voice_source(inventory, "f1030b001", disc=1)

        self.assertEqual(source["archive"], "FREE01.AFS")
        self.assertEqual(source["recordIndex"], 9)
        with self.assertRaises(ValueError):
            find_voice_source(inventory, "F1030B002", disc=1)


if __name__ == "__main__":
    unittest.main()
