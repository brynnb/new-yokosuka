#!/usr/bin/env python3
"""Compile explicit AUTH selector previews into generic canonical programs."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from tools.cutscenes.native_cutscene_dependencies import (
    activity_start_slot, ordered_control_flow_calls,
)


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


def owner_activity_sequence(
    program: dict[str, Any], manifest: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Use the retained owner's exact embedded-resource selection and CFG."""
    if (program.get("disc") != manifest["source"]["disc"]
            or program.get("mapinfoSha256") != manifest["source"]["sha256"]):
        raise ValueError("activity sequence owner source changed")
    selection = program["authResourceSelection"]
    functions = {function["id"]: function for function in program["functions"]}
    stages = {stage["ownerCallFileOffset"]: stage for stage in selection["stages"]}
    stage_order = ordered_control_flow_calls(functions[program["entryFunction"]], set(stages))
    ordered_calls = []
    for stage_offset in stage_order:
        function_id = stages[stage_offset]["functionId"]
        calls = {call["callFileOffset"]: call for call in selection["ownerCalls"]
                 if call["functionId"] == function_id}
        # Compare against ALL original stage starts, not the compiler's own
        # selected list. Silent camera/effect tracks have no dialogue path.
        source_calls = {action["callFileOffset"]
                        for block in functions[function_id]["blocks"]
                        for action in block["actions"]
                        if activity_start_slot(action) is not None}
        if set(calls) != source_calls:
            raise ValueError(f"original script stage {function_id} activity coverage is incomplete: "
                             f"missing {sorted(source_calls - set(calls))}")
        order = ordered_control_flow_calls(functions[function_id], source_calls)
        ordered_calls.extend(calls[offset] for offset in order)
    if (len(ordered_calls) != len(selection["ownerCalls"])
            or {call["slot"] for call in ordered_calls} != set(selection["selectedSlots"])):
        raise ValueError("owner activity sequence does not cover its selected resources")
    requested = []
    for call in ordered_calls:
        action = next(action for block in functions[call["functionId"]]["blocks"]
                      for action in block["actions"] if action.get("callFileOffset") == call["callFileOffset"])
        if (action.get("operationHex") != "0x0050"
                or not action.get("arguments")
                or action["arguments"][0].get("kind") != "constant"
                or action["arguments"][0].get("value") != call["slot"]):
            raise ValueError("owner activity call does not match its source operation")
        activity = exact_activity(manifest, {"slot": call["slot"]}, program["id"])
        if (activity["sha256"] != call["resource"]["sha256"]
                or activity["byteLength"] != call["resource"]["byteLength"]):
            raise ValueError("owner activity resource changed")
        requested.append({"slot": call["slot"]})
    return requested, ordered_calls


def owner_named_audio_actions(
    program: dict[str, Any], owner_calls: list[dict[str, Any]],
) -> tuple[list[list[dict[str, Any]]], list[dict[str, Any]]]:
    """Retain named audio in the owner's presentation order, before its next AUTH.

    Project the same control-flow graph used for shots, not a guessed slot or
    sorted instruction address. Ambiguous paths and unrepresented trailing cues
    fail compilation instead of silently changing when music begins.
    """
    functions = {function["id"]: function for function in program["functions"]}
    strings = {item["pointer"]: item for item in program.get("staticStrings", [])}
    retained_strings = {}
    commands = {call["callFileOffset"]: [] for call in owner_calls}
    for function_id in dict.fromkeys(call["functionId"] for call in owner_calls):
        function = functions[function_id]
        calls = {call["callFileOffset"] for call in owner_calls if call["functionId"] == function_id}
        audio = {action["callFileOffset"]: action
                 for block in function["blocks"] for action in block["actions"]
                 if action.get("operationHex") == "0x015c"}
        order = ordered_control_flow_calls(function, calls | audio.keys())
        pending = []
        for offset in order:
            if offset in calls:
                commands[offset] = pending
                pending = []
                continue
            action = audio[offset]
            args = action.get("arguments", [])
            if (len(args) != 2 or args[0].get("kind") != "static-pointer"
                    or args[1].get("kind") != "constant" or args[1].get("value") != 0):
                raise ValueError(f"named audio arguments are not static at {offset}")
            name = strings.get(args[0].get("value"))
            if not name or not isinstance(name.get("value"), str) or not name["value"]:
                raise ValueError(f"named audio string is unavailable at {offset}")
            retained_strings[name["pointer"]] = copy.deepcopy(name)
            pending.append(copy.deepcopy(action))
        if pending:
            raise ValueError("named audio after the final selected activity requires an explicit boundary")
    return [commands[call["callFileOffset"]] for call in owner_calls], list(retained_strings.values())


