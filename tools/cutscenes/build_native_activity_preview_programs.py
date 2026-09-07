#!/usr/bin/env python3
"""Compile explicit AUTH selector previews into generic canonical programs."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROUTES = PROJECT_ROOT / "tools/data/native-activity-preview-routes.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "play/data/events/nativeActivityPreviewPrograms.generated.json"
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} is required")
    return value.strip()


def require_word(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0:
        raise ValueError(f"{label} must be a non-negative integer")
    return value


def exact_activity(
    manifest: dict[str, Any],
    requested: dict[str, Any],
    route_label: str,
) -> dict[str, Any]:
    slot = require_word(requested.get("slot"), "preview activity slot")
    binding = requested.get("binding")
    if binding is None:
        matches = [
            activity for activity in manifest.get("activities", [])
            if activity.get("slot") == slot
            and activity.get("binding", {}).get("kind") == "map-embedded-slot"
        ]
    else:
        primary = require_word(binding.get("primaryPointer"), "preview primary pointer")
        secondary = require_word(binding.get("secondaryPointer"), "preview secondary pointer")
        matches = [
            activity for activity in manifest.get("activities", [])
            if activity.get("slot") == slot
            and activity.get("primaryPointer") == primary
            and activity.get("secondaryPointer") == secondary
        ]
    if len(matches) != 1:
        raise ValueError(
            f"{route_label}: expected one exact activity, found {len(matches)}"
        )
    return matches[0]


def constant(value: int, source: str) -> dict[str, Any]:
    return {
        "kind": "constant",
        "value": value,
        "hex": f"0x{value & 0xffffffff:08x}",
        "source": source,
    }


def activity_preview_function(
    activities: list[tuple[int, int | None, int | None]],
) -> dict[str, Any]:
    sequence = len(activities) > 1
    entry = "$activity-sequence" if sequence else "$activity-preview"
    complete = f"{entry}:return"
    blocks = []
    for index, (slot, primary, secondary) in enumerate(activities):
        prefix = f"{entry}:{index}" if sequence else entry
        bind = f"{prefix}:bind"
        wait = f"{prefix}:wait"
        poll = f"{prefix}:poll"
        branch = f"{prefix}:branch"
        next_block = (
            f"{entry}:{index + 1}:bind"
            if index + 1 < len(activities)
            else complete
        )
        bind_actions = []
        if primary is not None and secondary is not None:
            bind_actions.append({
                "kind": "engineOperation",
                "callFileOffset": f"{prefix}:013e",
                "operationId": 318,
                "operationHex": "0x013e",
                "arguments": [
                    constant(0, f"{prefix}:mode"),
                    constant(slot, f"{prefix}:slot"),
                    constant(primary, f"{prefix}:primary"),
                    constant(secondary, f"{prefix}:secondary"),
                ],
                "adapterStatus": "proven",
                "semanticId": "native-operation-013e-resource-slot-control",
            })
        bind_actions.append({
            "kind": "engineOperation",
            "callFileOffset": f"{prefix}:0050-start",
            "operationId": 80,
            "operationHex": "0x0050",
            "arguments": [constant(slot, f"{prefix}:slot")],
            "adapterStatus": "proven",
            "semanticId": "native-operation-0050-aseq-activity-control",
        })
        blocks.extend([
            {
                "id": bind,
                "endFileOffsetExclusive": wait,
                "actions": bind_actions,
                "sceneFieldComparisons": [],
                "frameFieldComparisons": [],
                "terminator": None,
                "successors": [wait],
            },
            {
                "id": wait,
                "endFileOffsetExclusive": poll,
                "actions": [{
                    "kind": "runtimeInterfaceCall",
                    "callFileOffset": f"{prefix}:scheduler",
                    "runtimeDispatch": {
                        "selector": 0,
                        "selectorHex": "0x0000",
                        "argumentCount": 1,
                        "arguments": [constant(1, f"{prefix}:tick")],
                    },
                    "resultBitTest": {
                        "kind": "runtimeResultBit",
                        "mask": 65536,
                        "maskHex": "0x00010000",
                    },
                    "runtimeCallKind": "resumable-scheduler-dispatch",
                    "behaviorStatus": "proven",
                    "abiStatus": "proven",
                    "semanticId": "native-scheduler-countdown",
                }, {
                    "kind": "coroutineContinuationTransfer",
                    "callFileOffset": f"{prefix}:yield",
                    "semanticId": "native-coroutine-continuation-transfer",
                }],
                "sceneFieldComparisons": [],
                "frameFieldComparisons": [],
                "terminator": None,
                "successors": [poll],
            },
            {
                "id": poll,
                "endFileOffsetExclusive": branch,
                "actions": [{
                    "kind": "engineOperation",
                    "callFileOffset": f"{prefix}:0050-poll",
                    "operationId": 80,
                    "operationHex": "0x0050",
                    "arguments": [constant(0xffffffff, f"{prefix}:poll-mode")],
                    "resultComparison": {
                        "kind": "operationResult",
                        "comparison": "equal",
                        "constant": 0,
                        "compareFileOffset": f"{prefix}:compare",
                        "resolvedBranch": {
                            "branchFileOffset": f"{prefix}:conditional",
                            "branchMnemonic": "bf",
                            "branchTargetFileOffset": wait,
                            "branchFallthroughFileOffset": next_block,
                            "comparisonTrueSuccessor": next_block,
                            "comparisonFalseSuccessor": wait,
                        },
                    },
                    "adapterStatus": "proven",
                    "semanticId": "native-operation-0050-aseq-activity-control",
                }],
                "sceneFieldComparisons": [],
                "frameFieldComparisons": [],
                "terminator": None,
                "successors": [branch],
            },
            {
                "id": branch,
                "endFileOffsetExclusive": next_block,
                "actions": [],
                "sceneFieldComparisons": [],
                "frameFieldComparisons": [],
                "terminator": {
                    "fileOffset": f"{prefix}:conditional",
                    "mnemonic": "bf",
                    "operands": wait,
                },
                "successors": [wait, next_block],
            },
        ])
    blocks.append({
        "id": complete,
        "endFileOffsetExclusive": complete,
        "actions": [],
        "sceneFieldComparisons": [],
        "frameFieldComparisons": [],
        "terminator": {"fileOffset": complete, "mnemonic": "rts"},
        "successors": [],
    })
    return {
        "id": entry,
        "endFileOffsetExclusive": complete,
        "entryBlock": blocks[0]["id"],
        "dialogueRegion": None,
        "frameArgumentBase": 8,
        "returnValue": None,
        "blocks": blocks,
    }


def build(routes: dict[str, Any]) -> dict[str, Any]:
    if routes.get("schema") != "new-yokosuka-native-activity-preview-routes-v1":
        raise ValueError("unsupported native activity preview route schema")
    programs = []
    cutscene_ids: set[str] = set()
    program_ids: set[str] = set()
    for route in routes.get("routes", []):
        cutscene_id = require_text(route.get("cutsceneId"), "preview cutscene ID")
        program_id = require_text(route.get("programId"), f"{cutscene_id} program ID")
        if cutscene_id in cutscene_ids or program_id in program_ids:
            raise ValueError(f"duplicate activity preview route {cutscene_id}/{program_id}")
        cutscene_ids.add(cutscene_id)
        program_ids.add(program_id)
        manifest_relative = require_text(
            route.get("manifest"), f"{cutscene_id} activity manifest"
        )
        manifest_path = PROJECT_ROOT / manifest_relative
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("schema") != "new-yokosuka-aseq-activity-pack-v1":
            raise ValueError(f"{cutscene_id}: unsupported activity manifest")
        requested_activities = (
            route.get("activities")
            if route.get("activities") is not None
            else [route.get("activity")]
        )
        if (
            not isinstance(requested_activities, list)
            or not requested_activities
            or any(not isinstance(item, dict) for item in requested_activities)
        ):
            raise ValueError(f"{cutscene_id}: preview activities are invalid")
        activities = [
            exact_activity(manifest, requested, cutscene_id)
            for requested in requested_activities
        ]
        bindings = [(
            requested["slot"],
            requested.get("binding", {}).get("primaryPointer"),
            requested.get("binding", {}).get("secondaryPointer"),
        ) for requested in requested_activities]
        sequence = len(activities) > 1
        entry_function = "$activity-sequence" if sequence else "$activity-preview"
        unique_bindings = [
            binding for binding in dict.fromkeys(bindings)
            if binding[1] is not None and binding[2] is not None
        ]
        evidence_activities = list({
            activity["activityId"]: activity for activity in activities
        }.values())
        programs.append({
            "id": program_id,
            "disc": manifest.get("source", {}).get("disc", 1),
            "area": require_text(route.get("area"), f"{cutscene_id} area").upper(),
            "entryFunction": entry_function,
            "functions": [activity_preview_function(bindings)],
            "scriptedInteractions": [],
            "operation013eStaticBindings": [{
                "slot": slot,
                "primaryPointer": primary,
                "secondaryPointer": secondary,
            } for slot, primary, secondary in unique_bindings],
            "preview": {
                "kind": (
                    "exact-auth-activity-sequence-v1"
                    if sequence
                    else "single-auth-activity-v1"
                ),
                "packageId": require_text(
                    route.get("packageId"), f"{cutscene_id} package ID"
                ),
                "worldId": require_text(
                    route.get("worldId"), f"{cutscene_id} world ID"
                ),
                **({
                    "activities": [{
                        "slot": slot,
                        **({"binding": {
                            "primaryPointer": primary,
                            "secondaryPointer": secondary,
                        }} if primary is not None else {
                            "binding": {
                                "kind": "map-embedded-slot",
                                "activityId": activity["activityId"],
                            },
                        }),
                        "activityId": activity["activityId"],
                    } for activity, (slot, primary, secondary) in zip(
                        activities, bindings, strict=True
                    )],
                } if sequence else {
                    "activity": {
                        "slot": bindings[0][0],
                        **({"binding": {
                            "primaryPointer": bindings[0][1],
                            "secondaryPointer": bindings[0][2],
                        }} if bindings[0][1] is not None else {
                            "binding": {
                                "kind": "map-embedded-slot",
                                "activityId": activities[0]["activityId"],
                            },
                        }),
                        "activityId": activities[0]["activityId"],
                    },
                }),
            },
            "evidence": [{
                "kind": "exact-activity-manifest",
                "path": manifest_relative,
                "sha256": sha256(manifest_path),
                "archiveMember": activity["archiveMember"],
                "activitySha256": activity["sha256"],
            } for activity in evidence_activities],
            "summary": {
                "functionCount": 1,
                "blockCount": len(activities) * 4 + 1,
                "actionCount": len(activities) * 4 + len(unique_bindings),
                "actionKinds": {
                    "engineOperation": len(activities) * 2 + len(unique_bindings),
                    "runtimeInterfaceCall": len(activities),
                    "coroutineContinuationTransfer": len(activities),
                },
            },
            "selector": {"cutsceneId": cutscene_id},
        })
    return {
        "schema": "new-yokosuka-native-activity-preview-program-pack-v1",
        "generatedBy": "tools/cutscenes/build_native_activity_preview_programs.py",
        "programs": programs,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--routes", type=Path, default=DEFAULT_ROUTES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = build(json.loads(args.routes.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"wrote {len(result['programs'])} activity preview program(s) to {args.output}")


if __name__ == "__main__":
    main()
