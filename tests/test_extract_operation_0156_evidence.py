import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0156_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0156", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0156EvidenceTest(unittest.TestCase):
    def test_recovers_exact_routes_and_inventory(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["handlerAddress"], "0x0c163656")
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["authoredCallCount"], 16)
        self.assertEqual(inventory["dialogueRegionCallCount"], 0)
        self.assertEqual(inventory["areaCount"], 7)
        self.assertEqual(
            inventory["routeCounts"],
            {
                "0,5,60": 4,
                "0,5,80": 2,
                "0,9,1": 1,
                "1,0,1": 4,
                "1,0,50": 1,
                "1,0,60": 4,
            },
        )

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
