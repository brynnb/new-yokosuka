import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "actor_momt_mask_operation_evidence",
    ROOT / "tools/scripting/operations/extract_actor_momt_mask_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ActorMomtMaskOperationEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
        )

    def test_modes_are_exact_mask_set_and_clear(self):
        operation = self.report["operation"]
        self.assertEqual(operation["actorArgument"], 0)
        self.assertEqual(operation["modeArgument"], 1)
        self.assertEqual(operation["maskArgument"], 2)
        self.assertEqual(operation["modes"]["1"]["operation"], "bitwise OR")
        self.assertEqual(
            operation["modes"]["2"]["operation"],
            "bitwise AND NOT",
        )


if __name__ == "__main__":
    unittest.main()
