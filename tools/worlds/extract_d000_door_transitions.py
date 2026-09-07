#!/usr/bin/env python3
"""Recover D000's direct logical-door transition cases from native SH-4.

The D000 room script compares the logical door selector stored at
``@(48,r14)`` and, for the simple storefront cases, immediately invokes the
shared transition coroutine at file offset 0x7ee88 with:

    mode, entry, four-byte area ID, scene

The coroutine reorders those arguments and forwards ``scene, area, entry`` to
operation 0x0030.
Only selector branches with that exact, immediate control-flow shape are
classified as direct here. More complicated selectors are retained as
unresolved instead of being guessed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import disassemble


TRANSITION_COROUTINE = 0x7EE88
EXPECTED_OPERATION_CALL = 0x7F256


def signed_u32(value: int) -> int:
    return value - 0x1_0000_0000 if value >= 0x8000_0000 else value


def branch_target(address: int, literal: int) -> int:
    return (address + 4 + signed_u32(literal)) & 0xFFFF_FFFF


def immediate(operand: str, register: str) -> int | None:
    suffix = f",{register}"
    if not operand.endswith(suffix):
        return None
    source = operand[: -len(suffix)]
    if not source.startswith("#"):
        return None
    try:
        return int(source[1:], 0)
    except ValueError:
        return None


def ascii_word(value: int) -> str | None:
    raw = struct.pack("<I", value & 0xFFFF_FFFF)
    if not all(0x30 <= byte <= 0x5A for byte in raw):
        return None
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError:
        return None


def direct_cases(
    instructions: list[tuple[int, str, str, int | None]],
) -> list[dict[str, Any]]:
    """Match selector equality followed immediately by a transition call."""

    by_address = {row[0]: index for index, row in enumerate(instructions)}
    cases: list[dict[str, Any]] = []
    for index, row in enumerate(instructions):
        address, mnemonic, operands, _literal = row
        if mnemonic != "mov.l" or operands != "@(48,r14),r4":
            continue
        window = instructions[index : index + 18]
        if len(window) < 18:
            continue

        selector = immediate(window[1][2], "r5")
        if selector is None:
            continue
        expected = [
            ("cmp/eq", "r5,r4"),
            ("subc", "r4,r4"),
            ("mov", "r4,r0"),
            ("cmp/eq", "#0,r0"),
        ]
        if [(item[1], item[2]) for item in window[2:6]] != expected:
            continue
        if window[6][1] != "bf":
            continue
        try:
            case_start = int(window[6][2], 16)
        except ValueError:
            continue
        case_index = by_address.get(case_start)
        if case_index is None:
            continue
        block = instructions[case_index : case_index + 12]
        if len(block) < 12:
            continue

        mode = immediate(block[0][2], "r4")
        entry = immediate(block[1][2], "r5")
        scene = immediate(block[3][2], "r7")
        if (
            mode is None
            or scene is None
            or entry is None
            or block[2][1] != "mov.l"
            or not block[2][2].endswith(",r6")
            or block[2][3] is None
        ):
            continue
        area = ascii_word(block[2][3])
        if area is None:
            continue
        if [
            (item[1], item[2])
            for item in block[4:8]
        ] != [
            ("mov.l", "r4,@-r13"),
            ("mov.l", "r5,@-r13"),
            ("mov.l", "r6,@-r13"),
            ("mov.l", "r7,@-r13"),
        ]:
            continue
        if (
            block[8][1] != "mov.l"
            or not block[8][2].endswith(",r1")
            or block[8][3] is None
            or block[9][1] != "bsrf"
            or branch_target(block[9][0], block[8][3])
            != TRANSITION_COROUTINE
        ):
            continue
        cases.append(
            {
                "selector": selector,
                "selectorCompareFileOffset": f"0x{address:x}",
                "caseFileOffset": f"0x{case_start:x}",
                "coroutineCallFileOffset": f"0x{block[9][0]:x}",
                "mode": mode,
                "destination": {
                    "scene": scene,
                    "area": area,
                    "entry": entry,
                },
            }
        )
    return cases


def transition_coroutine_calls(
    instructions: list[tuple[int, str, str, int | None]],
) -> list[dict[str, Any]]:
    """Inventory every literal call to the shared coroutine in the door body."""

    calls = []
    for index, row in enumerate(instructions):
        address, mnemonic, _operands, _literal = row
        if not (0x78000 <= address < 0x7A000) or mnemonic != "bsrf":
            continue
        if index < 9:
            continue
        literal_load = instructions[index - 1]
        if (
            literal_load[1] != "mov.l"
            or not literal_load[2].endswith(",r1")
            or literal_load[3] is None
            or branch_target(address, literal_load[3])
            != TRANSITION_COROUTINE
        ):
            continue
        block = instructions[index - 9 : index + 1]
        mode = immediate(block[0][2], "r4")
        entry = immediate(block[1][2], "r5")
        scene = immediate(block[3][2], "r7")
        area = (
            ascii_word(block[2][3])
            if block[2][1] == "mov.l" and block[2][3] is not None
            else None
        )
        if None in (mode, scene, entry, area):
            continue
        calls.append(
            {
                "coroutineCallFileOffset": f"0x{address:x}",
                "mode": mode,
                "destination": {
                    "scene": scene,
                    "area": area,
                    "entry": entry,
                },
            }
        )
    return calls


def referenced_selectors(
    instructions: list[tuple[int, str, str, int | None]],
) -> list[int]:
    selectors = set()
    for index, row in enumerate(instructions[:-2]):
        if not (0x78000 <= row[0] < 0x7A000):
            continue
        if row[1] != "mov.l" or not row[2].startswith("@(48,r14),r"):
            continue
        tested_register = row[2].rsplit(",", 1)[1]
        value_load = instructions[index + 1]
        compare = instructions[index + 2]
        value_register = value_load[2].rsplit(",", 1)[-1]
        value = immediate(value_load[2], value_register)
        if (
            value_load[1] == "mov"
            and value is not None
            and compare[1] == "cmp/eq"
            and compare[2] == f"{value_register},{tested_register}"
        ):
            selectors.add(value)
    return sorted(selectors)


def conditional_cases(
    instructions: list[tuple[int, str, str, int | None]],
    candidate_calls: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Recover conditional selector routes whose full branch is proven.

    These cases are deliberately checked against the native instruction
    stream before being emitted.  The conditions are retained as an
    operation-level expression; no story meaning is inferred for a flag or
    engine state whose name has not yet been recovered.
    """

    by_address = {row[0]: row for row in instructions}
    calls = {
        int(item["coroutineCallFileOffset"], 16): item
        for item in candidate_calls
    }

    def expect(
        address: int,
        mnemonic: str,
        operands: str | None = None,
        literal: int | None = None,
    ) -> None:
        row = by_address.get(address)
        if row is None or row[1] != mnemonic:
            raise ValueError(
                f"Expected {mnemonic} at 0x{address:x}; found {row}"
            )
        if operands is not None and row[2] != operands:
            raise ValueError(
                f"Expected {operands} at 0x{address:x}; found {row[2]}"
            )
        if literal is not None and row[3] != literal:
            raise ValueError(
                f"Expected literal {literal} at 0x{address:x}; "
                f"found {row[3]}"
            )

    def flag_clear(flag: int) -> dict[str, Any]:
        return {
            "operator": "flagClear",
            "operation": "0x0051",
            "subcommand": 11,
            "namespace": 2,
            "flag": flag,
        }

    def all_terms(*terms: dict[str, Any]) -> dict[str, Any]:
        return {"operator": "all", "terms": list(terms)}

    def not_term(term: dict[str, Any]) -> dict[str, Any]:
        return {"operator": "not", "term": term}

    # Selector 26 is the Asia Travel door.  Its six literal transition calls
    # are one ordered story-state decision tree, not six separate doors.
    # Keep the two opaque native predicates identified by their exact
    # function/call offsets and arguments rather than assigning story names.
    expect(0x78F70, "mov.l", "@(48,r14),r4")
    expect(0x78F72, "mov", "#26,r5")
    expect(0x78F88, "mov.l", "0x78fcc,r4", 956)
    expect(0x78F8A, "mov", "#11,r5")
    expect(0x78F9E, "mov.l", "0x78fd0,r5", 400)
    expect(0x78FA0, "mov", "#11,r6")
    expect(0x78FC4, "bf", "0x78fd8")
    expect(0x78FD8, "mov", "#1,r4")
    expect(0x78FDA, "mov.l", "0x79010,r5", 400)
    expect(0x78FDC, "mov", "#12,r6")

    expect(0x79020, "mov.l", "0x79064,r4", 360)
    expect(0x79022, "mov", "#11,r5")
    expect(0x79036, "mov.l", "0x79068,r5", 370)
    expect(0x79038, "mov", "#11,r6")
    expect(0x7905C, "bf", "0x79070")
    expect(0x79070, "mov", "#24,r4")
    expect(0x79074, "mov.l", "0x790ac,r1", 0xFFF9ACFA)
    expect(0x79076, "bsrf", "r1")
    expect(0x79084, "mov", "#30,r5")
    expect(0x7908A, "mov.l", "0x790b0,r1", 0xFFF9AEA0)
    expect(0x7908C, "bsrf", "r1")
    expect(0x79094, "mov.l", "0x790b4,r5", 240)
    expect(0x790A2, "bf", "0x790bc")
    expect(0x790BC, "mov", "#1,r4")
    expect(0x790BE, "mov.l", "0x79104,r5", 370)
    expect(0x790C0, "mov", "#12,r6")

    expect(0x791C0, "mov.l", "0x79228,r4", 330)
    expect(0x791C2, "mov", "#11,r5")
    expect(0x791D6, "mov.l", "0x7922c,r5", 861)
    expect(0x791D8, "mov", "#11,r6")
    expect(0x791F8, "mov.l", "0x79230,r4", 350)
    expect(0x791FA, "mov", "#11,r6")
    expect(0x7921E, "bf", "0x79238")

    expect(0x79264, "mov.l", "0x792a8,r4", 350)
    expect(0x79266, "mov", "#11,r5")
    expect(0x7927A, "mov.l", "0x792ac,r5", 360)
    expect(0x7927C, "mov", "#11,r6")
    expect(0x792A0, "bf", "0x792b4")
    expect(0x792B4, "mov", "#1,r4")
    expect(0x792B6, "mov.l", "0x792ec,r5", 360)
    expect(0x792B8, "mov", "#12,r6")

    predicate_24 = {
        "operator": "nativePredicateGreaterThan",
        "functionFileOffset": "0x13d74",
        "callFileOffset": "0x79076",
        "arguments": [24],
        "threshold": 0,
    }
    predicate_30 = {
        "operator": "nativePredicateGreaterThan",
        "functionFileOffset": "0x13f30",
        "callFileOffset": "0x7908c",
        "arguments": [30],
        "threshold": 240,
    }
    if (
        branch_target(0x79076, by_address[0x79074][3]) != 0x13D74
        or branch_target(0x7908C, by_address[0x7908A][3]) != 0x13F30
    ):
        raise ValueError("Selector 26 native predicate targets changed")

    first_state = all_terms(flag_clear(956), flag_clear(400))
    second_state = all_terms(flag_clear(360), flag_clear(370))
    predicate_state = {
        "operator": "any",
        "terms": [predicate_24, predicate_30],
    }
    third_state = all_terms(
        flag_clear(330), flag_clear(861), flag_clear(350)
    )
    fourth_state = all_terms(flag_clear(350), flag_clear(360))
    selector_26 = {
        "selector": 26,
        "selectorCompareFileOffset": "0x78f70",
        "orderedRoutes": [
            {
                "condition": first_state,
                "destination": calls[0x79002]["destination"],
                "sideEffects": [
                    {
                        "operator": "setFlag",
                        "operation": "0x0051",
                        "subcommand": 12,
                        "namespace": 2,
                        "flag": 400,
                        "value": 1,
                    }
                ],
            },
            {
                "condition": all_terms(
                    not_term(first_state),
                    second_state,
                    predicate_state,
                ),
                "destination": calls[0x7917A]["destination"],
                "sideEffects": [
                    {
                        "operator": "setFlag",
                        "operation": "0x0051",
                        "subcommand": 12,
                        "namespace": 2,
                        "flag": 370,
                        "value": 1,
                    },
                    {
                        "operator": "nativeScriptBlock",
                        "fileRange": ["0x790d4", "0x79166"],
                    },
                ],
            },
            {
                "condition": all_terms(
                    not_term(first_state),
                    second_state,
                    not_term(predicate_state),
                ),
                "destination": calls[0x791A6]["destination"],
            },
            {
                "condition": all_terms(
                    not_term(first_state),
                    not_term(second_state),
                    third_state,
                ),
                "destination": calls[0x7924A]["destination"],
            },
            {
                "condition": all_terms(
                    not_term(first_state),
                    not_term(second_state),
                    not_term(third_state),
                    fourth_state,
                ),
                "destination": calls[0x792DE]["destination"],
                "sideEffects": [
                    {
                        "operator": "setFlag",
                        "operation": "0x0051",
                        "subcommand": 12,
                        "namespace": 2,
                        "flag": 360,
                        "value": 1,
                    }
                ],
            },
            {
                "condition": {"operator": "otherwise"},
                "destination": calls[0x7930E]["destination"],
            },
        ],
        "evidence": {
            "conditionFileRange": ["0x78f88", "0x79318"],
            "coroutineCallFileOffsets": [
                "0x79002",
                "0x7917a",
                "0x791a6",
                "0x7924a",
                "0x792de",
                "0x7930e",
            ],
            "opaqueNativePredicateTargets": ["0x13d74", "0x13f30"],
        },
    }

    # Selector 28 reads persistent/global flag-bank bits 70 and 100 via
    # operation 0x0051 subcommand 11, ANDs the two "is zero" results, and
    # selects DHQB only when both are clear.
    expect(0x79328, "mov.l", "@(48,r14),r4")
    expect(0x7932A, "mov", "#28,r5")
    expect(0x79340, "mov", "#70,r4")
    expect(0x79342, "mov", "#11,r5")
    expect(0x79356, "mov", "#100,r5")
    expect(0x79358, "mov", "#11,r6")
    expect(0x7937C, "bf", "0x79388")
    selector_28 = {
        "selector": 28,
        "selectorCompareFileOffset": "0x79328",
        "condition": {
            "operator": "all",
            "terms": [
                {
                    "operator": "flagClear",
                    "operation": "0x0051",
                    "subcommand": 11,
                    "namespace": 2,
                    "flag": 70,
                },
                {
                    "operator": "flagClear",
                    "operation": "0x0051",
                    "subcommand": 11,
                    "namespace": 2,
                    "flag": 100,
                },
            ],
        },
        "whenTrue": calls[0x7939A]["destination"],
        "whenFalse": calls[0x793C6]["destination"],
        "evidence": {
            "conditionFileRange": ["0x79340", "0x79382"],
            "trueCoroutineCallFileOffset": "0x7939a",
            "falseCoroutineCallFileOffset": "0x793c6",
        },
    }

    # Selector 35 has a three-way native route. Flags 160 and 180 both clear
    # select TOKI scene 10. Otherwise TOKI scene 1 requires all of:
    # 16:00 < the room clock < 19:02, op0x019c == 2, and flag 818 clear.
    # Every other state selects DRSA scene 0.
    expect(0x795BC, "mov.l", "@(48,r14),r4")
    expect(0x795BE, "mov", "#35,r5")
    expect(0x795D4, "mov.l", "0x79618,r4", 160)
    expect(0x795D6, "mov", "#11,r5")
    expect(0x795EA, "mov.l", "0x7961c,r5", 180)
    expect(0x795EC, "mov", "#11,r6")
    expect(0x79654, "mov.l", "0x796b0,r5", 1600)
    expect(0x7965E, "mov.l", "0x796b4,r6", 1902)
    expect(0x79668, "mov.l", "0x796b8,r5", 412)
    expect(0x79674, "mov", "#2,r5")
    expect(0x7967E, "mov.l", "0x796bc,r4", 818)
    expect(0x79680, "mov", "#11,r6")
    selector_35 = {
        "selector": 35,
        "selectorCompareFileOffset": "0x795bc",
        "routes": [
            {
                "condition": {
                    "operator": "all",
                    "terms": [
                        {
                            "operator": "flagClear",
                            "operation": "0x0051",
                            "subcommand": 11,
                            "namespace": 2,
                            "flag": 160,
                        },
                        {
                            "operator": "flagClear",
                            "operation": "0x0051",
                            "subcommand": 11,
                            "namespace": 2,
                            "flag": 180,
                        },
                    ],
                },
                "destination": calls[0x79636]["destination"],
            },
            {
                "condition": {
                    "operator": "all",
                    "terms": [
                        {
                            "operator": "clockBetweenExclusive",
                            "encoding": "HHMM",
                            "after": 1600,
                            "before": 1902,
                        },
                        {
                            "operator": "operationEquals",
                            "operation": "0x019c",
                            "value": 2,
                        },
                        {
                            "operator": "flagClear",
                            "operation": "0x0051",
                            "subcommand": 11,
                            "namespace": 2,
                            "flag": 818,
                        },
                    ],
                },
                "destination": calls[0x796D6]["destination"],
            },
            {
                "condition": {"operator": "otherwise"},
                "destination": calls[0x79702]["destination"],
            },
        ],
        "evidence": {
            "conditionFileRange": ["0x795d4", "0x796aa"],
            "coroutineCallFileOffsets": [
                "0x79636",
                "0x796d6",
                "0x79702",
            ],
        },
    }
    return [selector_26, selector_28, selector_35]


