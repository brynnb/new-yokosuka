import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0050_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0050", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0050EvidenceTest(unittest.TestCase):
    def report(self):
        return MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            MODULE.DEFAULT_MAPINFO.read_bytes(),
            MODULE.DEFAULT_ARCHIVE.read_bytes(),
            json.loads(MODULE.DEFAULT_PROGRAM_PACK.read_text(encoding="utf-8")),
        )

    def test_recovers_d000_start_poll_and_exact_auth_slot_binding(self):
        report = self.report()
        self.assertEqual(report["operation"]["slotCount"], 70)
        self.assertEqual(report["operation"]["d000Route"]["startArgument"], 0)
        self.assertEqual(report["operation"]["d000Route"]["pollMode"], -1)
        self.assertEqual(
            report["operation"]["d000Route"]["postActivityLatchMode"],
            -7,
        )
        self.assertEqual(
            [
                mode.get("mode")
                for mode in report["operation"]["provenModes"]
                if "mode" in mode
            ],
            [-1, -7, -12, -10, -9, -6],
        )
        no_op = next(
            mode for mode in report["operation"]["provenModes"]
            if mode.get("mode") == -9
        )
        self.assertEqual(no_op["argumentCount"], 3)
        self.assertEqual(no_op["dispatchTarget"], "0x0c155278")
        self.assertEqual(
            [
                slot["archiveMember"]
                for slot in report["resourceBinding"]["slots"]
            ],
            ["SEQDATA1.AUTH", "SEQDATA2.AUTH"],
        )
        frame_runtime = report["operation"]["frameRuntime"]
        self.assertEqual(frame_runtime["advancePerUpdate"], 1)
        self.assertEqual(frame_runtime["framesPerSecond"], 30.0)
        self.assertEqual(
            [entry["name"] for entry in report["operation"]["commandDispatch"]],
            [
                "unknown-0",
                "camera",
                "move",
                "motion",
                "effect",
                "voice",
                "sound",
            ],
        )
        self.assertEqual(
            report["operation"]["motionInterval"]["authoredStartAdjustment"],
            -1,
        )

    def test_rejects_modified_archive(self):
        archive = bytearray(MODULE.DEFAULT_ARCHIVE.read_bytes())
        archive[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected DRAUTH.PKS"):
            MODULE.build_report(
                MODULE.DEFAULT_EXECUTABLE.read_bytes(),
                MODULE.DEFAULT_MAPINFO.read_bytes(),
                bytes(archive),
                json.loads(
                    MODULE.DEFAULT_PROGRAM_PACK.read_text(encoding="utf-8")
                ),
            )


if __name__ == "__main__":
    unittest.main()
