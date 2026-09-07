import importlib.util
import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "native_dialogue_predicate_data",
    ROOT / "tools/scripting/generate_native_dialogue_predicate_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeDialoguePredicateDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = json.loads(MODULE.DEFAULT_EVIDENCE.read_text())
        cls.data = MODULE.build_runtime_data(evidence)

    def test_runtime_data_retains_exact_provenance(self):
        provenance = self.data["generatedFrom"]
        self.assertEqual(
            provenance["schema"],
            "new-yokosuka-dialogue-predicate-values-v6",
        )
        self.assertEqual(len(provenance["executableSha256"]), 64)
        self.assertEqual(len(provenance["spatialTableSha256"]), 64)
        self.assertEqual(self.data["currency"]["persistentValueSelector"], 2)

    def test_runtime_data_retains_all_exact_spatial_records(self):
        records = self.data["spatialTable"]["records"]
        self.assertEqual(len(records), 13)
        self.assertEqual(records[0]["mapIdentity"], "D000")
        self.assertEqual(records[-1]["mapIdentity"], "MFSY")


if __name__ == "__main__":
    unittest.main()
