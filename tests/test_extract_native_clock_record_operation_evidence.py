import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_native_clock_record_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location("native_clock_record", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractNativeClockRecordOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_exact_destination(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 671)
        self.assertEqual(inventory["byOperation"]["0x0058"], {
            "provenCallCount": 103,
            "dialogueRegionCallCount": 10,
            "addressKindCounts": {
                "frame-address": 76,
                "scene-address": 27,
            },
            "dialogueAddressKindCounts": {
                "frame-address": 5,
                "scene-address": 5,
            },
        })
        self.assertEqual(inventory["byOperation"]["0x0059"], {
            "provenCallCount": 568,
            "dialogueRegionCallCount": 47,
            "addressKindCounts": {
                "frame-address": 507,
                "scene-address": 61,
            },
            "dialogueAddressKindCounts": {
                "frame-address": 43,
                "scene-address": 4,
            },
        })

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
