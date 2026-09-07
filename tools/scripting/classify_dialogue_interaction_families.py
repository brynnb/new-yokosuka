#!/usr/bin/env python3
"""Classify recovered native dialogue roots by exact structural fingerprints.

This report does not infer gameplay meaning.  It groups dialogue-bearing
functions only when their recovered CFG, operation order, proven semantic
families, and normalized operand shapes agree.  Voice pointers and actor tags
are represented by typed placeholders so authored lines and character names
do not prevent structurally identical native routines from forming a family.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CANDIDATES = (
    PROJECT_ROOT / ".disc-work/dialogue/interaction-candidates.json"
)
DEFAULT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-interaction-families.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-interaction-families.json"
)


def number(value: str) -> int:
    return int(value, 16)


def normalize_argument(
    action: dict[str, Any],
    argument: dict[str, Any],
) -> dict[str, Any]:
    actor_semantics = {
        "actor-lnwk-control",
        "actor-look-point-control",
        "actor-momt-flag-bit-0",
        "actor-motion-request",
        "actor-motion-status-bit-1-query",
        "game-state-access",
    }
    result = {"kind": argument["kind"]}
    if argument["kind"] == "constant":
        result["value"] = argument["value"]
        if (
            action.get("semanticId") in actor_semantics
            and "ascii" in argument
        ):
            result["value"] = "<actor-tag>"
    elif argument["kind"] == "static-pointer":
        if action.get("semanticId") == "dialogue-start":
            result["value"] = "<voice-resource>"
        elif "staticText" in argument:
            result["value"] = "<static-text>"
        else:
            result["value"] = "<static-pointer>"
    else:
        result["value"] = "<runtime>"
    return result


def normalize_action(action: dict[str, Any]) -> dict[str, Any]:
    if action["kind"] == "engineOperation":
        result = {
            "kind": "engineOperation",
            "operationHex": action["operationHex"],
            "adapterStatus": action["adapterStatus"],
            "arguments": [
                normalize_argument(action, argument)
                for argument in action["arguments"]
            ],
        }
        if "semanticId" in action:
            result["semanticId"] = action["semanticId"]
        if "knownOperationFamily" in action:
            result["knownOperationFamily"] = action["knownOperationFamily"]
        if "knownOperationFamilies" in action:
            result["knownOperationFamilies"] = action[
                "knownOperationFamilies"
            ]
        return result
    if action["kind"] == "directCall":
        return {"kind": "directCall"}
    if action["kind"] == "childCoroutineLaunch":
        return {
            "kind": "childCoroutineLaunch",
            "argumentCount": action["argumentCount"],
        }
    if action["kind"] == "indirectCall":
        return {
            "kind": "indirectCall",
            "operands": action["operands"],
        }
    raise ValueError(f"unsupported action kind {action['kind']}")


def normalized_function(function: dict[str, Any]) -> dict[str, Any]:
    block_ids = {
        block["id"]: index
        for index, block in enumerate(function["blocks"])
    }
    return {
        "entryBlock": block_ids.get(function["entryBlock"]),
        "blocks": [
            {
                "actions": [
                    normalize_action(action)
                    for action in block["actions"]
                ],
                "comparisonShapes": [
                    {
                        "fieldOffset": comparison["fieldOffset"],
                        "loadWidth": comparison["loadWidth"],
                        "signedLoad": comparison["signedLoad"],
                        "comparison": comparison["comparison"],
                        "constant": comparison["constant"],
                    }
                    for comparison in block["sceneFieldComparisons"]
                ],
                "terminator": (
                    block["terminator"]["mnemonic"]
                    if block["terminator"]
                    else None
                ),
                "successors": [
                    block_ids[successor]
                    for successor in block["successors"]
                    if successor in block_ids
                ],
                "externalSuccessorCount": sum(
                    successor not in block_ids
                    for successor in block["successors"]
                ),
            }
            for block in function["blocks"]
        ],
        "unresolvedControlTransferCount": len(
            function["unresolvedControlTransfers"]
        ),
    }


def fingerprint(value: dict[str, Any]) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    return hashlib.sha256(encoded).hexdigest()[:16]


def function_index(
    event_ir: dict[str, Any],
) -> dict[tuple[int, str, int], dict[str, Any]]:
    result = {}
    for item in event_ir["maps"]:
        for function in item["functions"]:
            region = function.get("dialogueRegion")
            if region is None:
                continue
            key = (
                item["disc"],
                item["area"],
                region["executableTargetIndex"],
            )
            if key in result:
                raise ValueError(f"duplicate dialogue function {key}")
            result[key] = function
    return result


def candidate_status(candidate: dict[str, Any]) -> dict[str, Any]:
    return {
        "actorTagCount": len(candidate["actorTags"]),
        "voiceCount": len(candidate["voices"]),
        "completeSubtitleProvenance": all(
            len(voice["records"]) == 1
            for voice in candidate["voices"]
        ),
        "launchPathCount": len(candidate["launchPaths"]),
        "launchRootKinds": sorted({
            path["rootKind"]
            for path in candidate["launchPaths"]
        }),
        "launchDirectCallDepths": sorted({
            len(path["directCalls"])
            for path in candidate["launchPaths"]
        }),
        "hasBranchExclusiveTrigger": bool(candidate["triggerRoutes"]),
        "runtimeReady": candidate["runtimeReady"],
    }


def build_report(
    candidates: dict[str, Any],
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    functions = function_index(event_ir)
    members = []
    missing_function_count = 0
    for candidate in candidates["candidates"]:
        key = (
            candidate["disc"],
            candidate["area"],
            candidate["executableTargetIndex"],
        )
        function = functions.get(key)
        if function is None:
            missing_function_count += 1
            members.append({
                "disc": candidate["disc"],
                "area": candidate["area"],
                "executableTargetIndex": candidate[
                    "executableTargetIndex"
                ],
                "regionStartFileOffset": candidate[
                    "regionStartFileOffset"
                ],
                "familyId": None,
                "status": candidate_status(candidate),
                "unresolved": [
                    *candidate["unresolved"],
                    "dialogue-function-absent-from-scripted-event-ir",
                ],
            })
            continue
        normalized = normalized_function(function)
        members.append({
            "disc": candidate["disc"],
            "area": candidate["area"],
            "executableTargetIndex": candidate["executableTargetIndex"],
            "regionStartFileOffset": candidate["regionStartFileOffset"],
            "familyId": fingerprint(normalized),
            "status": candidate_status(candidate),
            "unresolved": candidate["unresolved"],
        })

    grouped: dict[str, list[dict[str, Any]]] = {}
    for member in members:
        if member["familyId"] is None:
            continue
        grouped.setdefault(member["familyId"], []).append(member)

    families = []
    for family_id, family_members in grouped.items():
        representative = min(
            family_members,
            key=lambda item: (
                item["disc"],
                item["area"],
                item["executableTargetIndex"],
            ),
        )
        statuses = [member["status"] for member in family_members]
        families.append({
            "familyId": family_id,
            "memberCount": len(family_members),
            "representative": {
                key: representative[key]
                for key in (
                    "disc",
                    "area",
                    "executableTargetIndex",
                    "regionStartFileOffset",
                )
            },
            "discCounts": dict(sorted(Counter(
                str(member["disc"])
                for member in family_members
            ).items())),
            "areaCount": len({
                member["area"]
                for member in family_members
            }),
            "actorTagCardinalities": dict(sorted(Counter(
                str(status["actorTagCount"])
                for status in statuses
            ).items())),
            "voiceCountCardinalities": dict(sorted(Counter(
                str(status["voiceCount"])
                for status in statuses
            ).items())),
            "completeSubtitleProvenanceCount": sum(
                status["completeSubtitleProvenance"]
                for status in statuses
            ),
            "recoveredLaunchPathCount": sum(
                bool(status["launchPathCount"])
                for status in statuses
            ),
            "branchExclusiveTriggerCount": sum(
                status["hasBranchExclusiveTrigger"]
                for status in statuses
            ),
            "runtimeReadyCount": sum(
                status["runtimeReady"]
                for status in statuses
            ),
        })
    families.sort(
        key=lambda item: (-item["memberCount"], item["familyId"]),
    )

    recurring = [
        family
        for family in families
        if family["memberCount"] > 1
    ]
    exact_single_actor = [
        member
        for member in members
        if member["familyId"] is not None
        and member["status"]["actorTagCount"] == 1
        and member["status"]["completeSubtitleProvenance"]
        and member["status"]["launchPathCount"] > 0
    ]
    return {
        "schema": "new-yokosuka-dialogue-interaction-families-v1",
        "evidenceBoundary": [
            "Families are exact normalized native function structures, not inferred conversation meanings.",
            "Voice pointers and actor tags become typed placeholders only after their native operation family is proven.",
            "No family membership supplies a missing trigger, actor, subtitle, camera, animation, or story predicate.",
            "The report is a prioritization index for semantic recovery and runtime work, not a playable-dialogue catalog.",
        ],
        "summary": {
            "candidateCount": len(members),
            "classifiedCandidateCount": sum(
                member["familyId"] is not None
                for member in members
            ),
            "missingFunctionCount": missing_function_count,
            "familyCount": len(families),
            "recurringFamilyCount": len(recurring),
            "candidateInRecurringFamilyCount": sum(
                family["memberCount"]
                for family in recurring
            ),
            "exactSingleActorLaunchCandidateCount": len(
                exact_single_actor
            ),
            "branchExclusiveTriggerCandidateCount": sum(
                member["status"]["hasBranchExclusiveTrigger"]
                for member in members
            ),
        },
        "families": families,
        "members": members,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "new-yokosuka-dialogue-interaction-family-summary-v1",
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "largestFamilies": report["families"][:32],
        "fullReport": (
            ".disc-work/dialogue/dialogue-interaction-families.json"
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--candidates",
        type=Path,
        default=DEFAULT_CANDIDATES,
    )
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--summary-output",
        type=Path,
        default=DEFAULT_SUMMARY,
    )
    args = parser.parse_args()
    report = build_report(
        json.loads(args.candidates.read_text()),
        json.loads(args.event_ir.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary_report(report), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['classifiedCandidateCount']} classified "
        f"into {report['summary']['familyCount']} families"
    )


if __name__ == "__main__":
    main()
