#!/usr/bin/env python3
"""Recover native actor conversation bodies and nested message selections.

The initial actor selector returns a body pointer. A resumable outer
interpreter executes that body; low opcode class 0x20 invokes a separate
nested message-construction interpreter which can gather several lines before
returning control to the outer program. This extractor preserves that split.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_actor_entry_routes import (
    RouteDecodeError,
    decode_route_graph,
    parse_expression,
    record_relative,
    sign_extend,
)
from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_EXECUTABLE,
    DEFAULT_HUMANS,
    EXECUTABLE_SHA256,
    HUMANS_SHA256,
    RUNTIME_BASE,
    afs_entries,
    hx,
    package_children,
    parse_scnf,
    sha256,
    write_json,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FULL_OUTPUT = (
    ROOT / ".disc-work" / "dialogue" / "actor-conversation-body-routes.json"
)
DEFAULT_EVIDENCE_OUTPUT = (
    ROOT / "tools" / "evidence" / "dialogue-actor-body-routes.json"
)

VERIFIED_RANGES = {
    "nestedMessageConstructor": (0x0C15B5A8, 0x864),
    "conversationStartPointerSelector": (0x0C15CCF6, 0x1CE),
    "lowOpcodeHandler": (0x0C15CECC, 0x2D4),
    "midOpcodeHandler": (0x0C15D1D0, 0x14C),
    "eventOpcodeHandler": (0x0C15D31C, 0x25A),
    "controlOpcodeHandler": (0x0C15D584, 0x308),
    "outerDispatchLoop": (0x0C15D88C, 0x180),
}


class BodyDecodeError(ValueError):
    """A bounded actor conversation body could not be decoded."""


def executable_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise BodyDecodeError(
            f"executable range {hx(address)}+{size} is unavailable"
        )
    return data[offset : offset + size]


def verify_executable(data: bytes) -> dict[str, Any]:
    digest = sha256(data)
    if digest != EXECUTABLE_SHA256:
        raise BodyDecodeError(f"unexpected 1ST_READ.BIN SHA-256: {digest}")
    return {
        "filename": "1ST_READ.BIN",
        "runtimeBase": hx(RUNTIME_BASE),
        "sha256": digest,
        "verifiedCodeRanges": {
            name: {
                "runtimeAddress": hx(address),
                "size": size,
                "sha256": sha256(executable_slice(data, address, size)),
            }
            for name, (address, size) in VERIFIED_RANGES.items()
        },
    }


def random_block_starts(
    data: bytes,
    cursor: int,
    stream_end: int,
) -> tuple[list[int], int]:
    if cursor + 1 >= stream_end:
        raise BodyDecodeError(f"truncated E0 random opcode at {hx(cursor)}")
    count = data[cursor + 1]
    block = cursor + 2
    starts = []
    for _ in range(count):
        if block + 1 >= stream_end:
            raise BodyDecodeError(
                f"truncated E0 random block at {hx(block)}"
            )
        starts.append(block)
        length = ((data[block] & 0x0F) << 8) | data[block + 1]
        block += 2 + length
        if block > stream_end:
            raise BodyDecodeError(
                f"E0 random block exceeds stream at {hx(cursor)}"
            )
    return starts, block


def decode_message_group(
    data: bytes,
    start: int,
    stream_start: int,
    stream_end: int,
    record_start: int,
    message_count: int,
) -> dict[str, Any]:
    """Decode the nested constructor until it returns to the outer program."""

    worklist = [start]
    visited: set[int] = set()
    edges = []
    selections = []
    native_commands = []
    returns = []

    def queue(source: int, target: int, kind: str) -> None:
        edges.append({
            "fromOffset": record_relative(source, record_start),
            "toOffset": record_relative(target, record_start),
            "kind": kind,
        })
        worklist.append(target)

    def return_outer(cursor: int, kind: str) -> None:
        returns.append({
            "offset": record_relative(cursor, record_start),
            "kind": kind,
        })

    while worklist:
        cursor = worklist.pop()
        if cursor in visited:
            continue
        if not stream_start <= cursor < stream_end:
            raise BodyDecodeError(
                f"message group leaves routing stream at {hx(cursor)}"
            )
        visited.add(cursor)
        opcode = data[cursor]
        opcode_class = opcode & 0xF0

        if opcode_class in (0x00, 0x20, 0x30, 0x60, 0x70, 0x90, 0xC0):
            if cursor + 1 >= stream_end:
                raise BodyDecodeError(
                    f"truncated nested opcode at {hx(cursor)}"
                )
            encoded = ((opcode & 0x0F) << 8) | data[cursor + 1]
            if opcode_class == 0x20:
                index = encoded
                if index >= message_count:
                    raise BodyDecodeError(
                        f"message index {index} exceeds {message_count}"
                    )
                selections.append({
                    "opcodeOffset": record_relative(cursor, record_start),
                    "messageIndex": index,
                })
            elif opcode_class in (0x30, 0x60):
                native_commands.append({
                    "opcodeOffset": record_relative(cursor, record_start),
                    "commandWord": encoded,
                    "nativeTickAdvance": 1 if opcode_class == 0x30 else 0,
                })
            queue(cursor, cursor + 2, "fallthrough")
            continue

        if opcode_class in (0x40, 0x50):
            if cursor + 1 >= stream_end:
                raise BodyDecodeError(
                    f"truncated nested branch at {hx(cursor)}"
                )
            encoded = ((opcode & 0x0F) << 8) | data[cursor + 1]
            target = cursor + 2 + sign_extend(encoded, 12)
            if opcode_class == 0x40:
                queue(cursor, cursor + 2, "lastExpressionNonzero")
                queue(cursor, target, "lastExpressionZero")
            else:
                queue(cursor, target, "unconditional")
            continue

        if opcode_class == 0x80:
            return_outer(cursor, "outerOpcode")
            continue
        if opcode_class in (0xA0, 0xB0):
            return_outer(cursor, "unsupportedNestedClass")
            continue
        if opcode_class == 0xD0:
            if cursor + 2 >= stream_end:
                raise BodyDecodeError(
                    f"truncated nested 20-bit branch at {hx(cursor)}"
                )
            encoded = (
                ((opcode & 0x0F) << 16)
                | (data[cursor + 1] << 8)
                | data[cursor + 2]
            )
            queue(
                cursor,
                cursor + 3 + sign_extend(encoded, 20),
                "unconditional",
            )
            continue
        if opcode_class == 0xE0:
            if opcode != 0xE0:
                return_outer(cursor, "outerEventOpcode")
                continue
            starts, _ = random_block_starts(data, cursor, stream_end)
            for target in starts:
                queue(cursor, target, "randomChoice")
            continue

        if opcode == 0xF0:
            expression_end, _ = parse_expression(
                data,
                cursor + 1,
                stream_end,
            )
            queue(cursor, expression_end, "expressionResult")
        elif opcode in (0xF1, 0xFC, 0xFD):
            if opcode == 0xFC:
                native_commands.append({
                    "opcodeOffset": record_relative(cursor, record_start),
                    "commandWord": 0xFC00,
                    "nativeTickAdvance": 0,
                })
            queue(cursor, cursor + 1, "fallthrough")
        elif opcode in (0xF6, 0xF7, 0xF8):
            return_outer(cursor, "outerControlOpcode")
        elif opcode == 0xF9:
            return_outer(cursor, "dynamicContinuation")
        else:
            return_outer(cursor, "unsupportedNestedControl")

    unique_selections = {
        (item["opcodeOffset"], item["messageIndex"]): item
        for item in selections
    }
    unique_returns = {
        (item["offset"], item["kind"]): item
        for item in returns
    }
    unique_native_commands = {
        (item["opcodeOffset"], item["commandWord"]): item
        for item in native_commands
    }
    return {
        "startOffset": record_relative(start, record_start),
        "nodeCount": len(visited),
        "edgeCount": len(edges),
        "messageSelections": sorted(
            unique_selections.values(),
            key=lambda item: (
                int(item["opcodeOffset"], 16),
                item["messageIndex"],
            ),
        ),
        "nativeCommands": sorted(
            unique_native_commands.values(),
            key=lambda item: (
                int(item["opcodeOffset"], 16),
                item["commandWord"],
            ),
        ),
        "outerReturns": sorted(
            unique_returns.values(),
            key=lambda item: (int(item["offset"], 16), item["kind"]),
        ),
    }


def decode_body_graph(
    data: bytes,
    body_start: int,
    body_end: int,
    stream_start: int,
    stream_end: int,
    record_start: int,
    message_count: int,
) -> dict[str, Any]:
    """Decode one entry with runtime +0x60 carried as symbolic state."""

    worklist: list[tuple[int, int | None]] = [(body_start, None)]
    visited: set[tuple[int, int | None]] = set()
    nodes = []
    edges = []
    terminations = []
    message_groups: dict[int, dict[str, Any]] = {}

    def state_id(cursor: int, continuation: int | None) -> str:
        suffix = (
            "none"
            if continuation is None
            else record_relative(continuation, record_start)
        )
        return f"{record_relative(cursor, record_start)}:c60={suffix}"

    def queue(
        source_id: str,
        target: int,
        continuation: int | None,
        kind: str,
    ) -> None:
        edges.append({
            "from": source_id,
            "to": state_id(target, continuation),
            "kind": kind,
        })
        worklist.append((target, continuation))

    def terminate(node_id: str, kind: str, **extra: Any) -> None:
        terminations.append({"nodeId": node_id, "kind": kind, **extra})

    while worklist:
        cursor, continuation = worklist.pop()
        state = (cursor, continuation)
        if state in visited:
            continue
        if not stream_start <= cursor < stream_end:
            raise BodyDecodeError(
                f"outer body leaves routing stream at {hx(cursor)}"
            )
        visited.add(state)
        opcode = data[cursor]
        node_id = state_id(cursor, continuation)
        node = {
            "id": node_id,
            "offset": record_relative(cursor, record_start),
            "opcode": hx(opcode),
            "runtimeContinuation60": (
                None
                if continuation is None
                else record_relative(continuation, record_start)
            ),
        }
        nodes.append(node)

        if opcode < 0x80:
            if cursor + 1 >= stream_end:
                raise BodyDecodeError(
                    f"truncated low body opcode at {hx(cursor)}"
                )
            encoded = ((opcode & 0x0F) << 8) | data[cursor + 1]
            opcode_class = opcode & 0x70
            following = cursor + 2
            node["encodedOperand"] = encoded
            if opcode_class == 0x00:
                node["operation"] = "advanceTwoBytes"
                queue(node_id, following, continuation, "fallthrough")
            elif opcode_class == 0x10:
                node["operation"] = "progressMarker"
                queue(node_id, following, continuation, "fallthrough")
                terminate(
                    node_id,
                    "progressTableMayRedirect",
                    note="native +0x2/+0x4/+0x6 offsets select the alternate target",
                )
            elif opcode_class == 0x20:
                node["operation"] = "constructMessageGroup"
                group = message_groups.get(cursor)
                if group is None:
                    group = decode_message_group(
                        data,
                        cursor,
                        stream_start,
                        stream_end,
                        record_start,
                        message_count,
                    )
                    message_groups[cursor] = group
                for returned in group["outerReturns"]:
                    target = record_start + int(returned["offset"], 16)
                    if returned["kind"] == "dynamicContinuation":
                        terminate(
                            node_id,
                            "nestedDynamicContinuation",
                            atOffset=returned["offset"],
                        )
                    else:
                        queue(
                            node_id,
                            target,
                            continuation,
                            "afterMessageCompletion",
                        )
            elif opcode_class == 0x30:
                node["operation"] = (
                    "setNativeGlobal"
                    if encoded == 0x10
                    else "invokeAndYield"
                )
                queue(
                    node_id,
                    following,
                    continuation,
                    (
                        "fallthrough"
                        if encoded == 0x10
                        else "afterExternalCompletion"
                    ),
                )
            elif opcode_class == 0x40:
                node["operation"] = "branchIfLastExpressionZero"
                target = following + sign_extend(encoded, 12)
                queue(node_id, following, continuation, "lastExpressionNonzero")
                queue(node_id, target, continuation, "lastExpressionZero")
            elif opcode_class == 0x50:
                node["operation"] = "relativeBranch12"
                queue(
                    node_id,
                    following + sign_extend(encoded, 12),
                    continuation,
                    "unconditional",
                )
            elif opcode_class in (0x60, 0x70):
                node["operation"] = (
                    "setStateBank2Bit"
                    if opcode_class == 0x60
                    else "clearStateBank2Bit"
                )
                node["stateBank"] = 2
                node["stateValue"] = 1 if opcode_class == 0x60 else 0
                queue(node_id, following, continuation, "fallthrough")
            else:
                node["operation"] = "unknownLowClass"
                terminate(node_id, "unknownLowClass")
            continue

        if opcode < 0xE0:
            opcode_class = opcode & 0xF0
            if opcode_class == 0x80:
                if cursor + 1 >= stream_end:
                    raise BodyDecodeError(
                        f"truncated class 80 at {hx(cursor)}"
                    )
                encoded = ((opcode & 0x0F) << 8) | data[cursor + 1]
                saved = cursor + 2
                node["operation"] = "branchWithSavedContinuation"
                node["savedContinuation"] = record_relative(
                    saved,
                    record_start,
                )
                queue(
                    node_id,
                    saved + sign_extend(encoded, 12),
                    saved,
                    "unconditional",
                )
            elif opcode_class == 0x90:
                node["operation"] = "recordProgressOffset"
                queue(node_id, cursor + 2, continuation, "fallthrough")
            elif opcode_class in (0xA0, 0xB0):
                node["operation"] = "advanceOneByte"
                queue(node_id, cursor + 1, continuation, "fallthrough")
            elif opcode_class == 0xC0:
                node["operation"] = "setRuntimeByte"
                selector = opcode & 0x0F
                value = data[cursor + 1]
                node["runtimeFieldSelector"] = selector
                node["runtimeValueRaw"] = value
                if selector in (1, 2):
                    node["runtimeTarget"] = {
                        "scope": "manager",
                        "offset": hx(0x0F + selector),
                        "size": 1,
                        "value": value,
                    }
                elif 3 <= selector <= 6:
                    node["runtimeTarget"] = {
                        "scope": "person",
                        "offset": hx(0x08 + selector),
                        "size": 1,
                        "value": value,
                    }
                elif selector == 7:
                    node["runtimeTarget"] = {
                        "scope": "person",
                        "offset": "0x10",
                        "size": 4,
                        "value": sign_extend(value, 8),
                        "sourceSize": 1,
                    }
                else:
                    node["runtimeTarget"] = {
                        "scope": "none",
                        "observedBehavior": "no write",
                    }
                queue(node_id, cursor + 2, continuation, "fallthrough")
            elif opcode_class == 0xD0:
                if cursor + 2 >= stream_end:
                    raise BodyDecodeError(
                        f"truncated class D0 at {hx(cursor)}"
                    )
                encoded = (
                    ((opcode & 0x0F) << 16)
                    | (data[cursor + 1] << 8)
                    | data[cursor + 2]
                )
                node["operation"] = "relativeBranch20"
                queue(
                    node_id,
                    cursor + 3 + sign_extend(encoded, 20),
                    continuation,
                    "unconditional",
                )
            continue

        if opcode < 0xF0:
            if opcode == 0xE0:
                node["operation"] = "randomBlock"
                starts, _ = random_block_starts(
                    data,
                    cursor,
                    stream_end,
                )
                for target in starts:
                    queue(node_id, target, continuation, "randomChoice")
            elif opcode == 0xE1:
                if cursor + 10 >= stream_end:
                    raise BodyDecodeError(
                        f"truncated E1 native event at {hx(cursor)}"
                    )
                node["operation"] = "submitNativeEventAndYield"
                node["nativeRuntimeState"] = 6
                node["payloadByte"] = data[cursor + 2]
                node["nativeArguments"] = [
                    sign_extend(
                        (data[cursor + offset] << 8)
                        | data[cursor + offset + 1],
                        16,
                    )
                    for offset in (3, 5, 7, 9)
                ]
                queue(
                    node_id,
                    cursor + 11,
                    continuation,
                    "afterExternalCompletion",
                )
            elif opcode == 0xE2:
                node["operation"] = "nativeEventAndYield"
                node["nativeRuntimeState"] = 6
                queue(
                    node_id,
                    cursor + 2,
                    continuation,
                    "afterExternalCompletion",
                )
            elif opcode == 0xE3:
                node["operation"] = "advanceTwoBytes"
                queue(
                    node_id,
                    cursor + 2,
                    continuation,
                    "fallthrough",
                )
            elif opcode == 0xE4:
                node["operation"] = "actorNativeEventAndYield"
                node["nativeRuntimeState"] = 7
                queue(
                    node_id,
                    cursor + 2 + data[cursor + 1],
                    continuation,
                    "afterExternalCompletion",
                )
            else:
                if cursor + 1 >= stream_end:
                    raise BodyDecodeError(
                        f"truncated E-class opcode at {hx(cursor)}"
                    )
                node["operation"] = "skipLengthPrefixedPayload"
                queue(
                    node_id,
                    cursor + 2 + data[cursor + 1],
                    continuation,
                    "fallthrough",
                )
            continue

        if opcode == 0xF0:
            expression_end, expression = parse_expression(
                data,
                cursor + 1,
                stream_end,
            )
            node["operation"] = "evaluateExpression"
            node["expressionId"] = expression["id"]
            queue(
                node_id,
                expression_end,
                continuation,
                "expressionResult",
            )
        elif opcode in (0xF1, 0xF4, 0xFA, 0xFB, 0xFD, 0xFE):
            node["operation"] = "advanceOneByte"
            queue(node_id, cursor + 1, continuation, "fallthrough")
        elif opcode == 0xF2:
            node["operation"] = "yieldWithDeferredThreeByteAdvance"
            queue(
                node_id,
                cursor + 4,
                continuation,
                "afterState5Completion",
            )
        elif opcode == 0xF5:
            if cursor + 3 >= stream_end:
                raise BodyDecodeError(f"truncated F5 at {hx(cursor)}")
            encoded = (
                (data[cursor + 1] << 16)
                | (data[cursor + 2] << 8)
                | data[cursor + 3]
            )
            target = cursor + 4 + sign_extend(encoded, 24)
            node["operation"] = "storeContinuation64"
            node["storedContinuation64"] = record_relative(
                target,
                record_start,
            )
            queue(node_id, cursor + 4, continuation, "fallthrough")
        elif opcode == 0xF9:
            node["operation"] = "resumeSavedContinuation"
            if continuation is not None:
                queue(
                    node_id,
                    continuation,
                    None,
                    "runtimeContinuation60",
                )
            terminate(
                node_id,
                "runtimeContinuation5cOrExternalState",
            )
        elif opcode == 0xFC:
            node["operation"] = "yieldState6"
            queue(
                node_id,
                cursor + 1,
                continuation,
                "afterExternalCompletion",
            )
        elif opcode in (0xF3, 0xF6, 0xF7, 0xF8, 0xFF):
            node["operation"] = "nativeStateTransition"
            terminate(
                node_id,
                "conversationLifecycleTransition",
                opcode=hx(opcode),
            )
        else:
            node["operation"] = "unknownControlOpcode"
            terminate(node_id, "unknownControlOpcode", opcode=hx(opcode))

    nodes.sort(key=lambda item: item["id"])
    edges.sort(key=lambda item: (item["from"], item["to"], item["kind"]))
    terminations.sort(key=lambda item: (item["nodeId"], item["kind"]))
    groups = sorted(
        message_groups.values(),
        key=lambda item: int(item["startOffset"], 16),
    )
    return {
        "bodyOffset": record_relative(body_start, record_start),
        "encodedBodyEndOffsetExclusive": record_relative(
            body_end,
            record_start,
        ),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "messageGroupCount": len(groups),
        "messageSelectionCount": sum(
            len(group["messageSelections"]) for group in groups
        ),
        "dynamicBoundaryCount": sum(
            item["kind"]
            in {
                "runtimeContinuation5cOrExternalState",
                "nestedDynamicContinuation",
                "progressTableMayRedirect",
            }
            for item in terminations
        ),
        "messageGroups": groups,
        "nodes": nodes,
        "edges": edges,
        "terminations": terminations,
    }


def extract_resources(humans: bytes) -> list[dict[str, Any]]:
    resources = []
    for archive_entry in afs_entries(humans):
        package = humans[
            archive_entry["offset"] :
            archive_entry["offset"] + archive_entry["length"]
        ]
        for child in package_children(package):
            data = child["data"]
            if child["extension"] != "BIN" or data[:4] != b"SCNF":
                continue
            record_start = 0x10
            record = parse_scnf(data)["records"][0]
            routing_start = record_start + int.from_bytes(
                data[record_start + 0x14 : record_start + 0x18],
                "little",
            )
            routing_end = record_start + int.from_bytes(
                data[record_start + 0x18 : record_start + 0x1C],
                "little",
            )
            selector = decode_route_graph(
                data,
                record_start,
                routing_start,
                routing_end,
            )
            bodies = []
            for entry in selector["entries"]:
                body_start = record_start + int(entry["bodyOffset"], 16)
                body_end = record_start + int(
                    entry["bodyEndOffsetExclusive"],
                    16,
                )
                graph = decode_body_graph(
                    data,
                    body_start,
                    body_end,
                    routing_start,
                    routing_end,
                    record_start,
                    len(record["messages"]),
                )
                bodies.append({
                    "markerOffset": entry["markerOffset"],
                    "incomingExpressionIds": entry[
                        "incomingExpressionIds"
                    ],
                    "graph": graph,
                })
            resources.append({
                "actorCode": child["name"],
                "afsEntryIndex": archive_entry["index"],
                "packageChildIndex": child["index"],
                "resourceSha256": sha256(data),
                "messageCount": len(record["messages"]),
                "routingStartOffset": selector["routingStartOffset"],
                "routingEndOffsetExclusive": selector[
                    "routingEndOffsetExclusive"
                ],
                "bodies": bodies,
            })
    resources.sort(
        key=lambda item: (
            item["actorCode"],
            item["resourceSha256"],
            item["afsEntryIndex"],
        )
    )
    return resources


def build_report(executable: bytes, humans: bytes) -> dict[str, Any]:
    humans_digest = sha256(humans)
    if humans_digest != HUMANS_SHA256:
        raise BodyDecodeError(
            f"unexpected HUMANS.AFS SHA-256: {humans_digest}"
        )
    resources = extract_resources(humans)
    bodies = [
        body["graph"]
        for resource in resources
        for body in resource["bodies"]
    ]
    unique_selection_sites = {
        (
            resource["resourceSha256"],
            selection["opcodeOffset"],
            selection["messageIndex"],
        )
        for resource in resources
        for body in resource["bodies"]
        for group in body["graph"]["messageGroups"]
        for selection in group["messageSelections"]
    }
    selected_indexes = {
        (resource["resourceSha256"], selection["messageIndex"])
        for resource in resources
        for body in resource["bodies"]
        for group in body["graph"]["messageGroups"]
        for selection in group["messageSelections"]
    }
    termination_counts = Counter(
        termination["kind"]
        for body in bodies
        for termination in body["terminations"]
    )
    runtime_field_write_counts = Counter(
        (
            node["runtimeTarget"]["scope"],
            node["runtimeTarget"].get("offset"),
            node["runtimeTarget"].get("value"),
        )
        for body in bodies
        for node in body["nodes"]
        if node.get("operation") == "setRuntimeByte"
    )
    native_command_counts = Counter(
        command["commandWord"]
        for body in bodies
        for group in body["messageGroups"]
        for command in group["nativeCommands"]
    )
    event_opcode_counts = Counter(
        node["opcode"]
        for body in bodies
        for node in body["nodes"]
        if 0xE0 <= int(node["opcode"], 16) < 0xF0
    )
    event_operation_counts = Counter(
        node["operation"]
        for body in bodies
        for node in body["nodes"]
        if 0xE0 <= int(node["opcode"], 16) < 0xF0
    )
    submitted_event_sites = [
        {
            "actorCode": resource["actorCode"],
            "resourceSha256": resource["resourceSha256"],
            "afsEntryIndex": resource["afsEntryIndex"],
            "markerOffset": body["markerOffset"],
            "opcodeOffset": node["offset"],
            "payloadByte": node["payloadByte"],
            "nativeArguments": node["nativeArguments"],
        }
        for resource in resources
        for body in resource["bodies"]
        for node in body["graph"]["nodes"]
        if node.get("operation") == "submitNativeEventAndYield"
    ]
    return {
        "schema": "new-yokosuka-dialogue-actor-body-routes-v1",
        "evidenceBoundary": [
            "The outer conversation interpreter and nested message constructor are represented separately, matching native dispatch.",
            "F2 uses its verified two-stage state-5 continuation at opcode +4; F5 stores a target but falls through.",
            "Branches may enter shared routines outside a marker's encoded body span but never outside the actor routing stream.",
            "F9 paths requiring runtime +0x5c and progress-marker redirects remain explicit dynamic boundaries.",
            "Class C0 target fields and signedness reproduce the verified native mid-opcode handler; selectors with no native target remain no-ops.",
            "External animation, presentation, and input completion are labeled on edges but are not assigned guessed timing or gameplay meaning.",
        ],
        "executableEvidence": verify_executable(executable),
        "archiveEvidence": {
            "filename": "HUMANS.AFS",
            "sha256": humans_digest,
            "byteLength": len(humans),
        },
        "summary": {
            "resourceCount": len(resources),
            "bodyCount": len(bodies),
            "graphNodeCount": sum(body["nodeCount"] for body in bodies),
            "graphEdgeCount": sum(body["edgeCount"] for body in bodies),
            "messageGroupCount": sum(
                body["messageGroupCount"] for body in bodies
            ),
            "uniqueMessageSelectionSiteCount": len(
                unique_selection_sites
            ),
            "selectedResourceMessageIndexCount": len(selected_indexes),
            "dynamicBoundaryCount": sum(
                body["dynamicBoundaryCount"] for body in bodies
            ),
            "terminationCounts": dict(sorted(termination_counts.items())),
            "runtimeFieldWrites": [
                {
                    "scope": scope,
                    "offset": offset,
                    "value": value,
                    "count": count,
                }
                for (scope, offset, value), count in sorted(
                    runtime_field_write_counts.items()
                )
            ],
            "nativePresentationCommands": [
                {
                    "commandWord": command_word,
                    "count": count,
                }
                for command_word, count in sorted(
                    native_command_counts.items()
                )
            ],
            "eventOpcodes": [
                {
                    "opcode": opcode,
                    "operation": next(
                        node["operation"]
                        for body in bodies
                        for node in body["nodes"]
                        if node["opcode"] == opcode
                    ),
                    "count": count,
                }
                for opcode, count in sorted(event_opcode_counts.items())
            ],
            "eventOperations": dict(sorted(event_operation_counts.items())),
            "submittedNativeEventSites": submitted_event_sites,
        },
        "resources": resources,
    }


def compact_evidence(report: dict[str, Any]) -> dict[str, Any]:
    wanted = {"BOB_", "AKMI"}
    examples = []
    for resource in report["resources"]:
        if resource["actorCode"] not in wanted:
            continue
        examples.append({
            "actorCode": resource["actorCode"],
            "resourceSha256": resource["resourceSha256"],
            "messageCount": resource["messageCount"],
            "bodies": [
                {
                    "markerOffset": body["markerOffset"],
                    "bodyOffset": body["graph"]["bodyOffset"],
                    "nodeCount": body["graph"]["nodeCount"],
                    "messageSelections": [
                        selection
                        for group in body["graph"]["messageGroups"]
                        for selection in group["messageSelections"]
                    ],
                    "nativeCommands": [
                        command
                        for group in body["graph"]["messageGroups"]
                        for command in group["nativeCommands"]
                    ],
                    "dynamicBoundaryCount": body["graph"][
                        "dynamicBoundaryCount"
                    ],
                }
                for body in resource["bodies"]
            ],
        })
    return {
        key: report[key]
        for key in (
            "schema",
            "evidenceBoundary",
            "executableEvidence",
            "archiveEvidence",
            "summary",
        )
    } | {"examples": examples}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    parser.add_argument("--output", type=Path, default=DEFAULT_FULL_OUTPUT)
    parser.add_argument(
        "--evidence-output",
        type=Path,
        default=DEFAULT_EVIDENCE_OUTPUT,
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report = build_report(
        args.executable.read_bytes(),
        args.humans.read_bytes(),
    )
    write_json(args.output, report)
    write_json(args.evidence_output, compact_evidence(report))
    print(json.dumps(report["summary"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
