import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_hndl_hndr_component_operation_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "hndl_hndr_component_operation",
    PATH,
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractHndlHndrComponentOperationEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_and_dialogue_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        inventory = report["allDiscInventory"]
        self.assertEqual(inventory["provenCallCount"], 566)
        self.assertEqual(inventory["dialogueRegionCallCount"], 40)
        self.assertEqual(inventory["unresolvedCallCount"], 0)
        self.assertEqual(inventory["maskCounts"], {
            "0x00000015": 563,
            "0x0000002a": 3,
        })

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
