#!/usr/bin/env python3
"""Package exact native event-program closures for the browser runtime.

The complete event IR is intentionally a local research artifact. This tool
selects declared entry functions and retains every statically reachable direct
call and child-coroutine target from the same MAPINFO program. It does not
prune branches, inline calls, reorder actions, or infer runtime targets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, deque
from pathlib import Path
from typing import Any, Callable

from tools.cutscenes.native_cutscene_dependencies import operation_013c_archive_pairs


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_ROUTES = PROJECT_ROOT / "tools/data/native-event-program-routes.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "play/data/events/nativeEventPrograms.generated.json"
)
DEFAULT_RUNTIME_INDEX = (
    PROJECT_ROOT
    / "play/data/events/nativeEventProgramIndex.generated.json"
)
DEFAULT_RUNTIME_ASSETS = (
    PROJECT_ROOT
    / "public/data/native-event-programs"
)
DEFAULT_COMPILED_PROGRAMS = (
    PROJECT_ROOT
    / "play/assets/introduction/op00/cutscene-program.generated.json",
    PROJECT_ROOT
    / "play/assets/introduction/op02/cutscene-program.generated.json",
)
DEFAULT_ACTIVITY_PREVIEW_PROGRAMS = (
    PROJECT_ROOT
    / "play/data/events/nativeActivityPreviewPrograms.generated.json"
)

STATIC_TARGET_ACTIONS = frozenset({
    "directCall",
    "childCoroutineLaunch",
})


def action_target_file_offsets(action: dict[str, Any]) -> list[str]:
    target = action.get("targetFileOffset")
    if target:
        return [target]
    targets = action.get("targetFileOffsets")
    if (
        action.get("kind") == "childCoroutineLaunch"
        and isinstance(targets, list)
        and targets
        and all(isinstance(item, str) and item for item in targets)
    ):
        return targets
    return []


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unique_map(
    event_ir: dict[str, Any],
    route: dict[str, Any],
) -> dict[str, Any]:
    matches = [
        item
        for item in event_ir["maps"]
        if (
            item["disc"] == route["disc"]
            and item["area"] == route["area"]
        )
    ]
    if len(matches) != 1:
        raise ValueError(
            f"{route['id']}: expected one disc {route['disc']} "
            f"{route['area']} event program, found {len(matches)}"
        )
    result = matches[0]
    expected_hash = route.get("mapinfoSha256")
    if expected_hash and result["mapinfoSha256"] != expected_hash:
        raise ValueError(f"{route['id']}: MAPINFO hash changed")
    return result


def static_program_closure(
    source_map: dict[str, Any],
    entry_function: str,
    additional_entry_functions: tuple[str, ...] | list[str] = (),
) -> tuple[list[dict[str, Any]], Counter[str]]:
    by_id = {item["id"]: item for item in source_map["functions"]}
    if len(by_id) != len(source_map["functions"]):
        raise ValueError("native event source contains duplicate functions")
    if entry_function not in by_id:
        raise ValueError(
            f"native event entry function is absent: {entry_function}"
        )

    pending = deque([entry_function, *additional_entry_functions])
    reached: set[str] = set()
    edge_kinds: Counter[str] = Counter()
    while pending:
        function_id = pending.popleft()
        if function_id in reached:
            continue
        function = by_id.get(function_id)
        if function is None:
            raise ValueError(
                f"static target is outside its MAPINFO program: {function_id}"
            )
        reached.add(function_id)
        for block in function.get("blocks", []):
            for action in block.get("actions", []):
                kind = action.get("kind")
                if kind not in STATIC_TARGET_ACTIONS:
                    continue
                targets = action_target_file_offsets(action)
                if not targets:
                    raise ValueError(
                        f"{function_id}: {kind} has no exact static target"
                    )
                edge_kinds[kind] += len(targets)
                pending.extend(targets)

    functions = [
        function
        for function in source_map["functions"]
        if function["id"] in reached
    ]
    if len(functions) != len(reached):
        raise ValueError("native event closure lost a reached function")
    return functions, edge_kinds


def reachable_function_ids(
    route: dict[str, Any],
    functions: list[dict[str, Any]],
    entry_function: str,
    route_kind: str,
) -> set[str]:
    by_id = {item["id"]: item for item in functions}
    pending = deque([entry_function])
    reached: set[str] = set()
    while pending:
        function_id = pending.popleft()
        if function_id in reached:
            continue
        function = by_id.get(function_id)
        if function is None:
            raise ValueError(
                f"{route['id']}: {route_kind} target "
                f"{function_id} is outside its static closure"
            )
        reached.add(function_id)
        for block in function.get("blocks", []):
            for action in block.get("actions", []):
                if action.get("kind") not in STATIC_TARGET_ACTIONS:
                    continue
                targets = action_target_file_offsets(action)
                if not targets:
                    raise ValueError(
                        f"{route['id']}: {route_kind} "
                        f"{function_id} has a targetless static edge"
                    )
                pending.extend(targets)
    return reached


def scripted_interactions(
    route: dict[str, Any],
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in functions}

    result = []
    identities: set[tuple[str, str]] = set()
    for declaration in route.get("scriptedInteractions", []):
        actor_code = declaration.get("actorCode")
        object_tag = declaration.get("objectTag")
        entry_function = declaration.get("entryFunction")
        dialogue_entry_function = declaration.get(
            "dialogueEntryFunction",
            entry_function,
        )
        target_kind = "object" if object_tag is not None else "actor"
        target_code = object_tag if object_tag is not None else actor_code
        identity = (target_kind, target_code)
        if (
            not isinstance(actor_code, str)
            or len(actor_code) != 4
            or (
                object_tag is not None
                and (
                    not isinstance(object_tag, str)
                    or len(object_tag) != 4
                )
            )
            or not entry_function
            or not dialogue_entry_function
            or identity in identities
        ):
            raise ValueError(
                f"{route['id']}: scripted interaction is invalid or duplicated"
            )
        identities.add(identity)
        if entry_function not in by_id:
            raise ValueError(
                f"{route['id']}: scripted interaction entry "
                f"{entry_function} is outside its static closure"
            )
        reached = reachable_function_ids(
            route,
            functions,
            entry_function,
            "scripted interaction",
        )
        if dialogue_entry_function not in reached:
            raise ValueError(
                f"{route['id']}: scripted interaction dialogue entry "
                f"{dialogue_entry_function} is not statically reachable "
                f"from control entry {entry_function}"
            )
        dialogue_region = by_id[dialogue_entry_function].get(
            "dialogueRegion",
        )
        if (
            actor_code not in (dialogue_region or {}).get("actorTags", [])
            or not (dialogue_region or {}).get("voiceIds")
        ):
            raise ValueError(
                f"{route['id']}: scripted interaction dialogue entry "
                f"{dialogue_entry_function} "
                f"has no exact {actor_code} dialogue region"
            )
        result.append({
            **declaration,
            "voiceIds": dialogue_region["voiceIds"],
        })
    return result


def automatic_events(
    route: dict[str, Any],
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id = {item["id"]: item for item in functions}
    result = []
    identities: set[str] = set()
    for declaration in route.get("automaticEvents", []):
        event_id = declaration.get("id")
        actor_code = declaration.get("actorCode")
        gate_entry = declaration.get("gateEntryFunction")
        matched_value = declaration.get("matchedReturnValue")
        entry_function = declaration.get("entryFunction")
        dialogue_entry = declaration.get("dialogueEntryFunction")
        if (
            not isinstance(event_id, str)
            or not event_id
            or event_id in identities
            or not isinstance(actor_code, str)
            or len(actor_code) != 4
            or not isinstance(gate_entry, str)
            or not isinstance(entry_function, str)
            or not isinstance(dialogue_entry, str)
            or not isinstance(matched_value, int)
        ):
            raise ValueError(
                f"{route['id']}: automatic event is invalid or duplicated"
            )
        identities.add(event_id)
        gate_function = by_id.get(gate_entry)
        if gate_function is None or gate_function.get("returnValue") is None:
            raise ValueError(
                f"{route['id']}: automatic event gate {gate_entry} "
                "has no exact return value"
            )
        reached = reachable_function_ids(
            route,
            functions,
            entry_function,
            "automatic event",
        )
        if dialogue_entry not in reached:
            raise ValueError(
                f"{route['id']}: automatic event dialogue entry "
                f"{dialogue_entry} is not statically reachable from "
                f"control entry {entry_function}"
            )
        dialogue_region = by_id[dialogue_entry].get("dialogueRegion")
        if (
            actor_code not in (dialogue_region or {}).get("actorTags", [])
            or not (dialogue_region or {}).get("voiceIds")
        ):
            raise ValueError(
                f"{route['id']}: automatic event dialogue entry "
                f"{dialogue_entry} has no exact {actor_code} dialogue region"
            )
        result.append({
            **declaration,
            "voiceIds": dialogue_region["voiceIds"],
        })
    return result


def room_controllers(
    route: dict[str, Any],
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Validate exact persistent room-controller declarations.

    These declarations preserve native ownership and dispatch provenance. They
    do not make a controller executable or reinterpret unresolved operations.
    """
    by_id = {item["id"]: item for item in functions}
    result = []
    identities: set[str] = set()
    for declaration in route.get("roomControllers", []):
        controller_id = declaration.get("id")
        entry_function = declaration.get("entryFunction")
        launch = declaration.get("launch")
        poll = declaration.get("poll")
        dispatches = declaration.get("dispatches")
        if (
            not isinstance(controller_id, str)
            or not controller_id
            or controller_id in identities
            or not isinstance(entry_function, str)
            or entry_function not in by_id
            or not isinstance(launch, dict)
            or not isinstance(poll, dict)
            or not isinstance(dispatches, list)
            or not dispatches
        ):
            raise ValueError(
                f"{route['id']}: room controller is invalid or duplicated"
            )
        identities.add(controller_id)
        reached = reachable_function_ids(
            route,
            functions,
            entry_function,
            "room controller",
        )
        poll_function = poll.get("functionFileOffset")
        poll_call = poll.get("callFileOffset")
        poll_operation = poll.get("operationHex")
        poll_selector = poll.get("selector")
        function = by_id.get(poll_function)
        matching_poll_actions = [
            action
            for block in (function or {}).get("blocks", [])
            for action in block.get("actions", [])
            if (
                action.get("kind") == "engineOperation"
                and action.get("callFileOffset") == poll_call
                and action.get("operationHex") == poll_operation
                and action.get("arguments", [{}])[0].get("value")
                == (poll_selector & 0xffffffff)
            )
        ]
        if len(matching_poll_actions) != 1:
            raise ValueError(
                f"{route['id']}: room controller poll is not exact"
            )
        for dispatch in dispatches:
            target = dispatch.get("targetFunction")
            if target is not None and target not in reached:
                raise ValueError(
                    f"{route['id']}: room controller dispatch target "
                    f"{target} is not reachable from {entry_function}"
                )
        result.append(declaration)
    return result


