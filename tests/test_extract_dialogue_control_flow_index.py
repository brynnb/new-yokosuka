#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_dialogue_control_flow_index import (  # noqa: E402
    attach_dialogue_regions,
    basic_blocks,
    call_result_expression_branch_predicates,
    comparison_branch_outcomes,
    frame_expression_branch_predicates,
    frame_field_comparisons,
    frame_field_additions,
    frame_field_constant_writes,
    frame_field_expression_writes,
    frame_field_scene_writes,
    function_return_value,
    indirect_call_json,
    map_indexes,
    native_event_functions,
    operation_argument,
    operation_json,
    operation_result_comparison,
    operation_result_numeric_transform,
    operation_result_target,
    scene_field_comparisons,
    scene_field_bitwise_writes,
    scene_field_constant_writes,
    scripted_map_graphs,
    summary_report,
)
from tools.scripting.extract_dialogue_launch_arguments import (  # noqa: E402
    frame_argument_base,
    pushed_arguments,
)
from tools.scripting.native_event_dataflow import (  # noqa: E402
    SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE,
)


class DialogueControlFlowIndexTest(unittest.TestCase):
    def test_recovers_interleaved_0084_request_around_019c_query(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "@(4,r8),r4", None),
                (0x102, "add", "#128,r4", None),
                (0x104, "mov.l", "0x45455246,r5", 0x45455246),
                (0x106, "mov.l", "r4,@-r13", None),
                (0x108, "mov.l", "r5,@-r13", None),
                (0x10A, "mov.l", "0x19c,r5", 0x019C),
                (0x10C, "mov.l", "@(40,r8),r0", None),
                (0x10E, "mov.l", "@(52,r8),r4", None),
                (0x110, "jsr", "@r0", None),
                (0x112, "mov", "r13,r6", None),
                (0x114, "mov", "r0,r4", None),
                (0x116, "mov.l", "r4,@-r13", None),
                (0x118, "mov.l", "0x84,r5", 0x0084),
                (0x11A, "mov.l", "@(40,r8),r0", None),
                (0x11C, "mov.l", "@(52,r8),r4", None),
                (0x11E, "jsr", "@r0", None),
                (0x120, "mov", "r13,r6", None),
                (0x122, "add", "#12,r13", None),
            ]
        }
        unresolved = {"kind": "unresolved"}
        call = {
            "callFileOffset": "0x11e",
            "operationId": 0x0084,
            "operationHex": "0x0084",
            "arguments": [
                unresolved,
                unresolved,
                {"kind": "call-result", "source": "0x110"},
            ],
        }
        arguments = operation_json(call, rows, 0x200)["arguments"]
        self.assertEqual(
            [(item["kind"], item.get("value")) for item in arguments],
            [
                ("call-result", None),
                ("constant", 0x45455246),
                ("static-pointer", 0x280),
            ],
        )
        self.assertEqual(arguments[0]["source"], "0x110")

    def test_recovers_interleaved_019e_descriptor_around_019c_query(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#6,r4", None),
                (0x102, "mov.l", "0x4c4fc7,r5", 0x004C4FC7),
                (0x104, "mov", "#-1,r6", None),
                (0x106, "mov", "#17,r7", None),
                (0x108, "mov.l", "r4,@-r13", None),
                (0x10A, "mov.l", "r5,@-r13", None),
                (0x10C, "mov.l", "r6,@-r13", None),
                (0x10E, "mov.l", "r7,@-r13", None),
                (0x110, "mov.l", "0x30303044,r4", 0x30303044),
                (0x112, "mov.l", "r4,@-r13", None),
                (0x114, "mov.l", "0x19c,r5", 0x019C),
                (0x116, "mov.l", "@(40,r8),r0", None),
                (0x118, "mov.l", "@(52,r8),r4", None),
                (0x11A, "jsr", "@r0", None),
                (0x11C, "mov", "r13,r6", None),
                (0x11E, "mov", "r0,r4", None),
                (0x120, "mov", "#4,r5", None),
                (0x122, "mov.l", "r4,@-r13", None),
                (0x124, "mov.l", "r5,@-r13", None),
                (0x126, "mov.l", "0x19e,r5", 0x019E),
                (0x128, "mov.l", "@(40,r8),r0", None),
                (0x12A, "mov.l", "@(52,r8),r4", None),
                (0x12C, "jsr", "@r0", None),
                (0x12E, "mov", "r13,r6", None),
                (0x130, "add", "#28,r13", None),
            ]
        }
        unresolved = {"kind": "unresolved"}
        call = {
            "callFileOffset": "0x12c",
            "operationId": 0x019E,
            "operationHex": "0x019e",
            "arguments": [
                unresolved,
                unresolved,
                unresolved,
                unresolved,
                unresolved,
                {"kind": "constant", "value": 4, "source": "0x120"},
                {"kind": "call-result", "source": "0x11a"},
            ],
        }
        arguments = operation_json(call, rows, 0x200)["arguments"]
        self.assertEqual(
            [(item["kind"], item.get("value")) for item in arguments],
            [
                ("constant", 4),
                ("call-result", None),
                ("constant", 0x30303044),
                ("constant", 17),
                ("constant", 0xFFFFFFFF),
                ("constant", 0x004C4FC7),
                ("constant", 6),
            ],
        )

    def test_parallel_map_index_requires_a_positive_worker_count(self):
        with self.assertRaisesRegex(ValueError, "worker count must be positive"):
            map_indexes([], {}, "objdump", "scripted-events", 0)

    def test_all_disc_scripted_catalog_is_not_limited_to_dialogue_maps(self):
        maps = scripted_map_graphs({
            "maps": [{
                "scene": 3,
                "area": "MEND",
                "source": "extracted_disc3_v2/data/SCENE/03/MEND/MAPINFO.BIN",
            }, {
                "scene": 1,
                "area": "OP00",
                "source": "extracted_files/data/SCENE/01/OP00/MAPINFO.BIN",
            }],
        })
        self.assertEqual(
            [(item["disc"], item["area"]) for item in maps],
            [(1, "OP00"), (3, "MEND")],
        )
        self.assertTrue(all(Path(item["source"]).is_absolute() for item in maps))

    def test_dialogue_regions_join_onto_reusable_scripted_control_flow(self):
        report = {
            "summary": {"dialogueRegionCount": 0},
            "maps": [{
                "source": "example/MAPINFO.BIN",
                "scriptedEventFunctions": [{
                    "fileOffset": "0x120",
                    "dialogueRegion": None,
                }, {
                    "fileOffset": "0x180",
                    "dialogueRegion": None,
                }],
            }],
        }
        regions = {"regions": [{
            "mapinfo": "example/MAPINFO.BIN",
            "regionStartFileOffset": "0x180",
            "executableTargetIndex": 7,
            "voiceIds": [1001],
            "actorTags": ["AKIR"],
        }]}
        self.assertEqual(attach_dialogue_regions(report, regions), 1)
        self.assertIsNone(
            report["maps"][0]["scriptedEventFunctions"][0]["dialogueRegion"]
        )
        self.assertEqual(
            report["maps"][0]["scriptedEventFunctions"][1]["dialogueRegion"],
            {
                "executableTargetIndex": 7,
                "voiceIds": [1001],
                "actorTags": ["AKIR"],
            },
        )
        self.assertEqual(report["summary"]["dialogueRegionCount"], 1)

    def test_recovers_frame_comparison_against_literal_fourcc(self):
        rows = [
            (0x100, "mov.l", "@(0,r14),r4", None),
            (0x102, "mov.l", "0x120,r5", 0x314B4254),
            (0x104, "cmp/eq", "r5,r4", None),
            (0x106, "bf", "0x120", None),
            (0x108, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x100, 0x122)[0]
        self.assertEqual(comparison["constant"], 0x314B4254)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x108",
        )

    def test_recovers_or_composed_frame_fourcc_predicate(self):
        rows = [
            (0x100, "mov.l", "@(0,r14),r4", None),
            (0x102, "mov.l", "0x140,r5", 0x304C4554),
            (0x104, "cmp/eq", "r5,r4", None),
            (0x106, "subc", "r4,r4", None),
            (0x108, "mov.l", "@(0,r14),r5", None),
            (0x10A, "mov.l", "0x144,r6", 0x85),
            (0x10C, "cmp/eq", "r6,r5", None),
            (0x10E, "subc", "r5,r5", None),
            (0x110, "or", "r5,r4", None),
            (0x112, "mov", "r4,r0", None),
            (0x114, "cmp/eq", "#0,r0", None),
            (0x116, "bf", "0x130", None),
            (0x118, "nop", "", None),
            (0x130, "rts", "", None),
        ]
        blocks = basic_blocks(rows, 0x100, 0x132)
        predicate = frame_expression_branch_predicates(rows, blocks)[0]
        self.assertEqual(predicate["expression"]["kind"], "equal")
        self.assertEqual(
            predicate["expression"]["left"]["kind"],
            "bitwise-or",
        )
        self.assertEqual(
            predicate["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x130",
        )

    def test_recovers_register_indexed_frame_field_comparison(self):
        rows = [
            (0x100, "mov", "#126,r0", None),
            (0x102, "mov.w", "@(r0,r14),r4", None),
            (0x104, "mov", "#0,r5", None),
            (0x106, "cmp/eq", "r5,r4", None),
            (0x108, "subc", "r4,r4", None),
            (0x10a, "mov", "r4,r0", None),
            (0x10c, "cmp/eq", "#0,r0", None),
            (0x10e, "bf", "0x120", None),
            (0x110, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x100, 0x122)[0]
        self.assertEqual(comparison["fieldOffset"], 126)
        self.assertEqual(comparison["constant"], 0)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x120",
        )

    def test_recovers_compound_register_indexed_frame_predicate(self):
        rows = [
            (0x100, "mov", "#126,r0", None),
            (0x102, "mov.w", "@(r0,r14),r4", None),
            (0x104, "mov", "#19,r5", None),
            (0x106, "cmp/ge", "r5,r4", None),
            (0x108, "subc", "r4,r4", None),
            (0x10a, "mov", "#126,r0", None),
            (0x10c, "mov.w", "@(r0,r14),r5", None),
            (0x10e, "mov", "#27,r6", None),
            (0x110, "cmp/gt", "r5,r6", None),
            (0x112, "subc", "r5,r5", None),
            (0x114, "and", "r5,r4", None),
            (0x116, "mov", "r4,r0", None),
            (0x118, "cmp/eq", "#0,r0", None),
            (0x11a, "bf", "0x130", None),
            (0x11c, "nop", "", None),
            (0x130, "rts", "", None),
        ]
        blocks = basic_blocks(rows, 0x100, 0x132)
        predicate = frame_expression_branch_predicates(rows, blocks)[0]
        self.assertEqual(predicate["expression"]["kind"], "equal")
        self.assertEqual(
            predicate["expression"]["left"]["kind"],
            "bitwise-and",
        )

    def test_recovers_scene_and_stacked_call_result_expression(self):
        rows = [
            (0x100, "mov.l", "0x180,r0", 0xf8),
            (0x102, "mov.l", "@(r0,r9),r4", None),
            (0x104, "mov.l", "0x184,r5", 400),
            (0x106, "cmp/ge", "r5,r4", None),
            (0x108, "subc", "r4,r4", None),
            (0x10a, "mov.l", "r4,@-r13", None),
            (0x10c, "mov", "#7,r5", None),
            (0x10e, "mov", "#11,r6", None),
            (0x110, "mov.l", "r5,@-r13", None),
            (0x112, "mov.l", "r6,@-r13", None),
            (0x114, "jsr", "@r0", None),
            (0x116, "mov", "r13,r6", None),
            (0x118, "add", "#8,r13", None),
            (0x11a, "mov", "r0,r4", None),
            (0x11c, "mov", "#0,r5", None),
            (0x11e, "cmp/eq", "r5,r4", None),
            (0x120, "subc", "r4,r4", None),
            (0x122, "mov.l", "@r13+,r5", None),
            (0x124, "and", "r4,r5", None),
            (0x126, "mov", "r5,r0", None),
            (0x128, "cmp/eq", "#0,r0", None),
            (0x12a, "bf", "0x140", None),
            (0x12c, "nop", "", None),
            (0x140, "rts", "", None),
        ]
        blocks = basic_blocks(rows, 0x100, 0x142)
        predicates = call_result_expression_branch_predicates(rows, blocks)
        self.assertEqual(len(predicates), 1)
        self.assertEqual(predicates[0]["sourceCallFileOffset"], "0x114")
        self.assertEqual(predicates[0]["compareFileOffset"], "0x128")
        self.assertEqual(
            predicates[0]["expression"]["left"]["operand"]["left"],
            {
                "kind": "scene-field",
                "offset": 0xf8,
                "width": 4,
                "signedLoad": False,
            },
        )
        self.assertEqual(
            predicates[0]["expression"]["right"]["operand"]["left"],
            {"kind": "call-result", "callFileOffset": "0x114"},
        )

    def test_recovers_exact_constant_branch_expression(self):
        rows = [
            (0x100, "mov", "#-1,r4", None),
            (0x102, "mov", "r4,r0", None),
            (0x104, "cmp/eq", "#0,r0", None),
            (0x106, "bf", "0x120", None),
            (0x108, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        blocks = basic_blocks(rows, 0x100, 0x122)
        self.assertEqual(
            frame_expression_branch_predicates(rows, blocks),
            [{
                "comparison": "frame-expression",
                "expression": {
                    "kind": "equal",
                    "left": {"kind": "constant", "value": 0xffffffff},
                    "right": {"kind": "constant", "value": 0},
                },
                "compareFileOffset": "0x104",
                "resolvedBranch": {
                    "branchFileOffset": "0x106",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x120",
                    "branchFallthroughFileOffset": "0x108",
                    "comparisonTrueSuccessor": "0x108",
                    "comparisonFalseSuccessor": "0x120",
                },
            }],
        )

    def test_recovers_compound_float_frame_branch_expression(self):
        rows = [
            (0x100, "mov.l", "@(4,r14),r4", None),
            (0x102, "mov.l", "0x140,r5", 0x42480000),
            (0x104, "lds", "r5,fpul", None),
            (0x106, "fsts", "fpul,fr3", None),
            (0x108, "lds", "r4,fpul", None),
            (0x10A, "fsts", "fpul,fr2", None),
            (0x10C, "fcmp/gt", "fr3,fr2", None),
            (0x10E, "subc", "r4,r4", None),
            (0x110, "mov", "r4,r0", None),
            (0x112, "cmp/eq", "#0,r0", None),
            (0x114, "bf", "0x120", None),
            (0x116, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        blocks = basic_blocks(rows, 0x100, 0x122)
        self.assertEqual(
            frame_expression_branch_predicates(rows, blocks),
            [{
                "comparison": "frame-expression",
                "expression": {
                    "kind": "equal",
                    "left": {
                        "kind": "boolean-mask",
                        "operand": {
                            "kind": "float32-greater-than",
                            "left": {
                                "kind": "float32-from-word",
                                "operand": {
                                    "kind": "frame-field",
                                    "offset": 4,
                                    "width": 4,
                                    "signedLoad": False,
                                },
                            },
                            "right": {
                                "kind": "float32-from-word",
                                "operand": {
                                    "kind": "constant",
                                    "value": 0x42480000,
                                },
                            },
                        },
                    },
                    "right": {"kind": "constant", "value": 0},
                },
                "compareFileOffset": "0x112",
                "resolvedBranch": {
                    "branchFileOffset": "0x114",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x120",
                    "branchFallthroughFileOffset": "0x116",
                    "comparisonTrueSuccessor": "0x116",
                    "comparisonFalseSuccessor": "0x120",
                },
            }],
        )

    def test_recovers_exact_frame_integer_expression_writes(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#8,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov", "#1,r5", None),
                (0x106, "add", "r5,r4", None),
                (0x108, "mov.b", "@(2,r14),r0", None),
                (0x10A, "mov", "r0,r5", None),
                (0x10C, "mov", "#5,r6", None),
                (0x10E, "neg", "r6,r6", None),
                (0x110, "shad", "r6,r5", None),
                (0x112, "mov", "#7,r6", None),
                (0x114, "and", "r6,r5", None),
                (0x116, "mov.b", "r5,@r4", None),
            ]
        }
        self.assertEqual(frame_field_expression_writes(rows), [{
            "kind": "frameFieldExpressionWrite",
            "callFileOffset": "0x116",
            "offset": 9,
            "width": 1,
            "expression": {
                "kind": "bitwise-and",
                "left": {
                    "kind": "arithmetic-shift",
                    "operand": {
                        "kind": "frame-field",
                        "offset": 2,
                        "width": 1,
                        "signedLoad": True,
                    },
                    "count": -5,
                },
                "right": {"kind": "constant", "value": 7},
            },
        }])

    def test_recovers_literal_indexed_frame_field_copy(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#0,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov.l", "0x180,r0", 144),
                (0x106, "mov.l", "@(r0,r14),r5", None),
                (0x108, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(frame_field_expression_writes(rows), [{
            "kind": "frameFieldExpressionWrite",
            "callFileOffset": "0x108",
            "offset": 0,
            "width": 4,
            "expression": {
                "kind": "frame-field",
                "offset": 144,
                "width": 4,
                "signedLoad": False,
            },
        }])

    def test_recovers_exact_frame_float_conversion_expression_writes(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#0,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov.l", "@(24,r14),r5", None),
                (0x106, "mov.l", "0x180,r6", 0x43B40000),
                (0x108, "lds", "r6,fpul", None),
                (0x10A, "fsts", "fpul,fr3", None),
                (0x10C, "lds", "r5,fpul", None),
                (0x10E, "fsts", "fpul,fr2", None),
                (0x110, "fdiv", "fr3,fr2", None),
                (0x112, "flds", "fr2,fpul", None),
                (0x114, "sts", "fpul,r5", None),
                (0x116, "mov.l", "0x184,r6", 0x00010000),
                (0x118, "lds", "r6,fpul", None),
                (0x11A, "float", "fpul,fr3", None),
                (0x11C, "lds", "r5,fpul", None),
                (0x11E, "fsts", "fpul,fr2", None),
                (0x120, "fmul", "fr3,fr2", None),
                (0x122, "ftrc", "fr2,fpul", None),
                (0x124, "sts", "fpul,r5", None),
                (0x126, "mov.l", "r5,@r4", None),
            ]
        }
        writes = frame_field_expression_writes(rows)
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["callFileOffset"], "0x126")
        self.assertEqual(writes[0]["offset"], 0)
        self.assertEqual(
            writes[0]["expression"]["kind"],
            "float32-truncate-to-signed-integer",
        )
        self.assertEqual(
            writes[0]["expression"]["operand"]["kind"],
            "float32-multiply",
        )
        argument = operation_argument({
            "kind": "runtime",
            "source": "sts at 0x124",
        }, rows)
        self.assertEqual(
            argument["kind"],
            "float32-truncate-to-signed-integer",
        )
        self.assertEqual(argument["operand"]["kind"], "float32-multiply")

    def test_recovers_computed_frame_address_comparison(self):
        instructions = [
            (0x100, "mov", "#8,r4", None),
            (0x102, "add", "r14,r4", None),
            (0x104, "mov", "#1,r5", None),
            (0x106, "add", "r5,r4", None),
            (0x108, "mov.b", "@r4,r4", None),
            (0x10A, "mov", "#0,r5", None),
            (0x10C, "cmp/eq", "r5,r4", None),
            (0x10E, "subc", "r4,r4", None),
            (0x110, "mov", "r4,r0", None),
            (0x112, "cmp/eq", "#0,r0", None),
            (0x114, "bf", "0x120", None),
            (0x116, "nop", "", None),
            (0x120, "nop", "", None),
        ]
        comparisons = frame_field_comparisons(
            instructions, 0x100, 0x122,
        )
        self.assertEqual(len(comparisons), 1)
        self.assertEqual(comparisons[0]["fieldOffset"], 9)
        self.assertEqual(comparisons[0]["constant"], 0)
        self.assertEqual(
            comparisons[0]["resolvedBranch"]["branchFileOffset"],
            "0x114",
        )

    def test_recovers_frame_field_pair_comparison(self):
        instructions = [
            (0x100, "mov", "#20,r4", None),
            (0x102, "add", "r14,r4", None),
            (0x104, "mov", "#1,r5", None),
            (0x106, "add", "r5,r4", None),
            (0x108, "mov.b", "@r4,r4", None),
            (0x10A, "mov", "#8,r5", None),
            (0x10C, "add", "r14,r5", None),
            (0x10E, "mov", "#1,r6", None),
            (0x110, "add", "r6,r5", None),
            (0x112, "mov.b", "@r5,r5", None),
            (0x114, "cmp/eq", "r5,r4", None),
            (0x116, "bf", "0x120", None),
            (0x118, "nop", "", None),
            (0x120, "nop", "", None),
        ]
        comparisons = frame_field_comparisons(
            instructions, 0x100, 0x122,
        )
        self.assertEqual(len(comparisons), 1)
        self.assertEqual(comparisons[0]["fieldOffset"], 9)
        self.assertEqual(comparisons[0]["otherFieldOffset"], 21)
        self.assertEqual(comparisons[0]["leftOperand"], "r5")
        self.assertEqual(comparisons[0]["rightOperand"], "r4")

    def test_recovers_direct_call_frame_abi_without_inferred_values(self):
        rows = [
            (0x100, "mov.l", "r14,@-r13", None),
            (0x102, "sts.l", "pr,@-r13", None),
            (0x104, "add", "#-8,r13", None),
            (0x106, "mov", "r13,r14", None),
            (0x108, "mov.l", "@(16,r14),r4", None),
            (0x10A, "mov.l", "r4,@-r13", None),
            (0x10C, "mov", "#18,r5", None),
            (0x10E, "mov.l", "r5,@-r13", None),
            (0x110, "bsrf", "r1", None),
            (0x112, "nop", "", None),
            (0x114, "add", "#8,r13", None),
        ]
        base = frame_argument_base(rows, 0, len(rows))
        self.assertEqual(base, 16)
        self.assertEqual(
            pushed_arguments(rows, 8, 0, base),
            [{
                "kind": "constant",
                "value": 18,
                "hex": "0x00000012",
                "float32": 2.5223372357846707e-44,
                "sourceFileOffset": "0x10c",
            }, {
                "kind": "caller-argument",
                "index": 0,
                "frameOffset": 16,
                "sourceFileOffset": "0x108",
            }],
        )

    def test_recovers_non_r4_frame_addresses_and_direct_frame_loads(self):
        rows = {
            0x100: (0x100, "mov", "#0,r5", None),
            0x102: (0x102, "add", "r14,r5", None),
            0x104: (0x104, "mov.w", "@(18,r14),r0", None),
        }
        self.assertEqual(operation_argument({
            "kind": "runtime",
            "source": "add at 0x102",
        }, rows), {
            "kind": "frame-address",
            "source": "add at 0x102",
            "offset": 0,
        })
        self.assertEqual(operation_argument({
            "kind": "runtime",
            "source": "mov.w at 0x104",
        }, rows), {
            "kind": "frame-field",
            "source": "mov.w at 0x104",
            "offset": 18,
            "width": 2,
        })

    def test_recovers_register_added_frame_dereference(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#32,r6", None),
                (0x102, "add", "r14,r6", None),
                (0x104, "mov", "#4,r7", None),
                (0x106, "add", "r7,r6", None),
                (0x108, "mov.l", "@r6,r6", None),
            ]
        }
        self.assertEqual(operation_argument({
            "kind": "runtime",
            "source": "@r6 at 0x108",
        }, rows), {
            "kind": "frame-field",
            "source": "@r6 at 0x108",
            "offset": 36,
            "width": 4,
        })

    def test_does_not_cross_control_flow_for_indirect_frame_load(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#32,r6", None),
                (0x102, "add", "r14,r6", None),
                (0x104, "jsr", "@r0", None),
                (0x106, "mov.l", "@r6,r6", None),
            ]
        }
        argument = {
            "kind": "runtime",
            "source": "@r6 at 0x106",
        }
        self.assertEqual(operation_argument(argument, rows), argument)

    def test_recovers_exact_wrapped_additive_operation_argument(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "@(16,r14),r6", None),
                (0x102, "mov.l", "0x120,r7", 0x8000),
                (0x104, "add", "r7,r6", None),
            ]
        }
        self.assertEqual(operation_argument({
            "kind": "runtime",
            "source": "add at 0x104",
        }, rows), {
            "kind": "integer-expression",
            "operator": "add",
            "left": {
                "kind": "frame-field",
                "offset": 16,
                "width": 4,
                "signedLoad": False,
                "source": "@(16,r14) at 0x100",
            },
            "right": {
                "kind": "constant",
                "value": 0x8000,
                "hex": "0x00008000",
                "source": "0x102",
            },
            "source": "0x104",
        })

    def test_recovers_addition_after_indirect_frame_dword_load(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#12,r6", None),
                (0x102, "add", "r14,r6", None),
                (0x104, "mov", "#4,r7", None),
                (0x106, "add", "r7,r6", None),
                (0x108, "mov.l", "@r6,r6", None),
                (0x10A, "mov.l", "0x120,r7", 0x8000),
                (0x10C, "add", "r7,r6", None),
            ]
        }
        result = operation_argument({
            "kind": "runtime",
            "source": "add at 0x10c",
        }, rows)
        self.assertEqual(result["kind"], "integer-expression")
        self.assertEqual(result["operator"], "add")
        self.assertEqual(result["left"], {
            "kind": "frame-field",
            "offset": 16,
            "width": 4,
            "signedLoad": False,
            "source": "@r6 at 0x108",
        })
        self.assertEqual(result["right"]["value"], 0x8000)

    def test_does_not_cross_control_flow_for_additive_operation_argument(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "@(16,r14),r6", None),
                (0x102, "jsr", "@r0", None),
                (0x104, "add", "r7,r6", None),
            ]
        }
        argument = {"kind": "runtime", "source": "add at 0x104"}
        self.assertEqual(operation_argument(argument, rows), argument)

    def test_recovers_indexed_frame_vector_address_and_field(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#108,r7", None),
                (0x102, "add", "r14,r7", None),
                (0x104, "mov.l", "0x140,r0", 312),
                (0x106, "mov.l", "@(r0,r14),r5", None),
                (0x108, "mov", "#12,r6", None),
                (0x10A, "mul.l", "r6,r5", None),
                (0x10C, "sts", "macl,r5", None),
                (0x10E, "add", "r5,r7", None),
            ]
        }
        result = operation_argument({
            "kind": "runtime",
            "source": "add at 0x10e",
        }, rows)
        self.assertEqual(result["kind"], "frame-address-expression")
        self.assertEqual(result["baseOffset"], 108)
        self.assertEqual(result["offsetExpression"]["operator"], "multiply-low")
        self.assertEqual(
            result["offsetExpression"]["right"]["offset"],
            312,
        )

        rows.update({
            0x110: (0x110, "mov", "#12,r6", None),
            0x112: (0x112, "add", "r14,r6", None),
            0x114: (0x114, "mov", "#4,r7", None),
            0x116: (0x116, "add", "r7,r5", None),
            0x118: (0x118, "add", "r5,r6", None),
            0x11A: (0x11A, "mov.l", "@r6,r6", None),
            0x11C: (0x11C, "mov.l", "0x144,r7", 0x8000),
            0x11E: (0x11E, "add", "r7,r6", None),
        })
        field = operation_argument({
            "kind": "runtime",
            "source": "add at 0x11e",
        }, rows)["left"]
        self.assertEqual(field["kind"], "frame-field-expression")
        self.assertEqual(field["baseOffset"], 12)
        self.assertEqual(field["offsetExpression"]["operator"], "add")

    def test_recovers_scene_vector_component_into_coroutine_frame(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#0,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov", "#4,r5", None),
                (0x106, "add", "r5,r4", None),
                (0x108, "mov.l", "0x140,r5", 0xD4),
                (0x10A, "add", "r9,r5", None),
                (0x10C, "mov", "#4,r6", None),
                (0x10E, "add", "r6,r5", None),
                (0x110, "mov.l", "@r5,r5", None),
                (0x112, "mov.l", "0x144,r6", 0x3FCCCCCD),
                (0x114, "lds", "r6,fpul", None),
                (0x116, "fsts", "fpul,fr3", None),
                (0x118, "lds", "r5,fpul", None),
                (0x11A, "fsts", "fpul,fr2", None),
                (0x11C, "fadd", "fr3,fr2", None),
                (0x11E, "flds", "fr2,fpul", None),
                (0x120, "sts", "fpul,r5", None),
                (0x122, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(frame_field_scene_writes(rows), [{
            "kind": "frameFieldSceneWrite",
            "callFileOffset": "0x122",
            "offset": 4,
            "width": 4,
            "sceneOffset": 0xD8,
            "sceneOffsetHex": "0xd8",
            "sceneWidth": 4,
            "signedLoad": False,
            "floatAddendWord": 0x3FCCCCCD,
            "floatAddendHex": "0x3fcccccd",
            "addressDefinitionFileOffset": "0x100",
            "sourceDefinitionFileOffset": "0x108",
        }])

    def test_recovers_indexed_scene_byte_into_coroutine_frame(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#12,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov.l", "0x120,r0", 0x400),
                (0x106, "mov.b", "@(r0,r9),r5", None),
                (0x108, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(frame_field_scene_writes(rows), [{
            "kind": "frameFieldSceneWrite",
            "callFileOffset": "0x108",
            "offset": 12,
            "width": 4,
            "sceneOffset": 0x400,
            "sceneOffsetHex": "0x400",
            "sceneWidth": 1,
            "signedLoad": True,
            "addressDefinitionFileOffset": "0x100",
            "sourceDefinitionFileOffset": "0x104",
        }])

    def test_recovers_exact_random_camera_number_result_transform(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#18,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov.l", "r4,@-r13", None),
                (0x120, "jsr", "@r0", None),
                (0x122, "mov", "r13,r6", None),
                (0x124, "add", "#8,r13", None),
                (0x126, "mov", "r0,r4", None),
                (0x128, "lds", "r4,fpul", None),
                (0x12A, "fsts", "fpul,fr2", None),
                (0x12C, "ftrc", "fr2,fpul", None),
                (0x12E, "sts", "fpul,r4", None),
                (0x130, "mov", "#2,r5", None),
                (0x132, "mul.l", "r5,r4", None),
                (0x134, "sts", "macl,r4", None),
                (0x136, "mov.l", "0x160,r5", 2950),
                (0x138, "add", "r5,r4", None),
                (0x13A, "mov.l", "@r13+,r5", None),
                (0x13C, "mov.w", "r4,@r5", None),
            ]
        }
        transform = operation_result_numeric_transform(rows, 0x120)
        self.assertEqual(transform["multiplier"], 2)
        self.assertEqual(transform["addend"], 2950)
        self.assertEqual(transform["resultTarget"], {
            "kind": "frameField",
            "offset": 18,
            "width": 2,
            "addressDefinitionFileOffset": "0x100",
            "storeFileOffset": "0x13c",
        })

    def test_recovers_exact_constant_coroutine_frame_write(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#12,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov.l", "0x120,r5", 0x52494B41),
                (0x106, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(
            frame_field_constant_writes(rows, 0x200),
            [{
                "kind": "frameFieldWrite",
                "callFileOffset": "0x106",
                "offset": 12,
                "width": 4,
                "value": 0x52494B41,
                "valueHex": "0x52494b41",
                "addressDefinitionFileOffset": "0x100",
                "valueSource": "0x104",
            }],
        )

    def test_recovers_register_offset_constant_coroutine_frame_write(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov", "#4,r4", None),
                (0x102, "add", "r14,r4", None),
                (0x104, "mov", "#8,r5", None),
                (0x106, "add", "r5,r4", None),
                (0x108, "mov.l", "0x120,r5", 0x429BE148),
                (0x10A, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(
            frame_field_constant_writes(rows, 0x200),
            [{
                "kind": "frameFieldWrite",
                "callFileOffset": "0x10a",
                "offset": 12,
                "width": 4,
                "value": 0x429BE148,
                "valueHex": "0x429be148",
                "addressDefinitionFileOffset": "0x100",
                "valueSource": "0x108",
            }],
        )

    def test_recovers_exact_masked_frame_return_value(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.b", "@(3,r14),r0", None),
                (0x102, "mov", "r0,r4", None),
                (0x104, "mov.l", "0x120,r5", 0x80),
                (0x106, "and", "r5,r4", None),
                (0x108, "mov", "r4,r0", None),
                (0x10A, "add", "#4,r13", None),
                (0x10C, "lds.l", "@r13+,pr", None),
                (0x10E, "rts", "", None),
            ]
        }
        self.assertEqual(function_return_value(rows), {
            "kind": "frame-field-mask",
            "offset": 3,
            "width": 1,
            "mask": 0x80,
            "loadFileOffset": "0x100",
            "returnFileOffset": "0x10e",
        })

    def test_recovers_exact_signed_byte_frame_return_value(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.b", "@(7,r14),r0", None),
                (0x102, "mov", "r0,r4", None),
                (0x104, "mov", "r4,r0", None),
                (0x106, "add", "#32,r13", None),
                (0x108, "lds.l", "@r13+,pr", None),
                (0x10A, "rts", "", None),
            ]
        }
        self.assertEqual(function_return_value(rows), {
            "kind": "frame-field",
            "offset": 7,
            "width": 1,
            "signedLoad": True,
            "loadFileOffset": "0x100",
            "returnFileOffset": "0x10a",
        })

    def test_recovers_exact_constant_scene_field_write(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "0x120,r4", 0x105),
                (0x102, "add", "r9,r4", None),
                (0x104, "mov", "#-1,r5", None),
                (0x106, "mov.b", "r5,@r4", None),
            ]
        }
        self.assertEqual(
            scene_field_constant_writes(rows, 0x200),
            [{
                "kind": "sceneFieldWrite",
                "callFileOffset": "0x106",
                "offset": 0x105,
                "offsetHex": "0x105",
                "width": 1,
                "value": 0xffffffff,
                "valueHex": "0xffffffff",
                "addressDefinitionFileOffset": "0x100",
                "valueSource": "0x104",
            }],
        )

    def test_recovers_exact_scene_field_or_write(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "0x140,r4", 0xB0),
                (0x102, "add", "r9,r4", None),
                (0x104, "mov.l", "0x140,r5", 0xB0),
                (0x106, "add", "r9,r5", None),
                (0x108, "mov.b", "@r5,r5", None),
                (0x10A, "mov", "#1,r6", None),
                (0x10C, "or", "r6,r5", None),
                (0x10E, "mov.b", "r5,@r4", None),
            ]
        }
        self.assertEqual(scene_field_bitwise_writes(rows), [{
            "kind": "sceneFieldBitwiseWrite",
            "callFileOffset": "0x10e",
            "offset": 0xB0,
            "offsetHex": "0xb0",
            "width": 1,
            "operator": "or",
            "mask": 1,
            "maskHex": "0x00000001",
            "addressDefinitionFileOffset": "0x100",
            "fieldLoadFileOffset": "0x108",
            "bitwiseFileOffset": "0x10c",
        }])

    def test_recovers_scene_zero_comparison_after_r0_transfer(self):
        instructions = [
            (0x100, "mov.l", "0x120,r4", 0xB0),
            (0x102, "add", "r9,r4", None),
            (0x104, "mov.b", "@r4,r4", None),
            (0x106, "mov", "r4,r0", None),
            (0x108, "cmp/eq", "#0,r0", None),
            (0x10A, "bf", "0x120", None),
            (0x10C, "nop", "", None),
            (0x120, "nop", "", None),
        ]
        self.assertEqual(scene_field_comparisons(
            instructions,
            0x100,
            0x122,
        ), [{
            "fieldOffset": "0xb0",
            "loadWidth": 1,
            "signedLoad": True,
            "comparison": "cmp/eq",
            "leftOperand": "#0",
            "rightOperand": "r0",
            "fieldOperand": "r0",
            "constantOperand": "#0",
            "constant": 0,
            "fieldLoadFileOffset": "0x100",
            "compareFileOffset": "0x108",
            "resolvedBranch": {
                "branchFileOffset": "0x10a",
                "branchMnemonic": "bf",
                "branchTargetFileOffset": "0x120",
                "branchFallthroughFileOffset": "0x10c",
                "comparisonTrueSuccessor": "0x10c",
                "comparisonFalseSuccessor": "0x120",
            },
        }])

    def test_recovers_exact_indirect_call_base_register_slot(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "@(44,r8),r0", None),
                (0x102, "mov", "#1,r7", None),
                (0x104, "mov.l", "@(52,r8),r4", None),
                (0x106, "jsr", "@r0", None),
            ]
        }
        self.assertEqual(
            indirect_call_json(0x106, "@r0", rows),
            {
                "callFileOffset": "0x106",
                "operands": "@r0",
                "targetSource": {
                    "kind": "base-register-slot",
                    "baseRegister": "r8",
                    "byteOffset": 44,
                    "loadFileOffset": "0x100",
                },
            },
        )

    def test_recovers_resumable_scheduler_dispatch_and_result_bit(self):
        rows = {
            row[0]: row
            for row in [
                (0x0F0, "mov", "#1,r4", None),
                (0x0F2, "mov.l", "r4,@-r13", None),
                (0x0F4, "mov", "#0,r5", None),
                (0x0F6, "mov.l", "@(44,r8),r0", None),
                (0x0F8, "mov", "#1,r7", None),
                (0x0FA, "mov.l", "@(52,r8),r4", None),
                (0x0FC, "jsr", "@r0", None),
                (0x0FE, "mov", "r13,r6", None),
                (0x100, "swap.w", "r0,r0", None),
                (0x102, "tst", "#1,r0", None),
                (0x104, "bf", "0x10c", None),
                (0x106, "nop", "", None),
                (0x10C, "nop", "", None),
            ]
        }
        call = indirect_call_json(0x0FC, "@r0", rows, 0x200)
        self.assertEqual(call["runtimeDispatch"], {
            "selector": 0,
            "selectorHex": "0x0000",
            "argumentCount": 1,
            "arguments": [{
                "kind": "constant",
                "value": 1,
                "hex": "0x00000001",
                "source": "0xf0",
            }],
            "argumentPointer": {
                "kind": "native-argument-stack",
                "register": "r13",
                "delaySlotFileOffset": "0xfe",
            },
        })
        self.assertEqual(call["resultBitTest"]["mask"], 0x00010000)
        self.assertEqual(
            call["resultBitTest"]["resolvedBranch"][
                "comparisonTrueSuccessor"
            ],
            "0x10c",
        )
        self.assertEqual(
            call["resultBitTest"]["resolvedBranch"][
                "comparisonFalseSuccessor"
            ],
            "0x106",
        )

    def test_recovers_exact_frame_field_scheduler_argument(self):
        rows = {
            row[0]: row
            for row in [
                (0x0EC, "mov.l", "@(12,r14),r4", None),
                (0x0EE, "mov.l", "r4,@-r13", None),
                (0x0F0, "mov", "#0,r5", None),
                (0x0F2, "mov.l", "@(44,r8),r0", None),
                (0x0F4, "mov", "#1,r7", None),
                (0x0F6, "mov.l", "@(52,r8),r4", None),
                (0x0F8, "jsr", "@r0", None),
                (0x0FA, "mov", "r13,r6", None),
            ]
        }
        call = indirect_call_json(0x0F8, "@r0", rows, 0x200)
        self.assertEqual(call["runtimeDispatch"]["arguments"], [{
            "kind": "frame-field",
            "offset": 12,
            "width": 4,
            "signedLoad": False,
            "source": "@(12,r14) at 0xec",
        }])

    def test_recovers_exact_signed_integer_runtime_register_abi(self):
        rows = {
            row[0]: row
            for row in [
                (0x0F0, "mov.l", "@(28,r14),r4", None),
                (0x0F2, "mov", "#2,r5", None),
                (0x0F4, "mov.l", "@(20,r8),r3", None),
                (0x0F6, "mov", "r5,r0", None),
                (0x0F8, "jsr", "@r3", None),
                (0x0FA, "mov", "r4,r1", None),
            ]
        }
        call = indirect_call_json(0x0F8, "@r3", rows, 0x200)
        self.assertEqual(call["integerArithmetic"], {
            "argumentCount": 2,
            "arguments": [{
                "kind": "frame-field",
                "offset": 28,
                "width": 4,
                "signedLoad": False,
                "source": "@(28,r14) at 0xf0",
            }, {
                "kind": "constant",
                "value": 2,
                "hex": "0x00000002",
                "source": "0xf2",
            }],
            "registers": {
                "dividend": "r1",
                "divisor": "r0",
                "result": "r0",
            },
            "delaySlotFileOffset": "0xfa",
        })

    def test_recovers_exact_subtraction_dividend_and_frame_divisor(self):
        rows = {
            row[0]: row
            for row in [
                (0x0E8, "mov", "#4,r4", None),
                (0x0EA, "add", "r14,r4", None),
                (0x0EC, "mov", "#2,r5", None),
                (0x0EE, "mov.l", "r5,@r4", None),
                (0x0F0, "mov", "#20,r4", None),
                (0x0F2, "mov.l", "@(8,r14),r5", None),
                (0x0F4, "sub", "r5,r4", None),
                (0x0F6, "mov.l", "@(4,r14),r5", None),
                (0x0F8, "mov.l", "@(20,r8),r3", None),
                (0x0FA, "mov", "r5,r0", None),
                (0x0FC, "jsr", "@r3", None),
                (0x0FE, "mov", "r4,r1", None),
            ]
        }
        call = indirect_call_json(0x0FC, "@r3", rows, 0x200)
        self.assertEqual(call["integerArithmetic"]["arguments"], [{
            "kind": "integer-expression",
            "operator": "subtract",
            "left": {
                "kind": "constant",
                "value": 20,
                "hex": "0x00000014",
                "source": "0xf0",
            },
            "right": {
                "kind": "frame-field",
                "offset": 8,
                "width": 4,
                "signedLoad": False,
                "source": "@(8,r14) at 0xf2",
            },
            "source": "0xf4",
        }, {
            "kind": "frame-field",
            "offset": 4,
            "width": 4,
            "signedLoad": False,
            "source": "@(4,r14) at 0xf6",
        }])

    def test_recovers_exact_macl_low_word_dividend(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "@(36,r14),r5", None),
                (0x102, "mov", "#-79,r6", None),
                (0x104, "mul.l", "r6,r5", None),
                (0x106, "sts", "macl,r5", None),
                (0x108, "mov.l", "@(32,r14),r6", None),
                (0x10A, "mov.l", "@(20,r8),r3", None),
                (0x10C, "mov", "r6,r0", None),
                (0x10E, "jsr", "@r3", None),
                (0x110, "mov", "r5,r1", None),
            ]
        }
        call = indirect_call_json(0x10E, "@r3", rows, 0x200)
        self.assertEqual(call["integerArithmetic"]["arguments"][0], {
            "kind": "integer-expression",
            "operator": "multiply-low",
            "left": {
                "kind": "constant",
                "value": 0xFFFFFFB1,
                "hex": "0xffffffb1",
                "source": "0x102",
            },
            "right": {
                "kind": "frame-field",
                "offset": 36,
                "width": 4,
                "signedLoad": False,
                "source": "@(36,r14) at 0x100",
            },
            "source": "0x104",
        })

    def test_recovers_signed_word_frame_dividend(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.w", "@(30,r14),r0", None),
                (0x102, "mov", "r0,r6", None),
                (0x104, "mov", "#10,r7", None),
                (0x106, "mov.l", "@(20,r8),r3", None),
                (0x108, "mov", "r7,r0", None),
                (0x10A, "jsr", "@r3", None),
                (0x10C, "mov", "r6,r1", None),
            ]
        }
        call = indirect_call_json(0x10A, "@r3", rows, 0x200)
        self.assertEqual(call["integerArithmetic"]["arguments"][0], {
            "kind": "frame-field",
            "offset": 30,
            "width": 2,
            "signedLoad": True,
            "source": "@(30,r14) at 0x100",
        })

    def test_recovers_constant_indexed_scene_dividend(self):
        rows = {
            row[0]: row
            for row in [
                (0x100, "mov.l", "0x140,r0", 0x224),
                (0x102, "mov.l", "@(r0,r9),r4", None),
                (0x104, "mov.l", "0x144,r5", 10000),
                (0x106, "mov.l", "@(20,r8),r3", None),
                (0x108, "mov", "r5,r0", None),
                (0x10A, "jsr", "@r3", None),
                (0x10C, "mov", "r4,r1", None),
            ]
        }
        call = indirect_call_json(0x10A, "@r3", rows, 0x200)
        self.assertEqual(call["integerArithmetic"]["arguments"][0], {
            "kind": "scene-field",
            "offset": 0x224,
            "width": 4,
            "signedLoad": False,
            "source": "@(r0,r9) at 0x102",
        })

    def test_recovers_proven_local_signed_angle_helper_result(self):
        rows = {
            0x148 + relative: (
                0x148 + relative,
                mnemonic,
                operands,
                None,
            )
            for relative, (mnemonic, operands)
            in SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE.items()
        }
        rows.update({
            row[0]: row
            for row in [
                (0xFE0, "mov.l", "@(16,r14),r5", None),
                (0xFE2, "mov.l", "@(52,r14),r6", None),
                (0xFE4, "mov.l", "r5,@-r13", None),
                (0xFE6, "mov.l", "r6,@-r13", None),
                (0xFE8, "mov.l", "0x1020,r1", 0xFFFFF15A),
                (0xFEA, "bsrf", "r1", None),
                (0xFEC, "nop", "", None),
                (0xFEE, "mov", "r0,r4", None),
                (0xFF0, "mov.l", "0x1024,r5", 360),
                (0xFF2, "mul.l", "r5,r4", None),
                (0xFF4, "sts", "macl,r4", None),
                (0xFF6, "mov.l", "0x1028,r5", 65536),
                (0xFF8, "mov.l", "@(20,r8),r3", None),
                (0xFFA, "mov", "r5,r0", None),
                (0xFFC, "jsr", "@r3", None),
                (0xFFE, "mov", "r4,r1", None),
            ]
        })
        call = indirect_call_json(0xFFC, "@r3", rows, 0x200)
        difference = call["integerArithmetic"]["arguments"][0]["right"]
        self.assertEqual(difference, {
            "kind": "integer-expression",
            "operator": "signed-binary-angle-difference",
            "left": {
                "kind": "frame-field",
                "offset": 52,
                "width": 4,
                "signedLoad": False,
                "source": "@(52,r14) at 0xfe2",
            },
            "right": {
                "kind": "frame-field",
                "offset": 16,
                "width": 4,
                "signedLoad": False,
                "source": "@(16,r14) at 0xfe0",
            },
            "source": "0xfea",
        })

    def test_leaves_clobbered_indirect_target_source_unresolved(self):
        rows = {
            row[0]: row
            for row in [
                (0x200, "mov.l", "@(44,r8),r0", None),
                (0x202, "mov", "#0,r0", None),
                (0x204, "jsr", "@r0", None),
            ]
        }
        self.assertEqual(
            indirect_call_json(0x204, "@r0", rows),
            {"callFileOffset": "0x204", "operands": "@r0"},
        )

    def test_recovers_exact_r9_relative_scene_comparison(self):
        rows = [
            (0x100, "mov.l", "0x120,r4", 0x84),
            (0x102, "add", "r9,r4", None),
            (0x104, "mov.l", "@r4,r4", None),
            (0x106, "mov", "#6,r5", None),
            (0x108, "cmp/eq", "r5,r4", None),
            (0x10A, "subc", "r4,r4", None),
            (0x10C, "rts", "", None),
            (0x10E, "nop", "", None),
        ]
        self.assertEqual(
            scene_field_comparisons(rows, 0x100, 0x110),
            [{
                "fieldOffset": "0x84",
                "loadWidth": 4,
                "signedLoad": False,
                "comparison": "cmp/eq",
                "leftOperand": "r5",
                "rightOperand": "r4",
                "fieldOperand": "r4",
                "constantOperand": "r5",
                "constant": 6,
                "fieldLoadFileOffset": "0x100",
                "compareFileOffset": "0x108",
            }],
        )

    def test_recovers_exact_indexed_scene_byte_bit_test(self):
        rows = [
            (0x100, "mov.l", "0x120,r0", 0x105),
            (0x102, "mov.b", "@(r0,r9),r4", None),
            (0x104, "mov", "#16,r5", None),
            (0x106, "and", "r5,r4", None),
            (0x108, "mov", "r4,r0", None),
            (0x10A, "cmp/eq", "#0,r0", None),
            (0x10C, "bf", "0x120", None),
            (0x10E, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        comparison = scene_field_comparisons(
            rows,
            0x100,
            0x122,
        )[0]
        self.assertEqual(comparison["fieldOffset"], "0x105")
        self.assertEqual(comparison["comparison"], "bit-mask-equal-zero")
        self.assertEqual(comparison["mask"], 16)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x10e",
        )
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x120",
        )

    def test_recovers_literal_loaded_indexed_scene_byte_bit_test(self):
        rows = [
            (0x100, "mov.l", "0x120,r0", 0x105),
            (0x102, "mov.b", "@(r0,r9),r4", None),
            (0x104, "mov.l", "0x124,r5", 0x80),
            (0x106, "and", "r5,r4", None),
            (0x108, "mov", "r4,r0", None),
            (0x10A, "cmp/eq", "#0,r0", None),
            (0x10C, "bf", "0x120", None),
            (0x10E, "nop", "", None),
            (0x120, "rts", "", None),
        ]
        comparison = scene_field_comparisons(rows, 0x100, 0x122)[0]
        self.assertEqual(comparison["fieldOffset"], "0x105")
        self.assertEqual(comparison["mask"], 0x80)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x120",
        )

    def test_recovers_field_offset_with_compiler_addend(self):
        rows = [
            (0x200, "mov.l", "0x220,r5", 0xC8),
            (0x202, "add", "r9,r5", None),
            (0x204, "add", "#4,r5", None),
            (0x206, "mov.b", "@r5,r6", None),
            (0x208, "mov", "#19,r7", None),
            (0x20A, "cmp/gt", "r6,r7", None),
            (0x20C, "rts", "", None),
            (0x20E, "nop", "", None),
        ]
        comparison = scene_field_comparisons(rows, 0x200, 0x210)[0]
        self.assertEqual(comparison["fieldOffset"], "0xcc")
        self.assertEqual(comparison["loadWidth"], 1)
        self.assertEqual(comparison["constant"], 19)

    def test_recovers_exact_coroutine_frame_comparison(self):
        rows = [
            (0x280, "mov.l", "@(20,r14),r4", None),
            (0x282, "mov", "#1,r5", None),
            (0x284, "cmp/eq", "r5,r4", None),
            (0x286, "subc", "r4,r4", None),
            (0x288, "mov", "r4,r0", None),
            (0x28A, "cmp/eq", "#0,r0", None),
            (0x28C, "bf", "0x2a0", None),
            (0x28E, "nop", "", None),
            (0x2A0, "rts", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x280, 0x2A2)[0]
        self.assertEqual(comparison["fieldOffset"], 20)
        self.assertEqual(comparison["fieldOperand"], "r4")
        self.assertEqual(comparison["constant"], 1)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x2a0",
        )

    def test_recovers_coroutine_frame_zero_comparison_after_transfer(self):
        rows = [
            (0x280, "mov.l", "@(0,r14),r4", None),
            (0x282, "mov", "r4,r0", None),
            (0x284, "cmp/eq", "#0,r0", None),
            (0x286, "bf", "0x290", None),
            (0x288, "rts", "", None),
            (0x28A, "nop", "", None),
            (0x290, "rts", "", None),
            (0x292, "nop", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x280, 0x294)[0]
        self.assertEqual(comparison["fieldOffset"], 0)
        self.assertEqual(comparison["fieldOperand"], "r0")
        self.assertEqual(comparison["constant"], 0)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x288",
        )
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x290",
        )

    def test_recovers_frame_zero_comparison_after_register_copy_chain(self):
        rows = [
            (0x280, "mov.b", "@(2,r14),r0", None),
            (0x282, "mov", "r0,r4", None),
            (0x284, "mov", "r4,r0", None),
            (0x286, "cmp/eq", "#0,r0", None),
            (0x288, "bf", "0x290", None),
            (0x28A, "rts", "", None),
            (0x28C, "nop", "", None),
            (0x290, "rts", "", None),
            (0x292, "nop", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x280, 0x294)[0]
        self.assertEqual(comparison["fieldOffset"], 2)
        self.assertEqual(comparison["loadWidth"], 1)
        self.assertEqual(comparison["fieldOperand"], "r0")
        self.assertEqual(comparison["constant"], 0)
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x290",
        )

    def test_recovers_frame_all_ones_comparison_from_native_not_form(self):
        rows = [
            (0x280, "mov.l", "@(8,r14),r4", None),
            (0x282, "not", "r4,r4", None),
            (0x284, "mov", "r4,r0", None),
            (0x286, "cmp/eq", "#0,r0", None),
            (0x288, "bf", "0x2a0", None),
            (0x28A, "nop", "", None),
            (0x2A0, "rts", "", None),
        ]
        comparison = frame_field_comparisons(rows, 0x280, 0x2A2)[0]
        self.assertEqual(comparison["fieldOffset"], 8)
        self.assertEqual(comparison["constant"], 0xffffffff)
        self.assertEqual(
            comparison["compilerForm"],
            "bitwise-not-equal-zero",
        )
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonTrueSuccessor"],
            "0x28a",
        )
        self.assertEqual(
            comparison["resolvedBranch"]["comparisonFalseSuccessor"],
            "0x2a0",
        )

    def test_basic_blocks_preserve_conditional_successors(self):
        rows = [
            (0x300, "mov", "#1,r4", None),
            (0x302, "bf", "0x308", None),
            (0x304, "rts", "", None),
            (0x306, "nop", "", None),
            (0x308, "rts", "", None),
            (0x30A, "nop", "", None),
        ]
        blocks = basic_blocks(rows, 0x300, 0x30C)
        self.assertEqual(blocks[0]["startFileOffset"], "0x300")
        self.assertEqual(blocks[0]["successors"], ["0x308", "0x304"])
        self.assertEqual(blocks[0]["terminator"]["mnemonic"], "bf")

    def test_recovers_operation_result_frame_target_and_comparison(self):
        rows = {
            row[0]: row
            for row in [
                (0x500, "mov", "#8,r4", None),
                (0x502, "add", "r14,r4", None),
                (0x504, "mov.l", "r4,@-r13", None),
                (0x506, "jsr", "@r0", None),
                (0x508, "mov", "r13,r6", None),
                (0x50A, "mov", "r0,r4", None),
                (0x50C, "mov.l", "@r13+,r5", None),
                (0x50E, "mov.l", "r4,@r5", None),
            ]
        }
        self.assertEqual(
            operation_result_target(rows, 0x506),
            {
                "kind": "frameField",
                "offset": 8,
                "width": 4,
                "storeFileOffset": "0x50e",
            },
        )
        scene_rows = {
            **rows,
            0x500: (0x500, "mov.l", "0x540,r4", 0x310),
            0x502: (0x502, "add", "r9,r4", None),
        }
        self.assertEqual(
            operation_result_target(scene_rows, 0x506),
            {
                "kind": "sceneField",
                "offset": 0x310,
                "width": 4,
                "storeFileOffset": "0x50e",
            },
        )
        cleanup_rows = {
            row[0]: row
            for row in [
                (0x500, "mov", "#8,r4", None),
                (0x502, "add", "r14,r4", None),
                (0x504, "mov.l", "r4,@-r13", None),
                (0x506, "mov.l", "r6,@-r13", None),
                (0x508, "mov.l", "r7,@-r13", None),
                (0x50A, "jsr", "@r0", None),
                (0x50C, "mov", "r13,r6", None),
                (0x50E, "add", "#8,r13", None),
                (0x510, "mov", "r0,r4", None),
                (0x512, "mov.l", "@r13+,r5", None),
                (0x514, "mov.l", "r4,@r5", None),
            ]
        }
        self.assertEqual(
            operation_result_target(cleanup_rows, 0x50A),
            {
                "kind": "frameField",
                "offset": 8,
                "width": 4,
                "storeFileOffset": "0x514",
            },
        )

        register_offset_rows = {
            row[0]: row
            for row in [
                (0x540, "mov", "#16,r4", None),
                (0x542, "add", "r14,r4", None),
                (0x544, "mov", "#4,r5", None),
                (0x546, "add", "r5,r4", None),
                (0x548, "mov.l", "r4,@-r13", None),
                (0x54A, "mov.l", "r6,@-r13", None),
                (0x54C, "mov.l", "r7,@-r13", None),
                (0x54E, "mov.l", "r8,@-r13", None),
                (0x550, "jsr", "@r0", None),
                (0x552, "mov", "r13,r6", None),
                (0x554, "add", "#12,r13", None),
                (0x556, "mov", "r0,r4", None),
                (0x558, "mov.l", "@r13+,r5", None),
                (0x55A, "mov.l", "r4,@r5", None),
            ]
        }
        self.assertEqual(
            operation_result_target(register_offset_rows, 0x550),
            {
                "kind": "frameField",
                "offset": 20,
                "width": 4,
                "storeFileOffset": "0x55a",
            },
        )

        nested_call_rows = {
            row[0]: row
            for row in [
                (0x700, "mov", "#0,r4", None),
                (0x702, "add", "r14,r4", None),
                (0x704, "mov.l", "r4,@-r13", None),
                (0x706, "mov.l", "r5,@-r13", None),
                (0x708, "mov.l", "r6,@-r13", None),
                (0x70A, "jsr", "@r0", None),
                (0x70C, "mov", "r13,r6", None),
                (0x70E, "add", "#8,r13", None),
                (0x710, "mov.l", "r0,@-r13", None),
                (0x712, "mov.l", "r5,@-r13", None),
                (0x714, "jsr", "@r0", None),
                (0x716, "mov", "r13,r6", None),
                (0x718, "add", "#8,r13", None),
                (0x71A, "mov", "r0,r4", None),
                (0x71C, "mov.l", "@r13+,r5", None),
                (0x71E, "mov.l", "r4,@r5", None),
            ]
        }
        self.assertEqual(
            operation_result_target(nested_call_rows, 0x714),
            {
                "kind": "frameField",
                "offset": 0,
                "width": 4,
                "storeFileOffset": "0x71e",
            },
        )

        byte_rows = {
            **rows,
            0x50E: (0x50E, "mov.b", "r4,@r5", None),
        }
        self.assertEqual(
            operation_result_target(byte_rows, 0x506),
            {
                "kind": "frameField",
                "offset": 8,
                "width": 1,
                "storeFileOffset": "0x50e",
            },
        )

        comparison_rows = {
            row[0]: row
            for row in [
                (0x600, "jsr", "@r0", None),
                (0x602, "mov", "r13,r6", None),
                (0x604, "add", "#4,r13", None),
                (0x606, "cmp/eq", "#0,r0", None),
                (0x608, "bf", "0x620", None),
                (0x60A, "nop", "", None),
                (0x620, "rts", "", None),
            ]
        }
        self.assertEqual(
            operation_result_comparison(comparison_rows, 0x600),
            {
                "kind": "operationResult",
                "comparison": "equal",
                "constant": 0,
                "compareFileOffset": "0x606",
                "resolvedBranch": {
                    "branchFileOffset": "0x608",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x620",
                    "branchFallthroughFileOffset": "0x60a",
                    "comparisonTrueSuccessor": "0x60a",
                    "comparisonFalseSuccessor": "0x620",
                },
            },
        )

        normalized_rows = {
            row[0]: row
            for row in [
                (0x700, "jsr", "@r0", None),
                (0x702, "mov", "r13,r6", None),
                (0x704, "add", "#4,r13", None),
                (0x706, "mov", "r0,r4", None),
                (0x708, "mov", "#0,r5", None),
                (0x70A, "cmp/eq", "r5,r4", None),
                (0x70C, "subc", "r4,r4", None),
                (0x70E, "not", "r4,r4", None),
                (0x710, "mov", "r4,r0", None),
                (0x712, "cmp/eq", "#0,r0", None),
                (0x714, "bf", "0x730", None),
                (0x716, "nop", "", None),
                (0x730, "rts", "", None),
            ]
        }
        self.assertEqual(
            operation_result_comparison(normalized_rows, 0x700),
            {
                "kind": "operationResult",
                "comparison": "equal",
                "constant": 0,
                "compareFileOffset": "0x70a",
                "resolvedBranch": {
                    "branchFileOffset": "0x714",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x730",
                    "branchFallthroughFileOffset": "0x716",
                    "comparisonTrueSuccessor": "0x716",
                    "comparisonFalseSuccessor": "0x730",
                },
            },
        )

        literal_rows = {
            row[0]: row
            for row in [
                (0x780, "jsr", "@r0", None),
                (0x782, "mov", "r13,r6", None),
                (0x784, "add", "#4,r13", None),
                (0x786, "mov", "r0,r4", None),
                (0x788, "mov.l", "0x7a0,r5", 0x200),
                (0x78A, "cmp/eq", "r5,r4", None),
                (0x78C, "subc", "r4,r4", None),
                (0x78E, "mov", "r4,r0", None),
                (0x790, "cmp/eq", "#0,r0", None),
                (0x792, "bf", "0x7b0", None),
                (0x794, "nop", "", None),
                (0x7B0, "rts", "", None),
            ]
        }
        self.assertEqual(
            operation_result_comparison(literal_rows, 0x780),
            {
                "kind": "operationResult",
                "comparison": "equal",
                "constant": 0x200,
                "compareFileOffset": "0x78a",
                "resolvedBranch": {
                    "branchFileOffset": "0x792",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x7b0",
                    "branchFallthroughFileOffset": "0x794",
                    "comparisonTrueSuccessor": "0x7b0",
                    "comparisonFalseSuccessor": "0x794",
                },
            },
        )

        stacked_rows = {
            row[0]: row
            for row in [
                (0x800, "jsr", "@r0", None),
                (0x802, "mov", "r13,r6", None),
                (0x804, "add", "#8,r13", None),
                (0x806, "mov", "r0,r4", None),
                (0x808, "mov.l", "r4,@-r13", None),
                (0x80A, "mov.l", "r5,@-r13", None),
                (0x80C, "mov.l", "r6,@-r13", None),
                (0x80E, "jsr", "@r0", None),
                (0x810, "mov", "r13,r6", None),
                (0x812, "add", "#8,r13", None),
                (0x814, "mov", "r0,r4", None),
                (0x816, "mov", "#0,r5", None),
                (0x818, "cmp/eq", "r5,r4", None),
                (0x81A, "subc", "r4,r4", None),
                (0x81C, "mov.l", "@r13+,r5", None),
                (0x81E, "and", "r4,r5", None),
                (0x820, "mov", "r5,r0", None),
                (0x822, "cmp/eq", "#0,r0", None),
                (0x824, "bf", "0x840", None),
                (0x826, "nop", "", None),
                (0x840, "rts", "", None),
            ]
        }
        self.assertEqual(
            operation_result_comparison(stacked_rows, 0x80E),
            {
                "kind": "operationResultExpression",
                "expression": {
                    "kind": "bitwise-and",
                    "operands": [
                        {
                            "kind": "operation-result",
                            "callFileOffset": "0x800",
                        },
                        {
                            "kind": "comparison-mask",
                            "comparison": "equal",
                            "operand": {
                                "kind": "operation-result",
                                "callFileOffset": "0x80e",
                            },
                            "constant": 0,
                            "trueValue": -1,
                            "falseValue": 0,
                        },
                    ],
                },
                "comparison": "equal",
                "constant": 0,
                "compareFileOffset": "0x822",
                "resolvedBranch": {
                    "branchFileOffset": "0x824",
                    "branchMnemonic": "bf",
                    "branchTargetFileOffset": "0x840",
                    "branchFallthroughFileOffset": "0x826",
                    "comparisonTrueSuccessor": "0x826",
                    "comparisonFalseSuccessor": "0x840",
                },
            },
        )

    def test_recovers_exact_frame_dword_addition(self):
        rows = {
            row[0]: row
            for row in [
                (0x700, "mov", "#0,r4", None),
                (0x702, "add", "r14,r4", None),
                (0x704, "mov.l", "@(0,r14),r5", None),
                (0x706, "mov", "#1,r6", None),
                (0x708, "add", "r6,r5", None),
                (0x70A, "mov.l", "r5,@r4", None),
            ]
        }
        self.assertEqual(frame_field_additions(rows), [{
            "kind": "frameFieldAdd",
            "callFileOffset": "0x70a",
            "offset": 0,
            "width": 4,
            "value": 1,
            "addressDefinitionFileOffset": "0x700",
            "loadFileOffset": "0x704",
            "addFileOffset": "0x708",
        }])

    def test_promotes_exact_frame_field_operand_source(self):
        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(8,r14) at 0xb01c",
            }, {}),
            {
                "kind": "frame-field",
                "offset": 8,
                "source": "@(8,r14) at 0xb01c",
            },
        )

        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(24,r9) at 0x4d02",
            }, {}),
            {
                "kind": "scene-field",
                "offset": 24,
                "source": "@(24,r9) at 0x4d02",
            },
        )
        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(r0,r14) at 0x21556",
            }, {
                0x21554: (0x21554, "add", "r6,r0", None),
                0x21556: (0x21556, "mov.l", "@(r0,r14),r5", None),
            }),
            {
                "kind": "runtime",
                "source": "@(r0,r14) at 0x21556",
            },
        )

        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(r0,r9) at 0x4d02",
            }, {
                0x4D00: (0x4D00, "mov", "#24,r0", None),
                0x4D02: (0x4D02, "mov.l", "@(r0,r9),r5", None),
            }),
            {
                "kind": "scene-field",
                "offset": 24,
                "source": "@(r0,r9) at 0x4d02",
            },
        )

        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(r0,r14) at 0x21556",
            }, {
                0x21554: (0x21554, "mov", "#100,r0", None),
                0x21556: (0x21556, "mov.l", "@(r0,r14),r5", None),
            }),
            {
                "kind": "frame-field",
                "offset": 100,
                "width": 4,
                "source": "@(r0,r14) at 0x21556",
            },
        )

        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "@(r0,r9) at 0x4ad14",
            }, {
                0x4AD12: (
                    0x4AD12,
                    "mov.l",
                    "0x4ad30,r0",
                    0x310,
                ),
            }),
            {
                "kind": "scene-field",
                "offset": 0x310,
                "source": "@(r0,r9) at 0x4ad14",
            },
        )

    def test_promotes_exact_frame_and_scene_address_operands(self):
        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "add at 0xcb5e",
            }, {
                0xCB5C: (0xCB5C, "mov", "#4,r4", None),
                0xCB5E: (0xCB5E, "add", "r14,r4", None),
            }),
            {
                "kind": "frame-address",
                "offset": 4,
                "source": "add at 0xcb5e",
            },
        )

    def test_corrects_constant_address_provenance_after_control_flow(self):
        rows = {
            0x100: (0x100, "mov", "#-82,r14", None),
            0x102: (0x102, "bf", "0x110", None),
            0x110: (0x110, "mov", "#20,r4", None),
            0x112: (0x112, "add", "r14,r4", None),
        }
        self.assertEqual(operation_argument({
            "kind": "constant",
            "value": 0xffffffc2,
            "source": "0x112",
        }, rows), {
            "kind": "frame-address",
            "source": "0x112",
            "offset": 20,
        })
        self.assertEqual(
            operation_argument({
                "kind": "runtime",
                "source": "add at 0x664dc",
            }, {
                0x664DA: (0x664DA, "mov.l", "0x66500,r4", 0x2A0),
                0x664DC: (0x664DC, "add", "r9,r4", None),
            }),
            {
                "kind": "scene-address",
                "offset": 0x2A0,
                "source": "add at 0x664dc",
            },
        )

    def test_resolves_compiler_boolean_normalization_before_branch(self):
        rows = {
            row[0]: row
            for row in [
                (0x400, "cmp/eq", "r5,r4", None),
                (0x402, "subc", "r4,r4", None),
                (0x404, "mov", "r4,r0", None),
                (0x406, "cmp/eq", "#0,r0", None),
                (0x408, "bf", "0x420", None),
                (0x40A, "nop", "", None),
                (0x420, "rts", "", None),
            ]
        }
        self.assertEqual(
            comparison_branch_outcomes(rows, 0x400),
            {
                "branchFileOffset": "0x408",
                "branchMnemonic": "bf",
                "branchTargetFileOffset": "0x420",
                "branchFallthroughFileOffset": "0x40a",
                "comparisonTrueSuccessor": "0x420",
                "comparisonFalseSuccessor": "0x40a",
            },
        )

    def test_source_safe_summary_omits_map_paths(self):
        report = {
            "schema": "new-yokosuka-dialogue-control-flow-index-v1",
            "evidenceBoundary": ["boundary"],
            "summary": {"dialoguePathFunctionCount": 2},
            "maps": [{"source": "/private/MAPINFO.BIN"}],
        }
        summary = summary_report(report)
        self.assertNotIn("maps", summary)
        self.assertEqual(summary["summary"]["dialoguePathFunctionCount"], 2)

    def test_native_event_graph_ignores_calls_in_unreachable_bytes(self):
        reached = {
            0x100: {0x100, 0x104},
            0x200: {0x200},
            0x300: {0x300},
        }
        functions = native_event_functions(
            {0x100},
            [
                {"source": 0x100, "call": 0x104, "target": 0x200},
                {"source": 0x100, "call": 0x10A, "target": 0x300},
            ],
            [],
            lambda start: reached[start],
        )
        self.assertEqual(functions, {0x100, 0x200})


if __name__ == "__main__":
    unittest.main()
