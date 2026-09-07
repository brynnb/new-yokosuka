#!/usr/bin/env python3
"""Compile deterministic diagnostics for the Shenmue I cutscene corpus.

This is a research diagnostic, not a package-readiness report or production
gate. It compiles each MAPINFO initial owner closure and each logical AUTH
resource far enough to name the first missing shared capability with exact
source provenance.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.build_shenmue1_scripted_route_coverage import summarize_candidate


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_RESOURCE_INVENTORY = (
    ROOT / "tools/evidence/shenmue1-scripted-scene-inventory.json"
)
DEFAULT_CONTAINER_ENCODINGS = (
    ROOT / "tools/evidence/scn3-container-encoding-evidence.json"
)
DEFAULT_OUTPUT = ROOT / "tools/evidence/native-cutscene-corpus-diagnostics.json"
SCHEMA = "new-yokosuka-native-cutscene-corpus-diagnostics-v1"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def number(value: str) -> int:
    return int(value, 16)


def function_actions(function: dict[str, Any]):
    for block in function.get("blocks", []):
        yield from block.get("actions", [])


def map_identity(value: dict[str, Any]) -> tuple[int, str, str]:
    return value["disc"], value["area"], value["mapinfoSha256"]


def inventory_map_identity(value: dict[str, Any]) -> tuple[int, str, str]:
    return value["disc"], value["area"], value["sha256"]


def blocker_capability(kind: str, identity: str) -> str:
    if kind == "engineOperation":
        return f"engine-operation:{identity}"
    if kind == "secondaryEngineOperation":
        return f"secondary-engine-operation:{identity}"
    if kind == "runtimeInterfaceCall":
        return f"runtime-interface:{identity}"
    if kind == "missingEntryFunction":
        return "control-flow:missing-entry-function"
    if kind == "unsupportedScn3Encoding":
        return "control-flow:unsupported-scn3-encoding"
    if kind == "nativeEntryExtractionAnomaly":
        return "control-flow:native-entry-extraction-anomaly"
    if kind == "nestedScn3Container":
        return "control-flow:nested-scn3-container"
    if kind == "missingScn3Program":
        return "control-flow:missing-scn3-program"
    if kind == "missingTargetFunction":
        return "control-flow:missing-target-function"
    if kind == "indirectCall":
        return "control-flow:indirect-call"
    return f"native-ir:{kind}:{identity}"


def first_blocker_action(
    source_map: dict[str, Any], blocker: dict[str, Any]
) -> dict[str, Any] | None:
    call_offset = blocker.get("firstCallFileOffset")
    if call_offset is None:
        return None
    for function in source_map.get("functions", []):
        if function["id"] != blocker["firstFunction"]:
            continue
        return next(
            (
                action
                for action in function_actions(function)
                if action.get("callFileOffset") == call_offset
            ),
            None,
        )
    return None


def classified_entry_blocker(
    first: dict[str, Any] | None,
    encoding: dict[str, Any],
) -> dict[str, Any] | None:
    if first is None or first.get("kind") != "missingEntryFunction":
        return first
    classification = encoding["classification"]
    replacements = {
        "legacy-instruction-stream-scn3-program": (
            "unsupportedScn3Encoding",
            classification,
        ),
        "native-scn3-extraction-anomaly": (
            "nativeEntryExtractionAnomaly",
            classification,
        ),
        "nested-scn3-container": (
            "nestedScn3Container",
            classification,
        ),
        "asset-only-no-scn3-program": (
            "missingScn3Program",
            classification,
        ),
    }
    replacement = replacements.get(classification)
    if replacement is None:
        return first
    kind, identity = replacement
    return {
        **first,
        "kind": kind,
        "identity": identity,
    }


def compile_mapinfo(
    source_map: dict[str, Any],
    source_record: dict[str, Any],
    encoding: dict[str, Any],
) -> dict[str, Any]:
    functions = source_map.get("functions", [])
    function_by_id = {function["id"]: function for function in functions}
    adjacency: dict[str, set[str]] = defaultdict(set)
    for function in functions:
        for action in function_actions(function):
            if action.get("kind") not in {"directCall", "childCoroutineLaunch"}:
                continue
            targets = (
                [action["targetFileOffset"]]
                if action.get("targetFileOffset")
                else action.get("targetFileOffsets", [])
            )
            if not targets:
                raise ValueError(
                    f"{source_map['disc']}:{source_map['area']}:{function['id']} "
                    f"{action['kind']} has no target"
                )
            adjacency[function["id"]].update(targets)
    candidate, _ = summarize_candidate(
        source_map,
        source_map["entryFunction"],
        {"scn3-initial"},
        [],
        function_by_id,
        adjacency,
    )
    first = classified_entry_blocker(candidate["firstBlocker"], encoding)
    blocker = None
    if first is not None:
        action = first_blocker_action(source_map, first)
        encoding_boundary = first["kind"] in {
            "unsupportedScn3Encoding",
            "nativeEntryExtractionAnomaly",
            "nestedScn3Container",
            "missingScn3Program",
        }
        blocker = {
            "capabilityId": blocker_capability(first["kind"], first["identity"]),
            "kind": first["kind"],
            "identity": first["identity"],
            "callSiteCount": first["callSiteCount"],
            "minimumGraphDepth": first["minimumGraphDepth"],
            **({
                "knownOperationFamilies": action["knownOperationFamilies"],
            } if action and action.get("knownOperationFamilies") else {}),
            "provenance": {
                "disc": source_map["disc"],
                "area": source_map["area"],
                "mapinfoPath": source_record["sourcePath"],
                "mapinfoSha256": source_map["mapinfoSha256"],
                "entryFunction": source_map["entryFunction"],
                "firstFunction": first["firstFunction"],
                "firstCallFileOffset": first["firstCallFileOffset"],
                **({
                    "scn3Encoding": encoding["classification"],
                } if encoding_boundary else {}),
                **({
                    "scn3FileOffset": encoding["scn3FileOffset"],
                } if (
                    encoding_boundary and encoding.get("scn3FileOffset")
                ) else {}),
                **({
                    "scn3EncodingMarker": encoding["encodingMarker"],
                } if (
                    encoding_boundary and encoding.get("encodingMarker")
                ) else {}),
                **({
                    "scn3EntryFileOffset": encoding["entryFileOffset"],
                } if (
                    encoding_boundary and encoding.get("entryFileOffset")
                ) else {}),
            },
        }
    return {
        "id": (
            f"d{source_map['disc']}:{source_map['area']}:"
            f"{source_map['mapinfoSha256'][:12]}"
        ),
        "disc": source_map["disc"],
        "area": source_map["area"],
        "mapinfoSha256": source_map["mapinfoSha256"],
        "source": {
            "path": source_record["sourcePath"],
            "byteLength": source_record["byteLength"],
            "sha256": source_record["sha256"],
        },
        "entryFunction": source_map["entryFunction"],
        "status": "blocked" if blocker else "compiled",
        "closure": candidate["closure"],
        "firstBlocker": blocker,
    }


def auth_issue_identity(issue: Any) -> str:
    if isinstance(issue, dict):
        return str(issue.get("kind") or issue.get("code") or "unclassified")
    value = str(issue).strip()
    return value or "unclassified"


def compile_auth_resource(
    resource: dict[str, Any], payload: dict[str, Any] | None
) -> dict[str, Any]:
    blocker = None
    if payload is None:
        blocker = {
            "capabilityId": "auth-index:missing-payload",
            "kind": "missingAuthPayload",
            "identity": resource["payloadSha256"],
        }
    elif payload.get("parseStatus") != "complete":
        identity = str(payload.get("parseStatus") or "missing")
        blocker = {
            "capabilityId": f"auth-format:{identity}",
            "kind": "authParseStatus",
            "identity": identity,
        }
    elif payload.get("issues"):
        identity = auth_issue_identity(payload["issues"][0])
        blocker = {
            "capabilityId": f"auth-format:{identity}",
            "kind": "authPayloadIssue",
            "identity": identity,
        }
    if blocker is not None:
        blocker["provenance"] = {
            "resourceId": resource["id"],
            "disc": resource["disc"],
            "area": resource["area"],
            "sourcePath": resource["sourcePath"],
            **({"sourceOffset": resource["sourceOffset"]} if resource.get("sourceOffset") else {}),
            **({"archiveMember": resource["archiveMember"]} if resource.get("archiveMember") else {}),
            **({
                "archiveMemberIndex": resource["archiveMemberIndex"],
            } if resource.get("archiveMemberIndex") is not None else {}),
            "payloadSha256": resource["payloadSha256"],
        }
    return {
        "id": resource["id"],
        "disc": resource["disc"],
        "area": resource["area"],
        "kind": resource["kind"],
        "payloadSha256": resource["payloadSha256"],
        "source": {
            "path": resource["sourcePath"],
            "byteLength": resource["byteLength"],
            **({"offset": resource["sourceOffset"]} if resource.get("sourceOffset") else {}),
            **({"archiveMember": resource["archiveMember"]} if resource.get("archiveMember") else {}),
            **({
                "archiveMemberIndex": resource["archiveMemberIndex"],
            } if resource.get("archiveMemberIndex") is not None else {}),
        },
        "status": "blocked" if blocker else "compiled",
        "firstBlocker": blocker,
    }


def blocker_clusters(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    affected: dict[str, list[str]] = defaultdict(list)
    for record in records:
        blocker = record.get("firstBlocker")
        if blocker:
            affected[blocker["capabilityId"]].append(record["id"])
    clusters = [
        {
            "capabilityId": capability_id,
            "recordCount": len(record_ids),
            "recordIds": sorted(record_ids),
        }
        for capability_id, record_ids in affected.items()
    ]
    clusters.sort(key=lambda value: (-value["recordCount"], value["capabilityId"]))
    return clusters


def build_report(
    event_ir: dict[str, Any],
    inventory: dict[str, Any],
    container_encodings: dict[str, Any],
    *,
    event_ir_sha256: str,
    inventory_sha256: str,
    container_encodings_sha256: str,
) -> dict[str, Any]:
    if event_ir.get("schema") != "new-yokosuka-native-event-ir-v1":
        raise ValueError("native event IR schema is unsupported")
    if inventory.get("schema") != "new-yokosuka-shenmue1-scripted-scene-inventory-v1":
        raise ValueError("scripted scene inventory schema is unsupported")
    if container_encodings.get("schema") != (
        "new-yokosuka-scn3-container-encoding-evidence-v1"
    ):
        raise ValueError("SCN3 container encoding evidence is unsupported")
    source_maps = inventory.get("mapinfoPrograms", [])
    source_by_identity = {inventory_map_identity(value): value for value in source_maps}
    if len(source_by_identity) != len(source_maps):
        raise ValueError("scripted scene inventory has duplicate MAPINFO identities")
    ir_identities = {map_identity(value) for value in event_ir.get("maps", [])}
    if ir_identities != set(source_by_identity):
        raise ValueError("native event IR and MAPINFO resource index disagree")
    encoding_records = container_encodings.get("records", [])
    encoding_by_identity = {
        (value["disc"], value["area"], value["mapinfoSha256"]): value
        for value in encoding_records
    }
    if (
        len(encoding_by_identity) != len(encoding_records)
        or set(encoding_by_identity) != ir_identities
    ):
        raise ValueError(
            "SCN3 container encoding evidence and MAPINFO corpus disagree"
        )

    maps = [
        compile_mapinfo(
            source_map,
            source_by_identity[map_identity(source_map)],
            encoding_by_identity[map_identity(source_map)],
        )
        for source_map in sorted(
            event_ir["maps"],
            key=lambda value: (value["disc"], value["area"], value["mapinfoSha256"]),
        )
    ]
    payload_by_hash = {
        value["sha256"]: value for value in inventory.get("authPayloads", [])
    }
    if len(payload_by_hash) != len(inventory.get("authPayloads", [])):
        raise ValueError("scripted scene inventory has duplicate AUTH payload identities")
    resource_ids = [value["id"] for value in inventory.get("authResources", [])]
    if len(set(resource_ids)) != len(resource_ids):
        raise ValueError("scripted scene inventory has duplicate AUTH resource identities")
    auth_resources = [
        compile_auth_resource(resource, payload_by_hash.get(resource["payloadSha256"]))
        for resource in sorted(
            inventory["authResources"],
            key=lambda value: (value["disc"], value["area"], value["id"]),
        )
    ]
    all_records = maps + auth_resources
    clusters = blocker_clusters(all_records)
    return {
        "schema": SCHEMA,
        "generatedBy": "tools/cutscenes/build_native_cutscene_corpus_diagnostics.py",
        "generatedFrom": {
            "nativeEventIr": {
                "path": ".disc-work/dialogue/native-event-ir.json",
                "sha256": event_ir_sha256,
                "schema": event_ir["schema"],
            },
            "scriptedSceneInventory": {
                "path": "tools/evidence/shenmue1-scripted-scene-inventory.json",
                "sha256": inventory_sha256,
                "schema": inventory["schema"],
            },
            "scn3ContainerEncodings": {
                "path": "tools/evidence/scn3-container-encoding-evidence.json",
                "sha256": container_encodings_sha256,
                "schema": container_encodings["schema"],
            },
        },
        "evidenceBoundary": [
            "MAPINFO status compiles the exact SCN3 initial-owner static closure; it does not assert that every child coroutine is a player-facing cutscene.",
            "Logical AUTH status verifies the indexed payload parser result without deduplicating distinct source resources that share bytes.",
            "Compiled means the current compiler has no unresolved structural or format boundary for this record; it does not mean packaged, selectable, runtime-validated, or production-ready.",
            "Blocked records retain only their deterministic first boundary for prioritization; the full native IR remains the source for all later blockers.",
            "Capability clusters group identical compiler responsibilities across the corpus and never select scene-specific fallback behavior.",
            "A missing native function is reclassified only when exact SCN3 container and executable-loader evidence proves a different encoding or structural boundary; unsupported legacy programs remain blocked.",
        ],
        "summary": {
            "mapinfoCount": len(maps),
            "compiledMapinfoCount": sum(value["status"] == "compiled" for value in maps),
            "blockedMapinfoCount": sum(value["status"] == "blocked" for value in maps),
            "logicalAuthResourceCount": len(auth_resources),
            "compiledAuthResourceCount": sum(
                value["status"] == "compiled" for value in auth_resources
            ),
            "blockedAuthResourceCount": sum(
                value["status"] == "blocked" for value in auth_resources
            ),
            "firstBlockerCapabilityCount": len(clusters),
        },
        "firstBlockerClusters": clusters,
        "mapinfo": maps,
        "authResources": auth_resources,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument(
        "--resource-inventory", type=Path, default=DEFAULT_RESOURCE_INVENTORY
    )
    parser.add_argument(
        "--container-encodings", type=Path, default=DEFAULT_CONTAINER_ENCODINGS
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    report = build_report(
        json.loads(args.event_ir.read_text()),
        json.loads(args.resource_inventory.read_text()),
        json.loads(args.container_encodings.read_text()),
        event_ir_sha256=sha256(args.event_ir),
        inventory_sha256=sha256(args.resource_inventory),
        container_encodings_sha256=sha256(args.container_encodings),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {args.output}: "
        f"{summary['compiledMapinfoCount']}/{summary['mapinfoCount']} MAPINFO and "
        f"{summary['compiledAuthResourceCount']}/"
        f"{summary['logicalAuthResourceCount']} AUTH compiled"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
