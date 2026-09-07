import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_secondary_motion_control_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("secondary_motion_control", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractSecondaryMotionControlOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_float_mode_and_flag_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(
            [entry["authoredCallCount"] for entry in report["operations"]],
            [42, 15, 266],
        )
        self.assertEqual(report["op02Proof"]["actorMode"]["mode"], 4)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
