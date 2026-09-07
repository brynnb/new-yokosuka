#!/usr/bin/env python3
"""Prove secondary operation 0x0001 subcommand 5's nearest query."""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
OUTPUT = ROOT / "tools/evidence/secondary-operation-0001-nearest-descriptor-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
RANGES = {
    "commandHandler": (0x0C15DD4C, 322, "a0c6b8c022a0350cbc4d3be3240519b62b356e28ec62b74abf435bfb73bc21f0"),
    "nearestDescriptorQuery": (0x0C15F126, 124, "34eea7ff6deee383873e2a891769969e67daa4ba6cc2cedbd8670c6e1b101cbc"),
    "indirectIndexLookup": (0x0C15F018, 72, "974e1a773237af47fd6b6708ea1365bd68cc14f9bfffa21b00777ff2004a7d5b"),
    "squaredThreeVectorDistance": (0x0C0914C0, 28, "0299ea2ab026303da1876ef538b775135f61d56bbad949894c97040640e6fcbe"),
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    executable = EXECUTABLE.read_bytes()
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in RANGES.items():
        actual = digest(executable[address - BASE:address - BASE + size])
        if actual != expected:
            raise ValueError(f"secondary operation 0x0001 {name} changed")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }
    event_ir = json.loads(EVENT_IR.read_text())
    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if not (
                        action.get("kind") == "secondaryEngineOperation"
                        and action.get("operationId") == 1
                        and len(arguments) == 2
                        and arguments[0].get("kind") == "constant"
                        and arguments[0].get("value") == 5
                    ):
                        continue
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "targetKind": arguments[1].get("kind"),
                        "targetWords": arguments[1].get("staticWords"),
                        "hasResultTarget": "resultTarget" in action,
                    })
    target_counts = Counter(tuple(item["targetWords"] or []) for item in calls)
    expected_targets = {
        (0x40800000, 0x00000000, 0xC00CCCCD): 6,
        (0x4187AE14, 0x00000000, 0x3F970A3D): 6,
    }
    if (
        len(calls) != 12
        or Counter((item["disc"], item["area"]) for item in calls)
            != Counter({(1, "JOMO"): 4, (2, "JOMO"): 4, (3, "JOMO"): 4})
        or any(item["targetKind"] != "static-pointer" for item in calls)
        or target_counts != expected_targets
        or not all(item["hasResultTarget"] for item in calls)
    ):
        raise ValueError("secondary operation 0x0001 mode 5 inventory changed")
    report = {
        "schema": "new-yokosuka-secondary-operation-0001-nearest-descriptor-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "verifiedNativeRanges": verified,
        "operation": {
            "secondaryOperationId": 1,
            "subcommand": 5,
            "argumentCount": 2,
            "recordKey": 2,
            "recordVectorWordOffsets": [5, 6, 7],
            "distance": "float32 squared three-component Euclidean distance",
            "tieBehavior": "first descriptor wins because replacement is strictly less-than",
            "notFoundResult": -1,
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "resultConsumedCount": sum(item["hasResultTarget"] for item in calls),
            "callsByDisc": dict(sorted(Counter(
                str(item["disc"]) for item in calls
            ).items())),
            "targetVectors": [
                {"words": list(words), "callCount": count}
                for words, count in sorted(target_counts.items())
            ],
        },
        "evidenceBoundary": [
            "Only exact two-argument subcommand-5 calls with a complete static three-word target receive this semantic.",
            "Descriptor and key values remain numeric; no interaction-domain name is inferred.",
            "Missing exact room-manager vectors stop explicitly instead of using a guessed location.",
        ],
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {OUTPUT}: {len(calls)} proven calls")


if __name__ == "__main__":
    main()
