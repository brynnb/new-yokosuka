"""Exact local dataflow recovery for native event calls."""

from __future__ import annotations

import re
from typing import Any

from tools.worlds.extract_jomo_object_operations import (
    assigned_register,
    call_arguments,
    resolve_register,
    value_json,
)
from tools.scripting.native_event_predicates import (
    comparison_branch_outcomes,
    hx,
    signed_immediate,
)


FRAME_FIELD_SOURCE = re.compile(
    r"^@\((?P<offset>\d+),r14\) at 0x[0-9a-f]+$"
)
SCENE_FIELD_SOURCE = re.compile(
    r"^@\((?P<offset>\d+),r9\) at 0x[0-9a-f]+$"
)
SCENE_INDEXED_FIELD_SOURCE = re.compile(
    r"^@\(r0,r9\) at (?P<address>0x[0-9a-f]+)$"
)
FRAME_INDEXED_FIELD_SOURCE = re.compile(
    r"^@\(r0,r14\) at (?P<address>0x[0-9a-f]+)$"
)
ADDRESS_ADD_SOURCE = re.compile(
    r"^add at (?P<address>0x[0-9a-f]+)$"
)
STS_SOURCE = re.compile(r"^sts at (?P<address>0x[0-9a-f]+)$")
MEMORY_LOAD_SOURCE = re.compile(
    r"^(?P<mnemonic>mov\.[bwl]) at (?P<address>0x[0-9a-f]+)$"
)
INDIRECT_REGISTER = re.compile(r"^@(?P<register>r(?:1[0-5]|[0-9]))$")
BASE_REGISTER_SLOT = re.compile(
    r"^@\((?P<offset>\d+),(?P<base>r(?:1[0-5]|[0-9]))\),"
    r"(?P<destination>r(?:1[0-5]|[0-9]))$"
)
REGISTER = r"r(?:1[0-5]|[0-9])"
INDIRECT_MEMORY_SOURCE = re.compile(
    rf"^@(?P<register>{REGISTER}) at (?P<address>0x[0-9a-f]+)$"
)
FRAME_LOAD = re.compile(
    rf"^@\((?P<offset>\d+),r14\),(?P<register>{REGISTER})$"
)
FRAME_INDEXED_LOAD = re.compile(
    rf"^@\((?P<index>{REGISTER}),r14\),(?P<register>{REGISTER})$"
)
REGISTER_ADD = re.compile(
    rf"^(?P<source>{REGISTER}),(?P<destination>{REGISTER})$"
)
REGISTER_STORE = re.compile(
    rf"^(?P<source>{REGISTER}),@(?P<address>{REGISTER})$"
)
REGISTER_MOVE = re.compile(
    rf"^(?P<source>{REGISTER}),(?P<destination>{REGISTER})$"
)
HEX_SOURCE = re.compile(r"^0x[0-9a-f]+$")


def _exact_local_address_register(
    rows: dict[int, tuple[int, str, str, int | None]],
    register: str,
    before_address: int,
    depth: int = 0,
) -> dict[str, Any] | None:
    """Recover a complete local constant/frame/scene address expression.

    This is deliberately narrower than general SH-4 register dataflow.  It
    exists for generated argument forms that materialize ``r14 + constant``
    (or ``r9 + constant``), optionally through register-held constant adds,
    immediately before dereferencing the address.  Any control-flow boundary
    or unmodelled writer leaves the value unresolved.
    """

    if depth > 12:
        return None
    for address in sorted(
        (candidate for candidate in rows if candidate < before_address),
        reverse=True,
    ):
        _address, mnemonic, operands, literal = rows[address]
        if mnemonic in {
            "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
            "jmp", "jsr", "rts",
        }:
            return None
        destination = assigned_register(mnemonic, operands)
        if destination != register:
            continue
        if mnemonic == "mov":
            source = operands.split(",", 1)[0]
            immediate = signed_immediate(operands, register)
            if immediate is not None:
                return {"kind": "constant", "value": immediate}
            if re.fullmatch(REGISTER, source):
                return _exact_local_address_register(
                    rows, source, address, depth + 1,
                )
            return None
        if mnemonic == "mov.l" and literal is not None:
            return {"kind": "constant", "value": literal}
        if mnemonic == "add" and "," in operands:
            source = operands.split(",", 1)[0]
            prior = _exact_local_address_register(
                rows, register, address, depth + 1,
            )
            if prior is None:
                return None
            if source in {"r14", "r9"}:
                if prior.get("kind") != "constant":
                    return None
                return {
                    "kind": (
                        "frame-address" if source == "r14"
                        else "scene-address"
                    ),
                    "offset": prior["value"],
                }
            if not re.fullmatch(REGISTER, source):
                return None
            addition = _exact_local_address_register(
                rows, source, address, depth + 1,
            )
            if addition is None:
                ordered = [rows[item] for item in sorted(rows)]
                indices = {row[0]: index for index, row in enumerate(ordered)}
                addition = _exact_integer_register_expression(
                    ordered,
                    source,
                    indices[address],
                    0,
                    depth + 1,
                )
            if addition is None:
                return None
            if addition.get("kind") != "constant":
                if prior.get("kind") not in {
                    "frame-address", "scene-address",
                }:
                    return None
                return {
                    "kind": f"{prior['kind']}-expression",
                    "baseOffset": prior["offset"],
                    "offsetExpression": addition,
                }
            if prior.get("kind") == "constant":
                return {
                    "kind": "constant",
                    "value": prior["value"] + addition["value"],
                }
            if prior.get("kind") in {"frame-address", "scene-address"}:
                return {
                    "kind": prior["kind"],
                    "offset": prior["offset"] + addition["value"],
                }
            return None
        return None
    return None


def runtime_value_json(value: Any) -> dict[str, Any]:
    """Preserve exact coroutine-frame provenance for runtime-interface words."""

    encoded = value_json(value)
    frame_source = (
        FRAME_FIELD_SOURCE.fullmatch(value.source or "")
        if value.kind == "runtime"
        else None
    )
    if frame_source is None:
        return encoded
    return {
        "kind": "frame-field",
        "offset": int(frame_source.group("offset")),
        "width": 4,
        "signedLoad": False,
        "source": value.source,
    }


def operation_result_target(
    rows: dict[int, tuple[int, str, str, int | None]],
    call_offset: int,
) -> dict[str, Any] | None:
    cursor = call_offset + 4
    cleanup = rows.get(cursor)
    cleanup_bytes = 0
    if (
        cleanup is not None
        and cleanup[1] == "add"
        and signed_immediate(cleanup[2], "r13") is not None
    ):
        cleanup_bytes = signed_immediate(cleanup[2], "r13") or 0
        if cleanup_bytes < 0 or cleanup_bytes % 4 != 0:
            return None
        cursor += 2
    after = [rows.get(cursor + delta) for delta in (0, 2, 4)]
    if (
        any(row is None for row in after)
        or after[0][1:3] != ("mov", "r0,r4")
        or after[1][1:3] != ("mov.l", "@r13+,r5")
        or after[2][1] not in {"mov.b", "mov.w", "mov.l"}
        or after[2][2] != "r4,@r5"
    ):
        return None
    store_width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[after[2][1]]

    # The destination pointer is the stack word exposed by the operation's
    # exact argument cleanup and consumed by the following @r13+ load. Trace
    # that word backward through balanced argument pushes/cleanups, including
    # an intervening engine call, rather than choosing a nearby frame-address
    # push by distance.
    stack_offset = cleanup_bytes
    producer_address = None
    producer_register = None
    address = call_offset - 2
    while (row := rows.get(address)) is not None:
        mnemonic, operands = row[1:3]
        if mnemonic == "mov.l" and operands.endswith(",@-r13"):
            if stack_offset == 0:
                producer_address = address
                producer_register = operands.split(",", 1)[0]
                break
            if stack_offset < 4:
                return None
            stack_offset -= 4
        elif mnemonic == "add":
            adjustment = signed_immediate(operands, "r13")
            if adjustment is not None:
                if adjustment < 0 or adjustment % 4 != 0:
                    return None
                stack_offset += adjustment
            elif "r13" in operands:
                return None
        elif mnemonic == "mov.l" and operands.startswith("@r13+,"):
            stack_offset += 4
        elif "r13" in operands and mnemonic not in {"mov", "jsr"}:
            return None
        if mnemonic in {
            "bra", "braf", "bt", "bt/s", "bf", "bf/s", "jmp", "rts",
        }:
            return None
        address -= 2
    if producer_address is None or producer_register is None:
        return None

    target = _exact_local_address_register(
        rows,
        producer_register,
        producer_address,
    )
    if target is None or target.get("kind") not in {
        "frame-address",
        "scene-address",
    }:
        return None
    return {
        "kind": (
            "frameField"
            if target["kind"] == "frame-address"
            else "sceneField"
        ),
        "offset": target["offset"],
        "width": store_width,
        "storeFileOffset": hx(cursor + 4),
    }


