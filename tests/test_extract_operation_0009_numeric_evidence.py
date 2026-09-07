#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_operation_0009_numeric_evidence import (  # noqa: E402
    numeric_mode_calls,
)


class Operation0009NumericEvidenceTest(unittest.TestCase):
    def test_collects_only_proven_constant_modes(self):
        actions = [
            {
                "kind": "engineOperation",
                "operationId": 9,
                "callFileOffset": "0x104",
                "arguments": [
                    {"kind": "constant", "value": 12},
                    {"kind": "constant", "value": 0x41100000},
                ],
            },
            {
                "kind": "engineOperation",
                "operationId": 9,
                "callFileOffset": "0x108",
                "arguments": [{"kind": "constant", "value": 17}],
            },
        ]
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "functions": [{
                    "id": "0x100",
                    "dialogueRegion": None,
                    "blocks": [{"actions": actions}],
                }],
            }],
        }
        self.assertEqual(numeric_mode_calls(event_ir), [{
            "disc": 1,
            "area": "TEST",
            "functionFileOffset": "0x100",
            "callFileOffset": "0x104",
            "dialogueRegion": False,
            "mode": 12,
            "inputArgument": {
                "kind": "constant",
                "value": 0x41100000,
            },
        }])


if __name__ == "__main__":
    unittest.main()
