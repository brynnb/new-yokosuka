#!/usr/bin/env python3
"""Compact source index for the story inventory; no new native decoding rules.

Reuses the verified conversation selector/body extractors. Entry markers are
addressable conversation branches, not a claim that each is a unique story beat.
The all-disc subtitle inventory supplies evidence for manually grouped events.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from tools.scripting.extract_dialogue_actor_body_routes import extract_resources
from tools.scripting.extract_dialogue_actor_resources import DEFAULT_HUMANS, HUMANS_SHA256

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "tools/evidence/shenmue1-story-event-sources.generated.json"


def build(humans_by_disc: dict[int, bytes], inventory: dict) -> dict:
    assert set(humans_by_disc) == {1, 2, 3}, "All three HUMANS copies must be checked"
    for disc, data in humans_by_disc.items():
        assert hashlib.sha256(data).hexdigest() == HUMANS_SHA256, f"Unexpected disc {disc} HUMANS.AFS"
    humans = humans_by_disc[1]
    unique = {}
    physical_entries = 0
    for resource in extract_resources(humans):
        physical_entries += len(resource["bodies"])
        key = (resource["actorCode"], resource["resourceSha256"])
        if key in unique:
            unique[key]["archiveCopies"].append(resource["afsEntryIndex"])
            continue
        entries = []
        for body in resource["bodies"]:
            graph = body["graph"]
            entries.append({
                "marker": body["markerOffset"], "body": graph["bodyOffset"],
                "predicates": body["incomingExpressionIds"],
                "messages": sorted({selection["messageIndex"]
                    for group in graph["messageGroups"] for selection in group["messageSelections"]}),
                "dynamicBoundaries": graph["dynamicBoundaryCount"],
                "terminations": sorted({t["kind"] for t in graph["terminations"]}),
                "nestedBoundaries": sorted({t["kind"] for group in graph["messageGroups"]
                    for t in group["outerReturns"]
                    if t["kind"].startswith("unsupported") or t["kind"] == "dynamicContinuation"}),
            })
        unique[key] = {"actor": resource["actorCode"], "sha256": resource["resourceSha256"],
                       "archiveCopies": [resource["afsEntryIndex"]], "entries": entries}

    # Preserve differing texts rather than silently choosing the first disc.
    voices = {}
    for archive in inventory["archives"]:
        if archive["scene"] != "STREAM":
            continue
        for subtitle in archive["subtitles"]:
            if not subtitle.get("exactVoiceAlignment"):
                continue
            for record in subtitle["records"]:
                if not record.get("voiceMember") or not record.get("displayText", "").strip():
                    continue
                voice = Path(record["voiceMember"]).stem.upper()
                text = " ".join(record["displayText"].split())
                variants = voices.setdefault(voice, [])
                variant = next((v for v in variants if v["text"] == text), None)
                if variant is None:
                    variant = {"text": text, "sources": []}
                    variants.append(variant)
                source = [archive["disc"], archive["archive"], subtitle["sha256"], record["index"]]
                if source not in variant["sources"]:
                    variant["sources"].append(source)
    # Only retain source text needed by maintained expansion evidence. Ordinary
    # actor messages already live in the runtime catalog and are not duplicated.
    master = json.loads((ROOT / "tools/data/shenmue1-story-event-master.json").read_text())
    needed = {voice for section in master.get("expansions", {}).values()
              for event in section.get("events", []) for voice in event.get("voices", [])}
    missing = needed - voices.keys()
    assert not missing, f"Missing exact subtitle evidence: {sorted(missing)}"
    return {"schema": "shenmue1-story-event-sources-v1", "humansSha256": HUMANS_SHA256,
            "identicalHumansDiscs": sorted(humans_by_disc),
            "voiceSourceFields": ["disc", "archive", "subtitleSha256", "recordIndex"],
            "decoder": "tools/scripting/extract_dialogue_actor_body_routes.py",
            "summary": {"physicalConversationEntries": physical_entries,
                        "uniqueResources": len(unique),
                        "uniqueConversationEntries": sum(len(r["entries"]) for r in unique.values()),
                        "referencedVoices": len(needed)},
            "resources": list(unique.values()),
            "voices": {key: voices[key] for key in sorted(needed)}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--humans", type=Path, default=DEFAULT_HUMANS)
    parser.add_argument("--disc2-humans", type=Path,
                        default=ROOT / "extracted_disc2_v2/data/SCENE/02/STREAM/HUMANS.AFS")
    parser.add_argument("--disc3-humans", type=Path,
                        default=ROOT / "extracted_disc3_v2/data/SCENE/03/STREAM/HUMANS.AFS")
    parser.add_argument("--inventory", type=Path, default=ROOT / ".disc-work/dialogue/inventory.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = build({1: args.humans.read_bytes(), 2: args.disc2_humans.read_bytes(),
                    3: args.disc3_humans.read_bytes()}, json.loads(args.inventory.read_text()))
    content = json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n"
    if args.check:
        assert OUTPUT.read_text() == content, "Story event source index needs regeneration"
    else:
        OUTPUT.write_text(content)
    print(json.dumps(result["summary"]))


if __name__ == "__main__":
    main()