def event_cameras(
    route: dict[str, Any],
    catalog_loader: Callable[[str], dict[str, Any]] | None,
) -> dict[str, Any] | None:
    declaration = route.get("eventCameras")
    if declaration is None:
        return None
    if not isinstance(declaration, dict) or catalog_loader is None:
        raise ValueError(
            f"{route['id']}: event-camera catalog loader is unavailable"
        )
    catalog_path = declaration.get("catalog")
    if not isinstance(catalog_path, str) or not catalog_path:
        raise ValueError(
            f"{route['id']}: event-camera catalog path is invalid"
        )
    catalog = catalog_loader(catalog_path)
    if catalog.get("schema") != "new-yokosuka-event-camera-catalog-v1":
        raise ValueError(
            f"{route['id']}: event-camera catalog schema is unsupported"
        )
    if catalog.get("mapinfoSha256") != route.get("mapinfoSha256"):
        raise ValueError(
            f"{route['id']}: event-camera catalog MAPINFO hash changed"
        )
    numbers = declaration.get("cameraNumbers")
    if (
        not isinstance(numbers, list)
        or not numbers
        or any(not isinstance(value, int) or value < 0 for value in numbers)
        or len(set(numbers)) != len(numbers)
    ):
        raise ValueError(
            f"{route['id']}: event-camera number declaration is invalid"
        )
    records_by_number = {
        record.get("cameraNumber"): record
        for record in catalog.get("records", [])
    }
    missing = [number for number in numbers if number not in records_by_number]
    if missing:
        raise ValueError(
            f"{route['id']}: event-camera records are missing: {missing}"
        )
    return {
        "catalog": catalog_path,
        "mapinfoSha256": catalog["mapinfoSha256"],
        "records": [records_by_number[number] for number in numbers],
        "evidence": declaration.get("evidence", []),
    }


