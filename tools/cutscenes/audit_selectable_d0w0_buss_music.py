#!/usr/bin/env python3
"""Classify selectable D0W0/BUSS music at reviewed native owner boundaries."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IR_PATH = ROOT / ".disc-work/dialogue/native-event-ir.json"
OUTPUT = ROOT / "tools/evidence/selectable-d0w0-buss-music.json"


def command_hex(word):
    return (word & 0xFFFFFFFF).to_bytes(4, "little").hex()


ir = json.loads(IR_PATH.read_text(encoding="utf-8"))
d000 = next(item for item in ir["maps"] if item["disc"] == 1 and item["area"] == "D000")
if d000["mapinfoSha256"] != "7712f3ae8c9e154b3831bc8d8af31ebc135f35d930ae50c503a65e3af34e9b7e":
    raise RuntimeError("the exact Disc 1 D000 program is unavailable")
functions = {item["id"]: item for item in d000["functions"]}


def actions(function_id):
    return [
        action
        for block in functions[function_id]["blocks"]
        for action in block.get("actions", [])
    ]


def sound_calls(function_id):
    return [
        {
            "callFileOffset": action["callFileOffset"],
            "commandHex": command_hex(action["arguments"][0]["value"]),
            "exactArguments": [value["value"] for value in action["arguments"][1:]],
        }
        for action in actions(function_id)
        if action.get("semanticId") == "sound-command-dispatch"
    ]


def direct_calls(function_id):
    return [
        {
            "callFileOffset": action["callFileOffset"],
            "targetFileOffset": action["targetFileOffset"],
        }
        for action in actions(function_id)
        if action["kind"] == "directCall"
    ]


def exact(actual, expected, label):
    if actual != expected:
        raise RuntimeError(f"{label} changed")
    return actual


d0w0_owner_sounds = exact(sound_calls("0x5a900"), [], "D0W0 activity owner audio")
exact(
    [item for item in direct_calls("0x5b904") if item["targetFileOffset"] in {"0x5a900", "0x6126c", "0x5b330"}],
    [
        {"callFileOffset": "0x5b922", "targetFileOffset": "0x5a900"},
        {"callFileOffset": "0x5b928", "targetFileOffset": "0x6126c"},
        {"callFileOffset": "0x5b92e", "targetFileOffset": "0x5b330"},
    ],
    "D0W0 wrapper order",
)
d0w0_room_audio = [
    item for function_id in ["0x6126c", "0x5b330"] for item in sound_calls(function_id)
    if item["commandHex"] in {"a83f0000", "a0040000"}
]
exact(d0w0_room_audio, [
    {"callFileOffset": "0x61378", "commandHex": "a83f0000", "exactArguments": [0, 0]},
    {"callFileOffset": "0x61390", "commandHex": "a0040000", "exactArguments": [2, 100]},
    {"callFileOffset": "0x5b83c", "commandHex": "a83f0000", "exactArguments": [0, 0]},
    {"callFileOffset": "0x5b854", "commandHex": "a0040000", "exactArguments": [2, 100]},
], "D0W0 room audio controls")

buss_owner_sounds = exact(sound_calls("0x6e1a0"), [
    {"callFileOffset": "0x6e672", "commandHex": "a00a0000", "exactArguments": [1, 30]},
    {"callFileOffset": "0x6e68a", "commandHex": "a00a0000", "exactArguments": [2, 30]},
    {"callFileOffset": "0x6e6a2", "commandHex": "a00a0000", "exactArguments": [3, 30]},
], "BUSS owner audio controls")
buss_effect_calls = [item for function_id in ["0x6c30c", "0x6c60c"] for item in sound_calls(function_id)]
if len(buss_effect_calls) != 4 or not all(item["commandHex"].startswith("a9") for item in buss_effect_calls):
    raise RuntimeError("BUSS exact effect callbacks changed")
exact(sound_calls("0x6d9b4"), [], "BUSS boarding caller music")
arrival = {item["callFileOffset"]: item for item in actions("0x8d548")}
if (
    arrival["0x8dc04"].get("targetFileOffset") != "0x6e1a0"
    or arrival["0x8dc32"].get("semanticId") != "sound-command-dispatch"
    or arrival["0x8dc32"]["arguments"][0]["value"] != 0x3FA8
):
    raise RuntimeError("BUSS post-arrival room-audio boundary changed")

variants = [
    {
        "selectorId": f"S1-D0W0-{index + 1:02d}",
        "resource": "D0W0",
        "activitySlot": index + 4,
        "classification": "ambient-room-inheritance",
        "evidence": "the activity owner has no sound-dispatch call; room audio control belongs to the wrapper before/after the selected conversation",
    }
    for index in range(12)
] + [
    {
        "selectorId": f"S1-BUSS-{index + 1:02d}",
        "resource": "BUSS",
        "activitySlot": 16 if index < 2 else 17,
        "classification": "authored-silence",
        "evidence": (
            "the boarding caller and BUSS owner contain no explicit BGM command; owner audio is bus SFX/control only"
            if index < 2 else
            "the BUSS owner contains bus SFX/control only and the caller resumes room audio only after the arrival owner returns"
        ),
    }
    for index in range(4)
]
report = {
    "schema": "new-yokosuka-selectable-d0w0-buss-music-v1",
    "generatedBy": "tools/cutscenes/audit_selectable_d0w0_buss_music.py",
    "evidenceBoundary": [
        "Only the reviewed D0W0 and BUSS owner, wrapper, and callback functions are classified.",
        "A room-level A83F control with no proven track identity is not promoted to an explicit browser BGM binding.",
        "AUTH A904 bus/Yamagishi events and A00A/A004 controls are sound effects or control commands, not evidence of a music track.",
    ],
    "source": {
        "path": ".disc-work/dialogue/native-event-ir.json",
        "sha256": hashlib.sha256(IR_PATH.read_bytes()).hexdigest(),
        "mapinfoSha256": d000["mapinfoSha256"],
    },
    "summary": {
        "selectorEntryCount": len(variants),
        "explicitBgmCount": 0,
        "ambientRoomInheritanceCount": 12,
        "authoredSilenceCount": 4,
    },
    "ownerEvidence": {
        "d0w0": {"activityOwner": "0x5a900", "ownerSoundCalls": d0w0_owner_sounds, "roomAudioCalls": d0w0_room_audio},
        "buss": {
            "activityOwner": "0x6e1a0",
            "ownerSoundCalls": buss_owner_sounds,
            "effectCallbackCalls": buss_effect_calls,
            "postArrivalRoomResume": {"ownerCall": "0x8dc04", "roomAudioCall": "0x8dc32", "commandHex": "a83f0000"},
        },
    },
    "variants": variants,
}
OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {OUTPUT.relative_to(ROOT)}: {len(variants)} classified entries")
