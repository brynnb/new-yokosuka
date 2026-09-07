#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

from tools.scripting.extract_dialogue_control_dependencies import (  # noqa: E402
    build_report,
    dependencies_for_map,
)


class DialogueControlDependenciesTest(unittest.TestCase):
    def test_diamond_maps_true_branch_to_exact_dialogue_descendant(self):
        item = {
            "disc": 1,
            "area": "TEST",
            "mapinfoSha256": "abc",
            "dialoguePathFunctions": [
                {
                    "fileOffset": "0x100",
                    "basicBlocks": [
                        {
                            "startFileOffset": "0x100",
                            "endFileOffsetExclusive": "0x110",
                            "successors": ["0x120", "0x110"],
                        },
                        {
                            "startFileOffset": "0x110",
                            "endFileOffsetExclusive": "0x120",
                            "successors": ["0x130"],
                        },
                        {
                            "startFileOffset": "0x120",
                            "endFileOffsetExclusive": "0x130",
                            "successors": ["0x130"],
                        },
                        {
                            "startFileOffset": "0x130",
                            "endFileOffsetExclusive": "0x140",
                            "successors": [],
                        },
                    ],
                    "sceneFieldComparisons": [{
                        "fieldOffset": "0x84",
                        "constant": 6,
                        "resolvedBranch": {
                            "comparisonTrueSuccessor": "0x120",
                            "comparisonFalseSuccessor": "0x110",
                        },
                    }],
                    "directCalls": [{
                        "callFileOffset": "0x124",
                        "targetFileOffset": "0x200",
                    }],
                    "childCoroutineLaunches": [],
                    "dialogueRegion": None,
                },
                {
                    "fileOffset": "0x200",
                    "basicBlocks": [],
                    "sceneFieldComparisons": [],
                    "directCalls": [{
                        "callFileOffset": "0x204",
                        "targetFileOffset": "0x300",
                    }],
                    "childCoroutineLaunches": [],
                    "dialogueRegion": None,
                },
                {
                    "fileOffset": "0x300",
                    "basicBlocks": [],
                    "sceneFieldComparisons": [],
                    "directCalls": [],
                    "childCoroutineLaunches": [],
                    "dialogueRegion": {
                        "executableTargetIndex": 7,
                        "voiceIds": ["VOICE"],
                        "actorTags": ["ACTR"],
                    },
                },
            ],
        }
        dependency = dependencies_for_map(item)[0]
        self.assertEqual(
            dependency["whenComparisonTrue"]["exclusiveDirectCalls"][0][
                "targetFileOffset"
            ],
            "0x200",
        )
        self.assertEqual(
            dependency["whenComparisonTrue"]["dialogueDescendants"][0][
                "voiceIds"
            ],
            ["VOICE"],
        )
        self.assertEqual(
            dependency["whenComparisonFalse"]["dialogueDescendants"],
            [],
        )
        self.assertEqual(
            dependency["whenComparisonTrue"][
                "exclusiveChildCoroutineLaunches"
            ],
            [],
        )

    def test_omits_reconverged_calls(self):
        item = {
            "disc": 1,
            "area": "TEST",
            "mapinfoSha256": "abc",
            "dialoguePathFunctions": [{
                "fileOffset": "0x100",
                "basicBlocks": [
                    {
                        "startFileOffset": "0x100",
                        "endFileOffsetExclusive": "0x110",
                        "successors": ["0x120", "0x110"],
                    },
                    {
                        "startFileOffset": "0x110",
                        "endFileOffsetExclusive": "0x120",
                        "successors": ["0x130"],
                    },
                    {
                        "startFileOffset": "0x120",
                        "endFileOffsetExclusive": "0x130",
                        "successors": ["0x130"],
                    },
                    {
                        "startFileOffset": "0x130",
                        "endFileOffsetExclusive": "0x140",
                        "successors": [],
                    },
                ],
                "sceneFieldComparisons": [{
                    "resolvedBranch": {
                        "comparisonTrueSuccessor": "0x120",
                        "comparisonFalseSuccessor": "0x110",
                    },
                }],
                "directCalls": [{
                    "callFileOffset": "0x134",
                    "targetFileOffset": "0x200",
                }],
                "childCoroutineLaunches": [],
                "dialogueRegion": None,
            }],
        }
        self.assertEqual(dependencies_for_map(item), [])

    def test_report_does_not_retain_source_paths(self):
        report = build_report({
            "maps": [{
                "disc": 1,
                "area": "EMPTY",
                "source": "/private/MAPINFO.BIN",
                "mapinfoSha256": "abc",
                "dialoguePathFunctions": [],
            }],
        })
        self.assertNotIn("source", str(report))


if __name__ == "__main__":
    unittest.main()
