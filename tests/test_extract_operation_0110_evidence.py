import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "extract_operation_0110_evidence",
    ROOT / "tools/scripting/operations/extract_operation_0110_evidence.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class Operation0110EvidenceTest(unittest.TestCase):
    def test_exact_executable_and_full_corpus(self):
        report = MODULE.build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads(
                (ROOT / ".disc-work/dialogue/native-event-ir.json").read_text()
            ),
        )
        operation = report["operation"]
        inventory = report["allDiscInventory"]
        self.assertEqual(operation["recordTag"], "FIGP")
        self.assertEqual(operation["fieldOffsets"], ["0x11", "0x12"])
        self.assertEqual(inventory["authoredCallCount"], 64)
        self.assertEqual(inventory["areaCount"], 20)
        self.assertEqual(inventory["dialogueRegionCallCount"], 3)
        self.assertEqual(
            inventory["op00CallFileOffsets"],
            ["0x604", "0x676", "0x1592c"],
        )


if __name__ == "__main__":
    unittest.main()
