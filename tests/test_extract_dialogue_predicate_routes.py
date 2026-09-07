#!/usr/bin/env python3

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_dialogue_predicate_routes import (  # noqa: E402
    TRUE,
    build_report,
    combine,
    compare,
    expression_json,
    execute_noncall,
    formula_has_opaque,
    required_scene_equalities,
    simulate_function,
)


class DialoguePredicateRoutesTest(unittest.TestCase):
    def test_boolean_composition_is_canonical(self):
        first = ("compare", "cmp/eq", ("scene-field", 0x84, 4, False), ("const", 6))
        second = ("compare", "cmp/gt", ("scene-field", 0xCC, 1, True), ("const", 6))
        self.assertEqual(combine("and", TRUE, second, first, second), combine("and", first, second))

    def test_expression_json_preserves_native_sources(self):
        value = (
            "compare",
            "cmp/eq",
            ("operation-result", 0x51, (("constant", 11), ("constant", 100)), 0x7AC0A),
            ("const", 0),
        )
        encoded = expression_json(value)
        self.assertEqual(encoded["left"]["operationHex"], "0x0051")
        self.assertEqual([item["value"] for item in encoded["left"]["arguments"]], [11, 100])

    def test_unsupported_expression_is_not_counted_as_fully_resolved(self):
        predicate = (
            "compare",
            "cmp/eq",
            ("bitwise-not", ("mask", ("unknown",))),
            ("const", 0),
        )
        self.assertTrue(formula_has_opaque(predicate))

    def test_bitwise_not_of_boolean_mask_preserves_exact_negation(self):
        state = {
            "registers": {
                "r1": ("mask", ("compare", "cmp/eq", ("const", 1), ("const", 2))),
                "r2": ("unknown",),
            },
            "stack": {},
            "sp": 0,
            "t": ("unknown",),
            "path": TRUE,
        }
        execute_noncall((0, "not", "r1,r2", None), state)
        self.assertEqual(
            state["registers"]["r2"],
            ("mask", ("not", ("compare", "cmp/eq", ("const", 1), ("const", 2)))),
        )

    def test_only_positive_required_scene_equalities_are_candidates(self):
        positive = (
            "compare",
            "cmp/eq",
            ("scene-field", 0x84, 4, False),
            ("const", 6),
        )
        predicate = (
            "and",
            positive,
            ("not", ("compare", "cmp/eq", ("scene-field", 0x84, 4, False), ("const", 5))),
            ("or", positive, ("bool", False)),
        )
        self.assertEqual(required_scene_equalities(predicate), [(0x84, 6)])

    def test_boolean_absorption_converges_loop_paths(self):
        condition = (
            "compare",
            "cmp/eq",
            ("scene-field", 0x84, 4, False),
            ("const", 6),
        )
        self.assertEqual(
            combine("or", condition, combine("and", condition, ("const", 7))),
            condition,
        )
        self.assertEqual(
            combine("and", condition, ("not", condition)),
            ("bool", False),
        )

    def test_cyclic_cfg_reaches_guarded_call_by_fixed_point(self):
        function = {
            "fileOffset": "0x100",
            "basicBlocks": [
                {
                    "startFileOffset": "0x100",
                    "endFileOffsetExclusive": "0x108",
                    "successors": ["0x108", "0x110"],
                    "terminator": {
                        "fileOffset": "0x104",
                        "mnemonic": "bt",
                        "operands": "0x108",
                    },
                },
                {
                    "startFileOffset": "0x108",
                    "endFileOffsetExclusive": "0x10c",
                    "successors": ["0x100"],
                    "terminator": {
                        "fileOffset": "0x10a",
                        "mnemonic": "bra",
                        "operands": "0x100",
                    },
                },
                {
                    "startFileOffset": "0x110",
                    "endFileOffsetExclusive": "0x114",
                    "successors": [],
                    "terminator": None,
                },
            ],
            "nativeOperations": [],
            "directCalls": [
                {
                    "callFileOffset": "0x110",
                    "targetFileOffset": "0x200",
                },
            ],
            "childCoroutineLaunches": [],
        }
        rows = {
            0x100: (0x100, "mov.l", "@(0x84,r9),r1", None),
            0x102: (0x102, "cmp/eq", "#6,r1", None),
            0x104: (0x104, "bt", "0x108", None),
            0x106: (0x106, "nop", "", None),
            0x108: (0x108, "bra", "0x100", None),
            0x10A: (0x10A, "nop", "", None),
            0x110: (0x110, "bsr", "0x200", None),
            0x112: (0x112, "nop", "", None),
        }
        calls, coverage = simulate_function(
            function,
            rows,
            sorted(rows),
        )
        self.assertEqual(coverage["status"], "fixed-point-cyclic")
        self.assertEqual(len(calls), 1)
        self.assertEqual(
            calls[0]["predicate"],
            (
                "not",
                (
                    "compare",
                    "cmp/eq",
                    ("scene-field", 0x84, 4, False),
                    ("const", 6),
                ),
            ),
        )

    def test_disc_one_dobuita_recovers_exact_hato_gate(self):
        root = Path(__file__).resolve().parents[1]
        index_path = root / ".disc-work/dialogue/scripted-event-control-flow-index.json"
        if not index_path.exists():
            self.skipTest("private control-flow fixture unavailable")
        index = json.loads(index_path.read_text())
        maps = [
            item for item in index["maps"]
            if item["disc"] == 1 and item["area"] == "D000"
        ]
        if not maps or not Path(maps[0]["source"]).exists():
            self.skipTest("private Disc 1 Dobuita fixture unavailable")
        spatial_path = (
            root
            / "tools/evidence/spatial-interaction-system-inventory.json"
        )
        spatial = json.loads(spatial_path.read_text())
        report = build_report(
            {"maps": maps},
            "sh4-linux-gnu-objdump",
            spatial,
        )
        route = next(
            route
            for item in report["maps"]
            for route in item["routes"]
            if route["callFileOffset"] == "0x7ac72"
        )
        self.assertFalse(route["containsOpaqueTerm"])
        self.assertEqual(route["dialogueDescendants"][0]["actorTags"], ["HATO"])
        self.assertEqual(route["spatialTriggers"][0]["spatialRecordIndex"], 5)
        predicate = json.dumps(route["predicate"], sort_keys=True)
        self.assertIn('"operationHex": "0x0051"', predicate)
        self.assertIn('"fieldOffset": "0x84"', predicate)
        self.assertIn('"fieldOffset": "0xcc"', predicate)


if __name__ == "__main__":
    unittest.main()
