#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.build_native_event_program_pack import (  # noqa: E402
    automatic_events,
    build_pack,
    build_runtime_index,
    event_cameras,
    room_controllers,
    scripted_interactions,
    static_strings,
    static_vectors,
    static_program_closure,
)


def function(function_id, actions=()):
    return {
        "id": function_id,
        "entryBlock": function_id,
        "blocks": [{
            "id": function_id,
            "endFileOffsetExclusive": hex(int(function_id, 0) + 16),
            "actions": list(actions),
            "successors": [],
        }],
        "unresolvedControlTransfers": [],
    }


class BuildNativeEventProgramPackTest(unittest.TestCase):
    def setUp(self):
        self.source_map = {
            "disc": 1,
            "area": "TEST",
            "mapinfoSha256": "abc",
            "entryFunction": "0x100",
            "functions": [
                function("0x100", [{
                    "kind": "directCall",
                    "callFileOffset": "0x104",
                    "targetFileOffset": "0x200",
                }, {
                    "kind": "childCoroutineLaunch",
                    "callFileOffset": "0x108",
                    "targetFileOffset": "0x300",
                }]),
                function("0x180"),
                function("0x200", [{
                    "kind": "directCall",
                    "callFileOffset": "0x204",
                    "targetFileOffset": "0x100",
                }]),
                function("0x300"),
            ],
        }

    def test_static_strings_preserve_exact_pointer_and_source(self):
        route = {
            "id": "test",
            "staticStrings": [{
                "pointer": 0xCA04,
                "value": "/scene/01/D000/",
                "sourceFileOffset": "0xaee84",
            }],
        }
        self.assertEqual(static_strings(route), route["staticStrings"])

        route["staticStrings"].append({
            "pointer": 0xCA04,
            "value": "duplicate",
            "sourceFileOffset": "0xaee94",
        })
        with self.assertRaisesRegex(ValueError, "invalid or duplicated"):
            static_strings(route)

    def test_static_vectors_preserve_exact_three_word_data(self):
        route = {
            "id": "test",
            "staticVectors": [{
                "pointer": 0x200,
                "words": [0x3f800000, 0x40000000, 0x40400000],
                "sourceFileOffset": "0x200",
            }],
        }
        self.assertEqual(static_vectors(route), route["staticVectors"])
        route["staticVectors"][0]["words"] = [0, 1]
        with self.assertRaisesRegex(ValueError, "invalid or duplicated"):
            static_vectors(route)

    def test_closure_keeps_direct_and_child_targets_without_unrelated_code(self):
        functions, edges = static_program_closure(
            self.source_map,
            "0x100",
        )
        self.assertEqual(
            [item["id"] for item in functions],
            ["0x100", "0x200", "0x300"],
        )
        self.assertEqual(
            edges,
            {"directCall": 2, "childCoroutineLaunch": 1},
        )

    def test_closure_keeps_every_bounded_typed_table_child_target(self):
        self.source_map["functions"][0]["blocks"][0]["actions"][1] = {
            "kind": "childCoroutineLaunch",
            "callFileOffset": "0x108",
            "targetFileOffsets": ["0x180", "0x300"],
            "targetSource": {"kind": "typed-table-operation-result"},
        }
        functions, edges = static_program_closure(
            self.source_map,
            "0x100",
        )

        self.assertEqual(
            [item["id"] for item in functions],
            ["0x100", "0x180", "0x200", "0x300"],
        )
        self.assertEqual(
            edges,
            {"directCall": 2, "childCoroutineLaunch": 2},
        )

    def test_automatic_event_keeps_separate_exact_gate_and_control_roots(self):
        gate = {
            **function("0x180"),
            "returnValue": {
                "kind": "frame-field",
                "offset": 3,
                "width": 1,
                "signedLoad": True,
            },
        }
        self.source_map["functions"][1] = gate
        self.source_map["functions"][3]["dialogueRegion"] = {
            "actorTags": ["TEST"],
            "voiceIds": ["E0000A001"],
        }
        functions, _ = static_program_closure(
            self.source_map,
            "0x100",
            ["0x180"],
        )
        route = {
            "id": "test-route",
            "automaticEvents": [{
                "id": "selector-test",
                "actorCode": "TEST",
                "gateEntryFunction": "0x180",
                "matchedReturnValue": 18,
                "entryFunction": "0x100",
                "activityOwnerFunctions": ["0x200"],
                "dialogueEntryFunction": "0x300",
            }],
        }
        self.assertEqual(automatic_events(route, functions), [{
            **route["automaticEvents"][0],
            "voiceIds": ["E0000A001"],
        }])

        gate["returnValue"] = None
        with self.assertRaisesRegex(ValueError, "no exact return value"):
            automatic_events(route, functions)

    def test_room_controller_preserves_exact_poll_and_dispatch_owner(self):
        poll_action = {
            "kind": "engineOperation",
            "callFileOffset": "0x124",
            "operationHex": "0x0116",
            "arguments": [{"kind": "constant", "value": 0xffffffff}],
        }
        self.source_map["functions"][0]["blocks"][0]["actions"].append(
            poll_action,
        )
        functions, _ = static_program_closure(self.source_map, "0x100")
        declaration = {
            "id": "owner",
            "entryFunction": "0x100",
            "launch": {
                "sourceFunction": "0x400",
                "callFileOffset": "0x404",
                "operationHex": "0x0002",
            },
            "poll": {
                "functionFileOffset": "0x100",
                "callFileOffset": "0x124",
                "operationHex": "0x0116",
                "selector": -1,
            },
            "dispatches": [{
                "eventCode": "TEST",
                "targetFunction": "0x300",
            }],
        }
        self.assertEqual(room_controllers({
            "id": "test-route",
            "roomControllers": [declaration],
        }, functions), [declaration])

        declaration["poll"]["callFileOffset"] = "0x126"
        with self.assertRaisesRegex(ValueError, "poll is not exact"):
            room_controllers({
                "id": "test-route",
                "roomControllers": [declaration],
            }, functions)

    def test_pack_retains_exact_route_and_source_provenance(self):
        self.source_map["functions"][3]["dialogueRegion"] = {
            "actorTags": ["TEST"],
            "voiceIds": ["F0000A001"],
        }
        report = build_pack({
            "schema": "new-yokosuka-native-event-ir-v1",
            "summary": {"sourceScope": "scripted-events"},
            "maps": [self.source_map],
        }, {
            "schema": "new-yokosuka-native-event-program-routes-v1",
            "routes": [{
                "id": "test-route",
                "disc": 1,
                "area": "TEST",
                "mapinfoSha256": "abc",
                "entryFunction": "0x100",
                "activityOwnerFunctions": ["0x200"],
                "directEntryState": {
                    "0x200": {
                        "sceneFields": [
                            {"offset": 0x280, "width": 4, "value": 0xffffffff},
                        ],
                        "objectBaseVectors": [
                            {"objectTag": "TEST", "vector": [1.0, 2.0, 3.0]},
                        ],
                        "operation001cObjects": [{
                            "objectTag": "TEST",
                            "present": True,
                            "directWords": [4, 5, 6],
                            "associatedWords": [7, 8, 9],
                        }],
                        "evidence": ["constructor.json#0x100"],
                    },
                },
                "scriptedInteractions": [{
                    "actorCode": "TEST",
                    "entryFunction": "0x100",
                    "dialogueEntryFunction": "0x300",
                }],
                "evidence": ["evidence.json"],
            }],
        }, event_ir_sha256="def")
        program = report["programs"][0]
        self.assertEqual(program["id"], "test-route")
        self.assertEqual(program["mapinfoSha256"], "abc")
        self.assertEqual(program["entryFunction"], "0x100")
        self.assertEqual(program["directEntries"], ["0x200"])
        self.assertEqual(program["directEntryState"], {
            "0x200": {
                "sceneFields": [
                    {"offset": 0x280, "width": 4, "value": 0xffffffff},
                ],
                "objectBaseVectors": [
                    {"objectTag": "TEST", "vector": [1.0, 2.0, 3.0]},
                ],
                "operation001cObjects": [{
                    "objectTag": "TEST",
                    "present": True,
                    "directWords": [4, 5, 6],
                    "associatedWords": [7, 8, 9],
                }],
                "evidence": ["constructor.json#0x100"],
            },
        })
        self.assertEqual(program["scriptedInteractions"], [{
            "actorCode": "TEST",
            "entryFunction": "0x100",
            "dialogueEntryFunction": "0x300",
            "voiceIds": ["F0000A001"],
        }])
        self.assertEqual(program["summary"]["functionCount"], 3)
        self.assertEqual(program["summary"]["actionCount"], 3)
        self.assertEqual(program["summary"]["actionKinds"], {
            "childCoroutineLaunch": 1,
            "directCall": 2,
        })
        self.assertEqual(report["generatedFrom"], {
            "nativeEventIrSha256": "def",
            "sourceScope": "scripted-events",
        })

    def test_runtime_index_keeps_routes_but_shards_executable_functions(self):
        program = {
            "id": "test-route",
            "disc": 1,
            "area": "TEST",
            "entryFunction": "0x100",
            "scriptedInteractions": [{
                "actorCode": "TEST",
                "entryFunction": "0x100",
            }],
            "eventCameras": {"records": [{"cameraNumber": 7}]},
            "staticStrings": [{"pointer": 1, "value": "large payload"}],
            "functions": [function("0x100")],
        }
        index, assets = build_runtime_index({
            "schema": "new-yokosuka-native-event-program-pack-v1",
            "generatedFrom": {"nativeEventIrSha256": "abc"},
            "programs": [program],
        })

        self.assertEqual(
            index["schema"],
            "new-yokosuka-native-event-program-index-v1",
        )
        descriptor = index["programs"][0]
        self.assertEqual(descriptor["scriptedInteractions"], (
            program["scriptedInteractions"]
        ))
        self.assertNotIn("functions", descriptor)
        self.assertNotIn("staticStrings", descriptor)
        self.assertEqual(
            index["eventCamerasByArea"],
            {"TEST": [{"cameraNumber": 7}]},
        )
        self.assertEqual(len(assets), 1)
        payload = next(iter(assets.values()))
        self.assertEqual(__import__("json").loads(payload), program)
        self.assertEqual(descriptor["asset"]["byteLength"], len(payload))

    def test_pack_includes_a_fully_compiled_canonical_cutscene_program(self):
        artifact = {
            "schema": "new-yokosuka-native-cutscene-program-v1",
            "id": "S1-TEST-00",
            "disc": 1,
            "area": "TEST",
            "mapinfoSha256": "abc",
            "entryFunction": "0x180",
            "entryInvocation": {
                "initialFrameFields": {"12": 0x54455354},
            },
            "compile": {"status": "compiled", "blockers": []},
            "summary": {"functionCount": 1},
            "functions": [function("0x180")],
        }
        report = build_pack({
            "schema": "new-yokosuka-native-event-ir-v1",
            "summary": {"sourceScope": "scripted-events"},
            "maps": [self.source_map],
        }, {
            "schema": "new-yokosuka-native-event-program-routes-v1",
            "routes": [],
        }, compiled_programs=[artifact])

        self.assertEqual(len(report["programs"]), 1)
        program = report["programs"][0]
        self.assertEqual(program["id"], "S1-TEST-00")
        self.assertEqual(program["entryFunction"], "0x180")
        self.assertEqual(
            program["entryInvocation"]["initialFrameFields"]["12"],
            0x54455354,
        )
        self.assertNotIn("schema", program)
        self.assertNotIn("compile", program)

    def test_pack_rejects_an_incomplete_canonical_cutscene_program(self):
        artifact = {
            "schema": "new-yokosuka-native-cutscene-program-v1",
            "id": "S1-TEST-00",
            "area": "TEST",
            "entryFunction": "0x180",
            "compile": {
                "status": "blocked",
                "blockers": [{"operationHex": "0x0001"}],
            },
            "functions": [function("0x180")],
        }
        with self.assertRaisesRegex(ValueError, "invalid or duplicated"):
            build_pack({
                "schema": "new-yokosuka-native-event-ir-v1",
                "summary": {"sourceScope": "scripted-events"},
                "maps": [self.source_map],
            }, {
                "schema": "new-yokosuka-native-event-program-routes-v1",
                "routes": [],
            }, compiled_programs=[artifact])

    def test_scripted_interactions_must_be_exact_reached_dialogue_regions(self):
        functions, _ = static_program_closure(self.source_map, "0x100")
        with self.assertRaisesRegex(ValueError, "outside its static closure"):
            scripted_interactions({
                "id": "test",
                "scriptedInteractions": [{
                    "actorCode": "TEST",
                    "entryFunction": "0x180",
                }],
            }, functions)
        functions[1]["dialogueRegion"] = {
            "actorTags": ["OTHER"],
            "voiceIds": ["F0000A001"],
        }
        with self.assertRaisesRegex(ValueError, "no exact TEST"):
            scripted_interactions({
                "id": "test",
                "scriptedInteractions": [{
                    "actorCode": "TEST",
                    "entryFunction": "0x200",
                }],
            }, functions)

    def test_control_entry_requires_an_explicitly_reachable_dialogue_entry(self):
        functions, _ = static_program_closure(self.source_map, "0x100")
        functions[2]["dialogueRegion"] = {
            "actorTags": ["TEST"],
            "voiceIds": ["F0000A001"],
        }
        self.assertEqual(scripted_interactions({
            "id": "test",
            "scriptedInteractions": [{
                "actorCode": "TEST",
                "entryFunction": "0x100",
                "dialogueEntryFunction": "0x300",
            }],
        }, functions), [{
            "actorCode": "TEST",
            "entryFunction": "0x100",
            "dialogueEntryFunction": "0x300",
            "voiceIds": ["F0000A001"],
        }])

        functions.append({
            **function("0x400"),
            "dialogueRegion": {
                "actorTags": ["TEST"],
                "voiceIds": ["F0000A002"],
            },
        })
        with self.assertRaisesRegex(ValueError, "not statically reachable"):
            scripted_interactions({
                "id": "test",
                "scriptedInteractions": [{
                    "actorCode": "TEST",
                    "entryFunction": "0x100",
                    "dialogueEntryFunction": "0x400",
                }],
            }, functions)

    def test_object_interaction_keeps_exact_trigger_and_dialogue_actor(self):
        functions, _ = static_program_closure(self.source_map, "0x100")
        functions[2]["dialogueRegion"] = {
            "actorTags": ["TEST", "PROP"],
            "voiceIds": ["S0000A001"],
        }
        self.assertEqual(scripted_interactions({
            "id": "test",
            "scriptedInteractions": [{
                "actorCode": "TEST",
                "objectTag": "PROP",
                "entryFunction": "0x100",
                "dialogueEntryFunction": "0x300",
            }],
        }, functions), [{
            "actorCode": "TEST",
            "objectTag": "PROP",
            "entryFunction": "0x100",
            "dialogueEntryFunction": "0x300",
            "voiceIds": ["S0000A001"],
        }])

        with self.assertRaisesRegex(ValueError, "invalid or duplicated"):
            scripted_interactions({
                "id": "test",
                "scriptedInteractions": [{
                    "actorCode": "TEST",
                    "objectTag": "BAD",
                    "entryFunction": "0x100",
                    "dialogueEntryFunction": "0x300",
                }],
            }, functions)

    def test_event_cameras_retain_only_exact_declared_catalog_records(self):
        route = {
            "id": "test-route",
            "mapinfoSha256": "abc",
            "eventCameras": {
                "catalog": "camera.json",
                "cameraNumbers": [20, 10],
                "evidence": ["camera-evidence.json"],
            },
        }
        records = event_cameras(route, lambda _path: {
            "schema": "new-yokosuka-event-camera-catalog-v1",
            "mapinfoSha256": "abc",
            "records": [
                {"cameraNumber": 10, "curves": {}},
                {"cameraNumber": 20, "curves": {}},
                {"cameraNumber": 30, "curves": {}},
            ],
        })
        self.assertEqual(
            [item["cameraNumber"] for item in records["records"]],
            [20, 10],
        )
        self.assertEqual(records["evidence"], ["camera-evidence.json"])
        self.assertEqual(records["mapinfoSha256"], "abc")

        with self.assertRaisesRegex(ValueError, "MAPINFO hash changed"):
            event_cameras(route, lambda _path: {
                "schema": "new-yokosuka-event-camera-catalog-v1",
                "mapinfoSha256": "different",
                "records": [],
            })
        with self.assertRaisesRegex(ValueError, "records are missing"):
            event_cameras(route, lambda _path: {
                "schema": "new-yokosuka-event-camera-catalog-v1",
                "mapinfoSha256": "abc",
                "records": [],
            })

    def test_rejects_missing_static_targets_and_source_hash_changes(self):
        self.source_map["functions"][0]["blocks"][0]["actions"][0][
            "targetFileOffset"
        ] = "0x999"
        with self.assertRaisesRegex(ValueError, "outside its MAPINFO"):
            static_program_closure(self.source_map, "0x100")

        self.source_map["functions"][0]["blocks"][0]["actions"] = []
        with self.assertRaisesRegex(ValueError, "MAPINFO hash changed"):
            build_pack({
                "schema": "new-yokosuka-native-event-ir-v1",
                "maps": [self.source_map],
            }, {
                "schema": "new-yokosuka-native-event-program-routes-v1",
                "routes": [{
                    "id": "test-route",
                    "disc": 1,
                    "area": "TEST",
                    "mapinfoSha256": "different",
                    "entryFunction": "0x100",
                }],
            })


if __name__ == "__main__":
    unittest.main()
