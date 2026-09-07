#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.compile_native_event_ir import (  # noqa: E402
    build_report,
    compile_indirect_call,
    deduplicate_frame_field_mutations,
    enrich_static_pointer_arguments,
    semantic_applies,
    summary_report,
)


class CompileNativeEventIrTest(unittest.TestCase):
    def test_enriches_static_pointer_words_for_any_operation_dispatcher(self):
        self.assertEqual(enrich_static_pointer_arguments(
            {"staticPointerWordCount": 3},
            [{"kind": "static-pointer", "value": 4}],
            bytes.fromhex("00000000110000002200000033000000"),
            "secondary operation",
        ), [{
            "kind": "static-pointer",
            "value": 4,
            "staticWords": [0x11, 0x22, 0x33],
        }])

    def test_enriches_bounded_sentinel_terminated_static_words(self):
        self.assertEqual(enrich_static_pointer_arguments(
            {
                "staticPointerSentinelWord": 0xffffffff,
                "staticPointerMaximumWordCount": 4,
            },
            [{"kind": "static-pointer", "value": 4}],
            bytes.fromhex(
                "000000001100000022000000ffffffff33000000"
            ),
            "engine operation",
        ), [{
            "kind": "static-pointer",
            "value": 4,
            "staticWords": [0x11, 0x22, 0xffffffff],
        }])

    def test_semantic_accepts_exact_frame_sourced_object_vector_selector(self):
        semantic = {
            "argumentCount": 4,
            "argumentConstraints": [{
                "index": 1,
                "kinds": ["frame-field"],
            }, {
                "index": 3,
                "values": [0, 0x40000000],
            }],
        }
        operation = {
            "arguments": [
                {"kind": "frame-field", "offset": 8},
                {"kind": "frame-field", "offset": 12},
                {"kind": "frame-address", "offset": 16},
                {"kind": "constant", "value": 0x40000000},
            ],
        }
        self.assertTrue(semantic_applies(semantic, operation))

    def test_semantic_requires_complete_typed_float32_expression(self):
        semantic = {"argumentConstraints": [{
            "index": 0,
            "kinds": ["float32-truncate-to-signed-integer"],
            "exactFrameExpression": True,
        }]}
        expression = {
            "kind": "float32-truncate-to-signed-integer",
            "operand": {
                "kind": "float32-divide",
                "left": {
                    "kind": "float32-from-word",
                    "operand": {
                        "kind": "frame-field", "offset": 4,
                        "width": 4, "signedLoad": False,
                    },
                },
                "right": {
                    "kind": "float32-from-word",
                    "operand": {"kind": "constant", "value": 0x43B40000},
                },
            },
        }
        self.assertTrue(semantic_applies(semantic, {"arguments": [expression]}))
        del expression["operand"]["right"]["operand"]
        self.assertFalse(semantic_applies(semantic, {"arguments": [expression]}))

    def test_persistent_script_bit_semantic_accepts_exact_runtime_index(self):
        semantic = {
            "argumentCount": 3,
            "argumentConstraints": [
                {"index": 0, "values": [0]},
                {"index": 1, "kinds": ["constant", "frame-field"]},
                {"index": 2, "values": [0, 1]},
            ],
        }
        operation = {
            "arguments": [
                {"kind": "constant", "value": 0},
                {"kind": "frame-field", "offset": 4},
                {"kind": "constant", "value": 1},
            ],
        }
        self.assertTrue(semantic_applies(semantic, operation))
        operation["arguments"][0]["value"] = 1
        self.assertFalse(semantic_applies(semantic, operation))

    def test_deduplicates_only_exactly_equivalent_frame_add_expression(self):
        legacy_add = {
            "kind": "frameFieldAdd",
            "callFileOffset": "0x104",
            "offset": 0,
            "width": 4,
            "value": 1,
        }
        expression_write = {
            "kind": "frameFieldExpressionWrite",
            "callFileOffset": "0x104",
            "offset": 0,
            "width": 4,
            "expression": {
                "kind": "add",
                "left": {
                    "kind": "frame-field",
                    "offset": 0,
                    "width": 4,
                    "signedLoad": False,
                },
                "right": {"kind": "constant", "value": 1},
            },
        }
        distinct_add = {
            **legacy_add,
            "callFileOffset": "0x108",
        }

        result = deduplicate_frame_field_mutations([
            legacy_add,
            expression_write,
            distinct_add,
        ])

        self.assertEqual(result, [expression_write, distinct_add])

    def test_classifies_exact_selector_zero_countdown_scheduler(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r0",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 44,
                "loadFileOffset": "0x100",
            },
            "runtimeDispatch": {
                "selector": 0,
                "argumentCount": 1,
                "arguments": [{"kind": "constant", "value": 1}],
            },
            "resultBitTest": {
                "kind": "runtimeResultBit",
                "mask": 0x00010000,
            },
        })
        self.assertEqual(action["kind"], "runtimeInterfaceCall")
        self.assertEqual(action["semanticId"], "native-scheduler-countdown")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_frame_backed_selector_zero_countdown_scheduler(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r0",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 44,
                "loadFileOffset": "0x100",
            },
            "runtimeDispatch": {
                "selector": 0,
                "argumentCount": 1,
                "arguments": [{
                    "kind": "frame-field",
                    "offset": 12,
                    "width": 4,
                    "signedLoad": False,
                }],
            },
            "resultBitTest": {
                "kind": "runtimeResultBit",
                "mask": 0x00010000,
            },
        })
        self.assertEqual(action["semanticId"], "native-scheduler-countdown")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_selector_nineteen_readiness_scheduler(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r0",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 44,
            },
            "runtimeDispatch": {
                "selector": 19,
                "argumentCount": 0,
                "arguments": [],
            },
            "resultBitTest": {
                "kind": "runtimeResultBit",
                "mask": 0x00010000,
            },
        })
        self.assertEqual(
            action["semanticId"],
            "native-scheduler-global-readiness",
        )
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_signed_integer_runtime_abi(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r3",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 20,
            },
            "integerArithmetic": {
                "argumentCount": 2,
                "arguments": [{
                    "kind": "frame-field",
                    "offset": 28,
                    "width": 4,
                    "signedLoad": False,
                }, {
                    "kind": "constant",
                    "value": 2,
                }],
            },
        })
        self.assertEqual(action["semanticId"], "native-signed-integer-division")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_integer_expression_runtime_abi(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r3",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 20,
            },
            "integerArithmetic": {
                "argumentCount": 2,
                "arguments": [{
                    "kind": "integer-expression",
                    "operator": "subtract",
                    "left": {"kind": "constant", "value": 20},
                    "right": {
                        "kind": "frame-field",
                        "offset": 8,
                        "width": 4,
                        "signedLoad": False,
                    },
                }, {
                    "kind": "frame-field",
                    "offset": 4,
                    "width": 4,
                    "signedLoad": False,
                }],
            },
        })
        self.assertEqual(action["semanticId"], "native-signed-integer-division")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_narrow_frame_and_scene_runtime_abi(self):
        for argument in ({
            "kind": "frame-field",
            "offset": 30,
            "width": 2,
            "signedLoad": True,
        }, {
            "kind": "scene-field",
            "offset": 0x224,
            "width": 1,
            "signedLoad": True,
        }):
            with self.subTest(kind=argument["kind"]):
                action = compile_indirect_call({
                    "callFileOffset": "0x104",
                    "operands": "@r3",
                    "targetSource": {
                        "kind": "base-register-slot",
                        "baseRegister": "r8",
                        "byteOffset": 20,
                    },
                    "integerArithmetic": {
                        "argumentCount": 2,
                        "arguments": [argument, {
                            "kind": "constant",
                            "value": 10,
                        }],
                    },
                })
                self.assertEqual(
                    action["semanticId"],
                    "native-signed-integer-division",
                )
                self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_wrapped_addition_runtime_abi(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r3",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 20,
            },
            "integerArithmetic": {
                "argumentCount": 2,
                "arguments": [{
                    "kind": "integer-expression",
                    "operator": "add",
                    "left": {
                        "kind": "frame-field",
                        "offset": 8,
                        "width": 4,
                        "signedLoad": False,
                    },
                    "right": {"kind": "constant", "value": 0x80000000},
                }, {"kind": "constant", "value": 2}],
            },
        })
        self.assertEqual(action["semanticId"], "native-signed-integer-division")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_signed_binary_angle_difference(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r3",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 20,
            },
            "integerArithmetic": {
                "argumentCount": 2,
                "arguments": [{
                    "kind": "integer-expression",
                    "operator": "signed-binary-angle-difference",
                    "left": {
                        "kind": "frame-field",
                        "offset": 52,
                        "width": 4,
                        "signedLoad": False,
                    },
                    "right": {
                        "kind": "frame-field",
                        "offset": 16,
                        "width": 4,
                        "signedLoad": False,
                    },
                }, {"kind": "constant", "value": 65536}],
            },
        })
        self.assertEqual(action["semanticId"], "native-signed-integer-division")
        self.assertEqual(action["behaviorStatus"], "proven")

    def test_classifies_exact_indexed_frame_field_runtime_abi(self):
        action = compile_indirect_call({
            "callFileOffset": "0x104",
            "operands": "@r3",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 20,
            },
            "integerArithmetic": {
                "argumentCount": 2,
                "arguments": [{
                    "kind": "frame-field-expression",
                    "baseOffset": 12,
                    "offsetExpression": {
                        "kind": "integer-expression",
                        "operator": "multiply-low",
                        "left": {"kind": "constant", "value": 12},
                        "right": {
                            "kind": "frame-field",
                            "offset": 312,
                            "width": 4,
                            "signedLoad": False,
                        },
                    },
                    "width": 4,
                    "signedLoad": False,
                }, {"kind": "constant", "value": 2}],
            },
        })
        self.assertEqual(action["semanticId"], "native-signed-integer-division")

    def test_promotes_exact_runtime_result_into_scheduler_countdown(self):
        action = compile_indirect_call({
            "callFileOffset": "0x110",
            "operands": "@r0",
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 44,
            },
            "runtimeDispatch": {
                "selector": 0,
                "argumentCount": 1,
                "arguments": [{
                    "kind": "call-result",
                    "source": "0x104",
                }],
            },
            "resultBitTest": {"mask": 0x00010000},
        }, {"0x104"})
        self.assertEqual(
            action["runtimeDispatch"]["arguments"],
            [{
                "kind": "operation-result",
                "source": "0x104",
                "callFileOffset": "0x104",
            }],
        )
        self.assertEqual(action["semanticId"], "native-scheduler-countdown")

    def test_semantic_constraints_can_require_an_exact_operand_kind(self):
        semantic = {
            "argumentConstraints": [{
                "index": 0,
                "kinds": ["static-pointer"],
            }],
        }
        self.assertTrue(semantic_applies(semantic, {
            "arguments": [{"kind": "static-pointer", "value": 0x100}],
        }))
        self.assertFalse(semantic_applies(semantic, {
            "arguments": [{"kind": "runtime"}],
        }))

    def test_preserves_actions_and_marks_only_proven_adapters(self):
        control_flow = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": "abc",
                "mapinfoHex": "",
                "initialFunctionFileOffset": "0x100",
                "dialoguePathFunctions": [{
                    "fileOffset": "0x100",
                    "endFileOffsetExclusive": "0x120",
                    "basicBlocks": [{
                        "startFileOffset": "0x100",
                        "endFileOffsetExclusive": "0x120",
                        "successors": [],
                    }],
                    "sceneFieldComparisons": [],
                    "nativeOperations": [
                        {
                            "callFileOffset": "0x104",
                            "operationId": 109,
                            "operationHex": "0x006d",
                            "arguments": [
                                {"kind": "constant", "value": 1}
                            ],
                        },
                        {
                            "callFileOffset": "0x108",
                            "operationId": 999,
                            "operationHex": "0x03e7",
                            "arguments": [],
                        },
                        {
                            "callFileOffset": "0x10a",
                            "operationId": 109,
                            "operationHex": "0x006d",
                            "arguments": [{"kind": "constant", "value": 2}],
                        },
                        {
                            "callFileOffset": "0x110",
                            "operationId": 2,
                            "operationHex": "0x0002",
                            "arguments": [],
                        },
                    ],
                    "secondaryNativeOperations": [{
                        "callFileOffset": "0x10b",
                        "operationId": 3,
                        "operationHex": "0x0003",
                        "arguments": [{"kind": "constant", "value": 7}],
                    }],
                    "directCalls": [{
                        "callFileOffset": "0x10c",
                        "targetFileOffset": "0x200",
                    }],
                    "childCoroutineLaunches": [{
                        "callFileOffset": "0x110",
                        "targetFileOffset": "0x300",
                        "argumentCount": 0,
                        "arguments": [],
                    }],
                    "indirectCalls": [{
                        "callFileOffset": "0x114",
                        "operands": "@r1",
                        "targetSource": {
                            "kind": "base-register-slot",
                            "baseRegister": "r8",
                            "byteOffset": 60,
                            "loadFileOffset": "0x112",
                        },
                    }],
                    "dialogueRegion": {"executableTargetIndex": 1},
                    "unresolvedControlTransfers": [],
                }],
            }],
        }
        semantics = {
            "operations": [
                {
                    "operationId": 109,
                    "operationHex": "0x006d",
                    "semanticId": "dialogue-start",
                    "argumentConstraints": [{
                        "index": 0,
                        "values": [1],
                    }],
                },
                {
                    "operationId": 109,
                    "operationHex": "0x006d",
                    "semanticId": "dialogue-resume",
                    "argumentConstraints": [{
                        "index": 0,
                        "values": [3],
                    }],
                },
                {
                    "operationId": 109,
                    "operationHex": "0x006d",
                    "semanticId": "dialogue-resume",
                    "argumentConstraints": [{
                        "index": 0,
                        "values": [4],
                    }],
                },
            ],
        }
        semantics["secondaryOperations"] = [{
            "operationId": 3,
            "operationHex": "0x0003",
            "argumentCount": 1,
            "semanticId": "secondary-test-operation",
        }]
        report = build_report(control_flow, semantics)
        actions = report["maps"][0]["functions"][0]["blocks"][0]["actions"]
        self.assertEqual(actions[0]["semanticId"], "dialogue-start")
        self.assertEqual(actions[0]["adapterStatus"], "proven")
        self.assertEqual(actions[1]["adapterStatus"], "unresolved")
        self.assertEqual(actions[2]["adapterStatus"], "unresolved")
        self.assertEqual(
            actions[2]["knownOperationFamilies"],
            ["dialogue-start", "dialogue-resume"],
        )
        self.assertEqual(actions[3]["kind"], "secondaryEngineOperation")
        self.assertEqual(actions[3]["operationHex"], "0x0003")
        self.assertEqual(actions[3]["adapterStatus"], "proven")
        self.assertEqual(
            actions[3]["semanticId"],
            "secondary-test-operation",
        )
        self.assertEqual(actions[4]["kind"], "directCall")
        self.assertEqual(actions[5]["kind"], "childCoroutineLaunch")
        self.assertEqual(actions[5]["arguments"], [])
        self.assertEqual(
            actions[6]["kind"],
            "coroutineContinuationTransfer",
        )
        self.assertEqual(
            actions[6]["semanticId"],
            "native-coroutine-save-continuation",
        )
        self.assertEqual(
            actions[6]["targetSource"]["byteOffset"],
            60,
        )
        self.assertEqual(
            [action["callFileOffset"] for action in actions].count("0x110"),
            1,
        )
        self.assertEqual(report["summary"]["provenEngineOperationCount"], 1)
        self.assertEqual(report["summary"]["frameFieldAddCount"], 0)
        self.assertEqual(
            report["summary"]["unresolvedEngineOperationCount"],
            2,
        )
        self.assertEqual(
            report["summary"]["semanticIds"],
            {"dialogue-start": 1},
        )
        self.assertEqual(
            report["summary"]["knownFamilyButUnresolvedCounts"],
            {"dialogue-resume": 1, "dialogue-start": 1},
        )
        self.assertEqual(
            report["summary"]["indirectCallBaseRegisterSlots"],
            {"r8+0x3c": 1},
        )
        self.assertEqual(report["summary"]["indirectCallCount"], 0)
        self.assertEqual(
            report["summary"]["coroutineContinuationTransferCount"],
            1,
        )
        self.assertEqual(
            report["summary"]["secondaryEngineOperationIds"],
            {"0x0003": 1},
        )

    def test_rejects_overlapping_semantic_constraints(self):
        control_flow = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": "abc",
                "mapinfoHex": "",
                "initialFunctionFileOffset": "0x100",
                "dialoguePathFunctions": [{
                    "fileOffset": "0x100",
                    "endFileOffsetExclusive": "0x120",
                    "basicBlocks": [{
                        "startFileOffset": "0x100",
                        "endFileOffsetExclusive": "0x120",
                        "successors": [],
                    }],
                    "sceneFieldComparisons": [],
                    "nativeOperations": [{
                        "callFileOffset": "0x104",
                        "operationId": 79,
                        "operationHex": "0x004f",
                        "arguments": [
                            {"kind": "constant", "value": 4},
                        ],
                    }],
                    "directCalls": [],
                    "childCoroutineLaunches": [],
                    "dialogueRegion": None,
                    "unresolvedControlTransfers": [],
                }],
            }],
        }
        semantics = {
            "operations": [
                {
                    "operationId": 79,
                    "semanticId": "first",
                    "argumentConstraints": [{
                        "index": 0,
                        "values": [4],
                    }],
                },
                {
                    "operationId": 79,
                    "semanticId": "second",
                    "argumentConstraints": [{
                        "index": 0,
                        "values": [4],
                    }],
                },
            ],
        }
        with self.assertRaisesRegex(ValueError, "overlapping semantics"):
            build_report(control_flow, semantics)

    def test_source_safe_summary_omits_maps(self):
        report = {
            "evidenceBoundary": ["boundary"],
            "summary": {"functionCount": 1},
            "maps": [{"private": "text"}],
        }
        summary = summary_report(report)
        self.assertNotIn("maps", summary)
        self.assertEqual(summary["summary"]["functionCount"], 1)


if __name__ == "__main__":
    unittest.main()
