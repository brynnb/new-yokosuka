import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_actor_body_routes",
    ROOT / "tools/scripting/extract_dialogue_actor_body_routes.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueActorBodyRouteExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_HUMANS.read_bytes(),
        )

    def test_native_interpreters_are_verified(self):
        evidence = self.report["executableEvidence"]
        self.assertEqual(evidence["sha256"], MODULE.EXECUTABLE_SHA256)
        self.assertEqual(
            set(evidence["verifiedCodeRanges"]),
            set(MODULE.VERIFIED_RANGES),
        )

    def test_all_actor_bodies_decode_inside_routing_streams(self):
        summary = self.report["summary"]
        self.assertEqual(summary["resourceCount"], 262)
        self.assertEqual(summary["bodyCount"], 4327)
        self.assertGreater(summary["graphNodeCount"], 40_000)
        self.assertGreater(summary["messageGroupCount"], 10_000)
        self.assertGreater(
            summary["selectedResourceMessageIndexCount"],
            25_000,
        )
        self.assertEqual(
            set(summary["terminationCounts"]),
            {
                "conversationLifecycleTransition",
                "nestedDynamicContinuation",
                "progressTableMayRedirect",
            },
        )

    def test_bob_body_selects_all_ten_authored_messages(self):
        bob = next(
            resource
            for resource in self.report["resources"]
            if resource["actorCode"] == "BOB_"
        )
        self.assertEqual(len(bob["bodies"]), 1)
        body = bob["bodies"][0]["graph"]
        indexes = {
            selection["messageIndex"]
            for group in body["messageGroups"]
            for selection in group["messageSelections"]
        }
        self.assertEqual(indexes, set(range(10)))
        self.assertEqual(body["dynamicBoundaryCount"], 0)

    def test_nested_presentation_commands_retain_exact_timing_class(self):
        data = bytes((
            0x30, 0x14,
            0x60, 0x78,
            0xFC,
            0xF6,
        ))
        group = MODULE.decode_message_group(
            data,
            start=0,
            stream_start=0,
            stream_end=len(data),
            record_start=0,
            message_count=0,
        )
        self.assertEqual(group["nativeCommands"], [
            {
                "opcodeOffset": "0x0",
                "commandWord": 0x14,
                "nativeTickAdvance": 1,
            },
            {
                "opcodeOffset": "0x2",
                "commandWord": 0x78,
                "nativeTickAdvance": 0,
            },
            {
                "opcodeOffset": "0x4",
                "commandWord": 0xFC00,
                "nativeTickAdvance": 0,
            },
        ])

    def test_f2_continues_at_plus_four_not_plus_one(self):
        data = bytes((0xF2, 0, 0, 0, 0xFF))
        graph = MODULE.decode_body_graph(
            data,
            body_start=0,
            body_end=len(data),
            stream_start=0,
            stream_end=len(data),
            record_start=0,
            message_count=0,
        )
        f2_edge = next(
            edge
            for edge in graph["edges"]
            if edge["kind"] == "afterState5Completion"
        )
        self.assertTrue(f2_edge["to"].startswith("0x4:"))

    def test_f5_stores_target_but_structurally_falls_through(self):
        data = bytes((0xF5, 0, 0, 1, 0xFF, 0xFF))
        graph = MODULE.decode_body_graph(
            data,
            body_start=0,
            body_end=len(data),
            stream_start=0,
            stream_end=len(data),
            record_start=0,
            message_count=0,
        )
        f5 = next(node for node in graph["nodes"] if node["offset"] == "0x0")
        self.assertEqual(f5["storedContinuation64"], "0x5")
        edge = next(edge for edge in graph["edges"] if edge["from"] == f5["id"])
        self.assertTrue(edge["to"].startswith("0x4:"))
        self.assertEqual(edge["kind"], "fallthrough")

    def test_only_verified_e_class_opcodes_yield_external_work(self):
        data = bytes((
            0xE3, 0,
            0xE5, 2, 0xAA, 0xBB,
            0xE4, 2, 0, 0,
            0xFF,
        ))
        graph = MODULE.decode_body_graph(
            data,
            body_start=0,
            body_end=len(data),
            stream_start=0,
            stream_end=len(data),
            record_start=0,
            message_count=0,
        )
        nodes = {node["offset"]: node for node in graph["nodes"]}
        self.assertEqual(nodes["0x0"]["operation"], "advanceTwoBytes")
        self.assertEqual(nodes["0x2"]["operation"], "skipLengthPrefixedPayload")
        self.assertEqual(nodes["0x6"]["operation"], "actorNativeEventAndYield")
        self.assertEqual(nodes["0x6"]["nativeRuntimeState"], 7)
        edge_kinds = {
            node["offset"]: next(
                edge["kind"]
                for edge in graph["edges"]
                if edge["from"] == node["id"]
            )
            for node in nodes.values()
            if any(edge["from"] == node["id"] for edge in graph["edges"])
        }
        self.assertEqual(edge_kinds["0x0"], "fallthrough")
        self.assertEqual(edge_kinds["0x2"], "fallthrough")
        self.assertEqual(edge_kinds["0x6"], "afterExternalCompletion")


if __name__ == "__main__":
    unittest.main()
