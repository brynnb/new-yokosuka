#!/usr/bin/env python3
"""Group native operations into dialogue-bearing SCN3 code regions."""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path
from typing import Any, Sequence

from tools.scripting.extract_dialogue_operations import (
DIALOGUE_ACTIVE_OPERATION,
DIALOGUE_START_OPERATION,
    ExecutableTargetEntry,
    executable_target_for_call,
    mapinfo_dispatch_calls,
    read_ascii_c_string,
)
from tools.scripting.extract_dialogue_script_references import (
    DEFAULT_INVENTORY,
    build_voice_index,
    iter_mapinfo,
    parse_disc_root,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    PROJECT_ROOT / ".disc-work" / "dialogue" / "code-regions.json"
)
DEFAULT_SEMANTICS = (
    PROJECT_ROOT / "tools" / "evidence" / "native-operation-semantics.json"
)
CHARACTER_STATE_OPERATION = 0x01AF
CHARACTER_STATE_WRITE = 0x41
CHARACTER_STATE_READ = 0x42


def decorate_argument(data: bytes, argument: dict[str, Any]) -> dict[str, Any]:
    result = dict(argument)
    if argument.get("kind") != "static-pointer":
        return result
    value = argument.get("value")
    if not isinstance(value, int):
        return result
    text = read_ascii_c_string(data, value, limit=256)
    if text:
        result["staticText"] = text
    return result


def exact_character_state_access(
    operation: dict[str, Any],
) -> dict[str, Any] | None:
    """Decode only the 0x01af suboperations proven in 1ST_READ.BIN."""
    if operation["operationId"] != CHARACTER_STATE_OPERATION:
        return None
    arguments = operation["arguments"]
    if len(arguments) < 2:
        return None
    suboperation = arguments[0].get("value")
    actor_tag = arguments[1].get("ascii")
    if (
        suboperation not in {CHARACTER_STATE_READ, CHARACTER_STATE_WRITE}
        or not isinstance(actor_tag, str)
        or len(actor_tag) != 4
    ):
        return None
    result = {
        "callFileOffset": operation["callFileOffset"],
        "operationId": CHARACTER_STATE_OPERATION,
        "suboperation": suboperation,
        "access": (
            "read"
            if suboperation == CHARACTER_STATE_READ
            else "write"
        ),
        "actorTag": actor_tag,
    }
    if suboperation == CHARACTER_STATE_WRITE and len(arguments) >= 3:
        value = arguments[2].get("value")
        if isinstance(value, int):
            result["value"] = value
    return result


def voice_record_provenance(
    records: Sequence[dict[str, Any]],
    *,
    disc: int,
) -> list[dict[str, Any]]:
    same_disc = [record for record in records if record["disc"] == disc]
    selected = same_disc or list(records)
    keys = (
        "disc",
        "scene",
        "archive",
        "subtitleMember",
        "recordIndex",
        "speakerId",
    )
    return [
        {key: record[key] for key in keys}
        for record in selected
    ]


def group_dialogue_code_regions(
    data: bytes,
    calls: Sequence[dict[str, Any]],
    executable_targets: Sequence[ExecutableTargetEntry],
    voice_index: dict[str, list[dict[str, Any]]],
    *,
    disc: int,
    operation_semantics: dict[int, str] | None = None,
) -> list[dict[str, Any]]:
    operation_semantics = operation_semantics or {}
    targets = sorted({
        target.target_offset for target in executable_targets
    })
    target_ends = {
        target: targets[index + 1] if index + 1 < len(targets) else None
        for index, target in enumerate(targets)
    }
    aliases: dict[int, list[int]] = {}
    for target in executable_targets:
        aliases.setdefault(target.target_offset, []).append(target.index)
    grouped: dict[int, dict[str, Any]] = {}
    for call in calls:
        offset = int(call["callFileOffset"], 16)
        executable_target = executable_target_for_call(
            executable_targets,
            offset,
        )
        if executable_target is None:
            continue
        group = grouped.setdefault(
            executable_target.index,
            {
                "executableTargetIndex": executable_target.index,
                "executableTargetTableEntryFileOffset": (
                    f"0x{executable_target.table_entry_offset:x}"
                ),
                "regionStartFileOffset": (
                    f"0x{executable_target.target_offset:x}"
                ),
                "regionEndFileOffset": (
                    f"0x{target_ends[executable_target.target_offset]:x}"
                    if target_ends[executable_target.target_offset] is not None
                    else None
                ),
                "executableTargetAliasIndices": (
                    aliases[executable_target.target_offset]
                ),
                "operations": [],
                "voiceIds": [],
                "voiceRecords": [],
                "actorTags": [],
                "characterStateAccesses": [],
            },
        )
        arguments = [
            decorate_argument(data, argument)
            for argument in call["arguments"]
        ]
        operation = {
            "callFileOffset": call["callFileOffset"],
            "operationId": call["operationId"],
            "operationHex": call["operationHex"],
            "arguments": arguments,
        }
        semantic_id = operation_semantics.get(call["operationId"])
        if semantic_id:
            operation["semanticId"] = semantic_id
        group["operations"].append(operation)
        state_access = exact_character_state_access(operation)
        if state_access is not None:
            group["characterStateAccesses"].append(state_access)
        if call["operationId"] == DIALOGUE_START_OPERATION and arguments:
            voice_id = arguments[0].get("staticText", "").upper()
            if voice_id in voice_index:
                group["voiceIds"].append(voice_id)
                group["voiceRecords"].append(
                    {
                        "callFileOffset": call["callFileOffset"],
                        "voiceId": voice_id,
                        "records": voice_record_provenance(
                            voice_index[voice_id],
                            disc=disc,
                        ),
                    }
                )
        for argument in arguments:
            ascii_value = argument.get("ascii")
            if (
                isinstance(ascii_value, str)
                and len(ascii_value) == 4
                and ascii_value.isalnum()
                and ascii_value not in group["actorTags"]
            ):
                group["actorTags"].append(ascii_value)
    return [
        group
        for _, group in sorted(grouped.items())
        if group["voiceIds"]
    ]


