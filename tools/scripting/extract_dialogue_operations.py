#!/usr/bin/env python3
"""Extract native SCN3 dialogue-start operations from MAPINFO room programs.

Operation 0x006d is the engine's spoken-dialogue start operation. Its first
argument is an exact static pointer to a voice member ID. A following 0x00b2
operation with argument zero queries the global dialogue channels and is the
native wait boundary. Both semantics are grounded in 1ST_READ.BIN handlers;
this extractor does not infer interactions or actors.
"""

from __future__ import annotations

import argparse
import json
import shutil
import struct
from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, Sequence

from tools.scripting.extract_dialogue_script_references import (
    DEFAULT_INVENTORY,
    build_voice_index,
    iter_mapinfo,
    parse_disc_root,
)
from tools.worlds.extract_jomo_object_operations import extract_dispatch_calls
from tools.scripting.extract_sh4_object_transforms import disassemble


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work" / "dialogue" / "operations.json"
)
DIALOGUE_START_OPERATION = 0x006D
DIALOGUE_ACTIVE_OPERATION = 0x00B2


@dataclass(frozen=True)
class ExecutableTargetEntry:
    index: int
    table_entry_offset: int
    target_offset: int
    relative_to_scn3: int


def discover_executable_target_table(
    data: bytes,
    *,
    scn3_offset: int,
    code_start: int,
    static_base: int,
    token_end: int,
    minimum_entries: int = 3,
) -> list[ExecutableTargetEntry]:
    """Find the longest contiguous table of SCN3-relative code pointers."""
    best_start = -1
    best_values: list[int] = []
    run_start = -1
    run_values: list[int] = []
    for offset in range(static_base, token_end - 3, 4):
        relative = struct.unpack_from("<I", data, offset)[0]
        target = scn3_offset + relative
        is_code_pointer = code_start <= target < static_base and target % 2 == 0
        if is_code_pointer:
            if run_start < 0:
                run_start = offset
            run_values.append(relative)
            continue
        if len(run_values) > len(best_values):
            best_start, best_values = run_start, run_values
        run_start, run_values = -1, []
    if len(run_values) > len(best_values):
        best_start, best_values = run_start, run_values
    if len(best_values) < minimum_entries:
        return []
    return [
        ExecutableTargetEntry(
            index=index,
            table_entry_offset=best_start + index * 4,
            target_offset=scn3_offset + relative,
            relative_to_scn3=relative,
        )
        for index, relative in enumerate(best_values)
    ]


def executable_target_for_call(
    targets: Sequence[ExecutableTargetEntry],
    call_offset: int,
) -> ExecutableTargetEntry | None:
    """Return the nearest SCN3 executable target at or before a call."""
    if not targets:
        return None
    by_target = sorted(targets, key=lambda entry: entry.target_offset)
    targets = [entry.target_offset for entry in by_target]
    index = bisect_right(targets, call_offset) - 1
    return by_target[index] if index >= 0 else None


def mapinfo_dispatch_calls(
    path: Path,
    objdump: str,
) -> tuple[
    bytes,
    int,
    list[dict[str, object]],
    list[ExecutableTargetEntry],
]:
    data = path.read_bytes()
    scn3_offset = data.find(b"SCN3")
    if scn3_offset < 0 or scn3_offset + 0x30 > len(data):
        return data, -1, [], []
    token_size = struct.unpack_from("<I", data, scn3_offset + 4)[0]
    code_end_relative = struct.unpack_from("<I", data, scn3_offset + 0x0C)[0]
    static_relative = struct.unpack_from("<I", data, scn3_offset + 0x10)[0]
    code_start = scn3_offset + 0x30
    code_end = scn3_offset + code_end_relative
    static_base = scn3_offset + static_relative
    token_end = scn3_offset + token_size
    if not code_start <= code_end <= static_base <= token_end <= len(data):
        return data, -1, [], []
    instructions = [
        instruction
        for instruction in disassemble(path, objdump)
        if code_start <= instruction[0] < static_base
    ]
    targets = discover_executable_target_table(
        data,
        scn3_offset=scn3_offset,
        code_start=code_start,
        static_base=static_base,
        token_end=token_end,
    )
    return (
        data,
        static_base,
        extract_dispatch_calls(instructions, static_base),
        targets,
    )


def read_ascii_c_string(data: bytes, offset: int, limit: int = 64) -> str | None:
    if offset < 0 or offset >= len(data):
        return None
    end = data.find(b"\0", offset, min(len(data), offset + limit))
    if end < 0:
        return None
    try:
        return data[offset:end].decode("ascii")
    except UnicodeDecodeError:
        return None


