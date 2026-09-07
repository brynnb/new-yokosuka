#!/usr/bin/env python3
"""Join exact operation-0x013e installs to native AUTH resources and owners.

This is a discovery inventory, not a production allowlist. It preserves the
distinction between a function which installs an activity resource, its exact
static callers, and a reviewed player-facing lifecycle owner.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
IR_PATH = ROOT / ".disc-work/dialogue/native-event-ir.json"
SCENE_INVENTORY_PATH = (
    ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json"
)
ACTOR_CATALOG_PATH = ROOT / "play/data/events/nativeActivityActors.json"
AUDIO_EVIDENCE_PATH = ROOT / "tools/evidence/d000-auth-audio-banks.json"
LIFECYCLE_EVIDENCE_GLOB = "*-native-lifecycle.json"
ROUTES_PATH = ROOT / "tools/data/native-event-program-routes.json"
PROGRAM_PACK_PATH = ROOT / "play/data/events/nativeEventPrograms.generated.json"
DISPOSITIONS_PATH = ROOT / "tools/data/native-activity-owner-dispositions.json"
OUTPUT_PATH = ROOT / "tools/evidence/native-activity-owner-candidates.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cstring(data: bytes, offset: int) -> str:
    if offset < 0 or offset >= len(data):
        raise ValueError(f"string pointer 0x{offset:x} exceeds MAPINFO")
    end = data.find(b"\0", offset)
    if end < 0:
        raise ValueError(f"string pointer 0x{offset:x} is unterminated")
    return data[offset:end].decode("ascii")


def function_actions(function: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        action
        for block in function["blocks"]
        for action in block["actions"]
    ]


def static_install(action: dict[str, Any]) -> dict[str, int] | None:
    if (
        action.get("kind") != "engineOperation"
        or action.get("operationId") != 0x013E
    ):
        return None
    arguments = action.get("arguments", [])
    if (
        len(arguments) != 4
        or arguments[0].get("kind") != "constant"
        or arguments[0].get("value") != 0
        or arguments[1].get("kind") != "constant"
        or arguments[2].get("kind") != "static-pointer"
        or arguments[3].get("kind") != "static-pointer"
    ):
        return None
    return {
        "slot": arguments[1]["value"],
        "primaryPointer": arguments[2]["value"],
        "secondaryPointer": arguments[3]["value"],
    }


def static_release(action: dict[str, Any]) -> int | None:
    if (
        action.get("kind") != "engineOperation"
        or action.get("operationId") != 0x013E
    ):
        return None
    arguments = action.get("arguments", [])
    if (
        len(arguments) == 2
        and arguments[0].get("kind") == "constant"
        and arguments[0].get("value") == 1
        and arguments[1].get("kind") == "constant"
    ):
        return arguments[1]["value"]
    return None


def source_map_path(disc: int, area: str) -> Path:
    return ROOT / f"extracted_files/data/SCENE/0{disc}/{area}/MAPINFO.BIN"


def archive_resource_name(resource: dict[str, Any]) -> str | None:
    if resource.get("kind") != "archive-member":
        return None
    return Path(resource["sourcePath"]).stem.upper()


def selected_auth_resources(
    *,
    disc: int,
    area: str,
    slot: int,
    primary: str,
    secondary: str,
    resources_by_archive: dict[tuple[int, str, str], list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], str]:
    member = (
        primary[:-4] + ".AUTH"
        if primary.upper().endswith(".BIN")
        else None
    )
    resource_name = (
        Path(secondary).name.upper()
        if secondary
        else primary.upper()
    )
    candidates = resources_by_archive.get((disc, area, resource_name), [])
    if member:
        exact = [
            value for value in candidates
            if value.get("archiveMember", "").upper() == member.upper()
        ]
        return exact, "exact-auth-member-name"
    if 0 <= slot < len(candidates):
        return [candidates[slot]], "zero-based-auth-extension-ordinal"
    return candidates, "archive-resource-only"


def reviewed_activity_functions(
    program_pack: dict[str, Any],
    routes: dict[str, Any],
) -> tuple[dict[tuple[int, str, str], list[str]], list[str]]:
    if program_pack.get("schema") != "new-yokosuka-native-event-program-pack-v1":
        raise ValueError("native event program pack schema is unsupported")
    if routes.get("schema") != "new-yokosuka-native-event-program-routes-v1":
        raise ValueError("native event program routes schema is unsupported")
    programs = program_pack.get("programs")
    route_records = routes.get("routes")
    if not isinstance(programs, list) or not isinstance(route_records, list):
        raise ValueError("native event programs and routes must be arrays")

    program_by_id: dict[str, dict[str, Any]] = {}
    for program in programs:
        program_id = program.get("id")
        if not isinstance(program_id, str) or not program_id:
            raise ValueError("native event program has no id")
        if program_id in program_by_id:
            raise ValueError(f"native event program {program_id} is duplicated")
        program_by_id[program_id] = program

    reviewed: dict[tuple[int, str, str], list[str]] = defaultdict(list)
    routed_ids: set[str] = set()
    for route in route_records:
        route_id = route.get("id")
        if not isinstance(route_id, str) or not route_id:
            raise ValueError("native event program route has no id")
        if route_id in routed_ids:
            raise ValueError(f"native event program route {route_id} is duplicated")
        routed_ids.add(route_id)
        program = program_by_id.get(route_id)
        if program is None:
            raise ValueError(
                f"native event program route {route_id} has no compiled program"
            )
        owner_functions = route.get("activityOwnerFunctions")
        available_functions = {
            function.get("id"): function for function in program.get("functions", [])
        }
        selected_ids = (
            list(available_functions)
            if owner_functions is None
            else owner_functions
        )
        if (
            not isinstance(selected_ids, list)
            or any(not isinstance(value, str) for value in selected_ids)
        ):
            raise ValueError(f"{route_id} activity owner functions are invalid")
        missing = [value for value in selected_ids if value not in available_functions]
        if missing:
            raise ValueError(
                f"{route_id} has unavailable activity owner functions: "
                + ", ".join(missing)
            )
        for function_id in selected_ids:
            reviewed[(program["disc"], program["area"], function_id)].append(route_id)

    return reviewed, sorted(set(program_by_id) - routed_ids)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=OUTPUT_PATH,
        help=f"output JSON path (default: {OUTPUT_PATH.relative_to(ROOT)})",
    )
    args = parser.parse_args(argv)
    ir = json.loads(IR_PATH.read_text())
    inventory = json.loads(SCENE_INVENTORY_PATH.read_text())
    actor_catalog = json.loads(ACTOR_CATALOG_PATH.read_text())
    audio_evidence = json.loads(AUDIO_EVIDENCE_PATH.read_text())
    routes = json.loads(ROUTES_PATH.read_text())
    program_pack = json.loads(PROGRAM_PACK_PATH.read_text())
    dispositions = json.loads(DISPOSITIONS_PATH.read_text())
    disposition_by_candidate = {
        value["candidateId"]: value
        for value in dispositions["dispositions"]
    }

    payload_by_hash = {
        value["sha256"]: value for value in inventory["authPayloads"]
    }
    resources_by_archive: dict[
        tuple[int, str, str], list[dict[str, Any]]
    ] = defaultdict(list)
    for resource in inventory["authResources"]:
        name = archive_resource_name(resource)
        if name:
            resources_by_archive[(
                resource["disc"], resource["area"], name
            )].append(resource)
    for values in resources_by_archive.values():
        values.sort(key=lambda value: value["archiveMemberIndex"])

    known_actor_tags = {
        value["actorCode"]
        for values in actor_catalog["worlds"].values()
        for value in values
    } | set(actor_catalog.get("packageActorTags", [])) \
      | set(actor_catalog.get("sceneObjectTags", [])) \
      | {"AKIR"}
    audio_families = {
        value["family"] for value in audio_evidence["mappings"]
    }
    # Area-specific lifecycle reviews use the same schema as the older D000
    # audio audit. Treat a family as reviewed only when its lifecycle names an
    # exact sound bank; this avoids growing another area-specific allowlist.
    lifecycle_audio_evidence = []
    for lifecycle_path in sorted(
        (ROOT / "tools/evidence").glob(LIFECYCLE_EVIDENCE_GLOB)
    ):
        lifecycle = json.loads(lifecycle_path.read_text())
        resource = lifecycle.get("resource")
        sound_bank = lifecycle.get("resourceCluster", {}).get("soundBank")
        if resource and sound_bank:
            audio_families.add(resource)
            lifecycle_audio_evidence.append({
                "path": str(lifecycle_path.relative_to(ROOT)),
                "sha256": sha256(lifecycle_path),
                "resource": resource,
                "soundBank": sound_bank,
            })
    reviewed_functions, programs_outside_owner_routes = reviewed_activity_functions(
        program_pack, routes
    )

    incoming: dict[tuple[int, str, str], list[dict[str, str]]] = defaultdict(list)
    for map_record in ir["maps"]:
        for function in map_record["functions"]:
            for action in function_actions(function):
                if action.get("kind") != "directCall":
                    continue
                target = action.get("targetFileOffset")
                if target:
                    incoming[(map_record["disc"], map_record["area"], target)].append({
                        "callerFunction": function["id"],
                        "callFileOffset": action["callFileOffset"],
                    })

    candidates = []
    for map_record in ir["maps"]:
        map_path = source_map_path(map_record["disc"], map_record["area"])
        if not map_path.exists():
            continue
        map_bytes = map_path.read_bytes()
        for function in map_record["functions"]:
            actions = function_actions(function)
            installs = []
            for action in actions:
                install = static_install(action)
                if not install:
                    continue
                primary = cstring(map_bytes, install["primaryPointer"])
                secondary = cstring(map_bytes, install["secondaryPointer"])
                resources, rule = selected_auth_resources(
                    disc=map_record["disc"],
                    area=map_record["area"],
                    slot=install["slot"],
                    primary=primary,
                    secondary=secondary,
                    resources_by_archive=resources_by_archive,
                )
                joined = []
                for resource in resources:
                    payload = payload_by_hash.get(resource["payloadSha256"])
                    joined.append({
                        "resourceId": resource["id"],
                        "archiveMember": resource.get("archiveMember"),
                        "payloadSha256": resource["payloadSha256"],
                        "parseStatus": payload.get("parseStatus") if payload else None,
                        "durationFrames": payload.get("durationFrames") if payload else None,
                        "actorTags": payload.get("actorTags", []) if payload else [],
                        "motionBanks": payload.get("motionBanks", []) if payload else [],
                        "commandCounts": payload.get("commandCounts", {}) if payload else {},
                    })
                installs.append({
                    "callFileOffset": action["callFileOffset"],
                    **install,
                    "primaryResource": primary,
                    "secondaryResource": secondary,
                    "selectionRule": rule,
                    "authResources": joined,
                })
            if not installs:
                continue
            release_slots = sorted({
                slot for action in actions
                if (slot := static_release(action)) is not None
            })
            payloads = [
                payload
                for install in installs
                for payload in install["authResources"]
            ]
            actor_tags = sorted({
                tag for payload in payloads for tag in payload["actorTags"]
            })
            resource_names = sorted({
                (
                    Path(install["secondaryResource"]).name.upper()
                    if install["secondaryResource"]
                    else install["primaryResource"].upper()
                )
                for install in installs
            })
            candidate_id = (
                f"d{map_record['disc']}:{map_record['area']}:"
                f"installer:{function['id']}"
            )
            disposition = disposition_by_candidate.get(candidate_id)
            blockers = []
            if any(len(install["authResources"]) != 1 for install in installs):
                blockers.append("exact-auth-resource-selection-unresolved")
            if any(payload["parseStatus"] != "complete" for payload in payloads):
                blockers.append("auth-payload-not-complete")
            unknown_actors = sorted(set(actor_tags) - known_actor_tags)
            if unknown_actors:
                blockers.append("actor-or-scene-object-bindings-unreviewed")
            if any(
                sum(payload["commandCounts"].get(kind, 0) for kind in ("voice", "sound"))
                for payload in payloads
            ) and not any(name in audio_families for name in resource_names):
                blockers.append("native-audio-resource-cluster-unreviewed")
            route_ids = sorted(reviewed_functions.get((
                map_record["disc"], map_record["area"], function["id"],
            ), []))
            if not route_ids and disposition is None:
                blockers.append("player-facing-lifecycle-owner-unreviewed")
            candidates.append({
                "id": candidate_id,
                "disc": map_record["disc"],
                "area": map_record["area"],
                "mapinfoSha256": map_record["mapinfoSha256"],
                "installerFunction": function["id"],
                "reviewedRouteIds": route_ids,
                "incomingDirectCalls": incoming.get((
                    map_record["disc"], map_record["area"], function["id"],
                ), []),
                "releaseSlotsInFunction": release_slots,
                "resourceNames": resource_names,
                "actorTags": actor_tags,
                "unknownActorOrObjectTags": unknown_actors,
                "installs": installs,
                "blockers": blockers,
                "promotionState": (
                    "reviewed-route"
                    if route_ids
                    else "reviewed-non-cutscene"
                    if disposition is not None
                    else "owner-review-required"
                ),
                **({"reviewedDisposition": disposition} if disposition else {}),
            })

    candidates.sort(key=lambda value: (
        len(value["blockers"]),
        value["disc"],
        value["area"],
        int(value["installerFunction"], 16),
    ))
    report = {
        "schema": "new-yokosuka-native-activity-owner-candidates-v1",
        "generatedBy": "tools/cutscenes/build_native_activity_owner_candidates.py",
        "generatedFrom": {
            "nativeEventIr": {
                "path": ".disc-work/dialogue/native-event-ir.json",
                "sha256": sha256(IR_PATH),
            },
            "scriptedSceneInventory": {
                "path": "tools/evidence/shenmue1-scripted-scene-inventory.json",
                "sha256": sha256(SCENE_INVENTORY_PATH),
            },
            "nativeActivityActors": {
                "path": "play/data/events/nativeActivityActors.json",
                "sha256": sha256(ACTOR_CATALOG_PATH),
            },
            "nativeEventProgramRoutes": {
                "path": "tools/data/native-event-program-routes.json",
                "sha256": sha256(ROUTES_PATH),
            },
            "nativeEventProgramPack": {
                "path": "play/data/events/nativeEventPrograms.generated.json",
                "sha256": sha256(PROGRAM_PACK_PATH),
            },
            "nativeActivityOwnerDispositions": {
                "path": "tools/data/native-activity-owner-dispositions.json",
                "sha256": sha256(DISPOSITIONS_PATH),
            },
            "nativeLifecycleAudioEvidence": lifecycle_audio_evidence,
        },
        "evidenceBoundary": [
            "Every entry is an exact function containing one or more static mode-zero operation-0x013e installs.",
            "Incoming direct calls identify structural wrappers only; they do not prove player-facing lifecycle ownership.",
            "Routes may narrow reviewed activity ownership to explicit functions so a large story-controller closure cannot claim sibling installers.",
            "Archive AUTH selection uses exact member names or the native zero-based AUTH-extension ordinal rule.",
            "Unknown four-character tags remain actor-or-scene-object blockers until their native bindings are proved.",
            "A candidate is not production-ready until a reviewed owner route and every dependency are packaged and runtime-validated.",
            "Reviewed non-cutscene dispositions preserve exact exclusions so ambient AUTH activities are not repeatedly reconsidered or exposed as cutscenes.",
            "Only explicit native-event route definitions confer reviewed activity-owner status; compiled programs outside that route inventory remain valid canonical programs but do not classify operation-0x013e installer candidates.",
        ],
        "sourceAlignment": {
            "compiledProgramCount": len(program_pack["programs"]),
            "activityOwnerRouteCount": len(routes["routes"]),
            "programsOutsideActivityOwnerRoutes": programs_outside_owner_routes,
        },
        "summary": {
            "installerFunctionCount": len(candidates),
            "staticInstallCount": sum(len(value["installs"]) for value in candidates),
            "reviewedRouteCount": sum(
                bool(value["reviewedRouteIds"]) for value in candidates
            ),
            "reviewedNonCutsceneCount": sum(
                value["promotionState"] == "reviewed-non-cutscene"
                for value in candidates
            ),
            "exactAuthSelectionCount": sum(
                len(install["authResources"]) == 1
                for value in candidates for install in value["installs"]
            ),
            "unresolvedAuthSelectionCount": sum(
                len(install["authResources"]) != 1
                for value in candidates for install in value["installs"]
            ),
        },
        "candidates": candidates,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.output}: {len(candidates)} installers, "
        f"{report['summary']['exactAuthSelectionCount']}/"
        f"{report['summary']['staticInstallCount']} exact AUTH selections"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
