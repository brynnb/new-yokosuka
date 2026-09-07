import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_game_state_byte_control_evidence.py"
SPEC = importlib.util.spec_from_file_location("game_state_byte_control", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractGameStateByteControlEvidenceTest(unittest.TestCase):
    def test_recovers_all_exact_authored_routes(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 332)
        self.assertEqual(inventory["provenCallCount"], 332)
        self.assertEqual(inventory["dialogueRegionCallCount"], 28)
        self.assertEqual(inventory["areaCount"], 105)
        self.assertEqual(inventory["modeCounts"]["42"], 133)
        self.assertEqual(
            inventory["dialogueModeCounts"],
            {
                "14": 3,
                "15": 3,
                "55": 8,
                "56": 8,
                "71": 1,
                "72": 1,
                "73": 1,
                "74": 1,
                "75": 1,
                "76": 1,
            },
        )
        self.assertEqual(
            inventory["resultComparisonCountsByMode"],
            {"44": 15, "56": 18, "58": 3, "72": 3},
        )
        increment = report["operation"]["routes"][0]
        self.assertEqual(increment["incrementMode"], 42)
        self.assertEqual(increment["baseAddress"], "0x0c221440")
        self.assertEqual(increment["specialCodeRegistrations"]["99"], [
            0x02C0, 0x007D, 0x00FD,
        ])

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
