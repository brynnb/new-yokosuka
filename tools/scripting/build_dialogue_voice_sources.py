#!/usr/bin/env python3
"""Build an exact, content-addressed source manifest for actor dialogue voices."""

from __future__ import annotations

import argparse
import hashlib
import json
import mmap
from collections import defaultdict
from pathlib import Path
from typing import Any

from tools.scripting.extract_dialogue_inventory import parse_afs
from tools.scripting.extract_dialogue_voice import normalize_voice_id
from tools.lib.portable_paths import portable_project_path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INVENTORY = ROOT / ".disc-work" / "dialogue" / "inventory.json"
DEFAULT_ACTORS = (
    ROOT / ".disc-work" / "dialogue"
    / "actor-conversation-resources.json"
)
DEFAULT_BODY_ROUTES = (
    ROOT / ".disc-work" / "dialogue"
    / "actor-conversation-body-routes.json"
)
DEFAULT_OUTPUT = (
    ROOT / ".disc-work" / "dialogue"
    / "actor-dialogue-voice-sources.json"
)
DEFAULT_EVIDENCE = (
    ROOT / "tools" / "evidence" / "dialogue-voice-sources.json"
)


def actor_voice_owners(
    actor_resources: dict[str, Any],
) -> dict[str, list[str]]:
    owners: dict[str, set[str]] = defaultdict(set)
    for resource in actor_resources["resources"]:
        actor_code = resource["actorCode"]
        for message in resource["record"]["messages"]:
            voice_id = normalize_voice_id(message["voiceId"])
            owners[voice_id].add(actor_code)
    return {
        voice_id: sorted(actor_codes)
        for voice_id, actor_codes in sorted(owners.items())
    }


def classify_unreachable_localized_voices(
    actor_resources: dict[str, Any],
    body_routes: dict[str, Any],
    unmatched_voice_ids: set[str],
) -> list[dict[str, Any]]:
    """Identify missing localized records that native selectors never use."""
    routes_by_resource = {
        (
            resource["actorCode"],
            resource["afsEntryIndex"],
            resource.get("packageChildIndex", 0),
        ): resource
        for resource in body_routes["resources"]
    }
    occurrences: dict[str, list[dict[str, Any]]] = defaultdict(list)
    disqualified: set[str] = set()

    for resource in actor_resources["resources"]:
        messages = resource["record"]["messages"]
        is_localized = any(
            message.get("subtitleInventory") is not None
            for message in messages
        )
        resource_key = (
            resource["actorCode"],
            resource["afsEntryIndex"],
            resource.get("packageChildIndex", 0),
        )
        routes = routes_by_resource.get(resource_key)
        selected_indexes = (
            {
                selection["messageIndex"]
                for body in routes["bodies"]
                for group in body["graph"]["messageGroups"]
                for selection in group["messageSelections"]
            }
            if routes is not None
            else set()
        )
        for message in messages:
            voice_id = normalize_voice_id(message["voiceId"])
            if voice_id not in unmatched_voice_ids:
                continue
            if (
                not is_localized
                or routes is None
                or message["index"] in selected_indexes
            ):
                disqualified.add(voice_id)
                continue
            occurrences[voice_id].append(
                {
                    "actorCode": resource["actorCode"],
                    "actorLabel": resource["actorLabel"],
                    "afsEntryIndex": resource["afsEntryIndex"],
                    "packageChildIndex": resource.get(
                        "packageChildIndex", 0
                    ),
                    "messageIndex": message["index"],
                    "voicePath": resource["record"]["pathString"],
                    "sourceText": message["sourceText"],
                }
            )

    return [
        {
            "voiceId": voice_id,
            "reason": "unreferencedByNativeSelectorInLocalizedResource",
            "occurrences": matches,
        }
        for voice_id, matches in sorted(occurrences.items())
        if voice_id not in disqualified
    ]


