#!/usr/bin/env python3
"""Build exact entry-candidate closures and blocker impact for Shenmue I.

This report intentionally stops short of calling every operation-0x0002 target
a player-facing scene.  It supplies the structural denominator needed to prove
those higher-level identities: SCN3 initial entries, child-coroutine entries,
their launch provenance, exact static dependency closures, and unresolved
runtime boundaries.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict, deque
from pathlib import Path
from typing import Any, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/shenmue1-scripted-route-coverage.json"
)
DEFAULT_MARKDOWN = (
    PROJECT_ROOT
    / "docs/reference/shenmue1-scripted-route-coverage.generated.md"
)
SCHEMA = "new-yokosuka-shenmue1-scripted-route-coverage-v1"


def number(value: str) -> int:
    return int(value, 16)


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def action_order(action: dict[str, Any]) -> int:
    value = action.get("callFileOffset")
    return number(value) if isinstance(value, str) else 0x7FFFFFFF


def function_actions(function: dict[str, Any]) -> Iterable[dict[str, Any]]:
    for block in function.get("blocks", []):
        yield from block.get("actions", [])


def blocker_key(action: dict[str, Any]) -> tuple[str, str]:
    kind = action["kind"]
    if kind in {"engineOperation", "secondaryEngineOperation"}:
        return kind, action.get("operationHex") or "runtime"
    if kind == "runtimeInterfaceCall":
        return kind, action.get("runtimeCallKind", "unclassified")
    return kind, "unclassified"


def action_is_blocker(action: dict[str, Any]) -> bool:
    kind = action["kind"]
    if kind in {"engineOperation", "secondaryEngineOperation"}:
        return action.get("adapterStatus") != "proven"
    if kind == "indirectCall":
        return True
    if kind == "runtimeInterfaceCall":
        return (
            action.get("behaviorStatus") != "proven"
            or not action.get("semanticId")
        )
    return False


def graph_depths(
    entry: str,
    adjacency: dict[str, set[str]],
) -> dict[str, int]:
    depths = {entry: 0}
    pending = deque([entry])
    while pending:
        source = pending.popleft()
        for target in sorted(adjacency.get(source, ()), key=number):
            if target in depths:
                continue
            depths[target] = depths[source] + 1
            pending.append(target)
    return depths


def candidate_id(
    disc: int,
    area: str,
    mapinfo_sha256: str,
    entry: str,
) -> str:
    return f"disc{disc}/{area}/{mapinfo_sha256[:12]}/{entry}"


def summarize_candidate(
    source_map: dict[str, Any],
    entry: str,
    kinds: set[str],
    launch_sites: list[dict[str, Any]],
    function_by_id: dict[str, dict[str, Any]],
    adjacency: dict[str, set[str]],
) -> tuple[dict[str, Any], dict[tuple[str, str], dict[str, Any]]]:
    identity = candidate_id(
        source_map["disc"],
        source_map["area"],
        source_map["mapinfoSha256"],
        entry,
    )
    if entry not in function_by_id:
        blocker = {
            "kind": "missingEntryFunction",
            "identity": entry,
            "callSiteCount": 1,
            "minimumGraphDepth": 0,
            "firstFunction": entry,
            "firstCallFileOffset": None,
        }
        return ({
            "id": identity,
            "entryFunction": entry,
            "entryKinds": sorted(kinds),
            "launchSiteCount": len(launch_sites),
            "launchSites": launch_sites,
            "coverageState": "entry-discovery-blocked",
            "closure": {
                "functionCount": 0,
                "dialogueRegionCount": 0,
                "authActivityLaunchCount": 0,
                "authResourceBindingCount": 0,
                "unresolvedBoundaryCount": 1,
                "unresolvedBoundaryTypeCount": 1,
            },
            "firstBlocker": blocker,
            "blockers": [blocker],
        }, {("missingEntryFunction", entry): blocker})

    depths = graph_depths(entry, adjacency)
    blocker_sites: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    dialogue_regions = 0
    auth_launches = 0
    auth_bindings = 0
    missing_targets: set[str] = set()
    for function_id in sorted(depths, key=lambda item: (depths[item], number(item))):
        function = function_by_id.get(function_id)
        if function is None:
            missing_targets.add(function_id)
            continue
        dialogue_regions += function.get("dialogueRegion") is not None
        for action in function_actions(function):
            if (
                action.get("kind") == "engineOperation"
                and action.get("operationHex") == "0x0050"
            ):
                auth_launches += 1
            if (
                action.get("kind") == "engineOperation"
                and action.get("operationHex") == "0x013e"
            ):
                auth_bindings += 1
            if action_is_blocker(action):
                key = blocker_key(action)
                blocker_sites[key].append({
                    "function": function_id,
                    "callFileOffset": action.get("callFileOffset"),
                    "graphDepth": depths[function_id],
                })
    for target in sorted(missing_targets, key=number):
        blocker_sites[("missingTargetFunction", target)].append({
            "function": target,
            "callFileOffset": None,
            "graphDepth": depths[target],
        })

    blockers = []
    impacts = {}
    for key, sites in blocker_sites.items():
        sites.sort(key=lambda item: (
            item["graphDepth"],
            number(item["function"]),
            (
                number(item["callFileOffset"])
                if item["callFileOffset"] is not None
                else 0x7FFFFFFF
            ),
        ))
        first = sites[0]
        blocker = {
            "kind": key[0],
            "identity": key[1],
            "callSiteCount": len(sites),
            "minimumGraphDepth": first["graphDepth"],
            "firstFunction": first["function"],
            "firstCallFileOffset": first["callFileOffset"],
        }
        blockers.append(blocker)
        impacts[key] = blocker
    blockers.sort(key=lambda item: (
        item["minimumGraphDepth"],
        number(item["firstFunction"]),
        (
            number(item["firstCallFileOffset"])
            if item["firstCallFileOffset"] is not None
            else 0x7FFFFFFF
        ),
        item["kind"],
        item["identity"],
    ))
    unresolved_count = sum(item["callSiteCount"] for item in blockers)
    return ({
        "id": identity,
        "entryFunction": entry,
        "entryKinds": sorted(kinds),
        "launchSiteCount": len(launch_sites),
        "launchSites": launch_sites,
        "coverageState": (
            "structurally-parsed-blocked"
            if blockers
            else "structurally-parsed"
        ),
        "closure": {
            "functionCount": len(depths) - len(missing_targets),
            "dialogueRegionCount": dialogue_regions,
            "authActivityLaunchCount": auth_launches,
            "authResourceBindingCount": auth_bindings,
            "unresolvedBoundaryCount": unresolved_count,
            "unresolvedBoundaryTypeCount": len(blockers),
        },
        "firstBlocker": blockers[0] if blockers else None,
        "blockers": blockers,
    }, impacts)


def build_report(event_ir: dict[str, Any], event_ir_sha256: str) -> dict[str, Any]:
    maps = []
    impact_routes: dict[tuple[str, str], set[str]] = defaultdict(set)
    impact_maps: dict[tuple[str, str], set[tuple[int, str, str]]] = defaultdict(set)
    impact_calls: Counter[tuple[str, str]] = Counter()
    impact_depth: dict[tuple[str, str], int] = {}
    state_counts: Counter[str] = Counter()
    entry_kind_counts: Counter[str] = Counter()

    for source_map in event_ir["maps"]:
        function_by_id = {
            function["id"]: function
            for function in source_map.get("functions", [])
        }
        adjacency: dict[str, set[str]] = defaultdict(set)
        candidate_kinds: dict[str, set[str]] = defaultdict(set)
        launch_sites: dict[str, list[dict[str, Any]]] = defaultdict(list)
        initial = source_map["entryFunction"]
        candidate_kinds[initial].add("scn3-initial")
        for function in source_map.get("functions", []):
            for action in function_actions(function):
                if action["kind"] not in {"directCall", "childCoroutineLaunch"}:
                    continue
                targets = (
                    [action["targetFileOffset"]]
                    if action.get("targetFileOffset")
                    else action.get("targetFileOffsets", [])
                )
                if not targets:
                    raise ValueError(
                        f"{function['id']}: {action['kind']} has no target"
                    )
                adjacency[function["id"]].update(targets)
                if action["kind"] == "childCoroutineLaunch":
                    for target in targets:
                        candidate_kinds[target].add("child-coroutine-target")
                        launch_sites[target].append({
                            "sourceFunction": function["id"],
                            "callFileOffset": action["callFileOffset"],
                            "argumentCount": action.get("argumentCount"),
                            **({
                                "targetSource": action["targetSource"],
                            } if action.get("targetSource") else {}),
                        })
        candidates = []
        map_key = (
            source_map["disc"],
            source_map["area"],
            source_map["mapinfoSha256"],
        )
        for entry in sorted(candidate_kinds, key=number):
            sites = sorted(launch_sites.get(entry, []), key=lambda item: (
                number(item["sourceFunction"]),
                number(item["callFileOffset"]),
            ))
            candidate, impacts = summarize_candidate(
                source_map,
                entry,
                candidate_kinds[entry],
                sites,
                function_by_id,
                adjacency,
            )
            candidates.append(candidate)
            state_counts[candidate["coverageState"]] += 1
            for kind in candidate["entryKinds"]:
                entry_kind_counts[kind] += 1
            for key, blocker in impacts.items():
                impact_routes[key].add(candidate["id"])
                impact_maps[key].add(map_key)
                impact_calls[key] += blocker["callSiteCount"]
                impact_depth[key] = min(
                    impact_depth.get(key, blocker["minimumGraphDepth"]),
                    blocker["minimumGraphDepth"],
                )
        maps.append({
            "disc": source_map["disc"],
            "area": source_map["area"],
            "mapinfoSha256": source_map["mapinfoSha256"],
            "initialEntryFunction": initial,
            "reachableFunctionCount": len(function_by_id),
            "entryCandidateCount": len(candidates),
            "entryCandidates": candidates,
        })

    blocker_impact = [{
        "kind": key[0],
        "identity": key[1],
        "entryCandidateCount": len(impact_routes[key]),
        "mapinfoCount": len(impact_maps[key]),
        "closureCallSiteCount": impact_calls[key],
        "minimumGraphDepth": impact_depth[key],
    } for key in impact_routes]
    blocker_impact.sort(key=lambda item: (
        -item["entryCandidateCount"],
        -item["mapinfoCount"],
        item["minimumGraphDepth"],
        item["kind"],
        item["identity"],
    ))
    candidate_count = sum(item["entryCandidateCount"] for item in maps)
    return {
        "schema": SCHEMA,
        "generatedFrom": {
            "nativeEventIr": ".disc-work/dialogue/native-event-ir.json",
            "nativeEventIrSha256": event_ir_sha256,
            "nativeEventIrSchema": event_ir["schema"],
        },
        "evidenceBoundary": [
            "An entry candidate is an exact SCN3 initial function or an exact operation-0x0002 child-coroutine target.",
            "Entry candidates are structural execution roots, not asserted player-facing scene identities.",
            "A closure follows exact direct-call and child-coroutine target edges within one MAPINFO program.",
            "Blocker depth is minimum static inter-function graph depth; it is not an invented runtime branch order.",
            "Unresolved operations, secondary operations, indirect calls, handler-specific runtime dispatches, and missing function targets remain explicit.",
            "A structurally parsed candidate has not yet met route-proven, dependency-complete, runtime-executable, gameplay-integrated, or validated gates.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            "mapinfoWithoutReachableFunctionsCount": sum(
                item["reachableFunctionCount"] == 0 for item in maps
            ),
            "entryCandidateCount": candidate_count,
            "initialEntryCandidateCount": entry_kind_counts["scn3-initial"],
            "childCoroutineEntryCandidateCount": (
                entry_kind_counts["child-coroutine-target"]
            ),
            "coverageStates": dict(sorted(state_counts.items())),
            "blockerTypeCount": len(blocker_impact),
            "entryCandidateWithAuthActivityCount": sum(
                candidate["closure"]["authActivityLaunchCount"] > 0
                for source_map in maps
                for candidate in source_map["entryCandidates"]
            ),
            "entryCandidateWithDialogueCount": sum(
                candidate["closure"]["dialogueRegionCount"] > 0
                for source_map in maps
                for candidate in source_map["entryCandidates"]
            ),
        },
        "blockerImpact": blocker_impact,
        "maps": maps,
    }


def markdown_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Shenmue I scripted route coverage",
        "",
        "> Generated by `tools/scripting/build_shenmue1_scripted_route_coverage.py`; do not edit manually.",
        "",
        "This is a structural entry-candidate report. A coroutine target is not called a",
        "player-facing scene until its native owner and gate are separately proven.",
        "",
        "## Corpus",
        "",
        "| Measurement | Count |",
        "| --- | ---: |",
        f"| MAPINFO programs | {summary['mapinfoCount']:,} |",
        f"| Exact entry candidates | {summary['entryCandidateCount']:,} |",
        f"| SCN3 initial entries | {summary['initialEntryCandidateCount']:,} |",
        f"| Distinct child-coroutine entries | {summary['childCoroutineEntryCandidateCount']:,} |",
        f"| Candidates reaching AUTH activity control | {summary['entryCandidateWithAuthActivityCount']:,} |",
        f"| Candidates reaching dialogue regions | {summary['entryCandidateWithDialogueCount']:,} |",
        f"| MAPINFO programs without recovered functions | {summary['mapinfoWithoutReachableFunctionsCount']:,} |",
        "",
        "## Coverage states",
        "",
        "| State | Entry candidates |",
        "| --- | ---: |",
    ]
    for state, count in summary["coverageStates"].items():
        lines.append(f"| `{state}` | {count:,} |")
    lines.extend([
        "",
        "## Highest-impact unresolved boundaries",
        "",
        "Impact counts candidates whose exact static closure contains the boundary.",
        "Repeated closure call sites are shown separately and are not scene counts.",
        "",
        "| Rank | Boundary | Candidates | Maps | Closure call sites | Min depth |",
        "| ---: | --- | ---: | ---: | ---: | ---: |",
    ])
    for rank, item in enumerate(report["blockerImpact"][:40], start=1):
        boundary = f"{item['kind']} `{item['identity']}`"
        lines.append(
            f"| {rank} | {boundary} | {item['entryCandidateCount']:,} | "
            f"{item['mapinfoCount']:,} | {item['closureCallSiteCount']:,} | "
            f"{item['minimumGraphDepth']:,} |"
        )
    lines.extend([
        "",
        "## Per-map entry counts",
        "",
        "| Disc | Area | Entries | Reachable functions |",
        "| ---: | --- | ---: | ---: |",
    ])
    for item in report["maps"]:
        lines.append(
            f"| {item['disc']} | `{item['area']}` | "
            f"{item['entryCandidateCount']:,} | "
            f"{item['reachableFunctionCount']:,} |"
        )
    return "\n".join(lines) + "\n"


def write_or_check(path: Path, contents: str, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_text() != contents:
            raise SystemExit(f"generated output is stale: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(contents)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--markdown", type=Path, default=DEFAULT_MARKDOWN)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    event_ir = json.loads(args.event_ir.read_text())
    if event_ir.get("schema") != "new-yokosuka-native-event-ir-v1":
        raise SystemExit("scripted route coverage requires the full native event IR")
    report = build_report(event_ir, source_sha256(args.event_ir))
    json_contents = json.dumps(report, indent=2) + "\n"
    markdown_contents = markdown_report(report)
    write_or_check(args.output, json_contents, args.check)
    write_or_check(args.markdown, markdown_contents, args.check)
    print(
        f"{'Checked' if args.check else 'Wrote'} {args.output}: "
        f"{report['summary']['entryCandidateCount']} exact entry candidates, "
        f"{report['summary']['blockerTypeCount']} blocker types"
    )


if __name__ == "__main__":
    main()
