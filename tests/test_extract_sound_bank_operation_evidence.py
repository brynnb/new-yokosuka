import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_sound_bank_operation_evidence",
    ROOT / "tools/scripting/operations/extract_sound_bank_operation_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SoundBankOperationEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_MAPINFO.read_bytes(),
        )

    def test_exact_handler_owns_eight_sound_bank_slots(self):
        operation = self.report["operation"]
        self.assertEqual(operation["operationHex"], "0x00f3")
        self.assertEqual(operation["argumentCount"], 8)
        self.assertEqual(operation["handlerTargetAddress"], "0x0c17a160")
        self.assertEqual(
            self.report["helpers"]["freeSentinel"],
            "FREE",
        )

    def test_selector_18_request_comes_from_exact_mapinfo_strings(self):
        self.assertEqual(
            self.report["d000Selector18"]["request"],
            [
                None,
                None,
                "bgm013.snd",
                "FREE",
                "a1_senfk.snd",
                "battle_1.snd",
                "FREE",
                "FREE",
            ],
        )


if __name__ == "__main__":
    unittest.main()