def static_strings(route: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    pointers: set[int] = set()
    for item in route.get("staticStrings", []):
        pointer = item.get("pointer")
        value = item.get("value")
        source_offset = item.get("sourceFileOffset")
        if (
            not isinstance(pointer, int)
            or pointer < 0
            or pointer in pointers
            or not isinstance(value, str)
            or not value
            or "\0" in value
            or not isinstance(source_offset, str)
            or not source_offset.startswith("0x")
        ):
            raise ValueError(
                f"{route['id']}: static string declaration is invalid "
                f"or duplicated"
            )
        pointers.add(pointer)
        result.append({
            "pointer": pointer,
            "value": value,
            "sourceFileOffset": source_offset,
        })
    return result


def static_vectors(route: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    pointers: set[int] = set()
    for item in route.get("staticVectors", []):
        pointer = item.get("pointer")
        words = item.get("words")
        source_offset = item.get("sourceFileOffset")
        if (
            not isinstance(pointer, int)
            or pointer < 0
            or pointer in pointers
            or not isinstance(words, list)
            or len(words) != 3
            or any(
                not isinstance(word, int) or word < 0 or word > 0xffffffff
                for word in words
            )
            or not isinstance(source_offset, str)
            or not source_offset.startswith("0x")
        ):
            raise ValueError(
                f"{route['id']}: static vector declaration is invalid "
                f"or duplicated"
            )
        pointers.add(pointer)
        result.append({
            "pointer": pointer,
            "words": words,
            "sourceFileOffset": source_offset,
        })
    return result


def operation_013c_static_record_pairs(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    pairs: dict[tuple[int, int], dict[str, Any]] = {}
    action_rows = [
        (function, action)
        for function in functions
        for block in function.get("blocks", [])
        for action in block.get("actions", [])
    ]
    actions = [action for _function, action in action_rows]

    def retain(argument2: dict, argument3: dict, call_offset: str) -> None:
        if any(
            argument.get("kind") != "static-pointer"
            for argument in (argument2, argument3)
        ):
            return
        key = (argument2["value"], argument3["value"])
        pair = pairs.setdefault(key, {
            "argument2": key[0],
            "argument3": key[1],
            "callFileOffsets": [],
        })
        pair["callFileOffsets"].append(call_offset)

    required_parameter_pairs: dict[str, set[tuple[int, int]]] = {}
    for function in functions:
        base = function.get("frameArgumentBase")
        if not isinstance(base, int):
            continue
        for block in function.get("blocks", []):
            for action in block.get("actions", []):
                arguments = action.get("arguments", [])
                if (
                    action.get("semanticId")
                    == "native-operation-013c-container-control"
                    and len(arguments) == 4
                    and [argument.get("value") for argument in arguments[:2]]
                    == [0, 0]
                    and all(
                        argument.get("kind") == "frame-field"
                        for argument in arguments[2:]
                    )
                ):
                    indices = tuple(
                        (argument["offset"] - base) // 4
                        for argument in arguments[2:]
                    )
                    if all(index >= 0 for index in indices):
                        required_parameter_pairs.setdefault(
                            function["id"], set(),
                        ).add(indices)

    for action in actions:
        arguments = action.get("arguments", [])
        if (
            action.get("semanticId")
            == "native-operation-013c-container-control"
            and len(arguments) == 4
            and [argument.get("value") for argument in arguments[:2]] == [0, 0]
        ):
            retain(arguments[2], arguments[3], action["callFileOffset"])
    changed = True
    while changed:
        changed = False
        for owner, action in action_rows:
            if action.get("kind") != "directCall":
                continue
            arguments = action.get("arguments", [])
            required = required_parameter_pairs.get(
                action.get("targetFileOffset"), set(),
            )
            for indices in tuple(required):
                if not all(index < len(arguments) for index in indices):
                    continue
                selected = [arguments[index] for index in indices]
                if all(item.get("kind") == "static-pointer" for item in selected):
                    retain(selected[0], selected[1], action["callFileOffset"])
                    continue
                owner_base = owner.get("frameArgumentBase")
                forwarded = []
                for item in selected:
                    if item.get("kind") == "caller-argument":
                        forwarded.append(item.get("index"))
                    elif (
                        item.get("kind") == "frame-field"
                        and isinstance(owner_base, int)
                        and (item.get("offset", -1) - owner_base) % 4 == 0
                    ):
                        forwarded.append(
                            (item["offset"] - owner_base) // 4
                        )
                    else:
                        forwarded.append(None)
                if all(isinstance(index, int) and index >= 0 for index in forwarded):
                    owner_pairs = required_parameter_pairs.setdefault(
                        owner["id"], set(),
                    )
                    forwarded_pair = tuple(forwarded)
                    if forwarded_pair not in owner_pairs:
                        owner_pairs.add(forwarded_pair)
                        changed = True
    return [pairs[key] for key in sorted(pairs)]


def operation_013e_static_bindings(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    bindings: dict[tuple[int, int, int], dict[str, Any]] = {}
    for function in functions:
        for block in function.get("blocks", []):
            for action in block.get("actions", []):
                arguments = action.get("arguments", [])
                if (
                    action.get("semanticId")
                    != "native-operation-013e-resource-slot-control"
                    or len(arguments) != 4
                    or arguments[0].get("kind") != "constant"
                    or arguments[0].get("value") != 0
                    or arguments[1].get("kind") != "constant"
                    or not isinstance(arguments[1].get("value"), int)
                    or any(
                        argument.get("kind") != "static-pointer"
                        for argument in arguments[2:]
                    )
                ):
                    continue
                key = (
                    arguments[1]["value"],
                    arguments[2]["value"],
                    arguments[3]["value"],
                )
                binding = bindings.setdefault(key, {
                    "slot": key[0],
                    "primaryPointer": key[1],
                    "secondaryPointer": key[2],
                    "callFileOffsets": [],
                })
                binding["callFileOffsets"].append(action["callFileOffset"])
    return [bindings[key] for key in sorted(bindings)]


def direct_entry_state(
    route: dict[str, Any],
    direct_entries: list[str],
) -> dict[str, Any]:
    declarations = route.get("directEntryState", {})
    if not isinstance(declarations, dict):
        raise ValueError(f"{route['id']}: direct-entry state must be an object")
    unknown_entries = set(declarations) - set(direct_entries)
    if unknown_entries:
        raise ValueError(
            f"{route['id']}: direct-entry state targets an unreviewed entry: "
            + ", ".join(sorted(unknown_entries))
        )
    result: dict[str, Any] = {}
    for entry, declaration in declarations.items():
        if not isinstance(declaration, dict):
            raise ValueError(
                f"{route['id']}: direct-entry state for {entry} is invalid"
            )
        fields = declaration.get("sceneFields", [])
        object_vectors = declaration.get("objectBaseVectors", [])
        operation_001c_objects = declaration.get("operation001cObjects", [])
        evidence = declaration.get("evidence", [])
        seen_offsets: set[int] = set()
        if (
            not isinstance(fields, list)
            or not isinstance(object_vectors, list)
            or not isinstance(operation_001c_objects, list)
            or (not fields and not object_vectors and not operation_001c_objects)
            or not isinstance(evidence, list)
            or not evidence
            or any(not isinstance(item, str) or not item for item in evidence)
        ):
            raise ValueError(
                f"{route['id']}: direct-entry state for {entry} lacks exact evidence"
            )
        for field in fields:
            if not isinstance(field, dict):
                raise ValueError(
                    f"{route['id']}: direct-entry scene field for {entry} is invalid"
                )
            offset = field.get("offset")
            width = field.get("width")
            value = field.get("value")
            maximum = (1 << (width * 8)) - 1 if width in (1, 2, 4) else -1
            if (
                not isinstance(offset, int)
                or offset < 0
                or offset in seen_offsets
                or width not in (1, 2, 4)
                or not isinstance(value, int)
                or value < 0
                or value > maximum
            ):
                raise ValueError(
                    f"{route['id']}: direct-entry scene field for {entry} is invalid"
                )
            seen_offsets.add(offset)
        seen_tags: set[str] = set()
        for item in object_vectors:
            tag = item.get("objectTag") if isinstance(item, dict) else None
            vector = item.get("vector") if isinstance(item, dict) else None
            if (
                not isinstance(tag, str)
                or len(tag) != 4
                or tag in seen_tags
                or not isinstance(vector, list)
                or len(vector) != 3
                or any(
                    not isinstance(value, (int, float))
                    or isinstance(value, bool)
                    or not math.isfinite(value)
                    for value in vector
                )
            ):
                raise ValueError(
                    f"{route['id']}: direct-entry object vector for {entry} is invalid"
                )
            seen_tags.add(tag)
        operation_001c_tags: set[str] = set()
        for item in operation_001c_objects:
            tag = item.get("objectTag") if isinstance(item, dict) else None
            present = item.get("present") if isinstance(item, dict) else None
            direct_words = item.get("directWords") if isinstance(item, dict) else None
            associated_words = (
                item.get("associatedWords") if isinstance(item, dict) else None
            )
            triples = [
                words for words in (direct_words, associated_words)
                if words is not None
            ]
            if (
                not isinstance(tag, str)
                or len(tag) != 4
                or tag in operation_001c_tags
                or not isinstance(present, bool)
                or (present and not triples)
                or any(
                    not isinstance(words, list)
                    or len(words) != 3
                    or any(
                        not isinstance(word, int)
                        or isinstance(word, bool)
                        or word < 0
                        or word > 0xffffffff
                        for word in words
                    )
                    for words in triples
                )
            ):
                raise ValueError(
                    f"{route['id']}: direct-entry operation 0x001c object "
                    f"for {entry} is invalid"
                )
            operation_001c_tags.add(tag)
        result[entry] = {
            "sceneFields": fields,
            **(
                {"objectBaseVectors": object_vectors}
                if object_vectors
                else {}
            ),
            **(
                {"operation001cObjects": operation_001c_objects}
                if operation_001c_objects
                else {}
            ),
            "evidence": evidence,
        }
    return result


def build_pack(
    event_ir: dict[str, Any],
    route_manifest: dict[str, Any],
    *,
    event_ir_sha256: str | None = None,
    camera_catalog_loader: Callable[[str], dict[str, Any]] | None = None,
    compiled_programs: tuple[dict[str, Any], ...] | list[dict[str, Any]] = (),
    activity_preview_programs: tuple[dict[str, Any], ...] | list[dict[str, Any]] = (),
) -> dict[str, Any]:
    if event_ir.get("schema") != "new-yokosuka-native-event-ir-v1":
        raise ValueError("unsupported native event IR schema")
    if (
        route_manifest.get("schema")
        != "new-yokosuka-native-event-program-routes-v1"
    ):
        raise ValueError("unsupported native event route manifest schema")

    programs = []
    route_ids: set[str] = set()
    for route in route_manifest.get("routes", []):
        route_id = route.get("id")
        if not route_id or route_id in route_ids:
            raise ValueError(f"native event route is missing or duplicated: {route_id}")
        route_ids.add(route_id)
        source_map = unique_map(event_ir, route)
        gate_entries = [
            event.get("gateEntryFunction")
            for event in route.get("automaticEvents", [])
        ]
        controller_entries = [
            controller.get("entryFunction")
            for controller in route.get("roomControllers", [])
        ]
        functions, edge_kinds = static_program_closure(
            source_map,
            route["entryFunction"],
            [*gate_entries, *controller_entries],
        )
        direct_entries = route.get("activityOwnerFunctions", [])
        function_ids = {function["id"] for function in functions}
        if (
            not isinstance(direct_entries, list)
            or any(
                not isinstance(entry, str) or entry not in function_ids
                for entry in direct_entries
            )
        ):
            raise ValueError(
                f"{route_id}: direct activity owner entry is outside "
                "its static closure"
            )
        interactions = scripted_interactions(route, functions)
        entry_state = direct_entry_state(route, direct_entries)
        automatic = automatic_events(route, functions)
        controllers = room_controllers(route, functions)
        camera_records = event_cameras(route, camera_catalog_loader)
        strings = static_strings(route)
        vectors = static_vectors(route)
        blocks = [
            block
            for function in functions
            for block in function.get("blocks", [])
        ]
        actions = [
            action
            for block in blocks
            for action in block.get("actions", [])
        ]
        action_kinds = Counter(action["kind"] for action in actions)
        operation_013c_pairs = operation_013c_static_record_pairs(functions)
        operation_013c_archives = operation_013c_archive_pairs(functions)
        operation_013e_bindings = operation_013e_static_bindings(functions)
        programs.append({
            "id": route_id,
            "disc": route["disc"],
            "area": route["area"],
            "mapinfoSha256": source_map["mapinfoSha256"],
            "entryFunction": route["entryFunction"],
            **({"directEntries": direct_entries} if direct_entries else {}),
            **({"directEntryState": entry_state} if entry_state else {}),
            "scriptedInteractions": interactions,
            **({"automaticEvents": automatic} if automatic else {}),
            **({"roomControllers": controllers} if controllers else {}),
            **(
                {"motionBanks": route["motionBanks"]}
                if route.get("motionBanks")
                else {}
            ),
            **({"eventCameras": camera_records} if camera_records else {}),
            **({"staticStrings": strings} if strings else {}),
            **({"staticVectors": vectors} if vectors else {}),
            **(
                {"operation013cStaticRecordPairs": operation_013c_pairs}
                if operation_013c_pairs
                else {}
            ),
            **(
                {"operation013cArchivePairs": operation_013c_archives}
                if operation_013c_archives
                else {}
            ),
            **(
                {"operation013eStaticBindings": operation_013e_bindings}
                if operation_013e_bindings
                else {}
            ),
            "evidence": route.get("evidence", []),
            "summary": {
                "functionCount": len(functions),
                "blockCount": len(blocks),
                "actionCount": len(actions),
                "actionKinds": dict(sorted(action_kinds.items())),
                "staticTargetEdges": dict(sorted(edge_kinds.items())),
            },
            "functions": functions,
        })

    for artifact in compiled_programs:
        if artifact.get("schema") != "new-yokosuka-native-cutscene-program-v1":
            raise ValueError("unsupported compiled native cutscene program schema")
        program_id = artifact.get("id")
        compile_result = artifact.get("compile")
        functions = artifact.get("functions")
        entry_function = artifact.get("entryFunction")
        if (
            not isinstance(program_id, str)
            or not program_id
            or program_id in route_ids
            or compile_result != {"status": "compiled", "blockers": []}
            or not isinstance(functions, list)
            or not functions
            or not isinstance(entry_function, str)
            or entry_function not in {function.get("id") for function in functions}
        ):
            raise ValueError(
                f"compiled native cutscene program is invalid or duplicated: "
                f"{program_id}"
            )
        route_ids.add(program_id)
        programs.append({
            key: value
            for key, value in artifact.items()
            if key not in {"schema", "compile"}
        })

    for program in activity_preview_programs:
        program_id = program.get("id")
        preview = program.get("preview")
        preview_kind = preview.get("kind") if isinstance(preview, dict) else None
        if preview_kind == "single-auth-activity-v1":
            preview_activities = [preview.get("activity")]
            expected_entry = "$activity-preview"
        elif preview_kind == "exact-auth-activity-sequence-v1":
            preview_activities = preview.get("activities")
            expected_entry = "$activity-sequence"
        else:
            preview_activities = None
            expected_entry = None
        functions = program.get("functions")
        valid_activities = (
            isinstance(preview_activities, list)
            and bool(preview_activities)
            and all(
                isinstance(activity, dict)
                and isinstance(activity.get("slot"), int)
                and isinstance(activity.get("activityId"), str)
                and isinstance(activity.get("binding"), dict)
                and (
                    activity["binding"].get("kind") == "map-embedded-slot"
                    or (
                        isinstance(activity["binding"].get("primaryPointer"), int)
                        and isinstance(activity["binding"].get("secondaryPointer"), int)
                    )
                )
                for activity in preview_activities
            )
            and (
                preview_kind == "exact-auth-activity-sequence-v1"
                or len(preview_activities) == 1
            )
        )
        if (
            not isinstance(program_id, str)
            or not program_id
            or program_id in route_ids
            or program.get("entryFunction") != expected_entry
            or not isinstance(functions, list)
            or len(functions) != 1
            or functions[0].get("id") != expected_entry
            or not isinstance(preview.get("packageId"), str)
            or not isinstance(preview.get("worldId"), str)
            or not valid_activities
        ):
            raise ValueError(
                "compiled native activity preview program is invalid or "
                f"duplicated: {program_id}"
            )
        route_ids.add(program_id)
        programs.append(program)

    return {
        "schema": "new-yokosuka-native-event-program-pack-v1",
        "generatedFrom": {
            "nativeEventIrSha256": event_ir_sha256,
            "sourceScope": event_ir.get("summary", {}).get("sourceScope"),
        },
        "evidenceBoundary": [
            "Each program is an exact same-MAPINFO static closure from its declared entry.",
            "Direct-call and child-coroutine targets are retained without inlining or reordering.",
            "Runtime-interface calls, continuation transfers, unresolved operations, and unknown operands remain explicit stop or yield boundaries.",
            "Interaction routes distinguish exact control entries from explicitly declared, statically reachable dialogue entries; no descendant is selected by inference.",
            "Automatic event routes retain separate exact gate and control entries plus the required native gate return value.",
            "Persistent room-controller declarations preserve exact launch, poll, and dispatch ownership without treating unresolved controller operations as executable.",
            "Route declarations identify exact native entries; they do not assign inferred gameplay meaning.",
        ],
        "programs": programs,
    }


RUNTIME_DESCRIPTOR_FIELDS = (
    "id",
    "disc",
    "area",
    "mapinfoSha256",
    "entryFunction",
    "entryInvocation",
    "directEntries",
    "directEntryState",
    "scriptedInteractions",
    "automaticEvents",
    "roomControllers",
    "motionBanks",
    "preview",
    "selector",
)


def compact_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, separators=(",", ":")) + "\n").encode()


def build_runtime_index(
    program_pack: dict[str, Any],
    *,
    asset_url_root: str = "/data/native-event-programs",
) -> tuple[dict[str, Any], dict[str, bytes]]:
    """Build compact discovery metadata and content-addressed program files.

    The browser needs interaction and entry metadata synchronously, but exact
    executable closures are fetched only if their program starts. Keeping the
    full functions out of this index is the boundary that prevents Vite from
    parsing every recovered program during an ordinary production build.
    """
    if program_pack.get("schema") != "new-yokosuka-native-event-program-pack-v1":
        raise ValueError("unsupported native event program pack schema")
    asset_url_root = asset_url_root.rstrip("/")
    if not asset_url_root.startswith("/") or ".." in asset_url_root:
        raise ValueError("runtime program asset URL root must be absolute")

    assets: dict[str, bytes] = {}
    descriptors = []
    camera_records_by_area: dict[str, dict[int, dict[str, Any]]] = {}
    for program in program_pack.get("programs", []):
        program_id = program.get("id")
        area = program.get("area")
        if not isinstance(program_id, str) or not isinstance(area, str):
            raise ValueError("runtime event program identity is invalid")
        payload = compact_json_bytes(program)
        payload_sha256 = hashlib.sha256(payload).hexdigest()
        file_name = f"{payload_sha256}.json"
        existing_payload = assets.get(file_name)
        if existing_payload is not None and existing_payload != payload:
            raise ValueError(f"runtime event program hash collision: {program_id}")
        assets[file_name] = payload
        descriptor = {
            key: program[key]
            for key in RUNTIME_DESCRIPTOR_FIELDS
            if key in program
        }
        descriptor["asset"] = {
            "path": f"{asset_url_root}/{file_name}",
            "sha256": payload_sha256,
            "byteLength": len(payload),
        }
        descriptors.append(descriptor)

        records = program.get("eventCameras", {}).get("records", [])
        area_records = camera_records_by_area.setdefault(area, {})
        for record in records:
            camera_number = record.get("cameraNumber")
            if not isinstance(camera_number, int):
                raise ValueError(
                    f"{program_id}: runtime event camera number is invalid"
                )
            existing = area_records.get(camera_number)
            if existing is not None and existing != record:
                raise ValueError(
                    f"{area}: conflicting runtime event camera {camera_number}"
                )
            area_records[camera_number] = record

    index = {
        "schema": "new-yokosuka-native-event-program-index-v1",
        "generatedFrom": {
            **program_pack.get("generatedFrom", {}),
            "programPackSha256": hashlib.sha256(
                compact_json_bytes(program_pack)
            ).hexdigest(),
        },
        "programs": descriptors,
        "eventCamerasByArea": {
            area: [records[number] for number in sorted(records)]
            for area, records in sorted(camera_records_by_area.items())
            if records
        },
    }
    return index, assets


def write_runtime_assets(
    index: dict[str, Any],
    assets: dict[str, bytes],
    *,
    index_path: Path,
    asset_directory: Path,
) -> None:
    index_path.parent.mkdir(parents=True, exist_ok=True)
    asset_directory.mkdir(parents=True, exist_ok=True)
    expected = set(assets)
    for stale in asset_directory.glob("*.json"):
        if stale.name not in expected:
            stale.unlink()
    for file_name, payload in assets.items():
        (asset_directory / file_name).write_bytes(payload)
    index_path.write_bytes(compact_json_bytes(index))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_IR)
    parser.add_argument("--routes", type=Path, default=DEFAULT_ROUTES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--runtime-index",
        type=Path,
        default=DEFAULT_RUNTIME_INDEX,
        help="compact browser discovery index",
    )
    parser.add_argument(
        "--runtime-assets",
        type=Path,
        default=DEFAULT_RUNTIME_ASSETS,
        help="content-addressed browser program directory",
    )
    parser.add_argument(
        "--compiled-program",
        action="append",
        type=Path,
        default=list(DEFAULT_COMPILED_PROGRAMS),
        help=(
            "fully compiled canonical cutscene program to include in the "
            "browser runtime pack (repeatable)"
        ),
    )
    parser.add_argument(
        "--activity-preview-programs",
        type=Path,
        default=DEFAULT_ACTIVITY_PREVIEW_PROGRAMS,
        help="generated exact single-AUTH preview program pack",
    )
    args = parser.parse_args()

    report = build_pack(
        json.loads(args.event_ir.read_text()),
        json.loads(args.routes.read_text()),
        event_ir_sha256=sha256(args.event_ir),
        camera_catalog_loader=lambda relative_path: json.loads(
            (PROJECT_ROOT / relative_path).read_text()
        ),
        compiled_programs=tuple(
            json.loads(path.read_text())
            for path in args.compiled_program
        ),
        activity_preview_programs=tuple(
            json.loads(args.activity_preview_programs.read_text())["programs"]
        ),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, separators=(",", ":")) + "\n"
    )
    runtime_index, runtime_assets = build_runtime_index(report)
    write_runtime_assets(
        runtime_index,
        runtime_assets,
        index_path=args.runtime_index,
        asset_directory=args.runtime_assets,
    )
    totals = Counter()
    for program in report["programs"]:
        for key, value in program["summary"].items():
            if isinstance(value, int):
                totals[key] += value
    print(
        f"Wrote {args.output}: {len(report['programs'])} programs, "
        f"{totals['functionCount']} functions, "
        f"{totals['actionCount']} actions"
    )
    print(
        f"Wrote {args.runtime_index} and {len(runtime_assets)} "
        "content-addressed runtime programs"
    )


if __name__ == "__main__":
    main()
