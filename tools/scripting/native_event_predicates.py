"""Exact SH-4 predicate recovery for native event control flow."""

from __future__ import annotations

import re
from typing import Any, Sequence

from tools.scripting.analyze_dialogue_reachable_sh4 import (
    CALLS,
    INDIRECT_TERMINATORS,
    RETURNS,
    braf_target,
    direct_target,
)


REGISTER = re.compile(r"^r(?:1[0-5]|[0-9])$")
FRAME_FIELD_LOAD = re.compile(
    r"^@\((?P<offset>\d+),r14\),(?P<register>r(?:1[0-5]|[0-9]))$"
)
FRAME_INDEXED_FIELD_LOAD = re.compile(
    r"^@\((?P<index>r(?:1[0-5]|[0-9])),r14\),"
    r"(?P<register>r(?:1[0-5]|[0-9]))$"
)


def hx(value: int) -> str:
    return f"0x{value:x}"


def signed_immediate(operands: str, destination: str) -> int | None:
    suffix = f",{destination}"
    if not operands.endswith(suffix):
        return None
    source = operands[: -len(suffix)]
    if not source.startswith("#"):
        return None
    try:
        return int(source[1:], 0)
    except ValueError:
        return None


def branch_successors(
    row: tuple[int, str, str, int | None],
    rows: dict[int, tuple[int, str, str, int | None]],
) -> list[int]:
    address, mnemonic, operands, _literal = row
    if mnemonic in {"bf", "bt"}:
        return [
            item
            for item in (direct_target(operands), address + 2)
            if item in rows
        ]
    if mnemonic in {"bf.s", "bt.s"}:
        return [
            item
            for item in (direct_target(operands), address + 4)
            if item in rows
        ]
    if mnemonic == "bra":
        target = direct_target(operands)
        return [target] if target in rows else []
    if mnemonic == "braf":
        target = braf_target(address, rows)
        return [target] if target in rows else []
    if mnemonic in CALLS:
        target = address + 4
        return [target] if target in rows else []
    if mnemonic in RETURNS or mnemonic in INDIRECT_TERMINATORS:
        return []
    target = address + 2
    return [target] if target in rows else []


def comparison_branch_outcomes(
    rows: dict[int, tuple[int, str, str, int | None]],
    compare_address: int,
) -> dict[str, Any] | None:
    """Resolve a nearby conditional branch for both comparison outcomes."""

    def outcome(initial_t: int) -> tuple[int, str, int, int] | None:
        registers: dict[str, int | None] = {
            f"r{index}": None
            for index in range(16)
        }
        t = initial_t
        address = compare_address + 2
        for _step in range(12):
            row = rows.get(address)
            if row is None:
                return None
            _current, mnemonic, operands, _literal = row
            if mnemonic in {"bf", "bt", "bf.s", "bt.s"}:
                target = direct_target(operands)
                if target is None:
                    return None
                taken = (t == 0) if mnemonic.startswith("bf") else (t == 1)
                fallthrough = address + (4 if mnemonic.endswith(".s") else 2)
                return (
                    target if taken else fallthrough,
                    mnemonic,
                    target,
                    fallthrough,
                )
            if mnemonic == "mov" and "," in operands:
                source, destination = operands.split(",", 1)
                if source.startswith("#"):
                    try:
                        registers[destination] = int(source[1:], 0)
                    except ValueError:
                        return None
                elif source in registers and destination in registers:
                    registers[destination] = registers[source]
                else:
                    return None
            elif mnemonic == "subc" and "," in operands:
                source, destination = operands.split(",", 1)
                source_value = registers.get(source)
                destination_value = registers.get(destination)
                if source == destination:
                    registers[destination] = -t
                elif source_value is not None and destination_value is not None:
                    registers[destination] = (
                        destination_value - source_value - t
                    )
                else:
                    return None
            elif mnemonic == "not" and "," in operands:
                source, destination = operands.split(",", 1)
                source_value = registers.get(source)
                if source_value is None:
                    return None
                registers[destination] = ~source_value
            elif mnemonic == "cmp/eq" and "," in operands:
                left, right = operands.split(",", 1)
                if left.startswith("#"):
                    try:
                        left_value = int(left[1:], 0)
                    except ValueError:
                        return None
                else:
                    left_value = registers.get(left)
                right_value = registers.get(right)
                if left_value is None or right_value is None:
                    return None
                t = int(left_value == right_value)
            elif mnemonic == "nop":
                pass
            else:
                return None
            address += 2
        return None

    false_outcome = outcome(0)
    true_outcome = outcome(1)
    if false_outcome is None or true_outcome is None:
        return None
    if false_outcome[1:] != true_outcome[1:]:
        return None
    _successor, mnemonic, target, fallthrough = true_outcome
    branch_address = next(
        address
        for address in range(compare_address + 2, compare_address + 26, 2)
        if rows.get(address, (0, "", "", None))[1] == mnemonic
    )
    return {
        "branchFileOffset": hx(branch_address),
        "branchMnemonic": mnemonic,
        "branchTargetFileOffset": hx(target),
        "branchFallthroughFileOffset": hx(fallthrough),
        "comparisonTrueSuccessor": hx(true_outcome[0]),
        "comparisonFalseSuccessor": hx(false_outcome[0]),
    }