def build_report(
    inventory: dict[str, Any],
    roots: Sequence[tuple[int, Path]],
    *,
    objdump: str,
    semantics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    voice_index = build_voice_index(inventory)
    semantics = semantics or {
        "schema": "new-yokosuka-native-operation-semantics-v1",
        "operations": [],
    }
    operation_semantics = {
        operation["operationId"]: operation["semanticId"]
        for operation in semantics["operations"]
    }
    regions: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for disc, root in roots:
        if not root.is_dir():
            skipped.append(
                {"disc": disc, "path": str(root), "reason": "missing root"}
            )
            continue
        for area, path in iter_mapinfo(root):
            data, static_base, calls, executable_target_table = (
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
            for region in group_dialogue_code_regions(
                data,
                calls,
                executable_target_table,
                voice_index,
                disc=disc,
                operation_semantics=operation_semantics,
            ):
                region.update(
                    {
                        "disc": disc,
                        "area": area,
                        "mapinfo": str(path),
                    }
                )
                regions.append(region)
    regions.sort(
        key=lambda item: (
            item["disc"],
            item["area"],
            item["mapinfo"],
            item["executableTargetIndex"],
        )
    )
    operation_counts = Counter(
        operation["operationId"]
        for region in regions
        for operation in region["operations"]
    )
    actor_tag_counts = Counter(
        tag for region in regions for tag in region["actorTags"]
    )
    return {
        "schema": "new-yokosuka-dialogue-code-regions-v1",
        "evidenceBoundary": [
            "Regions come from the longest contiguous SCN3-relative executable-pointer table in each room program.",
            "That table is not claimed to be an interaction callback registry or a complete function table.",
            "A region is included only when one of its exact operation-0x006d arguments resolves to a native inventory voice ID.",
            "Operations are grouped by the nearest preceding executable target and retain native argument order.",
            "regionEndFileOffset is the next distinct target in that table, not a decompiler-inferred function boundary.",
            "voiceRecords preserve exact inventory provenance and subtitle speaker IDs without copying dialogue text.",
            "Four-character actorTags are literal operation arguments only; their presence does not by itself prove speaker or interaction ownership.",
            "characterStateAccesses decode only operation-0x01af suboperations 0x41 and 0x42, whose write/read behavior is proven in 1ST_READ.BIN.",
            "semanticId values refer only to the tracked, evidence-cited operation registry embedded in this report.",
            "Unidentified operation IDs remain numeric. No camera, animation, story-flag, or object meaning is guessed.",
        ],
        "operationSemantics": semantics["operations"],
        "skipped": skipped,
        "summary": {
            "regionCount": len(regions),
            "voiceInvocationCount": sum(
                len(region["voiceIds"]) for region in regions
            ),
            "uniqueVoiceIdCount": len(
                {
                    voice_id
                    for region in regions
                    for voice_id in region["voiceIds"]
                }
            ),
            "operationCount": sum(
                len(region["operations"]) for region in regions
            ),
            "uniqueOperationIdCount": len(operation_counts),
            "regionWithActorTagCount": sum(
                bool(region["actorTags"]) for region in regions
            ),
            "regionWithCharacterStateAccessCount": sum(
                bool(region["characterStateAccesses"])
                for region in regions
            ),
            "characterStateAccessCount": sum(
                len(region["characterStateAccesses"])
                for region in regions
            ),
            "voiceRecordLinkCount": sum(
                len(voice["records"])
                for region in regions
                for voice in region["voiceRecords"]
            ),
            "semanticizedOperationCount": sum(
                "semanticId" in operation
                for region in regions
                for operation in region["operations"]
            ),
            "operationIds": [
                {
                    "operationId": operation_id,
                    "operationHex": f"0x{operation_id:04x}",
                    "count": count,
                }
                for operation_id, count in sorted(operation_counts.items())
            ],
            "literalActorTags": [
                {"tag": tag, "regionCount": count}
                for tag, count in actor_tag_counts.most_common()
            ],
        },
        "regions": regions,
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
        "--semantics",
        type=Path,
        default=DEFAULT_SEMANTICS,
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")
    inventory = json.loads(args.inventory.expanduser().resolve().read_text())
    semantics = json.loads(args.semantics.expanduser().resolve().read_text())
    if semantics.get("schema") != (
        "new-yokosuka-native-operation-semantics-v1"
    ):
        parser.error(f"unsupported operation semantics: {args.semantics}")
    report = build_report(
        inventory,
        args.disc_root,
        objdump=args.objdump,
        semantics=semantics,
    )
    output = args.output.expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    summary = report["summary"]
    print(
        f"Wrote {output}: {summary['regionCount']} regions, "
        f"{summary['operationCount']} operations"
    )


if __name__ == "__main__":
    main()
