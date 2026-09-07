import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_actor_entry_routes",
    ROOT / "tools/scripting/extract_dialogue_actor_entry_routes.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueActorEntryRouteExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_HUMANS.read_bytes(),
        )

    def test_native_selector_and_expression_code_is_verified(self):
        evidence = self.report["executableEvidence"]
        self.assertEqual(
            evidence["sha256"],
            MODULE.EXECUTABLE_SHA256,
        )
        self.assertEqual(
            set(evidence["verifiedCodeRanges"]),
            {
                "initialEntrySelector",
                "prefixExpressionEvaluator",
                "expressionValueResolver",
                "entryMarkerScanner",
            },
        )

    def test_every_actor_resource_has_a_bounded_route_graph(self):
        summary = self.report["summary"]
        self.assertEqual(summary["resourceCount"], 262)
        self.assertEqual(summary["uniqueActorCodeCount"], 257)
        self.assertGreater(summary["graphNodeCount"], 40_000)
        self.assertGreater(summary["entryMarkerCount"], 1_000)
        self.assertGreater(summary["uniqueExpressionCount"], 200)
        self.assertEqual(
            set(summary["terminationCounts"]),
            {"nativeNullReturn"},
        )
        for resource in self.report["resources"]:
            graph = resource["graph"]
            self.assertGreater(graph["entryMarkerCount"], 0)
            for entry in graph["entries"]:
                self.assertLessEqual(
                    int(entry["bodyEndOffsetExclusive"], 16),
                    int(graph["routingEndOffsetExclusive"], 16),
                )

    def test_bob_route_converges_under_distinct_native_expressions(self):
        bob = next(
            resource
            for resource in self.report["resources"]
            if resource["actorCode"] == "BOB_"
        )
        graph = bob["graph"]
        self.assertEqual(graph["routingStartOffset"], "0x68")
        self.assertEqual(graph["routingEndOffsetExclusive"], "0xe4")
        self.assertEqual(graph["entryMarkerCount"], 1)
        self.assertEqual(graph["entryStateVariantCount"], 4)
        self.assertEqual(graph["entries"][0]["markerOffset"], "0x8f")
        self.assertEqual(graph["entries"][0]["bodyOffset"], "0x91")
        self.assertEqual(graph["entries"][0]["bodyByteLength"], 77)

    def test_expression_parser_retains_typed_rpn_operands(self):
        data = bytes((0x60, 0x01, 0x60, 0x02, 0x87, 0x80))
        end, expression = MODULE.parse_expression(data, 0, len(data))
        self.assertEqual(end, len(data))
        ast = expression["ast"]
        self.assertEqual(ast["operation"], "equal")
        self.assertEqual(ast["left"]["kind"], "literal")
        self.assertEqual(ast["left"]["value"], 1)
        self.assertEqual(ast["right"]["value"], 2)

    def test_ordered_comparison_direction_matches_native_stack_order(self):
        data = bytes((0x60, 0x02, 0x60, 0x01, 0x89, 0x80))
        _, expression = MODULE.parse_expression(data, 0, len(data))
        ast = expression["ast"]
        self.assertEqual(ast["operation"], "greaterThan")
        self.assertEqual(ast["left"]["value"], 2)
        self.assertEqual(ast["right"]["value"], 1)


if __name__ == "__main__":
    unittest.main()