def _field_comparison(
    rows: dict[int, tuple[int, str, str, int | None]],
    load: tuple[int, str, str, int | None],
    field_offset: int | str,
    value_register: str,
    constant_load: tuple[int, str, str, int | None] | None,
    compare: tuple[int, str, str, int | None] | None,
    field_load_address: int | None = None,
) -> dict[str, Any] | None:
    if (
        constant_load is None
        or constant_load[1] not in {"mov", "mov.l"}
        or compare is None
        or compare[1] not in {
            "cmp/eq",
            "cmp/ge",
            "cmp/gt",
            "cmp/hi",
            "cmp/hs",
        }
    ):
        return None
    constant_register = constant_load[2].rsplit(",", 1)[-1]
    constant = signed_immediate(constant_load[2], constant_register)
    if (
        constant is None
        and constant_load[1] == "mov.l"
        and constant_load[3] is not None
    ):
        constant = constant_load[3] & 0xffffffff
    if constant is None or compare[2] not in {
        f"{constant_register},{value_register}",
        f"{value_register},{constant_register}",
    }:
        return None
    item = {
        "fieldOffset": field_offset,
        "loadWidth": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
        "signedLoad": load[1] in {"mov.b", "mov.w"},
        "comparison": compare[1],
        "leftOperand": compare[2].split(",", 1)[0],
        "rightOperand": compare[2].split(",", 1)[1],
        "fieldOperand": value_register,
        "constantOperand": constant_register,
        "constant": constant,
        "fieldLoadFileOffset": hx(
            load[0] if field_load_address is None else field_load_address
        ),
        "compareFileOffset": hx(compare[0]),
    }
    branch = comparison_branch_outcomes(rows, compare[0])
    if branch is not None:
        item["resolvedBranch"] = branch
    return item


def _field_bit_test(
    rows: dict[int, tuple[int, str, str, int | None]],
    load: tuple[int, str, str, int | None],
    field_offset: int | str,
    value_register: str,
    field_load_address: int | None = None,
) -> dict[str, Any] | None:
    mask_load = rows.get(load[0] + 2)
    bitwise = rows.get(load[0] + 4)
    if mask_load is None or bitwise is None:
        return None
    mask_register = mask_load[2].rsplit(",", 1)[-1]
    if mask_load[1] == "mov":
        mask = signed_immediate(mask_load[2], mask_register)
    elif mask_load[1] == "mov.l" and mask_load[3] is not None:
        mask = mask_load[3] & 0xffffffff
    else:
        mask = None
    if (
        mask is None
        or bitwise[1] != "and"
        or bitwise[2] != f"{mask_register},{value_register}"
    ):
        return None
    cursor = load[0] + 6
    compared_register = value_register
    transfer = rows.get(cursor)
    if transfer is not None and transfer[1:3] == (
        "mov",
        f"{value_register},r0",
    ):
        compared_register = "r0"
        cursor += 2
    compare = rows.get(cursor)
    if (
        compare is None
        or compare[1] != "cmp/eq"
        or signed_immediate(compare[2], compared_register) != 0
    ):
        return None
    item = {
        "fieldOffset": field_offset,
        "loadWidth": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
        "signedLoad": load[1] in {"mov.b", "mov.w"},
        "comparison": "bit-mask-equal-zero",
        "mask": mask,
        "fieldLoadFileOffset": hx(
            load[0] if field_load_address is None else field_load_address
        ),
        "compareFileOffset": hx(compare[0]),
    }
    branch = comparison_branch_outcomes(rows, compare[0])
    if branch is not None:
        item["resolvedBranch"] = branch
    return item


