import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.audio.extract_native_world_audio_calls import (  # noqa: E402
    ascii_sound_names,
    bank_indexes,
    command_hex,
    resolve_command_bank,
)


class NativeWorldAudioCallResolutionTests(unittest.TestCase):
    def setUp(self):
        self.catalog = {
            "banks": [
                {
                    "sha256": "system-sha",
                    "families": ["system"],
                    "sources": [
                        {"disc": 1, "path": "SOUND/SYSTEM1.SND"},
                        {"disc": 2, "path": "SOUND/SYSTEM1.SND"},
                        {"disc": 3, "path": "SOUND/SYSTEM1.SND"},
                    ],
                    "commands": [{"commandHex": "ab050400"}],
                },
                {
                    "sha256": "location-sha",
                    "families": ["location"],
                    "sources": [
                        {"disc": 1, "path": "SCENE/01/SOUND/F1TEST.SND"},
                    ],
                    "commands": [{"commandHex": "ab060100"}],
                },
                {
                    "sha256": "single-disc-system",
                    "families": ["system"],
                    "sources": [
                        {"disc": 1, "path": "SOUND/SYSTEM1.SND"},
                    ],
                    "commands": [{"commandHex": "ab059900"}],
                },
            ],
        }

    def test_requires_one_identical_system_bank_on_all_three_discs(self):
        _, _, shared = bank_indexes(self.catalog)
        self.assertEqual(shared, [{
            "filename": "SYSTEM1.SND",
            "sha256": "system-sha",
            "sourceDiscs": [1, 2, 3],
        }])

    def test_runtime_word_uses_native_little_endian_command_order(self):
        self.assertEqual(command_hex(0x001D04A9), "a9041d00")
        self.assertEqual(command_hex(0x002402AB), "ab022400")

    def test_mapinfo_sound_names_are_case_normalized_and_deduplicated(self):
        data = b"f1omoyaa.snd\0F1OMOYAA.SND\0a1_telp.snd\0"
        self.assertEqual(
            ascii_sound_names(data),
            ["A1_TELP.SND", "F1OMOYAA.SND"],
        )

    def test_catalog_index_keeps_disc_and_bank_identity(self):
        by_name, commands, _ = bank_indexes({
            "banks": [{
                "sha256": "abc",
                "families": ["location"],
                "sources": [
                    {"disc": 1, "path": "SCENE/01/SOUND/F1TEST.SND"},
                ],
                "commands": [{"commandHex": "a9050100"}],
            }],
        })
        self.assertEqual(by_name[(1, "F1TEST.SND")][0]["sha256"], "abc")
        self.assertEqual(commands["abc"], {"a9050100"})
        self.assertNotIn((2, "F1TEST.SND"), by_name)

    def test_prefers_a_map_named_location_bank_before_shared_system(self):
        by_name, commands, shared = bank_indexes(self.catalog)
        location = [{
            "filename": "F1TEST.SND",
            "sha256": by_name[(1, "F1TEST.SND")][0]["sha256"],
        }]
        status, matches = resolve_command_bank(
            "ab060100",
            location,
            shared,
            commands,
        )
        self.assertEqual(status, "location-bank-resolved")
        self.assertEqual(matches[0]["scope"], "map-named-location")

    def test_resolves_only_catalogued_commands_to_the_shared_bank(self):
        _, commands, shared = bank_indexes(self.catalog)
        status, matches = resolve_command_bank(
            "ab050400",
            [],
            shared,
            commands,
        )
        self.assertEqual(status, "shared-system-bank-resolved")
        self.assertEqual(matches[0]["sha256"], "system-sha")
        status, matches = resolve_command_bank(
            "a9040000",
            [],
            shared,
            commands,
        )
        self.assertEqual(status, "not-in-proven-map-or-shared-bank")
        self.assertEqual(matches, [])


if __name__ == "__main__":
    unittest.main()
