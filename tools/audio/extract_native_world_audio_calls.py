#!/usr/bin/env python3
"""Inventory native world-sound calls without inventing semantic mappings.

Every MAPINFO SCN3 operation 0x006c call is retained. Direct command words are
converted to their native little-endian DTPK command bytes and joined to the
location banks named by that MAPINFO or the source-identical SYSTEM1 bank
shared by all three discs. Runtime-loaded commands and ambiguous bank matches
stay unresolved. Object tags reached by 0x00c9/0x0139 in the same generated
function are reported only as co-occurrence candidates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_operations import (
    executable_target_for_call,
    mapinfo_dispatch_calls,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SOUND_OPERATION = 0x006C
OBJECT_TAG_ARGUMENT = {
    0x00C9: 0,
    0x0139: 1,
}
SOUND_NAME = re.compile(rb"(?i)([a-z0-9_]{3,16}\.snd)\x00")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_source(path: Path, data_root: Path) -> str:
    return path.relative_to(data_root).as_posix()


def command_hex(value: int) -> str:
    return struct.pack("<I", value & 0xFFFFFFFF).hex()


def ascii_sound_names(data: bytes) -> list[str]:
    return sorted({
        match.group(1).decode("ascii").upper()
        for match in SOUND_NAME.finditer(data)
    })


def bank_indexes(catalog: dict[str, Any]) -> tuple[dict, dict, list[dict]]:
    by_disc_name: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    commands_by_sha: dict[str, set[str]] = {}
    shared_system_banks = []
    for bank in catalog["banks"]:
        commands_by_sha[bank["sha256"]] = {
            command["commandHex"] for command in bank.get("commands", [])
        }
        for source in bank["sources"]:
            by_disc_name[
                (source["disc"], Path(source["path"]).name.upper())
            ].append(bank)
        system_sources = [
            source
            for source in bank["sources"]
            if Path(source["path"]).name.upper() == "SYSTEM1.SND"
        ]
        if (
            set(bank.get("families", [])) == {"system"}
            and {source["disc"] for source in system_sources} == {1, 2, 3}
        ):
            shared_system_banks.append({
                "filename": "SYSTEM1.SND",
                "sha256": bank["sha256"],
                "sourceDiscs": [1, 2, 3],
            })
    return by_disc_name, commands_by_sha, shared_system_banks


def resolve_command_bank(
    native_command: str | None,
    location_banks: list[dict[str, Any]],
    shared_system_banks: list[dict[str, Any]],
    commands_by_sha: dict[str, set[str]],
) -> tuple[str, list[dict[str, Any]]]:
    if native_command is None:
        return "runtime-command-unresolved", []
    location_matches = [
        {**bank, "scope": "map-named-location"}
        for bank in location_banks
        if native_command in commands_by_sha.get(bank["sha256"], set())
    ]
    if len(location_matches) == 1:
        return "location-bank-resolved", location_matches
    if len(location_matches) > 1:
        return "location-bank-ambiguous", location_matches
    shared_matches = [
        {**bank, "scope": "all-disc-shared-system"}
        for bank in shared_system_banks
        if native_command in commands_by_sha.get(bank["sha256"], set())
    ]
    if len(shared_matches) == 1:
        return "shared-system-bank-resolved", shared_matches
    if len(shared_matches) > 1:
        return "shared-system-bank-ambiguous", shared_matches
    return "not-in-proven-map-or-shared-bank", []


def constant_tag(argument: dict[str, Any] | None) -> str | None:
    if not argument or argument.get("kind") != "constant":
        return None
    value = argument.get("value")
    if not isinstance(value, int):
        return None
    raw = struct.pack("<I", value & 0xFFFFFFFF)
    if not all(0x20 <= byte < 0x7F for byte in raw):
        return None
    return raw.decode("ascii")


def function_groups(
    calls: list[dict[str, Any]],
    targets,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, list[str]]]:
    by_target: dict[str, list[dict[str, Any]]] = defaultdict(list)
    object_tags: dict[str, set[str]] = defaultdict(set)
    for call in calls:
        offset = int(call["callFileOffset"], 16)
        target = executable_target_for_call(targets, offset)
        target_hex = (
            f"0x{target.target_offset:x}" if target is not None else "unresolved"
        )
        by_target[target_hex].append(call)
        tag_index = OBJECT_TAG_ARGUMENT.get(call["operationId"])
        if tag_index is None:
            continue
        arguments = call.get("arguments", [])
        tag = constant_tag(
            arguments[tag_index] if len(arguments) > tag_index else None
        )
        if tag:
            object_tags[target_hex].add(tag)
    return by_target, {
        target: sorted(tags) for target, tags in object_tags.items()
    }


def analyze_map(
    path: Path,
    *,
    disc: int,
    data_root: Path,
    objdump: str,
    by_disc_name: dict,
    commands_by_sha: dict,
    shared_system_banks: list[dict[str, Any]],
) -> dict[str, Any] | None:
    data, _, calls, targets = mapinfo_dispatch_calls(path, objdump)
    if not calls:
        return None
    sound_calls = [
        call for call in calls if call["operationId"] == SOUND_OPERATION
    ]
    if not sound_calls:
        return None
    area = path.parent.name.upper()
    named_banks = ascii_sound_names(data)
    location_names = [name for name in named_banks if name.startswith("F1")]
    location_banks = []
    for name in location_names:
        for bank in by_disc_name.get((disc, name), []):
            location_banks.append({
                "filename": name,
                "sha256": bank["sha256"],
            })
    location_banks = list({
        (bank["filename"], bank["sha256"]): bank for bank in location_banks
    }.values())
    _, object_tags = function_groups(calls, targets)

    findings = []
    for call in sound_calls:
        target = executable_target_for_call(
            targets,
            int(call["callFileOffset"], 16),
        )
        target_hex = (
            f"0x{target.target_offset:x}" if target is not None else None
        )
        arguments = call.get("arguments", [])
        first = arguments[0] if arguments else {}
        direct = first.get("kind") == "constant"
        value = first.get("value") if direct else None
        native_command = command_hex(value) if isinstance(value, int) else None
        status, matches = resolve_command_bank(
            native_command,
            location_banks,
            shared_system_banks,
            commands_by_sha,
        )
        tags = object_tags.get(target_hex or "unresolved", [])
        findings.append({
            "callFileOffset": call["callFileOffset"],
            "functionTarget": target_hex,
            "arguments": arguments,
            "commandHex": native_command,
            "bankMatches": matches,
            "sameFunctionObjectTags": tags,
            "semanticStatus": status,
            "semanticBoundary": (
                "Same-function object tags are candidates only; control-flow "
                "or emulator evidence is required before runtime mapping."
            ) if tags else None,
        })

    return {
        "disc": disc,
        "area": area,
        "source": stable_source(path, data_root),
        "sourceSha256": sha256(data),
        "namedSoundBanks": named_banks,
        "namedLocationBanks": location_banks,
        "sharedSystemBanks": shared_system_banks,
        "soundCallCount": len(findings),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--disc-root",
        action="append",
        required=True,
        metavar="DISC:DATA_ROOT",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=PROJECT_ROOT / ".disc-work/audio/native-audio-bank-catalog.json",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=PROJECT_ROOT / ".disc-work/audio/native-world-audio-calls.json",
    )
    parser.add_argument(
        "--evidence-out",
        type=Path,
        default=PROJECT_ROOT / "tools/evidence/native-world-audio-calls.json",
    )
    parser.add_argument(
        "--objdump",
        default=shutil.which("sh4-linux-gnu-objdump"),
    )
    args = parser.parse_args()
    if not args.objdump:
        parser.error("sh4-linux-gnu-objdump was not found")

    roots = []
    for item in args.disc_root:
        disc_text, separator, root_text = item.partition(":")
        if not separator:
            parser.error(f"invalid --disc-root {item!r}")
        roots.append((int(disc_text), Path(root_text)))
    catalog = json.loads(args.catalog.read_text())
    by_disc_name, commands_by_sha, shared_system_banks = bank_indexes(catalog)
    if len(shared_system_banks) != 1:
        raise ValueError(
            "expected exactly one source-identical all-disc SYSTEM1 bank; "
            f"found {len(shared_system_banks)}"
        )

    maps = []
    for disc, data_root in roots:
        for path in sorted(data_root.glob("SCENE/*/*/MAPINFO.BIN")):
            result = analyze_map(
                path,
                disc=disc,
                data_root=data_root,
                objdump=args.objdump,
                by_disc_name=by_disc_name,
                commands_by_sha=commands_by_sha,
                shared_system_banks=shared_system_banks,
            )
            if result:
                maps.append(result)

    status_counts = Counter(
        finding["semanticStatus"]
        for entry in maps
        for finding in entry["findings"]
    )
    command_counts = Counter(
        finding["commandHex"]
        for entry in maps
        for finding in entry["findings"]
        if finding["commandHex"]
    )
    detailed = {
        "schema": "new-yokosuka-native-world-audio-calls-v2",
        "generatedBy": "tools/audio/extract_native_world_audio_calls.py",
        "method": [
            "Scan exact SCN3 dispatcher calls for operation 0x006c.",
            "Convert constant runtime words to little-endian DTPK commands.",
            "Join commands to F1 location banks named by that MAPINFO.",
            "Separately join commands to SYSTEM1 only after proving one "
            "source-identical bank is present on all three discs.",
            "Retain runtime commands, ambiguous matches, and commands absent "
            "from both proven scopes as unresolved.",
            "Treat object tags in the same generated function as candidates, "
            "not semantic mappings.",
        ],
        "summary": {
            "mapCount": len(maps),
            "soundCallCount": sum(entry["soundCallCount"] for entry in maps),
            "statusCounts": dict(sorted(status_counts.items())),
            "uniqueDirectCommandCount": len(command_counts),
        },
        "sharedSystemBanks": shared_system_banks,
        "maps": maps,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(detailed, indent=2) + "\n")

    evidence = {
        "schema": "new-yokosuka-native-world-audio-call-summary-v2",
        "generatedBy": "tools/audio/extract_native_world_audio_calls.py",
        "detailedReport": ".disc-work/audio/native-world-audio-calls.json",
        "semanticPolicy": detailed["method"],
        "summary": detailed["summary"],
        "sharedSystemBanks": shared_system_banks,
        "areas": [
            {
                "disc": entry["disc"],
                "area": entry["area"],
                "source": entry["source"],
                "sourceSha256": entry["sourceSha256"],
                "soundCallCount": entry["soundCallCount"],
                "statusCounts": dict(sorted(Counter(
                    finding["semanticStatus"]
                    for finding in entry["findings"]
                ).items())),
                "directCommands": sorted({
                    finding["commandHex"]
                    for finding in entry["findings"]
                    if finding["commandHex"]
                }),
                "candidateObjectTags": sorted({
                    tag
                    for finding in entry["findings"]
                    for tag in finding["sameFunctionObjectTags"]
                }),
            }
            for entry in maps
        ],
        "directCommandFrequency": [
            {"commandHex": command, "callCount": count}
            for command, count in sorted(command_counts.items())
        ],
        "sharedSystemDirectCommands": [
            {"commandHex": command, "callCount": count}
            for command, count in sorted(Counter(
                finding["commandHex"]
                for entry in maps
                for finding in entry["findings"]
                if (
                    finding["semanticStatus"]
                    == "shared-system-bank-resolved"
                )
            ).items())
        ],
    }
    args.evidence_out.parent.mkdir(parents=True, exist_ok=True)
    args.evidence_out.write_text(json.dumps(evidence, indent=2) + "\n")
    print(
        f"Wrote {len(maps)} maps / {detailed['summary']['soundCallCount']} "
        f"sound calls to {args.out} and {args.evidence_out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
