import json
import unittest
from tools.scripting.operations import extract_typed_table_access_evidence as evidence


class TypedTableEvidenceTest(unittest.TestCase):
    def test_original_switch_and_result_initialization_regenerate_evidence(self):
        executable = (evidence.ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes()
        report = evidence.build(executable)
        self.assertEqual(report, json.loads((evidence.ROOT / "tools/evidence/typed-table-access-evidence.json").read_text()))
        self.assertEqual({r["mode"]: r["width"] for r in report["routes"]},
                         {1: 1, 2: 2, 4: 4, 5: 4, 8: 4, 11: 1, 12: 2, 14: 4, 15: 4, 18: 4})
        self.assertEqual(next(r for r in report["routes"] if r["mode"] == 8)["valueKind"], "module-relative-pointer")
        altered = bytearray(executable)
        altered[0x0C1737B4 - evidence.BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            evidence.build(altered)


if __name__ == "__main__": unittest.main()
