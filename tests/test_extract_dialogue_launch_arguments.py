#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_dialogue_launch_arguments import (  # noqa: E402
    frame_argument_base,
    pushed_arguments,
    resolve_parameter_values,
)


class DialogueLaunchArgumentsTest(unittest.TestCase):
    def test_recovers_literal_direct_call_arguments(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#0,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov.l", "0x120,r4", 0x304C4554),
            (0x10A, "mov.l", "r4,@-r13", None),
            (0x10C, "mov.l", "0x124,r1", 0x20),
            (0x10E, "bsrf", "r1", None),
            (0x110, "nop", "", None),
            (0x112, "add", "#4,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(base, 8)
        arguments = pushed_arguments(rows, 7, 0, base)
        self.assertEqual(arguments[0]["ascii"], "TEL0")
        self.assertAlmostEqual(arguments[0]["float32"], 7.432691e-10)

    def test_recovers_unchanged_caller_argument(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#-8,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov.l", "@(16,r14),r4", None),
            (0x10A, "mov.l", "r4,@-r13", None),
            (0x10C, "mov.l", "0x124,r1", 0x20),
            (0x10E, "bsrf", "r1", None),
            (0x110, "nop", "", None),
            (0x112, "add", "#4,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(base, 16)
        arguments = pushed_arguments(rows, 7, 0, base)
        self.assertEqual(
            arguments[0],
            {
                "kind": "caller-argument",
                "index": 0,
                "frameOffset": 16,
                "sourceFileOffset": "0x108",
            },
        )

    def test_preserves_exact_local_byte_frame_argument(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#-8,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov.b", "@(7,r14),r4", None),
            (0x10A, "mov.l", "r4,@-r13", None),
            (0x10C, "bsrf", "r1", None),
            (0x10E, "nop", "", None),
            (0x110, "add", "#4,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(base, 16)
        self.assertEqual(pushed_arguments(rows, 6, 0, base), [{
            "kind": "frame-field",
            "offset": 7,
            "width": 1,
            "sourceFileOffset": "0x108",
        }])

    def test_recovers_exact_mapinfo_base_address_arguments(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#0,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov.l", "@(4,r8),r4", None),
            (0x10A, "mov.l", "0x130,r1", 0xCA14),
            (0x10C, "add", "r1,r4", None),
            (0x10E, "mov.l", "@(4,r8),r5", None),
            (0x110, "mov.l", "0x134,r1", 0xCA04),
            (0x112, "add", "r1,r5", None),
            (0x114, "mov.l", "r4,@-r13", None),
            (0x116, "mov.l", "r5,@-r13", None),
            (0x118, "bsrf", "r1", None),
            (0x11A, "nop", "", None),
            (0x11C, "add", "#8,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(
            pushed_arguments(rows, 12, 0, base),
            [
                {
                    "kind": "static-pointer",
                    "value": 0xCA04,
                    "hex": "0x0000ca04",
                    "sourceFileOffset": "0x112",
                },
                {
                    "kind": "static-pointer",
                    "value": 0xCA14,
                    "hex": "0x0000ca14",
                    "sourceFileOffset": "0x10c",
                },
            ],
        )

    def test_recovers_indexed_coroutine_frame_argument(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#0,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov", "#31,r0", None),
            (0x10A, "mov.b", "@(r0,r14),r4", None),
            (0x10C, "mov.l", "r4,@-r13", None),
            (0x10E, "bsrf", "r1", None),
            (0x110, "nop", "", None),
            (0x112, "add", "#4,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(pushed_arguments(rows, 7, 0, base), [{
            "kind": "frame-field",
            "offset": 31,
            "width": 1,
            "sourceFileOffset": "0x10a",
        }])

    def test_propagates_wrapper_parameter_without_guessing(self):
        incoming = {
            0x200: [{
                "source": 0x100,
                "target": 0x200,
                "arguments": [{
                    "kind": "constant",
                    "value": 7,
                    "hex": "0x00000007",
                }],
            }],
            0x300: [{
                "source": 0x200,
                "target": 0x300,
                "arguments": [{
                    "kind": "caller-argument",
                    "index": 0,
                }],
            }],
        }
        values = resolve_parameter_values(0x300, 0, incoming)
        self.assertEqual(values[0]["value"], 7)

    def test_preserves_conflicting_callers_as_alternatives(self):
        incoming = {
            0x200: [
                {
                    "source": 0x100,
                    "arguments": [{
                        "kind": "constant",
                        "value": 1,
                        "hex": "0x00000001",
                    }],
                },
                {
                    "source": 0x110,
                    "arguments": [{
                        "kind": "constant",
                        "value": 2,
                        "hex": "0x00000002",
                    }],
                },
            ],
        }
        values = resolve_parameter_values(0x200, 0, incoming)
        self.assertEqual({value["value"] for value in values}, {1, 2})


if __name__ == "__main__":
    unittest.main()