def classify_fully_unlocalized_resources(
    actor_resources: dict[str, Any],
    unmatched_voice_ids: set[str],
) -> tuple[list[dict[str, Any]], set[str]]:
    """Classify resources whose complete authored voice set is unshipped."""
    resources = []
    voice_ids: set[str] = set()
    for resource in actor_resources["resources"]:
        messages = resource["record"]["messages"]
        resource_voice_ids = {
            normalize_voice_id(message["voiceId"])
            for message in messages
        }
        if (
            not resource_voice_ids
            or not resource_voice_ids.issubset(unmatched_voice_ids)
            or any(
                message.get("subtitleInventory") is not None
                for message in messages
            )
        ):
            continue
        voice_ids.update(resource_voice_ids)
        resources.append(
            {
                "actorCode": resource["actorCode"],
                "actorLabel": resource["actorLabel"],
                "afsEntryIndex": resource["afsEntryIndex"],
                "packageChildIndex": resource.get(
                    "packageChildIndex", 0
                ),
                "voicePath": resource["record"]["pathString"],
                "messageCount": len(messages),
                "uniqueVoiceIdCount": len(resource_voice_ids),
                "reason": "completeResourceAbsentFromLocalizedInventory",
            }
        )
    return resources, voice_ids


def inventory_voice_sources(
    inventory: dict[str, Any],
    wanted: set[str],
) -> dict[str, list[dict[str, Any]]]:
    sources: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple[int, str, str]] = set()
    for archive in inventory["archives"]:
        for subtitle in archive["subtitles"]:
            for record in subtitle["records"]:
                member = record.get("voiceMember")
                if not member:
                    continue
                voice_id = normalize_voice_id(member)
                if voice_id not in wanted:
                    continue
                key = (archive["disc"], archive["source"], member.upper())
                if key in seen:
                    continue
                seen.add(key)
                sources[voice_id].append(
                    {
                        "disc": archive["disc"],
                        "archivePath": archive["source"],
                        "archive": archive["archive"],
                        "member": member,
                        "subtitleMember": subtitle["member"],
                        "recordIndex": record["index"],
                        "speakerId": record["speakerId"],
                        "timingSha256": record["timingSha256"],
                    }
                )
    return {
        voice_id: sorted(
            matches,
            key=lambda item: (
                item["disc"],
                item["archive"],
                item["member"],
            ),
        )
        for voice_id, matches in sorted(sources.items())
    }


def hash_sources(
    sources: dict[str, list[dict[str, Any]]],
) -> dict[tuple[str, str], tuple[int, str]]:
    wanted_by_archive: dict[str, set[str]] = defaultdict(set)
    for matches in sources.values():
        for source in matches:
            wanted_by_archive[source["archivePath"]].add(
                source["member"].upper()
            )

    result: dict[tuple[str, str], tuple[int, str]] = {}
    for archive_name in sorted(wanted_by_archive):
        archive_path = Path(archive_name)
        wanted = wanted_by_archive[archive_name]
        with archive_path.open("rb") as stream:
            with mmap.mmap(
                stream.fileno(), 0, access=mmap.ACCESS_READ
            ) as data:
                members = {
                    member.name.upper(): member for member in parse_afs(data)
                }
                for member_name in sorted(wanted):
                    member = members.get(member_name)
                    if member is None:
                        raise ValueError(
                            f"{archive_path} has no member {member_name}"
                        )
                    payload = data[
                        member.offset : member.offset + member.size
                    ]
                    if len(payload) < 0x40 or payload[:4] != b"SPSD":
                        raise ValueError(
                            f"{archive_path}:{member.name} is not SPSD"
                        )
                    result[(archive_name, member_name)] = (
                        member.size,
                        hashlib.sha256(payload).hexdigest(),
                    )
    return result


