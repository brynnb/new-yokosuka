#!/usr/bin/env python3
"""Build an evidence-first operation trace for every runtime JOMO object tag.

JOMO's SCN3 section is native SH-4. Engine calls use a stable dispatcher ABI:

    r5 = operation id
    r0 = *(context + 40)
    r4 = *(context + 52)
    r6 = downward-growing argument stack
    jsr @r0

This tool resolves arguments from the local basic block, associates literal
four-character object arguments with the runtime TASK registry, and preserves
parameterized/static-table evidence without pretending it is a direct call.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import (
    STATIC_BASE,
    UNKNOWN,
    Symbol,
    disassemble,
    printable_tag,
)


OPERATION_NAMES = {
    0x00C9: "HMDL node transform",
    0x0139: "tagged object action",
}
CONTROL_FLOW = {
    "bra",
    "braf",
    "bf",
    "bf.s",
    "bt",
    "bt.s",
    "bsr",
    "bsrf",
    "jmp",
    "jsr",
    "rts",
}


@dataclass(frozen=True)
class ResolvedValue:
    kind: str
    value: int | None = None
    source: str | None = None


UNRESOLVED = ResolvedValue("unresolved")


def parse_immediate(value: str) -> int | None:
    if not value.startswith("#"):
        return None
    try:
        return int(value[1:], 0) & 0xFFFFFFFF
    except ValueError:
        return None


def assigned_register(mnemonic: str, operands: str) -> str | None:
    if "," not in operands:
        return None
    destination = operands.rsplit(",", 1)[1]
    if destination.startswith("r") and destination[1:].isdigit():
        return destination
    return None


def resolve_register(
    instructions: list[tuple[int, str, str, int | None]],
    register: str,
    before_index: int,
    static_data_base: int,
    depth: int = 0,
) -> ResolvedValue:
    if depth > 12:
        return UNRESOLVED
    for index in range(before_index - 1, -1, -1):
        address, mnemonic, operands, literal = instructions[index]
        if mnemonic in CONTROL_FLOW:
            if (
                register == "r0"
                and mnemonic in {"bsr", "bsrf", "jsr"}
            ):
                return ResolvedValue(
                    "call-result",
                    source=f"0x{address:x}",
                )
            return ResolvedValue(
                "runtime",
                source=f"control flow before 0x{address:x}",
            )
        destination = assigned_register(mnemonic, operands)
        if destination != register:
            continue

        if mnemonic == "mov":
            source = operands.split(",", 1)[0]
            immediate = parse_immediate(source)
            if immediate is not None:
                return ResolvedValue("constant", immediate, f"0x{address:x}")
            if source.startswith("r") and source[1:].isdigit():
                return resolve_register(
                    instructions,
                    source,
                    index,
                    static_data_base,
                    depth + 1,
                )
            return ResolvedValue("runtime", source=f"{source} at 0x{address:x}")

        if mnemonic == "mov.l":
            source = operands.rsplit(",", 1)[0]
            if literal is not None:
                return ResolvedValue("constant", literal, f"0x{address:x}")
            if source == "@(4,r8)":
                return ResolvedValue(
                    "static-base",
                    static_data_base,
                    f"0x{address:x}",
                )
            return ResolvedValue("runtime", source=f"{source} at 0x{address:x}")

        if mnemonic == "add":
            source = operands.split(",", 1)[0]
            left = resolve_register(
                instructions,
                register,
                index,
                static_data_base,
                depth + 1,
            )
            immediate = parse_immediate(source)
            if immediate is not None and left.kind in {"constant", "static-base"}:
                value = ((left.value or 0) + immediate) & 0xFFFFFFFF
                kind = "static-pointer" if left.kind == "static-base" else "constant"
                return ResolvedValue(kind, value, f"0x{address:x}")
            if source.startswith("r") and source[1:].isdigit():
                right = resolve_register(
                    instructions,
                    source,
                    index,
                    static_data_base,
                    depth + 1,
                )
                if (
                    left.kind in {"constant", "static-base"}
                    and right.kind == "constant"
                ):
                    value = ((left.value or 0) + (right.value or 0)) & 0xFFFFFFFF
                    kind = (
                        "static-pointer"
                        if left.kind == "static-base"
                        else "constant"
                    )
                    return ResolvedValue(kind, value, f"0x{address:x}")
            return ResolvedValue("runtime", source=f"add at 0x{address:x}")

        return ResolvedValue("runtime", source=f"{mnemonic} at 0x{address:x}")
    return UNRESOLVED


def call_argument_count(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
) -> int | None:
    return call_argument_count_evidence(instructions, call_index)[0]


def call_argument_count_evidence(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
) -> tuple[int | None, str | None]:
    # The return value may be popped before the argument stack is reclaimed.
    for _, mnemonic, operands, _ in instructions[
        call_index + 2 : call_index + 8
    ]:
        if mnemonic == "add" and operands.endswith(",r13"):
            immediate = parse_immediate(operands.split(",", 1)[0])
            if immediate is not None:
                return immediate // 4, "local-stack-cleanup"
        if mnemonic == "bra":
            try:
                target = int(operands, 0)
            except ValueError:
                return None, None
            target_index = next(
                (
                    index
                    for index, row in enumerate(instructions)
                    if row[0] == target
                ),
                None,
            )
            if target_index is None:
                return None, None
            # Some generated tail blocks share one exact stack-reclamation
            # epilogue through a direct branch. Only the target block's first
            # few straight-line instructions are considered.
            for _, target_mnemonic, target_operands, _ in instructions[
                target_index:target_index + 4
            ]:
                if (
                    target_mnemonic == "add"
                    and target_operands.endswith(",r13")
                ):
                    immediate = parse_immediate(
                        target_operands.split(",", 1)[0]
                    )
                    if immediate is not None:
                        return immediate // 4, "direct-branch-shared-cleanup"
                if target_mnemonic in CONTROL_FLOW:
                    return None, None
            return None, None
        if mnemonic in CONTROL_FLOW:
            break
    return None, None


def call_arguments(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
    count: int,
    static_data_base: int,
) -> list[ResolvedValue]:
    pushes: list[ResolvedValue] = []
    for index in range(call_index - 3, -1, -1):
        address, mnemonic, operands, _ = instructions[index]
        if mnemonic in CONTROL_FLOW:
            break
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            register = operands.split(",", 1)[0]
            pushes.append(
                resolve_register(
                    instructions,
                    register,
                    index,
                    static_data_base,
                )
            )
            if len(pushes) == count:
                break
    # The script pushes source arguments left-to-right onto a downward-growing
    # stack.  The final push is therefore the first word at r6, which is also
    # the first word consumed by the native handler.  A backward scan already
    # sees arguments in that ABI order; reversing this list would display every
    # multi-argument operation backwards.
    resolved = pushes
    return [UNRESOLVED] * (count - len(resolved)) + resolved


def indexed_runtime_table_source(
    instructions: list[tuple[int, str, str, int | None]],
    register: str,
    before_index: int,
) -> dict[str, Any] | None:
    """Recognize ``*(context + base + scaled_index)`` argument provenance.

    The generated JOMO code uses r9 as its persistent coroutine/context base.
    This deliberately recognizes only the complete literal-base, r9-add,
    indexed-add, dereference chain. Partial similarities are not evidence.
    """

    saw_dereference = False
    saw_context_add = False
    index_sources: list[str] = []
    for index in range(before_index - 1, max(-1, before_index - 32), -1):
        address, mnemonic, operands, literal = instructions[index]
        if mnemonic in CONTROL_FLOW:
            break
        destination = assigned_register(mnemonic, operands)
        if destination != register:
            continue

        source = operands.rsplit(",", 1)[0] if "," in operands else ""
        if mnemonic == "mov.l" and source == f"@{register}":
            if saw_dereference:
                return None
            saw_dereference = True
            continue

        if mnemonic == "add" and source == "r9":
            if not saw_dereference:
                return None
            saw_context_add = True
            continue

        if mnemonic == "add" and source.startswith("r"):
            if saw_dereference and not saw_context_add:
                index_sources.append(f"{source} at 0x{address:x}")
                continue
            return None

        if mnemonic == "mov.l" and literal is not None:
            if saw_dereference and saw_context_add:
                return {
                    "kind": "indexed-runtime-context-table",
                    "baseOffset": literal,
                    "baseOffsetHex": f"0x{literal:x}",
                    "indexSources": list(reversed(index_sources)),
                    "evidenceFileOffsets": [
                        f"0x{address:x}",
                        f"0x{instructions[before_index][0]:x}",
                    ],
                }
            return None

        # Any other write to the tracked register breaks the exact chain.
        return None
    return None


def call_argument_sources(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
    count: int,
) -> list[dict[str, Any] | None]:
    sources: list[dict[str, Any] | None] = []
    for index in range(call_index - 3, -1, -1):
        _, mnemonic, operands, _ = instructions[index]
        if mnemonic in CONTROL_FLOW:
            break
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            register = operands.split(",", 1)[0]
            sources.append(
                indexed_runtime_table_source(
                    instructions,
                    register,
                    index,
                )
            )
            if len(sources) == count:
                break
    # As in call_arguments(), the backward scan is already in native r6 memory
    # order because the argument stack grows downward.
    resolved = sources
    return [None] * (count - len(resolved)) + resolved


def value_json(value: ResolvedValue) -> dict[str, Any]:
    result: dict[str, Any] = {"kind": value.kind}
    if value.value is not None:
        result["value"] = value.value
        result["hex"] = f"0x{value.value:08x}"
        tag = printable_tag(value.value)
        if tag is not None:
            result["ascii"] = tag
    if value.source is not None:
        result["source"] = value.source
    return result


def extract_dispatch_calls(
    instructions: list[tuple[int, str, str, int | None]],
    static_data_base: int,
    target_byte_offset: int = 40,
    context_byte_offset: int = 52,
) -> list[dict[str, Any]]:
    calls: list[dict[str, Any]] = []
    for index, (address, mnemonic, operands, _) in enumerate(instructions):
        if mnemonic != "jsr" or operands != "@r0" or index < 3:
            continue
        if (
            instructions[index - 2][1:3] != (
                "mov.l",
                f"@({target_byte_offset},r8),r0",
            )
            or instructions[index - 1][1:3] != (
                "mov.l",
                f"@({context_byte_offset},r8),r4",
            )
        ):
            continue
        operation = resolve_register(
            instructions,
            "r5",
            index - 2,
            static_data_base,
        )
        count, count_recovery = call_argument_count_evidence(
            instructions,
            index,
        )
        if count is None and operation.value == 0x00C9:
            # The ABI is independently proven from the engine handler. A few
            # coroutine exits do not reclaim the stack in the local block.
            count = 5
        arguments = (
            call_arguments(instructions, index, count, static_data_base)
            if count is not None
            else []
        )
        argument_sources = (
            call_argument_sources(instructions, index, count)
            if count is not None
            else []
        )
        encoded_arguments = []
        for value, source in zip(arguments, argument_sources):
            encoded = value_json(value)
            if source is not None:
                encoded["provenance"] = source
            encoded_arguments.append(encoded)
        calls.append(
            {
                "callFileOffset": f"0x{address:x}",
                "operationId": operation.value
                if operation.kind == "constant"
                else None,
                "operationHex": (
                    f"0x{operation.value:04x}"
                    if operation.kind == "constant"
                    else None
                ),
                "operationName": OPERATION_NAMES.get(operation.value),
                "argumentCount": count,
                "argumentCountRecovery": count_recovery,
                "arguments": encoded_arguments,
            }
        )
    return calls


def exact_offsets(data: bytes, needle: bytes, start: int) -> list[int]:
    offsets: list[int] = []
    offset = start
    while True:
        offset = data.find(needle, offset)
        if offset < 0:
            return offsets
        offsets.append(offset)
        offset += 1


def static_records(
    data: bytes,
    tags: set[str],
    static_data_base: int,
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for tag in tags:
        raw = tag.encode("ascii")
        for offset in exact_offsets(data, raw, static_data_base):
            record: dict[str, Any] = {"fileOffset": f"0x{offset:x}"}
            # The JOMO interaction records are 32-byte-aligned within this
            # static section and begin with the object tag.
            if offset % 0x20 == 0 and offset + 0x20 <= len(data):
                words = struct.unpack_from("<8I", data, offset)
                record["recordWords"] = [f"0x{word:08x}" for word in words]
                record["recordFloats"] = []
                for word in words[2:5]:
                    value = struct.unpack("<f", struct.pack("<I", word))[0]
                    record["recordFloats"].append(
                        value if math.isfinite(value) else None
                    )
            result[tag].append(record)
    return result


def static_tag_groups(
    data: bytes,
    tags: set[str],
    start: int,
    end: int,
) -> tuple[list[dict[str, Any]], dict[str, list[int]]]:
    groups: list[dict[str, Any]] = []
    membership: dict[str, list[int]] = defaultdict(list)
    offset = start
    group_index = 0
    while offset + 4 <= min(end, len(data)):
        if data[offset : offset + 4] != b"\xff\xff\xff\xff":
            offset += 4
            continue
        cursor = offset + 4
        header: list[str] = []
        members: list[str] = []
        while cursor + 4 <= min(end, len(data)):
            raw = data[cursor : cursor + 4]
            if raw == b"\xff\xff\xff\xff":
                break
            text = raw.decode("ascii", errors="ignore")
            if text in tags:
                members.append(text)
            elif members:
                break
            else:
                header.append(f"0x{struct.unpack('<I', raw)[0]:08x}")
            cursor += 4
        if members:
            group = {
                "index": group_index,
                "fileOffset": f"0x{offset:x}",
                "headerWords": header,
                "objectTags": members,
            }
            groups.append(group)
            for tag in members:
                membership[tag].append(group_index)
            group_index += 1
            offset = cursor
        else:
            offset += 4
    return groups, membership


def operation_signature(call: dict[str, Any], tag: str) -> tuple[Any, ...]:
    arguments = call["arguments"]
    tag_indices = tuple(
        index
        for index, argument in enumerate(arguments)
        if argument.get("ascii") == tag
    )
    argument_kinds = tuple(
        (
            argument["kind"],
            argument.get("hex"),
            argument.get("ascii"),
        )
        for argument in arguments
    )
    return (
        call["operationId"],
        call["argumentCount"],
        tag_indices,
        argument_kinds,
    )


def aggregate_direct_calls(
    calls: list[dict[str, Any]],
    tags: set[str],
) -> dict[str, list[dict[str, Any]]]:
    per_tag: dict[str, dict[tuple[Any, ...], dict[str, Any]]] = defaultdict(dict)
    for call in calls:
        call_tags = {
            argument["ascii"]
            for argument in call["arguments"]
            if argument.get("ascii") in tags
        }
        for tag in call_tags:
            signature = operation_signature(call, tag)
            aggregate = per_tag[tag].setdefault(
                signature,
                {
                    "operationId": call["operationId"],
                    "operationHex": call["operationHex"],
                    "operationName": call["operationName"],
                    "argumentCount": call["argumentCount"],
                    "tagArgumentIndices": list(signature[2]),
                    "arguments": call["arguments"],
                    "callFileOffsets": [],
                },
            )
            aggregate["callFileOffsets"].append(call["callFileOffset"])
    return {
        tag: list(aggregates.values())
        for tag, aggregates in per_tag.items()
    }


def generated_tag_tables(
    instructions: list[tuple[int, str, str, int | None]],
) -> list[dict[str, Any]]:
    """Verify and describe generated tag-to-handle tables in this script."""

    by_address = {
        address: (mnemonic, operands, literal)
        for address, mnemonic, operands, literal in instructions
    }
    proof = {
        0x15834: ("mov.l", "@(4,r14),r5", None),
        0x15836: ("mov.l", "0x1596c,r6", 0x01000000),
        0x15838: ("mul.l", "r6,r5", None),
        0x1583A: ("sts", "macl,r5", None),
        0x1583C: ("mov.l", "0x15970,r6", 0x30726F64),
        0x1583E: ("add", "r6,r5", None),
        0x15846: ("mov.l", "r5,@-r13", None),
        0x1584C: ("mov", "#8,r5", None),
        0x15852: ("jsr", "@r0", None),
        0x1589C: ("mov.l", "0x15980,r4", 0x1A8),
        0x1589E: ("add", "r9,r4", None),
        0x158A6: ("add", "r5,r4", None),
        0x158A8: ("mov.l", "@(8,r14),r5", None),
        0x158AA: ("mov.l", "r5,@r4", None),
        0x15922: ("add", "r6,r5", None),
        0x1592A: ("mov", "#10,r5", None),
        0x1592C: ("cmp/ge", "r5,r4", None),
    }
    if not all(by_address.get(address) == expected for address, expected in proof.items()):
        return []
    return [
        {
            "baseOffset": 0x1A8,
            "baseOffsetHex": "0x1a8",
            "tags": [f"dor{index}" for index in range(10)],
            "initializerFileRange": ["0x15830", "0x15938"],
            "creationOperationId": 0x0008,
            "creationOperationHex": "0x0008",
            "tagFormula": (
                "little-endian 0x30726f64 + index * 0x01000000, "
                "for integer index 0 <= index < 10"
            ),
            "handleStore": "context + 0x1a8 + index * 4",
            "proofFileOffsets": [
                f"0x{address:x}" for address in sorted(proof)
            ],
        }
    ]


def parameterized_calls_by_tag(
    calls: list[dict[str, Any]],
    tables: list[dict[str, Any]],
) -> tuple[dict[str, list[dict[str, Any]]], set[str]]:
    tags_by_base = {
        table["baseOffset"]: table["tags"]
        for table in tables
    }
    per_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bound_offsets: set[str] = set()
    for call in calls:
        matching_tags: set[str] = set()
        for argument in call["arguments"]:
            provenance = argument.get("provenance")
            if provenance is None:
                continue
            matching_tags.update(
                tags_by_base.get(provenance.get("baseOffset"), [])
            )
        if not matching_tags:
            continue
        bound_offsets.add(call["callFileOffset"])
        encoded = {
            **call,
            "parameterizedObjectTags": sorted(matching_tags),
        }
        for tag in matching_tags:
            per_tag[tag].append(encoded)
    return dict(per_tag), bound_offsets


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Trace engine operations for all JOMO runtime object tags.",
    )
    parser.add_argument("mapinfo", type=Path)
    parser.add_argument("runtime_manifest", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")

    data = args.mapinfo.read_bytes()
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x30 > len(data):
        parser.error("input does not contain a complete SCN3 token")
    code_start = scn3_offset + 0x30
    code_end = scn3_offset + struct.unpack_from(
        "<I",
        data,
        scn3_offset + 0x0C,
    )[0]
    static_data_base = scn3_offset + struct.unpack_from(
        "<I",
        data,
        scn3_offset + 0x10,
    )[0]
    runtime = json.loads(args.runtime_manifest.read_text())
    runtime_objects = runtime.get("objectTags", [])
    tags = {entry["objectTag"] for entry in runtime_objects}

    instructions = [
        instruction
        for instruction in disassemble(args.mapinfo, args.objdump)
        if code_start <= instruction[0] < code_end
    ]
    calls = extract_dispatch_calls(instructions, static_data_base)
    direct_calls = aggregate_direct_calls(calls, tags)
    generated_tables = generated_tag_tables(instructions)
    parameterized_calls, parameterized_bound_offsets = parameterized_calls_by_tag(
        calls,
        generated_tables,
    )
    records = static_records(data, tags, static_data_base)
    groups, membership = static_tag_groups(
        data,
        tags,
        0x9B700,
        0x9B960,
    )

    objects = []
    status_counts: Counter[str] = Counter()
    for runtime_object in runtime_objects:
        tag = runtime_object["objectTag"]
        tag_calls = direct_calls.get(tag, [])
        tag_parameterized_calls = parameterized_calls.get(tag, [])
        tag_records = records.get(tag, [])
        tag_groups = membership.get(tag, [])
        if tag_calls:
            status = "direct-engine-operations"
        elif tag_groups:
            status = "static-group-metadata-no-direct-call"
        elif tag_records:
            status = "static-metadata-only"
        else:
            status = "runtime-only-unresolved"
        status_counts[status] += 1
        objects.append(
            {
                **runtime_object,
                "traceStatus": status,
                "staticOccurrences": tag_records,
                "staticGroupIndices": tag_groups,
                "directEngineOperations": tag_calls,
                "parameterizedEngineOperations": tag_parameterized_calls,
            }
        )

    operation_counts = Counter(
        call["operationHex"] or "unresolved"
        for call in calls
    )
    object_action_calls = [
        call
        for call in calls
        if call["operationId"] == 0x0139
    ]
    non_runtime_literal_transforms = [
        call
        for call in calls
        if (
            call["operationId"] == 0x00C9
            and call["callFileOffset"] not in parameterized_bound_offsets
            and not any(
                argument.get("ascii") in tags
                for argument in call["arguments"]
            )
            and bool(call["arguments"])
            and any(
                argument.get("ascii") is not None
                for argument in call["arguments"]
            )
        )
    ]
    non_runtime_literal_offsets = {
        call["callFileOffset"]
        for call in non_runtime_literal_transforms
    }
    unbound_transforms = [
        call
        for call in calls
        if (
            call["operationId"] == 0x00C9
            and call["callFileOffset"] not in parameterized_bound_offsets
            and call["callFileOffset"] not in non_runtime_literal_offsets
            and not any(
                argument.get("ascii") in tags
                for argument in call["arguments"]
            )
        )
    ]
    direct_transform_call_count = sum(
        1
        for call in calls
        if (
            call["operationId"] == 0x00C9
            and any(
                argument.get("ascii") in tags
                for argument in call["arguments"]
            )
        )
    )
    parameterized_transform_call_count = sum(
        1
        for call in calls
        if (
            call["operationId"] == 0x00C9
            and call["callFileOffset"] in parameterized_bound_offsets
        )
    )
    result = {
        "schema": "new-yokosuka-jomo-object-operation-trace-v1",
        "source": {
            "mapinfo": str(args.mapinfo),
            "runtimeManifest": str(args.runtime_manifest),
            "codeRange": [
                f"0x{code_start:x}",
                f"0x{code_end:x}",
            ],
            "staticDataFileOffset": f"0x{static_data_base:x}",
        },
        "method": {
            "dispatcherAbi": (
                "operation in r5; context in r4; argument stack in r6; jsr @r0"
            ),
            "directEvidence": (
                "object tag resolved as an actual argument at an engine call"
            ),
            "staticGroupEvidence": (
                "object tag occurs in a static group table; the table's "
                "purpose and runtime local-to-call dataflow are not guessed"
            ),
            "parameterizedEvidence": (
                "object handle loaded from a context table whose complete "
                "generated-tag initializer is proven in native code"
            ),
        },
        "summary": {
            "runtimeObjectCount": len(runtime_objects),
            "engineDispatchCallCount": len(calls),
            "directObjectTagCount": len(direct_calls),
            "objectTransformCallCount": operation_counts.get("0x00c9", 0),
            "objectActionCallCount": len(object_action_calls),
            "directObjectTransformCallCount": direct_transform_call_count,
            "parameterizedObjectTransformCallCount": (
                parameterized_transform_call_count
            ),
            "nonRuntimeLiteralObjectTransformCallCount": (
                len(non_runtime_literal_transforms)
            ),
            "unboundObjectTransformCallCount": len(unbound_transforms),
            "operationCounts": dict(sorted(operation_counts.items())),
            "traceStatusCounts": dict(sorted(status_counts.items())),
        },
        "generatedTagTables": generated_tables,
        "objectActionCalls": object_action_calls,
        "staticGroups": groups,
        "nonRuntimeLiteralObjectTransformCalls": (
            non_runtime_literal_transforms
        ),
        "unboundObjectTransformCalls": unbound_transforms,
        "objects": objects,
    }

    encoded = json.dumps(result, indent=2, allow_nan=False) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(encoded)
        print(f"Wrote {args.out} ({len(objects)} objects, {len(calls)} calls)")
    else:
        sys.stdout.write(encoded)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