def operation_result_comparison(
    rows: dict[int, tuple[int, str, str, int | None]],
    call_offset: int,
) -> dict[str, Any] | None:
    cursor = call_offset + 4
    cleanup = rows.get(cursor)
    cleanup_bytes = 0
    if (
        cleanup is not None
        and cleanup[1] == "add"
        and signed_immediate(cleanup[2], "r13") is not None
    ):
        cleanup_bytes = signed_immediate(cleanup[2], "r13") or 0
        cursor += 2
    compare = rows.get(cursor)
    if compare is None:
        return None
    constant = signed_immediate(compare[2], "r0")
    compare_address = cursor
    result_register = "r0"
    constant_register = ""
    if compare[1] != "cmp/eq" or constant is None:
        result_move = compare
        constant_move = rows.get(cursor + 2)
        register_compare = rows.get(cursor + 4)
        if (
            result_move[1] != "mov"
            or not result_move[2].startswith("r0,")
            or constant_move is None
            or constant_move[1] not in {"mov", "mov.l"}
            or register_compare is None
            or register_compare[1] != "cmp/eq"
            or "," not in register_compare[2]
        ):
            return None
        result_register = result_move[2].split(",", 1)[1]
        constant_register = constant_move[2].split(",", 1)[-1]
        constant = signed_immediate(constant_move[2], constant_register)
        if (
            constant is None
            and constant_move[1] == "mov.l"
            and constant_move[3] is not None
        ):
            literal = constant_move[3] & 0xffffffff
            constant = (
                literal - 0x100000000
                if literal & 0x80000000
                else literal
            )
        compared = register_compare[2].split(",", 1)
        if (
            constant is None
            or set(compared) != {result_register, constant_register}
        ):
            return None
        compare_address = cursor + 4

    branch = comparison_branch_outcomes(rows, compare_address)
    if branch is None:
        branch = _stacked_operation_result_expression(
            rows,
            call_offset,
            cursor,
            cleanup_bytes,
            result_register,
            constant_register,
            constant,
        )
        if branch is not None:
            return branch
    if branch is None:
        return None
    return {
        "kind": "operationResult",
        "comparison": "equal",
        "constant": constant,
        "compareFileOffset": hx(compare_address),
        "resolvedBranch": branch,
    }


def _stacked_operation_result_expression(
    rows: dict[int, tuple[int, str, str, int | None]],
    call_offset: int,
    cursor: int,
    cleanup_bytes: int,
    current_register: str,
    constant_register: str,
    constant: int,
) -> dict[str, Any] | None:
    """Recover the compiler's exact stacked-result bitwise conjunction.

    Room scripts retain one operation result below the next operation's
    arguments, normalize a comparison of the current result to an all-bits
    mask, then bitwise-AND both values before branching. Retaining the
    expression avoids reducing native return values to guessed booleans.
    """

    sequence = [rows.get(cursor + delta) for delta in range(0, 18, 2)]
    if (
        cleanup_bytes < 0
        or cleanup_bytes % 4 != 0
        or any(row is None for row in sequence)
        or sequence[0][1:3] != ("mov", f"r0,{current_register}")
        or sequence[1][1] != "mov"
        or sequence[1][2].rsplit(",", 1)[-1] != constant_register
        or sequence[2][1:3]
        != ("cmp/eq", f"{constant_register},{current_register}")
        or sequence[3][1:3]
        != ("subc", f"{current_register},{current_register}")
        or sequence[4][1] != "mov.l"
        or not sequence[4][2].startswith("@r13+,")
    ):
        return None
    previous_register = sequence[4][2].split(",", 1)[1]
    if (
        sequence[5][1:3]
        != ("and", f"{current_register},{previous_register}")
        or sequence[6][1:3] != ("mov", f"{previous_register},r0")
        or sequence[7][1] != "cmp/eq"
        or signed_immediate(sequence[7][2], "r0") != 0
    ):
        return None
    resolved_branch = comparison_branch_outcomes(rows, sequence[7][0])
    if resolved_branch is None:
        return None

    pushes = [
        row
        for address, row in sorted(rows.items(), reverse=True)
        if call_offset - 96 <= address < call_offset
        and row[1] == "mov.l"
        and row[2].endswith(",@-r13")
    ]
    skipped_argument_pushes = cleanup_bytes // 4
    if len(pushes) <= skipped_argument_pushes:
        return None
    retained_push = pushes[skipped_argument_pushes]
    retained_register = retained_push[2].split(",", 1)[0]
    result_move = next(
        (
            row
            for address, row in sorted(rows.items(), reverse=True)
            if retained_push[0] - 16 <= address < retained_push[0]
            and row[1:3] == ("mov", f"r0,{retained_register}")
        ),
        None,
    )
    if result_move is None:
        return None
    previous_call = next(
        (
            row
            for address, row in sorted(rows.items(), reverse=True)
            if result_move[0] - 20 <= address < result_move[0]
            and row[1] == "jsr"
            and row[2] == "@r0"
        ),
        None,
    )
    if previous_call is None:
        return None

    return {
        "kind": "operationResultExpression",
        "expression": {
            "kind": "bitwise-and",
            "operands": [
                {
                    "kind": "operation-result",
                    "callFileOffset": hx(previous_call[0]),
                },
                {
                    "kind": "comparison-mask",
                    "comparison": "equal",
                    "operand": {
                        "kind": "operation-result",
                        "callFileOffset": hx(call_offset),
                    },
                    "constant": constant,
                    "trueValue": -1,
                    "falseValue": 0,
                },
            ],
        },
        "comparison": "equal",
        "constant": 0,
        "compareFileOffset": hx(sequence[7][0]),
        "resolvedBranch": resolved_branch,
    }


def operation_result_numeric_transform(
    rows: dict[int, tuple[int, str, str, int | None]],
    call_offset: int,
) -> dict[str, Any] | None:
    """Recover the exact float-result/truncate/multiply/add/word-store form."""

    cursor = call_offset + 4
    cleanup = rows.get(cursor)
    if (
        cleanup is not None
        and cleanup[1] == "add"
        and signed_immediate(cleanup[2], "r13") is not None
    ):
        cursor += 2
    sequence = [rows.get(cursor + delta) for delta in range(0, 24, 2)]
    if (
        any(row is None for row in sequence)
        or sequence[0][1:3] != ("mov", "r0,r4")
        or sequence[1][1:3] != ("lds", "r4,fpul")
        or sequence[2][1:3] != ("fsts", "fpul,fr2")
        or sequence[3][1:3] != ("ftrc", "fr2,fpul")
        or sequence[4][1:3] != ("sts", "fpul,r4")
        or sequence[5][1] != "mov"
        or sequence[6][1:3] != ("mul.l", "r5,r4")
        or sequence[7][1:3] != ("sts", "macl,r4")
        or sequence[8][1] != "mov.l"
        or sequence[8][3] is None
        or sequence[9][1:3] != ("add", "r5,r4")
        or sequence[10][1:3] != ("mov.l", "@r13+,r5")
        or sequence[11][1:3] != ("mov.w", "r4,@r5")
    ):
        return None
    multiplier = signed_immediate(sequence[5][2], "r5")
    if multiplier is None:
        return None
    frame_offset = None
    definition_address = None
    for address in range(call_offset - 2, call_offset - 34, -2):
        add = rows.get(address)
        definition = rows.get(address - 2)
        if (
            add is not None
            and add[1:3] == ("add", "r14,r4")
            and definition is not None
            and definition[1] == "mov"
        ):
            offset = signed_immediate(definition[2], "r4")
            if (
                offset is not None
                and offset >= 0
                and any(
                    rows.get(push, (0, "", "", None))[1:3]
                    == ("mov.l", "r4,@-r13")
                    for push in range(address + 2, call_offset, 2)
                )
            ):
                frame_offset = offset
                definition_address = address - 2
                break
    if frame_offset is None:
        return None
    return {
        "kind": "float32-result-truncate-multiply-add",
        "multiplier": multiplier,
        "addend": sequence[8][3],
        "resultTarget": {
            "kind": "frameField",
            "offset": frame_offset,
            "width": 2,
            "addressDefinitionFileOffset": hx(definition_address),
            "storeFileOffset": hx(sequence[11][0]),
        },
        "transformFileOffsets": [
            hx(row[0])
            for row in sequence[:10]
        ],
    }


