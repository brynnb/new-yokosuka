#!/usr/bin/env python3
"""Extract the exact four DNOZ activity callbacks from the canonical native IR."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / ".disc-work/dialogue/native-event-ir.json"
OUTPUT = ROOT / "tools/evidence/dnoz-dedicated-native-callback-ir.json"
CALLBACKS = ("0xb34", "0xd18", "0x13e0", "0x1628")


def main():
    corpus = json.loads(SOURCE.read_text())
    area = next(item for item in corpus["maps"] if item["disc"] == 1 and item["area"] == "DNOZ")
    by_id = {item["id"]: item for item in area["functions"]}
    functions = [by_id[item] for item in CALLBACKS]
    document = {
        "schema": "new-yokosuka-dnoz-dedicated-callback-ir-v1",
        "generatedBy": "tools/cutscenes/extract_dnoz_dedicated_callback_ir.py",
        "source": {
            "disc": 1,
            "area": "DNOZ",
            "mapinfoSha256": area["mapinfoSha256"],
            "ownerFunction": "0x1d74",
        },
        "functions": functions,
    }
    OUTPUT.write_text(json.dumps(document, indent=2) + "\n")


if __name__ == "__main__":
    main()
