#!/usr/bin/env python3
"""Recover the generated room interaction-table registration boundary.

The room compiler emits one recognizable setup routine for its ordinary
actor-interaction subsystem.  The routine:

* calls operations 0x019c, 0x0084, 0x012c, 0x00a8, and 0x01a2;
* performs two typed indexed accesses through operation 0x009a; and
* receives four static-data bases and two additional control words from its
  exact caller.

This extractor finds that routine structurally in the native event IR,
recovers its caller arguments from SH-4 instructions, and serializes the four
parallel tables without assigning gameplay meanings to unresolved columns.
Static pointers are resolved relative to SCN3's static-data base, not as raw
MAPINFO file offsets.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.lib.portable_paths import portable_project_path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_INDEX = (
    PROJECT_ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work/dialogue/dialogue-interaction-registration.json"
)
DEFAULT_SUMMARY = (
    PROJECT_ROOT / "tools/evidence/dialogue-interaction-registration.json"
)

REQUIRED_OPERATIONS = frozenset(
    {"0x009a", "0x019c", "0x0084", "0x012c", "0x00a8", "0x01a2"}
)
REGISTER = re.compile(r"^r(?:1[0-5]|[0-9])$")
CONTROL_FLOW = {
    "bra",
    "braf",
    "bsr",
    "bsrf",
    "bt",
    "bt/s",
    "bf",
    "bf/s",
    "jmp",
    "jsr",
    "rts",
}
TABLE_COUNT = 4
INDEX_STRIDE_WORDS = 13
INTERNAL_SLOT_COUNT = 10


def hx(value: int) -> str:
    return f"0x{value:x}"


def unresolved(reason: str, address: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {"kind": "unresolved", "reason": reason}
    if address is not None:
        result["sourceFileOffset"] = hx(address)
    return result


def constant(value: int, address: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "kind": "constant",
        "value": value & 0xFFFFFFFF,
        "hex": f"0x{value & 0xFFFFFFFF:08x}",
    }
    if address is not None:
        result["sourceFileOffset"] = hx(address)
    return result


def static_pointer(relative: int, address: int | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        "kind": "static-pointer",
        "relativeOffset": relative & 0xFFFFFFFF,
        "relativeOffsetHex": hx(relative & 0xFFFFFFFF),
    }
    if address is not None:
        result["sourceFileOffset"] = hx(address)
    return result


def signed_immediate(value: str) -> int | None:
    if not value.startswith("#"):
        return None
    try:
        return int(value[1:], 0)
    except ValueError:
        return None


def assigned_register(mnemonic: str, operands: str) -> str | None:
    if "," not in operands:
        return None
    destination = operands.rsplit(",", 1)[1]
    return destination if REGISTER.fullmatch(destination) else None


def add_values(
    left: dict[str, Any],
    right: dict[str, Any],
    address: int,
) -> dict[str, Any]:
    if left["kind"] == "constant" and right["kind"] == "constant":
        return constant(left["value"] + right["value"], address)
    if left["kind"] == "static-base" and right["kind"] == "constant":
        return static_pointer(right["value"], address)
    if left["kind"] == "constant" and right["kind"] == "static-base":
        return static_pointer(left["value"], address)
    if left["kind"] == "static-pointer" and right["kind"] == "constant":
        return static_pointer(left["relativeOffset"] + right["value"], address)
    if left["kind"] == "constant" and right["kind"] == "static-pointer":
        return static_pointer(right["relativeOffset"] + left["value"], address)
    return unresolved("non-static-addition", address)


def resolve_register(
    instructions: Sequence[tuple[int, str, str, int | None]],
    register: str,
    before_index: int,
    lower_bound: int,
    *,
    depth: int = 0,
) -> dict[str, Any]:
    if depth > 20:
        return unresolved("register-copy-depth-exceeded")
    for index in range(before_index - 1, lower_bound - 1, -1):
        address, mnemonic, operands, literal = instructions[index]
        destination = assigned_register(mnemonic, operands)
        if destination != register:
            continue
        source = operands.rsplit(",", 1)[0]
        if mnemonic == "mov":
            immediate = signed_immediate(source)
            if immediate is not None:
                return constant(immediate, address)
            if REGISTER.fullmatch(source):
                return resolve_register(
                    instructions,
                    source,
                    index,
                    lower_bound,
                    depth=depth + 1,
                )
            return unresolved(f"unsupported-move-source:{source}", address)
        if mnemonic == "mov.l":
            if literal is not None:
                return constant(literal, address)
            if source == "@(4,r8)":
                return {
                    "kind": "static-base",
                    "sourceFileOffset": hx(address),
                }
            return unresolved(f"mutable-memory-load:{source}", address)
        if mnemonic == "add":
            left_source = operands.split(",", 1)[0]
            prior_destination = resolve_register(
                instructions,
                register,
                index,
                lower_bound,
                depth=depth + 1,
            )
            immediate = signed_immediate(left_source)
            if immediate is not None:
                return add_values(
                    prior_destination,
                    constant(immediate),
                    address,
                )
            if REGISTER.fullmatch(left_source):
                left = resolve_register(
                    instructions,
                    left_source,
                    index,
                    lower_bound,
                    depth=depth + 1,
                )
                return add_values(prior_destination, left, address)
            return unresolved(f"unsupported-add-source:{left_source}", address)
        return unresolved(f"unsupported-assignment:{mnemonic}", address)
    return unresolved(f"no-definition:{register}")


def basic_block_lower_bound(
    instructions: Sequence[tuple[int, str, str, int | None]],
    call_index: int,
    function_start: int,
) -> int:
    lower = 0
    while lower < len(instructions) and instructions[lower][0] < function_start:
        lower += 1
    for index in range(call_index - 1, lower - 1, -1):
        if instructions[index][1] in CONTROL_FLOW:
            return index + 2  # skip the SH-4 delay slot as well
    return lower


def pushed_arguments(
    instructions: Sequence[tuple[int, str, str, int | None]],
    call_index: int,
    function_start: int,
) -> list[dict[str, Any]] | None:
    cleanup_index = call_index + 2
    if cleanup_index >= len(instructions):
        return None
    _address, mnemonic, operands, _literal = instructions[cleanup_index]
    if mnemonic != "add" or not operands.endswith(",r13"):
        return []
    byte_count = signed_immediate(operands.split(",", 1)[0])
    if byte_count is None or byte_count <= 0 or byte_count % 4:
        return None
    count = byte_count // 4
    lower_bound = basic_block_lower_bound(
        instructions,
        call_index,
        function_start,
    )
    pushes: list[tuple[int, str]] = []
    for index in range(call_index - 1, lower_bound - 1, -1):
        _address, push_mnemonic, push_operands, _value = instructions[index]
        if push_mnemonic == "mov.l" and push_operands.endswith(",@-r13"):
            source = push_operands.split(",", 1)[0]
            if not REGISTER.fullmatch(source):
                return None
            pushes.append((index, source))
            if len(pushes) == count:
                break
    if len(pushes) != count:
        return None
    return [
        resolve_register(
            instructions,
            register,
            push_index,
            lower_bound,
        )
        for push_index, register in pushes
    ]


def decode_tag(value: int) -> str | None:
    raw = struct.pack("<I", value)
    if all(0x20 <= byte <= 0x7E for byte in raw):
        return raw.decode("ascii")
    return None


def static_layout(data: bytes) -> tuple[int, int, int]:
    scn3 = data.find(b"SCN3")
    if scn3 < 0 or scn3 + 0x18 > len(data):
        raise ValueError("MAPINFO has no complete SCN3 token")
    code_end = scn3 + struct.unpack_from("<I", data, scn3 + 0x0C)[0]
    static_base = scn3 + struct.unpack_from("<I", data, scn3 + 0x10)[0]
    if code_end > len(data) or static_base >= len(data):
        raise ValueError("SCN3 code/static offsets lie outside MAPINFO")
    return scn3, code_end, static_base


def candidate_functions(map_entry: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = []
    for function in map_entry["functions"]:
        operations = [
            action["operationHex"]
            for block in function["blocks"]
            for action in block.get("actions", [])
            if action["kind"] == "engineOperation"
        ]
        if (
            REQUIRED_OPERATIONS.issubset(operations)
            and operations.count("0x009a") == 2
        ):
            candidates.append(function)
    return candidates


def direct_callers(
    map_entry: dict[str, Any],
    target: str,
) -> list[dict[str, Any]]:
    callers = []
    for function in map_entry["functions"]:
        for block in function["blocks"]:
            for action in block.get("actions", []):
                if (
                    action["kind"] == "directCall"
                    and action["targetFileOffset"] == target
                ):
                    callers.append(
                        {
                            "function": function["id"],
                            "callFileOffset": action["callFileOffset"],
                        }
                    )
    return callers


def serialize_static_input(
    data: bytes,
    static_base: int,
    pointer: dict[str, Any],
    *,
    probe_strided_words: bool = False,
) -> dict[str, Any]:
    if pointer["kind"] != "static-pointer":
        return {
            "pointer": pointer,
            "status": "unresolved-pointer",
        }
    file_offset = static_base + pointer["relativeOffset"]
    preview_bytes = INDEX_STRIDE_WORDS * 4
    if file_offset < 0 or file_offset + preview_bytes > len(data):
        return {
            "pointer": pointer,
            "fileOffset": hx(file_offset),
            "status": "outside-mapinfo",
        }
    result = {
        "pointer": pointer,
        "fileOffset": hx(file_offset),
        "sha256": hashlib.sha256(
            data[file_offset : file_offset + preview_bytes]
        ).hexdigest(),
        "status": "exact",
        "wordPreview": list(
            struct.unpack_from(
                f"<{INDEX_STRIDE_WORDS}I",
                data,
                file_offset,
            )
        ),
    }
    if probe_strided_words:
        probes = []
        for slot in range(INTERNAL_SLOT_COUNT):
            probe_offset = (
                file_offset + slot * INDEX_STRIDE_WORDS * 4
            )
            if probe_offset + 4 > len(data):
                result["status"] = "strided-probe-outside-mapinfo"
                break
            value = struct.unpack_from("<I", data, probe_offset)[0]
            probes.append(
                {
                    "internalSlot": slot,
                    "fileOffset": hx(probe_offset),
                    "value": value,
                    "valueHex": f"0x{value:08x}",
                }
            )
        result["provenSetupRead"] = {
            "operation": "0x009a",
            "typeOperand": 4,
            "indexFormula": "internalSlot * 13",
            "elementWidthBytes": 4,
            "byteStride": INDEX_STRIDE_WORDS * 4,
            "internalSlotCount": INTERNAL_SLOT_COUNT,
            "probes": probes,
        }
    return result


def scene_bindings(
    instructions: Sequence[tuple[int, str, str, int | None]],
    function_start: int,
    function_end: int,
) -> list[dict[str, Any]]:
    function = [
        instruction
        for instruction in instructions
        if function_start <= instruction[0] < function_end
    ]
    bindings = []
    for index in range(len(function) - 3):
        first, second, third, fourth = function[index : index + 4]
        if not (
            first[1] == "mov.l"
            and first[3] is not None
            and first[2].endswith(",r4")
            and second[1] == "add"
            and second[2] == "r9,r4"
            and third[1] == "mov.l"
            and third[2].endswith(",r5")
            and fourth[1] == "mov.l"
            and fourth[2] == "r5,@r4"
        ):
            continue
        match = re.fullmatch(r"@\((\d+),r14\),r5", third[2])
        if not match:
            continue
        frame_offset = int(match.group(1))
        if frame_offset < 20 or (frame_offset - 20) % 4:
            continue
        bindings.append(
            {
                "callerArgument": (frame_offset - 20) // 4,
                "frameOffset": frame_offset,
                "sceneFieldOffset": first[3],
                "sceneFieldOffsetHex": hx(first[3]),
                "storeFileOffset": hx(fourth[0]),
            }
        )
    return bindings


def build_report(
    native_ir: dict[str, Any],
    scripted_index: dict[str, Any],
    objdump: str,
) -> dict[str, Any]:
    sources = {
        (entry["disc"], entry["area"]): entry
        for entry in scripted_index["maps"]
    }
    registrations = []
    gaps = []
    candidate_count = 0
    for map_entry in native_ir["maps"]:
        candidates = candidate_functions(map_entry)
        candidate_count += len(candidates)
        if not candidates:
            continue
        source_entry = sources[(map_entry["disc"], map_entry["area"])]
        source = Path(source_entry["source"])
        data = source.read_bytes()
        scn3, _code_end, static_base = static_layout(data)
        instructions = [
            instruction
            for instruction in disassemble(source, objdump)
            # Generated helper functions end at SCN3 +0x0c, while the room's
            # initial/root routine occupies the following executable tail.
            # Both precede the static-data base and can own the setup call.
            if scn3 + 0x30 <= instruction[0] < static_base
        ]
        address_to_index = {
            instruction[0]: index
            for index, instruction in enumerate(instructions)
        }
        for candidate in candidates:
            callers = direct_callers(map_entry, candidate["id"])
            if len(callers) != 1:
                gaps.append(
                    {
                        "disc": map_entry["disc"],
                        "area": map_entry["area"],
                        "setupFunction": candidate["id"],
                        "reason": "setup-function-caller-count",
                        "callerCount": len(callers),
                    }
                )
                continue
            caller = callers[0]
            call_offset = int(caller["callFileOffset"], 16)
            call_index = address_to_index.get(call_offset)
            if call_index is None:
                gaps.append(
                    {
                        "disc": map_entry["disc"],
                        "area": map_entry["area"],
                        "setupFunction": candidate["id"],
                        "reason": "call-instruction-not-found",
                    }
                )
                continue
            arguments = pushed_arguments(
                instructions,
                call_index,
                int(caller["function"], 16),
            )
            if arguments is None or len(arguments) < 7:
                gaps.append(
                    {
                        "disc": map_entry["disc"],
                        "area": map_entry["area"],
                        "setupFunction": candidate["id"],
                        "reason": "setup-arguments-unresolved",
                        "arguments": arguments,
                    }
                )
                continue
            owner_tag = (
                decode_tag(arguments[0]["value"])
                if arguments[0]["kind"] == "constant"
                else None
            )
            static_inputs = [
                serialize_static_input(
                    data,
                    static_base,
                    argument,
                    probe_strided_words=index == 0,
                )
                for index, argument in enumerate(
                    arguments[1 : 1 + TABLE_COUNT]
                )
            ]
            registrations.append(
                {
                    "disc": map_entry["disc"],
                    "area": map_entry["area"],
                    "source": portable_project_path(source),
                    "mapinfoSha256": source_entry["mapinfoSha256"],
                    "scn3FileOffset": hx(scn3),
                    "staticDataFileOffset": hx(static_base),
                    "setupFunction": candidate["id"],
                    "callerFunction": caller["function"],
                    "callFileOffset": caller["callFileOffset"],
                    "ownerTag": owner_tag,
                    "ownerTagValue": arguments[0],
                    "internalSlotCount": INTERNAL_SLOT_COUNT,
                    "controlArgument5": arguments[5],
                    "controlArgument6": arguments[6],
                    "arguments": arguments,
                    "sceneBindings": scene_bindings(
                        instructions,
                        int(candidate["id"], 16),
                        int(candidate["endFileOffsetExclusive"], 16),
                    ),
                    "staticInputs": static_inputs,
                }
            )
    exact = [
        entry
        for entry in registrations
        if all(
            static_input["status"] == "exact"
            for static_input in entry["staticInputs"]
        )
    ]
    return {
        "schema": 1,
        "evidenceBoundary": (
            "The setup routine and its exact caller arguments are selected "
            "structurally from generated SH-4. The four static inputs are "
            "preserved at exact SCN3-relative addresses. Only the first "
            "input's ten operation-0x009a reads have a proven 13-word stride; "
            "the previews for the other inputs are not asserted as records. "
            "Higher-level field meanings remain unresolved, and no actor or "
            "gameplay meaning is inferred from numeric values."
        ),
        "summary": {
            "mapinfoCount": len(native_ir["maps"]),
            "candidateSetupFunctionCount": candidate_count,
            "registrationCount": len(registrations),
            "exactRegistrationCount": len(exact),
            "gapCount": len(gaps),
            "internalSlotCount": INTERNAL_SLOT_COUNT,
            "internalSlotCapacity": (
                len(exact) * INTERNAL_SLOT_COUNT
            ),
            "controlArgument5Counts": dict(
                sorted(
                    Counter(
                        entry["controlArgument5"].get(
                            "value",
                            "<unresolved>",
                        )
                        for entry in exact
                    ).items(),
                    key=lambda item: str(item[0]),
                )
            ),
            "ownerTagCounts": dict(
                sorted(
                    Counter(
                        entry["ownerTag"] or "<unresolved>"
                        for entry in exact
                    ).items()
                )
            ),
        },
        "registrations": registrations,
        "gaps": gaps,
    }


def summary_report(
    report: dict[str, Any],
    full_report: Path,
) -> dict[str, Any]:
    anchors = []
    for registration in report["registrations"]:
        if registration["disc"] == 1 and registration["area"] == "D000":
            anchors.append(registration)
    return {
        "schema": report["schema"],
        "evidenceBoundary": report["evidenceBoundary"],
        "summary": report["summary"],
        "verifiedAnchors": anchors,
        "coverage": [
            {
                "disc": entry["disc"],
                "area": entry["area"],
                "ownerTag": entry["ownerTag"],
                "internalSlotCount": entry["internalSlotCount"],
                "controlArgument5": entry["controlArgument5"],
                "setupFunction": entry["setupFunction"],
                "callFileOffset": entry["callFileOffset"],
                "staticInputFileOffsets": [
                    static_input.get("fileOffset")
                    for static_input in entry["staticInputs"]
                ],
                "staticInputStatuses": [
                    static_input["status"]
                    for static_input in entry["staticInputs"]
                ],
            }
            for entry in report["registrations"]
        ],
        "gaps": report["gaps"],
        "fullReport": str(full_report.relative_to(PROJECT_ROOT)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-ir", type=Path, default=DEFAULT_IR)
    parser.add_argument("--scripted-index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--summary", type=Path, default=DEFAULT_SUMMARY)
    parser.add_argument("--objdump", default="sh4-linux-gnu-objdump")
    args = parser.parse_args()
    report = build_report(
        json.loads(args.native_ir.read_text()),
        json.loads(args.scripted_index.read_text()),
        args.objdump,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    args.summary.write_text(
        json.dumps(summary_report(report, args.output), indent=2) + "\n"
    )
    print(
        f"Wrote {args.output}: "
        f"{report['summary']['exactRegistrationCount']} exact registrations, "
        f"{report['summary']['gapCount']} gaps"
    )


if __name__ == "__main__":
    main()