def discover_voice_sources(
    inventory: dict[str, Any],
    wanted: set[str],
) -> tuple[
    dict[str, list[dict[str, Any]]],
    dict[tuple[str, str], tuple[int, str]],
]:
    """Find requested STR members directly, retaining exact SRF joins."""
    aligned = inventory_voice_sources(inventory, wanted)
    aligned_by_key = {
        (source["archivePath"], source["member"].upper()): source
        for matches in aligned.values()
        for source in matches
    }
    sources: dict[str, list[dict[str, Any]]] = defaultdict(list)
    source_hashes: dict[tuple[str, str], tuple[int, str]] = {}
    for archive in sorted(
        inventory["archives"],
        key=lambda item: (
            item["disc"],
            item["archive"],
            item["source"],
        ),
    ):
        archive_path = Path(archive["source"])
        with archive_path.open("rb") as stream:
            with mmap.mmap(
                stream.fileno(), 0, access=mmap.ACCESS_READ
            ) as data:
                for member in parse_afs(data):
                    if Path(member.name).suffix.upper() != ".STR":
                        continue
                    voice_id = normalize_voice_id(member.name)
                    if voice_id not in wanted:
                        continue
                    key = (archive["source"], member.name.upper())
                    payload = data[
                        member.offset : member.offset + member.size
                    ]
                    if len(payload) < 0x40 or payload[:4] != b"SPSD":
                        raise ValueError(
                            f"{archive_path}:{member.name} is not SPSD"
                        )
                    source_hashes[key] = (
                        member.size,
                        hashlib.sha256(payload).hexdigest(),
                    )
                    source = {
                        "disc": archive["disc"],
                        "archivePath": archive["source"],
                        "archive": archive["archive"],
                        "member": member.name,
                    }
                    exact_join = aligned_by_key.get(key)
                    if exact_join:
                        source.update(
                            {
                                field: exact_join[field]
                                for field in (
                                    "subtitleMember",
                                    "recordIndex",
                                    "speakerId",
                                    "timingSha256",
                                )
                            }
                        )
                    sources[voice_id].append(source)
    return (
        {
            voice_id: sorted(
                matches,
                key=lambda item: (
                    item["disc"],
                    item["archive"],
                    item["member"],
                ),
            )
            for voice_id, matches in sorted(sources.items())
        },
        source_hashes,
    )


def build_manifest(
    actor_resources: dict[str, Any],
    inventory: dict[str, Any],
    source_hashes: dict[tuple[str, str], tuple[int, str]],
    *,
    sources: dict[str, list[dict[str, Any]]] | None = None,
    body_routes: dict[str, Any] | None = None,
) -> dict[str, Any]:
    owners = actor_voice_owners(actor_resources)
    if sources is None:
        sources = inventory_voice_sources(inventory, set(owners))
    voices = []
    unmatched = []
    canonical_hashes: set[str] = set()
    native_lengths_by_hash: dict[str, int] = {}
    canonical_bytes = 0
    source_bytes = 0
    duplicate_occurrences = 0
    identical_duplicate_ids = 0
    variant_ids = []

    for voice_id, actor_codes in owners.items():
        matches = sources.get(voice_id, [])
        if not matches:
            unmatched.append(voice_id)
            continue
        by_hash: dict[str, dict[str, Any]] = {}
        for source in matches:
            key = (source["archivePath"], source["member"].upper())
            byte_length, sha256 = source_hashes[key]
            source_bytes += byte_length
            variant = by_hash.setdefault(
                sha256,
                {
                    "sha256": sha256,
                    "nativeByteLength": byte_length,
                    "sources": [],
                },
            )
            if variant["nativeByteLength"] != byte_length:
                raise ValueError(
                    f"SHA-256 length mismatch for {voice_id}: {sha256}"
                )
            previous_length = native_lengths_by_hash.setdefault(
                sha256, byte_length
            )
            if previous_length != byte_length:
                raise ValueError(
                    f"global SHA-256 length mismatch: {sha256}"
                )
            variant["sources"].append(source)
        variants = sorted(
            by_hash.values(),
            key=lambda item: (
                item["sources"][0]["disc"],
                item["sources"][0]["archive"],
                item["sha256"],
            ),
        )
        canonical = variants[0]
        canonical_bytes += canonical["nativeByteLength"]
        canonical_hashes.add(canonical["sha256"])
        duplicate_occurrences += len(matches) - 1
        if len(matches) > 1 and len(variants) == 1:
            identical_duplicate_ids += 1
        if len(variants) > 1:
            variant_ids.append(voice_id)
        voices.append(
            {
                "voiceId": voice_id,
                "actorCodes": actor_codes,
                "occurrenceCount": len(matches),
                "contentVariantCount": len(variants),
                "canonicalSha256": canonical["sha256"],
                "variants": variants,
            }
        )

    unreachable = (
        classify_unreachable_localized_voices(
            actor_resources,
            body_routes,
            set(unmatched),
        )
        if body_routes is not None
        else []
    )
    unreachable_ids = {
        record["voiceId"] for record in unreachable
    }
    unlocalized_resources, unlocalized_ids = (
        classify_fully_unlocalized_resources(
            actor_resources,
            set(unmatched),
        )
    )
    actionable_unmatched = [
        voice_id
        for voice_id in unmatched
        if (
            voice_id not in unreachable_ids
            and voice_id not in unlocalized_ids
        )
    ]

    return {
        "schema": "new-yokosuka-actor-dialogue-voice-sources-v1",
        "evidenceBoundary": [
            "Actor voice IDs come directly from native HUMANS.AFS SCNF "
            "message entries.",
            "Voice sources come directly from matching native STR member "
            "names in the all-disc AFS inventory. Subtitle metadata is "
            "retained only for exact ordered STR-to-SRF alignments.",
            "Content identity is the SHA-256 of the native SPSD member; "
            "same-name byte-different variants are never merged.",
            "Unmatched records are classified as unreachable only when "
            "their exact native selector never references the message "
            "index and sibling records prove the resource belongs to the "
            "localized shipped dialogue set.",
            "A missing voice is classified as belonging to an unlocalized "
            "resource only when every authored voice ID in that complete "
            "resource is absent from the all-disc localized inventory.",
        ],
        "summary": {
            "actorVoiceIdCount": len(owners),
            "matchedVoiceIdCount": len(voices),
            "unmatchedVoiceIdCount": len(unmatched),
            "unreachableUnmatchedVoiceIdCount": len(unreachable),
            "unlocalizedResourceUnmatchedVoiceIdCount": len(
                unlocalized_ids
            ),
            "actionableUnmatchedVoiceIdCount": len(actionable_unmatched),
            "sourceOccurrenceCount": sum(
                voice["occurrenceCount"] for voice in voices
            ),
            "duplicateSourceOccurrenceCount": duplicate_occurrences,
            "identicalDuplicateVoiceIdCount": identical_duplicate_ids,
            "contentVariantVoiceIdCount": len(variant_ids),
            "uniqueNativePayloadCount": len(canonical_hashes),
            "canonicalNativeByteLength": canonical_bytes,
            "contentAddressedNativeByteLength": sum(
                native_lengths_by_hash.values()
            ),
            "allSourceNativeByteLength": source_bytes,
        },
        "unmatchedVoiceIds": unmatched,
        "unreachableUnmatchedVoices": unreachable,
        "unlocalizedResources": unlocalized_resources,
        "contentVariantVoiceIds": variant_ids,
        "voices": voices,
    }


