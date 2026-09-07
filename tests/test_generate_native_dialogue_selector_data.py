import importlib.util
import json
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "native_dialogue_selector_data",
    ROOT / "tools/scripting/generate_native_dialogue_selector_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeDialogueSelectorDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = MODULE.extract_selector_data(
            MODULE.DEFAULT_HUMANS.read_bytes(),
            MODULE.scheduled_actor_labels(MODULE.DEFAULT_SCHEDULED_ACTORS),
            json.loads(MODULE.DEFAULT_DIALOGUE_INVENTORY.read_text()),
        )

    def test_selector_corpus_is_complete_and_deduplicated(self):
        self.assertEqual(self.data["resourceCount"], 257)
        self.assertEqual(self.data["identicalDuplicateCount"], 5)
        self.assertEqual(self.data["totalSelectorBytes"], 510152)

    def test_bob_selector_retains_exact_native_bounds(self):
        bob = self.data["resources"]["BOB_"]
        self.assertEqual(bob["recordRoutingOffset"], 0x68)
        self.assertEqual(bob["byteLength"], 124)
        self.assertEqual(
            bob["sha256"],
            "d40b742c14e426587b725e48af6d6b165542a0c1cb2a10bcca1649ee14a3433e",
        )
        self.assertEqual(
            self.data["messageResources"]["BOB_"]["messages"][0]["voiceId"],
            "XD003A001",
        )

    def test_messages_retain_exact_source_and_subtitle_join(self):
        hato = self.data["messageResources"]["HATO"]
        self.assertEqual(hato["actorLabel"], "Yoshifumi Hato")
        self.assertEqual(hato["authoredPersonIdentity"], "HATO")
        self.assertEqual(hato["messages"][0]["speakerId"], "HATO")
        self.assertEqual(
            hato["messages"][0]["displayText"],
            "Ain't got time for punk kids.\nGet out of here.",
        )

    def test_lip_sync_packing_is_lossless_and_rejects_invalid_cues(self):
        descriptor = {
            "format": "shenmue-srf-mouth-cues-v1",
            "tickRate": 60,
            "cues": [
                {"shape": 5, "durationTicks": 18},
                {"shape": 0, "durationTicks": 4},
            ],
        }
        self.assertEqual(
            MODULE.pack_native_lip_sync(descriptor),
            "srf1:BRIAAAQA",
        )
        with self.assertRaisesRegex(MODULE.SelectorDataError, "invalid"):
            MODULE.pack_native_lip_sync({
                **descriptor,
                "cues": [{"shape": 6, "durationTicks": 1}],
            })


if __name__ == "__main__":
    unittest.main()
