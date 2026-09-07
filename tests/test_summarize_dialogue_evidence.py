import sys
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "tools"))

from tools.scripting.summarize_dialogue_evidence import summarize  # noqa: E402


class SummarizeDialogueEvidenceTests(unittest.TestCase):
    def test_retains_aggregate_coverage_without_source_text(self):
        report = summarize(
            {
                "summary": {
                    "archiveCount": 10,
                    "subtitleArchiveCount": 8,
                    "exactVoiceAlignedArchiveCount": 6,
                    "voiceMemberCount": 30,
                    "subtitleMemberCount": 9,
                    "subtitleRecordCount": 32,
                    "speakerIdCount": 4,
                }
            },
            {
                "summary": {
                    "referenceCount": 12,
                    "uniqueVoiceIdCount": 7,
                    "areaCount": 1,
                    "areas": [
                        {
                            "disc": 1,
                            "area": "D000",
                            "referenceCount": 12,
                            "uniqueVoiceIdCount": 7,
                        }
                    ],
                }
            },
            {
                "summary": {
                    "invocationCount": 11,
                    "uniqueVoiceIdCount": 6,
                    "followedByGlobalDialogueActiveCheckCount": 5,
                    "areaCount": 1,
                    "mapinfoWithExecutableTargetTableCount": 1,
                    "executableTargetEntryCount": 10,
                    "invocationWithExecutableTargetContextCount": 11,
                    "areas": [
                        {
                            "disc": 1,
                            "area": "D000",
                            "invocationCount": 11,
                        }
                    ],
                }
            },
            {
                "summary": {
                    "regionCount": 3,
                    "voiceInvocationCount": 11,
                    "uniqueVoiceIdCount": 6,
                    "operationCount": 25,
                    "uniqueOperationIdCount": 4,
                    "regionWithActorTagCount": 2,
                    "regionWithCharacterStateAccessCount": 1,
                    "characterStateAccessCount": 2,
                    "voiceRecordLinkCount": 11,
                    "semanticizedOperationCount": 20,
                    "operationIds": [
                        {
                            "operationId": 109,
                            "operationHex": "0x006d",
                            "count": 11,
                        }
                    ],
                }
            },
            {
                "status": "verified",
                "dispatcherAddress": "0x0c0bb69c",
                "tableAddress": "0x0c29a9e0",
                "operationCount": 4,
                "failures": [],
            },
            {
                "summary": {
                    "mapinfoCount": 2,
                    "skippedMapinfoCount": 0,
                    "functionCount": 100,
                    "directCallEdgeCount": 80,
                    "coroutineLaunchCount": 20,
                    "dialogueRegionCount": 10,
                    "dialogueRegionWithLaunchPathCount": 9,
                    "dialogueRegionWithUnresolvedDynamicRootCount": 1,
                }
            },
            {
                "summary": {
                    "mapinfoScanned": 136,
                    "mapsWithOperation0181": 24,
                    "operation0181Calls": 96,
                    "modeZeroCallsWithSerializedSource": 21,
                    "modeZeroCallsWithoutRecoveredLaunchSource": 3,
                    "serializedSpatialRecords": 178,
                    "customHalfWidthEntries": 88,
                }
            },
            {
                "summary": {
                    "mapinfoCount": 64,
                    "dialoguePathFunctionCount": 2000,
                    "basicBlockCount": 20000,
                    "sceneFieldComparisonCount": 31,
                    "nativeOperationCallCount": 30000,
                    "directCallCount": 4000,
                    "childCoroutineLaunchCount": 500,
                    "dialogueRegionCount": 1285,
                    "unresolvedControlTransferCount": 0,
                }
            },
            {
                "summary": {
                    "mapinfoCount": 1,
                    "branchExclusiveDependencyCount": 2,
                    "trueDialogueRegionCount": 3,
                    "falseDialogueRegionCount": 0,
                }
            },
            {
                "summary": {
                    "candidateCount": 10,
                    "candidateWithActorTagCount": 8,
                    "candidateWithSingleActorTagCount": 6,
                    "candidateWithCompleteSubtitleProvenanceCount": 9,
                    "candidateWithRecoveredLaunchPathCount": 9,
                    "candidateWithBranchExclusiveTriggerCount": 1,
                    "runtimeReadyCandidateCount": 1,
                    "unresolvedIssueCounts": {
                        "no-branch-exclusive-trigger-route": 9,
                    },
                }
            },
            {
                "summary": {
                    "mapinfoCount": 64,
                    "functionCount": 2069,
                    "blockCount": 200000,
                    "actionCount": 67000,
                    "engineOperationCount": 55000,
                    "provenEngineOperationCount": 26000,
                    "unresolvedEngineOperationCount": 29000,
                    "directCallCount": 7900,
                    "childCoroutineLaunchCount": 3200,
                    "dialogueRegionCount": 1285,
                }
            },
            {
                "summary": {
                    "mapinfoCount": 64,
                    "scriptedEventFunctionCount": 13428,
                    "basicBlockCount": 617252,
                    "sceneFieldComparisonCount": 79,
                    "nativeOperationCallCount": 179417,
                    "directCallCount": 30336,
                    "childCoroutineLaunchCount": 6750,
                    "dialogueRegionCount": 1285,
                    "unresolvedControlTransferCount": 0,
                }
            },
        )

        self.assertEqual(report["alignment"]["subtitleArchiveCoverage"], 0.75)
        self.assertEqual(
            report["alignment"]["unalignedSubtitleArchiveCount"], 2
        )
        self.assertEqual(report["dialogueOperations"]["invocationCount"], 11)
        self.assertEqual(
            report["dialogueOperations"]["executableTargetEntryCount"],
            10,
        )
        self.assertEqual(report["dialogueCodeRegions"]["regionCount"], 3)
        self.assertEqual(report["operationHandlers"]["resolvedHandlerCount"], 4)
        self.assertEqual(
            report["nativeCallGraph"]["dialogueLaunchPathCoverage"],
            0.9,
        )
        self.assertEqual(
            report["nativeSpatialInteractions"][
                "serializedSpatialRecords"
            ],
            178,
        )
        self.assertEqual(
            report["nativeDialogueControlFlow"][
                "sceneFieldComparisonCount"
            ],
            31,
        )
        self.assertEqual(
            report["nativeDialogueControlDependencies"][
                "branchExclusiveDependencyCount"
            ],
            2,
        )
        self.assertEqual(
            report["nativeDialogueInteractionCandidates"][
                "runtimeReadyCandidateCount"
            ],
            1,
        )
        self.assertEqual(
            report["nativeEventIr"]["unresolvedEngineOperationCount"],
            29000,
        )
        self.assertEqual(
            report["nativeScriptedEventControlFlow"][
                "scriptedEventFunctionCount"
            ],
            13428,
        )
        self.assertNotIn("sourceText", str(report))


if __name__ == "__main__":
    unittest.main()