def compact_evidence(manifest: dict[str, Any]) -> dict[str, Any]:
    variants = [
        voice
        for voice in manifest["voices"]
        if voice["contentVariantCount"] > 1
    ]
    return {
        "schema": "new-yokosuka-dialogue-voice-source-evidence-v1",
        "evidenceBoundary": manifest["evidenceBoundary"],
        "summary": manifest["summary"],
        "unmatchedVoiceIds": manifest["unmatchedVoiceIds"],
        "unreachableUnmatchedVoices": manifest[
            "unreachableUnmatchedVoices"
        ],
        "unlocalizedResources": manifest["unlocalizedResources"],
        "contentVariants": variants,
        "fullReport": portable_project_path(DEFAULT_OUTPUT),
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=DEFAULT_INVENTORY)
    parser.add_argument("--actors", type=Path, default=DEFAULT_ACTORS)
    parser.add_argument(
        "--body-routes", type=Path, default=DEFAULT_BODY_ROUTES
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--evidence", type=Path, default=DEFAULT_EVIDENCE)
    args = parser.parse_args()

    inventory = json.loads(args.inventory.read_text())
    actors = json.loads(args.actors.read_text())
    body_routes = json.loads(args.body_routes.read_text())
    owners = actor_voice_owners(actors)
    sources, source_hashes = discover_voice_sources(
        inventory, set(owners)
    )
    manifest = build_manifest(
        actors,
        inventory,
        source_hashes,
        sources=sources,
        body_routes=body_routes,
    )
    write_json(args.output, manifest)
    evidence = compact_evidence(manifest)
    evidence["fullReport"] = portable_project_path(args.output)
    write_json(args.evidence, evidence)
    summary = manifest["summary"]
    print(
        f"Wrote {args.output}: {summary['matchedVoiceIdCount']}/"
        f"{summary['actorVoiceIdCount']} actor voice IDs matched, "
        f"{summary['actionableUnmatchedVoiceIdCount']} actionable gaps, "
        f"{summary['contentVariantVoiceIdCount']} content variants"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
