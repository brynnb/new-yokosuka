"""Derive canonical native-cutscene dependencies from compiled program IR.

This module belongs to the clean cutscene compiler pipeline.  It deliberately
does not import the reviewed-route/legacy event-pack builder.
"""

from __future__ import annotations

import struct
from typing import Any


def action_target_file_offsets(action: dict[str, Any]) -> list[str]:
    """Return every exact static control-flow target carried by an action."""
    target = action.get("targetFileOffset")
    if isinstance(target, str) and target:
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


def program_actions(functions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        action
        for function in functions
        for block in function.get("blocks", [])
        for action in block.get("actions", [])
    ]


def static_strings(
    functions: list[dict[str, Any]],
    mapinfo: bytes,
    *,
    maximum_length: int = 255,
) -> list[dict[str, Any]]:
    """Decode exact printable NUL strings referenced by static-pointer args.

    Static pointers can also address vectors and opaque records.  Those remain
    typed by their consuming operation and are never guessed to be strings.
    """
    pointers = sorted({
        argument["value"]
        for action in program_actions(functions)
        for argument in action.get("arguments", [])
        if (
            argument.get("kind") == "static-pointer"
            and isinstance(argument.get("value"), int)
        )
    })
    result = []
    for pointer in pointers:
        if pointer < 0 or pointer >= len(mapinfo):
            raise ValueError(f"static pointer is outside MAPINFO: {pointer:#x}")
        end = mapinfo.find(b"\0", pointer, min(len(mapinfo), pointer + maximum_length + 1))
        if end <= pointer:
            continue
        encoded = mapinfo[pointer:end]
        if any(byte < 0x20 or byte > 0x7e for byte in encoded):
            continue
        result.append({
            "pointer": pointer,
            "value": encoded.decode("ascii"),
            "sourceFileOffset": f"{pointer:#x}",
        })
    return result


STATIC_VECTOR_ARGUMENTS = {
    "native-fixed-record-pose-write": (1,),
    "resolved-object-scale-vector-write": (1,),
}


def static_vectors(
    functions: list[dict[str, Any]],
    mapinfo: bytes,
) -> list[dict[str, Any]]:
    """Extract vectors only where a proven semantic types an argument as one."""
    references: dict[int, set[str]] = {}
    for action in program_actions(functions):
        indices = STATIC_VECTOR_ARGUMENTS.get(action.get("semanticId"), ())
        for index in indices:
            arguments = action.get("arguments", [])
            if index >= len(arguments):
                raise ValueError(
                    f"{action.get('semanticId')}: vector argument {index} is absent"
                )
            argument = arguments[index]
            if argument.get("kind") != "static-pointer":
                continue
            pointer = argument.get("value")
            if not isinstance(pointer, int):
                raise ValueError("static vector pointer is not an integer")
            references.setdefault(pointer, set()).add(action["callFileOffset"])
    result = []
    for pointer in sorted(references):
        if pointer < 0 or pointer + 12 > len(mapinfo):
            raise ValueError(f"static vector is outside MAPINFO: {pointer:#x}")
        result.append({
            "pointer": pointer,
            "words": list(struct.unpack_from("<3I", mapinfo, pointer)),
            "sourceFileOffset": f"{pointer:#x}",
            "callFileOffsets": sorted(references[pointer], key=lambda value: int(value, 16)),
        })
    return result


def operation_013c_static_record_pairs(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collect exact static record construction pairs for operation 0x013c."""
    pairs: dict[tuple[int, int], dict[str, Any]] = {}
    for action in program_actions(functions):
        arguments = action.get("arguments", [])
        if (
            action.get("semanticId")
            != "native-operation-013c-container-control"
            or len(arguments) != 4
            or [argument.get("value") for argument in arguments[:2]] != [0, 0]
            or any(
                argument.get("kind") != "static-pointer"
                for argument in arguments[2:]
            )
        ):
            continue
        key = (arguments[2]["value"], arguments[3]["value"])
        pair = pairs.setdefault(key, {
            "argument2": key[0],
            "argument3": key[1],
            "callFileOffsets": [],
        })
        pair["callFileOffsets"].append(action["callFileOffset"])
    return [pairs[key] for key in sorted(pairs)]


def operation_013c_archive_pairs(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collect exact static archive path/name pairs acquired by 0x013c."""
    pairs: dict[tuple[int, int], dict[str, Any]] = {}
    for action in program_actions(functions):
        arguments = action.get("arguments", [])
        if (
            action.get("semanticId")
            != "native-operation-013c-container-control"
            or len(arguments) != 4
            or [argument.get("value") for argument in arguments[:2]] != [1, 0]
            or any(
                argument.get("kind") != "static-pointer"
                for argument in arguments[2:]
            )
        ):
            continue
        key = (arguments[2]["value"], arguments[3]["value"])
        pair = pairs.setdefault(key, {
            "pathPointer": key[0],
            "namePointer": key[1],
            "callFileOffsets": [],
        })
        pair["callFileOffsets"].append(action["callFileOffset"])
    return [pairs[key] for key in sorted(pairs)]


def operation_013e_static_bindings(
    functions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Collect exact resource-slot bindings constructed by operation 0x013e."""
    bindings: dict[tuple[int, int, int], dict[str, Any]] = {}
    for action in program_actions(functions):
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
