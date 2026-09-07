#!/usr/bin/env python3
"""Generate compact browser data for Shenmue's actor dialogue selector."""

from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_actor_resources import (
    DEFAULT_DIALOGUE_INVENTORY,
    DEFAULT_HUMANS,
    DEFAULT_SCHEDULED_ACTORS,
    HUMANS_SHA256,
    afs_entries,
    package_children,
    parse_scnf,
    scheduled_actor_labels,
    sha256,
    subtitle_inventory_index,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = (
    ROOT / "play" / "data" / "dialogue"
    / "nativeActorSelectors.generated.js"
)
DEFAULT_MESSAGES_OUTPUT_DIR = (
    ROOT / "play" / "data" / "dialogue"
    / "messages"
)


class SelectorDataError(ValueError):
    """Actor selector resources do not match their exact native schema."""


PACKED_LIP_SYNC_PREFIX = "srf1:"


def pack_native_lip_sync(value: dict[str, Any] | None) -> str | None:
    """Pack a validated SRF descriptor without losing shape or timing data."""
    if value is None:
        return None
    if (
        value.get("format") != "shenmue-srf-mouth-cues-v1"
        or value.get("tickRate") != 60
        or not isinstance(value.get("cues"), list)
    ):
        raise SelectorDataError("unsupported native lip-sync descriptor")
    packed = bytearray()
    for cue in value["cues"]:
        shape = cue.get("shape") if isinstance(cue, dict) else None
        duration = cue.get("durationTicks") if isinstance(cue, dict) else None
        if (
            not isinstance(shape, int)
            or isinstance(shape, bool)
            or not 0 <= shape <= 5
            or not isinstance(duration, int)
            or isinstance(duration, bool)
            or not 0 < duration <= 0xFFFF
        ):
            raise SelectorDataError("invalid native lip-sync cue")
        packed.append(shape)
        packed.extend(duration.to_bytes(2, "little"))
    return PACKED_LIP_SYNC_PREFIX + base64.b64encode(packed).decode("ascii")


def extract_selector_data(
    humans: bytes,
    labels: dict[str, str] | None = None,
    dialogue_inventory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    digest = sha256(humans)
    if digest != HUMANS_SHA256:
        raise SelectorDataError(f"unexpected HUMANS.AFS SHA-256: {digest}")

    resources: dict[str, dict[str, Any]] = {}
    message_resources: dict[str, dict[str, Any]] = {}
    labels = labels or {}
    inventory = subtitle_inventory_index(dialogue_inventory)
    duplicate_count = 0
    total_bytes = 0
    for archive_entry in afs_entries(humans):
        package = humans[
            archive_entry["offset"] :
            archive_entry["offset"] + archive_entry["length"]
        ]
        for child in package_children(package):
            data = child["data"]
            if child["extension"] != "BIN" or data[:4] != b"SCNF":
                continue
            if int.from_bytes(data[8:12], "little") != 1:
                raise SelectorDataError(
                    f"{child['name']} actor SCNF does not have one record"
                )
            record_start = 0x10
            record = parse_scnf(data)["records"][0]
            record_size = int.from_bytes(
                data[record_start + 4 : record_start + 8],
                "little",
            )
            if record_start + record_size != len(data):
                raise SelectorDataError(
                    f"{child['name']} record size does not fill its SCNF"
                )
            routing_offset = int.from_bytes(
                data[record_start + 0x14 : record_start + 0x18],
                "little",
            )
            message_offset = int.from_bytes(
                data[record_start + 0x18 : record_start + 0x1C],
                "little",
            )
            if not 0 < routing_offset < message_offset <= record_size:
                raise SelectorDataError(
                    f"{child['name']} has invalid selector bounds"
                )
            selector = data[
                record_start + routing_offset :
                record_start + message_offset
            ]
            messages = []
            for message in record["messages"]:
                matches = inventory.get(message["voiceId"].upper(), [])
                content = {
                    (
                        match["speakerId"],
                        match["displayText"],
                        json.dumps(
                            match.get("lipSync"),
                            sort_keys=True,
                            separators=(",", ":"),
                        ),
                    )
                    for match in matches
                }
                if len(content) > 1:
                    raise SelectorDataError(
                        f"{child['name']} {message['voiceId']} has "
                        "conflicting subtitle content"
                    )
                speaker_id, display_text, lip_sync_json = (
                    next(iter(content))
                    if content
                    else (None, None, "null")
                )
                generated_message = {
                    "index": message["index"],
                    "voiceId": message["voiceId"],
                    "localCode": message["localCode"],
                    "nativeFloat": message["nativeFloat"],
                    "sourceText": message["sourceText"],
                    "speakerId": speaker_id,
                    "displayText": display_text,
                    "subtitleMatched": bool(content),
                    "lipSync": json.loads(lip_sync_json),
                }
                if message["nativeFloat"] == 0:
                    generated_message["sourceByteLength"] = (
                        message["sourceByteLength"]
                    )
                messages.append(generated_message)
            resource = {
                "recordRoutingOffset": routing_offset,
                "byteLength": len(selector),
                "sha256": sha256(selector),
                "base64": base64.b64encode(selector).decode("ascii"),
            }
            message_resource = {
                "actorLabel": labels.get(child["name"]),
                "authoredPersonIdentity": record["identity"],
                "participantFourccs": record["participantFourccs"],
                "participantFacingTargets": record[
                    "participantFacingTargets"
                ],
                "voicePath": record["pathString"],
                "messages": messages,
            }
            existing = resources.get(child["name"])
            if existing is not None:
                if (
                    existing != resource
                    or message_resources[child["name"]] != message_resource
                ):
                    raise SelectorDataError(
                        f"{child['name']} has conflicting selector variants"
                    )
                duplicate_count += 1
                continue
            resources[child["name"]] = resource
            message_resources[child["name"]] = message_resource
            total_bytes += len(selector)

    return {
        "schema": "new-yokosuka-native-dialogue-selectors-v1",
        "generatedFrom": {
            "archive": "HUMANS.AFS",
            "sha256": digest,
        },
        "resourceCount": len(resources),
        "identicalDuplicateCount": duplicate_count,
        "totalSelectorBytes": total_bytes,
        "resources": dict(sorted(resources.items())),
        "messageResources": dict(sorted(message_resources.items())),
    }


def write_modules(
    path: Path,
    messages_dir: Path,
    data: dict[str, Any],
) -> None:
    selector_data = {
        key: value
        for key, value in data.items()
        if key != "messageResources"
    }
    encoded = json.dumps(
        selector_data,
        ensure_ascii=True,
        separators=(",", ":"),
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "// Generated by tools/scripting/generate_native_dialogue_selector_data.py.\n"
        "// Exact bounded selector/body bytes from SHA-256-verified HUMANS.AFS.\n"
        "export const NATIVE_DIALOGUE_SELECTORS = "
        f"Object.freeze({encoded});\n",
        encoding="utf-8",
    )
    messages_dir.mkdir(parents=True, exist_ok=True)
    for actor_code, resource in data["messageResources"].items():
        message_resource = {
            key: (
                [
                    {
                        **message,
                        "lipSync": pack_native_lip_sync(message["lipSync"]),
                    }
                    for message in value
                ]
                if key == "messages"
                else value
            )
            for key, value in resource.items()
            if key != "participantFacingTargets"
        }
        messages_encoded = json.dumps(
            {
                "schema": "new-yokosuka-native-dialogue-messages-v3",
                "generatedFrom": data["generatedFrom"],
                "actorCode": actor_code,
                **message_resource,
            },
            ensure_ascii=True,
            separators=(",", ":"),
        )
        (messages_dir / f"{actor_code}.generated.js").write_text(
            "// Generated by "
            "tools/scripting/generate_native_dialogue_selector_data.py.\n"
            "// Exact actor message records and independently joined "
            "subtitles.\n"
            "export const NATIVE_DIALOGUE_MESSAGE_RESOURCE = "
            f"Object.freeze({messages_encoded});\n",
            encoding="utf-8",
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    parser.add_argument(
        "--scheduled-actors",
        type=Path,
        default=DEFAULT_SCHEDULED_ACTORS,
    )
    parser.add_argument(
        "--dialogue-inventory",
        type=Path,
        default=DEFAULT_DIALOGUE_INVENTORY,
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--messages-output-dir",
        type=Path,
        default=DEFAULT_MESSAGES_OUTPUT_DIR,
    )
    args = parser.parse_args()
    inventory = (
        json.loads(args.dialogue_inventory.read_text(encoding="utf-8"))
        if args.dialogue_inventory.is_file()
        else None
    )
    data = extract_selector_data(
        args.humans.read_bytes(),
        scheduled_actor_labels(args.scheduled_actors),
        inventory,
    )
    write_modules(args.output, args.messages_output_dir, data)
    print(
        f"Wrote {args.output}: {data['resourceCount']} resources, "
        f"{data['totalSelectorBytes']} exact bytes"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