def extract_invocations(
    data: bytes,
    calls: list[dict[str, object]],
    voice_index: dict[str, list[dict[str, object]]],
    *,
    disc: int,
    area: str,
    source: str,
    include_text: bool,
    executable_targets: Sequence[ExecutableTargetEntry] = (),
) -> list[dict[str, object]]:
    invocations = []
    for index, call in enumerate(calls):
        if call["operationId"] != DIALOGUE_START_OPERATION:
            continue
        arguments = call["arguments"]
        if not arguments or arguments[0]["kind"] != "static-pointer":
            continue
        string_offset = arguments[0]["value"]
        identifier = read_ascii_c_string(data, string_offset)
        if not identifier:
            continue
        identifier = identifier.upper()
        candidates = voice_index.get(identifier)
        if not candidates:
            continue
        same_disc = [
            candidate for candidate in candidates if candidate["disc"] == disc
        ]
        linked = same_disc or candidates
        if not include_text:
            linked = [
                {
                    key: value
                    for key, value in candidate.items()
                    if key not in {"sourceText", "displayText"}
                }
                for candidate in linked
            ]
        next_call = calls[index + 1] if index + 1 < len(calls) else None
        followed_by_active_check = bool(
            next_call
            and next_call["operationId"] == DIALOGUE_ACTIVE_OPERATION
            and next_call["arguments"]
            and next_call["arguments"][0].get("value") == 0
        )
        executable_target = executable_target_for_call(
            executable_targets,
            int(call["callFileOffset"], 16),
        )
        invocations.append(
            {
                "disc": disc,
                "area": area,
                "mapinfo": source,
                "callFileOffset": call["callFileOffset"],
                "voiceIdFileOffset": string_offset,
                "voiceIdFileOffsetHex": f"0x{string_offset:x}",
                "voiceId": identifier,
                "dialogueRecords": linked,
                "usedSameDiscRecords": bool(same_disc),
                "followedByGlobalDialogueActiveCheck": (
                    followed_by_active_check
                ),
                "activeCheckCallFileOffset": (
                    next_call["callFileOffset"]
                    if followed_by_active_check
                    else None
                ),
                "nearestPrecedingExecutableTarget": (
                    {
                        "index": executable_target.index,
                        "entryFileOffset": (
                            f"0x{executable_target.table_entry_offset:x}"
                        ),
                        "targetFileOffset": (
                            f"0x{executable_target.target_offset:x}"
                        ),
                        "targetRelativeToScn3": (
                            f"0x{executable_target.relative_to_scn3:x}"
                        ),
                    }
                    if executable_target
                    else None
                ),
            }
        )
    return invocations


def build_report(
    inventory: dict[str, object],
    roots: Sequence[tuple[int, Path]],
    *,
    objdump: str,
    include_text: bool,
) -> dict[str, object]:
    voice_index = build_voice_index(inventory)
    invocations = []
    skipped = []
    executable_target_table_sizes = []
    for disc, root in roots:
        if not root.is_dir():
            skipped.append(
                {"disc": disc, "path": str(root), "reason": "missing root"}
            )
            continue
        for area, path in iter_mapinfo(root):
            data, static_base, calls, executable_targets = (
                mapinfo_dispatch_calls(
                    path,
                    objdump,
                )
            )
            if static_base < 0:
                skipped.append(
                    {
                        "disc": disc,
                        "area": area,
                        "path": str(path),
                        "reason": "no valid SCN3 executable/static ranges",
                    }
                )
                continue
            executable_target_table_sizes.append(len(executable_targets))
            invocations.extend(
                extract_invocations(
                    data,
                    calls,
                    voice_index,
                    disc=disc,
                    area=area,
                    source=str(path),
                    include_text=include_text,
                    executable_targets=executable_targets,
                )
            )
    invocations.sort(
        key=lambda item: (
            item["disc"],
            item["area"],
            item["mapinfo"],
            int(item["callFileOffset"], 16),
        )
    )
    area_counts = Counter(
        (item["disc"], item["area"]) for item in invocations
    )
    waits = sum(
        item["followedByGlobalDialogueActiveCheck"] for item in invocations
    )
    return {
        "schema": "new-yokosuka-dialogue-operations-v1",
        "evidenceBoundary": [
            "Each invocation is an exact operation-0x006d dispatch whose first argument resolves to a native inventory voice ID.",
            "1ST_READ.BIN handler 0x0c16b27e delegates to 0x0c0b41f0/0x0c0b4248, which resolves the supplied name in loaded dialogue archives and starts one of two dialogue channels.",
            "A global active check is recorded only when operation 0x00b2 with argument zero is the immediately following dispatch call.",
            "This proves dialogue resource selection and wait boundaries, not the actor, interaction volume, branch condition, facing, camera, or animation.",
            "nearestPrecedingExecutableTarget identifies the closest target in the discovered SCN3 executable-pointer table at or before the call.",
            "The executable-pointer table is structural navigation evidence only. It is not claimed to be an interaction callback registry or a complete function table.",
        ],
        "includeText": include_text,
        "skipped": skipped,
        "summary": {
            "invocationCount": len(invocations),
            "uniqueVoiceIdCount": len(
                {item["voiceId"] for item in invocations}
            ),
            "followedByGlobalDialogueActiveCheckCount": waits,
            "areaCount": len(area_counts),
            "mapinfoWithExecutableTargetTableCount": sum(
                size > 0 for size in executable_target_table_sizes
            ),
            "executableTargetEntryCount": sum(
                executable_target_table_sizes
            ),
            "invocationWithExecutableTargetContextCount": sum(
                item["nearestPrecedingExecutableTarget"] is not None
                for item in invocations
            ),
            "areas": [
                {
                    "disc": disc,
                    "area": area,
                    "invocationCount": count,
                }
                for (disc, area), count in sorted(area_counts.items())
            ],
        },
        "invocations": invocations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument(
        "--disc-root",
        action="append",
        type=parse_disc_root,
        required=True,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    parser.add_argument("--without-text", action="store_true")
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    inventory_path = args.inventory.expanduser().resolve()
    inventory = json.loads(inventory_path.read_text())
    report = build_report(
        inventory,
        args.disc_root,
        objdump=args.objdump,
        include_text=not args.without_text,
    )
    report["inventory"] = str(inventory_path)
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {output}: {summary['invocationCount']} dialogue starts, "
        f"{summary['uniqueVoiceIdCount']} unique voice IDs, "
        f"{summary['followedByGlobalDialogueActiveCheckCount']} immediate waits"
    )


if __name__ == "__main__":
    main()