def build_report(
    mapinfo_path: Path,
    door_logic_path: Path,
    objdump: str,
) -> dict[str, Any]:
    data = mapinfo_path.read_bytes()
    instructions = disassemble(mapinfo_path, objdump)
    cases = direct_cases(instructions)
    candidate_calls = transition_coroutine_calls(instructions)
    conditional_routes = conditional_cases(instructions, candidate_calls)
    scripted_selectors = set(referenced_selectors(instructions))
    door_logic = json.loads(door_logic_path.read_text())
    door_by_selector = {
        item["selector"]: item for item in door_logic["doors"]
    }
    for item in cases:
        door = door_by_selector[item["selector"]]
        item["sourceDoor"] = {
            "visibleStaticDoorIndex": door["visibleStaticDoorIndex"],
            "model": door["model"],
            "position": door["position"],
            "rotationDegrees": door["rotationDegrees"],
            "usesInvisibleProxy": door["usesInvisibleProxy"],
        }
    for item in conditional_routes:
        door = door_by_selector[item["selector"]]
        item["sourceDoor"] = {
            "visibleStaticDoorIndex": door["visibleStaticDoorIndex"],
            "model": door["model"],
            "position": door["position"],
            "rotationDegrees": door["rotationDegrees"],
            "usesInvisibleProxy": door["usesInvisibleProxy"],
        }

    direct_selectors = {item["selector"] for item in cases}
    resolved_conditional_selectors = {
        item["selector"] for item in conditional_routes
    }
    transition_selectors = (
        direct_selectors | resolved_conditional_selectors
    )
    all_selectors = set(door_by_selector)
    conditional_selectors = scripted_selectors - direct_selectors
    no_branch_selectors = all_selectors - scripted_selectors
    native_non_transition_selectors = all_selectors - transition_selectors
    # Every literal call to the native shared transition coroutine has been
    # consumed by one direct or conditional route above. This proves that the
    # remaining logical door selectors have no warp edge in this dispatcher,
    # while leaving their denial/dialogue/story interaction semantics open.
    expected_transition_call_count = len(cases) + sum(
        len(
            item.get(
                "orderedRoutes",
                item.get(
                    "routes",
                    [item.get("whenTrue"), item.get("whenFalse")],
                ),
            )
        )
        for item in conditional_routes
    )
    if expected_transition_call_count != len(candidate_calls):
        raise ValueError(
            "Not every native D000 transition-coroutine call is assigned "
            "to one exact logical-door route"
        )
    return {
        "schema": "new-yokosuka-d000-door-transitions-v1",
        "source": {
            "mapinfo": str(mapinfo_path),
            "mapinfoSha256": hashlib.sha256(data).hexdigest(),
            "doorLogic": str(door_logic_path),
        },
        "nativeFlow": {
            "selectorFrameOffset": 48,
            "transitionCoroutineFileOffset": (
                f"0x{TRANSITION_COROUTINE:x}"
            ),
            "operation0030CallFileOffset": (
                f"0x{EXPECTED_OPERATION_CALL:x}"
            ),
            "coroutineArguments": ["mode", "entry", "area", "scene"],
            "operationArguments": ["scene", "area", "entry"],
        },
        "summary": {
            "logicalDoorCount": len(all_selectors),
            "directTransitionCount": len(cases),
            "resolvedConditionalTransitionCount": len(conditional_routes),
            "conditionalSelectorCount": len(conditional_selectors),
            "noBranchSelectorCount": len(no_branch_selectors),
            "transitionCoroutineCallCount": len(candidate_calls),
            "resolvedTransitionSelectorCount": len(transition_selectors),
            "nativeNonTransitionSelectorCount": len(
                native_non_transition_selectors
            ),
            "unresolvedTransitionSelectorCount": 0,
            "unresolvedInteractionSelectorCount": len(
                native_non_transition_selectors
            ),
        },
        "directTransitions": sorted(
            cases, key=lambda item: item["selector"]
        ),
        "conditionalTransitions": conditional_routes,
        "conditionalTransitionCandidates": candidate_calls,
        "conditionalSelectors": sorted(conditional_selectors),
        "noBranchSelectors": sorted(no_branch_selectors),
        "nativeNonTransitionSelectors": [
            {
                "selector": selector,
                "hasSelectorBranch": selector in scripted_selectors,
                "classification": (
                    "selectorBranchWithoutTransitionCoroutineCall"
                    if selector in scripted_selectors
                    else "noSelectorBranch"
                ),
                "sourceDoor": {
                    "visibleStaticDoorIndex": (
                        door_by_selector[selector]["visibleStaticDoorIndex"]
                    ),
                    "model": door_by_selector[selector]["model"],
                    "position": door_by_selector[selector]["position"],
                    "rotationDegrees": (
                        door_by_selector[selector]["rotationDegrees"]
                    ),
                    "usesInvisibleProxy": (
                        door_by_selector[selector]["usesInvisibleProxy"]
                    ),
                },
            }
            for selector in sorted(native_non_transition_selectors)
        ],
        "unresolvedInteractionSelectors": sorted(
            native_non_transition_selectors
        ),
        "evidenceBoundary": (
            "Only immediate selector-equality branches with a literal "
            "entry/area/scene tuple and a verified call to 0x7ee88 are "
            "classified as direct. Conditional routes are emitted only when "
            "the complete native flag/time/operation branch is verified. "
            "All 29 calls to the shared transition coroutine are assigned to "
            "one of the 21 transition selectors. The other 44 selectors "
            "therefore have no warp edge in this dispatcher; their dialogue, "
            "denial, locked, or other interaction behavior remains unresolved."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "mapinfo",
        nargs="?",
        type=Path,
        default=Path(".disc-work/exact/d000/MAPINFO.BIN"),
    )
    parser.add_argument(
        "--door-logic",
        type=Path,
        default=Path("tools/evidence/d000-door-logic.json"),
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/d000-door-transitions.json"),
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(args.mapinfo, args.door_logic, args.objdump)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['summary']['directTransitionCount']} direct transitions, "
        f"{report['summary']['resolvedTransitionSelectorCount']} transition "
        "selectors and 0 unresolved warp selectors"
    )


if __name__ == "__main__":
    main()
