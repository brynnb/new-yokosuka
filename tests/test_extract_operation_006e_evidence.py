import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_006e_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_006e", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation006eEvidenceTest(unittest.TestCase):
    def test_recovers_all_authored_routes_and_fixed_storage(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c156bc4")
        self.assertEqual(report["allDiscInventory"]["authoredCallCount"], 494)
        self.assertEqual(report["allDiscInventory"]["areaCount"], 44)
        self.assertEqual(
            report["allDiscInventory"]["modeCounts"],
            {"0": 119, "1": 99, "2": 96, "5": 84, "6": 96},
        )
        self.assertEqual(
            report["operation"]["exchangeRoutes"]["1"]["storageAddresses"],
            ["0x0c29cfc0", "0x0c29cfc8"],
        )
        self.assertEqual(
            report["operation"]["inertRoutes"]["5"]["dispatch"],
            "unmatched-selector-default",
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
