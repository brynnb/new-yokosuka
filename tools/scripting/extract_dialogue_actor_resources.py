#!/usr/bin/env python3
"""Recover the native per-actor free-conversation resources.

The scheduled-actor constructor in the US Dreamcast executable derives a
four-character resource name from the actor definition, asks the actor's
loaded package for a resource with that name and type ``BIN ``, and stores the
returned payload at runtime actor offset ``+0x9c``.  The free-conversation
manager later enumerates exactly those non-null ``+0x9c`` pointers.

HUMANS.AFS contains those resources as ``BIN`` children inside the actor PAKS
entries.  Their payloads are native ``SCNF`` containers whose records use the
same static layout copied by the verified free-conversation loader.

This extractor preserves that exact join.  It does not infer conversation
ownership from display names, model names, proximity, or emulator timing.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from tools.lib.portable_paths import portable_project_path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_EXECUTABLE = ROOT / ".disc-work" / "exact" / "1ST_READ.BIN"
DEFAULT_HUMANS = (
    ROOT
    / "extracted_files"
    / "data"
    / "SCENE"
    / "01"
    / "STREAM"
    / "HUMANS.AFS"
)
DEFAULT_SCHEDULED_ACTORS = ROOT / "play" / "data" / "scheduled-actors.json"
DEFAULT_FULL_OUTPUT = (
    ROOT / ".disc-work" / "dialogue" / "actor-conversation-resources.json"
)
DEFAULT_DIALOGUE_INVENTORY = (
    ROOT / ".disc-work" / "dialogue" / "inventory.json"
)
DEFAULT_EVIDENCE_OUTPUT = (
    ROOT / "tools" / "evidence" / "dialogue-actor-resources.json"
)

RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HUMANS_SHA256 = (
    "c61b53f0784442505e491a2bba7dc8f608495922f69acfb253be8c10492570a7"
)

VERIFIED_RANGES = {
    "scheduledActorConversationResourceInstall": (
        0x0C116086,
        64,
        "6d44f0eafffaafdbb9921388c056b80d24c9808e2225d8be8f110415612406b3",
    ),
    "actorIdentityResourceNameAdapter": (
        0x0C11482C,
        8,
        "8e4515989856f3348906e9cb19c89253cf66a9e0690474bedaff26b9cca89ad8",
    ),
    "typedPackageResourceLookup": (
        0x0C139588,
        112,
        "19285c3d20171483c94c9a1d03de8a0a2e82e20c1c8c2d842a48f5751a81ebfb",
    ),
    "freeConversationActorEnumerator": (
        0x0C1198CC,
        410,
        "051f8eff5abf5a648d4da339cb18b844a90e40c76b15bf289bd0bc53378332fd",
    ),
}

STATIC_POINTER_FIELDS = (
    (0x10, 0x38),
    (0x14, 0x40),
    (0x18, 0x44),
    (0x20, 0x28),
    (0x24, 0x30),
    (0x28, 0x2C),
    (0x2C, 0x3C),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hx(value: int) -> str:
    return f"0x{value:x}"


def decode_fixed_ascii(data: bytes) -> str:
    return data.rstrip(b"\0 ").decode("ascii", errors="strict")


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range {hx(address)}+{size} is unavailable")
    return data[start : start + size]


def verify_executable(data: bytes) -> dict[str, Any]:
    actual = sha256(data)
    if actual != EXECUTABLE_SHA256:
        raise ValueError(f"unexpected 1ST_READ.BIN SHA-256: {actual}")
    ranges = {}
    for name, (address, size, expected) in VERIFIED_RANGES.items():
        digest = sha256(runtime_slice(data, address, size))
        if digest != expected:
            raise ValueError(f"verified native range {name} changed: {digest}")
        ranges[name] = {
            "runtimeAddress": hx(address),
            "size": size,
            "sha256": digest,
        }
    return {
        "filename": "1ST_READ.BIN",
        "runtimeBase": hx(RUNTIME_BASE),
        "sha256": actual,
        "verifiedCodeRanges": ranges,
        "provenJoin": {
            "actorPackageHandleOffset": hx(0x8C),
            "resourceName": "actor definition identity at +0x04",
            "resourceType": "BIN ",
            "storedRuntimeActorOffset": hx(0x9C),
            "freeConversationEligibility": (
                "the native actor enumerator yields only records whose "
                "runtime +0x9c resource pointer is non-null"
            ),
        },
    }


def afs_entries(data: bytes) -> list[dict[str, int]]:
    if len(data) < 8 or not data[:4].startswith(b"AFS"):
        raise ValueError("input is not an AFS archive")
    count = struct.unpack_from("<I", data, 4)[0]
    if count > 100_000 or 8 + count * 8 > len(data):
        raise ValueError("invalid AFS entry table")
    entries = []
    for index in range(count):
        offset, length = struct.unpack_from("<II", data, 8 + index * 8)
        if offset > len(data) or length > len(data) - offset:
            raise ValueError(f"AFS entry {index} exceeds archive bounds")
        entries.append({"index": index, "offset": offset, "length": length})
    return entries


def package_children(data: bytes) -> list[dict[str, Any]]:
    if len(data) < 16:
        return []
    magic = data[:4]
    if magic == b"PAKS":
        base = 16
    elif magic == b"PAKF":
        base = struct.unpack_from("<I", data, 4)[0]
    else:
        return []
    if base > len(data) - 16 or data[base : base + 4] != b"IPAC":
        return []
    dictionary_relative, count = struct.unpack_from("<II", data, base + 4)
    table = base + dictionary_relative
    if count > 100_000 or table < base + 16 or table + count * 20 > len(data):
        raise ValueError("invalid nested IPAC dictionary")
    children = []
    for index in range(count):
        cursor = table + index * 20
        name_raw, extension_raw, relative, length = struct.unpack_from(
            "<8s4sII", data, cursor
        )
        offset = base + relative
        if offset > len(data) or length > len(data) - offset:
            raise ValueError(f"IPAC child {index} exceeds package bounds")
        children.append({
            "index": index,
            "name": decode_fixed_ascii(name_raw),
            "extension": decode_fixed_ascii(extension_raw),
            "offset": offset,
            "length": length,
            "data": data[offset : offset + length],
        })
    return children


def printable_fourcc(data: bytes) -> str | None:
    if len(data) != 4 or any(byte < 0x20 or byte > 0x7E for byte in data):
        return None
    return data.decode("ascii")


def c_string(data: bytes, offset: int, end: int) -> str | None:
    if offset < 0 or offset >= end:
        return None
    terminator = data.find(b"\0", offset, end)
    if terminator <= offset:
        return None
    raw = data[offset:terminator]
    if any(byte < 0x20 or byte > 0x7E for byte in raw):
        return None
    return raw.decode("ascii")


def c_string_bytes(data: bytes, offset: int, end: int) -> bytes:
    if offset < 0 or offset >= end:
        raise ValueError(f"string offset {hx(offset)} is outside its record")
    terminator = data.find(b"\0", offset, end)
    if terminator < offset:
        raise ValueError(f"unterminated string at {hx(offset)}")
    return data[offset:terminator]


def parse_message_table(
    data: bytes,
    record_offset: int,
    record_size: int,
    table_relative: int,
) -> list[dict[str, Any]]:
    """Parse the exact 16-byte entries selected by native opcode class 0x20.

    ``FUN_0c15cecc`` indexes this table as ``base + index * 0x10``.  The
    conversation state machine resolves entry fields +0 and +4 relative to
    the static record base, passes +8 onward as a four-byte local line code,
    and reads +0xc as a float.  The purpose of that float remains unnamed.
    """

    if table_relative == 0:
        return []
    record_end = record_offset + record_size
    table_offset = record_offset + table_relative
    if table_offset < record_offset + 0x30 or table_offset >= record_end:
        raise ValueError(
            f"message table {hx(table_offset)} is outside its record"
        )

    entries = []
    cursor = table_offset
    first_string_offset = record_end
    while cursor < first_string_offset:
        if cursor + 0x10 > first_string_offset:
            raise ValueError(
                f"message table entry at {hx(cursor)} overlaps string data"
            )
        text_relative, voice_relative = struct.unpack_from("<II", data, cursor)
        text_offset = record_offset + text_relative
        voice_offset = record_offset + voice_relative
        for label, target in (
            ("text", text_offset),
            ("voice", voice_offset),
        ):
            if target <= cursor or target >= record_end:
                raise ValueError(
                    f"message {label} pointer {hx(target)} from "
                    f"{hx(cursor)} is outside the trailing string region"
                )

        local_code = printable_fourcc(data[cursor + 8 : cursor + 12])
        if local_code is None:
            raise ValueError(f"invalid local line code at {hx(cursor + 8)}")
        native_float = struct.unpack_from("<f", data, cursor + 12)[0]
        if (
            not math.isfinite(native_float)
            or native_float < 0
            or native_float > 1000
        ):
            raise ValueError(f"invalid native float at {hx(cursor + 12)}")

        text_bytes = c_string_bytes(data, text_offset, record_end)
        voice_bytes = c_string_bytes(data, voice_offset, record_end)
        try:
            source_text = text_bytes.decode("euc_jp")
        except UnicodeDecodeError as error:
            raise ValueError(
                f"message text at {hx(text_offset)} is not EUC-JP"
            ) from error
        try:
            voice_id = voice_bytes.decode("ascii")
        except UnicodeDecodeError as error:
            raise ValueError(
                f"voice identifier at {hx(voice_offset)} is not ASCII"
            ) from error
        if not voice_id or any(not (character.isalnum() or character in "_-")
                               for character in voice_id):
            raise ValueError(
                f"invalid voice identifier {voice_id!r} at {hx(voice_offset)}"
            )

        entries.append({
            "index": len(entries),
            "fileOffset": hx(cursor),
            "textRelative": hx(text_relative),
            "textOffset": hx(text_offset),
            "voiceRelative": hx(voice_relative),
            "voiceOffset": hx(voice_offset),
            "voiceId": voice_id,
            "localCode": local_code,
            "nativeFloat": native_float,
            "sourceText": source_text,
            "sourceTextEncoding": "euc_jp",
            "sourceByteLength": len(text_bytes),
            "sourceBytesSha256": sha256(text_bytes),
        })
        first_string_offset = min(
            first_string_offset,
            text_offset,
            voice_offset,
        )
        cursor += 0x10

    if cursor != first_string_offset:
        raise ValueError(
            f"message table ends at {hx(cursor)}, first string begins at "
            f"{hx(first_string_offset)}"
        )
    return entries


def parse_scnf(data: bytes) -> dict[str, Any]:
    if len(data) < 0x10 or data[:4] != b"SCNF":
        raise ValueError("resource is not an SCNF container")
    stored_size, record_count, flags = struct.unpack_from("<III", data, 4)
    if stored_size != len(data):
        raise ValueError(
            f"SCNF stored size {stored_size} does not match {len(data)}"
        )
    if record_count > 12:
        raise ValueError(f"SCNF record count exceeds native capacity: {record_count}")

    records = []
    cursor = 0x10
    for index in range(record_count):
        if cursor + 0x30 > len(data):
            raise ValueError(f"SCNF record {index} is truncated")
        identity = printable_fourcc(data[cursor : cursor + 4])
        record_size = struct.unpack_from("<I", data, cursor + 4)[0]
        if identity is None or record_size < 0x30 or cursor + record_size > len(data):
            raise ValueError(f"invalid SCNF record {index}")
        numeric = list(data[cursor + 8 : cursor + 12])
        pointers = []
        for static_offset, runtime_offset in STATIC_POINTER_FIELDS:
            relative = struct.unpack_from("<I", data, cursor + static_offset)[0]
            target = None if relative == 0 else cursor + relative
            if target is not None and not (cursor <= target < cursor + record_size):
                raise ValueError(
                    f"SCNF record {identity} pointer +{static_offset:#x} "
                    "exceeds its record"
                )
            pointers.append({
                "staticOffset": hx(static_offset),
                "runtimeOffset": hx(runtime_offset),
                "relative": hx(relative),
                "targetOffset": None if target is None else hx(target),
            })

        path_target = (
            cursor + struct.unpack_from("<I", data, cursor + 0x10)[0]
        )
        path = c_string(data, path_target, cursor + record_size)
        message_table_relative = struct.unpack_from(
            "<I", data, cursor + 0x18
        )[0]
        messages = parse_message_table(
            data,
            cursor,
            record_size,
            message_table_relative,
        )
        participants_relative = struct.unpack_from("<I", data, cursor + 0x20)[0]
        participants_target = cursor + participants_relative
        participant_codes = None
        if (
            participants_relative
            and participants_target + 8 <= cursor + record_size
        ):
            first = printable_fourcc(data[participants_target : participants_target + 4])
            second = printable_fourcc(
                data[participants_target + 4 : participants_target + 8]
            )
            if first is not None and second is not None:
                participant_codes = [first, second]
        transform_relative = struct.unpack_from("<I", data, cursor + 0x28)[0]
        participant_facing_targets = []
        if transform_relative:
            transform_target = cursor + transform_relative
            if (
                not participants_relative
                or participants_target <= transform_target
                or (participants_target - transform_target) % 12 != 0
            ):
                raise ValueError(
                    f"SCNF record {identity} has invalid participant "
                    "facing-target bounds"
                )
            vector_count = (participants_target - transform_target) // 12
            if vector_count > 10:
                raise ValueError(
                    f"SCNF record {identity} has {vector_count} participant "
                    "facing targets"
                )
            for vector_index in range(vector_count):
                values = struct.unpack_from(
                    "<fff",
                    data,
                    transform_target + vector_index * 12,
                )
                if not all(math.isfinite(value) for value in values):
                    raise ValueError(
                        f"SCNF record {identity} participant facing target "
                        f"{vector_index} is not finite"
                    )
                participant_facing_targets.append(list(values))

        records.append({
            "index": index,
            "fileOffset": hx(cursor),
            "identity": identity,
            "recordSize": record_size,
            "numericBytes": numeric,
            "relativePointers": pointers,
            "pathString": path,
            "participantFourccs": participant_codes,
            "participantFacingTargets": participant_facing_targets,
            "messageCount": len(messages),
            "messages": messages,
        })
        cursor += record_size
    if cursor != len(data):
        raise ValueError(
            f"SCNF records end at {hx(cursor)}, container ends at {hx(len(data))}"
        )
    return {
        "storedSize": stored_size,
        "recordCount": record_count,
        "flags": hx(flags),
        "records": records,
    }


def scheduled_actor_labels(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    source = json.loads(path.read_text(encoding="utf-8"))
    return {
        actor["actorCode"]: actor["label"]
        for actor in source.get("actors", [])
        if isinstance(actor.get("actorCode"), str)
        and isinstance(actor.get("label"), str)
    }


def subtitle_inventory_index(
    inventory: dict[str, Any] | None,
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    if inventory is None:
        return result
    for archive in inventory.get("archives", []):
        for subtitle in archive.get("subtitles", []):
            for record in subtitle.get("records", []):
                member = record.get("voiceMember")
                if not isinstance(member, str) or not member:
                    continue
                voice_id = member.rsplit(".", 1)[0].upper()
                result[voice_id].append({
                    "disc": archive.get("disc"),
                    "archive": archive.get("archive"),
                    "subtitleMember": subtitle.get("member"),
                    "recordIndex": record.get("index"),
                    "speakerId": record.get("speakerId"),
                    "sourceText": record.get("sourceText"),
                    "displayText": record.get("displayText"),
                    "lipSync": record.get("lipSync"),
                })
    return result


def extract_resources(
    humans: bytes,
    labels: dict[str, str] | None = None,
) -> dict[str, Any]:
    labels = labels or {}
    resources = []
    entries = afs_entries(humans)
    for entry in entries:
        package = humans[
            entry["offset"] : entry["offset"] + entry["length"]
        ]
        for child in package_children(package):
            payload = child["data"]
            if child["extension"] != "BIN" or payload[:4] != b"SCNF":
                continue
            container = parse_scnf(payload)
            if container["recordCount"] != 1:
                raise ValueError(
                    f"HUMANS entry {entry['index']} child {child['name']} "
                    "does not contain exactly one actor record"
                )
            record = container["records"][0]
            resources.append({
                "actorCode": child["name"],
                "actorLabel": labels.get(child["name"]),
                "authoredPersonIdentity": record["identity"],
                "afsEntryIndex": entry["index"],
                "packageChildIndex": child["index"],
                "byteLength": child["length"],
                "sha256": sha256(payload),
                "containerFlags": container["flags"],
                "record": record,
            })
    resources.sort(
        key=lambda item: (
            item["actorCode"],
            item["sha256"],
            item["afsEntryIndex"],
        )
    )
    return {
        "archiveEntryCount": len(entries),
        "resources": resources,
    }


def build_report(
    executable: bytes,
    humans: bytes,
    labels: dict[str, str] | None = None,
    dialogue_inventory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    actual_humans_sha = sha256(humans)
    if actual_humans_sha != HUMANS_SHA256:
        raise ValueError(f"unexpected HUMANS.AFS SHA-256: {actual_humans_sha}")
    extracted = extract_resources(humans, labels)
    resources = extracted["resources"]
    by_actor: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for resource in resources:
        by_actor[resource["actorCode"]].append(resource)
    scheduled = set(labels or {})
    resource_actors = set(by_actor)
    variant_counts = Counter(
        len({item["sha256"] for item in variants})
        for variants in by_actor.values()
    )
    messages = [
        message
        for resource in resources
        for message in resource["record"]["messages"]
    ]
    inventory_index = subtitle_inventory_index(dialogue_inventory)
    inventory_conflicts = []
    inventory_matched_entry_count = 0
    for resource in resources:
        for message in resource["record"]["messages"]:
            matches = inventory_index.get(message["voiceId"].upper(), [])
            if not matches:
                message["subtitleInventory"] = None
                continue
            inventory_matched_entry_count += 1
            distinct_content = {
                (
                    match["speakerId"],
                    match["sourceText"],
                    match["displayText"],
                )
                for match in matches
            }
            message["subtitleInventory"] = {
                "matchCount": len(matches),
                "contentVariantCount": len(distinct_content),
                "matches": matches,
            }
            if len(distinct_content) > 1:
                inventory_conflicts.append({
                    "actorCode": resource["actorCode"],
                    "voiceId": message["voiceId"],
                    "variants": matches,
                })
    voice_path_mismatches = []
    local_code_mismatches = []
    for resource in resources:
        record = resource["record"]
        voice_prefix = (
            Path(record["pathString"]).name
            if record["pathString"]
            else None
        )
        for message in record["messages"]:
            if voice_prefix and not message["voiceId"].startswith(voice_prefix):
                voice_path_mismatches.append({
                    "actorCode": resource["actorCode"],
                    "voicePrefix": voice_prefix,
                    "voiceId": message["voiceId"],
                })
            if not message["voiceId"].endswith(message["localCode"]):
                local_code_mismatches.append({
                    "actorCode": resource["actorCode"],
                    "voiceId": message["voiceId"],
                    "localCode": message["localCode"],
                })
    return {
        "schema": "new-yokosuka-dialogue-actor-resources-v2",
        "evidenceBoundary": [
            "The executable code hashes, actor package offset, actor-identity resource name, BIN resource type, destination +0x9c field, and free-conversation eligibility test are exact.",
            "Every retained resource is an exact SCNF/BIN child of the verified HUMANS.AFS archive. The actor-code child name and the sole authored person-record identity are retained independently because the source contains real cross-identity mappings.",
            "Relative record pointers and native copied offsets are exact. Numeric bytes and pointed tables remain unnamed where their higher-level semantics are not proven.",
            "Static +0x28 triples are exact authored scene-space facing targets consumed by native presentation commands 0x014..0x01d and 0x078..0x081. The native consumer forwards them to the actor FACE controller.",
            "Message entries are exact native 16-byte records selected by opcode class 0x20. Entry +0 is source text, +4 is the full voice identifier, +8 is the local line code, and +0xc remains an unnamed native float.",
            "No display-name, model-name, proximity, schedule-time, or per-NPC heuristic participates in resource ownership.",
        ],
        "executableEvidence": verify_executable(executable),
        "archiveEvidence": {
            "filename": "HUMANS.AFS",
            "sha256": actual_humans_sha,
            "byteLength": len(humans),
            "entryCount": extracted["archiveEntryCount"],
            "discIdentity": (
                "The extracted US Disc 1, Disc 2, and Disc 3 HUMANS.AFS "
                "archives are byte-identical."
            ),
        },
        "staticRecordSchema": {
            "containerMagic": "SCNF",
            "recordStartOffset": hx(0x10),
            "identityOffset": hx(0x00),
            "recordSizeOffset": hx(0x04),
            "numericByteOffsets": [hx(value) for value in range(0x08, 0x0C)],
            "relativePointers": [
                {
                    "staticOffset": hx(static),
                    "copiedRuntimeOffset": hx(runtime),
                }
                for static, runtime in STATIC_POINTER_FIELDS
            ],
        },
        "summary": {
            "resourceCount": len(resources),
            "uniqueActorCodeCount": len(resource_actors),
            "uniqueResourcePayloadCount": len(
                {item["sha256"] for item in resources}
            ),
            "actorCodesWithMultipleArchiveEntries": sum(
                len(items) > 1 for items in by_actor.values()
            ),
            "resourceNameAndPersonIdentityMismatchCount": sum(
                item["actorCode"] != item["authoredPersonIdentity"]
                for item in resources
            ),
            "actorVariantCountHistogram": {
                str(count): actors
                for count, actors in sorted(variant_counts.items())
            },
            "scheduledActorCodeCount": len(scheduled),
            "scheduledActorCodeWithConversationResourceCount": len(
                scheduled & resource_actors
            ),
            "scheduledActorCodesWithoutConversationResource": sorted(
                scheduled - resource_actors
            ),
            "nonScheduledConversationActorCodeCount": len(
                resource_actors - scheduled
            ),
            "messageEntryCount": len(messages),
            "uniqueVoiceIdCount": len({
                message["voiceId"] for message in messages
            }),
            "uniqueLocalLineCodeCount": len({
                message["localCode"] for message in messages
            }),
            "minimumMessagesPerResource": min(
                item["record"]["messageCount"] for item in resources
            ),
            "maximumMessagesPerResource": max(
                item["record"]["messageCount"] for item in resources
            ),
            "voicePathPrefixMismatchCount": len(voice_path_mismatches),
            "voiceLocalCodeSuffixMismatchCount": len(local_code_mismatches),
            "participantFacingTargetResourceCount": sum(
                bool(item["record"]["participantFacingTargets"])
                for item in resources
            ),
            "participantFacingTargetCount": sum(
                len(item["record"]["participantFacingTargets"])
                for item in resources
            ),
            "subtitleInventoryMatchedMessageEntryCount": (
                inventory_matched_entry_count
            ),
            "subtitleInventoryUnmatchedMessageEntryCount": (
                len(messages) - inventory_matched_entry_count
            ),
            "subtitleInventoryMatchedUniqueVoiceIdCount": len({
                message["voiceId"]
                for message in messages
                if message["subtitleInventory"] is not None
            }),
            "subtitleInventoryConflictingMessageEntryCount": len(
                inventory_conflicts
            ),
        },
        "messageValidationExceptions": {
            "voicePathPrefixMismatches": voice_path_mismatches,
            "voiceLocalCodeSuffixMismatches": local_code_mismatches,
            "subtitleInventoryConflicts": inventory_conflicts,
        },
        "resources": resources,
    }


def compact_report(report: dict[str, Any], full_output: Path) -> dict[str, Any]:
    resources = []
    for item in report["resources"]:
        record = item["record"]
        resources.append({
            "actorCode": item["actorCode"],
            "actorLabel": item["actorLabel"],
            "authoredPersonIdentity": item["authoredPersonIdentity"],
            "afsEntryIndex": item["afsEntryIndex"],
            "packageChildIndex": item["packageChildIndex"],
            "byteLength": item["byteLength"],
            "sha256": item["sha256"],
            "numericBytes": record["numericBytes"],
            "pathString": record["pathString"],
            "participantFourccs": record["participantFourccs"],
            "participantFacingTargets": record[
                "participantFacingTargets"
            ],
            "messageCount": record["messageCount"],
            "messageExamples": record["messages"][:2],
        })
    return {
        key: report[key]
        for key in (
            "schema",
            "evidenceBoundary",
            "executableEvidence",
            "archiveEvidence",
            "staticRecordSchema",
            "summary",
            "messageValidationExceptions",
        )
    } | {
        "resources": resources,
        "fullReport": portable_project_path(full_output),
    }


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    result.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    result.add_argument(
        "--dialogue-inventory",
        type=Path,
        default=DEFAULT_DIALOGUE_INVENTORY,
    )
    result.add_argument(
        "--scheduled-actors",
        type=Path,
        default=DEFAULT_SCHEDULED_ACTORS,
    )
    result.add_argument("--full-out", type=Path, default=DEFAULT_FULL_OUTPUT)
    result.add_argument("--out", type=Path, default=DEFAULT_EVIDENCE_OUTPUT)
    return result


def main(argv: Iterable[str] | None = None) -> None:
    args = parser().parse_args(argv)
    labels = scheduled_actor_labels(args.scheduled_actors)
    dialogue_inventory = (
        json.loads(args.dialogue_inventory.read_text(encoding="utf-8"))
        if args.dialogue_inventory.is_file()
        else None
    )
    report = build_report(
        args.executable.read_bytes(),
        args.humans.read_bytes(),
        labels,
        dialogue_inventory,
    )
    write_json(args.full_out, report)
    write_json(args.out, compact_report(report, args.full_out))
    print(
        "Recovered "
        f"{report['summary']['resourceCount']} actor SCNF resources for "
        f"{report['summary']['uniqueActorCodeCount']} actor identities; "
        f"{report['summary']['scheduledActorCodeWithConversationResourceCount']}"
        " scheduled actor identities have exact resources."
    )


if __name__ == "__main__":
    main()
