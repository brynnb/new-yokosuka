#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.worlds.extract_jomo_object_operations import (  # noqa: E402
    call_argument_count,
    call_argument_count_evidence,
)


class ExtractJomoObjectOperationsTest(unittest.TestCase):
    def test_follows_direct_branch_to_shared_stack_cleanup(self):
        instructions = [
            (0x100, "jsr", "@r0", None),
            (0x102, "mov", "r13,r6", None),
            (0x104, "bra", "0x120", None),
            (0x106, "nop", "", None),
            (0x120, "add", "#16,r13", None),
            (0x122, "mov", "r0,r4", None),
        ]

        self.assertEqual(call_argument_count(instructions, 0), 4)
        self.assertEqual(
            call_argument_count_evidence(instructions, 0),
            (4, "direct-branch-shared-cleanup"),
        )

    def test_does_not_follow_indirect_or_conditional_cleanup(self):
        instructions = [
            (0x100, "jsr", "@r0", None),
            (0x102, "mov", "r13,r6", None),
            (0x104, "bf", "0x120", None),
            (0x106, "nop", "", None),
            (0x120, "add", "#16,r13", None),
        ]

        self.assertIsNone(call_argument_count(instructions, 0))


if __name__ == "__main__":
    unittest.main()
