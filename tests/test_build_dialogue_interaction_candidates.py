#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.build_dialogue_interaction_candidates import (  # noqa: E402
    build_report,
    summary_report,
)


class DialogueInteractionCandidatesTest(unittest.TestCase):
    def test_requires_exact_trigger_route_for_runtime_ready_status(self):
        inventory = {
            "archives": [{
                "disc": 1,
                "archive": "FREE01.AFS",
                "subtitles": [{
                    "member": "F1030.SRF",
                    "records": [{
                        "index": 9,
                        "voiceMember": "F1030B001.str",
                        "speakerId": "HATO",
                        "displayText": "Line",
                        "timingSha256": "hash",
                    }],
                }],
            }],
        }
        regions = {
            "regions": [{
                "disc": 1,
                "area": "D000",
                "executableTargetIndex": 629,
                "regionStartFileOffset": "0x7fa98",
                "actorTags": ["HATO"],
                "voiceIds": ["F1030B001"],
            }],
        }
        graph = {
            "maps": [{
                "disc": 1,
                "area": "D000",
                "dialogue": [{
                    "targetIndex": 629,
                    "launchPaths": [{"rootKind": "test"}],
                    "unresolvedDynamicRoots": [],
                }],
            }],
        }
        dependencies = {
            "maps": [{
                "disc": 1,
                "area": "D000",
                "dependencies": [{
                    "functionFileOffset": "0x7abf4",
                    "comparison": {"fieldOffset": "0x84"},
                    "whenComparisonTrue": {
                        "dialogueDescendants": [{
                            "executableTargetIndex": 629,
                        }],
                    },
                    "whenComparisonFalse": {
                        "dialogueDescendants": [],
                    },
                }],
            }],
        }
        report = build_report(
            inventory,
            regions,
            graph,
            dependencies,
        )
        self.assertEqual(report["summary"]["runtimeReadyCandidateCount"], 1)
        self.assertEqual(report["candidates"][0]["unresolved"], [])

        dependencies["maps"][0]["dependencies"] = []
        report = build_report(
            inventory,
            regions,
            graph,
            dependencies,
        )
        self.assertEqual(report["summary"]["runtimeReadyCandidateCount"], 0)
        self.assertIn(
            "no-branch-exclusive-trigger-route",
            report["candidates"][0]["unresolved"],
        )

    def test_summary_omits_dialogue_text(self):
        report = {
            "evidenceBoundary": ["boundary"],
            "summary": {"candidateCount": 1},
            "candidates": [{"voices": [{"displayText": "private"}]}],
        }
        summary = summary_report(report)
        self.assertNotIn("private", str(summary))
        self.assertEqual(summary["summary"]["candidateCount"], 1)


if __name__ == "__main__":
    unittest.main()
