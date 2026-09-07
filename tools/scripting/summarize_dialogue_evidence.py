#!/usr/bin/env python3
"""Write a source-control-safe summary of local dialogue research reports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DIALOGUE_ROOT = PROJECT_ROOT / ".disc-work" / "dialogue"
DEFAULT_OUTPUT = PROJECT_ROOT / "tools" / "evidence" / "dialogue-coverage.json"


def read_report(path: Path, expected_schema: str) -> dict[str, Any]:
    report = json.loads(path.read_text())
    if report.get("schema") != expected_schema:
        raise ValueError(
            f"{path} has schema {report.get('schema')!r}; "
            f"expected {expected_schema!r}"
        )
    return report


def summarize(
    inventory: dict[str, Any],
    references: dict[str, Any],
    operations: dict[str, Any],
    code_regions: dict[str, Any] | None = None,
    handlers: dict[str, Any] | None = None,
    call_graph: dict[str, Any] | None = None,
    spatial_interactions: dict[str, Any] | None = None,
    control_flow: dict[str, Any] | None = None,
    control_dependencies: dict[str, Any] | None = None,
    interaction_candidates: dict[str, Any] | None = None,
    native_event_ir: dict[str, Any] | None = None,
    scripted_event_control_flow: dict[str, Any] | None = None,
) -> dict[str, Any]:
    inventory_summary = inventory["summary"]
    reference_summary = references["summary"]
    operation_summary = operations["summary"]
    subtitle_archives = inventory_summary["subtitleArchiveCount"]
    aligned_archives = inventory_summary["exactVoiceAlignedArchiveCount"]
    report = {
        "schema": "new-yokosuka-dialogue-coverage-v1",
        "evidenceBoundary": [
            "This file contains aggregate counts only; the full inventories remain in ignored local research storage.",
            "A script reference is an exact MAPINFO static-string match to a native voice member ID.",
            "A dialogue start is an exact operation-0x006d dispatch whose first argument resolves to a native voice member ID.",
            "These counts do not prove interaction ownership, story predicates, facing, camera, or authored animation.",
        ],
        "inventory": {
            key: inventory_summary[key]
            for key in (
                "archiveCount",
                "subtitleArchiveCount",
                "exactVoiceAlignedArchiveCount",
                "voiceMemberCount",
                "subtitleMemberCount",
                "subtitleRecordCount",
                "speakerIdCount",
            )
        },
        "alignment": {
            "subtitleArchiveCoverage": (
                aligned_archives / subtitle_archives
                if subtitle_archives
                else 0
            ),
            "unalignedSubtitleArchiveCount": (
                subtitle_archives - aligned_archives
            ),
        },
        "scriptReferences": {
            "referenceCount": reference_summary["referenceCount"],
            "uniqueVoiceIdCount": reference_summary["uniqueVoiceIdCount"],
            "areaCount": reference_summary["areaCount"],
            "areas": reference_summary["areas"],
        },
        "dialogueOperations": {
            "invocationCount": operation_summary["invocationCount"],
            "uniqueVoiceIdCount": operation_summary["uniqueVoiceIdCount"],
            "followedByGlobalDialogueActiveCheckCount": (
                operation_summary[
                    "followedByGlobalDialogueActiveCheckCount"
                ]
            ),
            "areaCount": operation_summary["areaCount"],
            "mapinfoWithExecutableTargetTableCount": operation_summary.get(
                "mapinfoWithExecutableTargetTableCount", 0
            ),
            "executableTargetEntryCount": operation_summary.get(
                "executableTargetEntryCount", 0
            ),
            "invocationWithExecutableTargetContextCount": (
                operation_summary.get(
                    "invocationWithExecutableTargetContextCount", 0
                )
            ),
            "areas": operation_summary["areas"],
        },
    }
    if code_regions is not None:
        region_summary = code_regions["summary"]
        report["dialogueCodeRegions"] = {
            key: region_summary[key]
            for key in (
                "regionCount",
                "voiceInvocationCount",
                "uniqueVoiceIdCount",
                "operationCount",
                "uniqueOperationIdCount",
                "regionWithActorTagCount",
                "regionWithCharacterStateAccessCount",
                "characterStateAccessCount",
                "voiceRecordLinkCount",
                "semanticizedOperationCount",
            )
        }
        report["dialogueCodeRegions"]["operationIds"] = (
            region_summary["operationIds"]
        )
    if handlers is not None:
        report["operationHandlers"] = {
            "status": handlers["status"],
            "dispatcherAddress": handlers["dispatcherAddress"],
            "tableAddress": handlers["tableAddress"],
            "resolvedHandlerCount": handlers["operationCount"],
            "failureCount": len(handlers["failures"]),
        }
    if call_graph is not None:
        graph_summary = call_graph["summary"]
        report["nativeCallGraph"] = {
            key: graph_summary[key]
            for key in (
                "mapinfoCount",
                "skippedMapinfoCount",
                "functionCount",
                "directCallEdgeCount",
                "coroutineLaunchCount",
                "dialogueRegionCount",
                "dialogueRegionWithLaunchPathCount",
                "dialogueRegionWithUnresolvedDynamicRootCount",
            )
            if key in graph_summary
        }
        region_count = graph_summary["dialogueRegionCount"]
        report["nativeCallGraph"]["dialogueLaunchPathCoverage"] = (
            graph_summary["dialogueRegionWithLaunchPathCount"] / region_count
            if region_count
            else 0
        )
    if spatial_interactions is not None:
        spatial_summary = spatial_interactions["summary"]
        report["nativeSpatialInteractions"] = {
            key: spatial_summary[key]
            for key in (
                "mapinfoScanned",
                "mapsWithOperation0181",
                "operation0181Calls",
                "modeZeroCallsWithSerializedSource",
                "modeZeroCallsWithoutRecoveredLaunchSource",
                "serializedSpatialRecords",
                "customHalfWidthEntries",
            )
        }
    if control_flow is not None:
        flow_summary = control_flow["summary"]
        report["nativeDialogueControlFlow"] = {
            key: flow_summary[key]
            for key in (
                "mapinfoCount",
                "dialoguePathFunctionCount",
                "basicBlockCount",
                "sceneFieldComparisonCount",
                "nativeOperationCallCount",
                "directCallCount",
                "childCoroutineLaunchCount",
                "dialogueRegionCount",
                "unresolvedControlTransferCount",
            )
        }
    if control_dependencies is not None:
        dependency_summary = control_dependencies["summary"]
        report["nativeDialogueControlDependencies"] = {
            key: dependency_summary[key]
            for key in (
                "mapinfoCount",
                "branchExclusiveDependencyCount",
                "trueDialogueRegionCount",
                "falseDialogueRegionCount",
            )
        }
    if interaction_candidates is not None:
        candidate_summary = interaction_candidates["summary"]
        report["nativeDialogueInteractionCandidates"] = {
            key: candidate_summary[key]
            for key in (
                "candidateCount",
                "candidateWithActorTagCount",
                "candidateWithSingleActorTagCount",
                "candidateWithCompleteSubtitleProvenanceCount",
                "candidateWithRecoveredLaunchPathCount",
                "candidateWithBranchExclusiveTriggerCount",
                "runtimeReadyCandidateCount",
                "unresolvedIssueCounts",
            )
        }
    if native_event_ir is not None:
        event_summary = native_event_ir["summary"]
        report["nativeEventIr"] = {
            key: event_summary[key]
            for key in (
                "mapinfoCount",
                "functionCount",
                "blockCount",
                "actionCount",
                "engineOperationCount",
                "provenEngineOperationCount",
                "unresolvedEngineOperationCount",
                "directCallCount",
                "childCoroutineLaunchCount",
                "dialogueRegionCount",
            )
        }
    if scripted_event_control_flow is not None:
        scripted_summary = scripted_event_control_flow["summary"]
        report["nativeScriptedEventControlFlow"] = {
            key: scripted_summary[key]
            for key in (
                "mapinfoCount",
                "scriptedEventFunctionCount",
                "basicBlockCount",
                "sceneFieldComparisonCount",
                "nativeOperationCallCount",
                "directCallCount",
                "childCoroutineLaunchCount",
                "dialogueRegionCount",
                "unresolvedControlTransferCount",
            )
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dialogue-root",
        type=Path,
        default=DEFAULT_DIALOGUE_ROOT,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    root = args.dialogue_root.expanduser().resolve()
    report = summarize(
        read_report(
            root / "inventory.json",
            "new-yokosuka-dialogue-inventory-v1",
        ),
        read_report(
            root / "script-references.json",
            "new-yokosuka-dialogue-script-references-v1",
        ),
        read_report(
            root / "operations.json",
            "new-yokosuka-dialogue-operations-v1",
        ),
        read_report(
            root / "code-regions.json",
            "new-yokosuka-dialogue-code-regions-v1",
        ),
        read_report(
            root / "code-region-operation-handlers.json",
            "new-yokosuka-dreamcast-operation-handlers-v1",
        ),
        read_report(
            root / "call-graph.json",
            "new-yokosuka-dialogue-call-graph-v2",
        ),
        read_report(
            PROJECT_ROOT
            / "tools/evidence/spatial-interaction-system-inventory.json",
            "new-yokosuka-spatial-interaction-system-inventory-v3",
        ),
        read_report(
            PROJECT_ROOT
            / "tools/evidence/dialogue-control-flow-index.json",
            "new-yokosuka-dialogue-control-flow-summary-v1",
        ),
        read_report(
            PROJECT_ROOT
            / "tools/evidence/dialogue-control-dependencies.json",
            "new-yokosuka-dialogue-control-dependencies-v1",
        ),
        read_report(
            PROJECT_ROOT
            / "tools/evidence/dialogue-interaction-candidates.json",
            "new-yokosuka-dialogue-interaction-candidate-summary-v1",
        ),
        read_report(
            PROJECT_ROOT / "tools/evidence/native-event-ir.json",
            "new-yokosuka-native-event-ir-summary-v1",
        ),
        read_report(
            PROJECT_ROOT
            / "tools/evidence/scripted-event-control-flow-index.json",
            "new-yokosuka-scripted-event-control-flow-summary-v1",
        ),
    )
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