def original_stage_sequence(program: dict[str, Any], manifest: dict[str, Any],
                            stage_functions: list[str]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Single-stage owners use the same full CFG projection as room stages."""
    if (program["disc"] != manifest["source"]["disc"]
            or program["mapinfoSha256"] != manifest["source"]["sha256"]):
        raise ValueError("original stage source changed")
    functions = {fn["id"]: fn for fn in program["functions"]}
    calls = []
    for function_id in stage_functions:
        fn = functions[function_id]
        starts = {action["callFileOffset"]: action for block in fn["blocks"]
                  for action in block["actions"] if activity_start_slot(action) is not None}
        for offset in ordered_control_flow_calls(fn, set(starts)):
            slot = activity_start_slot(starts[offset])
            activity = exact_activity(manifest, {"slot": slot}, program["id"])
            calls.append({"slot": slot, "callFileOffset": offset, "functionId": function_id,
                          "resource": {"sha256": activity["sha256"], "byteLength": activity["byteLength"]}})
    if not calls:
        raise ValueError("original stages contain no activity starts")
    return [{"slot": call["slot"]} for call in calls], calls


def startup_sound_actions(
    program: dict[str, Any],
    function_id: str,
    expected_offsets: list[str],
    routes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Retain reviewed, unconditional owner audio before its first timing boundary.

    A command lookup is not a timeline. Follow the entry's control-flow edges,
    stopping at branches, calls, waits or AUTH playback, rather than sorting
    file offsets and accidentally moving conditional/later music to startup.
    The reviewed offset list makes an incomplete extraction fail closed.
    """
    owner = next(fn for fn in program["functions"] if fn["id"] == function_id)
    blocks = {block["id"]: block for block in owner["blocks"]}
    block_id = owner["entryBlock"]
    visited = set()
    commands = []
    boundary = False
    while block_id not in visited and not boundary:
        visited.add(block_id)
        block = blocks[block_id]
        for action in block["actions"]:
            arguments = action.get("arguments", [])
            if action["kind"] in {
                "directCall", "childCoroutineLaunch", "runtimeInterfaceCall",
                "coroutineContinuationTransfer",
            } or (
                action.get("semanticId") == "native-operation-0050-aseq-activity-control"
                and len(arguments) == 1
            ):
                boundary = True
                break
            if action.get("semanticId") != "sound-command-dispatch":
                continue
            if len(arguments) != 3 or any(arg.get("kind") != "constant" for arg in arguments):
                raise ValueError("startup sound command must have three constant arguments")
            word, *args = [require_word(arg["value"], "sound argument") for arg in arguments]
            command_hex = word.to_bytes(4, "little").hex()
            matches = [route for route in routes if (
                route["commandHex"].lower() == command_hex
                and route["exactArguments"] == args
                and action["callFileOffset"] in route["callFileOffsets"]
                and route["kind"] in {"music", "native-control-no-output"}
            )]
            if len(matches) != 1:
                raise ValueError(f"unresolved startup sound command at {action['callFileOffset']}")
            commands.append(copy.deepcopy(action))
        if len(block["successors"]) != 1:
            break
        block_id = block["successors"][0]
    if not expected_offsets or [action["callFileOffset"] for action in commands] != expected_offsets:
        raise ValueError("reviewed startup sound commands are not an unconditional owner prefix")
    return commands


def activity_preview_function(
    activities: list[tuple[int, int | None, int | None]],
    startup_commands: list[dict[str, Any]] | None = None,
    activity_commands: list[list[dict[str, Any]]] | None = None,
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
        bind_actions = copy.deepcopy(startup_commands or []) if index == 0 else []
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
        bind_actions.extend(copy.deepcopy(activity_commands[index]) if activity_commands else [])
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


def activity_start_sound_actions(activity: dict[str, Any], routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    commands = []
    for cue in activity.get("nativeSoundCommandCues", []):
        # Only frame-zero callbacks can be lifted immediately before AUTH start.
        # Fail instead of silently moving future timed sound to the wrong shot.
        if cue.get("frame") != 0:
            raise ValueError(f"{activity['activityId']}: timed callback sound requires frame execution")
        action = cue["action"]
        arguments = action.get("arguments", [])
        if (action.get("semanticId") != "sound-command-dispatch" or len(arguments) != 3
                or any(arg.get("kind") != "constant" for arg in arguments)):
            raise ValueError("activity sound command must have three constant arguments")
        word, *args = [require_word(arg["value"], "sound argument") for arg in arguments]
        matches = [route for route in routes if (
            route["commandHex"].lower() == word.to_bytes(4, "little").hex()
            and route["exactArguments"] == args
            and action["callFileOffset"] in route["callFileOffsets"]
            and route["kind"] in {"music", "native-control-no-output"}
        )]
        if len(matches) != 1:
            raise ValueError(f"unresolved activity sound command at {action['callFileOffset']}")
        commands.append(copy.deepcopy(action))
    return commands


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
        sequence_evidence = []
        owner_audio_commands = []
        static_strings = []
        if stages := route.get("originalStages"):
            if "activities" in route or "activity" in route or "ownerSequence" in route:
                raise ValueError(f"{cutscene_id}: original stages cannot have a second activity order")
            owner_path = PROJECT_ROOT / stages["program"]
            owner_program = json.loads(owner_path.read_text())
            requested_activities, owner_calls = original_stage_sequence(owner_program, manifest, stages["functions"])
            sequence_evidence.append({"kind": "owner-control-flow-activity-sequence", "path": stages["program"],
                "sha256": sha256(owner_path), "mapinfoSha256": owner_program["mapinfoSha256"],
                "stageFunctions": stages["functions"], "calls": owner_calls})
        if owner_relative := route.get("ownerSequence"):
            if "activities" in route or "activity" in route:
                raise ValueError(f"{cutscene_id}: owner sequence cannot have a second activity order")
            owner_path = PROJECT_ROOT / owner_relative
            owner_program = json.loads(owner_path.read_text())
            if owner_program["area"] != route["area"]:
                raise ValueError(f"{cutscene_id}: activity sequence owner area changed")
            requested_activities, owner_calls = owner_activity_sequence(owner_program, manifest)
            owner_audio_commands, static_strings = owner_named_audio_actions(owner_program, owner_calls)
            sequence_evidence.append({
                "kind": "owner-control-flow-activity-sequence",
                "path": owner_relative,
                "sha256": sha256(owner_path),
                "mapinfoSha256": owner_program["mapinfoSha256"],
                "calls": owner_calls,
            })
        if original_relative := route.get("originalStageEvidence"):
            original_path = PROJECT_ROOT / original_relative
            original = json.loads(original_path.read_text())
            if original["source"]["mapinfoSha256"] != manifest["source"]["sha256"]:
                raise ValueError(f"{cutscene_id}: original stage evidence source changed")
            functions = {fn["id"]: fn for fn in [original["function"], *original.get("supportingFunctions", [])]}
            stage_ids = (route["originalStages"]["functions"] if "originalStages" in route
                         else [stage["functionId"] for stage in owner_program["authResourceSelection"]["stages"]])
            original_calls = [(function_id, action["callFileOffset"], activity_start_slot(action))
                              for function_id in stage_ids for block in functions[function_id]["blocks"]
                              for action in block["actions"] if activity_start_slot(action) is not None]
            selected_calls = [(call["functionId"], call["callFileOffset"], call["slot"]) for call in owner_calls]
            if sorted(original_calls) != sorted(selected_calls):
                raise ValueError(f"{cutscene_id}: incomplete original script stage, including silent tracks")
            sequence_evidence.append({"kind": "original-script-stage-coverage", "path": original_relative,
                "sha256": sha256(original_path), "mapinfoSha256": original["source"]["mapinfoSha256"],
                "stageFunctions": stage_ids, "completionBoundary": {"kind": "after-original-stage-return",
                    "completedStageFunction": stage_ids[-1]}})
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
        startup_commands = []
        startup_evidence = []
        if startup := route.get("startupSound"):
            owner_path = PROJECT_ROOT / startup["program"]
            owner_program = json.loads(owner_path.read_text())
            if (
                owner_program["area"] != route["area"]
                or owner_program["disc"] != manifest["source"]["disc"]
                or owner_program["mapinfoSha256"] != startup["mapinfoSha256"]
            ):
                raise ValueError(f"{cutscene_id}: startup sound owner source changed")
            startup_commands = startup_sound_actions(
                owner_program, startup["function"], startup["callFileOffsets"],
                manifest.get("ownerAudioCommands", []),
            )
            startup_evidence.append({
                "kind": "unconditional-owner-startup-sound",
                **startup,
                "sha256": sha256(owner_path),
            })
        activity_commands = [activity_start_sound_actions(
            activity, manifest.get("ownerAudioCommands", []),
        ) for activity in activities]
        if owner_audio_commands:
            activity_commands = [owner + callback for owner, callback in zip(
                owner_audio_commands, activity_commands, strict=True,
            )]
        function = activity_preview_function(bindings, startup_commands, activity_commands)
        action_kinds = Counter(
            action["kind"] for block in function["blocks"] for action in block["actions"]
        )
        programs.append({
            "id": program_id,
            "disc": manifest.get("source", {}).get("disc", 1),
            "area": require_text(route.get("area"), f"{cutscene_id} area").upper(),
            "entryFunction": entry_function,
            "functions": [function],
            **({"staticStrings": static_strings} if static_strings else {}),
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
            } for activity in evidence_activities] + sequence_evidence + startup_evidence,
            "summary": {
                "functionCount": 1,
                "blockCount": len(activities) * 4 + 1,
                "actionCount": sum(action_kinds.values()),
                "actionKinds": dict(action_kinds),
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
