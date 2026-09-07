import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dialogue_code_regions import (  # noqa: E402
    exact_character_state_access,
    group_dialogue_code_regions,
)
from tools.scripting.extract_dialogue_operations import ExecutableTargetEntry  # noqa: E402


class DialogueCallbackTests(unittest.TestCase):
    def test_groups_full_region_around_exact_voice_start(self):
        data = bytearray(128)
        data[96:107] = b"F1030B001\0"
        executable_targets = [
            ExecutableTargetEntry(0, 80, 16, 8),
            ExecutableTargetEntry(1, 84, 48, 40),
        ]
        calls = [
            {
                "callFileOffset": "0x14",
                "operationId": 0x2C,
                "operationHex": "0x002c",
                "arguments": [
                    {
                        "kind": "constant",
                        "value": 0x4F544148,
                        "ascii": "HATO",
                    }
                ],
            },
            {
                "callFileOffset": "0x18",
                "operationId": 0x6D,
                "operationHex": "0x006d",
                "arguments": [{"kind": "static-pointer", "value": 96}],
            },
            {
                "callFileOffset": "0x1c",
                "operationId": 0xB2,
                "operationHex": "0x00b2",
                "arguments": [{"kind": "constant", "value": 0}],
            },
            {
                "callFileOffset": "0x20",
                "operationId": 0x1AF,
                "operationHex": "0x01af",
                "arguments": [
                    {"kind": "constant", "value": 0x42},
                    {
                        "kind": "constant",
                        "value": 0x4F544148,
                        "ascii": "HATO",
                    },
                ],
            },
            {
                "callFileOffset": "0x34",
                "operationId": 0x2D,
                "operationHex": "0x002d",
                "arguments": [{"kind": "constant", "value": 1}],
            },
        ]

        result = group_dialogue_code_regions(
            bytes(data),
            calls,
            executable_targets,
            {
                "F1030B001": [
                    {
                        "disc": 1,
                        "scene": "",
                        "archive": "FREE01.AFS",
                        "subtitleMember": "F1030.SRF",
                        "recordIndex": 9,
                        "speakerId": "HATO",
                    }
                ]
            },
            disc=1,
            operation_semantics={
                0x6D: "dialogue-start",
                0xB2: "dialogue-active-query",
            },
        )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["executableTargetIndex"], 0)
        self.assertEqual(result[0]["voiceIds"], ["F1030B001"])
        self.assertEqual(result[0]["actorTags"], ["HATO"])
        self.assertEqual(
            result[0]["operations"][1]["semanticId"],
            "dialogue-start",
        )
        self.assertEqual(len(result[0]["operations"]), 4)
        self.assertEqual(result[0]["regionEndFileOffset"], "0x30")
        self.assertEqual(result[0]["executableTargetAliasIndices"], [0])
        self.assertEqual(
            result[0]["voiceRecords"][0]["records"][0]["speakerId"],
            "HATO",
        )
        self.assertEqual(
            result[0]["characterStateAccesses"][0]["access"],
            "read",
        )

    def test_character_state_decoder_rejects_unproven_suboperations(self):
        operation = {
            "callFileOffset": "0x20",
            "operationId": 0x1AF,
            "arguments": [
                {"value": 0x99},
                {"value": 0x4F544148, "ascii": "HATO"},
            ],
        }
        self.assertIsNone(exact_character_state_access(operation))


if __name__ == "__main__":
    unittest.main()
