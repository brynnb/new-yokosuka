#!/usr/bin/env python3
"""Prove scripted signed-angle-to-degree division call shapes."""

from __future__ import annotations

import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

from tools.scripting.extract_sh4_object_transforms import disassemble
from tools.scripting.native_event_dataflow import (
    SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE,
    indirect_call_json,
)


ROOT = Path(__file__).resolve().parents[3]
CONTROL_FLOW = ROOT / ".disc-work/dialogue/scripted-event-control-flow-index.json"
OUTPUT = ROOT / "tools/evidence/signed-angle-division-evidence.json"


def helper_digest(rows: dict[int, tuple], target: int) -> str:
    serialized = "\n".join(
        f"{relative:04x}\t{rows[target + relative][1]}\t"
        f"{rows[target + relative][2]}"
        for relative in sorted(SIGNED_ANGLE_DIFFERENCE_HELPER_SIGNATURE)
    )
    return hashlib.sha256(serialized.encode()).hexdigest()


def main() -> None:
    objdump = shutil.which("sh4-linux-gnu-objdump")
    if objdump is None:
        raise SystemExit("sh4-linux-gnu-objdump is required")
    control_flow = json.loads(CONTROL_FLOW.read_text())
    candidates = []
    for source_map in control_flow["maps"]:
        for function in source_map["scriptedEventFunctions"]:
            for call in function["indirectCalls"]:
                arithmetic = call.get("integerArithmetic")
                arguments = arithmetic.get("arguments", []) if arithmetic else []
                if not (
                    call.get("targetSource", {}).get("baseRegister") == "r8"
                    and call.get("targetSource", {}).get("byteOffset") == 0x14
                    and len(arguments) == 2
                    and arguments[0].get("kind") == "runtime"
                    and str(arguments[0].get("source", "")).startswith("sts at ")
                    and arguments[1].get("kind") == "constant"
                    and arguments[1].get("value") == 65536
                ):
                    continue
                candidates.append((source_map, function, call))

    rows_by_source = {}
    proven = []
    unmatched = []
    for source_map, function, call in candidates:
        source = source_map["source"]
        if source not in rows_by_source:
            rows_by_source[source] = {
                row[0]: row for row in disassemble(Path(source), objdump)
            }
        rows = rows_by_source[source]
        recovered = indirect_call_json(
            int(call["callFileOffset"], 16),
            call["operands"],
            rows,
            0,
        )["integerArithmetic"]
        dividend = recovered["arguments"][0]
        difference = dividend.get("right", {})
        if not (
            dividend.get("kind") == "integer-expression"
            and dividend.get("operator") == "multiply-low"
            and dividend.get("left", {}).get("value") == 360
            and difference.get("kind") == "integer-expression"
            and difference.get("operator") == "signed-binary-angle-difference"
            and difference.get("left", {}).get("kind") == "frame-field"
            and difference.get("left", {}).get("offset") == 52
            and difference.get("right", {}).get("kind") == "frame-field"
            and difference.get("right", {}).get("offset") == 16
        ):
            unmatched.append({
                "disc": source_map["disc"],
                "area": source_map["area"],
                "functionFileOffset": function["fileOffset"],
                "callFileOffset": call["callFileOffset"],
                "recoveredDividend": dividend,
            })
            continue
        helper_call = int(difference["source"], 16)
        target_load = rows[helper_call - 2]
        displacement = target_load[3] & 0xffffffff
        if displacement & 0x80000000:
            displacement -= 0x100000000
        helper_target = helper_call + 4 + displacement
        proven.append({
            "disc": source_map["disc"],
            "area": source_map["area"],
            "functionFileOffset": function["fileOffset"],
            "callFileOffset": call["callFileOffset"],
            "helperFileOffset": f"0x{helper_target:x}",
            "helperSignatureSha256": helper_digest(rows, helper_target),
        })

    if len(proven) != 96 or len(candidates) != 99 or len(unmatched) != 3:
        raise ValueError(
            f"signed-angle division inventory changed: "
            f"{len(proven)} proven of {len(candidates)} candidates"
        )
    signature_counts = Counter(
        item["helperSignatureSha256"] for item in proven
    )
    if len(signature_counts) != 1:
        raise ValueError("signed-angle helper signatures diverged")
    report = {
        "schema": "new-yokosuka-signed-angle-division-evidence-v1",
        "status": "exact-local-helper-and-all-disc-inventory",
        "source": {
            "controlFlow": ".disc-work/dialogue/scripted-event-control-flow-index.json",
            "mapinfoPrograms": len(control_flow["maps"]),
        },
        "nativeSemantics": {
            "helper": "shorter low-word difference right - left",
            "halfTurnTie": 0x8000,
            "conversion": "signedDifference * 360 / 65536",
            "arithmetic": "SH-4 low-dword multiply followed by signed division",
            "helperSignatureSha256": next(iter(signature_counts)),
        },
        "allDiscInventory": {
            "authoredCallCount": len(proven),
            "broaderStsCandidateCount": len(candidates),
            "callsByDisc": dict(sorted(Counter(
                str(item["disc"]) for item in proven
            ).items())),
            "callsByArea": dict(sorted(Counter(
                item["area"] for item in proven
            ).items())),
            "calls": proven,
            "unmatchedStsCandidates": unmatched,
        },
        "evidenceBoundary": [
            "Only BSRF targets matching the complete structural helper signature receive the signed-angle expression.",
            "Both helper operands must resolve through the ordinary exact integer-expression dataflow.",
            "Other helper returns and other STS/MACL producers remain unresolved.",
        ],
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Wrote {OUTPUT}: {len(proven)} proven calls")


if __name__ == "__main__":
    main()
