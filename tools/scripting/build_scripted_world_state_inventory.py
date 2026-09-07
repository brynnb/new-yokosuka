#!/usr/bin/env python3
"""Build a compact, evidence-bounded inventory of scripted world operations.

This intentionally does not assign gameplay names such as "open", "closed",
or "attached" to native operations whose low-level behavior is known but
whose higher-level use is not yet proven.  It preserves enough source detail
to drive the subsequent control-flow and object-placement joins without
committing the very large all-operation reports for every MAPINFO.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


DEFAULT_ROOTS = [
    Path("extracted_files/data/SCENE/01"),
    Path("extracted_disc2_v2/data/SCENE/02"),
    Path("extracted_disc3_v2/data/SCENE/03"),
]

SELECTED_OPERATIONS = {
    0x001F: "object-bit-state",
    0x002A: "scheduled-scene-object-state",
    0x002D: "scheduled-object-registration",
    0x002E: "scheduled-object-transition",
    0x0030: "map-transition",
    0x0051: "persistent-state-dispatch",
    0x0098: "numbered-map-layer-state",
    0x00A8: "associated-object-scheduler-state",
}

FLAG_SUBCOMMANDS = {
    11: {"action": "read", "namespace": 2, "storage": "dynamic bitset"},
    12: {"action": "write", "namespace": 2, "storage": "dynamic bitset"},
    13: {"action": "read", "namespace": 3, "storage": "64-bit bank"},
    14: {"action": "write", "namespace": 3, "storage": "64-bit bank"},
    15: {"action": "read", "namespace": 4, "storage": "32 byte values"},
    16: {"action": "write", "namespace": 4, "storage": "32 byte values"},
}


def mapinfos(roots: Iterable[Path]) -> Iterable[tuple[int, str, Path]]:
    for root in roots:
        try:
            scene = int(root.name)
        except ValueError:
            continue
        for path in sorted(root.glob("*/MAPINFO.BIN")):
            yield scene, path.parent.name, path


def scn3_ranges(data: bytes) -> tuple[int, int, int, int]:
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x30 > len(data):
        raise ValueError("input does not contain a complete SCN3 token")
    token_size = struct.unpack_from("<I", data, scn3_offset + 4)[0]
    code_end_relative = struct.unpack_from("<I", data, scn3_offset + 0x0C)[0]
    static_data_relative = struct.unpack_from(
        "<I", data, scn3_offset + 0x10
    )[0]
    token_end = scn3_offset + token_size
    code_start = scn3_offset + 0x30
    code_end = scn3_offset + code_end_relative
    static_data_base = scn3_offset + static_data_relative
    if not (
        code_start <= code_end <= static_data_base <= token_end <= len(data)
    ):
        raise ValueError("SCN3 code/static/token ranges are inconsistent")
    return scn3_offset, code_start, code_end, static_data_base


def argument_value(argument: dict[str, Any]) -> int | None:
    if argument.get("kind") != "constant":
        return None
    value = argument.get("value")
    return value if isinstance(value, int) else None


def compact_argument(argument: dict[str, Any]) -> dict[str, Any]:
    result = {"kind": argument["kind"], "source": argument.get("source")}
    for key in ("value", "hex", "ascii"):
        if key in argument:
            result[key] = argument[key]
    return result


def argument_signature(argument: dict[str, Any]) -> str:
    if argument.get("kind") != "constant":
        return "runtime"
    if "ascii" in argument:
        return f"ascii:{argument['ascii']}"
    return f"u32:{argument.get('value')}"


def classify_call(call: dict[str, Any]) -> dict[str, Any]:
    operation = call["operationId"]
    result: dict[str, Any] = {
        "fileOffset": call["callFileOffset"],
        "operation": call["operationHex"],
        "operationClass": SELECTED_OPERATIONS[operation],
        "arguments": [compact_argument(item) for item in call["arguments"]],
    }
    if operation == 0x0051:
        subcommand = (
            argument_value(call["arguments"][0]) if call["arguments"] else None
        )
        result["subcommand"] = subcommand
        if subcommand in FLAG_SUBCOMMANDS:
            result["persistentFlagOperation"] = FLAG_SUBCOMMANDS[subcommand]
            result["flagOrIndex"] = (
                argument_value(call["arguments"][1])
                if len(call["arguments"]) > 1
                else None
            )
            if FLAG_SUBCOMMANDS[subcommand]["action"] == "write":
                result["writtenValue"] = (
                    argument_value(call["arguments"][2])
                    if len(call["arguments"]) > 2
                    else None
                )
        else:
            result["persistentFlagOperation"] = None
    elif operation in (0x001F, 0x00A8):
        first = call["arguments"][0] if call["arguments"] else {}
        result["constantObjectTag"] = first.get("ascii")
        result["mode"] = (
            argument_value(call["arguments"][1])
            if len(call["arguments"]) > 1
            else None
        )
    elif operation == 0x0098:
        # Native handler 0x0c1649de reads operand[0] as the numbered slot
        # and operand[1] as its integer value, then calls 0x0c130824.  The
        # SCN3 ABI pushes source operands in reverse order, so a source
        # sequence `mov #0,r4; mov #20,r5; push r4; push r5` is decoded by
        # extract_dispatch_calls as [20, 0]: MAP20 disabled, not slot 0 set
        # to 20.
        result["mapLayerNumber"] = (
            argument_value(call["arguments"][0])
            if call["arguments"]
            else None
        )
        result["stateValue"] = (
            argument_value(call["arguments"][1])
            if len(call["arguments"]) > 1
            else None
        )
    return result


def extract_map(
    scene: int, area: str, path: Path, objdump: str
) -> dict[str, Any]:
    data = path.read_bytes()
    scn3_offset, code_start, code_end, static_data_base = scn3_ranges(data)
    # The first SCN3 code boundary excludes callback functions.  Store,
    # object-state, and transition callbacks continue until static data.
    executable_code_end = static_data_base
    instructions = [
        instruction
        for instruction in disassemble(path, objdump)
        if code_start <= instruction[0] < executable_code_end
    ]
    all_calls = extract_dispatch_calls(instructions, static_data_base)
    calls = [
        classify_call(call)
        for call in all_calls
        if call["operationId"] in SELECTED_OPERATIONS
    ]
    counts = Counter(item["operation"] for item in calls)
    groups: dict[tuple[Any, ...], list[str]] = defaultdict(list)
    omitted_counts = Counter()
    for call in calls:
        operation = call["operation"]
        key: tuple[Any, ...] | None = None
        if call.get("persistentFlagOperation"):
            flag = call["persistentFlagOperation"]
            key = (
                "persistent-flag",
                operation,
                call["subcommand"],
                flag["action"],
                flag["namespace"],
                call.get("flagOrIndex"),
                call.get("writtenValue"),
            )
        elif operation in ("0x001f", "0x00a8") and call.get(
            "constantObjectTag"
        ):
            key = (
                "object-state",
                operation,
                call["constantObjectTag"],
                call.get("mode"),
            )
        elif operation == "0x0030":
            key = (
                "map-transition-dispatch",
                operation,
                *(argument_signature(item) for item in call["arguments"]),
            )
        elif operation == "0x0098":
            key = (
                "numbered-map-layer-state",
                operation,
                call.get("mapLayerNumber"),
                call.get("stateValue"),
            )
        if key is None:
            omitted_counts[operation] += 1
        else:
            groups[key].append(call["fileOffset"])

    operation_groups = []
    for key, offsets in sorted(groups.items(), key=lambda item: repr(item[0])):
        kind = key[0]
        if kind == "persistent-flag":
            (
                _,
                operation,
                subcommand,
                action,
                namespace,
                flag_or_index,
                written_value,
            ) = key
            group = {
                "kind": kind,
                "operation": operation,
                "subcommand": subcommand,
                "action": action,
                "namespace": namespace,
                "flagOrIndex": flag_or_index,
                "callFileOffsets": offsets,
            }
            if action == "write":
                group["writtenValue"] = written_value
        elif kind == "object-state":
            _, operation, tag, mode = key
            group = {
                "kind": kind,
                "operation": operation,
                "constantObjectTag": tag,
                "mode": mode,
                "callFileOffsets": offsets,
            }
        elif kind == "numbered-map-layer-state":
            _, operation, layer_number, state_value = key
            group = {
                "kind": kind,
                "operation": operation,
                "mapLayerNumber": layer_number,
                "stateValue": state_value,
                "callFileOffsets": offsets,
            }
        else:
            _, operation, *arguments = key
            group = {
                "kind": kind,
                "operation": operation,
                "argumentSignature": arguments,
                "callFileOffsets": offsets,
            }
        operation_groups.append(group)
    return {
        "scene": scene,
        "area": area,
        "source": str(path),
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "scn3FileOffset": f"0x{scn3_offset:x}",
        "primaryCodeEndFileOffset": f"0x{code_end:x}",
        "executableCodeFileRange": [
            f"0x{code_start:x}",
            f"0x{executable_code_end:x}",
        ],
        "allDispatchCallCount": len(all_calls),
        "selectedCallCount": len(calls),
        "selectedOperationCounts": dict(sorted(counts.items())),
        "operationGroups": operation_groups,
        "omittedRuntimeOrUnclassifiedCounts": dict(
            sorted(omitted_counts.items())
        ),
    }


def build_report(roots: list[Path], objdump: str) -> dict[str, Any]:
    maps = [
        extract_map(scene, area, path, objdump)
        for scene, area, path in mapinfos(roots)
    ]
    operation_counts = Counter(
        operation
        for item in maps
        for operation, count in item["selectedOperationCounts"].items()
        for _ in range(count)
    )
    exact_flag_counts = Counter(
        (group["action"], group["namespace"])
        for item in maps
        for group in item["operationGroups"]
        if group["kind"] == "persistent-flag"
        for _ in group["callFileOffsets"]
    )
    return {
        "schema": "new-yokosuka-scripted-world-state-inventory-v2",
        "summary": {
            "mapCount": len(maps),
            "allDispatchCallCount": sum(
                item["allDispatchCallCount"] for item in maps
            ),
            "selectedCallCount": sum(item["selectedCallCount"] for item in maps),
            "selectedOperationCounts": dict(sorted(operation_counts.items())),
            "exactPersistentFlagOperationCounts": {
                f"{action}-namespace-{namespace}": count
                for (action, namespace), count in sorted(exact_flag_counts.items())
            },
        },
        "nativeSemantics": {
            "0x001f": {
                "field": "resolved object +0x88, mask 0x04",
                "modes": {"0": "read mask", "1": "set mask", "2": "clear mask"},
            },
            "0x00a8": {
                "field": "associated object +0x5c, mask 0x04",
                "modes": {
                    "0": "clear mask and install one scheduler state",
                    "1": "set mask and restore prior scheduler state",
                },
            },
            "0x0051": {
                "provenSubcommands": {
                    str(key): value for key, value in FLAG_SUBCOMMANDS.items()
                }
            },
            "0x0098": {
                "handlerAddress": "0x0c1649de",
                "getterAddress": "0x0c13080e",
                "setterAddress": "0x0c130824",
                "recordBaseAddress": "0x0c21c768",
                "recordCount": 32,
                "recordStride": 96,
                "field": "numbered map-layer state at record +0x00",
                "arguments": ["map layer number", "integer state value"],
            },
        },
        "maps": maps,
        "evidenceBoundary": (
            "Operation addresses, arguments, persistent-state namespaces, and "
            "the two proven low-level object bit routes are exact. Calls with "
            "runtime arguments remain runtime-valued. No open/closed, visible/"
            "hidden, attachment, or other gameplay label is assigned until "
            "the native control flow and target object join prove it. Operation "
            "0x0098's numbered MAP-layer target is proven by the native "
            "32-record resource system; the meaning of each non-Boolean value "
            "still remains evidence-bounded."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("roots", nargs="*", type=Path, default=DEFAULT_ROOTS)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tools/evidence/scripted-world-state-inventory.json"),
    )
    parser.add_argument(
        "--objdump", default=shutil.which("sh4-linux-gnu-objdump")
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(args.roots, args.objdump)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {args.out}: {summary['selectedCallCount']} selected calls "
        f"from {summary['mapCount']} maps"
    )


if __name__ == "__main__":
    main()
