#!/usr/bin/env python3
"""Rank unresolved capabilities on reviewed player-facing cutscene routes."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SELECTOR_AUDIT = (
    ROOT / "tools/evidence/native-cutscene-selector-program-audit.json"
)
DEFAULT_READINESS = (
    ROOT / "tools/evidence/native-cutscene-package-readiness.json"
)
DEFAULT_PROGRAMS = ROOT / "play/data/events/nativeEventPrograms.generated.json"
DEFAULT_CORPUS = ROOT / "tools/evidence/native-cutscene-corpus-diagnostics.json"
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/player-cutscene-capability-priorities.json"
)

# Explicitly retained as a report lens, not as semantic or runtime policy.
# This is the operation-recovery sequence whose room-wide prioritization
# prompted this audit.
CAMPAIGN_OPERATION_FOCUS = (
    0x01AF,
    0x01AD,
    0x0179,
    0x0156,
    0x0047,
    0x0026,
    0x01A1,
    0x0128,
    0x0185,
    0x018A,
    0x0166,
    0x006E,
    0x0100,
    0x00B4,
    0x019E,
    0x0084,
    0x0066,
    0x014B,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def operation_actions(program: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for function in program.get("functions", []):
        for block in function.get("blocks", []):
            for action in block.get("actions", []):
                if action.get("kind") in {
                    "engineOperation",
                    "secondaryEngineOperation",
                }:
                    yield {
                        **action,
                        "functionId": function["id"],
                        "blockId": block["id"],
                    }


def operation_capability(action: dict[str, Any]) -> str:
    prefix = (
        "secondary-engine-operation"
        if action["kind"] == "secondaryEngineOperation"
        else "engine-operation"
    )
    operation_hex = action.get("operationHex") or "unknown"
    return f"{prefix}:{operation_hex}"


def surface_names(
    program_id: str,
    selector_ids: set[str],
    production_ids: set[str],
    research_ids: set[str],
) -> list[str]:
    surfaces = []
    if program_id in selector_ids:
        surfaces.append("selector-native-owner")
    if program_id in production_ids:
        surfaces.append("reviewed-production-owner")
    if program_id in research_ids:
        surfaces.append("reviewed-research-owner")
    return surfaces


def unresolved_operation_priorities(
    programs: dict[str, dict[str, Any]],
    owner_ids: set[str],
    selector_ids: set[str],
    production_ids: set[str],
    research_ids: set[str],
    binding_counts: dict[str, Counter[str]],
) -> list[dict[str, Any]]:
    capabilities: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for program_id in sorted(owner_ids):
        for action in operation_actions(programs[program_id]):
            if action.get("adapterStatus") == "proven":
                continue
            capabilities[operation_capability(action)][program_id].append({
                "functionId": action["functionId"],
                "blockId": action["blockId"],
                "callFileOffset": action["callFileOffset"],
                "adapterStatus": action.get("adapterStatus"),
                "argumentCount": len(action.get("arguments", [])),
            })

    ranked = []
    for capability_id, by_program in capabilities.items():
        selector_programs = sorted(set(by_program) & selector_ids)
        production_programs = sorted(set(by_program) & production_ids)
        research_programs = sorted(set(by_program) & research_ids)
        if selector_programs:
            priority_tier = "selector-blocker"
            tier_rank = 0
        elif production_programs:
            priority_tier = "reviewed-production-owner-gap"
            tier_rank = 1
        else:
            priority_tier = "reviewed-research-owner-gap"
            tier_rank = 2
        program_records = []
        for program_id, calls in sorted(by_program.items()):
            program_records.append({
                "programId": program_id,
                "surfaces": surface_names(
                    program_id,
                    selector_ids,
                    production_ids,
                    research_ids,
                ),
                "associatedBindingCounts": dict(binding_counts[program_id]),
                "callCount": len(calls),
                "calls": calls,
            })
        ranked.append({
            "capabilityId": capability_id,
            "priorityTier": priority_tier,
            "selectorOwnerProgramCount": len(selector_programs),
            "reviewedProductionProgramCount": len(production_programs),
            "reviewedResearchProgramCount": len(research_programs),
            "affectedProgramCount": len(by_program),
            "callCount": sum(len(calls) for calls in by_program.values()),
            "programs": program_records,
            "_sort": (
                tier_rank,
                -len(by_program),
                -sum(len(calls) for calls in by_program.values()),
                capability_id,
            ),
        })
    ranked.sort(key=lambda item: item["_sort"])
    for rank, item in enumerate(ranked, 1):
        item["rank"] = rank
        del item["_sort"]
    return ranked


def binding_blocker_priorities(
    reviewed_bindings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blockers: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for binding in reviewed_bindings:
        if binding.get("availability") != "research-only":
            continue
        for blocker in binding.get("blockers", []):
            blockers[blocker].append({
                "programId": binding["programId"],
                "callFileOffsets": binding["callFileOffsets"],
                "authResourceId": binding["authResource"]["id"],
                "resourceName": binding["nativeBinding"]["resourceName"],
            })
    ranked = [
        {
            "capabilityId": blocker,
            "affectedBindingCount": len(bindings),
            "affectedProgramCount": len({
                binding["programId"] for binding in bindings
            }),
            "bindings": bindings,
        }
        for blocker, bindings in blockers.items()
    ]
    ranked.sort(key=lambda item: (
        -item["affectedProgramCount"],
        -item["affectedBindingCount"],
        item["capabilityId"],
    ))
    for rank, item in enumerate(ranked, 1):
        item["rank"] = rank
    return ranked


def operation_surface_counts(
    programs: dict[str, dict[str, Any]],
    program_ids: set[str],
    operation_id: int,
) -> dict[str, int]:
    call_count = 0
    unresolved_count = 0
    matched_programs = set()
    for program_id in program_ids:
        for action in operation_actions(programs[program_id]):
            if action.get("operationId") != operation_id:
                continue
            call_count += 1
            matched_programs.add(program_id)
            if action.get("adapterStatus") != "proven":
                unresolved_count += 1
    return {
        "programCount": len(matched_programs),
        "callCount": call_count,
        "unresolvedCallCount": unresolved_count,
    }


def campaign_relevance(
    programs: dict[str, dict[str, Any]],
    selector_ids: set[str],
    production_ids: set[str],
    research_ids: set[str],
) -> list[dict[str, Any]]:
    owner_ids = selector_ids | production_ids | research_ids
    records = []
    for operation_id in CAMPAIGN_OPERATION_FOCUS:
        selector = operation_surface_counts(programs, selector_ids, operation_id)
        production = operation_surface_counts(
            programs, production_ids, operation_id,
        )
        research = operation_surface_counts(programs, research_ids, operation_id)
        unique_owner = operation_surface_counts(programs, owner_ids, operation_id)
        if selector["callCount"]:
            relevance = "selector-owner-runtime"
        elif unique_owner["callCount"]:
            relevance = "reviewed-owner-runtime"
        else:
            relevance = "initial-room-stress-only"
        records.append({
            "operationId": operation_id,
            "operationHex": f"0x{operation_id:04x}",
            "genuinelyCutsceneRelevant": unique_owner["callCount"] > 0,
            "relevance": relevance,
            "selectorNativeOwners": selector,
            "reviewedProductionOwners": production,
            "reviewedResearchOwners": research,
            "uniqueReviewedOwnerUnion": unique_owner,
        })
    return records


def build_report(
    selector_audit: dict[str, Any],
    readiness: dict[str, Any],
    program_pack: dict[str, Any],
    corpus: dict[str, Any],
    generated_from: dict[str, Any] | None = None,
) -> dict[str, Any]:
    programs = {program["id"]: program for program in program_pack["programs"]}
    selections = selector_audit["programSelections"]
    selector_ids = {
        selection["programId"]
        for selection in selections
        if selection["kind"] == "native-owner"
    }
    preview_selections = [
        selection for selection in selections
        if selection["kind"] == "single-auth-activity-v1"
    ]
    reviewed_bindings = readiness["reviewedBindings"]
    production_ids = {
        binding["programId"]
        for binding in reviewed_bindings
        if binding["availability"] == "production"
    }
    research_ids = {
        binding["programId"]
        for binding in reviewed_bindings
        if binding["availability"] == "research-only"
    }
    owner_ids = selector_ids | production_ids | research_ids
    missing = sorted(owner_ids - set(programs))
    if missing:
        raise ValueError(f"reviewed cutscene owner programs are missing: {missing}")
    binding_counts: dict[str, Counter[str]] = defaultdict(Counter)
    for binding in reviewed_bindings:
        binding_counts[binding["programId"]][binding["availability"]] += 1
    operation_priorities = unresolved_operation_priorities(
        programs,
        owner_ids,
        selector_ids,
        production_ids,
        research_ids,
        binding_counts,
    )
    binding_priorities = binding_blocker_priorities(reviewed_bindings)
    campaign = campaign_relevance(
        programs,
        selector_ids,
        production_ids,
        research_ids,
    )
    cutscene_capabilities = {
        item["capabilityId"] for item in operation_priorities
    }
    stress_clusters = []
    for cluster in corpus["firstBlockerClusters"]:
        capability_id = cluster["capabilityId"]
        stress_clusters.append({
            **cluster,
            "presentInReviewedOwnerClosures": (
                capability_id in cutscene_capabilities
            ),
            "priorityScope": (
                "reviewed-owner-overlap"
                if capability_id in cutscene_capabilities
                else "initial-room-stress-only"
            ),
        })
    selector_unresolved = sum(
        item["callCount"]
        for item in operation_priorities
        if item["selectorOwnerProgramCount"] > 0
    )
    return {
        "schema": "new-yokosuka-player-cutscene-capability-priorities-v1",
        "generatedBy": "tools/cutscenes/audit_player_cutscene_capabilities.py",
        **({"generatedFrom": generated_from} if generated_from else {}),
        "evidenceBoundary": [
            "Player-facing priority is derived only from configured selector-native owner programs and reviewed production/research AUTH-owner bindings.",
            "Single-AUTH selector previews are counted as player-facing selections but have no MAPINFO owner closure; all 491 logical AUTH resources are independently parser-compiled.",
            "An unresolved operation in a reviewed owner closure is retained with exact program/function/block/call provenance; it is not inferred to affect unrelated room entry code.",
            "Research-only binding blockers remain distinct from unresolved engine-operation capabilities because packaging, composite interstitial, and persistent-state gaps are not operation IDs.",
            "Full initial-room corpus blockers are reported as stress coverage and never outrank a reviewed player-facing owner solely because they occur on more discs or maps.",
            "Campaign operation focus is a reporting lens for the current recovery sequence, not runtime policy or a compatibility registry.",
        ],
        "summary": {
            "selectorSelectionCount": len(selections),
            "selectorNativeOwnerCount": len(selector_ids),
            "selectorSingleAuthPreviewCount": len(preview_selections),
            "reviewedProductionOwnerCount": len(production_ids),
            "reviewedResearchOwnerCount": len(research_ids),
            "uniqueReviewedOwnerCount": len(owner_ids),
            "reviewedBindingCount": len(reviewed_bindings),
            "reviewedResearchBindingCount": sum(
                binding["availability"] == "research-only"
                for binding in reviewed_bindings
            ),
            "selectorUnresolvedOperationCallCount": selector_unresolved,
            "reviewedOwnerUnresolvedCapabilityCount": len(operation_priorities),
            "reviewedOwnerUnresolvedOperationCallCount": sum(
                item["callCount"] for item in operation_priorities
            ),
            "researchBindingCapabilityCount": len(binding_priorities),
            "fullInitialRoomStressBlockerCapabilityCount": len(stress_clusters),
            "authCompiledCount": corpus["summary"]["compiledAuthResourceCount"],
            "authLogicalResourceCount": corpus["summary"]["logicalAuthResourceCount"],
        },
        "surfaces": {
            "selectorNativeOwnerProgramIds": sorted(selector_ids),
            "selectorSingleAuthPreviewProgramIds": sorted({
                selection["programId"] for selection in preview_selections
            }),
            "reviewedProductionOwnerProgramIds": sorted(production_ids),
            "reviewedResearchOwnerProgramIds": sorted(research_ids),
        },
        "unresolvedOwnerOperationPriorities": operation_priorities,
        "reviewedResearchBindingPriorities": binding_priorities,
        "campaignOperationRelevance": campaign,
        "fullInitialRoomStressCoverage": {
            "summary": corpus["summary"],
            "firstBlockerClusters": stress_clusters,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--selector-audit", type=Path, default=DEFAULT_SELECTOR_AUDIT)
    parser.add_argument("--readiness", type=Path, default=DEFAULT_READINESS)
    parser.add_argument("--programs", type=Path, default=DEFAULT_PROGRAMS)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    paths = {
        "selectorAudit": args.selector_audit,
        "packageReadiness": args.readiness,
        "programPack": args.programs,
        "fullRoomCorpusDiagnostics": args.corpus,
    }
    report = build_report(
        load(args.selector_audit),
        load(args.readiness),
        load(args.programs),
        load(args.corpus),
        {
            name: {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)}
            for name, path in paths.items()
        },
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], sort_keys=True))


if __name__ == "__main__":
    main()
