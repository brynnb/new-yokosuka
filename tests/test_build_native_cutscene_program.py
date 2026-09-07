import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools.cutscenes.build_native_cutscene_program import (  # noqa: E402
    build_program,
    embedded_auth_resources,
    invocation_specialized_closure,
)
from tools.cutscenes.native_cutscene_dependencies import (  # noqa: E402
    action_target_file_offsets,
    operation_013c_archive_pairs,
    operation_013c_static_record_pairs,
    operation_013e_static_bindings,
    static_strings,
)


class NativeCutsceneProgramCompilerTest(unittest.TestCase):
    def test_embedded_auth_resource_size_includes_trck_header(self):
        payload = b"ASEQ" + (8).to_bytes(4, "little")
        chunk = b"TRCK" + (16).to_bytes(4, "little") + payload
        resource = embedded_auth_resources(chunk)[0]
        self.assertEqual(resource["sourceFileOffset"], "0x0")
        self.assertEqual(resource["byteLength"], len(chunk))

    def test_reads_exact_static_targets_without_legacy_builder(self):
        self.assertEqual(
            action_target_file_offsets({
                "kind": "childCoroutineLaunch",
                "targetFileOffsets": ["0x100", "0x200"],
            }),
            ["0x100", "0x200"],
        )

    def test_derives_typed_static_dependencies(self):
        functions = [{"blocks": [{"actions": [{
            "kind": "engineOperation",
            "callFileOffset": "0x10",
            "semanticId": "native-operation-013c-container-control",
            "arguments": [
                {"kind": "constant", "value": 0},
                {"kind": "constant", "value": 0},
                {"kind": "static-pointer", "value": 4},
                {"kind": "static-pointer", "value": 9},
            ],
        }, {
            "kind": "engineOperation",
            "callFileOffset": "0x18",
            "semanticId": "native-operation-013c-container-control",
            "arguments": [
                {"kind": "constant", "value": 1},
                {"kind": "constant", "value": 0},
                {"kind": "static-pointer", "value": 4},
                {"kind": "static-pointer", "value": 9},
            ],
        }, {
            "kind": "engineOperation",
            "callFileOffset": "0x20",
            "semanticId": "native-operation-013e-resource-slot-control",
            "arguments": [
                {"kind": "constant", "value": 0},
                {"kind": "constant", "value": 7},
                {"kind": "static-pointer", "value": 4},
                {"kind": "static-pointer", "value": 9},
            ],
        }, {
            "kind": "engineOperation",
            "arguments": [{"kind": "static-pointer", "value": 16}],
        }]}]}]
        mapinfo = b"xxxxPATH\0NAME\0\x00\x01\x02\0"
        self.assertEqual(static_strings(functions, mapinfo), [{
            "pointer": 4,
            "value": "PATH",
            "sourceFileOffset": "0x4",
        }, {
            "pointer": 9,
            "value": "NAME",
            "sourceFileOffset": "0x9",
        }])
        self.assertEqual(operation_013c_static_record_pairs(functions), [{
            "argument2": 4,
            "argument3": 9,
            "callFileOffsets": ["0x10"],
        }])
        self.assertEqual(operation_013c_archive_pairs(functions), [{
            "pathPointer": 4,
            "namePointer": 9,
            "callFileOffsets": ["0x18"],
        }])
        self.assertEqual(operation_013e_static_bindings(functions), [{
            "slot": 7,
            "primaryPointer": 4,
            "secondaryPointer": 9,
            "callFileOffsets": ["0x20"],
        }])

    def test_op02_dependencies_are_derived_from_native_data(self):
        import json

        program = json.loads((
            ROOT / "play/assets/introduction/op02/cutscene-program.generated.json"
        ).read_text())
        mapinfo = (
            ROOT / ".disc-work/mapinfo/disc1/SCENE/01/OP02/MAPINFO.BIN"
        ).read_bytes()
        self.assertEqual(
            static_strings(program["functions"], mapinfo),
            program["staticStrings"],
        )
        self.assertEqual(program["operation013cStaticRecordPairs"], [{
            "argument2": 0x271e,
            "argument3": 0x272e,
            "callFileOffsets": ["0x1a7a"],
        }])
        self.assertEqual(program["operation013cArchivePairs"], [{
            "pathPointer": 0x2748,
            "namePointer": 0x2758,
            "callFileOffsets": ["0x1cf0"],
        }])
        self.assertEqual(program["staticVectors"], [{
            "pointer": 0x27C8,
            "words": [0x459CE000, 0xC3520000, 0xC5AFA000],
            "sourceFileOffset": "0x27c8",
            "callFileOffsets": ["0x2440"],
        }])
        self.assertEqual(program["operation013eStaticBindings"], [])
        self.assertEqual(program["compile"], {
            "status": "compiled",
            "blockers": [],
        })

    def test_op00_a0114_owner_is_derived_from_authored_resource_family(self):
        import json

        program = json.loads((
            ROOT / "play/assets/introduction/op00/cutscene-program.generated.json"
        ).read_text())
        selection = program["authResourceSelection"]
        self.assertEqual(selection["selectionKind"], "embedded-authored-path-family")
        self.assertEqual(selection["authoredPathToken"], "/AUTH01/0114/")
        self.assertEqual(selection["matchingResourceCount"], 26)
        self.assertEqual(selection["selectedResourceCount"], 24)
        self.assertEqual(selection["selectedSlots"], list(range(24)))
        self.assertEqual(
            [stage["functionId"] for stage in selection["stages"]],
            ["0x1512a", "0x1785c"],
        )
        self.assertEqual(
            [stage["activityCallCount"] for stage in selection["stages"]],
            [4, 20],
        )
        order = [call["slot"] for call in selection["ownerCalls"]]
        self.assertEqual(len(order), 24)
        self.assertEqual(sorted(order), list(range(24)))
        self.assertEqual(order[:7], [0, 1, 2, 3, 4, 18, 19])
        self.assertEqual(order[-4:], [16, 17, 20, 21])
        stage = next(
            function for function in program["functions"]
            if function["id"] == "0x1512a"
        )
        actions = [
            action
            for block in stage["blocks"]
            for action in block.get("actions", [])
        ]
        archive_acquire = next(
            action for action in actions
            if action.get("callFileOffset") == "0x151a2"
        )
        archive_activity = next(
            action for action in actions
            if action.get("callFileOffset") == "0x151d4"
        )
        self.assertEqual(archive_acquire["resultTarget"], {
            "kind": "sceneField",
            "offset": 0,
            "width": 4,
            "storeFileOffset": "0x151ac",
        })
        self.assertEqual(archive_activity["arguments"][2], {
            "kind": "scene-field",
            "source": "@(0,r9) at 0x151be",
            "offset": 0,
        })
        self.assertEqual(selection["completionBoundary"], {
            "kind": "before-first-following-non-family-activity",
            "slot": 24,
            "callFileOffset": "0x1a95c",
            "functionId": "0x1785c",
            "blockId": "0x1a948",
            "resource": {
                "sourceFileOffset": "0x481f4",
                "byteLength": 3460,
                "sha256": "9230dfa8a9cbdafc5de16becab4b56a4d8f07930082e28cd983be003633ac0a0",
            },
            "ownerReturnBoundary": {
                "functionId": "0x20350",
                "blockId": "0x2044e",
                "callFileOffset": "0x20450",
                "completedStageFunction": "0x1785c",
            },
        })
        starts = [
            action["arguments"][0]["value"]
            for function in program["functions"]
            for block in function["blocks"]
            for action in block["actions"]
            if action.get("operationHex") == "0x0050"
            and action.get("arguments", [{}])[0].get("kind") == "constant"
            and action["arguments"][0]["value"] < 0x80000000
        ]
        self.assertEqual(sorted(starts), list(range(24)))
        self.assertNotIn("0x1dda8", [function["id"] for function in program["functions"]])
        self.assertNotEqual(program["compile"].get("firstBlocker", {}).get("identity"), "0x0058")

    def test_prunes_a_branch_after_an_exact_argument_copy(self):
        native_map = {
            "functions": [{
                "id": "0x100",
                "entryBlock": "0x100",
                "frameArgumentBase": 12,
                "blocks": [{
                    "id": "0x100",
                    "actions": [{
                        "kind": "frameFieldExpressionWrite",
                        "offset": 0,
                        "width": 4,
                        "expression": {
                            "kind": "frame-field",
                            "offset": 12,
                            "width": 4,
                            "signedLoad": False,
                        },
                    }],
                    "frameFieldComparisons": [{
                        "fieldOffset": 0,
                        "loadWidth": 4,
                        "signedLoad": False,
                        "comparison": "cmp/eq",
                        "constant": 7,
                        "resolvedBranch": {
                            "branchFileOffset": "0x10e",
                            "comparisonTrueSuccessor": "0x120",
                            "comparisonFalseSuccessor": "0x110",
                        },
                    }],
                    "terminator": {"fileOffset": "0x10e"},
                    "successors": ["0x120", "0x110"],
                }, {
                    "id": "0x110",
                    "actions": [],
                    "successors": [],
                }, {
                    "id": "0x120",
                    "actions": [],
                    "successors": [],
                }],
            }],
        }
        functions, edges = invocation_specialized_closure(
            native_map,
            "0x100",
            {"12": 7},
        )
        self.assertEqual(edges, {})
        self.assertEqual(
            [block["id"] for block in functions[0]["blocks"]],
            ["0x100", "0x120"],
        )

    def test_propagates_exact_direct_call_arguments(self):
        native_map = {
            "functions": [{
                "id": "0x100",
                "entryBlock": "0x100",
                "frameArgumentBase": 8,
                "blocks": [{
                    "id": "0x100",
                    "actions": [{
                        "kind": "directCall",
                        "targetFileOffset": "0x200",
                        "arguments": [{"kind": "constant", "value": 3}],
                    }],
                    "successors": [],
                }],
            }, {
                "id": "0x200",
                "entryBlock": "0x200",
                "frameArgumentBase": 16,
                "blocks": [{
                    "id": "0x200",
                    "actions": [],
                    "frameFieldComparisons": [{
                        "fieldOffset": 16,
                        "loadWidth": 4,
                        "signedLoad": False,
                        "comparison": "cmp/eq",
                        "constant": 3,
                        "resolvedBranch": {
                            "branchFileOffset": "0x20e",
                            "comparisonTrueSuccessor": "0x220",
                            "comparisonFalseSuccessor": "0x210",
                        },
                    }],
                    "terminator": {"fileOffset": "0x20e"},
                    "successors": ["0x220", "0x210"],
                }, {
                    "id": "0x210",
                    "actions": [],
                    "successors": [],
                }, {
                    "id": "0x220",
                    "actions": [],
                    "successors": [],
                }],
            }],
        }
        functions, edges = invocation_specialized_closure(
            native_map,
            "0x100",
            {},
        )
        self.assertEqual(edges, {"directCall": 1})
        self.assertEqual(
            [block["id"] for block in functions[1]["blocks"]],
            ["0x200", "0x220"],
        )


if __name__ == "__main__":
    unittest.main()
