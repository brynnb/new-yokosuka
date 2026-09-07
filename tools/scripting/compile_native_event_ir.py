#!/usr/bin/env python3
"""Compile recovered dialogue-path native code into a lossless event IR.

The IR is intentionally below a guessed Shenmue scripting language. It
preserves exact block order, native operation operands, direct calls, child
coroutine launches, scene comparisons, and dialogue-region metadata. Proven
operation semantics receive stable adapter IDs; every other operation remains
an explicit numeric engine call so an interpreter cannot silently invent its
behavior.
"""

from __future__ import annotations

import argparse
import json
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTROL_FLOW = (
    PROJECT_ROOT
    / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_SEMANTICS = (
    PROJECT_ROOT / "tools/evidence/native-operation-semantics.json"
)
DEFAULT_OUTPUT = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_SUMMARY = PROJECT_ROOT / "tools/evidence/native-event-ir.json"


def number(value: str) -> int:
    return int(value, 16)


def within(block: dict[str, Any], offset: str) -> bool:
    value = number(offset)
    return (
        number(block["startFileOffset"])
        <= value
        < number(block["endFileOffsetExclusive"])
    )


def semantic_index(
    semantics: dict[str, Any],
) -> dict[int, list[dict[str, Any]]]:
    result: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in semantics["operations"]:
        result[item["operationId"]].append(item)
    return dict(result)


def semantic_applies(
    semantic: dict[str, Any] | None,
    operation: dict[str, Any],
) -> bool:
    if semantic is None:
        return False
    if (
        "argumentCount" in semantic
        and len(operation["arguments"]) != semantic["argumentCount"]
    ):
        return False
    if (
        "argumentCounts" in semantic
        and len(operation["arguments"]) not in semantic["argumentCounts"]
    ):
        return False
    for constraint in semantic.get("argumentConstraints", []):
        index = constraint["index"]
        if index >= len(operation["arguments"]):
            return False
        argument = operation["arguments"][index]
        if "kinds" in constraint:
            if argument.get("kind") not in constraint["kinds"]:
                return False
        if "values" in constraint:
            if argument.get("kind") != "constant":
                return False
            if argument.get("value") not in constraint["values"]:
                return False
        if (
            constraint.get("exactFrameExpression")
            and argument.get("kind") == "float32-truncate-to-signed-integer"
            and not exact_frame_expression(argument)
        ):
            return False
    return True


def enrich_static_pointer_arguments(
    semantic: dict[str, Any],
    arguments: list[dict[str, Any]],
    mapinfo: bytes,
    label: str,
) -> list[dict[str, Any]]:
    static_word_count = semantic.get("staticPointerWordCount")
    sentinel_word = semantic.get("staticPointerSentinelWord")
    maximum_word_count = semantic.get("staticPointerMaximumWordCount")
    if static_word_count is None and sentinel_word is None:
        return arguments
    if static_word_count is not None and sentinel_word is not None:
        raise ValueError("static pointer payload shape must be singular")
    if static_word_count is not None:
        if not isinstance(static_word_count, int) or static_word_count <= 0:
            raise ValueError("staticPointerWordCount must be positive")
        maximum_word_count = static_word_count
    elif (
        not isinstance(sentinel_word, int)
        or not 0 <= sentinel_word <= 0xffffffff
        or not isinstance(maximum_word_count, int)
        or maximum_word_count <= 0
    ):
        raise ValueError("static pointer sentinel payload shape is invalid")
    enriched = []
    for argument in arguments:
        if argument.get("kind") != "static-pointer":
            enriched.append(argument)
            continue
        pointer = argument.get("value")
        byte_count = maximum_word_count * 4
        if (
            not isinstance(pointer, int)
            or pointer < 0
            or pointer + byte_count > len(mapinfo)
        ):
            raise ValueError(f"{label} static pointer payload unavailable at {pointer}")
        words = list(struct.unpack_from(
            f"<{maximum_word_count}I", mapinfo, pointer,
        ))
        if sentinel_word is not None:
            try:
                words = words[:words.index(sentinel_word) + 1]
            except ValueError as error:
                raise ValueError(
                    f"{label} static pointer sentinel unavailable at {pointer}"
                ) from error
        enriched.append({
            **argument,
            "staticWords": words,
        })
    return enriched


def exact_frame_expression(expression: dict[str, Any], depth: int = 0) -> bool:
    if depth > 20:
        return False
    kind = expression.get("kind")
    if kind == "constant":
        return isinstance(expression.get("value"), int)
    if kind == "frame-field":
        return (
            isinstance(expression.get("offset"), int)
            and expression["offset"] >= 0
            and expression.get("width") in {1, 2, 4}
            and isinstance(expression.get("signedLoad"), bool)
        )
    if kind in {
        "float32-from-word", "float32-word",
        "signed-integer-to-float32", "float32-truncate-to-signed-integer",
    }:
        return exact_frame_expression(expression.get("operand", {}), depth + 1)
    if kind in {"float32-divide", "float32-multiply"}:
        return exact_frame_expression(
            expression.get("left", {}), depth + 1,
        ) and exact_frame_expression(expression.get("right", {}), depth + 1)
    return False


RUNTIME_INTERFACE_CALLS = {
    0x14: {
        "runtimeCallKind": "signed-integer-division",
        "behaviorStatus": "handler-specific",
    },
    0x18: {
        "runtimeCallKind": "signed-integer-remainder",
        "behaviorStatus": "handler-specific",
    },
    0x1C: {
        "runtimeCallKind": "single-target-scheduler-dispatch",
        "behaviorStatus": "handler-specific",
    },
    0x2C: {
        "runtimeCallKind": "resumable-scheduler-dispatch",
        "behaviorStatus": "handler-specific",
    },
    0x30: {
        "runtimeCallKind": "secondary-operation-dispatch",
        "behaviorStatus": "handler-specific",
    },
}


def exact_integer_argument(argument: dict[str, Any], depth: int = 0) -> bool:
    if depth > 12:
        return False
    if argument.get("kind") == "constant":
        return isinstance(argument.get("value"), int)
    if argument.get("kind") == "frame-field":
        return (
            isinstance(argument.get("offset"), int)
            and argument.get("offset") >= 0
            and argument.get("width") in {1, 2, 4}
            and isinstance(argument.get("signedLoad"), bool)
        )
    if argument.get("kind") == "scene-field":
        return (
            isinstance(argument.get("offset"), int)
            and argument.get("offset") >= 0
            and argument.get("width") in {1, 2, 4}
            and isinstance(argument.get("signedLoad"), bool)
        )
    if argument.get("kind") == "frame-field-expression":
        return (
            isinstance(argument.get("baseOffset"), int)
            and argument.get("baseOffset") >= 0
            and argument.get("width") == 4
            and argument.get("signedLoad") is False
            and exact_integer_argument(
                argument.get("offsetExpression", {}), depth + 1,
            )
        )
    if argument.get("kind") != "integer-expression":
        return False
    if argument.get("operator") not in {
        "add", "subtract", "multiply-low",
        "signed-binary-angle-difference",
    }:
        return False
    return exact_integer_argument(
        argument.get("left", {}), depth + 1,
    ) and exact_integer_argument(argument.get("right", {}), depth + 1)


def compile_indirect_call(
    call: dict[str, Any],
    runtime_result_offsets: set[str] | None = None,
) -> dict[str, Any]:
    """Classify only slots proven by the native SCN3 runtime interface ABI."""
    source = call.get("targetSource")
    if (
        source is None
        or source.get("kind") != "base-register-slot"
        or source.get("baseRegister") != "r8"
    ):
        return {"kind": "indirectCall", **call}
    byte_offset = source.get("byteOffset")
    if byte_offset == 0x3C:
        return {
            "kind": "coroutineContinuationTransfer",
            **call,
            "semanticId": "native-coroutine-save-continuation",
            "behaviorStatus": "proven",
        }
    classification = RUNTIME_INTERFACE_CALLS.get(byte_offset)
    if classification is None:
        return {"kind": "indirectCall", **call}
    result = {
        "kind": "runtimeInterfaceCall",
        **call,
        **classification,
        "abiStatus": "proven",
    }
    arithmetic = call.get("integerArithmetic")
    arithmetic_arguments = (
        arithmetic.get("arguments", []) if arithmetic else []
    )
    if (
        byte_offset in {0x14, 0x18}
        and arithmetic is not None
        and arithmetic.get("argumentCount") == 2
        and len(arithmetic_arguments) == 2
        and exact_integer_argument(arithmetic_arguments[0])
        and exact_integer_argument(arithmetic_arguments[1])
        and not (
            arithmetic_arguments[1].get("kind") == "constant"
            and arithmetic_arguments[1].get("value") in {0, 0xFFFFFFFF}
        )
    ):
        result.update({
            "semanticId": (
                "native-signed-integer-division"
                if byte_offset == 0x14
                else "native-signed-integer-remainder"
            ),
            "behaviorStatus": "proven",
        })
    dispatch = call.get("runtimeDispatch")
    arguments = dispatch.get("arguments", []) if dispatch else []
    if dispatch is not None and runtime_result_offsets:
        promoted_arguments = []
        for argument in arguments:
            source_offset = argument.get("source")
            if (
                argument.get("kind") == "call-result"
                and source_offset in runtime_result_offsets
            ):
                promoted_arguments.append({
                    **argument,
                    "kind": "operation-result",
                    "callFileOffset": source_offset,
                })
            else:
                promoted_arguments.append(argument)
        arguments = promoted_arguments
        result["runtimeDispatch"] = {
            **dispatch,
            "arguments": arguments,
        }
    if (
        byte_offset == 0x2C
        and dispatch is not None
        and dispatch.get("selector") == 0
        and dispatch.get("argumentCount") == 1
        and len(arguments) == 1
        and arguments[0].get("kind") in {
            "constant", "frame-field", "operation-result",
        }
        and call.get("resultBitTest", {}).get("mask") == 0x00010000
    ):
        result.update({
            "semanticId": "native-scheduler-countdown",
            "behaviorStatus": "proven",
        })
    if (
        byte_offset == 0x2C
        and dispatch is not None
        and dispatch.get("selector") == 19
        and dispatch.get("argumentCount") == 0
        and len(arguments) == 0
        and call.get("resultBitTest", {}).get("mask") == 0x00010000
    ):
        result.update({
            "semanticId": "native-scheduler-global-readiness",
            "behaviorStatus": "proven",
        })
    return result


def deduplicate_frame_field_mutations(
    actions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Drop a legacy add only when an exact expression write subsumes it."""
    expression_adds = {
        (
            action.get("callFileOffset"),
            action.get("offset"),
            action.get("width"),
            expression["right"].get("value"),
        )
        for action in actions
        if action.get("kind") == "frameFieldExpressionWrite"
        and (expression := action.get("expression", {})).get("kind") == "add"
        and expression.get("left", {}).get("kind") == "frame-field"
        and expression["left"].get("offset") == action.get("offset")
        and expression["left"].get("width") == action.get("width")
        and expression["left"].get("signedLoad") is False
        and expression.get("right", {}).get("kind") == "constant"
    }
    return [
        action
        for action in actions
        if not (
            action.get("kind") == "frameFieldAdd"
            and (
                action.get("callFileOffset"),
                action.get("offset"),
                action.get("width"),
                action.get("value"),
            ) in expression_adds
        )
    ]


def compile_function(
    function: dict[str, Any],
    semantics: dict[int, list[dict[str, Any]]],
    secondary_semantics: dict[int, list[dict[str, Any]]],
    mapinfo: bytes,
) -> dict[str, Any]:
    native_operation_offsets = {
        operation["callFileOffset"]
        for operation in function["nativeOperations"]
    }

    def promote_operation_result_arguments(
        operation: dict[str, Any],
    ) -> dict[str, Any]:
        arguments = []
        for argument in operation["arguments"]:
            source = argument.get("source")
            if (
                argument.get("kind") == "call-result"
                and isinstance(source, str)
                and source in native_operation_offsets
            ):
                arguments.append({
                    **argument,
                    "kind": "operation-result",
                    "callFileOffset": source,
                })
            else:
                arguments.append(argument)
        return {**operation, "arguments": arguments}

    launch_offsets = {
        launch["callFileOffset"]
        for launch in function["childCoroutineLaunches"]
    }
    raw_actions = []
    for raw_operation in function["nativeOperations"]:
        operation = promote_operation_result_arguments(raw_operation)
        # A successfully decoded operation-0x0002 launch is represented by
        # the richer childCoroutineLaunch action below. Keeping the raw
        # engine operation as well would execute the same native call twice.
        if operation["callFileOffset"] in launch_offsets:
            continue
        known_semantics = semantics.get(operation["operationId"], [])
        matches = [
            semantic
            for semantic in known_semantics
            if semantic_applies(semantic, operation)
        ]
        if len(matches) > 1:
            names = ", ".join(item["semanticId"] for item in matches)
            raise ValueError(
                f"{operation['operationHex']} at "
                f"{operation['callFileOffset']} matches overlapping "
                f"semantics: {names}"
            )
        semantic = matches[0] if matches else None
        action = {
            "kind": "engineOperation",
            **operation,
            "adapterStatus": "proven" if semantic else "unresolved",
        }
        if semantic:
            action["semanticId"] = semantic["semanticId"]
            action["arguments"] = enrich_static_pointer_arguments(
                semantic, action["arguments"], mapinfo, "engine operation",
            )
        elif known_semantics:
            families = list(dict.fromkeys(
                item["semanticId"] for item in known_semantics
            ))
            action["knownOperationFamilies"] = families
            if len(families) == 1:
                action["knownOperationFamily"] = families[0]
        raw_actions.append(action)
    raw_actions.extend({
        "kind": "directCall",
        **call,
    } for call in function["directCalls"])
    raw_actions.extend({
        "kind": "childCoroutineLaunch",
        **launch,
    } for launch in function["childCoroutineLaunches"])
    for operation in function.get("secondaryNativeOperations", []):
        matches = [
            semantic
            for semantic in secondary_semantics.get(
                operation["operationId"],
                [],
            )
            if semantic_applies(semantic, operation)
        ]
        if len(matches) > 1:
            raise ValueError(
                f"secondary {operation['operationHex']} at "
                f"{operation['callFileOffset']} matches overlapping semantics"
            )
        semantic = matches[0] if matches else None
        action = {
            "kind": "secondaryEngineOperation",
            **operation,
            "adapterStatus": "proven" if semantic else "unresolved",
            "dispatcher": "0x0c160918",
        }
        if semantic:
            action["semanticId"] = semantic["semanticId"]
            action["arguments"] = enrich_static_pointer_arguments(
                semantic, action["arguments"], mapinfo, "secondary operation",
            )
        raw_actions.append(action)
    preliminary_indirect_actions = [
        compile_indirect_call(call)
        for call in function.get("indirectCalls", [])
    ]
    runtime_result_offsets = {
        action["callFileOffset"]
        for action in preliminary_indirect_actions
        if (
            action.get("behaviorStatus") == "proven"
            and action.get("semanticId")
        )
    }
    raw_actions.extend(
        compile_indirect_call(call, runtime_result_offsets)
        for call in function.get("indirectCalls", [])
    )
    raw_actions.extend(function.get("frameFieldMutations", []))
    raw_actions = deduplicate_frame_field_mutations(raw_actions)

    blocks = []
    assigned_action_offsets: set[str] = set()
    assigned_comparisons: set[str] = set()
    for block in function["basicBlocks"]:
        actions = sorted(
            [
                action
                for action in raw_actions
                if within(block, action["callFileOffset"])
            ],
            key=lambda item: number(item["callFileOffset"]),
        )
        assigned_action_offsets.update(
            action["callFileOffset"]
            for action in actions
        )
        comparisons = [
            comparison
            for comparison in function["sceneFieldComparisons"]
            if within(block, comparison["compareFileOffset"])
        ]
        assigned_comparisons.update(
            comparison["compareFileOffset"]
            for comparison in comparisons
        )
        frame_comparisons = [
            comparison
            for comparison in function.get("frameFieldComparisons", [])
            if within(block, comparison["compareFileOffset"])
        ]
        blocks.append({
            "id": block["startFileOffset"],
            "endFileOffsetExclusive": block["endFileOffsetExclusive"],
            "actions": actions,
            "sceneFieldComparisons": comparisons,
            "frameFieldComparisons": frame_comparisons,
            "terminator": block.get("terminator"),
            "successors": block["successors"],
        })

    unassigned_actions = [
        action
        for action in raw_actions
        if action["callFileOffset"] not in assigned_action_offsets
    ]
    unassigned_comparisons = [
        comparison
        for comparison in function["sceneFieldComparisons"]
        if comparison["compareFileOffset"] not in assigned_comparisons
    ]
    assigned_frame_comparisons = {
        comparison["compareFileOffset"]
        for block in blocks
        for comparison in block["frameFieldComparisons"]
    }
    unassigned_frame_comparisons = [
        comparison
        for comparison in function.get("frameFieldComparisons", [])
        if comparison["compareFileOffset"]
        not in assigned_frame_comparisons
    ]
    if (
        unassigned_actions
        or unassigned_comparisons
        or unassigned_frame_comparisons
    ):
        raise ValueError(
            f"{function['fileOffset']}: control-flow index contains "
            f"{len(unassigned_actions)} actions and "
            f"{len(unassigned_comparisons)} scene comparisons and "
            f"{len(unassigned_frame_comparisons)} frame comparisons "
            "outside blocks"
        )
    return {
        "id": function["fileOffset"],
        "endFileOffsetExclusive": function["endFileOffsetExclusive"],
        "entryBlock": (
            function["basicBlocks"][0]["startFileOffset"]
            if function["basicBlocks"]
            else None
        ),
        "dialogueRegion": function["dialogueRegion"],
        "frameArgumentBase": function.get("frameArgumentBase"),
        "returnValue": function.get("returnValue"),
        "blocks": blocks,
        "unresolvedControlTransfers": (
            function["unresolvedControlTransfers"]
        ),
    }


def build_report(
    control_flow: dict[str, Any],
    semantics: dict[str, Any],
) -> dict[str, Any]:
    scripted_event_scope = (
        control_flow.get("schema")
        == "new-yokosuka-scripted-event-control-flow-index-v1"
    )
    semantic_by_id = semantic_index(semantics)
    secondary_semantic_by_id: dict[int, list[dict[str, Any]]] = defaultdict(
        list
    )
    for item in semantics.get("secondaryOperations", []):
        secondary_semantic_by_id[item["operationId"]].append(item)
    maps = []
    operation_status: Counter[str] = Counter()
    secondary_operation_status: Counter[str] = Counter()
    secondary_operation_ids: Counter[str] = Counter()
    secondary_semantic_ids: Counter[str] = Counter()
    operation_ids: Counter[str] = Counter()
    semantic_ids: Counter[str] = Counter()
    unresolved_operation_ids: Counter[str] = Counter()
    known_family_unresolved: Counter[str] = Counter()
    for item in control_flow["maps"]:
        if "source" in item:
            mapinfo = Path(item["source"]).read_bytes()
        elif "mapinfoHex" in item:
            mapinfo = bytes.fromhex(item["mapinfoHex"])
        else:
            raise ValueError(
                "control-flow map requires source or explicit fixture mapinfoHex"
            )
        source_functions = item.get(
            "scriptedEventFunctions",
            item.get("dialoguePathFunctions", []),
        )
        functions = [
            compile_function(
                function,
                semantic_by_id,
                secondary_semantic_by_id,
                mapinfo,
            )
            for function in source_functions
        ]
        for function in functions:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if action["kind"] == "secondaryEngineOperation":
                        secondary_operation_status[
                            action["adapterStatus"]
                        ] += 1
                        secondary_operation_ids[
                            action["operationHex"] or "runtime"
                        ] += 1
                        if action["adapterStatus"] == "proven":
                            secondary_semantic_ids[
                                action["semanticId"]
                            ] += 1
                        continue
                    if action["kind"] != "engineOperation":
                        continue
                    operation_status[action["adapterStatus"]] += 1
                    operation_ids[action["operationHex"]] += 1
                    if action["adapterStatus"] == "proven":
                        semantic_ids[action["semanticId"]] += 1
                    else:
                        unresolved_operation_ids[
                            action["operationHex"]
                        ] += 1
                        for family in action.get(
                            "knownOperationFamilies",
                            (
                                [action["knownOperationFamily"]]
                                if "knownOperationFamily" in action
                                else []
                            ),
                        ):
                            known_family_unresolved[family] += 1
        maps.append({
            "disc": item["disc"],
            "area": item["area"],
            "mapinfoSha256": item["mapinfoSha256"],
            "entryFunction": item["initialFunctionFileOffset"],
            "functions": functions,
        })
    functions = [
        function
        for item in maps
        for function in item["functions"]
    ]
    blocks = [
        block
        for function in functions
        for block in function["blocks"]
    ]
    actions = [
        action
        for block in blocks
        for action in block["actions"]
    ]
    indirect_sources = [
        action["targetSource"]
        for action in actions
        if (
            action["kind"] in {
                "indirectCall",
                "runtimeInterfaceCall",
                "coroutineContinuationTransfer",
            }
            and "targetSource" in action
        )
    ]
    return {
        "schema": "new-yokosuka-native-event-ir-v1",
        "evidenceBoundary": [
            (
                "This IR structurally translates native SH-4 functions "
                "reachable from exact SCN3 initial or operation-0x0002 "
                "child-coroutine entries."
                if scripted_event_scope
                else
                "This IR structurally translates recovered native SH-4 "
                "dialogue-path control flow."
            ),
            "It is not a decompilation into guessed game-script semantics.",
            "Every action retains its exact native file offset and operands.",
            "Only operation IDs in native-operation-semantics.json receive a proven semantic adapter ID; all others remain unresolved engine operations.",
            "An operation ID may have multiple proven mode-specific semantics; exactly one must match its constant argument constraints.",
            "Operation families with subcommand constraints receive a proven adapter only when exact constant arguments satisfy those constraints.",
            "Indirect transfers that could not be resolved remain explicit on their containing function.",
            "Reachable indirect native calls not already represented as engine operations, direct calls, or child launches remain explicit stop boundaries.",
        ],
        "summary": {
            "sourceScope": (
                "scripted-events"
                if scripted_event_scope
                else "dialogue-paths"
            ),
            "mapinfoCount": len(maps),
            "functionCount": len(functions),
            "blockCount": len(blocks),
            "actionCount": len(actions),
            "frameFieldAddCount": sum(
                action["kind"] == "frameFieldAdd"
                for action in actions
            ),
            "engineOperationCount": sum(operation_status.values()),
            "secondaryEngineOperationCount": sum(
                secondary_operation_ids.values()
            ),
            "provenSecondaryEngineOperationCount": (
                secondary_operation_status["proven"]
            ),
            "unresolvedSecondaryEngineOperationCount": (
                secondary_operation_status["unresolved"]
            ),
            "secondaryEngineOperationIds": dict(sorted(
                secondary_operation_ids.items()
            )),
            "secondarySemanticIds": dict(sorted(
                secondary_semantic_ids.items()
            )),
            "provenEngineOperationCount": operation_status["proven"],
            "unresolvedEngineOperationCount": operation_status["unresolved"],
            "directCallCount": sum(
                action["kind"] == "directCall"
                for action in actions
            ),
            "childCoroutineLaunchCount": sum(
                action["kind"] == "childCoroutineLaunch"
                for action in actions
            ),
            "indirectCallCount": sum(
                action["kind"] == "indirectCall"
                for action in actions
            ),
            "runtimeInterfaceCallCount": sum(
                action["kind"] == "runtimeInterfaceCall"
                for action in actions
            ),
            "runtimeInterfaceCallKinds": dict(sorted(Counter(
                action["runtimeCallKind"]
                for action in actions
                if action["kind"] == "runtimeInterfaceCall"
            ).items())),
            "coroutineContinuationTransferCount": sum(
                action["kind"] == "coroutineContinuationTransfer"
                for action in actions
            ),
            "indirectCallTargetSourceCount": len(indirect_sources),
            "indirectCallBaseRegisterSlots": dict(sorted(Counter(
                (
                    f"{source['baseRegister']}+"
                    f"0x{source['byteOffset']:x}"
                )
                for source in indirect_sources
                if source["kind"] == "base-register-slot"
            ).items())),
            "dialogueRegionCount": sum(
                function["dialogueRegion"] is not None
                for function in functions
            ),
            "operationIds": dict(sorted(operation_ids.items())),
            "semanticIds": dict(sorted(semantic_ids.items())),
            "unresolvedOperationIds": dict(sorted(
                unresolved_operation_ids.items()
            )),
            "knownFamilyButUnresolvedCounts": dict(sorted(
                known_family_unresolved.items()
            )),
        },
        "maps": maps,
    }


def summary_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "new-yokosuka-native-event-ir-summary-v1",
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "fullReport": ".disc-work/dialogue/native-event-ir.json",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--control-flow",
        type=Path,
        default=DEFAULT_CONTROL_FLOW,
    )
    parser.add_argument("--semantics", type=Path, default=DEFAULT_SEMANTICS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary-output", type=Path, default=DEFAULT_SUMMARY)
    args = parser.parse_args()
    report = build_report(
        json.loads(args.control_flow.read_text()),
        json.loads(args.semantics.read_text()),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary_report(report), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: {report['summary']['functionCount']} "
        f"functions, {report['summary']['actionCount']} actions"
    )


if __name__ == "__main__":
    main()
