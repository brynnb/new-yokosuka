#!/usr/bin/env python3
"""Build the owner/trigger-based player-facing Shenmue I scene inventory."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GROUPS = ROOT / "tools/data/player-cutscene-scene-groups.json"
DEFAULT_SELECTOR = ROOT / "tools/evidence/native-cutscene-selector-program-audit.json"
DEFAULT_READINESS = ROOT / "tools/evidence/native-cutscene-package-readiness.json"
DEFAULT_CANDIDATES = ROOT / "tools/evidence/native-activity-owner-candidates.json"
DEFAULT_DISPOSITIONS = ROOT / "tools/data/native-activity-owner-dispositions.json"
DEFAULT_PROGRAMS = ROOT / "play/data/events/nativeEventPrograms.generated.json"
DEFAULT_CORPUS = ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json"
DEFAULT_DISCOVERY = ROOT / "tools/evidence/player-cutscene-owner-discovery.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/player-cutscene-scene-inventory.json"


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def binding_key(binding: dict[str, Any]) -> tuple[str, str]:
    return binding["programId"], binding["authResource"]["id"]


def matching_bindings(
    group: dict[str, Any], bindings: list[dict[str, Any]], availability: str,
) -> list[dict[str, Any]]:
    programs = set(group.get("programIds", []))
    resources = set(group.get("resourceNames", []))
    members = set(group.get("archiveMembers", []))
    result = []
    for binding in bindings:
        if binding["availability"] != availability:
            continue
        if programs and binding["programId"] not in programs:
            continue
        if resources and binding["nativeBinding"]["resourceName"] not in resources:
            continue
        if members and binding["authResource"]["archiveMember"] not in members:
            continue
        result.append(binding)
    return result


def binding_summary(bindings: list[dict[str, Any]]) -> dict[str, Any]:
    commands: Counter[str] = Counter()
    actors = set()
    for binding in bindings:
        auth = binding["authResource"]
        commands.update(auth.get("commandCounts", {}))
        actors.update(auth.get("actorTags", []))
    return {
        "authBindingCount": len(bindings),
        "durationFrames": sum(
            item["authResource"].get("durationFrames", 0) for item in bindings
        ),
        "commandCounts": dict(sorted(commands.items())),
        "actorTags": sorted(actors),
        "members": [
            {
                "programId": item["programId"],
                "resourceName": item["nativeBinding"]["resourceName"],
                "archiveMember": item["authResource"]["archiveMember"],
                "sha256": item["authResource"]["sha256"],
                "durationFrames": item["authResource"].get("durationFrames", 0),
                "callFileOffsets": item["callFileOffsets"],
            }
            for item in bindings
        ],
    }


def build_report(
    groups: dict[str, Any],
    selector: dict[str, Any],
    readiness: dict[str, Any],
    candidates: dict[str, Any],
    dispositions: dict[str, Any],
    programs_pack: dict[str, Any],
    corpus: dict[str, Any],
    discovery: dict[str, Any],
) -> dict[str, Any]:
    selections = selector["programSelections"]
    selections_by_id = {item["cutsceneId"]: item for item in selections}
    programs = {item["id"]: item for item in programs_pack["programs"]}
    bindings = readiness["reviewedBindings"]
    discovery_scenes_by_id = {
        scene["id"]: {
            **scene,
            "candidateId": candidate["candidateId"],
            "sourceCandidateIds": candidate["sourceCandidateIds"],
            "world": candidate["world"],
            "owner": candidate["owner"],
            "audio": candidate["audio"],
        }
        for candidate in discovery["candidates"]
        for scene in candidate["scenes"]
    }

    assigned_selector_ids: list[str] = []
    selected_groups = []
    selected_binding_keys = set()
    selected_production_keys = set()
    selected_research_keys = set()
    promoted_discovery_ids = set()
    for source_group in groups["selectedGroups"]:
        group = dict(source_group)
        selector_ids = group["selectorIds"]
        missing = sorted(set(selector_ids) - selections_by_id.keys())
        if missing:
            raise ValueError(f"unknown selector ids in {group['id']}: {missing}")
        assigned_selector_ids.extend(selector_ids)
        owner_program_ids = set(group.get("programIds", []))
        owner_program_ids.update(
            selections_by_id[item]["programId"]
            for item in selector_ids
            if selections_by_id[item]["kind"] == "native-owner"
        )
        effective = {**group, "programIds": sorted(owner_program_ids)}
        production = matching_bindings(effective, bindings, "production")
        research = (
            matching_bindings(effective, bindings, "research-only")
            if group.get("includeResearchBindings") else []
        )
        selected_production_keys.update(map(binding_key, production))
        selected_research_keys.update(map(binding_key, research))
        selected_binding_keys.update(map(binding_key, production + research))
        promoted_discovery_ids.update(group.get("discoverySceneIds", []))
        preview_activity_ids = []
        for selector_id in selector_ids:
            selection = selections_by_id[selector_id]
            if selection["kind"] == "single-auth-activity-v1":
                preview_activity_ids.append(
                    programs[selection["programId"]]["preview"]["activity"]["activityId"]
                )
        selected_groups.append({
            **group,
            "programIds": sorted(owner_program_ids),
            "selectorEntryCount": len(selector_ids),
            "previewActivityIds": preview_activity_ids,
            "content": binding_summary(production + research),
            "discoveryContent": [
                discovery_scenes_by_id[scene_id]
                for scene_id in group.get("discoverySceneIds", [])
            ],
            "bindingAvailability": (
                "research-only" if research else "production"
            ),
        })

    duplicates = [
        item for item, count in Counter(assigned_selector_ids).items() if count != 1
    ]
    unassigned = sorted(set(selections_by_id) - set(assigned_selector_ids))
    if duplicates or unassigned or len(assigned_selector_ids) != len(selections):
        raise ValueError(
            f"selector partition is not exact; duplicates={duplicates}, unassigned={unassigned}"
        )

    production_keys = {
        binding_key(item) for item in bindings if item["availability"] == "production"
    }
    if selected_production_keys != production_keys:
        raise ValueError(
            "selected groups do not exactly partition reviewed production bindings"
        )

    missing_scenes = []
    research_partition = set(selected_research_keys)
    for source_group in sorted(groups["missingScenes"], key=lambda item: item["rank"]):
        found = matching_bindings(source_group, bindings, "research-only")
        if not found:
            raise ValueError(f"missing scene has no research bindings: {source_group['id']}")
        research_partition.update(map(binding_key, found))
        missing_scenes.append({**source_group, "content": binding_summary(found)})

    reviewed_non_scenes = []
    for source_group in groups["reviewedNonScenes"]:
        found = matching_bindings(source_group, bindings, "research-only")
        if not found:
            raise ValueError(f"reviewed non-scene has no bindings: {source_group['id']}")
        research_partition.update(map(binding_key, found))
        reviewed_non_scenes.append({**source_group, "content": binding_summary(found)})
    research_keys = {
        binding_key(item) for item in bindings if item["availability"] == "research-only"
    }
    if research_partition != research_keys:
        raise ValueError("missing scenes and reviewed non-scenes do not partition research bindings")

    candidate_by_id = {item["id"]: item for item in candidates["candidates"]}
    selected_group_by_id = {item["id"]: item for item in groups["selectedGroups"]}
    duplicate_candidates = []
    for declaration in groups["duplicateCandidates"]:
        candidate = candidate_by_id[declaration["candidateId"]]
        hashes = sorted({
            auth["payloadSha256"]
            for install in candidate["installs"]
            for auth in install["authResources"]
        })
        canonical_group = selected_group_by_id[declaration["canonicalGroupId"]]
        canonical_bindings = (
            matching_bindings(canonical_group, bindings, "production")
            + matching_bindings(canonical_group, bindings, "research-only")
        )
        canonical_hashes = {
            item["authResource"]["sha256"] for item in canonical_bindings
        }
        if not set(hashes).issubset(canonical_hashes):
            raise ValueError(
                f"candidate {candidate['id']} is not payload-identical to "
                f"canonical group {canonical_group['id']}"
            )
        duplicate_candidates.append({
            **declaration,
            "area": candidate["area"],
            "installerFunction": candidate["installerFunction"],
            "authPayloadCount": len(hashes),
            "authPayloadSha256": hashes,
        })

    duplicate_ids = {item["candidateId"] for item in groups["duplicateCandidates"]}
    discovered_candidate_ids = {
        candidate_id
        for item in discovery["candidates"]
        for candidate_id in item["sourceCandidateIds"]
    }
    unresolved_candidates = [
        {
            "candidateId": item["id"],
            "area": item["area"],
            "installerFunction": item["installerFunction"],
            "resourceNames": item["resourceNames"],
            "installCount": len(item["installs"]),
            "unresolvedSelectionCount": sum(
                1 for install in item["installs"] if not install["authResources"]
            ),
            "blockers": item["blockers"],
        }
        for item in candidates["candidates"]
        if item["promotionState"] == "owner-review-required"
        and item["id"] not in duplicate_ids
        and item["id"] not in discovered_candidate_ids
    ]
    all_discovered_scenes = list(discovery_scenes_by_id.values())
    discovered_scene_ids = {item["id"] for item in all_discovered_scenes}
    unknown_promotions = sorted(promoted_discovery_ids - discovered_scene_ids)
    if unknown_promotions:
        raise ValueError(f"selected groups promote unknown discovery scenes: {unknown_promotions}")
    discovered_scenes = [
        scene for scene in all_discovered_scenes
        if scene["id"] not in promoted_discovery_ids
    ]

    promotion_counts = Counter(item["promotionState"] for item in candidates["candidates"])
    corpus_summary = corpus["summary"]
    return {
        "schema": "new-yokosuka-player-cutscene-scene-inventory-v1",
        "evidenceBoundary": groups["evidenceBoundary"],
        "summary": {
            "mapinfoCount": corpus_summary["mapinfoProgramCount"],
            "logicalAuthResourceCount": corpus_summary["authResourceCount"],
            "uniqueAuthPayloadCount": corpus_summary["uniqueAuthPayloadCount"],
            "selectorEntryCount": len(selections),
            "selectorNativeOwnerEntryCount": sum(
                item["kind"] == "native-owner" for item in selections
            ),
            "selectorSingleAuthPreviewEntryCount": sum(
                item["kind"] == "single-auth-activity-v1" for item in selections
            ),
            "selectedOwnerTriggerGroupCount": len(selected_groups),
            "selectedReviewedAuthBindingCount": len(selected_binding_keys),
            "selectedResearchOnlyAuthBindingCount": len(selected_research_keys),
            "selectedOwnerIncompleteGroupCount": sum(
                item["bindingAvailability"] == "research-only"
                for item in selected_groups
            ),
            "missingCoherentSceneCount": len(missing_scenes),
            "missingSceneAuthBindingCount": sum(
                item["content"]["authBindingCount"] for item in missing_scenes
            ),
            "reviewedNonSceneAuthBindingCount": sum(
                item["content"]["authBindingCount"] for item in reviewed_non_scenes
            ),
            "reviewedAmbientOrGameplayCandidateCount": len(dispositions["dispositions"]),
            "duplicateInstallerCandidateCount": len(duplicate_candidates),
            "unresolvedOwnerCandidateCount": len(unresolved_candidates),
            "unresolvedOwnerCandidateSelectionCount": sum(
                item["unresolvedSelectionCount"] for item in unresolved_candidates
            ),
            "newlyDiscoveredPlayerFacingCandidateCount": discovery["summary"]["reviewedCandidateCount"],
            "promotedDiscoveredPlayerFacingSceneCount": len(promoted_discovery_ids),
            "newlyDiscoveredPlayerFacingSceneCount": len(discovered_scenes),
            "newlyDiscoveredAuthPayloadCount": discovery["summary"]["uniqueAuthPayloadCount"],
            "candidatePromotionStates": dict(sorted(promotion_counts.items())),
        },
        "selectedOwnerTriggerGroups": selected_groups,
        "missingScenesRanked": missing_scenes,
        "reviewedResearchNonScenes": reviewed_non_scenes,
        "reviewedAmbientAndGameplayScripts": dispositions["dispositions"],
        "duplicateInstallerCandidates": duplicate_candidates,
        "newlyDiscoveredMissingScenes": discovered_scenes,
        "unresolvedOwnerCandidates": unresolved_candidates,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--groups", type=Path, default=DEFAULT_GROUPS)
    parser.add_argument("--selector", type=Path, default=DEFAULT_SELECTOR)
    parser.add_argument("--readiness", type=Path, default=DEFAULT_READINESS)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--dispositions", type=Path, default=DEFAULT_DISPOSITIONS)
    parser.add_argument("--programs", type=Path, default=DEFAULT_PROGRAMS)
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--discovery", type=Path, default=DEFAULT_DISCOVERY)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    paths = [
        args.groups, args.selector, args.readiness, args.candidates,
        args.dispositions, args.programs, args.corpus, args.discovery,
    ]
    report = build_report(*(load(path) for path in paths))
    report["generatedBy"] = "tools/cutscenes/audit_player_cutscene_scene_inventory.py"
    report["generatedFrom"] = [
        {"path": str(path.relative_to(ROOT)), "sha256": sha256(path)} for path in paths
    ]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