def operation_argument(
    argument: dict[str, Any],
    rows: dict[int, tuple[int, str, str, int | None]],
) -> dict[str, Any]:
    source = argument.get("source")
    if argument.get("kind") == "constant" and isinstance(source, str) \
            and HEX_SOURCE.fullmatch(source):
        address = int(source, 16)
        row = rows.get(address)
        destination = assigned_register(row[1], row[2]) if row is not None else None
        if row is not None and row[1] == "add" and destination is not None:
            corrected = _exact_local_address_register(
                rows, destination, address + 2,
            )
            if corrected is not None and corrected.get("kind") in {
                "frame-address", "scene-address",
                "frame-address-expression", "scene-address-expression",
            }:
                return {
                    **{
                        key: value for key, value in argument.items()
                        if key not in {"value", "hex", "ascii", "float32"}
                    },
                    **corrected,
                }
    match = (
        FRAME_FIELD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if match is not None:
        return {
            **argument,
            "kind": "frame-field",
            "offset": int(match.group("offset")),
        }
    scene_match = (
        SCENE_FIELD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if scene_match is not None:
        return {
            **argument,
            "kind": "scene-field",
            "offset": int(scene_match.group("offset")),
        }
    indexed_frame = (
        FRAME_INDEXED_FIELD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if indexed_frame is not None:
        address = int(indexed_frame.group("address"), 16)
        load = rows.get(address)
        offset_load = rows.get(address - 2)
        offset = None
        if (
            load is not None
            and load[1] in {"mov.b", "mov.w", "mov.l"}
            and load[2].startswith("@(r0,r14),")
            and offset_load is not None
            and offset_load[2].endswith(",r0")
        ):
            offset = (
                signed_immediate(offset_load[2], "r0")
                if offset_load[1] == "mov"
                else offset_load[3]
                if offset_load[1] == "mov.l"
                else None
            )
        if isinstance(offset, int) and offset >= 0:
            return {
                **argument,
                "kind": "frame-field",
                "offset": offset,
                "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
            }
    address_add = (
        ADDRESS_ADD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if address_add is not None:
        address = int(address_add.group("address"), 16)
        add = rows.get(address)
        load = rows.get(address - 2)
        base_register = None
        destination_register = None
        if add is not None and "," in add[2]:
            base_register, destination_register = add[2].split(",", 1)
        if (
            add is not None
            and add[1] == "add"
            and base_register in {"r14", "r9"}
            and destination_register is not None
            and load is not None
            and load[1] in {"mov", "mov.l"}
            and load[2].endswith(f",{destination_register}")
        ):
            offset = (
                signed_immediate(load[2], destination_register)
                if load[1] == "mov"
                else load[3]
            )
            if isinstance(offset, int) and offset >= 0:
                return {
                    **argument,
                    "kind": (
                        "frame-address"
                        if base_register == "r14"
                        else "scene-address"
                    ),
                    "offset": offset,
                }
        if destination_register is not None:
            dynamic_address = _exact_local_address_register(
                rows,
                destination_register,
                address + 2,
            )
            if dynamic_address is not None and dynamic_address.get("kind") in {
                "frame-address-expression", "scene-address-expression",
            }:
                return {**argument, **dynamic_address}
        if (
            add is not None
            and add[1] == "add"
            and destination_register is not None
        ):
            ordered = [rows[item] for item in sorted(rows)]
            indices = {row[0]: index for index, row in enumerate(ordered)}
            expression = _exact_integer_register_expression(
                ordered,
                destination_register,
                indices[address] + 1,
                0,
            )
            if expression is not None:
                return {**argument, **expression}
    memory_load = (
        MEMORY_LOAD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    indirect_memory = (
        INDIRECT_MEMORY_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if memory_load is None and indirect_memory is not None:
        load = rows.get(int(indirect_memory.group("address"), 16))
        if (
            load is not None
            and load[1] in {"mov.b", "mov.w", "mov.l"}
            and load[2].split(",", 1)[0]
            in {
                f"@{indirect_memory.group('register')}",
                f"@{indirect_memory.group('register')}+",
            }
        ):
            address = _exact_local_address_register(
                rows,
                indirect_memory.group("register"),
                load[0],
            )
            if address is not None and address.get("kind") in {
                "frame-address", "scene-address",
            }:
                return {
                    **argument,
                    "kind": (
                        "frame-field"
                        if address["kind"] == "frame-address"
                        else "scene-field"
                    ),
                    "offset": address["offset"],
                    "width": {
                        "mov.b": 1, "mov.w": 2, "mov.l": 4,
                    }[load[1]],
                }
    sts_source = (
        STS_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if sts_source is not None:
        expression = _exact_fpul_store_expression(
            rows, int(sts_source.group("address"), 16),
        )
        if expression is not None:
            return {**argument, **expression}
    if memory_load is not None:
        load = rows.get(int(memory_load.group("address"), 16))
        direct = (
            FRAME_LOAD.fullmatch(load[2])
            if load is not None
            and load[1] == memory_load.group("mnemonic")
            else None
        )
        if direct is not None:
            return {
                **argument,
                "kind": "frame-field",
                "offset": int(direct.group("offset")),
                "width": {
                    "mov.b": 1,
                    "mov.w": 2,
                    "mov.l": 4,
                }[load[1]],
            }
        indirect = (
            INDIRECT_REGISTER.fullmatch(load[2].split(",", 1)[0])
            if load is not None
            and load[1] == memory_load.group("mnemonic")
            and "," in load[2]
            else None
        )
        if indirect is not None:
            address = _exact_local_address_register(
                rows,
                indirect.group("register"),
                load[0],
            )
            if address is not None and address.get("kind") in {
                "frame-address", "scene-address",
            }:
                return {
                    **argument,
                    "kind": (
                        "frame-field"
                        if address["kind"] == "frame-address"
                        else "scene-field"
                    ),
                    "offset": address["offset"],
                    "width": {
                        "mov.b": 1, "mov.w": 2, "mov.l": 4,
                    }[load[1]],
                }
    indexed = (
        SCENE_INDEXED_FIELD_SOURCE.fullmatch(source)
        if argument.get("kind") == "runtime" and isinstance(source, str)
        else None
    )
    if indexed is None:
        return argument
    load = rows.get(int(indexed.group("address"), 16) - 2)
    if (
        load is None
        or load[1] not in {"mov", "mov.l"}
        or not load[2].endswith(",r0")
    ):
        return argument
    offset = (
        signed_immediate(load[2], "r0")
        if load[1] == "mov"
        else load[3]
    )
    if not isinstance(offset, int) or offset < 0:
        return argument
    return {
        **argument,
        "kind": "scene-field",
        "offset": offset,
    }


def operation_json(
    call: dict[str, Any],
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int | None = None,
) -> dict[str, Any]:
    call_offset = int(call["callFileOffset"], 16)
    arguments = call["arguments"]
    if static_data_base is not None:
        recovered = interleaved_current_scene_query_arguments(
            call,
            rows,
            static_data_base,
        )
        if recovered is not None:
            arguments = recovered
    result = {
        "callFileOffset": call["callFileOffset"],
        "operationId": call["operationId"],
        "operationHex": call["operationHex"],
        "arguments": [
            operation_argument(argument, rows)
            for argument in arguments
        ],
    }
    target = operation_result_target(rows, call_offset)
    if target is not None:
        result["resultTarget"] = target
    comparison = operation_result_comparison(rows, call_offset)
    if comparison is not None:
        result["resultComparison"] = comparison
    transform = operation_result_numeric_transform(rows, call_offset)
    if transform is not None:
        result["resultTransform"] = transform
    return result


def interleaved_current_scene_query_arguments(
    call: dict[str, Any],
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int,
) -> list[Any] | None:
    """Recover stack words preserved across an exact 0x019c query.

    Generated scripts sometimes push a tail of a later operation's record,
    query the current scene through zero-argument operation 0x019c without
    reclaiming that stack, push the query result (and possibly another word),
    then dispatch the eventual consumer.  The ordinary bounded scan correctly
    stops at the intervening call.  This adapter recognizes only consumers
    whose authored layouts are executable-proven, verifies the complete stack
    discipline around both calls, and retains every recovered word's original
    register-dataflow provenance.
    """
    raw = call.get("arguments", [])
    prefix_words = {
        0x0084: 2,
        0x019E: 5,
    }.get(call.get("operationId"))
    if (
        prefix_words is None
        or len(raw) <= prefix_words
        or len(raw) != {0x0084: 3, 0x019E: 7}[call["operationId"]]
        or any(
            argument.get("kind") != "unresolved"
            for argument in raw[:prefix_words]
        )
        or any(
            argument.get("kind") == "unresolved"
            for argument in raw[prefix_words:]
        )
        or raw[-1].get("kind") != "call-result"
        or not isinstance(raw[-1].get("source"), str)
    ):
        return None
    current = int(call["callFileOffset"], 16)
    previous = int(raw[-1]["source"], 16)
    exact_boundary = {
        previous: ("jsr", "@r0"),
        previous + 2: ("mov", "r13,r6"),
        current: ("jsr", "@r0"),
        current + 2: ("mov", "r13,r6"),
        current + 4: ("add", f"#{len(raw) * 4},r13"),
    }
    if any(
        rows.get(address, (None, None, None, None))[1:3] != expected
        for address, expected in exact_boundary.items()
    ):
        return None
    ordered = [rows[address] for address in sorted(rows)]
    indices = {row[0]: index for index, row in enumerate(ordered)}
    previous_index = indices.get(previous)
    current_index = indices.get(current)
    if previous_index is None or current_index is None:
        return None
    previous_operation = resolve_register(
        ordered,
        "r5",
        previous_index,
        static_data_base,
    )
    if (
        previous_operation.kind != "constant"
        or previous_operation.value != 0x019C
    ):
        return None
    bridge = [
        row for row in ordered
        if previous + 4 <= row[0] < current
    ]
    if (
        any(row[1] in {
            "bf", "bf.s", "bra", "braf", "bsr", "bsrf", "bt", "bt.s",
            "jmp", "jsr", "rts",
        } for row in bridge)
        or any(
            assigned_register(row[1], row[2]) == "r13"
            for row in bridge
        )
        or sum(
            row[1] == "mov.l" and row[2].endswith(",@-r13")
            for row in bridge
        ) != len(raw) - prefix_words
        or [
            (
                value.kind,
                value.value,
                value.source,
            ) for value in call_arguments(
                ordered,
                current_index,
                len(raw),
                static_data_base,
            )
        ] != [
            (
                argument.get("kind"),
                argument.get("value"),
                argument.get("source"),
            ) for argument in raw
        ]
    ):
        return None
    preserved_tail = call_arguments(
        ordered,
        previous_index,
        prefix_words,
        static_data_base,
    )
    if any(
        argument.kind in {"unresolved", "runtime"}
        for argument in preserved_tail
    ):
        return None
    return [
        *raw[prefix_words:],
        *(value_json(argument) for argument in preserved_tail),
    ]


def frame_field_additions(
    rows: dict[int, tuple[int, str, str, int | None]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact compiler-local frame dword additions.

    The generated scripts commonly materialize ``frame + offset`` in one
    register, load the same dword through r14, add a signed immediate held in
    another register, and store through the materialized address. The bounded
    scan retains only that complete def-use shape.
    """

    additions = []
    addresses = sorted(rows)
    allowed = reached if reached is not None else set(addresses)
    for address in addresses:
        if address not in allowed:
            continue
        add = rows[address]
        if add[1] != "add":
            continue
        registers = REGISTER_ADD.fullmatch(add[2])
        immediate_row = rows.get(address - 2)
        load_row = rows.get(address - 4)
        store_row = rows.get(address + 2)
        if (
            registers is None
            or immediate_row is None
            or load_row is None
            or store_row is None
            or immediate_row[1] != "mov"
            or load_row[1] != "mov.l"
            or store_row[1] != "mov.l"
        ):
            continue
        immediate = signed_immediate(
            immediate_row[2],
            registers.group("source"),
        )
        load = FRAME_LOAD.fullmatch(load_row[2])
        store = REGISTER_STORE.fullmatch(store_row[2])
        if (
            immediate is None
            or load is None
            or store is None
            or load.group("register") != registers.group("destination")
            or store.group("source") != registers.group("destination")
        ):
            continue
        offset = int(load.group("offset"))
        address_register = store.group("address")
        address_definition = None
        for cursor in range(address - 6, max(-2, address - 38), -2):
            prior = rows.get(cursor)
            if (
                prior is not None
                and prior[1] == "add"
                and prior[2] == f"r14,{address_register}"
            ):
                definition = rows.get(cursor - 2)
                if (
                    definition is not None
                    and definition[1] == "mov"
                    and signed_immediate(
                        definition[2],
                        address_register,
                    ) == offset
                ):
                    address_definition = cursor - 2
                break
            if (
                prior is not None
                and prior[1] == "mov"
                and signed_immediate(
                    prior[2],
                    address_register,
                ) == offset
                and rows.get(cursor + 2, (None, None, None, None))[1:3] == (
                    "add",
                    f"r14,{address_register}",
                )
            ):
                address_definition = cursor
                break
            if (
                prior is not None
                and (
                    prior[2] == address_register
                    or prior[2].endswith(f",{address_register}")
                )
            ):
                break
        if address_definition is None:
            continue
        additions.append({
            "kind": "frameFieldAdd",
            "callFileOffset": hx(store_row[0]),
            "offset": offset,
            "width": 4,
            "value": immediate,
            "addressDefinitionFileOffset": hx(address_definition),
            "loadFileOffset": hx(load_row[0]),
            "addFileOffset": hx(add[0]),
        })
    return additions


def frame_field_expression_writes(
    rows: dict[int, tuple[int, str, str, int | None]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover complete straight-line integer expressions stored in a frame.

    This models exact compiler-local arithmetic, not source-level intent.
    Register state is discarded at every call or control transfer, and a
    write is emitted only when its frame address and entire expression are
    available from the supported SH-4 subset.
    """

    allowed = reached if reached is not None else set(rows)
    registers: dict[str, dict[str, Any] | None] = {
        f"r{index}": None for index in range(16)
    }
    floating_registers: dict[str, dict[str, Any] | None] = {
        f"fr{index}": None for index in range(16)
    }
    fpul: dict[str, Any] | None = None
    macl: dict[str, Any] | None = None
    writes = []

    def constant(value: int) -> dict[str, Any]:
        return {"kind": "constant", "value": value & 0xffffffff}

    def binary(
        kind: str,
        left: dict[str, Any] | None,
        right: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if left is None or right is None:
            return None
        return {"kind": kind, "left": left, "right": right}

    calls = {"bsr", "bsrf", "jsr"}
    terminators = {
        "bra", "braf", "bf", "bf.s", "bt", "bt.s", "jmp", "rts",
    }
    for address in sorted(rows):
        if address not in allowed:
            continue
        _address, mnemonic, operands, literal = rows[address]
        parts = operands.split(",", 1) if "," in operands else []

        if mnemonic == "mov" and len(parts) == 2:
            source, destination = parts
            immediate = signed_immediate(operands, destination)
            registers[destination] = (
                constant(immediate)
                if immediate is not None
                else registers.get(source)
            )
        elif mnemonic == "mov.l" and len(parts) == 2 and literal is not None:
            registers[parts[1]] = constant(literal)
        elif mnemonic == "add" and len(parts) == 2:
            source, destination = parts
            current = registers.get(destination)
            if (
                source == "r14"
                and current is not None
                and current.get("kind") == "constant"
            ):
                registers[destination] = {
                    "kind": "frame-address",
                    "offset": current["value"],
                }
            else:
                operand = registers.get(source)
                if (
                    current is not None
                    and current.get("kind") == "frame-address"
                    and operand is not None
                    and operand.get("kind") == "constant"
                ):
                    registers[destination] = {
                        "kind": "frame-address",
                        "offset": current["offset"] + operand["value"],
                    }
                else:
                    registers[destination] = binary(
                        "add", current, operand,
                    )
        elif mnemonic in {"mov.b", "mov.w", "mov.l"} and len(parts) == 2:
            source, destination = parts
            width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
            direct = FRAME_LOAD.fullmatch(operands)
            indexed = FRAME_INDEXED_LOAD.fullmatch(operands)
            if direct is not None:
                registers[direct.group("register")] = {
                    "kind": "frame-field",
                    "offset": int(direct.group("offset")),
                    "width": width,
                    "signedLoad": width != 4,
                }
            elif indexed is not None:
                index = registers.get(indexed.group("index"))
                registers[indexed.group("register")] = (
                    {
                        "kind": "frame-field",
                        "offset": index["value"],
                        "width": width,
                        "signedLoad": width != 4,
                    }
                    if index is not None
                    and index.get("kind") == "constant"
                    else None
                )
            elif source.startswith("@") and source[1:] in registers:
                target = registers.get(source[1:])
                registers[destination] = (
                    {
                        "kind": "frame-field",
                        "offset": target["offset"],
                        "width": width,
                        "signedLoad": width != 4,
                    }
                    if target is not None
                    and target.get("kind") == "frame-address"
                    else None
                )
            elif destination.startswith("@") and destination[1:] in registers:
                target = registers.get(destination[1:])
                expression = registers.get(source)
                if (
                    target is not None
                    and target.get("kind") == "frame-address"
                    and expression is not None
                    and expression.get("kind") not in {
                        "constant", "frame-address",
                    }
                ):
                    writes.append({
                        "kind": "frameFieldExpressionWrite",
                        "callFileOffset": hx(address),
                        "offset": target["offset"],
                        "width": width,
                        "expression": expression,
                    })
        elif mnemonic == "neg" and len(parts) == 2:
            source, destination = parts
            value = registers.get(source)
            registers[destination] = (
                constant(-value["value"])
                if value is not None and value.get("kind") == "constant"
                else None
            )
        elif mnemonic == "shad" and len(parts) == 2:
            source, destination = parts
            count = registers.get(source)
            operand = registers.get(destination)
            registers[destination] = (
                {
                    "kind": "arithmetic-shift",
                    "operand": operand,
                    "count": (
                        count["value"] - 0x100000000
                        if count["value"] & 0x80000000
                        else count["value"]
                    ),
                }
                if operand is not None
                and count is not None
                and count.get("kind") == "constant"
                else None
            )
        elif mnemonic in {"and", "sub"} and len(parts) == 2:
            source, destination = parts
            registers[destination] = binary(
                "bitwise-and" if mnemonic == "and" else "subtract",
                registers.get(destination),
                registers.get(source),
            )
        elif mnemonic == "mul.l" and len(parts) == 2:
            source, destination = parts
            macl = binary(
                "multiply",
                registers.get(destination),
                registers.get(source),
            )
        elif mnemonic == "sts" and operands.startswith("macl,"):
            registers[operands.split(",", 1)[1]] = macl
        elif mnemonic == "lds" and operands.endswith(",fpul"):
            fpul = registers.get(operands.split(",", 1)[0])
        elif mnemonic == "sts" and operands.startswith("fpul,"):
            registers[operands.split(",", 1)[1]] = fpul
        elif mnemonic == "fsts" and operands.startswith("fpul,"):
            destination = operands.split(",", 1)[1]
            floating_registers[destination] = (
                {
                    "kind": "float32-from-word",
                    "operand": fpul,
                }
                if fpul is not None
                else None
            )
        elif mnemonic == "flds" and operands.endswith(",fpul"):
            source = operands.split(",", 1)[0]
            value = floating_registers.get(source)
            fpul = (
                {"kind": "float32-word", "operand": value}
                if value is not None
                else None
            )
        elif mnemonic == "float" and operands.startswith("fpul,"):
            destination = operands.split(",", 1)[1]
            floating_registers[destination] = (
                {
                    "kind": "signed-integer-to-float32",
                    "operand": fpul,
                }
                if fpul is not None
                else None
            )
        elif mnemonic in {"fdiv", "fmul"} and len(parts) == 2:
            source, destination = parts
            floating_registers[destination] = binary(
                "float32-divide" if mnemonic == "fdiv"
                else "float32-multiply",
                floating_registers.get(destination),
                floating_registers.get(source),
            )
        elif mnemonic == "ftrc" and operands.endswith(",fpul"):
            source = operands.split(",", 1)[0]
            value = floating_registers.get(source)
            fpul = (
                {
                    "kind": "float32-truncate-to-signed-integer",
                    "operand": value,
                }
                if value is not None
                else None
            )
        elif mnemonic in calls:
            for index in range(8):
                registers[f"r{index}"] = None
            floating_registers = {
                f"fr{index}": None for index in range(16)
            }
            fpul = None
            macl = None
        elif mnemonic in terminators:
            registers = {f"r{index}": None for index in range(16)}
            floating_registers = {
                f"fr{index}": None for index in range(16)
            }
            fpul = None
            macl = None
        elif len(parts) == 2 and parts[1] in registers:
            registers[parts[1]] = None

    return writes


def _exact_fpul_store_expression(
    rows: dict[int, tuple[int, str, str, int | None]],
    address: int,
) -> dict[str, Any] | None:
    """Recover an exact straight-line FPUL expression at a register store."""

    store = rows.get(address)
    if (
        store is None
        or store[1] != "sts"
        or not store[2].startswith("fpul,")
    ):
        return None
    target = store[2].split(",", 1)[1]
    if not re.fullmatch(REGISTER, target):
        return None
    boundaries = {
        "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
        "jmp", "jsr", "rts",
    }
    start = 0
    for candidate in sorted((item for item in rows if item < address), reverse=True):
        if rows[candidate][1] in boundaries:
            start = candidate + 2
            break
    local = {
        item: row for item, row in rows.items()
        if start <= item <= address
    }
    scratch = "r4" if target != "r4" else "r5"
    local[address + 2] = (address + 2, "mov", f"#0,{scratch}", None)
    local[address + 4] = (address + 4, "add", f"r14,{scratch}", None)
    local[address + 6] = (
        address + 6, "mov.l", f"{target},@{scratch}", None,
    )
    writes = frame_field_expression_writes(local)
    match = next((
        item for item in writes
        if item["callFileOffset"] == hx(address + 6)
    ), None)
    expression = match.get("expression") if match is not None else None
    return (
        expression
        if expression is not None
        and expression.get("kind") == "float32-truncate-to-signed-integer"
        else None
    )


def frame_field_constant_writes(
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int,
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact constant stores into the current coroutine frame."""

    ordered = [rows[address] for address in sorted(rows)]
    indices = {row[0]: index for index, row in enumerate(ordered)}
    allowed = reached if reached is not None else set(rows)
    writes = []
    for address in sorted(allowed):
        store = rows.get(address)
        if store is None or store[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        match = REGISTER_STORE.fullmatch(store[2])
        if match is None:
            continue
        address_register = match.group("address")
        frame_offset = None
        definition_address = None
        address_addend = 0
        for cursor in range(address - 2, max(-2, address - 26), -2):
            row = rows.get(cursor)
            if row is None:
                break
            if row[1] in {
                "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
                "jmp", "jsr", "rts",
            }:
                break
            if (
                row[1] == "add"
                and row[2] == f"r14,{address_register}"
            ):
                definition = rows.get(cursor - 2)
                offset = (
                    signed_immediate(definition[2], address_register)
                    if definition is not None and definition[1] == "mov"
                    else None
                )
                if offset is not None and offset >= 0:
                    frame_offset = offset + address_addend
                    definition_address = cursor - 2
                break
            if (
                row[1] == "add"
                and row[2].endswith(f",{address_register}")
            ):
                immediate = signed_immediate(row[2], address_register)
                if immediate is not None:
                    address_addend += immediate
                    continue
                source_register = row[2].split(",", 1)[0]
                source_definition = rows.get(cursor - 2)
                source_value = (
                    signed_immediate(
                        source_definition[2],
                        source_register,
                    )
                    if (
                        source_definition is not None
                        and source_definition[1] == "mov"
                    )
                    else None
                )
                if source_value is not None:
                    address_addend += source_value
                    continue
            if (
                row[2] == address_register
                or row[2].endswith(f",{address_register}")
            ):
                break
        if frame_offset is None:
            continue
        store_index = indices[address]
        value = resolve_register(
            ordered,
            match.group("source"),
            store_index,
            static_data_base,
        )
        if value.kind != "constant" or value.value is None:
            continue
        writes.append({
            "kind": "frameFieldWrite",
            "callFileOffset": hx(address),
            "offset": frame_offset,
            "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[store[1]],
            "value": value.value,
            "valueHex": f"0x{value.value:08x}",
            "addressDefinitionFileOffset": hx(definition_address),
            "valueSource": value.source,
        })
    return writes


def function_return_value(
    rows: dict[int, tuple[int, str, str, int | None]],
    reached: set[int] | None = None,
) -> dict[str, Any] | None:
    """Recover an exact frame-field value left in r0 at a function return."""

    allowed = reached if reached is not None else set(rows)
    matches = []
    for address in sorted(allowed):
        row = rows.get(address)
        if row is None or row[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        load = FRAME_LOAD.fullmatch(row[2])
        if load is None:
            continue
        value_register = load.group("register")
        transfer = rows.get(address + 2)
        mask_load = rows.get(address + 4)
        bitwise = rows.get(address + 6)
        result_transfer = rows.get(address + 8)
        if (
            transfer is None
            or transfer[1:3] != ("mov", f"{value_register},r4")
            or mask_load is None
            or mask_load[1] != "mov.l"
            or mask_load[3] is None
            or not mask_load[2].endswith(",r5")
            or bitwise is None
            or bitwise[1:3] != ("and", "r5,r4")
            or result_transfer is None
            or result_transfer[1:3] != ("mov", "r4,r0")
        ):
            continue
        return_row = next(
            (
                rows.get(cursor)
                for cursor in range(address + 10, address + 22, 2)
                if rows.get(cursor, (0, "", "", None))[1] == "rts"
            ),
            None,
        )
        if return_row is None:
            continue
        matches.append({
            "kind": "frame-field-mask",
            "offset": int(load.group("offset")),
            "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[row[1]],
            "mask": mask_load[3],
            "loadFileOffset": hx(address),
            "returnFileOffset": hx(return_row[0]),
        })
    if len(matches) == 1:
        return matches[0]

    direct_matches = []
    for address in sorted(allowed):
        row = rows.get(address)
        if row is None or row[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        load = FRAME_LOAD.fullmatch(row[2])
        if load is None:
            continue
        value_register = load.group("register")
        cursor = address + 2
        first_transfer = rows.get(cursor)
        if (
            first_transfer is not None
            and first_transfer[1:3] == ("mov", f"{value_register},r4")
            and rows.get(cursor + 2, (0, "", "", None))[1:3]
            == ("mov", "r4,r0")
        ):
            cursor += 4
        elif (
            first_transfer is not None
            and first_transfer[1:3] == ("mov", f"{value_register},r0")
        ):
            cursor += 2
        elif value_register != "r0":
            continue
        return_row = None
        for epilogue_address in range(cursor, cursor + 8, 2):
            epilogue = rows.get(epilogue_address)
            if epilogue is None:
                break
            if epilogue[1] == "rts":
                return_row = epilogue
                break
            if epilogue[1] not in {"add", "lds.l"}:
                break
        if return_row is None:
            continue
        direct_matches.append({
            "kind": "frame-field",
            "offset": int(load.group("offset")),
            "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[row[1]],
            "signedLoad": row[1] != "mov.l",
            "loadFileOffset": hx(address),
            "returnFileOffset": hx(return_row[0]),
        })
    return direct_matches[0] if len(direct_matches) == 1 else None


def scene_field_constant_writes(
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int,
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact constant stores through ``literal + r9`` addresses."""

    ordered = [rows[address] for address in sorted(rows)]
    indices = {row[0]: index for index, row in enumerate(ordered)}
    allowed = reached if reached is not None else set(rows)
    writes = []
    for address in sorted(allowed):
        store = rows.get(address)
        if store is None or store[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        match = REGISTER_STORE.fullmatch(store[2])
        if match is None:
            continue
        address_register = match.group("address")
        add = rows.get(address - 4)
        base = rows.get(address - 6)
        if (
            add is None
            or add[1:3] != ("add", f"r9,{address_register}")
            or base is None
            or base[1] != "mov.l"
            or base[3] is None
            or not base[2].endswith(f",{address_register}")
        ):
            continue
        value = resolve_register(
            ordered,
            match.group("source"),
            indices[address],
            static_data_base,
        )
        if value.kind != "constant" or value.value is None:
            continue
        writes.append({
            "kind": "sceneFieldWrite",
            "callFileOffset": hx(address),
            "offset": base[3],
            "offsetHex": hx(base[3]),
            "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[store[1]],
            "value": value.value,
            "valueHex": f"0x{value.value:08x}",
            "addressDefinitionFileOffset": hx(base[0]),
            "valueSource": value.source,
        })
    return writes


def scene_field_bitwise_writes(
    rows: dict[int, tuple[int, str, str, int | None]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact byte/word/dword OR writes through ``literal + r9``."""

    allowed = reached if reached is not None else set(rows)
    writes = []
    for address in sorted(allowed):
        store = rows.get(address)
        if store is None or store[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        match = REGISTER_STORE.fullmatch(store[2])
        if match is None:
            continue
        value_register = match.group("source")
        address_register = match.group("address")
        bitwise = rows.get(address - 2)
        mask_load = rows.get(address - 4)
        value_load = rows.get(address - 6)
        value_add = rows.get(address - 8)
        value_base = rows.get(address - 10)
        address_add = rows.get(address - 12)
        address_base = rows.get(address - 14)
        if (
            mask_load is None
            or mask_load[1] != "mov"
            or "," not in mask_load[2]
            or value_load is None
            or value_load[1] != store[1]
            or value_load[2] != f"@{value_register},{value_register}"
            or value_add is None
            or value_add[1:3] != ("add", f"r9,{value_register}")
            or value_base is None
            or value_base[1] != "mov.l"
            or value_base[3] is None
            or not value_base[2].endswith(f",{value_register}")
            or address_add is None
            or address_add[1:3] != ("add", f"r9,{address_register}")
            or address_base is None
            or address_base[1] != "mov.l"
            or address_base[3] != value_base[3]
            or not address_base[2].endswith(f",{address_register}")
        ):
            continue
        mask_register = mask_load[2].rsplit(",", 1)[-1]
        if (
            bitwise is None
            or bitwise[1:3] != ("or", f"{mask_register},{value_register}")
        ):
            continue
        mask = signed_immediate(mask_load[2], mask_register)
        if mask is None:
            continue
        writes.append({
            "kind": "sceneFieldBitwiseWrite",
            "callFileOffset": hx(address),
            "offset": value_base[3],
            "offsetHex": hx(value_base[3]),
            "width": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[store[1]],
            "operator": "or",
            "mask": mask,
            "maskHex": f"0x{mask & 0xffffffff:08x}",
            "addressDefinitionFileOffset": hx(address_base[0]),
            "fieldLoadFileOffset": hx(value_load[0]),
            "bitwiseFileOffset": hx(bitwise[0]),
        })
    return writes


def _rooted_address_offset(
    rows: dict[int, tuple[int, str, str, int | None]],
    before: int,
    register: str,
    base_register: str,
) -> tuple[int, int] | None:
    addend = 0
    for address in range(before - 2, max(-2, before - 34), -2):
        row = rows.get(address)
        if row is None:
            break
        if row[1] in {
            "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
            "jmp", "jsr", "rts",
        }:
            break
        if row[1] == "add" and row[2].endswith(f",{register}"):
            if row[2] == f"{base_register},{register}":
                definition = rows.get(address - 2)
                if (
                    definition is not None
                    and definition[2].endswith(f",{register}")
                ):
                    base = (
                        signed_immediate(definition[2], register)
                        if definition[1] == "mov"
                        else definition[3]
                        if definition[1] == "mov.l"
                        else None
                    )
                    if base is not None:
                        return base + addend, address - 2
                return None
            immediate = signed_immediate(row[2], register)
            if immediate is not None:
                addend += immediate
                continue
            source_register = row[2].split(",", 1)[0]
            source_definition = rows.get(address - 2)
            source_value = (
                signed_immediate(source_definition[2], source_register)
                if (
                    source_definition is not None
                    and source_definition[1] == "mov"
                )
                else None
            )
            if source_value is not None:
                addend += source_value
                continue
        if row[2] == register or row[2].endswith(f",{register}"):
            break
    return None


def frame_field_scene_writes(
    rows: dict[int, tuple[int, str, str, int | None]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact scene scalar copies into coroutine frame dwords."""

    allowed = reached if reached is not None else set(rows)
    writes = []
    for address in sorted(allowed):
        store = rows.get(address)
        if store is None or store[1] != "mov.l":
            continue
        match = REGISTER_STORE.fullmatch(store[2])
        if match is None:
            continue
        target = _rooted_address_offset(
            rows,
            address,
            match.group("address"),
            "r14",
        )
        if target is None:
            continue
        source_register = match.group("source")
        load = rows.get(address - 2)
        addend_word = None
        indexed_scene_load = (
            load is not None
            and load[1] in {"mov.b", "mov.w", "mov.l"}
            and load[2] == f"@(r0,r9),{source_register}"
        )
        if indexed_scene_load:
            source_definition = rows.get(address - 4)
            if (
                source_definition is None
                or source_definition[1] != "mov.l"
                or not source_definition[2].endswith(",r0")
                or source_definition[3] is None
            ):
                continue
            source = (source_definition[3], source_definition[0])
            source_width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]]
        elif (
            load is not None
            and load[1] == "mov.l"
            and load[2] == f"@r5,{source_register}"
        ):
            source_address_register = "r5"
        else:
            float_sequence = [
                rows.get(address - delta)
                for delta in range(2, 18, 2)
            ]
            if (
                any(row is None for row in float_sequence)
                or float_sequence[0][1:3] != (
                    "sts",
                    f"fpul,{source_register}",
                )
                or float_sequence[1][1:3] != ("flds", "fr2,fpul")
                or float_sequence[2][1:3] != ("fadd", "fr3,fr2")
                or float_sequence[3][1:3] != ("fsts", "fpul,fr2")
                or float_sequence[4][1:3] != ("lds", "r5,fpul")
                or float_sequence[5][1:3] != ("fsts", "fpul,fr3")
                or float_sequence[6][1:3] != ("lds", "r6,fpul")
                or float_sequence[7][1] != "mov.l"
                or float_sequence[7][3] is None
            ):
                continue
            load = rows.get(address - 18)
            if (
                load is None
                or load[1:3] != ("mov.l", "@r5,r5")
            ):
                continue
            source_address_register = "r5"
            addend_word = float_sequence[7][3]
        if not indexed_scene_load:
            source = _rooted_address_offset(
                rows,
                load[0],
                source_address_register,
                "r9",
            )
            if source is None:
                continue
            source_width = 4
        writes.append({
            "kind": "frameFieldSceneWrite",
            "callFileOffset": hx(address),
            "offset": target[0],
            "width": 4,
            "sceneOffset": source[0],
            "sceneOffsetHex": hx(source[0]),
            "sceneWidth": source_width,
            "signedLoad": source_width < 4,
            **(
                {
                    "floatAddendWord": addend_word,
                    "floatAddendHex": f"0x{addend_word:08x}",
                }
                if addend_word is not None
                else {}
            ),
            "addressDefinitionFileOffset": hx(target[1]),
            "sourceDefinitionFileOffset": hx(source[1]),
        })
    return writes


def indirect_call_json(
    call_offset: int,
    operands: str,
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int | None = None,
) -> dict[str, Any]:
    """Retain an exact nearby load of an indirect call target.

    The scan is deliberately local and conservative. It stops at control
    transfers and at any intervening instruction syntactically writing the
    target register. No behavior is assigned to the recovered memory slot.
    """
    result: dict[str, Any] = {
        "callFileOffset": hx(call_offset),
        "operands": operands,
    }
    target_match = INDIRECT_REGISTER.fullmatch(operands)
    if target_match is None:
        return result
    target_register = target_match.group("register")
    for delta in range(2, 14, 2):
        row = rows.get(call_offset - delta)
        if row is None:
            break
        _address, mnemonic, prior_operands, _literal = row
        if mnemonic in {
            "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
            "jmp", "jsr", "rts",
        }:
            break
        slot = (
            BASE_REGISTER_SLOT.fullmatch(prior_operands)
            if mnemonic == "mov.l"
            else None
        )
        if slot is not None and slot.group("destination") == target_register:
            result["targetSource"] = {
                "kind": "base-register-slot",
                "baseRegister": slot.group("base"),
                "byteOffset": int(slot.group("offset")),
                "loadFileOffset": hx(row[0]),
            }
            break
        if (
            prior_operands == target_register
            or prior_operands.endswith(f",{target_register}")
        ):
            break
    source = result.get("targetSource")
    if (
        static_data_base is not None
        and source is not None
        and source["baseRegister"] == "r8"
        and source["byteOffset"] in {0x1C, 0x2C, 0x30}
    ):
        runtime_abi = runtime_interface_dispatch_abi(
            call_offset,
            rows,
            static_data_base,
        )
        if runtime_abi is not None:
            result["runtimeDispatch"] = runtime_abi
        result_test = runtime_interface_result_bit_test(call_offset, rows)
        if result_test is not None:
            result["resultBitTest"] = result_test
    if (
        static_data_base is not None
        and source is not None
        and source["baseRegister"] == "r8"
        and source["byteOffset"] in {0x14, 0x18}
    ):
        arithmetic_abi = runtime_integer_arithmetic_abi(
            call_offset,
            rows,
            static_data_base,
        )
        if arithmetic_abi is not None:
            result["integerArithmetic"] = arithmetic_abi
    return result


def runtime_integer_arithmetic_abi(
    call_offset: int,
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int,
) -> dict[str, Any] | None:
    """Recover the generated signed quotient/remainder register ABI."""

    ordered = [rows[address] for address in sorted(rows)]
    indices = {row[0]: index for index, row in enumerate(ordered)}
    call_index = indices.get(call_offset)
    delay = rows.get(call_offset + 2)
    move = (
        REGISTER_MOVE.fullmatch(delay[2])
        if delay is not None and delay[1] == "mov"
        else None
    )
    if (
        call_index is None
        or move is None
        or move.group("destination") != "r1"
    ):
        return None
    dividend_argument = _exact_integer_register_expression(
        ordered,
        move.group("source"),
        call_index,
        static_data_base,
    )
    divisor_argument = _exact_integer_register_expression(
        ordered,
        "r0",
        call_index,
        static_data_base,
    )
    dividend = resolve_register(
        ordered,
        move.group("source"),
        call_index,
        static_data_base,
    )
    divisor = resolve_register(
        ordered,
        "r0",
        call_index,
        static_data_base,
    )
    return {
        "argumentCount": 2,
        "arguments": [
            dividend_argument or runtime_value_json(dividend),
            divisor_argument or runtime_value_json(divisor),
        ],
        "registers": {
            "dividend": "r1",
            "divisor": "r0",
            "result": "r0",
        },
        "delaySlotFileOffset": hx(call_offset + 2),
    }


def _exact_integer_register_expression(
    instructions: list[tuple[int, str, str, int | None]],
    register: str,
    before_index: int,
    static_data_base: int,
    depth: int = 0,
) -> dict[str, Any] | None:
    """Recover only exact local SH-4 integer values used by div/rem calls.

    This deliberately models the compiler forms observed at native operation
    and runtime ABIs, rather than turning the general register resolver into
    an expression evaluator. Arithmetic is 32-bit: ``add`` and ``sub`` wrap,
    and ``mul.l`` contributes MACL, the low 32 bits of the product.
    """

    if depth > 12:
        return None
    for index in range(before_index - 1, -1, -1):
        address, mnemonic, operands, literal = instructions[index]
        if register == "r0" and mnemonic == "bsrf":
            result = _exact_signed_angle_difference_call(
                instructions,
                index,
                static_data_base,
                depth + 1,
            )
            return result
        if mnemonic in {
            "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
            "jmp", "jsr", "rts",
        }:
            return None
        destination = (
            operands.rsplit(",", 1)[1]
            if "," in operands
            else None
        )
        if destination != register:
            continue

        if mnemonic == "mov":
            source = operands.split(",", 1)[0]
            immediate = signed_immediate(operands, register)
            if immediate is not None:
                return {
                    "kind": "constant",
                    "value": immediate & 0xffffffff,
                    "hex": f"0x{immediate & 0xffffffff:08x}",
                    "source": hx(address),
                }
            if re.fullmatch(REGISTER, source):
                return _exact_integer_register_expression(
                    instructions,
                    source,
                    index,
                    static_data_base,
                    depth + 1,
                )
            return None

        if mnemonic in {"mov.b", "mov.w", "mov.l"}:
            source = operands.rsplit(",", 1)[0]
            width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
            signed_load = mnemonic != "mov.l"
            if mnemonic == "mov.l" and literal is not None:
                return {
                    "kind": "constant",
                    "value": literal & 0xffffffff,
                    "hex": f"0x{literal & 0xffffffff:08x}",
                    "source": hx(address),
                }
            direct_frame = re.fullmatch(r"@\((\d+),r14\)", source)
            if direct_frame is not None:
                return {
                    "kind": "frame-field",
                    "offset": int(direct_frame.group(1)),
                    "width": width,
                    "signedLoad": signed_load,
                    "source": f"{source} at {hx(address)}",
                }
            indexed_base = re.fullmatch(r"@\(r0,(r14|r9)\)", source)
            if indexed_base is not None and index > 0:
                offset = _exact_integer_register_expression(
                    instructions,
                    "r0",
                    index,
                    static_data_base,
                    depth + 1,
                )
                if offset is not None and offset.get("kind") == "constant":
                    return {
                        "kind": (
                            "frame-field"
                            if indexed_base.group(1) == "r14"
                            else "scene-field"
                        ),
                        "offset": offset["value"],
                        "width": width,
                        "signedLoad": signed_load,
                        "source": f"{source} at {hx(address)}",
                    }
            indirect = INDIRECT_REGISTER.fullmatch(source)
            if indirect is not None:
                local_address = _exact_local_address_register(
                    {row[0]: row for row in instructions},
                    indirect.group("register"),
                    address,
                )
                if local_address is not None and local_address.get("kind") in {
                    "frame-address", "scene-address",
                    "frame-address-expression", "scene-address-expression",
                }:
                    dynamic = local_address["kind"].endswith("-expression")
                    return {
                        "kind": (
                            "frame-field-expression"
                            if local_address["kind"] == "frame-address-expression"
                            else "scene-field-expression"
                            if local_address["kind"] == "scene-address-expression"
                            else "frame-field"
                            if local_address["kind"] == "frame-address"
                            else "scene-field"
                        ),
                        **({
                            "baseOffset": local_address["baseOffset"],
                            "offsetExpression": local_address["offsetExpression"],
                        } if dynamic else {
                            "offset": local_address["offset"],
                        }),
                        "width": width,
                        "signedLoad": signed_load,
                        "source": f"{source} at {hx(address)}",
                    }
            return None

        if mnemonic in {"add", "sub"}:
            source = operands.split(",", 1)[0]
            if not re.fullmatch(REGISTER, source):
                return None
            left = _exact_integer_register_expression(
                instructions,
                register,
                index,
                static_data_base,
                depth + 1,
            )
            right = _exact_integer_register_expression(
                instructions,
                source,
                index,
                static_data_base,
                depth + 1,
            )
            if left is None or right is None:
                return None
            return {
                "kind": "integer-expression",
                "operator": "add" if mnemonic == "add" else "subtract",
                "left": left,
                "right": right,
                "source": hx(address),
            }

        if mnemonic == "sts" and operands == f"macl,{register}":
            if index == 0:
                return None
            multiply = instructions[index - 1]
            if multiply[1] != "mul.l" or "," not in multiply[2]:
                return None
            left_register, right_register = multiply[2].split(",", 1)
            if not all(
                re.fullmatch(REGISTER, item)
                for item in (left_register, right_register)
            ):
                return None
            left = _exact_integer_register_expression(
                instructions,
                left_register,
                index - 1,
                static_data_base,
                depth + 1,
            )
            right = _exact_integer_register_expression(
                instructions,
                right_register,
                index - 1,
                static_data_base,
                depth + 1,
            )
            if left is None or right is None:
                return None
            return {
                "kind": "integer-expression",
                "operator": "multiply-low",
                "left": left,
                "right": right,
                "source": hx(multiply[0]),
            }

        return None
    return None


SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE = {
    0x00: ("mov.l", "r14,@-r13"),
    0x02: ("sts.l", "pr,@-r13"),
    0x04: ("add", "#-12,r13"),
    0x06: ("mov", "r13,r14"),
    0x0C: ("mov.l", "@(24,r14),r5"),
    0x0E: ("mov.l", "@(20,r14),r6"),
    0x10: ("sub", "r6,r5"),
    0x12: ("mov.l", "r5,@r4"),
    0x1A: ("mov.l", "@(20,r14),r5"),
    0x1C: ("mov.l", "@(24,r14),r6"),
    0x1E: ("sub", "r6,r5"),
    0x24: ("mov.l", "@(4,r14),r4"),
    0x28: ("and", "r5,r4"),
    0x2A: ("mov.l", "@(8,r14),r5"),
    0x2E: ("and", "r6,r5"),
    0x30: ("cmp/gt", "r4,r5"),
    0x60: ("mov", "#0,r4"),
    0x64: ("mov.l", "@(4,r14),r5"),
    0x68: ("mul.l", "r6,r5"),
    0x6A: ("sts", "macl,r5"),
    0x7C: ("mov", "#0,r4"),
    0x80: ("mov.l", "@(4,r14),r5"),
    0x88: ("mul.l", "r6,r5"),
    0x8A: ("sts", "macl,r5"),
    0xA0: ("mov.l", "@(20,r14),r4"),
    0xA2: ("mov.l", "@(24,r14),r5"),
    0xA4: ("cmp/gt", "r5,r4"),
    0xB8: ("mov", "#0,r4"),
    0xBC: ("mov.l", "@(8,r14),r5"),
    0xC0: ("and", "r6,r5"),
    0xC2: ("mov.l", "r5,@r4"),
    0xD4: ("mov", "#0,r4"),
    0xD8: ("mov.l", "@(8,r14),r5"),
    0xDC: ("and", "r6,r5"),
    0xDE: ("mov.l", "r5,@r4"),
    0xE2: ("mov.l", "@(0,r14),r4"),
    0xE4: ("mov", "r4,r0"),
    0xE8: ("lds.l", "@r13+,pr"),
    0xEA: ("rts", ""),
    0xEC: ("mov.l", "@r13+,r14"),
}


def _exact_signed_angle_difference_call(
    instructions: list[tuple[int, str, str, int | None]],
    call_index: int,
    static_data_base: int,
    depth: int,
) -> dict[str, Any] | None:
    """Recover the compiler's exact local signed binary-angle helper.

    The helper returns the shorter low-word difference ``right - left`` and
    deliberately keeps the half-turn tie as positive 0x8000.  Recognition is
    structural: an arbitrary BS(R)F result never acquires this meaning.
    """

    if depth > 12 or call_index == 0:
        return None
    _address, mnemonic, operands, _literal = instructions[call_index]
    target_load = instructions[call_index - 1]
    if (
        mnemonic != "bsrf"
        or not re.fullmatch(REGISTER, operands)
        or target_load[1] != "mov.l"
        or target_load[3] is None
        or not target_load[2].endswith(f",{operands}")
    ):
        return None
    displacement = target_load[3] & 0xffffffff
    if displacement & 0x80000000:
        displacement -= 0x100000000
    target = instructions[call_index][0] + 4 + displacement
    rows = {row[0]: row for row in instructions}
    if any(
        rows.get(target + relative, (0, "", "", None))[1:3] != expected
        for relative, expected in SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE.items()
    ):
        return None

    pushes: list[tuple[int, str]] = []
    for index in range(call_index - 2, -1, -1):
        _push_address, push_mnemonic, push_operands, _push_literal = (
            instructions[index]
        )
        if push_mnemonic in {
            "bra", "braf", "bsr", "bsrf", "bf", "bf.s", "bt", "bt.s",
            "jmp", "jsr", "rts",
        }:
            return None
        push = re.fullmatch(rf"(?P<register>{REGISTER}),@-r13", push_operands)
        if push_mnemonic == "mov.l" and push is not None:
            pushes.append((index, push.group("register")))
            if len(pushes) == 2:
                break
    if len(pushes) != 2:
        return None
    left = _exact_integer_register_expression(
        instructions,
        pushes[0][1],
        pushes[0][0],
        static_data_base,
        depth + 1,
    )
    right = _exact_integer_register_expression(
        instructions,
        pushes[1][1],
        pushes[1][0],
        static_data_base,
        depth + 1,
    )
    if left is None or right is None:
        return None
    return {
        "kind": "integer-expression",
        "operator": "signed-binary-angle-difference",
        "left": left,
        "right": right,
        "source": hx(instructions[call_index][0]),
    }


def runtime_interface_dispatch_abi(
    call_offset: int,
    rows: dict[int, tuple[int, str, str, int | None]],
    static_data_base: int,
) -> dict[str, Any] | None:
    """Recover the exact selector/count/word-vector scheduler call ABI.

    SCN3-generated scheduler and secondary-dispatch calls pass the handler
    selector in r5, the word count in r7, and a downward-growing r13 argument
    vector through r6 in the call delay slot.  Partial shapes are deliberately
    left unresolved.
    """

    ordered = [rows[address] for address in sorted(rows)]
    indices = {
        row[0]: index
        for index, row in enumerate(ordered)
    }
    call_index = indices.get(call_offset)
    delay = rows.get(call_offset + 2)
    if (
        call_index is None
        or delay is None
        or delay[1:3] != ("mov", "r13,r6")
    ):
        return None
    selector = resolve_register(
        ordered,
        "r5",
        call_index,
        static_data_base,
    )
    count = resolve_register(
        ordered,
        "r7",
        call_index,
        static_data_base,
    )
    if (
        selector.kind != "constant"
        or selector.value is None
        or count.kind != "constant"
        or count.value is None
        or count.value > 64
    ):
        return None
    arguments = call_arguments(
        ordered,
        call_index,
        count.value,
        static_data_base,
    )
    if len(arguments) != count.value:
        return None
    encoded_arguments = [
        runtime_value_json(argument)
        for argument in arguments
    ]
    return {
        "selector": selector.value,
        "selectorHex": f"0x{selector.value:04x}",
        "argumentCount": count.value,
        "arguments": encoded_arguments,
        "argumentPointer": {
            "kind": "native-argument-stack",
            "register": "r13",
            "delaySlotFileOffset": hx(call_offset + 2),
        },
    }


def runtime_interface_result_bit_test(
    call_offset: int,
    rows: dict[int, tuple[int, str, str, int | None]],
) -> dict[str, Any] | None:
    """Recover ``swap.w r0; tst #mask,r0; conditional branch`` exactly."""

    swap = rows.get(call_offset + 4)
    test = rows.get(call_offset + 6)
    if (
        swap is None
        or swap[1:3] != ("swap.w", "r0,r0")
        or test is None
        or test[1] != "tst"
    ):
        return None
    tested_mask = signed_immediate(test[2], "r0")
    if tested_mask is None or not 0 <= tested_mask <= 0xFF:
        return None
    branch = comparison_branch_outcomes(rows, call_offset + 6)
    if branch is None:
        return None
    # swap.w maps low-word bit N to original result bit N+16.
    original_mask = tested_mask << 16
    if branch["branchMnemonic"] in {"bf", "bf.s"}:
        nonzero = branch["comparisonFalseSuccessor"]
        zero = branch["comparisonTrueSuccessor"]
    else:
        nonzero = branch["comparisonTrueSuccessor"]
        zero = branch["comparisonFalseSuccessor"]
    return {
        "kind": "runtimeResultBit",
        "mask": original_mask,
        "maskHex": f"0x{original_mask:08x}",
        "swapFileOffset": hx(call_offset + 4),
        "testFileOffset": hx(call_offset + 6),
        "resolvedBranch": {
            **branch,
            "comparisonTrueSuccessor": nonzero,
            "comparisonFalseSuccessor": zero,
        },
    }
