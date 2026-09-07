import importlib.util
import json
import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
SPEC = importlib.util.spec_from_file_location(
    "native_dialogue_actor_runtime_data",
    ROOT / "tools/scripting/generate_native_dialogue_actor_runtime_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class NativeDialogueActorRuntimeDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        selectors = MODULE.extract_selector_data(
            MODULE.DEFAULT_HUMANS.read_bytes(),
            MODULE.scheduled_actor_labels(MODULE.DEFAULT_SCHEDULED_ACTORS),
            json.loads(MODULE.DEFAULT_DIALOGUE_INVENTORY.read_text()),
        )
        progress = json.loads(MODULE.DEFAULT_PROGRESS_EVIDENCE.read_text())
        cls.data = MODULE.build_runtime_data(selectors, progress)

    def test_all_actor_resources_have_an_exact_progress_binding_policy(self):
        self.assertEqual(self.data["resourceCount"], 257)
        self.assertEqual(self.data["fixedProgressBindingCount"], 240)
        self.assertEqual(self.data["dynamicProgressBindingCount"], 17)

    def test_authored_identity_controls_cross_identity_progress(self):
        jono = self.data["resources"]["JONO"]
        mtri = self.data["resources"]["MTRI"]
        yopa = self.data["resources"]["YOPA"]
        self.assertEqual(jono["authoredPersonIdentity"], "YOPA")
        self.assertEqual(mtri["authoredPersonIdentity"], "YOPA")
        self.assertEqual(
            jono["fixedProgressIndex"],
            yopa["fixedProgressIndex"],
        )
        self.assertEqual(
            mtri["fixedProgressIndex"],
            yopa["fixedProgressIndex"],
        )

    def test_absent_authored_identity_uses_dynamic_pool(self):
        yuji = self.data["resources"]["YUJI"]
        self.assertEqual(yuji["progressAllocation"], "dynamic")
        self.assertIsNone(yuji["fixedProgressIndex"])


if __name__ == "__main__":
    unittest.main()
