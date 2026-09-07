#!/usr/bin/env python3
"""Recover native actor-conversation entry routing without flattening it.

The free-conversation selector at ``0x0c15b3f8`` executes the byte stream
copied from static SCNF record pointer ``+0x14`` into runtime person pointer
``+0x40``.  It evaluates embedded stack expressions, follows signed relative
branches, and returns the body immediately after a high-nibble ``0x10``
entry marker.

This extractor reproduces that selector as a control-flow graph.  It does not
scan the byte stream linearly: entry bodies contain bytes that would be false
opcodes if interpreted outside their native control-flow boundary.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

from tools.lib.portable_paths import portable_project_path

from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_EXECUTABLE,
    DEFAULT_HUMANS,
    EXECUTABLE_SHA256,
    HUMANS_SHA256,
    RUNTIME_BASE,
    afs_entries,
    hx,
    package_children,
    sha256,
    write_json,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_FULL_OUTPUT = (
    ROOT / ".disc-work" / "dialogue" / "actor-conversation-entry-routes.json"
)
DEFAULT_EVIDENCE_OUTPUT = (
    ROOT / "tools" / "evidence" / "dialogue-actor-entry-routes.json"
)

VERIFIED_RANGES = {
    "initialEntrySelector": (
        0x0C15B3F8,
        248,
        "06f350e2f60e04554e24fba3dd13f769a3a88538e4da204a11c43ce2eebcfc22",
    ),
    "prefixExpressionEvaluator": (
        0x0C15B10A,
        710,
        "12e31bbda3001f111cb51c23d9b17d70aa1092b0cbbf35f717b75cfa36b41dea",
    ),
    "expressionValueResolver": (
        0x0C15AEF8,
        76,
        "54f703003755706a8e17903adaa9ce5145e1c248d8d7f1ecf7af8d550368b49b",
    ),
    "entryMarkerScanner": (
        0x0C15BF02,
        54,
        "e042ab9e2838b6cd06ee99b09a3d633c849eb1aefe5ed3a75b3d663e251eccb0",
    ),
}

OPERATORS = {
    0: "terminate",
    1: "assign",
    2: "increment",
    3: "decrement",
    4: "isZero",
    5: "booleanAnd",
    6: "booleanOr",
    7: "equal",
    8: "notEqual",
    # FUN_0c15b10a evaluates the lower stack item as the left operand and
    # the upper stack item as the right operand.
    9: "greaterThan",
    10: "greaterThanOrEqual",
    11: "lessThan",
    12: "lessThanOrEqual",
}

OPERAND_TYPES = {
    0x00: "nativeValueType2",
    0x20: "nativeValueType3",
    0x40: "nativeValueType4",
    0x60: "literal",
    0xA0: "runtimeSelector",
    0xC0: "actorRuntimeIdentity",
    0xE0: "nativeSpatialResult",
}


class RouteDecodeError(ValueError):
    """A bounded native route stream could not be decoded exactly."""


def executable_slice(data: bytes, address: int, size: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + size > len(data):
        raise RouteDecodeError(
            f"executable range {hx(address)}+{size} is unavailable"
        )
    return data[offset : offset + size]


def verify_executable(data: bytes) -> dict[str, Any]:
    digest = sha256(data)
    if digest != EXECUTABLE_SHA256:
        raise RouteDecodeError(f"unexpected 1ST_READ.BIN SHA-256: {digest}")
    ranges = {}
    for name, (address, size, expected) in VERIFIED_RANGES.items():
        actual = sha256(executable_slice(data, address, size))
        if actual != expected:
            raise RouteDecodeError(
                f"verified native range {name} changed: {actual}"
            )
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": actual,
        }
    return {
        "filename": "1ST_READ.BIN",
        "runtimeBase": hx(RUNTIME_BASE),
        "sha256": digest,
        "verifiedCodeRanges": ranges,
    }


def sign_extend(value: int, bits: int) -> int:
    sign = 1 << (bits - 1)
    return value - (1 << bits) if value & sign else value


def canonical_id(value: Any) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("ascii")
    return hashlib.sha256(encoded).hexdigest()[:16]


def operand(token: int, next_byte: int) -> dict[str, Any]:
    group = token & 0xE0
    if group not in OPERAND_TYPES:
        raise RouteDecodeError(f"unsupported expression token {token:#04x}")
    if group == 0xA0:
        if token != 0xA0:
            raise RouteDecodeError(
                f"runtime-selector token has unexpected low bits: {token:#04x}"
            )
        return {
            "kind": OPERAND_TYPES[group],
            "mode": next_byte,
            "nativeValueType": 1,
        }

    value = ((token & 0x0F) << 8) | next_byte
    if group == 0x40 and value == 0x0FFF:
        return {
            "kind": "literal",
            "value": -1,
            "nativeValueType": 1,
            "encodedAs": "nativeValueType4SpecialMinusOne",
        }
    return {
        "kind": OPERAND_TYPES[group],
        "value": value,
        "nativeValueType": {
            0x00: 2,
            0x20: 3,
            0x40: 4,
            0x60: 1,
            0xC0: 5,
            0xE0: 6,
        }[group],
    }


def parse_expression(
    data: bytes,
    start: int,
    end: int,
) -> tuple[int, dict[str, Any]]:
    """Parse one exact expression beginning immediately after opcode F0."""

    cursor = start
    stack: list[dict[str, Any]] = []
    tokens = []
    while cursor < end:
        token_offset = cursor
        token = data[cursor]
        group = token & 0xE0
        cursor += 1

        if group != 0x80:
            if cursor >= end:
                raise RouteDecodeError(
                    f"truncated expression operand at {hx(token_offset)}"
                )
            node = operand(token, data[cursor])
            tokens.append({
                "offset": hx(token_offset),
                "token": hx(token),
                "nextByte": hx(data[cursor]),
            })
            cursor += 1
            stack.append(node)
            continue

        opcode = token & 0x1F
        tokens.append({
            "offset": hx(token_offset),
            "token": hx(token),
            "operator": OPERATORS.get(opcode, f"unknown{opcode:02d}"),
        })
        if opcode == 0:
            if not stack:
                raise RouteDecodeError(
                    f"expression terminates with an empty stack at "
                    f"{hx(token_offset)}"
                )
            ast = stack[-1]
            raw = data[start:cursor]
            return cursor, {
                "id": canonical_id(ast),
                "startOffset": hx(start),
                "endOffsetExclusive": hx(cursor),
                "byteLength": len(raw),
                "rawSha256": sha256(raw),
                "ast": ast,
                "tokens": tokens,
                "remainingStackDepth": len(stack),
            }

        if opcode in (2, 3, 4):
            if not stack:
                raise RouteDecodeError(
                    f"unary operator {opcode} underflows at {hx(token_offset)}"
                )
            stack[-1] = {
                "kind": "operator",
                "opcode": opcode,
                "operation": OPERATORS[opcode],
                "operand": stack[-1],
            }
            continue

        if opcode in range(1, 13):
            if len(stack) < 2:
                raise RouteDecodeError(
                    f"binary operator {opcode} underflows at "
                    f"{hx(token_offset)}"
                )
            right = stack.pop()
            left = stack.pop()
            stack.append({
                "kind": "operator",
                "opcode": opcode,
                "operation": OPERATORS[opcode],
                "left": left,
                "right": right,
            })
            continue

        # The native switch leaves unknown operator tokens without a stack
        # mutation. Preserve them in the token stream if the corpus contains
        # one rather than assigning behavior.

    raise RouteDecodeError(
        f"expression at {hx(start)} has no native terminate operator"
    )


def record_relative(offset: int, record_start: int) -> str:
    return hx(offset - record_start)


def decode_route_graph(
    data: bytes,
    record_start: int,
    routing_start: int,
    routing_end: int,
) -> dict[str, Any]:
    if not (record_start <= routing_start < routing_end <= len(data)):
        raise RouteDecodeError(
            f"invalid routing bounds {hx(routing_start)}..{hx(routing_end)}"
        )

    worklist: list[tuple[int, str | None]] = [(routing_start, None)]
    visited: set[tuple[int, str | None]] = set()
    nodes = []
    edges = []
    expressions: dict[str, dict[str, Any]] = {}
    entries: dict[int, dict[str, Any]] = {}
    terminations = []

    def queue(
        source_id: str,
        target: int,
        expression_id: str | None,
        edge_kind: str,
    ) -> None:
        edges.append({
            "from": source_id,
            "toOffset": record_relative(target, record_start),
            "toExpressionId": expression_id,
            "kind": edge_kind,
        })
        worklist.append((target, expression_id))

    while worklist:
        cursor, expression_id = worklist.pop()
        state = (cursor, expression_id)
        if state in visited:
            continue
        visited.add(state)
        node_id = (
            f"{record_relative(cursor, record_start)}:"
            f"{expression_id or 'initial'}"
        )
        if not routing_start <= cursor < routing_end:
            terminations.append({
                "nodeId": node_id,
                "kind": "outOfBoundsBranch",
                "offset": record_relative(cursor, record_start),
            })
            continue

        opcode = data[cursor]
        node = {
            "id": node_id,
            "offset": record_relative(cursor, record_start),
            "opcode": hx(opcode),
            "lastExpressionId": expression_id,
        }
        nodes.append(node)

        if opcode < 0x80:
            if cursor + 1 >= routing_end:
                raise RouteDecodeError(
                    f"truncated low opcode at {hx(cursor)}"
                )
            encoded = ((opcode & 0x0F) << 8) | data[cursor + 1]
            opcode_class = opcode & 0x70
            following = cursor + 2
            node["encodedOperand"] = encoded
            if opcode_class == 0x00:
                node["operation"] = "advanceTwoBytes"
                queue(node_id, following, expression_id, "fallthrough")
            elif opcode_class == 0x10:
                body_end = following + encoded
                if body_end > routing_end:
                    raise RouteDecodeError(
                        f"entry body at {hx(cursor)} exceeds routing stream"
                    )
                node["operation"] = "returnEntryBody"
                node["bodyOffset"] = record_relative(
                    following,
                    record_start,
                )
                node["bodyByteLength"] = encoded
                entry = entries.setdefault(cursor, {
                    "markerOffset": record_relative(cursor, record_start),
                    "bodyOffset": record_relative(following, record_start),
                    "bodyEndOffsetExclusive": record_relative(
                        body_end,
                        record_start,
                    ),
                    "bodyByteLength": encoded,
                    "incomingExpressionIds": [],
                })
                if expression_id not in entry["incomingExpressionIds"]:
                    entry["incomingExpressionIds"].append(expression_id)
            elif opcode_class == 0x40:
                displacement = sign_extend(encoded, 12)
                node["operation"] = "branchIfLastExpressionZero"
                node["signedDisplacement"] = displacement
                queue(
                    node_id,
                    following + displacement,
                    expression_id,
                    "lastExpressionZero",
                )
                queue(
                    node_id,
                    following,
                    expression_id,
                    "lastExpressionNonzero",
                )
            elif opcode_class == 0x50:
                displacement = sign_extend(encoded, 12)
                node["operation"] = "relativeBranch12"
                node["signedDisplacement"] = displacement
                queue(
                    node_id,
                    following + displacement,
                    expression_id,
                    "unconditional",
                )
            else:
                node["operation"] = "nativeNullReturn"
                terminations.append({
                    "nodeId": node_id,
                    "kind": "nativeNullReturn",
                    "opcode": hx(opcode),
                })
            continue

        if opcode < 0xE0:
            if opcode & 0xF0 == 0xD0:
                if cursor + 2 >= routing_end:
                    raise RouteDecodeError(
                        f"truncated 20-bit branch at {hx(cursor)}"
                    )
                encoded = (
                    ((opcode & 0x0F) << 16)
                    | (data[cursor + 1] << 8)
                    | data[cursor + 2]
                )
                displacement = sign_extend(encoded, 20)
                node["operation"] = "relativeBranch20"
                node["encodedOperand"] = encoded
                node["signedDisplacement"] = displacement
                queue(
                    node_id,
                    cursor + 3 + displacement,
                    expression_id,
                    "unconditional",
                )
            else:
                node["operation"] = "advanceOneByte"
                queue(node_id, cursor + 1, expression_id, "fallthrough")
            continue

        if opcode == 0xF0:
            expression_end, expression = parse_expression(
                data,
                cursor + 1,
                routing_end,
            )
            existing = expressions.get(expression["id"])
            if existing is not None and existing["ast"] != expression["ast"]:
                raise RouteDecodeError(
                    f"expression ID collision: {expression['id']}"
                )
            if existing is None:
                expressions[expression["id"]] = {
                    "id": expression["id"],
                    "ast": expression["ast"],
                    "occurrences": [],
                }
            occurrence = {
                key: expression[key]
                for key in (
                    "startOffset",
                    "endOffsetExclusive",
                    "byteLength",
                    "rawSha256",
                    "remainingStackDepth",
                )
            }
            if occurrence not in expressions[expression["id"]]["occurrences"]:
                expressions[expression["id"]]["occurrences"].append(
                    occurrence
                )
            node["operation"] = "evaluateExpression"
            node["expressionId"] = expression["id"]
            node["expressionEndOffsetExclusive"] = record_relative(
                expression_end,
                record_start,
            )
            queue(
                node_id,
                expression_end,
                expression["id"],
                "expressionResult",
            )
            continue

        if opcode == 0xF1:
            node["operation"] = "advanceOneByte"
            queue(node_id, cursor + 1, expression_id, "fallthrough")
            continue

        node["operation"] = "nativeNullReturn"
        terminations.append({
            "nodeId": node_id,
            "kind": "nativeNullReturn",
            "opcode": hx(opcode),
        })

    for entry in entries.values():
        entry["incomingExpressionIds"].sort(
            key=lambda value: "" if value is None else value
        )
    nodes.sort(key=lambda item: (int(item["offset"], 16), item["id"]))
    edges.sort(
        key=lambda item: (
            item["from"],
            int(item["toOffset"], 16),
            item["kind"],
        )
    )
    return {
        "routingStartOffset": record_relative(routing_start, record_start),
        "routingEndOffsetExclusive": record_relative(
            routing_end,
            record_start,
        ),
        "routingByteLength": routing_end - routing_start,
        "routingBytesSha256": sha256(data[routing_start:routing_end]),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "expressionCount": len(expressions),
        "entryMarkerCount": len(entries),
        "entryStateVariantCount": sum(
            len(item["incomingExpressionIds"])
            for item in entries.values()
        ),
        "terminationCount": len(terminations),
        "expressions": sorted(
            expressions.values(),
            key=lambda item: item["id"],
        ),
        "entries": sorted(
            entries.values(),
            key=lambda item: int(item["markerOffset"], 16),
        ),
        "nodes": nodes,
        "edges": edges,
        "terminations": sorted(
            terminations,
            key=lambda item: item["nodeId"],
        ),
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
            if int.from_bytes(data[8:12], "little") != 1:
                raise RouteDecodeError(
                    f"{child['name']} actor SCNF does not have one record"
                )
            record_start = 0x10
            record_size = int.from_bytes(
                data[record_start + 4 : record_start + 8],
                "little",
            )
            if record_start + record_size != len(data):
                raise RouteDecodeError(
                    f"{child['name']} record size does not fill its SCNF"
                )
            routing_relative = int.from_bytes(
                data[record_start + 0x14 : record_start + 0x18],
                "little",
            )
            messages_relative = int.from_bytes(
                data[record_start + 0x18 : record_start + 0x1C],
                "little",
            )
            if not routing_relative or not messages_relative:
                raise RouteDecodeError(
                    f"{child['name']} has no routing or message table"
                )
            routing_start = record_start + routing_relative
            routing_end = record_start + messages_relative
            graph = decode_route_graph(
                data,
                record_start,
                routing_start,
                routing_end,
            )
            resources.append({
                "actorCode": child["name"],
                "afsEntryIndex": archive_entry["index"],
                "packageChildIndex": child["index"],
                "resourceSha256": sha256(data),
                "recordSize": record_size,
                "graph": graph,
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
        raise RouteDecodeError(
            f"unexpected HUMANS.AFS SHA-256: {humans_digest}"
        )
    resources = extract_resources(humans)
    all_expressions = {
        expression["id"]: expression["ast"]
        for resource in resources
        for expression in resource["graph"]["expressions"]
    }
    operator_counts = Counter()

    def count_operators(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("kind") == "operator":
            operator_counts[node["operation"]] += 1
        for value in node.values():
            if isinstance(value, dict):
                count_operators(value)

    for expression in all_expressions.values():
        count_operators(expression)

    termination_counts = Counter(
        termination["kind"]
        for resource in resources
        for termination in resource["graph"]["terminations"]
    )
    return {
        "schema": "new-yokosuka-dialogue-actor-entry-routes-v1",
        "evidenceBoundary": [
            "The native executable, selector, expression evaluator, value resolver, and entry-marker scanner ranges are SHA-256 verified.",
            "Routing begins at exact SCNF static pointer +0x14 and is bounded by the exact message-table pointer at +0x18.",
            "The report follows native control flow from the selector entry. It does not linearly reinterpret embedded entry bodies as selector opcodes.",
            "Expression operands retain native value types. Ordered comparison directions follow the verified lower-stack-left evaluator behavior.",
            "Graph edges preserve cycles and shared branches. No actor name, schedule, proximity, or manually authored dialogue rule affects routing.",
        ],
        "executableEvidence": verify_executable(executable),
        "archiveEvidence": {
            "filename": "HUMANS.AFS",
            "sha256": humans_digest,
            "byteLength": len(humans),
        },
        "nativeSchema": {
            "staticRoutingPointerOffset": hx(0x14),
            "runtimeRoutingPointerOffset": hx(0x40),
            "staticMessageTablePointerOffset": hx(0x18),
            "runtimeMessageTablePointerOffset": hx(0x44),
            "entryMarkerClass": hx(0x10),
            "entryBodyAddress": "marker + 2",
            "branchDisplacements": (
                "signed, relative to the first byte after each instruction"
            ),
            "expressionEncoding": "typed reverse-Polish stack program",
            "operators": {
                str(key): value for key, value in OPERATORS.items()
            },
        },
        "summary": {
            "resourceCount": len(resources),
            "uniqueActorCodeCount": len({
                resource["actorCode"] for resource in resources
            }),
            "graphNodeCount": sum(
                resource["graph"]["nodeCount"] for resource in resources
            ),
            "graphEdgeCount": sum(
                resource["graph"]["edgeCount"] for resource in resources
            ),
            "entryMarkerCount": sum(
                resource["graph"]["entryMarkerCount"]
                for resource in resources
            ),
            "entryStateVariantCount": sum(
                resource["graph"]["entryStateVariantCount"]
                for resource in resources
            ),
            "uniqueExpressionCount": len(all_expressions),
            "expressionBytecodeOccurrenceCount": sum(
                len(expression["occurrences"])
                for resource in resources
                for expression in resource["graph"]["expressions"]
            ),
            "terminationCounts": dict(sorted(termination_counts.items())),
            "uniqueExpressionOperatorCounts": dict(
                sorted(operator_counts.items())
            ),
        },
        "resources": resources,
    }


def compact_report(
    report: dict[str, Any],
    full_output: Path,
) -> dict[str, Any]:
    examples = []
    for actor_code in ("AKMI", "BOB_"):
        resource = next(
            item
            for item in report["resources"]
            if item["actorCode"] == actor_code
        )
        graph = resource["graph"]
        examples.append({
            "actorCode": actor_code,
            "resourceSha256": resource["resourceSha256"],
            "routingStartOffset": graph["routingStartOffset"],
            "routingEndOffsetExclusive": graph[
                "routingEndOffsetExclusive"
            ],
            "routingBytesSha256": graph["routingBytesSha256"],
            "nodeCount": graph["nodeCount"],
            "edgeCount": graph["edgeCount"],
            "expressionCount": graph["expressionCount"],
            "entryMarkerCount": graph["entryMarkerCount"],
            "entryStateVariantCount": graph["entryStateVariantCount"],
            "entries": graph["entries"][:3],
            "expressionExamples": graph["expressions"][:2],
            "terminations": graph["terminations"],
        })
    return {
        key: report[key]
        for key in (
            "schema",
            "evidenceBoundary",
            "executableEvidence",
            "archiveEvidence",
            "nativeSchema",
            "summary",
        )
    } | {
        "examples": examples,
        "fullReport": portable_project_path(full_output),
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    result.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    result.add_argument("--full-out", type=Path, default=DEFAULT_FULL_OUTPUT)
    result.add_argument("--out", type=Path, default=DEFAULT_EVIDENCE_OUTPUT)
    return result


def main(argv: Iterable[str] | None = None) -> None:
    args = parser().parse_args(argv)
    report = build_report(
        args.executable.read_bytes(),
        args.humans.read_bytes(),
    )
    write_json(args.full_out, report)
    write_json(args.out, compact_report(report, args.full_out))
    print(
        "Recovered native entry-routing graphs for "
        f"{report['summary']['resourceCount']} actor resources: "
        f"{report['summary']['entryMarkerCount']} reachable entry markers "
        f"and {report['summary']['uniqueExpressionCount']} unique "
        "predicate expressions."
    )


if __name__ == "__main__":
    main()
