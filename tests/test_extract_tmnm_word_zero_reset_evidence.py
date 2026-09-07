import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_tmnm_word_zero_reset_evidence.py"
SPEC = importlib.util.spec_from_file_location("tmnm_reset_evidence", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractTmnmWordZeroResetEvidenceTest(unittest.TestCase):
    def test_recovers_every_authored_call(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text()),
        )
        self.assertEqual(report["allDiscInventory"], {
            "authoredCallCount": 15,
            "provenCallCount": 15,
            "mapCount": 7,
            "dialogueRegionCallCount": 5,
        })
        self.assertEqual(report["operation"]["fieldOffset"], "+0x00")

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