def _field_zero_comparison_after_transfer(
    rows: dict[int, tuple[int, str, str, int | None]],
    load: tuple[int, str, str, int | None],
    field_offset: int | str,
    value_register: str,
    field_load_address: int | None = None,
) -> dict[str, Any] | None:
    compared_register = value_register
    cursor = load[0] + 2
    compare = None
    while cursor in rows:
        row = rows[cursor]
        if (
            row[1] == "cmp/eq"
            and signed_immediate(row[2], compared_register) == 0
        ):
            compare = row
            break
        if row[1] != "mov" or "," not in row[2]:
            return None
        source, destination = row[2].split(",", 1)
        if source != compared_register:
            return None
        compared_register = destination
        cursor += 2
    if compare is None:
        return None
    item = {
        "fieldOffset": field_offset,
        "loadWidth": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
        "signedLoad": load[1] in {"mov.b", "mov.w"},
        "comparison": "cmp/eq",
        "leftOperand": "#0",
        "rightOperand": compared_register,
        "fieldOperand": compared_register,
        "constantOperand": "#0",
        "constant": 0,
        "fieldLoadFileOffset": hx(
            load[0] if field_load_address is None else field_load_address
        ),
        "compareFileOffset": hx(compare[0]),
    }
    branch = comparison_branch_outcomes(rows, compare[0])
    if branch is not None:
        item["resolvedBranch"] = branch
    return item


