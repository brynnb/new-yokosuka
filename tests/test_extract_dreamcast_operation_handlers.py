import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.extract_dreamcast_operation_handlers import (  # noqa: E402
    operation_ids_from_report,
)


class DreamcastOperationHandlerTests(unittest.TestCase):
    def test_reads_dialogue_code_region_summary(self):
        report = {
            "summary": {
                "operationIds": [
                    {"operationId": 0x6D},
                    {"operationId": 0x1AF},
                    {"operationId": 0x6D},
                ]
            }
        }
        self.assertEqual(
            operation_ids_from_report(report),
            [0x6D, 0x1AF],
        )

    def test_reads_legacy_call_report(self):
        report = {
            "calls": [
                {"operationId": 2},
                {"operationId": 1},
                {"operationId": None},
            ]
        }
        self.assertEqual(operation_ids_from_report(report), [1, 2])


if __name__ == "__main__":
    unittest.main()
