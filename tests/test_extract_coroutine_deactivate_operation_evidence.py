#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.operations.extract_coroutine_deactivate_operation_evidence import (  # noqa: E402
    operation_calls,
)


class CoroutineDeactivateOperationEvidenceTest(unittest.TestCase):
    def test_collects_only_operation_three_and_preserves_null_target(self):
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "TEST",
                "functions": [{
                    "id": "0x100",
                    "dialogueRegion": {"voiceIds": ["TEST"]},
                    "blocks": [{
                        "actions": [
                            {
                                "kind": "engineOperation",
                                "operationId": 3,
                                "callFileOffset": "0x104",
                                "arguments": [{
                                    "kind": "constant",
                                    "value": 0,
                                }],
                            },
                            {
                                "kind": "engineOperation",
                                "operationId": 4,
                                "callFileOffset": "0x108",
                                "arguments": [],
                            },
                        ],
                    }],
                }],
            }],
        }
        self.assertEqual(operation_calls(event_ir), [{
            "disc": 1,
            "area": "TEST",
            "functionFileOffset": "0x100",
            "callFileOffset": "0x104",
            "dialogueRegion": True,
            "targetArgument": {"kind": "constant", "value": 0},
        }])


if __name__ == "__main__":
    unittest.main()
