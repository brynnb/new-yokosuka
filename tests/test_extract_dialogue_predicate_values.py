import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_predicate_values",
    ROOT / "tools/scripting/extract_dialogue_predicate_values.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialoguePredicateValueExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_HUMANS.read_bytes(),
        )

    def test_native_resolver_and_all_callees_are_verified(self):
        evidence = self.report["executableEvidence"]
        self.assertEqual(evidence["sha256"], MODULE.EXECUTABLE_SHA256)
        self.assertEqual(
            set(evidence["verifiedCodeRanges"]),
            set(MODULE.VERIFIED_RANGES),
        )

    def test_state_bank_capacities_and_suboperations_are_exact(self):
        values = {
            item["encodedGroup"]: item
            for item in self.report["nativeValueTypes"]
        }
        self.assertEqual(values["0x00"]["capacity"], 1024)
        self.assertEqual(values["0x00"]["operation0051ReadSuboperation"], 11)
        self.assertEqual(values["0x20"]["capacity"], 64)
        self.assertEqual(values["0x40"]["capacity"], 32)
        self.assertEqual(values["0x40"]["specialEncoding"], "0xfff becomes literal -1")

    def test_ordered_comparison_directions_are_named(self):
        operators = self.report["nativeOperators"]
        self.assertEqual(operators["9"], "greaterThan")
        self.assertEqual(operators["10"], "greaterThanOrEqual")
        self.assertEqual(operators["11"], "lessThan")
        self.assertEqual(operators["12"], "lessThanOrEqual")

    def test_story_step_is_an_ordered_bank2_table_not_a_chapter_guess(self):
        step = self.report["nativeStoryStep"]
        self.assertEqual(step["runtimeAddress"], "0xc22020c")
        self.assertEqual(step["displayFormat"], "STEP %2d.%1d")
        self.assertEqual(step["resetValue"], 0)
        self.assertEqual(step["noMatch"], "retain-previous-step")
        self.assertEqual(len(step["records"]), 80)
        self.assertEqual(step["records"][0], {"step": 979, "bank2Bit": 979})
        self.assertEqual(step["records"][-1], {"step": 11, "bank2Bit": 5})
        self.assertEqual(step["tableSha256"],
                         "d26687953dc8a6090d84b43907ba3d69c83681baea4340a1aed98f9a2ba15937")

    def test_story_step_rejects_an_unverified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0x2780B8 - 0x010000] ^= 1
        with self.assertRaises(MODULE.PredicateValueError):
            MODULE.extract_native_story_step(executable)

    def test_runtime_calendar_layout_is_exact(self):
        values = {
            item["encodedGroup"]: item
            for item in self.report["nativeValueTypes"]
        }
        modes = values["0xa0"]["modes"]
        self.assertEqual(modes["0"], "year since 1900")
        self.assertEqual(modes["3"], "weekday, Sunday 0 through Saturday 6")
        self.assertEqual(modes["5"], "minute, 0 through 59")
        self.assertEqual(modes["6"], "persistent yen balance")
        calendar = self.report["nativeCalendar"]
        self.assertEqual(calendar["runtimeAddress"], "0xc225228")
        self.assertEqual(calendar["yearBase"], 1900)
        self.assertEqual(calendar["fields"][3]["zeroValue"], "Sunday")
        currency = self.report["nativeCurrency"]
        self.assertEqual(currency["runtimeStructureOffset"], "0x18")
        self.assertEqual(currency["persistentValueSelector"], 2)
        self.assertEqual(currency["scriptReadOperation"], "0x005f")

    def test_arrival_entry_follows_the_transition_queue_to_operation_0026(self):
        arrival = self.report["nativeArrivalState"]
        self.assertEqual(arrival["entryQueryOperation"], "0x0026")
        self.assertEqual(arrival["fields"], [
            {"name": name, "operation0030Argument": index,
             "pendingControllerOffset": offset, "runtimeAddress": address, "width": 4}
            for index, (name, offset, address) in enumerate((
                ("scene", 0xd4, "0xc20c3d8"),
                ("area", 0xd0, "0xc20c3dc"),
                ("entry", 0xd8, "0xc20c3e0"),
            ))
        ])
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0x0C0C99D4 - MODULE.RUNTIME_BASE] ^= 1
        with self.assertRaises(MODULE.PredicateValueError):
            MODULE.extract_native_arrival_state(executable)

    def test_native_spatial_table_is_exact(self):
        table = self.report["nativeSpatialTable"]
        self.assertEqual(table["runtimeAddress"], "0xc2791c0")
        self.assertEqual(table["recordCount"], 13)
        self.assertEqual(table["recordSize"], 20)
        self.assertEqual(table["records"][0], {
            "index": 1,
            "mapIdentity": "D000",
            "runtimePosition": [6.0, 0.0, 84.0],
            "browserPosition": [-6.0, 0.0, 84.0],
            "radiusSquared": 225.0,
            "radius": 15.0,
        })
        self.assertEqual(table["records"][10]["mapIdentity"], "MFSY")
        self.assertEqual(table["records"][12]["radius"], 20.0)
        self.assertTrue(all(item["occurrenceCount"] for item in table["usage"]))

    def test_all_unique_predicate_asts_are_surveyed(self):
        corpus = self.report["corpus"]
        self.assertEqual(corpus["resourceCount"], 262)
        self.assertEqual(corpus["uniqueExpressionCount"], 254)
        self.assertGreater(
            corpus["uniqueExpressionValueKindCounts"]["nativeValueType2"],
            100,
        )
        self.assertEqual(
            corpus["uniqueExpressionValueKindCounts"]["nativeSpatialResult"],
            14,
        )


if __name__ == "__main__":
    unittest.main()
