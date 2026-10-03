import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "tools/scripting/operations/extract_operation_01c7_evidence.py"
SPEC = importlib.util.spec_from_file_location("operation_01c7", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class ExtractOperation01c7EvidenceTest(unittest.TestCase):
    def test_original_save_callers_own_both_sections_and_distinct_load_flags(self):
        evidence = MODULE.extract_save_ownership(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        self.assertEqual(evidence["scope"], "saved-global-state-not-room-local")
        self.assertEqual(evidence["parameters"], {
            "runtimeAddress": "0x0c2203a3", "byteLength": 32, "saveOffset": 0x1B0,
        })
        self.assertEqual(evidence["record"], {
            "runtimeAddress": "0x0c220370", "byteLength": 48, "saveOffset": 0x7A4,
        })
        self.assertNotEqual(evidence["loadStatus"]["consumableByte"],
                            evidence["loadStatus"]["queryByte"])
        self.assertTrue(evidence["coldImage"]["allZero"])

    def test_recovers_every_route_and_all_authored_calls(self):
        report = MODULE.build_report(
            MODULE.DEFAULT_EXECUTABLE.read_bytes(),
            json.loads(MODULE.DEFAULT_EVENT_IR.read_text(encoding="utf-8")),
        )
        self.assertEqual(report["operation"]["operationHex"], "0x01c7")
        self.assertEqual(len(report["operation"]["routes"]), 4)
        self.assertEqual(report["source"]["eventIrScope"], "scripted-events")
        self.assertEqual(report["allDiscInventory"]["provenCallCount"], 845)
        self.assertEqual(
            report["allDiscInventory"]["dialogueRegionCallCount"],
            62,
        )
        self.assertEqual(
            report["allDiscInventory"]["routeCounts"],
            {
                "mode-0": 97,
                "mode-1": 97,
                "mode-2": 319,
                "mode-3-submode-0": 126,
                "mode-3-submode-1": 204,
                "mode-3-submode-2": 1,
                "mode-3-submode-3": 1,
            },
        )

    def test_unknown_routes_and_parameter_offsets_still_stop(self):
        executable = MODULE.DEFAULT_EXECUTABLE.read_bytes()
        for arguments in ([4], [], [3, 2, 30], [3, 0, 32], [3, 1, -1, 0]):
            ir = {"maps": [{"disc": 1, "area": "JOMO", "functions": [{
                "blocks": [{"actions": [{
                    "kind": "engineOperation", "operationId": 0x01C7,
                    "arguments": [{"kind": "constant", "value": value}
                                  for value in arguments],
                }]}],
            }]}]}
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                MODULE.build_report(executable, ir)

    def test_rejects_modified_executable(self):
        executable = bytearray(MODULE.DEFAULT_EXECUTABLE.read_bytes())
        executable[0] ^= 1
        with self.assertRaisesRegex(ValueError, "unexpected 1ST_READ"):
            MODULE.build_report(bytes(executable), {})


if __name__ == "__main__":
    unittest.main()
