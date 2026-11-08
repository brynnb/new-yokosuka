#!/usr/bin/env python3
"""Extract single-area resident placements for approximate interior entries.

The full scheduled-actor research corpus is deliberately local/ignored. This
compact, reproducible subset carries the original operation addresses and
program hashes needed by build_browser_map_transitions.py.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/evidence/scheduled-actors.json"
OUTPUT = ROOT / "tools/evidence/interior-resident-anchors.json"


def main():
    raw = SOURCE.read_bytes()
    data = json.loads(raw)
    anchors = []
    for variant in data["variants"]:
        areas = variant.get("selectedAreas", [])
        if len(areas) != 1:
            continue
        area = areas[0]
        positions = {}
        for table in variant.get("scheduleTables", []):
            for entry in table.get("entries", []):
                descriptor = entry.get("descriptor", {})
                current_area = descriptor.get("initialArea")
                for operation in descriptor.get("operations", []):
                    if operation.get("operation") == 8:
                        current_area = operation.get("area")
                    position = operation.get("browserPosition")
                    if operation.get("operation") == 3 and current_area == area and position:
                        positions.setdefault(tuple(position), operation.get("address"))
        if positions:
            anchors.append({
                "area": area,
                "actor": variant["actorCode"],
                "programSha256": variant["programByteSha256"],
                "positions": [
                    {"position": list(position), "operationAddress": address}
                    for position, address in sorted(positions.items())
                ],
            })
    anchors.sort(key=lambda a: (a["area"], a["actor"], a["programSha256"]))
    header = {
        "schema": "new-yokosuka-interior-resident-anchors-v1",
        "source": "tools/evidence/scheduled-actors.json",
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "evidenceBoundary": "Original single-area resident operation 3 placements; not original player arrival positions.",
    }
    # One actor variant per line keeps this generated source reviewable.
    lines = ["{"] + [f"  {json.dumps(key)}: {json.dumps(value)}," for key, value in header.items()]
    lines.append('  "anchors": [')
    lines.extend("    " + json.dumps(anchor, separators=(",", ":")) + ("," if i < len(anchors) - 1 else "")
                 for i, anchor in enumerate(anchors))
    lines.extend(["  ]", "}", ""])
    OUTPUT.write_text("\n".join(lines))
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(anchors)} actor variants")


if __name__ == "__main__":
    main()
