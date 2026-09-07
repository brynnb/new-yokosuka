import importlib.util
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "dialogue_progress_state",
    ROOT / "tools/scripting/extract_dialogue_progress_state.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class DialogueProgressStateExtractorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(MODULE.DEFAULT_EXECUTABLE.read_bytes())

    def test_exact_executable_and_code_ranges_are_verified(self):
        evidence = self.report["executableEvidence"]
        self.assertEqual(evidence["sha256"], MODULE.EXECUTABLE_SHA256)
        self.assertEqual(
            set(evidence["verifiedCodeRanges"]),
            set(MODULE.VERIFIED_RANGES),
        )
        for item in evidence["verifiedCodeRanges"].values():
            self.assertEqual(len(item["sha256"]), 64)

    def test_progress_table_layout_is_exactly_bounded(self):
        table = self.report["nativeTable"]
        self.assertEqual(table["runtimeAddress"], "0xc222f40")
        self.assertEqual(table["recordCount"], 325)
        self.assertEqual(table["recordSize"], 12)
        self.assertEqual(table["byteLength"], 3900)
        self.assertEqual(
            [field["offset"] for field in table["fields"]],
            ["0x0", "0x2", "0x4", "0x6", "0x8"],
        )
        self.assertEqual(table["fields"][-1]["type"], "little-endian float32")
        self.assertEqual(table["fields"][-1]["initialValue"], 9.0)
        self.assertEqual(table["fields"][-1]["initialBits"], "0x41100000")

    def test_f2_is_recorded_as_a_deferred_native_transition(self):
        f2 = next(
            rule
            for rule in self.report["verifiedResumeRules"]
            if rule.get("instruction") == "F2"
        )
        self.assertEqual(f2["yieldState"], 5)
        self.assertEqual(f2["effectiveStructuralContinuation"], "opcode + 4")
        self.assertIn("two-stage", f2["note"])
        self.assertIn("bit 0", f2["completion"]["deferredGuard"])
        self.assertIn("signed 24-bit", f2["completion"]["operand"])
        self.assertIn("+0x5c", f2["completion"]["nonzeroDisplacement"])

    def test_actor_identity_progress_index_is_exact(self):
        index = self.report["nativeIdentityIndex"]
        self.assertEqual(index["runtimeAddress"], "0xc278d08")
        self.assertEqual(index["fixedIndexCount"], 301)
        self.assertEqual(index["namedIdentityCount"], 277)
        self.assertEqual(index["emptyFixedSlotCount"], 24)
        self.assertEqual(index["dynamicIndexStart"], 301)
        self.assertEqual(index["dynamicIndexCount"], 24)
        self.assertEqual(index["dynamicCursorAddress"], "0xc223e8c")
        self.assertEqual(index["dynamicIdentitiesAddress"], "0xc223e90")
        self.assertEqual(index["dynamicCursorInitialValue"], 23)
        self.assertEqual(index["dynamicIdentityInitialValue"], "0xffffffff")
        self.assertIn("AKIR", index["zeroIndexBehavior"])
        self.assertEqual(index["entries"][0], {
            "index": 0,
            "identity": "AKIR",
        })
        self.assertEqual(index["entries"][30], {
            "index": 30,
            "identity": "HATO",
        })

    def test_dynamic_f9_boundary_remains_explicit(self):
        f9 = next(
            rule
            for rule in self.report["verifiedResumeRules"]
            if rule.get("instruction") == "F9"
        )
        self.assertIn("explicitly dynamic", f9["staticLimit"])


if __name__ == "__main__":
    unittest.main()
