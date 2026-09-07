#!/usr/bin/env python3
"""Build the compact browser pack for exact native interaction lookups."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / ".disc-work/dialogue/native-interaction-manager.json"
DEFAULT_OUTPUT = ROOT / "play/data/events/nativeInteractionManagers.generated.json"
INPUT_SCHEMA = "new-yokosuka-dialogue-native-interaction-manager-v1"
OUTPUT_SCHEMA = "new-yokosuka-native-interaction-manager-pack-v2"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def compact_registration(entry: dict[str, Any]) -> dict[str, Any]:
    identity = f"{entry['disc']}:{entry['area']}:{entry['mapinfoSha256']}"
    return {
        "id": identity,
        "disc": entry["disc"],
        "area": entry["area"],
        "mapinfoSha256": entry["mapinfoSha256"],
        "setupFunction": entry["setupFunction"],
        "callFileOffset": entry["callFileOffset"],
        "descriptorSequences": [
            descriptor["indirectRecordIndices"]
            for descriptor in entry["descriptorTable"]["records"]
        ],
        "indirectRecords": [
            {
                "index": record["index"],
                "key": record["words"][0],
                "vectorWords": record["words"][5:8],
            }
            for record in entry["indirectRecordTable"]["records"]
        ],
    }


def build_pack(report: dict[str, Any], source_sha256: str) -> dict[str, Any]:
    if report.get("schema") != INPUT_SCHEMA:
        raise ValueError("unexpected native interaction-manager report")
    managers = sorted(
        (compact_registration(entry) for entry in report["registrations"]),
        key=lambda item: (item["disc"], item["area"], item["mapinfoSha256"]),
    )
    identities = [manager["id"] for manager in managers]
    if len(identities) != len(set(identities)):
        raise ValueError("duplicate native interaction-manager identity")
    descriptor_count = sum(len(item["descriptorSequences"]) for item in managers)
    reference_count = sum(
        len(sequence)
        for item in managers
        for sequence in item["descriptorSequences"]
    )
    if descriptor_count != report["summary"]["descriptorRecordCount"]:
        raise ValueError("native interaction-manager descriptor count changed")
    if reference_count != report["summary"]["indirectReferenceCount"]:
        raise ValueError("native interaction-manager reference count changed")
    return {
        "schema": OUTPUT_SCHEMA,
        "generatedFrom": {
            "schema": INPUT_SCHEMA,
            "sha256": source_sha256,
            "evidence": "tools/evidence/dialogue-native-interaction-manager.json",
        },
        "evidenceBoundary": [
            "This pack retains only exact descriptor-to-index sequences plus record key and three-vector words consumed by secondary operation 0x0001 subcommands 3 and 5.",
            "It contains no copied MAPINFO payloads and assigns no gameplay meaning to numeric descriptors or keys.",
            "Managers are keyed by disc, area, and MAPINFO SHA-256; area-only fallback is forbidden.",
        ],
        "summary": {
            "managerCount": len(managers),
            "descriptorCount": descriptor_count,
            "indirectReferenceCount": reference_count,
        },
        "managers": managers,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = args.input.read_bytes()
    pack = build_pack(json.loads(source), digest(source))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(pack, separators=(",", ":"), sort_keys=False) + "\n"
    )
    print(
        f"Wrote {args.output}: {pack['summary']['managerCount']} managers, "
        f"{pack['summary']['descriptorCount']} descriptors"
    )


if __name__ == "__main__":
    main()
