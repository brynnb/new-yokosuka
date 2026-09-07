#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.analyze_dialogue_reachable_sh4 import (  # noqa: E402
    normalized_signature,
    reachable_in_function,
    source_safe_summary,
)


class ReachableSh4Test(unittest.TestCase):
    def test_skips_literal_pool_through_braf(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "bf", "0x10c", None),
            (0x104, "mov.l", "0x108,r1", 0x08),
            (0x106, "braf", "r1", None),
            (0x108, "nop", "", None),
            (0x10A, ".word", "0x1234", None),
            (0x10C, "rts", "", None),
            (0x10E, "nop", "", None),
            (0x112, "rts", "", None),
            (0x114, "nop", "", None),
        ]
        reached, unresolved = reachable_in_function(rows, 0x100, 0x116)
        self.assertEqual(
            reached,
            {0x100, 0x102, 0x104, 0x106, 0x108, 0x10C, 0x10E, 0x112, 0x114},
        )
        self.assertNotIn(0x10A, reached)
        self.assertEqual(unresolved, [])

    def test_delayed_conditional_reaches_both_paths_after_delay(self):
        rows = [
            (0x200, "bf.s", "0x208", None),
            (0x202, "mov", "#1,r4", None),
            (0x204, "rts", "", None),
            (0x206, "nop", "", None),
            (0x208, "rts", "", None),
            (0x20A, "nop", "", None),
        ]
        reached, unresolved = reachable_in_function(rows, 0x200, 0x20C)
        self.assertEqual(reached, {0x200, 0x202, 0x204, 0x206, 0x208, 0x20A})
        self.assertEqual(unresolved, [])

    def test_indirect_jump_is_retained_as_unresolved_boundary(self):
        rows = [
            (0x300, "jmp", "@r0", None),
            (0x302, "nop", "", None),
        ]
        reached, unresolved = reachable_in_function(rows, 0x300, 0x304)
        self.assertEqual(reached, {0x300, 0x302})
        self.assertEqual(unresolved[0]["reason"], "indirect jump target")

    def test_operand_signature_preserves_addressing_shape(self):
        self.assertEqual(
            normalized_signature("mov.l", "@(52,r8),r4"),
            "mov.l @(IMM,rN),rN",
        )

    def test_source_safe_summary_omits_per_map_binary_details(self):
        report = {
            "schema": "new-yokosuka-dialogue-reachable-sh4-profile-v1",
            "evidenceBoundary": ["boundary"],
            "summary": {"reachableInstructionCount": 3},
            "reachableMnemonics": {"mov": 3},
            "dialoguePathReachableMnemonics": {"mov": 2},
            "reachableOperandSignatures": {"mov rN,rN": 3},
            "dialoguePathReachableOperandSignatures": {"mov rN,rN": 2},
            "maps": [{"source": "/private/original/MAPINFO.BIN"}],
        }
        summary = source_safe_summary(report)
        self.assertNotIn("maps", summary)
        self.assertEqual(summary["summary"]["reachableInstructionCount"], 3)


if __name__ == "__main__":
    unittest.main()
