import importlib.util
import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "native_dialogue_progress_index_data",
    ROOT / "tools/scripting/generate_native_dialogue_progress_index_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeDialogueProgressIndexDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        evidence = json.loads(MODULE.DEFAULT_EVIDENCE.read_text())
        cls.data = MODULE.build_runtime_data(evidence)

    def test_runtime_data_retains_exact_provenance(self):
        provenance = self.data["generatedFrom"]
        self.assertEqual(
            provenance["schema"],
            "new-yokosuka-dialogue-progress-state-v1",
        )
        self.assertEqual(len(provenance["executableSha256"]), 64)
        self.assertEqual(provenance["runtimeAddress"], "0xc278d08")

    def test_runtime_data_preserves_fixed_and_dynamic_indices(self):
        self.assertEqual(len(self.data["fixedIdentities"]), 301)
        self.assertEqual(len(self.data["indexByIdentity"]), 277)
        self.assertEqual(self.data["indexByIdentity"]["AKIR"], 0)
        self.assertEqual(self.data["indexByIdentity"]["HATO"], 30)
        self.assertEqual(self.data["dynamicIndexStart"], 301)
        self.assertEqual(self.data["dynamicIndexCount"], 24)


if __name__ == "__main__":
    unittest.main()