def _field_all_ones_comparison_via_not(
    rows: dict[int, tuple[int, str, str, int | None]],
    load: tuple[int, str, str, int | None],
    field_offset: int | str,
    value_register: str,
    field_load_address: int | None = None,
) -> dict[str, Any] | None:
    """Recognize the exact compiler form ``~field == 0``.

    SH-4 has no immediate compare against 0xffffffff, so generated room code
    uses ``not`` followed by ``cmp/eq #0``. Canonicalizing that identity to a
    field comparison against all one bits lets the existing typed predicate
    runtime evaluate it without exposing a guessed higher-level meaning.
    """
    negate = rows.get(load[0] + 2)
    if negate is None or negate[1] != "not" or "," not in negate[2]:
        return None
    source, compared_register = negate[2].split(",", 1)
    if source != value_register:
        return None
    cursor = load[0] + 4
    transfer = rows.get(cursor)
    if transfer is not None and transfer[1] == "mov" and "," in transfer[2]:
        transfer_source, transfer_destination = transfer[2].split(",", 1)
        if transfer_source == compared_register:
            compared_register = transfer_destination
            cursor += 2
    compare = rows.get(cursor)
    if (
        compare is None
        or compare[1] != "cmp/eq"
        or signed_immediate(compare[2], compared_register) != 0
    ):
        return None
    item = {
        "fieldOffset": field_offset,
        "loadWidth": {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
        "signedLoad": load[1] in {"mov.b", "mov.w"},
        "comparison": "cmp/eq",
        "leftOperand": "#0xffffffff",
        "rightOperand": value_register,
        "fieldOperand": value_register,
        "constantOperand": "#0xffffffff",
        "constant": 0xffffffff,
        "fieldLoadFileOffset": hx(
            load[0] if field_load_address is None else field_load_address
        ),
        "compareFileOffset": hx(compare[0]),
        "compilerForm": "bitwise-not-equal-zero",
    }
    branch = comparison_branch_outcomes(rows, compare[0])
    if branch is not None:
        item["resolvedBranch"] = branch
    return item


def scene_field_comparisons(
    instructions: Sequence[tuple[int, str, str, int | None]],
    start: int,
    end: int,
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recognize exact compiler forms that compare an r9 scene field."""
    rows = {
        row[0]: row
        for row in instructions
        if start <= row[0] < end
        and (reached is None or row[0] in reached)
    }
    result = []
    for address, row in sorted(rows.items()):
        if row[1] != "mov.l" or row[3] is None or "," not in row[2]:
            continue
        base_register = row[2].rsplit(",", 1)[1]
        if not REGISTER.match(base_register):
            continue
        add_base = rows.get(address + 2)
        if (
            add_base is None
            or add_base[1:3] != ("add", f"r9,{base_register}")
        ):
            continue
        cursor = address + 4
        field_offset = row[3]
        optional_add = rows.get(cursor)
        if optional_add and optional_add[1] == "add":
            added = signed_immediate(optional_add[2], base_register)
            if added is not None:
                field_offset += added
                cursor += 2
        load = rows.get(cursor)
        if (
            load is None
            or load[1] not in {"mov.l", "mov.w", "mov.b"}
            or not load[2].startswith(f"@{base_register},")
        ):
            continue
        value_register = load[2].rsplit(",", 1)[1]
        comparison = _field_comparison(
            rows,
            load,
            hx(field_offset),
            value_register,
            rows.get(cursor + 2),
            rows.get(cursor + 4),
            address,
        )
        if comparison is not None:
            result.append(comparison)
            continue
        zero_comparison = _field_zero_comparison_after_transfer(
            rows,
            load,
            hx(field_offset),
            value_register,
            address,
        )
        if zero_comparison is not None:
            result.append(zero_comparison)
            continue
        all_ones_comparison = _field_all_ones_comparison_via_not(
            rows,
            load,
            hx(field_offset),
            value_register,
            address,
        )
        if all_ones_comparison is not None:
            result.append(all_ones_comparison)
            continue
        bit_test = _field_bit_test(
            rows,
            load,
            hx(field_offset),
            value_register,
            address,
        )
        if bit_test is not None:
            result.append(bit_test)
    for address, index_load in sorted(rows.items()):
        if (
            index_load[1] != "mov.l"
            or index_load[3] is None
            or "," not in index_load[2]
        ):
            continue
        index_register = index_load[2].rsplit(",", 1)[1]
        load = rows.get(address + 2)
        if (
            load is None
            or load[1] not in {"mov.l", "mov.w", "mov.b"}
            or not load[2].startswith(f"@({index_register},r9),")
        ):
            continue
        value_register = load[2].rsplit(",", 1)[1]
        comparison = _field_comparison(
            rows,
            load,
            hx(index_load[3]),
            value_register,
            rows.get(load[0] + 2),
            rows.get(load[0] + 4),
            address,
        )
        if comparison is not None:
            result.append(comparison)
            continue
        bit_test = _field_bit_test(
            rows,
            load,
            hx(index_load[3]),
            value_register,
            address,
        )
        if bit_test is not None:
            result.append(bit_test)
    return result


def frame_field_comparisons(
    instructions: Sequence[tuple[int, str, str, int | None]],
    start: int,
    end: int,
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recognize direct coroutine-frame field comparisons."""
    rows = {
        row[0]: row
        for row in instructions
        if start <= row[0] < end
        and (reached is None or row[0] in reached)
    }
    computed_loads: dict[int, tuple[int, str]] = {}
    constants: dict[str, int] = {}
    addresses: dict[str, int] = {}
    for address, row in sorted(rows.items()):
        mnemonic, operands = row[1], row[2]
        parts = operands.split(",", 1) if "," in operands else []
        if mnemonic == "mov" and len(parts) == 2:
            source, destination = parts
            immediate = signed_immediate(operands, destination)
            addresses.pop(destination, None)
            if immediate is not None:
                constants[destination] = immediate
            elif source in constants:
                constants[destination] = constants[source]
            else:
                constants.pop(destination, None)
        elif mnemonic == "add" and len(parts) == 2:
            source, destination = parts
            if source == "r14" and destination in constants:
                addresses[destination] = constants[destination]
                constants.pop(destination, None)
            elif destination in addresses and source in constants:
                addresses[destination] += constants[source]
            else:
                addresses.pop(destination, None)
                constants.pop(destination, None)
        elif (
            mnemonic in {"mov.b", "mov.w", "mov.l"}
            and len(parts) == 2
        ):
            source, destination = parts
            indexed = FRAME_INDEXED_FIELD_LOAD.fullmatch(operands)
            if indexed is not None and indexed.group("index") in constants:
                computed_loads[address] = (
                    constants[indexed.group("index")],
                    indexed.group("register"),
                )
            elif source.startswith("@") and source[1:] in addresses:
                computed_loads[address] = (
                    addresses[source[1:]],
                    destination,
                )
            if destination in addresses or destination in constants:
                addresses.pop(destination, None)
                constants.pop(destination, None)
        elif mnemonic in {
            "bra", "braf", "bf", "bf.s", "bt", "bt.s", "jmp", "rts",
            "bsr", "bsrf", "jsr",
        }:
            constants.clear()
            addresses.clear()
        elif len(parts) == 2:
            destination = parts[1]
            addresses.pop(destination, None)
            constants.pop(destination, None)

    result = []
    for address, load in sorted(rows.items()):
        if load[1] not in {"mov.l", "mov.w", "mov.b"}:
            continue
        match = FRAME_FIELD_LOAD.fullmatch(load[2])
        computed = computed_loads.get(address)
        if match is None and computed is None:
            continue
        field_offset = (
            int(match.group("offset")) if match is not None else computed[0]
        )
        value_register = (
            match.group("register") if match is not None else computed[1]
        )
        comparison = _field_comparison(
            rows,
            load,
            field_offset,
            value_register,
            rows.get(address + 2),
            rows.get(address + 4),
        )
        if comparison is not None:
            result.append(comparison)
            continue
        zero_comparison = _field_zero_comparison_after_transfer(
            rows,
            load,
            field_offset,
            value_register,
        )
        if zero_comparison is not None:
            result.append(zero_comparison)
            continue
        all_ones_comparison = _field_all_ones_comparison_via_not(
            rows,
            load,
            field_offset,
            value_register,
        )
        if all_ones_comparison is not None:
            result.append(all_ones_comparison)

    load_definitions: dict[int, tuple[int, str, int, bool]] = {}
    for address, load in sorted(rows.items()):
        if load[1] not in {"mov.b", "mov.w", "mov.l"}:
            continue
        direct = FRAME_FIELD_LOAD.fullmatch(load[2])
        computed = computed_loads.get(address)
        if direct is not None:
            load_definitions[address] = (
                int(direct.group("offset")),
                direct.group("register"),
                {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
                load[1] in {"mov.b", "mov.w"},
            )
        elif computed is not None:
            load_definitions[address] = (
                computed[0],
                computed[1],
                {"mov.b": 1, "mov.w": 2, "mov.l": 4}[load[1]],
                load[1] in {"mov.b", "mov.w"},
            )

    for compare_address, compare in sorted(rows.items()):
        if compare[1] not in {
            "cmp/eq", "cmp/ge", "cmp/gt", "cmp/hi", "cmp/hs",
        } or "," not in compare[2]:
            continue
        left_register, right_register = compare[2].split(",", 1)
        definitions = {}
        for register in {left_register, right_register}:
            for cursor in range(compare_address - 2, compare_address - 26, -2):
                row = rows.get(cursor)
                if row is None:
                    break
                definition = load_definitions.get(cursor)
                if definition is not None and definition[1] == register:
                    definitions[register] = definition
                    break
                if "," in row[2] and row[2].split(",", 1)[1] == register:
                    break
        if len(definitions) != 2:
            continue
        left = definitions[left_register]
        right = definitions[right_register]
        item = {
            "fieldOffset": left[0],
            "loadWidth": left[2],
            "signedLoad": left[3],
            "comparison": compare[1],
            "leftOperand": left_register,
            "rightOperand": right_register,
            "fieldOperand": left_register,
            "otherFieldOperand": right_register,
            "otherFieldOffset": right[0],
            "otherLoadWidth": right[2],
            "otherSignedLoad": right[3],
            "compareFileOffset": hx(compare_address),
        }
        branch = comparison_branch_outcomes(rows, compare_address)
        if branch is not None:
            item["resolvedBranch"] = branch
        result.append(item)
    return result


def frame_expression_branch_predicates(
    instructions: Sequence[tuple[int, str, str, int | None]],
    blocks: Sequence[dict[str, Any]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact compound frame predicates from straight-line SH-4.

    The room compiler materializes some conjunctions as all-ones/zero masks
    produced by ``subc rN,rN`` after integer or floating comparisons. This
    models that compiler form within one basic block and emits a predicate
    only when every operand is a constant or exact coroutine-frame load.
    """
    rows = {
        row[0]: row
        for row in instructions
        if reached is None or row[0] in reached
    }
    result: list[dict[str, Any]] = []

    def binary(
        kind: str,
        left: dict[str, Any] | None,
        right: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if left is None or right is None:
            return None
        return {"kind": kind, "left": left, "right": right}

    def contains_compound(expression: dict[str, Any] | None) -> bool:
        if expression is None:
            return False
        if expression.get("kind") in {
            "float32-greater-than", "bitwise-and", "bitwise-or",
            "signed-greater-than", "signed-greater-or-equal",
            "unsigned-greater-than", "unsigned-greater-or-equal",
        }:
            return True
        return any(
            contains_compound(expression.get(name))
            for name in ("left", "right", "operand")
            if isinstance(expression.get(name), dict)
        )

    def contains_frame_field(expression: dict[str, Any] | None) -> bool:
        if expression is None:
            return False
        if expression.get("kind") == "frame-field":
            return True
        return any(
            contains_frame_field(expression.get(name))
            for name in ("left", "right", "operand")
            if isinstance(expression.get(name), dict)
        )

    for block in blocks:
        terminator = block.get("terminator")
        if terminator is None or terminator.get("mnemonic") not in {
            "bf", "bf.s", "bt", "bt.s",
        }:
            continue
        start = int(block["startFileOffset"], 16)
        branch_address = int(terminator["fileOffset"], 16)
        registers: dict[str, dict[str, Any] | None] = {
            f"r{index}": None for index in range(16)
        }
        floating: dict[str, dict[str, Any] | None] = {
            f"fr{index}": None for index in range(16)
        }
        fpul: dict[str, Any] | None = None
        t_expression: dict[str, Any] | None = None
        compare_address: int | None = None

        for address in range(start, branch_address, 2):
            row = rows.get(address)
            if row is None:
                continue
            _offset, mnemonic, operands, literal = row
            parts = operands.split(",", 1) if "," in operands else []
            if mnemonic == "mov" and len(parts) == 2:
                source, destination = parts
                immediate = signed_immediate(operands, destination)
                registers[destination] = (
                    {"kind": "constant", "value": immediate & 0xffffffff}
                    if immediate is not None
                    else registers.get(source)
                )
            elif mnemonic == "mov.l" and len(parts) == 2 and literal is not None:
                registers[parts[1]] = {
                    "kind": "constant",
                    "value": literal & 0xffffffff,
                }
            elif mnemonic in {"mov.b", "mov.w", "mov.l"} and len(parts) == 2:
                direct = FRAME_FIELD_LOAD.fullmatch(operands)
                indexed = FRAME_INDEXED_FIELD_LOAD.fullmatch(operands)
                if direct is not None:
                    width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
                    registers[direct.group("register")] = {
                        "kind": "frame-field",
                        "offset": int(direct.group("offset")),
                        "width": width,
                        "signedLoad": width != 4,
                    }
                elif (
                    indexed is not None
                    and isinstance(registers.get(indexed.group("index")), dict)
                    and registers[indexed.group("index")].get("kind") == "constant"
                ):
                    width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
                    registers[indexed.group("register")] = {
                        "kind": "frame-field",
                        "offset": registers[indexed.group("index")]["value"],
                        "width": width,
                        "signedLoad": width != 4,
                    }
                elif parts[1] in registers:
                    registers[parts[1]] = None
            elif mnemonic == "lds" and operands.endswith(",fpul"):
                fpul = registers.get(operands.split(",", 1)[0])
            elif mnemonic == "fsts" and operands.startswith("fpul,"):
                destination = operands.split(",", 1)[1]
                floating[destination] = (
                    {"kind": "float32-from-word", "operand": fpul}
                    if fpul is not None
                    else None
                )
            elif mnemonic == "fcmp/gt" and len(parts) == 2:
                source, destination = parts
                t_expression = binary(
                    "float32-greater-than",
                    floating.get(destination),
                    floating.get(source),
                )
                compare_address = address
            elif mnemonic in {
                "cmp/eq", "cmp/ge", "cmp/gt", "cmp/hi", "cmp/hs",
            } and len(parts) == 2:
                source, destination = parts
                immediate = signed_immediate(operands, destination)
                left = (
                    {"kind": "constant", "value": immediate & 0xffffffff}
                    if immediate is not None
                    else registers.get(source)
                )
                t_expression = binary(
                    {
                        "cmp/eq": "equal",
                        "cmp/ge": "signed-greater-or-equal",
                        "cmp/gt": "signed-greater-than",
                        "cmp/hi": "unsigned-greater-than",
                        "cmp/hs": "unsigned-greater-or-equal",
                    }[mnemonic],
                    registers.get(destination),
                    left,
                )
                compare_address = address
            elif mnemonic == "subc" and len(parts) == 2:
                source, destination = parts
                registers[destination] = (
                    {"kind": "boolean-mask", "operand": t_expression}
                    if source == destination and t_expression is not None
                    else None
                )
            elif mnemonic == "and" and len(parts) == 2:
                source, destination = parts
                registers[destination] = binary(
                    "bitwise-and",
                    registers.get(destination),
                    registers.get(source),
                )
            elif mnemonic == "or" and len(parts) == 2:
                source, destination = parts
                registers[destination] = binary(
                    "bitwise-or",
                    registers.get(destination),
                    registers.get(source),
                )
            elif len(parts) == 2 and parts[1] in registers:
                registers[parts[1]] = None

        if (
            compare_address is None
            or t_expression is None
            or (
                not contains_compound(t_expression)
                and contains_frame_field(t_expression)
            )
        ):
            continue
        branch = comparison_branch_outcomes(rows, compare_address)
        if (
            branch is None
            or branch["branchFileOffset"] != terminator["fileOffset"]
        ):
            continue
        result.append({
            "comparison": "frame-expression",
            "expression": t_expression,
            "compareFileOffset": hx(compare_address),
            "resolvedBranch": branch,
        })
    return result


def call_result_expression_branch_predicates(
    instructions: Sequence[tuple[int, str, str, int | None]],
    blocks: Sequence[dict[str, Any]],
    reached: set[int] | None = None,
) -> list[dict[str, Any]]:
    """Recover exact straight-line expressions spanning native calls.

    The room compiler keeps boolean masks and raw call results on the native
    stack while it evaluates later calls.  This symbolic pass follows only a
    unique-predecessor block chain, so a value is never merged across an
    unresolved control-flow join.  It recognizes the SH-4 register, stack,
    comparison-mask, bitwise, and r9-relative scene-load forms needed to keep
    those authored compound predicates intact.
    """

    rows = {
        row[0]: row
        for row in instructions
        if reached is None or row[0] in reached
    }
    block_by_start = {
        int(block["startFileOffset"], 16): block for block in blocks
    }
    predecessors: dict[int, list[int]] = {
        start: [] for start in block_by_start
    }
    for start, block in block_by_start.items():
        for successor in block.get("successors", []):
            value = int(successor, 16)
            if value in predecessors:
                predecessors[value].append(start)

    def binary(kind: str, left: Any, right: Any) -> dict[str, Any] | None:
        if not isinstance(left, dict) or not isinstance(right, dict):
            return None
        return {"kind": kind, "left": left, "right": right}

    def call_offsets(expression: Any) -> set[int]:
        if not isinstance(expression, dict):
            return set()
        result = set()
        if expression.get("kind") == "call-result":
            result.add(int(expression["callFileOffset"], 16))
        for name in ("left", "right", "operand"):
            result.update(call_offsets(expression.get(name)))
        return result

    result = []
    for target_start, target in sorted(block_by_start.items()):
        terminator = target.get("terminator")
        if terminator is None or terminator.get("mnemonic") not in {
            "bf", "bf.s", "bt", "bt.s",
        }:
            continue

        chain = [target_start]
        cursor = target_start
        while len(predecessors.get(cursor, [])) == 1:
            previous = predecessors[cursor][0]
            if len(block_by_start[previous].get("successors", [])) != 1:
                break
            chain.append(previous)
            cursor = previous
        chain.reverse()

        registers: dict[str, dict[str, Any] | None] = {
            f"r{index}": None for index in range(16)
        }
        stack: list[dict[str, Any] | None] = []
        t_expression: dict[str, Any] | None = None
        compared_value: dict[str, Any] | None = None
        comparison = None
        compare_address = None

        addresses = []
        for start in chain:
            block = block_by_start[start]
            end = int(block["endFileOffsetExclusive"], 16)
            addresses.extend(range(start, end, 2))
        branch_address = int(terminator["fileOffset"], 16)
        for address in addresses:
            if address >= branch_address:
                break
            row = rows.get(address)
            if row is None:
                continue
            _offset, mnemonic, operands, literal = row
            parts = operands.split(",", 1) if "," in operands else []
            indexed_scene_load = re.fullmatch(
                r"@\((r(?:1[0-5]|[0-9])),r9\),(r(?:1[0-5]|[0-9]))",
                operands,
            )

            if mnemonic in {"mov.b", "mov.w", "mov.l"} and indexed_scene_load:
                address_expression = registers.get(indexed_scene_load.group(1))
                destination = indexed_scene_load.group(2)
                if (
                    isinstance(address_expression, dict)
                    and address_expression.get("kind") == "constant"
                ):
                    width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
                    registers[destination] = {
                        "kind": "scene-field",
                        "offset": address_expression["value"],
                        "width": width,
                        "signedLoad": width != 4,
                    }
                else:
                    registers[destination] = None
            elif mnemonic == "mov" and len(parts) == 2:
                source, destination = parts
                immediate = signed_immediate(operands, destination)
                registers[destination] = (
                    {"kind": "constant", "value": immediate & 0xffffffff}
                    if immediate is not None
                    else registers.get(source)
                )
            elif mnemonic == "mov.l" and len(parts) == 2 and literal is not None:
                registers[parts[1]] = {
                    "kind": "constant", "value": literal & 0xffffffff,
                }
            elif mnemonic == "add" and len(parts) == 2:
                source, destination = parts
                immediate = signed_immediate(operands, destination)
                current = registers.get(destination)
                if (
                    source == "r9"
                    and isinstance(current, dict)
                    and current.get("kind") == "constant"
                ):
                    registers[destination] = {
                        "kind": "scene-address", "offset": current["value"],
                    }
                elif (
                    immediate is not None
                    and isinstance(current, dict)
                    and current.get("kind") == "scene-address"
                ):
                    registers[destination] = {
                        "kind": "scene-address",
                        "offset": current["offset"] + immediate,
                    }
                elif (
                    isinstance(current, dict)
                    and current.get("kind") == "scene-address"
                    and isinstance(registers.get(source), dict)
                    and registers[source].get("kind") == "constant"
                ):
                    addend = registers[source]["value"]
                    if addend & 0x80000000:
                        addend -= 0x100000000
                    registers[destination] = {
                        "kind": "scene-address",
                        "offset": current["offset"] + addend,
                    }
                elif destination == "r13" and immediate is not None and immediate >= 0:
                    for _ in range(immediate // 4):
                        if stack:
                            stack.pop()
                elif destination in registers:
                    registers[destination] = None
            elif mnemonic in {"mov.b", "mov.w", "mov.l"} and len(parts) == 2:
                source, destination = parts
                if source == "@r13+":
                    registers[destination] = stack.pop() if stack else None
                elif destination == "@-r13":
                    stack.append(registers.get(source))
                elif source.startswith("@(") and source.endswith(")"):
                    index_registers = source[2:-1].split(",")
                    address_expression = (
                        registers.get(index_registers[0])
                        if len(index_registers) == 2
                        and index_registers[1] == "r9"
                        else None
                    )
                    if (
                        isinstance(address_expression, dict)
                        and address_expression.get("kind") == "constant"
                    ):
                        width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
                        registers[destination] = {
                            "kind": "scene-field",
                            "offset": address_expression["value"],
                            "width": width,
                            "signedLoad": width != 4,
                        }
                    else:
                        registers[destination] = None
                elif source.startswith("@"):
                    address_expression = registers.get(source[1:])
                    if (
                        isinstance(address_expression, dict)
                        and address_expression.get("kind") == "scene-address"
                    ):
                        width = {"mov.b": 1, "mov.w": 2, "mov.l": 4}[mnemonic]
                        registers[destination] = {
                            "kind": "scene-field",
                            "offset": address_expression["offset"],
                            "width": width,
                            "signedLoad": width != 4,
                        }
                    else:
                        registers[destination] = None
                elif destination in registers:
                    registers[destination] = None
            elif mnemonic in {"jsr", "bsrf"}:
                registers["r0"] = {
                    "kind": "call-result", "callFileOffset": hx(address),
                }
            elif mnemonic in {"cmp/eq", "cmp/ge", "cmp/gt", "cmp/hi", "cmp/hs"}:
                if len(parts) == 2:
                    source, destination = parts
                    immediate = signed_immediate(operands, destination)
                    left = registers.get(destination)
                    right = (
                        {"kind": "constant", "value": immediate & 0xffffffff}
                        if immediate is not None else registers.get(source)
                    )
                    comparison = {
                        "cmp/eq": "equal",
                        "cmp/ge": "signed-greater-or-equal",
                        "cmp/gt": "signed-greater-than",
                        "cmp/hi": "unsigned-greater-than",
                        "cmp/hs": "unsigned-greater-or-equal",
                    }[mnemonic]
                    t_expression = binary(comparison, left, right)
                    compared_value = left
                    compare_address = address
                else:
                    immediate = signed_immediate(operands, "r0")
                    if immediate is not None:
                        compared_value = registers.get("r0")
                        comparison = "equal"
                        t_expression = binary(
                            comparison,
                            compared_value,
                            {"kind": "constant", "value": immediate & 0xffffffff},
                        )
                        compare_address = address
            elif mnemonic == "subc" and len(parts) == 2:
                source, destination = parts
                registers[destination] = (
                    {"kind": "comparison-mask", "operand": t_expression}
                    if source == destination and t_expression is not None
                    else None
                )
            elif mnemonic in {"and", "or"} and len(parts) == 2:
                source, destination = parts
                registers[destination] = binary(
                    "bitwise-and" if mnemonic == "and" else "bitwise-or",
                    registers.get(destination),
                    registers.get(source),
                )
            elif len(parts) == 2 and parts[1] in registers:
                registers[parts[1]] = None

        calls = call_offsets(compared_value)
        branch = comparison_branch_outcomes(rows, compare_address) \
            if compare_address is not None else None
        if not calls or branch is None or comparison != "equal":
            continue
        constant_expression = (
            t_expression.get("right")
            if isinstance(t_expression, dict)
            else None
        )
        if (
            not isinstance(constant_expression, dict)
            or constant_expression.get("kind") != "constant"
        ):
            continue
        result.append({
            "kind": "callResultExpression",
            "expression": compared_value,
            "comparison": "equal",
            "constant": constant_expression["value"],
            "compareFileOffset": hx(compare_address),
            "sourceCallFileOffset": hx(max(calls)),
            "resolvedBranch": branch,
        })
    return result
