#!/usr/bin/env python3
"""Verify SCN3 operation 0x0163's native procedural-model controller."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from collections import Counter
from pathlib import Path
from typing import Any

from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.scripting.native_event_dataflow import operation_result_target


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OP00_MAPINFO = (
    ROOT / ".disc-work/mapinfo/disc1/SCENE/01/OP00/MAPINFO.BIN"
)
DEFAULT_OUTPUT = (
    ROOT / "tools/evidence/procedural-model-controller-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
OP00_MAPINFO_SHA256 = (
    "8c2e8957ba3c96eb0a1315249db1abe1cb5931ea1bd63ee9601f30d1c8f257e4"
)
HANDLER_ADDRESS = 0x0C160368
HANDLER_TABLE_ENTRY = 0x0C29AF6C
RANGES = {
    "handler": (HANDLER_ADDRESS, 1330,
                "4408eb85a6d369adecc6a6b5904fafd07cf56b22d864304aebca0d6697f11a08"),
    "create": (0x0C189E98, 788,
               "986699502ecc883dbc395b108dbf5c64c91af965537062902e0473ddf7af6815"),
    "setFlagBit2": (0x0C188950, 14,
               "b1e7e064ce7592b33c7125703e755a715638f3ed9c960bfd7ed6c6767cca4246"),
    "clearFlagBit2": (0x0C18895E, 16,
                "20d2dd0bb4dc21d518d458580885438d5be26078103a346174b1dbc16b08b631"),
    "release": (0x0C18896E, 210,
                "cdd31d8dcbfd1aac139502a7609e482481962ba78b328892a2476bdaf9b2b395"),
    "fieldsAcToC0": (0x0C188C2C, 34,
                    "5446eb5b828382df96bbde54c839dea93e2966685a8d5a81396bd7035fa54d6e"),
    "fieldsA0ToA8": (0x0C188CA0, 28,
                    "48af4c05eb45c84b9b488efdaaa08e7e1d76c1db5def55e0c516a64bc15f362e"),
    "fields20To24": (0x0C188B02, 58,
                    "a17a59f69d9b57a8a496036365ac37d25c697edc376b2e0b9c26462b3bbf6a05"),
    "fields28To2c": (0x0C188B3C, 94,
                    "89e2c8daa8cc0ac267c33bb489520a13c740c2deadd1edf8f43998b43243c89e"),
    "fields38To3c": (0x0C188BEE, 12,
                    "1113e1f4065b006ae7bde3c98e3916776d3bfa8dfe11a4d0f12bd61317ba1546"),
    "gridResource": (0x0C188CBC, 56,
                     "2829ec070fe3df2a0c7843e9f944dfdbc88c05167d96f4dc9156cb768a79e47d"),
    "surfaceHeight": (0x0C188D3C, 238,
                      "e74076a7362cd79d5faecf3cd70775cdea94d98f9074773f57036253249d7665"),
    "modelCommand": (0x0C188C4E, 82,
                     "b93aa1e20019cbb7a389dedeae73cb0fb97dd0271d2a0c543f643faae1f11a5c"),
    "packedColor": (0x0C189260, 46,
                    "b0dffc90c28e2e7c8a5c15fde4a07c7789a360bfd644f956e241a3239b830608"),
}
EXPECTED_MODE_COUNTS = {
    0: 16, 1: 21, 2: 19, 3: 9, 5: 10, 9: 1,
    10: 46, 11: 25, 12: 11, 13: 18, 14: 9, 15: 8,
    16: 16, 17: 5, 18: 24, 21: 16, 22: 22, 23: 1, 24: 14,
    200: 1, 203: 1, 210: 1, 300: 1, 310: 1, 311: 1,
    312: 1, 400: 2, 401: 2, 403: 2, 500: 1,
}
OP00_MODE_COUNTS = {
    0: 1, 1: 1, 2: 2, 3: 1, 10: 1, 11: 1, 13: 1,
    14: 1, 16: 1, 17: 1, 18: 21, 21: 1, 24: 1,
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, length: int) -> bytes:
    offset = address - RUNTIME_BASE
    if offset < 0 or offset + length > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{length} unavailable")
    return data[offset:offset + length]


def calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    for native_map in event_ir["maps"]:
        for function in native_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") == "engineOperation"
                        and action.get("operationId") == 0x0163
                    ):
                        result.append({
                            "disc": native_map["disc"],
                            "area": native_map["area"],
                            "dialogue": function.get("dialogueRegion") is not None,
                            "action": action,
                        })
    return result


def constant_mode(call: dict[str, Any]) -> int | None:
    arguments = call["action"].get("arguments", [])
    if not arguments or arguments[0].get("kind") != "constant":
        return None
    return arguments[0].get("value")


def c_string(data: bytes, pointer: int) -> str:
    end = data.find(b"\0", pointer)
    if pointer < 0 or end < pointer:
        raise ValueError(f"static string at 0x{pointer:x} is unavailable")
    return data[pointer:end].decode("ascii")


def verified_range_report(executable: bytes) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    table_handler = struct.unpack(
        "<I", runtime_slice(executable, HANDLER_TABLE_ENTRY, 4),
    )[0]
    if table_handler != HANDLER_ADDRESS:
        raise ValueError("operation-0x0163 handler table entry changed")
    result = {}
    for name, (address, length, expected) in RANGES.items():
        if digest(runtime_slice(executable, address, length)) != expected:
            raise ValueError(f"operation-0x0163 {name} range changed")
        result[name] = {
            "address": f"0x{address:08x}",
            "length": length,
            "sha256": expected,
        }
    return result


def op00_report(
    op00_calls: list[dict[str, Any]],
    mapinfo: bytes,
    objdump: str,
    mapinfo_path: Path = DEFAULT_OP00_MAPINFO,
) -> dict[str, Any]:
    if digest(mapinfo) != OP00_MAPINFO_SHA256:
        raise ValueError("unexpected OP00 MAPINFO.BIN")
    modes = Counter(constant_mode(call) for call in op00_calls)
    if dict(sorted(modes.items())) != OP00_MODE_COUNTS:
        raise ValueError("OP00 operation-0x0163 mode inventory changed")
    create = next(call["action"] for call in op00_calls
                  if constant_mode(call) == 0)
    pointers = [argument["value"] for argument in create["arguments"][1:6]]
    origin = list(struct.unpack_from("<3I", mapinfo, pointers[0]))
    resources = [c_string(mapinfo, pointer) for pointer in pointers[1:]]
    if origin != [0x4114CCCD, 0xBDA3D70A, 0x41300000]:
        raise ValueError("OP00 procedural-model origin changed")
    if resources != [
        "model/object", "trlake1.pvr", "model/object", "trsea025.mt6",
    ]:
        raise ValueError("OP00 procedural-model resources changed")
    install_grid = next(
        call["action"] for call in op00_calls if constant_mode(call) == 17
    )
    grid_resource = {
        "path": c_string(mapinfo, install_grid["arguments"][2]["value"]),
        "name": c_string(mapinfo, install_grid["arguments"][3]["value"]),
    }
    if grid_resource != {"path": "model/object", "name": "grid025.bin"}:
        raise ValueError("OP00 procedural-model grid resource changed")

    rows = {
        row[0]: row
        for row in disassemble(mapinfo_path, objdump)
    }
    height_calls = [
        call["action"] for call in op00_calls if constant_mode(call) == 18
    ]
    targets = [
        operation_result_target(rows, int(call["callFileOffset"], 16))
        for call in height_calls
    ]
    if (
        len(targets) != 21
        or any(target is None for target in targets)
        or {target["kind"] for target in targets} != {"frameField"}
        or {target["offset"] for target in targets} != {20}
        or {target["width"] for target in targets} != {4}
    ):
        raise ValueError("OP00 surface-height result targets changed")
    return {
        "authoredCallCount": len(op00_calls),
        "modeCounts": {str(mode): count for mode, count in sorted(modes.items())},
        "create": {
            "originWords": origin,
            "resourcePath": resources[0],
            "texture": resources[1],
            "modelPath": resources[2],
            "model": resources[3],
            "scaleWord": create["arguments"][6]["value"],
            "flagsWord": create["arguments"][7]["value"],
        },
        "gridResource": grid_resource,
        "surfaceHeightQueryCount": len(targets),
        "surfaceHeightResultTargets": targets,
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
    op00_mapinfo: bytes,
    objdump: str = "sh4-linux-gnu-objdump",
    op00_mapinfo_path: Path = DEFAULT_OP00_MAPINFO,
) -> dict[str, Any]:
    verified_ranges = verified_range_report(executable)
    authored = calls(event_ir)
    modes = Counter(constant_mode(call) for call in authored)
    if (
        len(authored) != 305
        or None in modes
        or dict(sorted(modes.items())) != EXPECTED_MODE_COUNTS
        or len({(call["disc"], call["area"]) for call in authored}) != 12
        or any(call["dialogue"] for call in authored)
    ):
        raise ValueError("operation-0x0163 authored inventory changed")
    op00_calls = [
        call for call in authored
        if call["disc"] == 1 and call["area"] == "OP00"
    ]
    return {
        "schema": "new-yokosuka-procedural-model-controller-evidence-v1",
        "status": "exact-native-dispatch-and-op00-surface-contract",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
            "op00Mapinfo": "disc1/SCENE/01/OP00/MAPINFO.BIN",
            "op00MapinfoSha256": OP00_MAPINFO_SHA256,
        },
        "operation": {
            "operationId": 0x0163,
            "operationHex": "0x0163",
            "handlerTableEntry": f"0x{HANDLER_TABLE_ENTRY:08x}",
            "handlerAddress": f"0x{HANDLER_ADDRESS:08x}",
            "verifiedRanges": verified_ranges,
            "slotCount": 2,
            "recordSizeBytes": 0xCC,
            "op00Routes": [
                {"mode": 0, "behavior": "Allocate one of two records, load the authored texture/model resources, copy the three-word origin to +0x88, OR flags with 0x0000000a, and return the slot index."},
                {"mode": 1, "behavior": "Set record flag bit 0x00000002 at +0x08."},
                {"mode": 2, "behavior": "Clear record flag bit 0x00000002 at +0x08."},
                {"mode": 3, "behavior": "Release the record-owned resources and clear its slot."},
                {"mode": 10, "behavior": "Write arguments two through seven to record dwords +0xac through +0xc0."},
                {"mode": 11, "behavior": "Write arguments two through four to +0xa0 through +0xa8 and OR flag 0x04000000 at +0x08."},
                {"mode": 13, "behavior": "Write the native float pair through the +0x20/+0x24 parameter path and refresh the model transform."},
                {"mode": 14, "behavior": "Write the native float pair to +0x28/+0x2c and refresh the model transform when no grid resource owns it."},
                {"mode": 16, "behavior": "Write arguments two and three unchanged to +0x38/+0x3c."},
                {"mode": 17, "behavior": "Replace the record's +0x7c grid resource from the authored path and filename."},
                {"mode": 18, "behavior": "Query the grid/model surface at the supplied three-float point, truncate the returned float toward zero, and publish that signed integer as the operation result."},
                {"mode": 21, "behavior": "Forward arguments two and three to the active model command helper."},
                {"mode": 24, "behavior": "Pack arguments two through five as four low-byte channels into record dword +0x60."},
            ],
        },
        "allDiscInventory": {
            "authoredCallCount": len(authored),
            "mapCount": 12,
            "dialogueRegionCallCount": 0,
            "modeCounts": {str(mode): count for mode, count in sorted(modes.items())},
        },
        "op00": op00_report(
            op00_calls,
            op00_mapinfo,
            objdump,
            op00_mapinfo_path,
        ),
        "evidenceBoundary": [
            "The operation is a generic two-slot procedural model/grid controller used by twelve maps; the semantic is not OP00-specific.",
            "OP00's texture, model, grid, origin, parameter writes, lifecycle, and all 21 surface-height result stores are disc- and executable-proven.",
            "The browser presentation must implement resource loading and the surface query through one typed controller adapter; substituting a guessed plane height is not equivalent.",
            "Modes present elsewhere in the corpus remain inventoried but are not assigned OP00 behavior by this artifact.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--op00-mapinfo", type=Path, default=DEFAULT_OP00_MAPINFO)
    parser.add_argument("--objdump", default=shutil.which("sh4-linux-gnu-objdump"))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text(encoding="utf-8")),
        args.op00_mapinfo.read_bytes(),
        args.objdump,
        args.op00_mapinfo,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.out}: {report['allDiscInventory']['authoredCallCount']} "
        f"calls, {report['op00']['surfaceHeightQueryCount']} OP00 queries"
    )


if __name__ == "__main__":
    main()
