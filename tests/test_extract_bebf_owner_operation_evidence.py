import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from tools.scripting.operations.extract_bebf_owner_operation_evidence import build_report  # noqa: E402


class BebfOwnerOperationEvidenceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = build_report(
            (ROOT / ".disc-work/exact/1ST_READ.BIN").read_bytes(),
            json.loads((
                ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
            ).read_text()),
        )

    def test_exact_bebf_blockers_are_pinned(self):
        self.assertEqual(
            [call["callFileOffset"] for call in self.report["bebfCalls"]],
            ["0x4b7a6", "0x4bf96", "0x4bfa6", "0x4bfba", "0x4c3dc", "0x4c3f4"],
        )

    def test_shared_route_inventory_is_retained(self):
        inventory = self.report["allDiscInventory"]
        self.assertEqual(inventory["0x004b"]["callCount"], 34)
        self.assertEqual(inventory["0x0073"]["callCount"], 47)
        self.assertEqual(inventory["0x006f"]["callCount"], 111)
        self.assertEqual(inventory["0x00fd"]["callCount"], 99)
        self.assertEqual(inventory["0x013c"]["callCount"], 1751)


if __name__ == "__main__":
    unittest.main()
