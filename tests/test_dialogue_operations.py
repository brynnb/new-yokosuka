import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dialogue_operations import (  # noqa: E402
    ExecutableTargetEntry,
    discover_executable_target_table,
    executable_target_for_call,
    extract_invocations,
)


class DialogueOperationTests(unittest.TestCase):
    def test_discovers_native_relative_executable_target_table(self):
        data = bytearray(128)
        # SCN3 begins at 8 and executable code occupies [16, 64).
        for index, relative in enumerate((16, 24, 40)):
            data[64 + index * 4 : 68 + index * 4] = relative.to_bytes(
                4, "little"
            )
        executable_targets = discover_executable_target_table(
            bytes(data),
            scn3_offset=8,
            code_start=16,
            static_base=64,
            token_end=96,
        )

        self.assertEqual(
            [entry.target_offset for entry in executable_targets],
            [24, 32, 48],
        )
        self.assertEqual(
            executable_target_for_call(executable_targets, 44).index,
            1,
        )

    def test_links_exact_start_and_immediate_active_check(self):
        data = b"\0" * 32 + b"F1030B001\0"
        calls = [
            {
                "callFileOffset": "0x10",
                "operationId": 0x6D,
                "arguments": [{"kind": "static-pointer", "value": 32}],
            },
            {
                "callFileOffset": "0x20",
                "operationId": 0xB2,
                "arguments": [{"kind": "constant", "value": 0}],
            },
        ]
        voices = {
            "F1030B001": [
                {
                    "disc": 1,
                    "speakerId": "AKIR",
                    "sourceText": "Hello",
                }
            ]
        }

        invocations = extract_invocations(
            data,
            calls,
            voices,
            disc=1,
            area="D000",
            source="MAPINFO.BIN",
            include_text=False,
            executable_targets=[
                ExecutableTargetEntry(
                    index=629,
                    table_entry_offset=0xB2FCC,
                    target_offset=0x10,
                    relative_to_scn3=0x7E760,
                )
            ],
        )

        self.assertEqual(len(invocations), 1)
        self.assertEqual(invocations[0]["voiceId"], "F1030B001")
        self.assertTrue(
            invocations[0]["followedByGlobalDialogueActiveCheck"]
        )
        self.assertEqual(
            invocations[0]["nearestPrecedingExecutableTarget"]["index"],
            629,
        )
        self.assertNotIn(
            "sourceText",
            invocations[0]["dialogueRecords"][0],
        )

    def test_ignores_unproven_strings_and_non_dialogue_operations(self):
        data = b"UNKNOWN001\0F1030B001\0"
        calls = [
            {
                "callFileOffset": "0x10",
                "operationId": 0x6D,
                "arguments": [{"kind": "static-pointer", "value": 0}],
            },
            {
                "callFileOffset": "0x20",
                "operationId": 0x15C,
                "arguments": [{"kind": "static-pointer", "value": 11}],
            },
        ]

        invocations = extract_invocations(
            data,
            calls,
            {"F1030B001": [{"disc": 1}]},
            disc=1,
            area="D000",
            source="MAPINFO.BIN",
            include_text=True,
        )

        self.assertEqual(invocations, [])


if __name__ == "__main__":
    unittest.main()
