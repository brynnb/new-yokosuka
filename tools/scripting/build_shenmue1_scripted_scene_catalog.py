#!/usr/bin/env python3
"""Join Shenmue I script coverage, AUTH inventory, and reviewed programs.

This produces the compact browser-facing discovery catalog.  It deliberately
does not turn every coroutine entry or same-area AUTH member into a playable
scene: exact provenance and unresolved ownership remain visible in the data,
while only separately reviewed native program routes are production-enabled.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_COVERAGE = (
    PROJECT_ROOT / "tools/evidence/shenmue1-scripted-route-coverage.json"
)
DEFAULT_INVENTORY = (
    PROJECT_ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json"
)
DEFAULT_PROGRAM_PACK = (
    PROJECT_ROOT / "play/data/events/nativeEventPrograms.generated.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "play/data/events/nativeScriptedSceneCatalog.generated.json"
)
DEFAULT_MARKDOWN = (
    PROJECT_ROOT
    / "docs/reference/shenmue1-scripted-scene-catalog.generated.md"
)
SCHEMA = "new-yokosuka-shenmue1-scripted-scene-catalog-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def map_key(item: dict[str, Any], hash_field: str) -> tuple[int, str, str]:
    return item["disc"], item["area"], item[hash_field]


def map_id(disc: int, area: str, mapinfo_sha256: str) -> str:
    return f"disc{disc}/{area}/{mapinfo_sha256[:12]}"


def build_catalog(
    coverage: dict[str, Any],
    inventory: dict[str, Any],
    program_pack: dict[str, Any],
    *,
    source_hashes: dict[str, str] | None = None,
) -> dict[str, Any]:
    if coverage.get("schema") != "new-yokosuka-shenmue1-scripted-route-coverage-v1":
        raise ValueError("unsupported scripted-route coverage schema")
    if inventory.get("schema") != "new-yokosuka-shenmue1-scripted-scene-inventory-v1":
        raise ValueError("unsupported scripted-scene inventory schema")
    if program_pack.get("schema") != "new-yokosuka-native-event-program-pack-v1":
        raise ValueError("unsupported native event program-pack schema")

    inventory_maps: dict[tuple[int, str, str], dict[str, Any]] = {}
    for item in inventory.get("mapinfoPrograms", []):
        key = map_key(item, "sha256")
        if key in inventory_maps:
            raise ValueError(f"duplicate inventory MAPINFO identity: {key}")
        inventory_maps[key] = item

    coverage_maps: dict[tuple[int, str, str], dict[str, Any]] = {}
    for item in coverage.get("maps", []):
        key = map_key(item, "mapinfoSha256")
        if key in coverage_maps:
            raise ValueError(f"duplicate coverage MAPINFO identity: {key}")
        coverage_maps[key] = item
    if coverage_maps.keys() != inventory_maps.keys():
        missing_inventory = sorted(coverage_maps.keys() - inventory_maps.keys())
        missing_coverage = sorted(inventory_maps.keys() - coverage_maps.keys())
        raise ValueError(
            "MAPINFO corpus mismatch: "
            f"missing inventory={missing_inventory}, "
            f"missing coverage={missing_coverage}"
        )

    resources = inventory.get("authResources", [])
    resources_by_id: dict[str, dict[str, Any]] = {}
    archive_resources_by_area: dict[tuple[int, str], list[str]] = defaultdict(list)
    for resource in resources:
        identity = resource.get("id")
        if not isinstance(identity, str) or identity in resources_by_id:
            raise ValueError(f"invalid or duplicate AUTH resource: {identity}")
        resources_by_id[identity] = resource
        if resource.get("kind") == "archive-member":
            archive_resources_by_area[(resource["disc"], resource["area"])].append(
                identity
            )

    payloads = inventory.get("authPayloads", [])
    payload_hashes = {item.get("sha256") for item in payloads}
    if None in payload_hashes or len(payload_hashes) != len(payloads):
        raise ValueError("AUTH payload identities are invalid or duplicated")
    for resource in resources:
        if resource.get("payloadSha256") not in payload_hashes:
            raise ValueError(f"AUTH resource has no payload: {resource['id']}")

    reviewed_by_map: dict[tuple[int, str, str], list[dict[str, Any]]] = defaultdict(list)
    reviewed_ids: set[str] = set()
    for program in program_pack.get("programs", []):
        identity = program.get("id")
        if not isinstance(identity, str) or identity in reviewed_ids:
            raise ValueError(f"invalid or duplicate reviewed program: {identity}")
        reviewed_ids.add(identity)
        key = map_key(program, "mapinfoSha256")
        if key not in coverage_maps:
            raise ValueError(f"reviewed program has no catalog MAPINFO: {identity}")
        reviewed_by_map[key].append(program)

    maps = []
    coverage_states: Counter[str] = Counter()
    availability_states: Counter[str] = Counter()
    reviewed_candidate_ids: set[str] = set()
    for key in sorted(coverage_maps, key=lambda item: (item[0], item[1], item[2])):
        coverage_map = coverage_maps[key]
        inventory_map = inventory_maps[key]
        reviewed_programs = sorted(reviewed_by_map.get(key, []), key=lambda item: item["id"])
        reviewed_by_entry: dict[str, list[str]] = defaultdict(list)
        for program in reviewed_programs:
            reviewed_by_entry[program["entryFunction"]].append(program["id"])

        candidates = []
        for candidate in coverage_map.get("entryCandidates", []):
            program_ids = sorted(reviewed_by_entry.get(candidate["entryFunction"], []))
            availability = "reviewed-production" if program_ids else "research-only"
            result = {
                "id": candidate["id"],
                "entryFunction": candidate["entryFunction"],
                "entryKinds": candidate["entryKinds"],
                "launchSiteCount": candidate["launchSiteCount"],
                "coverageState": candidate["coverageState"],
                "availability": availability,
                "closure": candidate["closure"],
                "firstBlocker": candidate.get("firstBlocker"),
                **({"reviewedProgramIds": program_ids} if program_ids else {}),
            }
            candidates.append(result)
            coverage_states[result["coverageState"]] += 1
            availability_states[availability] += 1
            if program_ids:
                reviewed_candidate_ids.add(result["id"])

        embedded_ids = sorted(inventory_map.get("embeddedAuthResourceIds", []))
        if any(identity not in resources_by_id for identity in embedded_ids):
            raise ValueError(f"MAPINFO references an unknown embedded AUTH resource: {key}")
        archive_ids = sorted(archive_resources_by_area.get((key[0], key[1]), []))
        maps.append({
            "id": map_id(*key),
            "disc": key[0],
            "area": key[1],
            "mapinfoSha256": key[2],
            "sourcePath": inventory_map["sourcePath"],
            "initialEntryFunction": coverage_map["initialEntryFunction"],
            "reachableFunctionCount": coverage_map["reachableFunctionCount"],
            "entryCandidateCount": len(candidates),
            "reviewedProgramIds": [item["id"] for item in reviewed_programs],
            "authDependencies": {
                "exactMapEmbeddedResourceIds": embedded_ids,
                "areaArchiveCandidateResourceIds": archive_ids,
                "ownershipStatus": "entry-ownership-unresolved",
            },
            "entryCandidates": candidates,
        })

    program_records = []
    for program in sorted(program_pack.get("programs", []), key=lambda item: item["id"]):
        program_records.append({
            "id": program["id"],
            "disc": program["disc"],
            "area": program["area"],
            "mapinfoSha256": program["mapinfoSha256"],
            "entryFunction": program["entryFunction"],
            "summary": program["summary"],
            "evidence": program.get("evidence", []),
        })

    resource_records = [{
        key: resource[key]
        for key in (
            "id", "disc", "area", "kind", "sourcePath", "sourceOffset",
            "byteLength", "payloadSha256", "archiveSha256",
            "archiveMemberIndex", "archiveMember",
        )
        if key in resource
    } for resource in sorted(resources, key=lambda item: item["id"])]
    payload_records = [{
        key: payload[key]
        for key in (
            "sha256", "byteLength", "parseStatus", "durationFrames",
            "timelineFrameCount", "actorTags", "movementActorCount",
            "cameraCount", "stringCount", "commandCounts", "motionBanks",
            "issues", "logicalResourceIds",
        )
        if key in payload
    } for payload in sorted(payloads, key=lambda item: item["sha256"])]

    entry_count = sum(item["entryCandidateCount"] for item in maps)
    return {
        "schema": SCHEMA,
        "generatedFrom": {
            "scriptedRouteCoverage": "tools/evidence/shenmue1-scripted-route-coverage.json",
            "scriptedSceneInventory": "tools/evidence/shenmue1-scripted-scene-inventory.json",
            "nativeEventProgramPack": "play/data/events/nativeEventPrograms.generated.json",
            "sha256": dict(sorted((source_hashes or {}).items())),
        },
        "evidenceBoundary": [
            "Every entry is an exact SCN3 initial function or operation-0x0002 child-coroutine target from the structural coverage report.",
            "Entry candidates are addressable research identities, not automatically asserted player-facing scenes.",
            "Embedded AUTH resources are associated with their exact MAPINFO; archive AUTH resources are only area-scoped candidates until native ownership is proven.",
            "Logical AUTH resource identities and byte-identical physical payload identities remain separate; this catalog contains metadata, not duplicated assets.",
            "Only hash-pinned programs from the reviewed native event program pack are production-available.",
            "Reviewed program entries remain a separate player-facing route layer when they are descendants rather than SCN3 or child-coroutine entry candidates.",
            "A structurally parsed entry is not thereby dependency-complete, runtime-executable, gameplay-integrated, or validated.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            "entryCandidateCount": entry_count,
            "coverageStates": dict(sorted(coverage_states.items())),
            "availabilityStates": dict(sorted(availability_states.items())),
            "reviewedProgramCount": len(program_records),
            "reviewedEntryCandidateCount": len(reviewed_candidate_ids),
            "logicalAuthResourceCount": len(resource_records),
            "uniqueAuthPayloadCount": len(payload_records),
        },
        "reviewedPrograms": program_records,
        "maps": maps,
        "authResources": resource_records,
        "authPayloads": payload_records,
    }


def markdown_report(catalog: dict[str, Any]) -> str:
    summary = catalog["summary"]
    lines = [
        "# Shenmue I scripted-scene catalog",
        "",
        "> Generated by `tools/scripting/build_shenmue1_scripted_scene_catalog.py`; do not edit manually.",
        "",
        "This is the compact browser-facing join of exact native entry candidates,",
        "AUTH resource metadata, and separately reviewed program routes. Research-only",
        "entries cannot be launched by normal gameplay merely because they are listed.",
        "",
        "## Corpus",
        "",
        "| Measurement | Count |",
        "| --- | ---: |",
        f"| MAPINFO programs | {summary['mapinfoCount']:,} |",
        f"| Exact entry candidates | {summary['entryCandidateCount']:,} |",
        f"| Reviewed production programs | {summary['reviewedProgramCount']:,} |",
        f"| Entry candidates with a reviewed program | {summary['reviewedEntryCandidateCount']:,} |",
        f"| Logical AUTH resources | {summary['logicalAuthResourceCount']:,} |",
        f"| Unique AUTH payloads | {summary['uniqueAuthPayloadCount']:,} |",
        "",
        "## Availability",
        "",
        "| State | Entries |",
        "| --- | ---: |",
    ]
    for state, count in summary["availabilityStates"].items():
        lines.append(f"| `{state}` | {count:,} |")
    lines.extend([
        "",
        "## Structural coverage",
        "",
        "| State | Entries |",
        "| --- | ---: |",
    ])
    for state, count in summary["coverageStates"].items():
        lines.append(f"| `{state}` | {count:,} |")
    lines.extend([
        "",
        "## Reviewed programs",
        "",
        "| Program | Disc | Area | Entry | Functions | Actions |",
        "| --- | ---: | --- | --- | ---: | ---: |",
    ])
    for program in catalog["reviewedPrograms"]:
        lines.append(
            f"| `{program['id']}` | {program['disc']} | `{program['area']}` | "
            f"`{program['entryFunction']}` | {program['summary']['functionCount']:,} | "
            f"{program['summary']['actionCount']:,} |"
        )
    lines.extend([
        "",
        "## Evidence boundary",
        "",
        *[f"- {item}" for item in catalog["evidenceBoundary"]],
        "",
    ])
    return "\n".join(lines)


def write_or_check(path: Path, contents: str, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_text() != contents:
            raise SystemExit(f"generated output is stale: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coverage", type=Path, default=DEFAULT_COVERAGE)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--program-pack", type=Path, default=DEFAULT_PROGRAM_PACK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    paths = {
        "nativeEventProgramPack": args.program_pack,
        "scriptedRouteCoverage": args.coverage,
        "scriptedSceneInventory": args.inventory,
    }
    catalog = build_catalog(
        json.loads(args.coverage.read_text()),
        json.loads(args.inventory.read_text()),
        json.loads(args.program_pack.read_text()),
        source_hashes={key: sha256(path) for key, path in paths.items()},
    )
    write_or_check(
        args.output,
        json.dumps(catalog, separators=(",", ":")) + "\n",
        args.check,
    )
    write_or_check(args.markdown, markdown_report(catalog), args.check)
    print(
        f"{'Validated' if args.check else 'Wrote'} {args.output}: "
        f"{catalog['summary']['mapinfoCount']} maps, "
        f"{catalog['summary']['entryCandidateCount']} entries, "
        f"{catalog['summary']['reviewedProgramCount']} reviewed programs"
    )


if __name__ == "__main__":
    main()
