import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_0170_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_0170", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation0170EvidenceTest(unittest.TestCase):
    def report(self):
        return MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_PROGRAM_PACK.read_text(encoding="utf-8")),
        )

    def test_recovers_exact_map_preparation_pair(self):
        operation = self.report()["operation"]
        self.assertEqual(operation["slotCount"], 32)
        self.assertEqual(operation["mapIdentity"]["base"], "MAP.MT5")
        self.assertEqual(
            operation["d000Selector18"]["invalidateArguments"],
            [-1, 0],
        )
        self.assertEqual(
            operation["d000Selector18"]["rebuildArguments"],
            [-1, 1],
        )
        self.assertEqual(
            [mode["mode"] for mode in operation["provenModes"]],
            [0, 1],
        )
        self.assertTrue(operation["babylonAdapter"]["transactional"])

    def test_rejects_modified_handler(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0x0C164BE6 - MODULE.RUNTIME_BASE] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ.BIN"):
            MODULE.build_report(
                bytes(executable),
                json.loads(
                    MODULE.DEFAULT_PROGRAM_PACK.read_text(encoding="utf-8")
                ),
            )


if __name__ == "__main__":
    unittest.main()
