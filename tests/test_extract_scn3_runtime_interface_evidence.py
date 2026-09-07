#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_scn3_runtime_interface_evidence import (  # noqa: E402
    browser_runtime_coverage,
    runtime_call_inventory,
    scheduler_selector_nineteen_inventory,
    scheduler_selector_zero_inventory,
)


class Scn3RuntimeInterfaceEvidenceTest(unittest.TestCase):
    def test_counts_exact_slots_and_continuation_pairs(self):
        def call(offset, slot):
            return {
                "callFileOffset": hex(offset),
                "targetSource": {
                    "kind": "base-register-slot",
                    "baseRegister": "r8",
                    "byteOffset": slot,
                },
            }

        control_flow = {
            "maps": [{
                "scriptedEventFunctions": [{
                    "dialogueRegion": {"executableTargetIndex": 1},
                    "secondaryNativeOperations": [{
                        "callFileOffset": "0x80",
                    }],
                    "indirectCalls": [
                        call(0x100, 0x1C),
                        call(0x106, 0x3C),
                        call(0x200, 0x2C),
                        call(0x20C, 0x3C),
                        call(0x300, 0x14),
                    ],
                }],
            }],
        }
        slots, pairs, dialogue_calls = runtime_call_inventory(control_flow)
        self.assertEqual(dict(slots), {
            0x1C: 1,
            0x3C: 2,
            0x2C: 1,
            0x14: 1,
            0x30: 1,
        })
        self.assertEqual(dict(pairs), {
            (0x1C, 0x3C): 1,
            (0x2C, 0x3C): 1,
        })
        self.assertEqual(dialogue_calls, 6)

    def test_counts_exact_selector_zero_scheduler_argument_sources(self):
        def call(argument):
            return {
                "callFileOffset": "0x100",
                "targetSource": {
                    "kind": "base-register-slot",
                    "baseRegister": "r8",
                    "byteOffset": 0x2C,
                },
                "runtimeDispatch": {
                    "selector": 0,
                    "argumentCount": 1,
                    "arguments": [argument],
                },
                "resultBitTest": {"mask": 0x00010000},
            }

        control_flow = {"maps": [{"scriptedEventFunctions": [{
            "indirectCalls": [
                call({"kind": "constant", "value": 1}),
                call({"kind": "frame-field", "offset": 12}),
                call({"kind": "frame-field", "offset": 16}),
                call({"kind": "frame-field", "offset": 12}),
            ],
        }]}]}
        kinds, offsets = scheduler_selector_zero_inventory(control_flow)
        self.assertEqual(kinds, {"constant": 1, "frame-field": 3})
        self.assertEqual(offsets, {12: 2, 16: 1})

    def test_distinguishes_native_known_calls_from_browser_semantics(self):
        event_ir = {"maps": [{"functions": [{"blocks": [{"actions": [{
            "kind": "runtimeInterfaceCall",
            "runtimeCallKind": "signed-integer-division",
            "behaviorStatus": "proven",
            "semanticId": "native-signed-integer-division",
        }, {
            "kind": "runtimeInterfaceCall",
            "runtimeCallKind": "resumable-scheduler-dispatch",
            "behaviorStatus": "handler-specific",
        }]}]}]}]}
        proven, unresolved = browser_runtime_coverage(event_ir)
        self.assertEqual(proven, {"native-signed-integer-division": 1})
        self.assertEqual(unresolved, {"resumable-scheduler-dispatch": 1})

    def test_counts_exact_selector_nineteen_readiness_calls(self):
        call = {
            "targetSource": {
                "kind": "base-register-slot",
                "baseRegister": "r8",
                "byteOffset": 0x2C,
            },
            "runtimeDispatch": {
                "selector": 19,
                "argumentCount": 0,
                "arguments": [],
            },
            "resultBitTest": {"mask": 0x00010000},
        }
        control_flow = {"maps": [{
            "disc": 1,
            "area": "TEST",
            "scriptedEventFunctions": [{
                "dialogueRegion": {"executableTargetIndex": 1},
                "indirectCalls": [call],
            }],
        }]}
        self.assertEqual(
            scheduler_selector_nineteen_inventory(control_flow),
            (1, 1, 1),
        )


if __name__ == "__main__":
    unittest.main()
