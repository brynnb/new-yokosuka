#!/usr/bin/env python3
"""Prove secondary operation 0x0001 subcommand 3's indirect lookup."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_MANAGER = ROOT / ".disc-work/dialogue/native-interaction-manager.json"
DEFAULT_OUTPUT = ROOT / "tools/evidence/secondary-operation-0001-mode3-evidence.json"
BASE = 0x0C010000
EXECUTABLE_SHA256 = "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
HANDLER = (0x0C15DD4C, 322, "a0c6b8c022a0350cbc4d3be3240519b62b356e28ec62b74abf435bfb73bc21f0")
HELPER = (0x0C15F018, 72, "974e1a773237af47fd6b6708ea1365bd68cc14f9bfffa21b00777ff2004a7d5b")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - BASE
    if start < 0 or start + size > len(data):
        raise ValueError("secondary operation 0x0001 mode-3 range unavailable")
    return data[start:start + size]


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
    manager: dict[str, Any],
) -> dict[str, Any]:
    if digest(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    verified = {}
    for name, (address, size, expected) in {
        "commandHandler": HANDLER,
        "indirectIndexLookup": HELPER,
    }.items():
        actual = digest(runtime_slice(executable, address, size))
        if actual != expected:
            raise ValueError(f"secondary operation 0x0001 mode-3 {name} changed")
        verified[name] = {
            "runtimeAddress": f"0x{address:08x}",
            "size": size,
            "sha256": actual,
        }
    if manager.get("schema") != "new-yokosuka-dialogue-native-interaction-manager-v1":
        raise ValueError("unexpected native interaction-manager report")
    if manager["summary"]["registrationCount"] != 96:
        raise ValueError("native interaction-manager corpus changed")

    calls = []
    for source_map in event_ir["maps"]:
        for function in source_map["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    arguments = action.get("arguments", [])
                    if not (
                        action.get("kind") == "secondaryEngineOperation"
                        and action.get("operationId") == 1
                        and len(arguments) == 3
                        and arguments[0].get("kind") == "constant"
                        and arguments[0].get("value") == 3
                    ):
                        continue
                    calls.append({
                        "disc": source_map["disc"],
                        "area": source_map["area"],
                        "descriptorKind": arguments[1].get("kind"),
                        "descriptorValue": arguments[1].get("value"),
                        "descriptorOffset": arguments[1].get("offset"),
                        "keyKind": arguments[2].get("kind"),
                        "keyValue": arguments[2].get("value"),
                        "hasResultTarget": "resultTarget" in action,
                    })
    shapes = Counter((
        item["descriptorKind"], item["descriptorValue"],
        item["descriptorOffset"], item["keyKind"], item["keyValue"],
    ) for item in calls)
    expected_shapes = {
        ("runtime", None, None, "constant", 2): 297,
        ("runtime", None, None, "constant", 1): 96,
        ("frame-field", None, 0, "constant", 2): 3,
        **{
            ("constant", index, None, "constant", 2): 9
            for index in (0, 2, 3, 4, 5, 6, 7, 10, 11, 13)
        },
    }
    if len(calls) != 486 or shapes != expected_shapes:
        raise ValueError("secondary operation 0x0001 mode-3 inventory changed")
    if not all(item["hasResultTarget"] for item in calls):
        raise ValueError("secondary operation 0x0001 mode-3 result use changed")
    areas = Counter((item["disc"], item["area"]) for item in calls)
    return {
        "schema": "new-yokosuka-secondary-operation-0001-mode3-evidence-v1",
        "status": "exact-native-handler-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
            "interactionManager": ".disc-work/dialogue/native-interaction-manager.json",
        },
        "verifiedNativeRanges": verified,
        "operation": {
            "secondaryOperationId": 1,
            "subcommand": 3,
            "argumentCount": 3,
            "descriptorSizeBytes": 52,
            "indirectIndexElementSizeBytes": 4,
            "indirectRecordSizeBytes": 36,
            "indirectRecordKeyOffset": 0,
            "notFoundResult": -1,
            "provenBehavior": (
                "Uses argument one as a descriptor index, follows the "
                "descriptor word-zero sequence until 0xffffffff, and returns "
                "the first sequence value whose 36-byte record word zero "
                "equals argument two; otherwise returns -1."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "resultConsumedCount": sum(item["hasResultTarget"] for item in calls),
            "areaCount": len(areas),
            "callsByDisc": {
                str(disc): sum(count for (item_disc, _), count in areas.items() if item_disc == disc)
                for disc in sorted({disc for disc, _ in areas})
            },
            "descriptorOperandKinds": dict(sorted(Counter(
                item["descriptorKind"] for item in calls
            ).items())),
            "keyValues": {
                str(key): count
                for key, count in sorted(Counter(item["keyValue"] for item in calls).items())
            },
        },
        "managerCorpus": {
            "registrationCount": manager["summary"]["registrationCount"],
            "descriptorRecordCount": manager["summary"]["descriptorRecordCount"],
            "indirectReferenceCount": manager["summary"]["indirectReferenceCount"],
        },
        "evidenceBoundary": [
            "Only secondary operation 0x0001 with exact constant subcommand 3 and three arguments receives this semantic.",
            "Descriptor and record gameplay meanings remain numeric; the runtime preserves the native first-match index result.",
            "The exact room manager tables are mandatory runtime configuration and missing configuration must stop explicitly.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--manager", type=Path, default=DEFAULT_MANAGER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
        json.loads(args.manager.read_text()),
    )
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {args.output}: {report['allDiscInventory']['authoredCallCount']} calls")


if __name__ == "__main__":
    main()
