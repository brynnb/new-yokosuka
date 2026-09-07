#!/usr/bin/env python3
"""Join native dialogue evidence into explicit interaction candidates.

The detailed local report is a research queue, not a playable catalog.  It
keeps every dialogue region, exact subtitle/voice provenance, actor tags,
launch paths, and proven branch dependencies together while enumerating the
missing boundaries that prevent runtime use.  Only candidates with a proven
trigger route are marked runtime-ready; actor or speaker proximity is never
used as a substitute.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INVENTORY = PROJECT_ROOT / ".disc-work/dialogue/inventory.json"
DEFAULT_REGIONS = PROJECT_ROOT / ".disc-work/dialogue/code-regions.json"
DEFAULT_GRAPH = PROJECT_ROOT / ".disc-work/dialogue/call-graph.json"
DEFAULT_DEPENDENCIES = (
    PROJECT_ROOT / "tools/evidence/dialogue-control-dependencies.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/interaction-candidates.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-interaction-candidates.json"
)


def voice_record_index(
    inventory: dict[str, Any],
) -> dict[tuple[int, str], list[dict[str, Any]]]:
    result: dict[tuple[int, str], list[dict[str, Any]]] = {}
    for archive in inventory["archives"]:
        for subtitle in archive["subtitles"]:
            for record in subtitle["records"]:
                voice_member = record.get("voiceMember")
                if not voice_member:
                    continue
                voice_id = voice_member.rsplit(".", 1)[0]
                result.setdefault((archive["disc"], voice_id), []).append({
                    "archive": archive["archive"],
                    "subtitleMember": subtitle["member"],
                    "recordIndex": record["index"],
                    "speakerId": record["speakerId"],
                    "displayText": record.get("displayText"),
                    "timingSha256": record["timingSha256"],
                })
    return result


def graph_index(
    graph: dict[str, Any],
) -> dict[tuple[int, str, int], dict[str, Any]]:
    return {
        (item["disc"], item["area"], dialogue["targetIndex"]): dialogue
        for item in graph["maps"]
        for dialogue in item.get("dialogue", [])
    }


def dependency_index(
    dependencies: dict[str, Any],
) -> dict[tuple[int, str, int], list[dict[str, Any]]]:
    result: dict[tuple[int, str, int], list[dict[str, Any]]] = {}
    for item in dependencies["maps"]:
        for dependency in item["dependencies"]:
            for truth_key in ("whenComparisonTrue", "whenComparisonFalse"):
                for descendant in dependency[truth_key]["dialogueDescendants"]:
                    key = (
                        item["disc"],
                        item["area"],
                        descendant["executableTargetIndex"],
                    )
                    result.setdefault(key, []).append({
                        "predicateOutcome": (
                            truth_key == "whenComparisonTrue"
                        ),
                        "functionFileOffset": (
                            dependency["functionFileOffset"]
                        ),
                        "comparison": dependency["comparison"],
                    })
    return result


def build_report(
    inventory: dict[str, Any],
    regions: dict[str, Any],
    graph: dict[str, Any],
    dependencies: dict[str, Any],
) -> dict[str, Any]:
    records = voice_record_index(inventory)
    graph_by_target = graph_index(graph)
    dependencies_by_target = dependency_index(dependencies)
    candidates = []
    issue_counts: Counter[str] = Counter()
    for region in regions["regions"]:
        key = (
            region["disc"],
            region["area"],
            region["executableTargetIndex"],
        )
        graph_entry = graph_by_target.get(key)
        routes = dependencies_by_target.get(key, [])
        voices = []
        for voice_id in region["voiceIds"]:
            matches = records.get((region["disc"], voice_id), [])
            voices.append({
                "voiceId": voice_id,
                "records": matches,
            })

        issues = []
        if not region["actorTags"]:
            issues.append("no-exact-actor-tag")
        elif len(region["actorTags"]) > 1:
            issues.append("multiple-exact-actor-tags")
        if any(not voice["records"] for voice in voices):
            issues.append("missing-subtitle-provenance")
        if any(len(voice["records"]) > 1 for voice in voices):
            issues.append("ambiguous-subtitle-provenance")
        if graph_entry is None or not graph_entry["launchPaths"]:
            issues.append("no-recovered-launch-path")
        if graph_entry and graph_entry["unresolvedDynamicRoots"]:
            issues.append("unresolved-dynamic-scheduler-root")
        if not routes:
            issues.append("no-branch-exclusive-trigger-route")
        for issue in set(issues):
            issue_counts[issue] += 1

        runtime_ready = (
            not issues
            and bool(routes)
            and len(region["actorTags"]) == 1
        )
        candidates.append({
            "disc": region["disc"],
            "area": region["area"],
            "executableTargetIndex": region["executableTargetIndex"],
            "regionStartFileOffset": region["regionStartFileOffset"],
            "actorTags": region["actorTags"],
            "voices": voices,
            "launchPaths": graph_entry["launchPaths"] if graph_entry else [],
            "unresolvedDynamicRoots": (
                graph_entry["unresolvedDynamicRoots"]
                if graph_entry
                else []
            ),
            "triggerRoutes": routes,
            "runtimeReady": runtime_ready,
            "unresolved": issues,
        })

    summary = {
        "candidateCount": len(candidates),
        "candidateWithActorTagCount": sum(
            bool(item["actorTags"])
            for item in candidates
        ),
        "candidateWithSingleActorTagCount": sum(
            len(item["actorTags"]) == 1
            for item in candidates
        ),
        "candidateWithCompleteSubtitleProvenanceCount": sum(
            all(len(voice["records"]) == 1 for voice in item["voices"])
            for item in candidates
        ),
        "candidateWithRecoveredLaunchPathCount": sum(
            bool(item["launchPaths"])
            for item in candidates
        ),
        "candidateWithBranchExclusiveTriggerCount": sum(
            bool(item["triggerRoutes"])
            for item in candidates
        ),
        "runtimeReadyCandidateCount": sum(
            item["runtimeReady"]
            for item in candidates
        ),
        "unresolvedIssueCounts": dict(sorted(issue_counts.items())),
    }
    return {
        "schema": "new-yokosuka-dialogue-interaction-candidates-v1",
        "evidenceBoundary": [
            "Candidates are native executable dialogue regions, not inferred click interactions.",
            "Actor tags, subtitle records, launch paths, and trigger routes are retained only from exact source relationships.",
            "A missing trigger route is explicit and prevents runtime-ready status; names, locations, and proximity never fill that gap.",
            "The detailed report includes localized text and remains in ignored local research storage.",
        ],
        "summary": summary,
        "candidates": candidates,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "new-yokosuka-dialogue-interaction-candidate-summary-v1",
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "fullReport": ".disc-work/dialogue/interaction-candidates.json",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--regions", type=Path, default=DEFAULT_REGIONS)
    parser.add_argument("--graph", type=Path, default=DEFAULT_GRAPH)
    parser.add_argument(
        "--dependencies",
        type=Path,
        default=DEFAULT_DEPENDENCIES,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-output", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()
    report = build_report(
        json.loads(args.inventory.read_text()),
        json.loads(args.regions.read_text()),
        json.loads(args.graph.read_text()),
        json.loads(args.dependencies.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary_report(report), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: {report['summary']['candidateCount']} "
        f"candidates, {report['summary']['runtimeReadyCandidateCount']} "
        "runtime-ready"
    )


if __name__ == "__main__":
    main()
