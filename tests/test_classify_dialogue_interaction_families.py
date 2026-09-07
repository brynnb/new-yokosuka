#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.classify_dialogue_interaction_families import (  # noqa: E402
    build_report,
    summary_report,
)


def candidate(target, actor="HATO", voice="A001"):
    return {
        "disc": 1,
        "area": "D000",
        "executableTargetIndex": target,
        "regionStartFileOffset": hex(target * 4),
        "actorTags": [actor] if actor else [],
        "voices": [{
            "voiceId": voice,
            "records": [{"recordIndex": 0}],
        }],
        "launchPaths": [{
            "rootKind": "operation-0x0002-child-coroutine",
            "directCalls": [],
        }],
        "triggerRoutes": [],
        "runtimeReady": False,
        "unresolved": ["no-branch-exclusive-trigger-route"],
    }


def dialogue_function(target, actor="HATO", voice_pointer=123):
    return {
        "id": hex(target * 4),
        "entryBlock": hex(target * 4),
        "dialogueRegion": {
            "executableTargetIndex": target,
        },
        "blocks": [{
            "id": hex(target * 4),
            "endFileOffsetExclusive": hex(target * 4 + 4),
            "actions": [{
                "kind": "engineOperation",
                "callFileOffset": hex(target * 4),
                "operationId": 109,
                "operationHex": "0x006d",
                "arguments": [{
                    "kind": "static-pointer",
                    "value": voice_pointer,
                }],
                "adapterStatus": "proven",
                "semanticId": "dialogue-start",
            }, {
                "kind": "engineOperation",
                "callFileOffset": hex(target * 4 + 2),
                "operationId": 431,
                "operationHex": "0x01af",
                "arguments": [{
                    "kind": "constant",
                    "value": int.from_bytes(
                        actor.encode("ascii"),
                        "little",
                    ),
                    "ascii": actor,
                }],
                "adapterStatus": "proven",
                "semanticId": "game-state-access",
            }],
            "sceneFieldComparisons": [],
            "terminator": None,
            "successors": [],
        }],
        "unresolvedControlTransfers": [],
    }


class DialogueInteractionFamiliesTest(unittest.TestCase):
    def test_groups_structures_despite_voice_and_actor_identity(self):
        candidates = {
            "candidates": [
                candidate(10, "HATO", "A001"),
                candidate(11, "NOZO", "B002"),
            ],
        }
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "D000",
                "functions": [
                    dialogue_function(10, "HATO", 123),
                    dialogue_function(11, "NOZO", 456),
                ],
            }],
        }
        report = build_report(candidates, event_ir)
        self.assertEqual(report["summary"]["familyCount"], 1)
        self.assertEqual(
            report["summary"]["candidateInRecurringFamilyCount"],
            2,
        )
        self.assertEqual(report["families"][0]["memberCount"], 2)

    def test_keeps_constant_operation_modes_distinct(self):
        candidates = {"candidates": [candidate(10), candidate(11)]}
        first = dialogue_function(10)
        second = dialogue_function(11)
        second["blocks"][0]["actions"][1]["arguments"].insert(0, {
            "kind": "constant",
            "value": 65,
        })
        event_ir = {
            "maps": [{
                "disc": 1,
                "area": "D000",
                "functions": [first, second],
            }],
        }
        report = build_report(candidates, event_ir)
        self.assertEqual(report["summary"]["familyCount"], 2)

    def test_missing_ir_function_remains_explicit(self):
        report = build_report(
            {"candidates": [candidate(10)]},
            {"maps": []},
        )
        self.assertEqual(report["summary"]["missingFunctionCount"], 1)
        self.assertIsNone(report["members"][0]["familyId"])
        self.assertIn(
            "dialogue-function-absent-from-scripted-event-ir",
            report["members"][0]["unresolved"],
        )

    def test_summary_omits_member_details(self):
        report = {
            "evidenceBoundary": ["boundary"],
            "summary": {"candidateCount": 1},
            "families": [{"familyId": "family"}],
            "members": [{"voiceId": "private"}],
        }
        summary = summary_report(report)
        self.assertNotIn("private", str(summary))


if __name__ == "__main__":
    unittest.main()
