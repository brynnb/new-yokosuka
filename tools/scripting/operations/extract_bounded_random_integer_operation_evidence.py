#!/usr/bin/env python3
"""Verify proven operation-0x004f numeric conversion modes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = (
    PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
)
DEFAULT_EVENT_IR = (
    PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
)
DEFAULT_OUTPUT = (
    PROJECT_ROOT
    / "tools/evidence/bounded-random-integer-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
HANDLER_ADDRESS = 0x0C1733A0
HANDLER_LENGTH = 166
HANDLER_SHA256 = (
    "d940c91c3bcf45fc030c586de5b385e95e950c03b84814b3a72bc1f266a659e3"
)
MODE_FIVE_HELPERS = {
    "binaryAngleRatio": (
        0x0C0914F0,
        240,
        "22d44d268b24b4dd46fd054fc8d86f00024e814e3dc50459994382c33f37dd8b",
    ),
    "binaryAngleFloatPair": (
        0x0C0915E0,
        132,
        "2f025d2a26785ea167b85eefbec9494a2b487c15d337703c4fa74e52ba90c350",
    ),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def runtime_slice(data: bytes, address: int, size: int) -> bytes:
    start = address - RUNTIME_BASE
    if start < 0 or start + size > len(data):
        raise ValueError(f"runtime range 0x{address:08x}+{size} is unavailable")
    return data[start:start + size]


def u32(data: bytes, address: int) -> int:
    return struct.unpack("<I", runtime_slice(data, address, 4))[0]


def mode_calls(
    event_ir: dict[str, Any],
    mode: int,
) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action["kind"] != "engineOperation"
                        or action["operationId"] != 79
                        or not action["arguments"]
                        or action["arguments"][0].get("kind") != "constant"
                        or action["arguments"][0].get("value") != mode
                    ):
                        continue
                    detail = {
                        "disc": item["disc"],
                        "area": item["area"],
                        "functionFileOffset": function["id"],
                        "callFileOffset": action["callFileOffset"],
                        "boundArgument": action["arguments"][1],
                    }
                    if len(action["arguments"]) > 2:
                        detail["secondArgument"] = action["arguments"][2]
                    calls.append(detail)
    return calls


def mode_six_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    return mode_calls(event_ir, 6)


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    handler = runtime_slice(
        executable,
        HANDLER_ADDRESS,
        HANDLER_LENGTH,
    )
    if sha256(handler) != HANDLER_SHA256:
        raise ValueError("operation-0x004f handler changed")
    verified_helpers = {}
    for name, (address, length, expected_hash) in MODE_FIVE_HELPERS.items():
        if sha256(runtime_slice(executable, address, length)) != expected_hash:
            raise ValueError(f"operation-0x004f {name} helper changed")
        verified_helpers[name] = {
            "address": f"0x{address:08x}",
            "length": length,
            "sha256": expected_hash,
        }

    output_writer = u32(executable, 0x0C173478)
    shared_random = u32(executable, 0x0C17348C)
    if output_writer != 0x0C0BB342:
        raise ValueError("operation-0x004f output writer changed")
    if shared_random != 0x0C1CE210:
        raise ValueError("operation-0x004f random source changed")

    mode_four = mode_calls(event_ir, 4)
    mode_five = mode_calls(event_ir, 5)
    mode_six = mode_calls(event_ir, 6)
    if len(mode_four) != 804:
        raise ValueError(
            "expected 804 operation-0x004f mode-4 calls, "
            f"found {len(mode_four)}"
        )
    if len(mode_five) != 300:
        raise ValueError(
            "expected 300 operation-0x004f mode-5 calls, "
            f"found {len(mode_five)}"
        )
    if len(mode_six) != 248:
        raise ValueError(
            "expected 248 operation-0x004f mode-6 calls, "
            f"found {len(mode_six)}"
        )
    return {
        "schema": "new-yokosuka-operation-004f-numeric-evidence-v3",
        "status": "exact-native-handler-mode-and-all-disc-call-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 79,
            "operationHex": "0x004f",
            "handlerAddress": "0x0c1733a0",
            "handlerLength": HANDLER_LENGTH,
            "handlerSha256": HANDLER_SHA256,
            "mode": 6,
            "sharedRandomFunction": "0x0c1ce210",
            "outputWriterFunction": "0x0c0bb342",
            "provenBehavior": (
                "Calls the shared native random source, multiplies its "
                "unit-range result by argument one, truncates the result to "
                "an integer, and writes that integer as the operation result."
            ),
            "range": (
                "For a positive integer bound N, the result is an integer "
                "from zero through N-1."
            ),
        },
        "floatToIntegerTruncation": {
            "operationId": 79,
            "operationHex": "0x004f",
            "handlerAddress": "0x0c1733a0",
            "mode": 4,
            "inputArgument": 1,
            "outputWriterFunction": "0x0c0bb342",
            "nativeInstructions": [
                "fmov @r14,fr3",
                "ftrc fr3,fpul",
                "sts fpul,r5",
            ],
            "provenBehavior": (
                "Loads argument one as a single-precision float, applies the "
                "SH-4 FTRC conversion toward zero, and writes the resulting "
                "signed 32-bit integer as the operation result."
            ),
        },
        "binaryAngleFromFloatPair": {
            "operationId": 79,
            "operationHex": "0x004f",
            "handlerAddress": "0x0c1733a0",
            "mode": 5,
            "inputArguments": [1, 2],
            "outputWidthBits": 16,
            "verifiedHelpers": verified_helpers,
            "provenBehavior": (
                "Negates both float32 inputs, selects one of four exact "
                "quadrant paths, evaluates the ratio through helper "
                "0x0c0914f0's float32 continued-fraction approximation, "
                "and returns the resulting low-16-bit binary angle."
            ),
        },
        "allDiscInventory": {
            "callCount": len(mode_six),
            "discCounts": dict(sorted(Counter(
                str(call["disc"])
                for call in mode_six
            ).items())),
            "areaCount": len({call["area"] for call in mode_six}),
            "boundArgumentKindCounts": dict(sorted(Counter(
                call["boundArgument"]["kind"]
                for call in mode_six
            ).items())),
            "calls": mode_six,
        },
        "modeFourAllDiscInventory": {
            "callCount": len(mode_four),
            "discCounts": dict(sorted(Counter(
                str(call["disc"])
                for call in mode_four
            ).items())),
            "areaCount": len({call["area"] for call in mode_four}),
            "inputArgumentKindCounts": dict(sorted(Counter(
                call["boundArgument"]["kind"]
                for call in mode_four
            ).items())),
            "calls": mode_four,
        },
        "modeFiveAllDiscInventory": {
            "callCount": len(mode_five),
            "discCounts": dict(sorted(Counter(
                str(call["disc"])
                for call in mode_five
            ).items())),
            "areaCount": len({call["area"] for call in mode_five}),
            "inputArgumentKindPairs": {
                "/".join(kinds): count
                for kinds, count in sorted(Counter(
                    (
                        call["boundArgument"]["kind"],
                        call["secondArgument"]["kind"],
                    )
                    for call in mode_five
                ).items())
            },
            "calls": mode_five,
        },
        "evidenceBoundary": [
            (
                "Only operation 0x004f modes 4 and 6 receive the semantics "
                "proved by this report."
            ),
            (
                "Modes 0 through 3 remain unresolved by this "
                "report."
            ),
            (
                "The native random sequence and story-level meaning of each "
                "choice remain outside this low-level operation contract."
            ),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", type=Path, default=DEFAULT_EXECUTABLE)
    parser.add_argument("--event-ir", type=Path, default=DEFAULT_EVENT_IR)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    report = build_report(
        args.executable.read_bytes(),
        json.loads(args.event_ir.read_text()),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Wrote {args.out}: "
        f"{report['modeFourAllDiscInventory']['callCount']} mode-4 and "
        f"{report['modeFiveAllDiscInventory']['callCount']} mode-5 and "
        f"{report['allDiscInventory']['callCount']} mode-6 calls"
    )


if __name__ == "__main__":
    main()
