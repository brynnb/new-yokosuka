#!/usr/bin/env python3

import sys
import unittest
from dataclasses import dataclass
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_dialogue_call_graph import (  # noqa: E402
    coroutine_launches,
    launch_argument_json,
    live_argument_pushes,
    resolve_module_relative_push,
    registered_selector_launch_target,
    typed_table_launch_target,
)


@dataclass(frozen=True)
class TargetEntry:
    index: int
    target_offset: int


class ExtractDialogueCallGraphTest(unittest.TestCase):
    def test_live_argument_pushes_skips_reclaimed_nested_call_words(self):
        instructions = [
            (0x100, "mov.l", "r6,@-r13", None),
            (0x102, "mov.l", "r5,@-r13", None),
            (0x104, "mov.l", "r4,@-r13", None),
            (0x106, "mov.l", "r7,@-r13", None),
            (0x108, "jsr", "@r0", None),
            (0x10A, "mov", "r13,r6", None),
            (0x10C, "add", "#12,r13", None),
            (0x10E, "mov", "r0,r4", None),
            (0x110, "mov.l", "r4,@-r13", None),
            (0x112, "jsr", "@r0", None),
        ]

        self.assertEqual(
            live_argument_pushes(instructions, 9, 2, 0x100),
            [8, 0],
        )

    def test_module_relative_target_accepts_non_r1_relative_register(self):
        instructions = [
            (0x100, "mov.l", "0x120,r5", 0x240),
            (0x102, "mov.l", "@(0,r8),r7", None),
            (0x104, "add", "r5,r7", None),
            (0x106, "mov.l", "r7,@-r13", None),
        ]

        self.assertEqual(
            resolve_module_relative_push(instructions, 3, 0x30),
            0x270,
        )

    def test_module_relative_payload_is_an_exact_function_pointer(self):
        instructions = [
            (0x100, "mov.l", "0x120,r5", 0x240),
            (0x102, "mov.l", "@(0,r8),r7", None),
            (0x104, "add", "r5,r7", None),
            (0x106, "mov.l", "r7,@-r13", None),
        ]

        self.assertEqual(
            launch_argument_json(
                instructions,
                3,
                0x300,
                scn3_offset=0x30,
                starts={0x270},
            ),
            {
                "kind": "function-pointer",
                "value": 0x270,
                "targetFileOffset": "0x270",
                "source": "0x106",
            },
        )

    def test_coroutine_launch_preserves_implicit_live_frame_word(self):
        instructions = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#-4,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov", "#25,r4", None),
            (0x10A, "mov", "#42,r6", None),
            (0x10C, "mov", "#3,r5", None),
            (0x10E, "mov.l", "0x130,r1", 0x150),
            (0x110, "mov.l", "@(0,r8),r7", None),
            (0x112, "add", "r1,r7", None),
            (0x114, "mov.l", "r4,@-r13", None),
            (0x116, "mov.l", "r6,@-r13", None),
            (0x118, "mov.l", "r5,@-r13", None),
            (0x11A, "mov.l", "r7,@-r13", None),
            (0x11C, "mov", "#2,r5", None),
            (0x11E, "mov.l", "@(40,r8),r0", None),
            (0x120, "mov.l", "@(52,r8),r4", None),
            (0x122, "jsr", "@r0", None),
            (0x124, "mov", "r13,r6", None),
            (0x126, "add", "#16,r13", None),
            (0x130, "mov.l", "r14,@-r13", None),
            (0x132, "sts.l", "pr,@-r13", None),
        ]
        calls = [{
            "operationId": 2,
            "callFileOffset": "0x122",
            "argumentCount": 4,
            "arguments": [
                {"kind": "runtime"},
                {"kind": "constant", "value": 3},
                {"kind": "constant", "value": 42},
                {"kind": "constant", "value": 25},
            ],
        }]

        launches = coroutine_launches(
            instructions,
            calls,
            [0x100, 0x180],
            0x30,
            0x30,
            0x200,
        )

        self.assertEqual(launches, [{
            "source": 0x100,
            "target": 0x180,
            "call": 0x122,
            "argumentCount": 3,
            "arguments": [
                {
                    "kind": "constant",
                    "value": 42,
                    "hex": "0x0000002a",
                    "source": "0x10a",
                },
                {
                    "kind": "constant",
                    "value": 25,
                    "hex": "0x00000019",
                    "source": "0x108",
                },
                {
                    "kind": "frame-field",
                    "offset": 0,
                    "source": "live word at @r13/@r14 after launch cleanup",
                },
            ],
            "implicitArgumentCount": 1,
        }])

    def test_typed_table_target_retains_order_and_distinct_candidates(self):
        data = bytearray(0x100)
        data[0x3C:0x40] = (0xDEADBEEF).to_bytes(4, "little")
        for index, relative in enumerate((0x60, 0x80, 0x60)):
            offset = 0x40 + index * 4
            data[offset:offset + 4] = relative.to_bytes(4, "little")
        data[0x4C:0x50] = (0xCAFEBABE).to_bytes(4, "little")
        operation = {
            "operationId": 0x009A,
            "arguments": [
                {"kind": "static-pointer", "value": 0x40},
                {"kind": "constant", "value": 8},
                {"kind": "frame-field", "offset": 4},
            ],
        }

        result = typed_table_launch_target(
            {"kind": "call-result", "source": "0x120"},
            {"0x120": operation},
            bytes(data),
            {0x70, 0x90},
            0x10,
        )

        self.assertEqual(result["targetFileOffsets"], ["0x70", "0x90"])
        self.assertEqual(
            [item["targetFileOffset"] for item in result["targetTable"]],
            ["0x70", "0x90", "0x70"],
        )
        self.assertEqual(
            result["targetSource"]["tableBaseFileOffset"],
            "0x40",
        )

    def test_registered_selector_requires_bound_and_indexed_table_load(self):
        instructions = [
            (0x100, "mov.l", "@(4,r14),r4", None),
            (0x102, "mov", "#4,r5", None),
            (0x104, "cmp/gt", "r4,r5", None),
            (0x106, "mov.l", "0x140,r5", 0x90),
            (0x108, "add", "r9,r5", None),
            (0x10A, "mov.l", "@(4,r14),r6", None),
            (0x10C, "mov", "#2,r7", None),
            (0x10E, "shad", "r7,r6", None),
            (0x110, "add", "r6,r5", None),
            (0x112, "mov.l", "@r5,r5", None),
        ]
        calls = [{
            "operationId": 0x009A,
            "callFileOffset": "0x120",
            "arguments": [
                {"kind": "runtime"},
                {"kind": "constant", "value": 4},
                {"kind": "frame-field", "offset": 12},
            ],
        }]
        targets = [
            TargetEntry(index=index, target_offset=target)
            for index, target in enumerate((0x80, 0x100, 0x200, 0x300, 0x400, 0x500))
        ]

        result = registered_selector_launch_target(
            {"kind": "frame-field", "offset": 4},
            calls,
            instructions,
            0x100,
            0x180,
            targets,
        )

        self.assertEqual(
            result["targetFileOffsets"],
            ["0x200", "0x300", "0x400", "0x500"],
        )
        self.assertEqual(
            result["targetSource"]["registeredTableGlobalOffsets"],
            [0x90],
        )


if __name__ == "__main__":
    unittest.main()
