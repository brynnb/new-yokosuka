#!/usr/bin/env python3
"""Verify operation 0x0116 selectors 4 and 5 as fixed global writes."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_EXECUTABLE = PROJECT_ROOT / ".disc-work/exact/1ST_READ.BIN"
DEFAULT_EVENT_IR = PROJECT_ROOT / ".disc-work/dialogue/native-event-ir.json"
DEFAULT_OUTPUT = (
    PROJECT_ROOT / "tools/evidence/fixed-global-dword-operation-evidence.json"
)
RUNTIME_BASE = 0x0C010000
EXECUTABLE_SHA256 = (
    "ca98879a97df87b668836bbfa597d38c6f9efc3fd45160208b8d5d866325f32c"
)
RANGES = {
    "handler": (
        0x0C157126,
        92,
        "b044e63f85ad86f03f1249ca0dba6779cc3c9cf3faba3716e10d5abc31f43224",
    ),
    "selector4Writer": (
        0x0C173E72,
        6,
        "1e9864d06d7be332367a6e55460b8f98956af1ec850d750478d7bdf0418489d4",
    ),
    "selector5Writer": (
        0x0C173E78,
        6,
        "f6ede6985459e3d760852ff1c36763391244a60619aeaa3e7215244e6d366f47",
    ),
}
SELECTORS = {
    4: 0x0C22478C,
    5: 0x0C22483C,
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


def operation_calls(event_ir: dict[str, Any]) -> list[dict[str, Any]]:
    calls = []
    for item in event_ir["maps"]:
        for function in item["functions"]:
            for block in function["blocks"]:
                for action in block["actions"]:
                    if (
                        action.get("kind") != "engineOperation"
                        or action.get("operationId") != 0x0116
                    ):
                        continue
                    calls.append({
                        "disc": item["disc"],
                        "area": item["area"],
                        "dialogueRegion": (
                            function.get("dialogueRegion") is not None
                        ),
                        "arguments": action.get("arguments", []),
                    })
    return calls


def selector(call: dict[str, Any]) -> int | None:
    arguments = call["arguments"]
    if not arguments or arguments[0].get("kind") != "constant":
        return None
    return arguments[0].get("value")


def verify_native_contract(executable: bytes) -> dict[str, str]:
    if sha256(executable) != EXECUTABLE_SHA256:
        raise ValueError("unexpected 1ST_READ.BIN")
    for name, (address, length, digest) in RANGES.items():
        if sha256(runtime_slice(executable, address, length)) != digest:
            raise ValueError(f"operation-0x0116 {name} changed")
    literals = {
        "resultWriter": u32(executable, 0x0C1572C4),
        "selector0Handler": u32(executable, 0x0C1572F0),
        "selector4Writer": u32(executable, 0x0C1572F4),
        "selector5Writer": u32(executable, 0x0C1572F8),
        "otherSelectorHandler": u32(executable, 0x0C1572FC),
        "selector4Address": u32(executable, 0x0C173EF0),
        "selector5Address": u32(executable, 0x0C173F24),
    }
    if literals != {
        "resultWriter": 0x0C0BB342,
        "selector0Handler": 0x0C173DF4,
        "selector4Writer": 0x0C173E72,
        "selector5Writer": 0x0C173E78,
        "otherSelectorHandler": 0x0C173F44,
        "selector4Address": SELECTORS[4],
        "selector5Address": SELECTORS[5],
    }:
        raise ValueError("operation-0x0116 dependencies changed")
    return {
        name: f"0x{value:08x}" for name, value in literals.items()
    }


def build_report(
    executable: bytes,
    event_ir: dict[str, Any],
) -> dict[str, Any]:
    native_contract = verify_native_contract(executable)
    calls = operation_calls(event_ir)
    selected = [
        call for call in calls
        if len(call["arguments"]) == 2 and selector(call) in SELECTORS
    ]
    if len(calls) != 558 or len(selected) != 67:
        raise ValueError("operation-0x0116 authored inventory changed")
    selector_counts = Counter(selector(call) for call in selected)
    dialogue_selector_counts = Counter(
        selector(call) for call in selected if call["dialogueRegion"]
    )
    value_kind_counts = Counter(
        (selector(call), call["arguments"][1]["kind"])
        for call in selected
    )
    if selector_counts != {4: 48, 5: 19}:
        raise ValueError("operation-0x0116 selector inventory changed")
    if dialogue_selector_counts != {4: 16, 5: 7}:
        raise ValueError("operation-0x0116 dialogue inventory changed")
    if value_kind_counts != {
        (4, "constant"): 41,
        (4, "runtime"): 7,
        (5, "constant"): 19,
    }:
        raise ValueError("operation-0x0116 value kinds changed")
    return {
        "schema": "new-yokosuka-fixed-global-dword-operation-evidence-v1",
        "status": "exact-native-selector-contract-and-all-disc-inventory",
        "source": {
            "executable": "1ST_READ.BIN",
            "executableRuntimeBase": "0x0c010000",
            "executableSha256": EXECUTABLE_SHA256,
            "eventIr": ".disc-work/dialogue/native-event-ir.json",
        },
        "operation": {
            "operationId": 0x0116,
            "operationHex": "0x0116",
            "handlerAddress": "0x0c157126",
            "handlerLength": RANGES["handler"][1],
            "handlerSha256": RANGES["handler"][2],
            "nativeContract": native_contract,
            "selectors": [
                {
                    "selector": selected_selector,
                    "address": f"0x{address:08x}",
                    "width": 4,
                    "result": -1,
                }
                for selected_selector, address in SELECTORS.items()
            ],
            "provenBehavior": (
                "Selector four writes argument one unchanged to global dword "
                "0x0c22478c. Selector five writes it unchanged to global "
                "dword 0x0c22483c. Both return native result -1."
            ),
        },
        "allDiscInventory": {
            "authoredCallCount": len(calls),
            "provenCallCount": len(selected),
            "remainingUnresolvedCallCount": len(calls) - len(selected),
            "dialogueRegionCallCount": sum(
                call["dialogueRegion"] for call in selected
            ),
            "areaCount": len({
                (call["disc"], call["area"]) for call in selected
            }),
            "selectorCounts": {
                str(value): count
                for value, count in sorted(selector_counts.items())
            },
            "dialogueRegionSelectorCounts": {
                str(value): count
                for value, count in sorted(dialogue_selector_counts.items())
            },
            "valueArgumentKindCounts": {
                f"{selected_selector}:{kind}": count
                for (selected_selector, kind), count
                in sorted(value_kind_counts.items())
            },
        },
        "evidenceBoundary": [
            "The owning subsystem and high-level meanings of both global dwords remain unnamed.",
            "Argument one is retained as an uninterpreted 32-bit value.",
            "Selectors -1 through 3 enter separate initialization or query paths and remain unresolved.",
            "The seven selector-four runtime operands remain runtime-bound rather than guessed.",
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
    args.out.write_text(json.dumps(report, indent=2) + "\n")
    print(
        f"Wrote {args.out}: "
        f"{report['allDiscInventory']['provenCallCount']} proven calls"
    )


if __name__ == "__main__":
    main()
